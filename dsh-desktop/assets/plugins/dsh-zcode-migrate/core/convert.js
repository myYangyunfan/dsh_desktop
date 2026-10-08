// zcode session → dsh session event log.
//
// ## The two models
//
// zcode stores a *materialized* transcript: a flat list of messages, each
// carrying its own content parts. An assistant message owns the tool calls it
// requested, and each tool part's `state.output` already holds the result.
//
// dsh stores an *append-only event log* whose message history is derived by
// replaying it. Tool results are separate user-role surface events, and turns
// and steps are explicit boundary markers.
//
// ## The mapping
//
//   zcode user message          → turn/start + user/message
//   zcode assistant message     → step/start + assistant/message
//   … its tool parts            → tool/call + tool/result (per call)
//   … its finish reason         → step/end, then turn/end when the turn closes
//   zcode session.title         → session/title
//
// A zcode "turn" is one user message plus every assistant message up to the
// next user message. Each assistant message is one dsh "step" — one model call
// and the tool executions it requested — which is exactly how zcode models it
// too (each assistant message carries its own `step-start`/`step-finish`
// parts). Turns close when an assistant message reports a non-`tool-calls`
// finish, or when the next user message arrives.

import { createHash } from 'node:crypto'
import { ConvertError } from './errors.js'

/**
 * Conservative map from zcode tool names onto the tools the installed dsh
 * actually exposes. Only high-confidence pairs are listed; anything unknown
 * keeps its original name so no information is invented.
 */
export const DEFAULT_TOOL_NAME_MAP = Object.freeze({
  Bash: 'pwsh',
  Read: 'read',
  Edit: 'edit',
  Write: 'write',
  Glob: 'glob',
  Grep: 'grep',
  Agent: 'subagent',
  TodoWrite: 'todo_write',
  SendMessage: 'send_message',
  TaskStop: 'interrupt_agent',
  WebSearch: 'web_search',
  'mcp__node_repl__js': 'run_code',
})

/** dsh's on-disk session format version (`SESSION_FORMAT_VERSION`). */
export const SESSION_FORMAT_VERSION = 0

const MAX_TITLE_CHARS = 200

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function shortHash(input) {
  return createHash('md5').update(String(input)).digest('hex').slice(0, 12)
}

/**
 * Map zcode's token accounting onto dsh's `TokenUsage`.
 *
 * zcode reports `{ total, input, output, reasoning, cache: { read, write } }`;
 * dsh uses camelCase and omits zero-valued cache/reasoning fields. `undefined`
 * means "the adapter reported none", which is different from zero.
 *
 * @param {object|undefined} tokens
 * @returns {object|undefined}
 */
export function usageFromTokens(tokens) {
  if (!tokens || typeof tokens !== 'object') return undefined
  const input = num(tokens.input)
  const output = num(tokens.output)
  const total = num(tokens.total)
  const reasoning = num(tokens.reasoning)
  const cacheRead = num(tokens.cache && tokens.cache.read)
  const cacheWrite = num(tokens.cache && tokens.cache.write)
  if (!input && !output && !total && !reasoning && !cacheRead && !cacheWrite) return undefined
  const usage = { inputTokens: input, outputTokens: output }
  if (total) usage.totalTokens = total
  if (cacheRead) usage.cacheReadTokens = cacheRead
  if (cacheWrite) usage.cacheWriteTokens = cacheWrite
  if (reasoning) usage.reasoningTokens = reasoning
  return usage
}

/** Map a zcode tool name onto the dsh tool vocabulary. */
function mapToolName(name, toolNameMap) {
  if (!name) return 'unknown'
  if (!toolNameMap) return name
  return toolNameMap[name] || name
}

/** Render a tool part's result as model-facing text. */
function toolOutputText(state, status, limit) {
  const output = state && state.output
  let text
  if (typeof output === 'string' && output) text = output
  else if (output && typeof output === 'object') text = JSON.stringify(output)
  else if (status && status !== 'completed') {
    const error = (state && (state.error || state.message)) || ''
    text = error ? String(error) : `[${status}]`
  } else text = '[no output]'

  if (limit > 0 && text.length > limit) {
    text = `${text.slice(0, limit)}\n…[已截断，原始长度 ${text.length} 字符]`
  }
  return text
}

/** Content blocks contributed by a user message's parts. */
function userContentBlocks(parts) {
  const blocks = []
  for (const part of parts) {
    const data = part.data
    if (!data) continue
    if (data.type === 'text' && data.text) {
      blocks.push({ type: 'text', text: data.text })
    } else if (data.type === 'file') {
      const label = data.filename || data.name || data.path || ''
      const href = data.url || data.path || ''
      blocks.push({ type: 'text', text: `[附件] ${label}${href ? ` (${href})` : ''}`.trim() })
    }
  }
  return blocks
}

/**
 * Content blocks and tool invocations contributed by an assistant message.
 * @returns {{ blocks: object[], toolParts: object[] }}
 */
function assistantContentBlocks(parts, options) {
  const blocks = []
  const toolParts = []
  for (const part of parts) {
    const data = part.data
    if (!data) continue
    if (data.type === 'text' && data.text) {
      blocks.push({ type: 'text', text: data.text })
    } else if (data.type === 'reasoning' && options.includeReasoning && data.text) {
      blocks.push({ type: 'reasoning', text: data.text })
    } else if (data.type === 'tool') {
      const state = data.state || {}
      const callId = data.callID || `zc-${shortHash(JSON.stringify(data))}`
      let args = '{}'
      try {
        args = JSON.stringify(state.input ?? {})
      } catch {
        args = '{}'
      }
      blocks.push({
        type: 'tool-call',
        id: callId,
        name: mapToolName(data.tool, options.toolNameMap),
        arguments: args,
      })
      toolParts.push({
        callId,
        name: mapToolName(data.tool, options.toolNameMap),
        arguments: args,
        state,
        status: state.status || 'completed',
        time: part.timeCreated,
      })
    }
  }
  return { blocks, toolParts }
}

/** Translate a zcode `finish` reason into a dsh `TurnEndReason`. */
export function turnEndReason(finish) {
  switch (finish) {
    case 'length':
      return { kind: 'max-tokens' }
    case 'interrupted':
      return { kind: 'aborted', reason: { kind: 'legacy' } }
    case 'error':
      return { kind: 'error', error: { message: 'zcode turn failed', code: 'UNKNOWN' } }
    default:
      return { kind: 'completed' }
  }
}

/** Whether a zcode `finish` value means the turn continues (more steps follow). */
function continuesTurn(finish) {
  return finish === 'tool-calls'
}

/**
 * Convert one zcode session into a dsh header plus ordered event records.
 *
 * @param {object} session - zcode `session` row.
 * @param {object[]} messages - output of `readMessages`.
 * @param {object} [options]
 * @param {Record<string,string>|false} [options.toolNameMap] - name mapping; `false` disables it.
 * @param {boolean} [options.includeReasoning] - keep reasoning blocks (default true).
 * @param {string} [options.agentPreset] - dsh agent preset id (default `standard`).
 * @param {number} [options.maxToolOutputChars] - truncate long tool output (0 = unlimited).
 * @param {string} [options.dshSessionId] - override the derived dsh session id.
 * @param {string|null} [options.parentSessionId] - dsh id of the parent session, if migrated.
 * @param {boolean} [options.emitTitle] - emit a `session/title` event (default true).
 * @returns {{ header: object, events: object[], stats: object }}
 */
export function convertSession(session, messages, options = {}) {
  if (!session || typeof session !== 'object' || !session.id) {
    throw new ConvertError('convertSession 需要一个带 id 的 zcode session 行')
  }
  const opts = {
    toolNameMap: options.toolNameMap === undefined ? DEFAULT_TOOL_NAME_MAP : options.toolNameMap,
    includeReasoning: options.includeReasoning !== false,
    agentPreset: options.agentPreset || 'standard',
    maxToolOutputChars: num(options.maxToolOutputChars),
    emitTitle: options.emitTitle !== false,
  }
  const dshSessionId = options.dshSessionId || `zcode-${String(session.id).replace(/^sess_/, '')}`
  const createdAt = num(session.time_created) || Date.now()

  const header = {
    type: 'session',
    version: SESSION_FORMAT_VERSION,
    id: dshSessionId,
    createdAt,
    ...(session.directory ? { cwd: session.directory } : {}),
    ...(options.parentSessionId ? { parentSession: options.parentSessionId, origin: 'subagent' } : {}),
    delegationDepth: options.parentSessionId ? 1 : 0,
    agentPreset: opts.agentPreset,
  }

  const events = []
  let seq = 0
  const emit = (type, time, data, surfaceOp) => {
    const event = { type, seq, time: num(time) || createdAt, data }
    if (surfaceOp) event.surfaceOp = surfaceOp
    seq += 1
    events.push(event)
    return event.seq
  }

  const stats = {
    messages: 0,
    toolResults: 0,
    turns: 0,
    steps: 0,
    skippedMessages: 0,
  }

  let turn = 0
  let step = 0
  let turnOpen = false
  let stepOpen = false
  let lastFinish = null
  /** Time of the most recent message seen, so boundary events stay deterministic. */
  let lastTime = createdAt
  /** Seq of the first user/message whose source is a human prompt. */
  let firstHumanUserSeq = null
  /** Whether any message-producing event was emitted at all. */
  let emittedMessage = false

  const closeTurn = (reason) => {
    if (!turnOpen) return
    // A turn may still own an open step when the session ends mid-flight; dsh
    // never leaves a step unclosed, so close it before the turn boundary.
    if (stepOpen) {
      emit('step/end', lastTime, { turn, step })
      stepOpen = false
    }
    emit('turn/end', lastTime, { turn, reason: reason || turnEndReason(lastFinish) })
    turnOpen = false
  }

  for (const message of messages) {
    const data = message.data || {}
    const role = data.role
    if (num(message.timeCreated)) lastTime = message.timeCreated

    if (role === 'user') {
      closeTurn()
      turn += 1
      step = 1
      stats.turns += 1
      stats.steps += 1
      emit('turn/start', message.timeCreated, { turn })
      // dsh opens the step before the messages that enter it: the user prompt
      // (and any injected context) is the *input* of the turn's first step, so
      // step/start precedes user/message. A reader that meets a surface message
      // before any step cannot place it.
      emit('step/start', message.timeCreated, { turn, step })
      turnOpen = true
      stepOpen = true

      const blocks = userContentBlocks(message.parts || [])
      if (!blocks.length) {
        stats.skippedMessages += 1
        continue
      }
      const synthetic = data.synthetic === true || (data.source && data.source.kind && data.source.kind !== 'user')
      const source = synthetic ? { kind: 'plugin:zcode' } : { kind: 'user' }
      const messageSeq = emit(
        'user/message',
        message.timeCreated,
        {
          id: message.id,
          role: 'user',
          content: blocks,
          source,
        },
        'append',
      )
      if (!synthetic && firstHumanUserSeq === null) firstHumanUserSeq = messageSeq
      emittedMessage = true
      stats.messages += 1
      continue
    }

    if (role !== 'assistant') {
      stats.skippedMessages += 1
      continue
    }

    // Resolve the message's content before touching turn/step state: zcode
    // records timeline-only assistant rows (model switches, compaction
    // bookkeeping) that carry nothing the model ever saw. Opening a turn or a
    // step for them would fabricate empty boundaries dsh would then replay.
    const { blocks, toolParts } = assistantContentBlocks(message.parts || [], opts)
    const usage = usageFromTokens(data.tokens)
    if (!blocks.length && !toolParts.length && !usage) {
      stats.skippedMessages += 1
      continue
    }

    if (!turnOpen) {
      turn += 1
      // Leave `step` at 0: the block below opens the turn's first step, and
      // numbering it here as well would make the first step 2.
      step = 0
      stats.turns += 1
      emit('turn/start', message.timeCreated, { turn })
      turnOpen = true
    }
    if (!stepOpen) {
      // The previous step closed; this assistant message is a new model call.
      step += 1
      stats.steps += 1
      emit('step/start', message.timeCreated, { turn, step })
      stepOpen = true
    }

    if (blocks.length || usage) {
      emit(
        'assistant/message',
        message.timeCreated,
        {
          turn,
          step,
          message: {
            id: message.id,
            role: 'assistant',
            content: blocks,
            source: {
              kind: 'model',
              provider: data.providerID || 'zcode',
              model: data.modelID || 'unknown',
            },
          },
          ...(usage ? { usage } : {}),
        },
        'append',
      )
      emittedMessage = true
      stats.messages += 1
    }

    for (const tool of toolParts) {
      emit('tool/call', tool.time, {
        turn,
        step,
        callId: tool.callId,
        name: tool.name,
        arguments: tool.arguments,
      })
      const isError = tool.status !== 'completed'
      emit(
        'tool/result',
        tool.time,
        {
          turn,
          step,
          message: {
            id: `tool-${tool.callId}`,
            role: 'user',
            content: [
              {
                type: 'tool-result',
                toolCallId: tool.callId,
                content: [
                  {
                    type: 'text',
                    text: toolOutputText(tool.state, tool.status, opts.maxToolOutputChars),
                  },
                ],
                isError,
              },
            ],
            source: { kind: 'tool', callId: tool.callId },
          },
        },
        'append',
      )
      stats.toolResults += 1
    }

    emit('step/end', message.timeCreated, { turn, step })
    stepOpen = false
    lastFinish = data.finish ?? lastFinish
    if (data.finish && !continuesTurn(data.finish)) closeTurn()
  }

  // A trailing turn that never saw a closing finish (session ended mid-flight).
  if (turnOpen) closeTurn(lastFinish && lastFinish !== 'tool-calls' ? turnEndReason(lastFinish) : { kind: 'completed' })

  // dsh's title invariant: a non-`user` source must cite at least one earlier
  // human user/message seq, and `user` must cite none. Fall back to the `user`
  // form when the session has no human prompt to point at.
  //
  // A session that produced no message at all gets no title event: a log whose
  // only content is a title is not a conversation, and the caller uses the
  // empty event list to skip the session entirely.
  const title = typeof session.title === 'string' ? session.title.replace(/[\r\n]+/g, ' ').trim() : ''
  if (opts.emitTitle && title && emittedMessage) {
    const clipped = title.slice(0, MAX_TITLE_CHARS)
    if (firstHumanUserSeq !== null) {
      emit('session/title', createdAt, {
        title: clipped,
        messageSeqs: [firstHumanUserSeq],
        source: { kind: 'fallback' },
      })
    } else {
      emit('session/title', createdAt, { title: clipped, messageSeqs: [], source: { kind: 'user' } })
    }
  }

  stats.events = events.length
  return { header, events, stats }
}

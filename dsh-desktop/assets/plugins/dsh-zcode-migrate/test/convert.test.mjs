// Conversion tests: the zcode message/part model → dsh event log mapping.
//
// These are the semantic contract. A regression here produces a log that dsh
// accepts structurally but replays wrongly, so each test asserts on the event
// stream itself rather than on a round-tripped summary.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { convertSession, turnEndReason, usageFromTokens } from '../core/convert.js'

const T = 1_700_000_000_000

function userMessage(id, text, extra = {}) {
  return {
    id,
    data: { role: 'user', time: { created: T }, ...extra },
    timeCreated: T,
    parts: [{ data: { type: 'text', text }, timeCreated: T }],
  }
}

function assistantMessage(id, parts, extra = {}) {
  return {
    id,
    data: { role: 'assistant', time: { created: T + 1 }, modelID: 'deepseek-flash', providerID: 'prov', finish: 'tool-calls', ...extra },
    timeCreated: T + 1,
    parts,
  }
}

const textPart = (text) => ({ data: { type: 'text', text }, timeCreated: T + 1 })
const reasoningPart = (text) => ({ data: { type: 'reasoning', text }, timeCreated: T + 1 })
const toolPart = (callID, tool, input, output, status = 'completed') => ({
  data: { type: 'tool', callID, tool, state: { status, input, output } },
  timeCreated: T + 1,
})

const sessionRow = (extra = {}) => ({
  id: 'sess_abc-123',
  directory: 'C:\\proj',
  title: 'A test session',
  time_created: T,
  ...extra,
})

const types = (events) => events.map((event) => event.type)

test('a user turn and its assistant steps map onto turn/step boundaries', () => {
  const messages = [
    userMessage('u1', 'hello'),
    // Step 1: assistant asks for a tool.
    assistantMessage('a1', [textPart('working'), toolPart('call_1', 'Bash', { command: 'ls' }, 'ok')]),
    // Step 2: assistant finishes the turn.
    assistantMessage('a2', [textPart('done')], { finish: 'stop' }),
  ]
  const { header, events, stats } = convertSession(sessionRow(), messages)

  assert.deepEqual(types(events), [
    'turn/start',
    // dsh opens the step before the messages that enter it.
    'step/start',
    'user/message',
    'assistant/message',
    'tool/call',
    'tool/result',
    'step/end',
    'step/start',
    'assistant/message',
    'step/end',
    'turn/end',
    'session/title',
  ])

  assert.equal(header.type, 'session')
  assert.equal(header.version, 0)
  assert.equal(header.id, 'zcode-abc-123')
  assert.equal(header.cwd, 'C:\\proj')
  assert.equal(header.delegationDepth, 0)

  // Turn numbering is 1-based and step numbering restarts per turn.
  const turnStarts = events.filter((event) => event.type === 'turn/start')
  assert.deepEqual(turnStarts.map((event) => event.data.turn), [1])
  const stepStarts = events.filter((event) => event.type === 'step/start')
  assert.deepEqual(stepStarts.map((event) => [event.data.turn, event.data.step]), [[1, 1], [1, 2]])

  // The turn closes only on the non-`tool-calls` finish.
  const turnEnd = events.find((event) => event.type === 'turn/end')
  assert.deepEqual(turnEnd.data, { turn: 1, reason: { kind: 'completed' } })

  assert.equal(stats.turns, 1)
  assert.equal(stats.steps, 2)
  assert.equal(stats.toolResults, 1)
})

test('a new user message opens a new turn and closes the previous one', () => {
  const messages = [
    userMessage('u1', 'first'),
    assistantMessage('a1', [textPart('r1')], { finish: 'stop' }),
    userMessage('u2', 'second'),
    assistantMessage('a2', [textPart('r2')], { finish: 'stop' }),
  ]
  const { events } = convertSession(sessionRow(), messages)
  const turnStarts = events.filter((event) => event.type === 'turn/start').map((event) => event.data.turn)
  const turnEnds = events.filter((event) => event.type === 'turn/end').map((event) => event.data.turn)
  assert.deepEqual(turnStarts, [1, 2])
  assert.deepEqual(turnEnds, [1, 2])
  // turn/start precedes its step, whose user/message precedes the assistant reply.
  assert.deepEqual(types(events).slice(0, 4), ['turn/start', 'step/start', 'user/message', 'assistant/message'])
})

test('seq is contiguous from 0 and events never carry a duplicate seq', () => {
  const messages = [
    userMessage('u1', 'hi'),
    assistantMessage('a1', [reasoningPart('think'), textPart('say'), toolPart('c1', 'Read', { file_path: 'x' }, 'body')]),
    assistantMessage('a2', [textPart('bye')], { finish: 'stop' }),
  ]
  const { events } = convertSession(sessionRow(), messages)
  events.forEach((event, index) => assert.equal(event.seq, index))
})

test('surfaceOp is present exactly on message-producing events', () => {
  const messages = [userMessage('u1', 'hi'), assistantMessage('a1', [toolPart('c1', 'Read', {}, 'x')], { finish: 'stop' })]
  const { events } = convertSession(sessionRow(), messages)
  const surface = new Set(['user/message', 'assistant/message', 'tool/result'])
  for (const event of events) {
    if (surface.has(event.type)) assert.equal(event.surfaceOp, 'append', event.type)
    else assert.equal('surfaceOp' in event, false, event.type)
  }
})

test('reasoning, text and tool blocks keep their dsh block types', () => {
  const messages = [
    userMessage('u1', 'hi'),
    assistantMessage('a1', [reasoningPart('why'), textPart('how'), toolPart('c1', 'Bash', { command: 'ls' }, 'out')], {
      finish: 'stop',
    }),
  ]
  const { events } = convertSession(sessionRow(), messages)
  const assistant = events.find((event) => event.type === 'assistant/message')
  assert.deepEqual(
    assistant.data.message.content.map((block) => block.type),
    ['reasoning', 'text', 'tool-call'],
  )
  const call = assistant.data.message.content[2]
  assert.equal(call.id, 'c1')
  assert.equal(call.name, 'pwsh') // Bash is mapped onto dsh's shell tool
  assert.equal(call.arguments, JSON.stringify({ command: 'ls' }))
  assert.equal(assistant.data.message.source.kind, 'model')
  assert.equal(assistant.data.message.source.model, 'deepseek-flash')
})

test('reasoning blocks are dropped when includeReasoning is false', () => {
  const messages = [userMessage('u1', 'hi'), assistantMessage('a1', [reasoningPart('why'), textPart('how')], { finish: 'stop' })]
  const { events } = convertSession(sessionRow(), messages, { includeReasoning: false })
  const assistant = events.find((event) => event.type === 'assistant/message')
  assert.deepEqual(assistant.data.message.content.map((b) => b.type), ['text'])
})

test('tool/call and tool/result pair up by callId and mark failures', () => {
  const messages = [
    userMessage('u1', 'hi'),
    assistantMessage(
      'a1',
      [toolPart('c_ok', 'Read', { file_path: 'a' }, 'contents'), toolPart('c_bad', 'Read', { file_path: 'b' }, undefined, 'error')],
      { finish: 'stop' },
    ),
  ]
  const { events } = convertSession(sessionRow(), messages)
  const calls = events.filter((event) => event.type === 'tool/call')
  const results = events.filter((event) => event.type === 'tool/result')
  assert.deepEqual(calls.map((event) => event.data.callId), ['c_ok', 'c_bad'])
  assert.deepEqual(results.map((event) => event.data.message.content[0].toolCallId), ['c_ok', 'c_bad'])
  assert.equal(results[0].data.message.content[0].isError, false)
  assert.equal(results[1].data.message.content[0].isError, true)
  assert.equal(results[0].data.message.source.kind, 'tool')
  assert.equal(results[0].data.message.source.callId, 'c_ok')
  assert.equal(results[0].data.message.role, 'user')
})

test('tool output is serialized and truncatable', () => {
  const messages = [
    userMessage('u1', 'hi'),
    assistantMessage('a1', [toolPart('c1', 'Read', {}, { nested: true })], { finish: 'stop' }),
    assistantMessage('a2', [toolPart('c2', 'Read', {}, 'x'.repeat(500))], { finish: 'stop' }),
  ]
  const plain = convertSession(sessionRow(), messages)
  const first = plain.events.find((event) => event.type === 'tool/result')
  assert.equal(first.data.message.content[0].content[0].text, JSON.stringify({ nested: true }))

  const limited = convertSession(sessionRow(), messages, { maxToolOutputChars: 10 })
  const long = limited.events.filter((event) => event.type === 'tool/result')[1]
  assert.ok(long.data.message.content[0].content[0].text.includes('已截断'))
})

test('token accounting maps onto dsh TokenUsage and is omitted when absent', () => {
  assert.equal(usageFromTokens(undefined), undefined)
  assert.equal(usageFromTokens({ input: 0, output: 0 }), undefined)
  assert.deepEqual(usageFromTokens({ total: 30, input: 20, output: 10, reasoning: 4, cache: { read: 5, write: 6 } }), {
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30,
    cacheReadTokens: 5,
    cacheWriteTokens: 6,
    reasoningTokens: 4,
  })

  const messages = [userMessage('u1', 'hi'), assistantMessage('a1', [textPart('x')], { finish: 'stop', tokens: { total: 3, input: 2, output: 1 } })]
  const { events } = convertSession(sessionRow(), messages)
  const assistant = events.find((event) => event.type === 'assistant/message')
  assert.deepEqual(assistant.data.usage, { inputTokens: 2, outputTokens: 1, totalTokens: 3 })

  const bare = convertSession(sessionRow(), [userMessage('u1', 'hi'), assistantMessage('a1', [textPart('x')], { finish: 'stop' })])
  assert.equal('usage' in bare.events.find((event) => event.type === 'assistant/message').data, false)
})

test('content-free assistant rows do not fabricate turns or steps', () => {
  // zcode records model switches and compaction bookkeeping as assistant rows
  // with only timeline parts; they carry nothing the model ever saw.
  const timelineOnly = { id: 'a0', data: { role: 'assistant', time: { created: T } }, timeCreated: T, parts: [{ data: { type: 'timeline', timelineType: 'model_change' } }] }
  const messages = [timelineOnly, userMessage('u1', 'hi'), assistantMessage('a1', [textPart('ok')], { finish: 'stop' })]
  const { events, stats } = convertSession(sessionRow(), messages)
  assert.deepEqual(types(events), ['turn/start', 'step/start', 'user/message', 'assistant/message', 'step/end', 'turn/end', 'session/title'])
  assert.equal(stats.turns, 1)
  assert.equal(stats.skippedMessages, 1)
  // The first user message is turn 1, not turn 2.
  assert.equal(events.find((event) => event.type === 'turn/start').data.turn, 1)
})

test('a session that starts with an assistant message numbers its first step 1', () => {
  // dsh requires a step to be numbered from 1 within its turn. Opening the turn
  // from an assistant message must not skip step 1.
  const messages = [
    assistantMessage('a1', [textPart('unsolicited')], { finish: 'tool-calls' }),
    assistantMessage('a2', [textPart('more')], { finish: 'stop' }),
  ]
  const { events } = convertSession(sessionRow(), messages)
  const stepStarts = events.filter((event) => event.type === 'step/start')
  assert.deepEqual(stepStarts.map((event) => [event.data.turn, event.data.step]), [[1, 1], [1, 2]])
})

test('a user message with no usable content is skipped without closing its turn', () => {
  const emptyUser = { id: 'u0', data: { role: 'user', time: { created: T } }, timeCreated: T, parts: [{ data: { type: 'step-start' } }] }
  const messages = [emptyUser, assistantMessage('a1', [textPart('ok')], { finish: 'stop' })]
  const { events, stats } = convertSession(sessionRow(), messages)
  assert.deepEqual(types(events), ['turn/start', 'step/start', 'assistant/message', 'step/end', 'turn/end', 'session/title'])
  assert.equal(stats.skippedMessages, 1)
  // No human user/message exists, so the title must use the empty `user` form.
  const title = events.find((event) => event.type === 'session/title')
  assert.deepEqual(title.data.source, { kind: 'user' })
  assert.deepEqual(title.data.messageSeqs, [])
})

test('a session with no messages at all produces no events', () => {
  const { events, stats } = convertSession(sessionRow(), [])
  assert.deepEqual(events, [])
  assert.equal(stats.messages, 0)
})

test('a title-only log is suppressed so empty sessions stay skippable', () => {
  // Without this guard a title event alone would make an empty session look
  // migratable, and the caller would publish a conversation with no content.
  const timelineOnly = { id: 'a0', data: { role: 'assistant', time: { created: T } }, timeCreated: T, parts: [{ data: { type: 'timeline' } }] }
  const { events } = convertSession(sessionRow(), [timelineOnly])
  assert.deepEqual(events, [])
})

test('synthetic user messages are attributed to the plugin, not the human', () => {
  const messages = [
    userMessage('u1', 'real question'),
    assistantMessage('a1', [textPart('answer')], { finish: 'stop' }),
    userMessage('u2', 'injected context', { synthetic: true }),
    assistantMessage('a2', [textPart('ok')], { finish: 'stop' }),
  ]
  const { events } = convertSession(sessionRow(), messages)
  const userEvents = events.filter((event) => event.type === 'user/message')
  assert.deepEqual(userEvents[0].data.source, { kind: 'user' })
  assert.equal(userEvents[1].data.source.kind, 'plugin:zcode')
  // The title cites the human prompt, never the injected one.
  const title = events.find((event) => event.type === 'session/title')
  assert.deepEqual(title.data.messageSeqs, [userEvents[0].seq])
})

test('session/title keeps dsh\'s source invariant', () => {
  const withHuman = convertSession(sessionRow(), [userMessage('u1', 'hi'), assistantMessage('a1', [textPart('x')], { finish: 'stop' })])
  const fallback = withHuman.events.find((event) => event.type === 'session/title')
  assert.equal(fallback.data.source.kind, 'fallback')
  assert.equal(fallback.data.messageSeqs.length, 1)
  // The cited seq must name an earlier human user/message.
  const cited = withHuman.events.find((event) => event.seq === fallback.data.messageSeqs[0])
  assert.equal(cited.type, 'user/message')
  assert.equal(cited.data.source.kind, 'user')
  assert.ok(cited.seq < fallback.seq)

  // With no human prompt there is nothing to cite, so the empty `user` form is used.
  const noHuman = convertSession(sessionRow(), [assistantMessage('a1', [textPart('x')], { finish: 'stop' })])
  const title = noHuman.events.find((event) => event.type === 'session/title')
  assert.deepEqual(title.data, { title: 'A test session', messageSeqs: [], source: { kind: 'user' } })
})

test('a session without a title emits no session/title event', () => {
  const { events } = convertSession(sessionRow({ title: '' }), [userMessage('u1', 'hi'), assistantMessage('a1', [textPart('x')], { finish: 'stop' })])
  assert.equal(events.some((event) => event.type === 'session/title'), false)
})

test('a subagent session records its lineage in the header', () => {
  const { header } = convertSession(sessionRow({ id: 'sess_subagent_agent_1', parent_id: 'sess_parent' }), [userMessage('u1', 'hi'), assistantMessage('a1', [textPart('x')], { finish: 'stop' })], {
    parentSessionId: 'zcode-parent',
  })
  assert.equal(header.parentSession, 'zcode-parent')
  assert.equal(header.origin, 'subagent')
  assert.equal(header.delegationDepth, 1)
})

test('an interrupted trailing turn closes as aborted', () => {
  const messages = [userMessage('u1', 'hi'), assistantMessage('a1', [toolPart('c1', 'Read', {}, 'x')], { finish: 'tool-calls' })]
  const { events } = convertSession(sessionRow(), messages)
  const turnEnd = events.find((event) => event.type === 'turn/end')
  assert.deepEqual(turnEnd.data.reason, { kind: 'completed' })
})

test('turnEndReason covers the zcode finish vocabulary', () => {
  assert.deepEqual(turnEndReason('stop'), { kind: 'completed' })
  assert.deepEqual(turnEndReason('length'), { kind: 'max-tokens' })
  assert.deepEqual(turnEndReason('interrupted'), { kind: 'aborted', reason: { kind: 'legacy' } })
  assert.deepEqual(turnEndReason(undefined), { kind: 'completed' })
  assert.deepEqual(turnEndReason('stream_recovery_discarded'), { kind: 'completed' })
})

test('convertSession rejects a session row without an id', () => {
  assert.throws(() => convertSession({}, []), /带 id 的 zcode session 行/)
})

test('toolNameMap can be disabled to preserve original tool names', () => {
  const messages = [userMessage('u1', 'hi'), assistantMessage('a1', [toolPart('c1', 'Bash', {}, 'x')], { finish: 'stop' })]
  const mapped = convertSession(sessionRow(), messages)
  assert.equal(mapped.events.find((event) => event.type === 'tool/call').data.name, 'pwsh')
  const raw = convertSession(sessionRow(), messages, { toolNameMap: false })
  assert.equal(raw.events.find((event) => event.type === 'tool/call').data.name, 'Bash')
})

test('unknown tool names pass through unchanged', () => {
  const messages = [userMessage('u1', 'hi'), assistantMessage('a1', [toolPart('c1', 'SomeVendorTool', {}, 'x')], { finish: 'stop' })]
  const { events } = convertSession(sessionRow(), messages)
  assert.equal(events.find((event) => event.type === 'tool/call').data.name, 'SomeVendorTool')
})

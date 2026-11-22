import { acpImageLimits } from './image-content.js';
import { normalizeVirtualHistoryTurnWindow, utf8JsonByteLength, VirtualHistoryResponseTooLargeError, } from '../virtual-history-pagination.js';
import { piToolResult } from './pi-tool-result.js';
import { acpBackendLabel } from './virtual-catalog.js';
import { AsyncValueQueue, extractSessionId, extractText, isRecord, isSurfaceEvent, optionalPositiveInteger, piPromptOutcome, piStreamOutcome, record, string, summarizeQuestions, } from './virtual-contract.js';
export class AcpLiveProjection {
    context;
    constructor(context) {
        this.context = context;
    }
    findFollow(sessionId) {
        for (const follow of this.context.follows) {
            if (follow.sessionId === sessionId)
                return follow;
        }
        return undefined;
    }
    createFollowState(session, queue, hasConsumer, stepOpen) {
        return {
            sessionId: session.sessionId,
            acpSessionId: session.acpSessionId,
            queue,
            hasConsumer,
            nextSeq: session.events.length === 0 ? 0 : Math.max(...session.events.map(entry => entry.event.seq)) + 1,
            turn: Math.max(0, ...session.events.map(entry => (isRecord(entry.event.data) && typeof entry.event.data.turn === 'number' ? entry.event.data.turn : 0))),
            stepOpen,
            streamActive: false,
            assistantStreamRevision: 0,
            accumulatedText: '',
            accumulatedReasoning: '',
            activeToolCalls: new Set(),
            piToolOutputs: new Map(),
            piToolCalls: new Map(),
        };
    }
    snapshotFrame(session, history, follow) {
        const step = this.context.backend === 'pi' ? follow.piStep ?? 1 : 1;
        const assistantStream = follow.assistantAttempt === undefined
            ? { revision: follow.assistantStreamRevision }
            : {
                revision: follow.assistantStreamRevision,
                activeAttempt: {
                    attemptId: follow.assistantAttempt.attemptId,
                    startedAfterSeq: follow.assistantAttempt.startedAfterSeq,
                    turn: follow.turn,
                    step,
                    nextIndex: follow.assistantAttempt.nextIndex,
                    stream: [...follow.assistantAttempt.stream],
                },
            };
        return {
            type: 'snapshot',
            header: history.header,
            cursor: history.cursor,
            records: history.records,
            hasMore: history.hasMore,
            projections: {
                asOfSeq: session.projectionSeq ?? -1,
                values: {
                    title: session.title ?? acpBackendLabel(this.context.backend),
                    sessionListMetadata: { blank: session.blank && session.events.length === 0, lastPromptAt: null },
                    modelSelection: this.context.modelSelectionProjection(session.sessionId),
                    permissions: this.context.permissionsProjection(session.sessionId),
                    imageLimits: acpImageLimits(this.context.backend),
                    ...(session.agentPreset !== undefined ? { agentPreset: session.agentPreset } : {}),
                    ...(session.todos !== undefined ? { todos: session.todos } : {}),
                    ...(session.contextUsage !== undefined ? { contextPressure: contextPressureProjection(session.contextUsage) } : {}),
                },
            },
            assistantStream,
        };
    }
    handleRemoteStreamClosed(session, follow, reason) {
        if (follow.closed)
            return;
        session.running = false;
        this.context.emitRemoteEvent('api-session/status', [session.sessionId, false]);
        this.closeFollowAfterRemoteStreamClosed(follow, piStreamOutcome(reason), true);
    }
    async sessionFollow(request, signal) {
        const requestedId = extractSessionId(request);
        const session = this.context.lookupSession(requestedId);
        if (session === undefined)
            throw new Error('The Session was not found.');
        const sessionId = session.sessionId;
        await this.context.hydrateSession(session);
        this.context.rememberOpenedSession?.(sessionId);
        const existing = this.findFollow(sessionId);
        const step = this.context.backend === 'pi' ? existing?.piStep ?? 1 : 1;
        const existingAssistantStream = existing?.assistantAttempt === undefined
            ? undefined
            : {
                revision: existing.assistantStreamRevision,
                activeAttempt: {
                    attemptId: existing.assistantAttempt.attemptId,
                    startedAfterSeq: existing.assistantAttempt.startedAfterSeq,
                    turn: existing.turn,
                    step,
                    nextIndex: existing.assistantAttempt.nextIndex,
                    stream: existing.assistantAttempt.stream,
                },
            };
        const projectionsOverhead = utf8JsonByteLength({
            type: 'snapshot',
            projections: {
                asOfSeq: session.projectionSeq ?? -1,
                values: {
                    title: session.title ?? acpBackendLabel(this.context.backend),
                    sessionListMetadata: { blank: session.blank && session.events.length === 0, lastPromptAt: null },
                    modelSelection: this.context.modelSelectionProjection(session.sessionId),
                    permissions: this.context.permissionsProjection(session.sessionId),
                    imageLimits: acpImageLimits(this.context.backend),
                    ...(session.agentPreset !== undefined ? { agentPreset: session.agentPreset } : {}),
                    ...(session.todos !== undefined ? { todos: session.todos } : {}),
                    ...(session.contextUsage !== undefined ? { contextPressure: contextPressureProjection(session.contextUsage) } : {}),
                },
            },
            ...(existingAssistantStream === undefined ? {} : { assistantStream: existingAssistantStream }),
        }) + 32;
        let history;
        try {
            history = this.context.historyPage(session, {
                limit: optionalPositiveInteger(request.maxMessages) ?? optionalPositiveInteger(request.limit),
                turnWindow: normalizeVirtualHistoryTurnWindow(request.turnWindow),
                extraEnvelopeBytes: projectionsOverhead,
            });
        }
        catch (error) {
            if (error instanceof VirtualHistoryResponseTooLargeError) {
                throw Object.assign(new Error(error.message), {
                    isDSHRemoteError: true,
                    code: 'response-too-large',
                    retryable: false,
                    details: { actualBytes: error.actualBytes, maxBytes: error.maxBytes },
                });
            }
            throw error;
        }
        const queue = new AsyncValueQueue(signal);
        if (existing !== undefined) {
            const priorQueue = existing.queue;
            existing.queue = queue;
            existing.hasConsumer = true;
            priorQueue.close();
            queue.push(this.snapshotFrame(session, history, existing));
            return queue.iterate(() => {
                if (existing.queue === queue) {
                    existing.closed = true;
                    this.context.follows.delete(existing);
                    void existing.close?.().catch(() => undefined);
                }
            });
        }
        const follow = this.createFollowState(session, queue, true, session.running);
        this.context.follows.add(follow);
        queue.push(this.snapshotFrame(session, history, follow));
        try {
            const stream = await this.context.client.openStream(session.acpSessionId, frame => this.acceptAcpFrame(follow, frame), closed => this.handleRemoteStreamClosed(session, follow, closed.reason), signal);
            if (follow.closed || !this.context.follows.has(follow)) {
                await stream.close().catch(() => undefined);
            }
            else {
                follow.close = () => stream.close();
            }
        }
        catch (error) {
            this.context.follows.delete(follow);
            follow.closed = true;
            follow.queue.close();
            throw error;
        }
        return queue.iterate(() => {
            if (follow.queue === queue) {
                follow.closed = true;
                this.context.follows.delete(follow);
                void follow.close?.().catch(() => undefined);
            }
        });
    }
    async ensureFollow(session) {
        if (this.findFollow(session.sessionId) !== undefined)
            return;
        // Native UI opens session/follow; prompts before follow still work via Host stream open on demand.
        const controller = new AbortController();
        const queue = new AsyncValueQueue(controller.signal);
        const follow = this.createFollowState(session, queue, false, false);
        this.context.follows.add(follow);
        try {
            const stream = await this.context.client.openStream(session.acpSessionId, frame => this.acceptAcpFrame(follow, frame), closed => this.handleRemoteStreamClosed(session, follow, closed.reason));
            if (follow.closed || !this.context.follows.has(follow)) {
                await stream.close().catch(() => undefined);
                return;
            }
            follow.close = async () => {
                controller.abort();
                await stream.close();
            };
        }
        catch (error) {
            this.context.follows.delete(follow);
            follow.closed = true;
            follow.queue.close();
            throw error;
        }
    }
    acceptAcpFrame(follow, frame) {
        const method = frame.frame.method;
        const params = record(frame.frame.params);
        if (method === 'session/update') {
            this.acceptSessionUpdate(follow, params);
            return;
        }
        if (follow.closed)
            return;
        if (method === 'session/request_permission' || method === 'cursor/ask_question' || method === 'cursor/create_plan') {
            this.acceptApproval(follow, params, method);
        }
    }
    acceptSessionUpdate(follow, params) {
        const update = isRecord(params.update) ? params.update : params;
        const kind = string(update.sessionUpdate) ?? string(update.type);
        const session = this.context.sessions.get(follow.sessionId);
        if (kind === 'session_info_update') {
            if (session && params.sessionId === follow.acpSessionId && typeof update.title === 'string') {
                this.context.applySessionTitle(session, update.title);
            }
            return;
        }
        if (kind === 'available_commands_update' && session !== undefined) {
            const commands = normalizeAvailableCommands(update.availableCommands ?? update.commands);
            if (commands !== undefined) {
                session.availableCommands = commands;
                session.updatedAt = Date.now();
            }
            return;
        }
        if (kind === 'current_mode_update' && session !== undefined) {
            const modeId = string(update.currentModeId) ?? string(update.modeId) ?? string(update.mode);
            if (modeId !== undefined && modeId.length > 0) {
                session.agentPreset = modeId;
                if (session.modes !== undefined) {
                    session.modes = { ...session.modes, currentModeId: modeId };
                }
                session.updatedAt = Date.now();
                this.context.publishProjection(follow.sessionId, 'agentPreset', modeId, this.context.nextProjectionSeq(follow.sessionId));
            }
            return;
        }
        if (kind === 'usage_update' && session !== undefined) {
            const usage = normalizeContextUsage(update);
            if (usage !== undefined) {
                session.contextUsage = usage;
                session.updatedAt = Date.now();
                this.context.publishProjection(follow.sessionId, 'contextPressure', contextPressureProjection(usage), this.context.nextProjectionSeq(follow.sessionId));
            }
            return;
        }
        if ((kind === 'cursor/update_todos' || kind === 'plan') && session !== undefined) {
            const todos = normalizeAcpTodos(update.todos ?? update.entries ?? update.items);
            if (todos !== undefined) {
                session.todos = todos;
                session.updatedAt = Date.now();
                this.context.publishProjection(follow.sessionId, 'todos', todos, this.context.nextProjectionSeq(follow.sessionId));
            }
            return;
        }
        if (follow.closed)
            return;
        if (kind === 'model_selection' && isRecord(update.selected)
            && update.selected.provider === this.context.backend && typeof update.selected.model === 'string') {
            this.context.selectedModels.set(follow.sessionId, update.selected);
            this.context.publishProjection(follow.sessionId, 'modelSelection', this.context.modelSelectionProjection(follow.sessionId), this.context.nextProjectionSeq(follow.sessionId));
            return;
        }
        if (kind === 'agent_message_chunk' || kind === 'agent_message') {
            const text = extractText(update);
            if (text === undefined || text.length === 0)
                return;
            this.appendAssistantDelta(follow, text);
            return;
        }
        if (kind === 'tool_call' || kind === 'tool_call_update') {
            const toolName = string(update.title) ?? string(update.toolName) ?? string(update.name) ?? 'tool';
            const status = string(update.status);
            const callId = string(update.toolCallId) ?? string(update.callId) ?? toolName;
            const terminal = status === 'completed' || status === 'failed';
            const termDelta = record(record(update._meta).terminal_output).data;
            if (this.context.backend === 'pi') {
                const call = follow.piToolCalls.get(callId) ?? { name: toolName };
                if (typeof update.title === 'string')
                    call.name = update.title;
                if (update.rawInput !== undefined)
                    call.input = update.rawInput;
                follow.piToolCalls.set(callId, call);
                const output = piToolResult(update);
                if (typeof termDelta === 'string') {
                    const buffered = follow.piToolOutputs.get(callId) ?? { text: '', overflow: false };
                    if (!buffered.overflow) {
                        if (buffered.text.length + termDelta.length > 1_048_576) {
                            buffered.text = '';
                            buffered.overflow = true;
                        }
                        else
                            buffered.text += termDelta;
                    }
                    follow.piToolOutputs.set(callId, buffered);
                }
                // Pi streams partial arguments while pending, then confirms final input
                // at execution start. Do not freeze a partial/empty call in the transcript.
                if (!terminal && status !== 'in_progress')
                    return;
                if (!follow.activeToolCalls.has(callId)) {
                    this.ensurePiStep(follow, false);
                    this.finishPiAssistant(follow);
                    follow.piAfterTools = true;
                    this.pushEvent(follow, 'tool/call', {
                        turn: follow.turn, step: follow.piStep ?? 1, callId, toolCallId: callId, name: call.name, toolName: call.name,
                        arguments: typeof call.input === 'string' ? call.input
                            : call.input != null ? JSON.stringify(call.input) : '{}',
                        status: terminal ? status === 'failed' ? 'failed' : 'finished' : 'running',
                    });
                    follow.activeToolCalls.add(callId);
                }
                if (terminal) {
                    const buffered = follow.piToolOutputs.get(callId);
                    const content = buffered ? [{
                            type: 'text', text: buffered.overflow
                                ? '[Pi tool output exceeds the live preview limit; reload history to read the bounded persisted result.]' : buffered.text
                        }]
                        : output.content;
                    this.pushEvent(follow, 'tool/result', {
                        turn: follow.turn, step: follow.piStep ?? 1, message: {
                            id: `${callId}:result`, role: 'user', content: [{
                                    type: 'tool-result', toolCallId: callId,
                                    content, ...(output.isError ? { isError: true } : {})
                                }], source: { kind: 'tool', callId },
                        }
                    });
                    follow.piToolOutputs.delete(callId);
                    follow.piToolCalls.delete(callId);
                    follow.activeToolCalls.delete(callId);
                }
                if (session !== undefined)
                    session.updatedAt = Date.now();
                return;
            }
            if (typeof termDelta === 'string') {
                const buffered = follow.piToolOutputs.get(callId) ?? { text: '', overflow: false };
                if (!buffered.overflow) {
                    if (buffered.text.length + termDelta.length > 1_048_576) {
                        buffered.text = '';
                        buffered.overflow = true;
                    }
                    else
                        buffered.text += termDelta;
                }
                follow.piToolOutputs.set(callId, buffered);
            }
            const existingCall = follow.piToolCalls.get(callId);
            const call = existingCall ?? { name: toolName };
            if (typeof update.title === 'string')
                call.name = update.title;
            if (update.parameters !== undefined)
                call.input = update.parameters;
            else if (update.rawInput !== undefined)
                call.input = update.rawInput;
            follow.piToolCalls.set(callId, call);
            if (!follow.activeToolCalls.has(callId)) {
                if (!terminal && kind === 'tool_call_update' && status !== 'in_progress' && status !== 'pending') {
                    if (session !== undefined)
                        session.updatedAt = Date.now();
                    return;
                }
                if (!follow.stepOpen) {
                    follow.turn += 1;
                    follow.stepOpen = true;
                    this.pushEvent(follow, 'turn/start', { turn: follow.turn });
                    this.pushEvent(follow, 'step/start', { turn: follow.turn, step: 1 });
                }
                this.pushEvent(follow, 'tool/call', {
                    turn: follow.turn,
                    step: 1,
                    callId,
                    name: call.name,
                    arguments: typeof call.input === 'string'
                        ? call.input
                        : isRecord(call.input)
                            ? JSON.stringify(call.input)
                            : '{}',
                    toolCallId: callId,
                    toolName: call.name,
                    status: status === 'completed' ? 'finished' : status === 'failed' ? 'failed' : 'running',
                });
                if (!terminal)
                    follow.activeToolCalls.add(callId);
            }
            else if (!terminal) {
                if (session !== undefined)
                    session.updatedAt = Date.now();
                return;
            }
            if (terminal) {
                const output = piToolResult(update);
                const buffered = follow.piToolOutputs.get(callId);
                const content = output.content.length > 0
                    ? output.content
                    : buffered !== undefined
                        ? [{
                                type: 'text',
                                text: buffered.overflow
                                    ? '[Tool output exceeds the live preview limit; reload history to read the bounded persisted result.]'
                                    : buffered.text,
                            }]
                        : typeof update.rawOutput === 'string' && update.rawOutput.length > 0
                            ? [{ type: 'text', text: update.rawOutput }]
                            : update.rawOutput !== undefined && update.rawOutput !== null
                                ? [{ type: 'text', text: JSON.stringify(update.rawOutput) }]
                                : [];
                this.pushEvent(follow, 'tool/result', {
                    turn: follow.turn,
                    step: 1,
                    message: {
                        id: `${callId}:result`,
                        role: 'user',
                        content: [{
                                type: 'tool-result',
                                toolCallId: callId,
                                content,
                                ...(output.isError ? { isError: true } : {}),
                            }],
                        source: { kind: 'tool', callId },
                    },
                });
                follow.piToolOutputs.delete(callId);
                follow.piToolCalls.delete(callId);
                follow.activeToolCalls.delete(callId);
            }
            if (session !== undefined)
                session.updatedAt = Date.now();
            return;
        }
        if (kind === 'agent_thought_chunk') {
            const text = extractText(update);
            if (text === undefined || text.length === 0)
                return;
            this.appendReasoningDelta(follow, text);
            return;
        }
        if (kind === 'prompt_completed' || kind === 'prompt_failed') {
            const hasLiveContent = follow.stepOpen || follow.streamActive;
            if (!hasLiveContent && Array.isArray(update.catchUp)) {
                for (const item of update.catchUp) {
                    if (!isRecord(item) || typeof item.method !== 'string')
                        continue;
                    const catchUpParams = isRecord(item.params) ? item.params : {};
                    if (item.method === 'session/update')
                        this.acceptSessionUpdate(follow, catchUpParams);
                }
            }
            const usage = normalizeAcpUsage(update.usage);
            if (session !== undefined) {
                session.running = false;
                session.updatedAt = Date.now();
                this.context.emitRemoteEvent('api-session/status', [follow.sessionId, false]);
                this.context.publishWorkspaceBaseline();
                if (kind === 'prompt_completed')
                    void this.context.refreshSessionTitle(session);
            }
            this.closeFollowAfterRemoteStreamClosed(follow, piPromptOutcome(kind, update), false, usage);
        }
    }
    acceptApproval(follow, params, method) {
        const requestHandle = string(params.requestHandle);
        if (requestHandle === undefined)
            return;
        const currentPermission = this.context.permissionSelection(follow.sessionId);
        if (currentPermission === 'danger-full-access' && method === 'session/request_permission') {
            void this.context.client.respond(requestHandle, 'allow-once').catch(() => undefined);
            return;
        }
        this.context.pendingApprovals.set(requestHandle, { requestHandle, sessionId: follow.sessionId });
        const toolName = method === 'cursor/create_plan'
            ? (string(params.name) ?? 'plan')
            : method === 'cursor/ask_question'
                ? (string(params.title) ?? 'question')
                : (string(params.toolName) ?? string(record(params.toolCall).title) ?? 'permission');
        const reason = method === 'cursor/create_plan'
            ? string(params.overview) ?? string(params.plan)
            : method === 'cursor/ask_question'
                ? summarizeQuestions(params)
                : string(params.reason) ?? string(record(record(params.toolCall).rawInput).message);
        this.context.emitApproval({
            eventId: requestHandle,
            agentId: follow.sessionId,
            request: {
                toolName,
                method,
                ...(reason === undefined ? {} : { reason }),
                ...(method === 'cursor/ask_question' && Array.isArray(params.questions)
                    ? { questions: params.questions, ...(typeof params.title === 'string' ? { title: params.title } : {}) }
                    : {}),
                ...(method === 'cursor/create_plan'
                    ? {
                        ...(typeof params.name === 'string' ? { name: params.name } : {}),
                        ...(typeof params.overview === 'string' ? { overview: params.overview } : {}),
                        ...(typeof params.plan === 'string' ? { plan: params.plan } : {}),
                    }
                    : {}),
            },
        });
    }
    pushAssistantChunk(follow, chunk) {
        let attempt = follow.assistantAttempt;
        if (attempt === undefined) {
            attempt = {
                attemptId: this.context.backend === 'pi' ? `pi-attempt:${follow.sessionId}:${follow.turn}:${follow.piStep ?? 1}:${follow.nextSeq}`
                    : `cursor-attempt:${follow.turn}:${follow.nextSeq}`,
                startedAfterSeq: follow.nextSeq - 1,
                nextIndex: 0,
                stream: [],
            };
            follow.assistantAttempt = attempt;
            follow.assistantStreamRevision += 1;
            follow.queue.push({
                type: 'assistant-stream',
                frame: {
                    type: 'start',
                    attemptId: attempt.attemptId,
                    revision: follow.assistantStreamRevision,
                    startedAfterSeq: attempt.startedAfterSeq,
                    turn: follow.turn,
                    step: this.context.backend === 'pi' ? follow.piStep ?? 1 : 1,
                },
            });
        }
        const time = Date.now();
        const index = attempt.nextIndex++;
        // Durable streams use AssistantStreamRecord, unlike the timed chunks in
        // the live feed. Without this discriminator the native reader treats a
        // raw chunk as a packed run and throws while settling the conversation.
        attempt.stream.push({ type: 'chunk', time, chunk });
        follow.assistantStreamRevision += 1;
        follow.queue.push({
            type: 'assistant-stream',
            frame: {
                type: 'chunk',
                attemptId: attempt.attemptId,
                revision: follow.assistantStreamRevision,
                index,
                time,
                chunk,
            },
        });
    }
    endAssistantAttempt(follow, outcome) {
        const attempt = follow.assistantAttempt;
        if (attempt === undefined)
            return;
        follow.assistantAttempt = undefined;
        follow.assistantStreamRevision += 1;
        follow.queue.push({
            type: 'assistant-stream',
            frame: {
                type: 'end',
                attemptId: attempt.attemptId,
                revision: follow.assistantStreamRevision,
                index: attempt.nextIndex,
                outcome,
            },
        });
    }
    appendAssistantDelta(follow, delta) {
        if (this.context.backend === 'pi')
            this.ensurePiStep(follow, true);
        if (!follow.stepOpen) {
            follow.turn += 1;
            follow.stepOpen = true;
            this.pushEvent(follow, 'turn/start', { turn: follow.turn });
            this.pushEvent(follow, 'step/start', { turn: follow.turn, step: 1 });
        }
        if (follow.blockIndex === undefined) {
            follow.blockIndex = (follow.reasoningBlockIndex ?? -1) + 1;
            follow.streamActive = true;
            this.pushAssistantChunk(follow, { type: 'block-start', index: follow.blockIndex, blockType: 'text' });
        }
        follow.accumulatedText += delta;
        this.pushAssistantChunk(follow, { type: 'text-delta', index: follow.blockIndex, text: delta });
    }
    appendReasoningDelta(follow, delta) {
        if (this.context.backend === 'pi') {
            this.ensurePiStep(follow, true);
            follow.piReasoning = (follow.piReasoning ?? '') + delta;
        }
        follow.accumulatedReasoning = (follow.accumulatedReasoning ?? '') + delta;
        if (!follow.stepOpen) {
            follow.turn += 1;
            follow.stepOpen = true;
            this.pushEvent(follow, 'turn/start', { turn: follow.turn });
            this.pushEvent(follow, 'step/start', { turn: follow.turn, step: 1 });
        }
        if (follow.reasoningBlockIndex === undefined) {
            follow.reasoningBlockIndex = (follow.blockIndex ?? -1) + 1;
            follow.streamActive = true;
            this.pushAssistantChunk(follow, { type: 'block-start', index: follow.reasoningBlockIndex, blockType: 'reasoning' });
        }
        this.pushAssistantChunk(follow, { type: 'reasoning-delta', index: follow.reasoningBlockIndex, text: delta });
    }
    /** Pi model steps settle before tools; a tool round does not end the turn. */
    ensurePiStep(follow, advanceAfterTools) {
        if (!follow.stepOpen) {
            follow.turn++;
            follow.piStep = 1;
            follow.stepOpen = true;
            this.pushEvent(follow, 'turn/start', { turn: follow.turn });
            this.pushEvent(follow, 'step/start', { turn: follow.turn, step: 1 });
        }
        else if (advanceAfterTools && follow.piAfterTools) {
            this.pushEvent(follow, 'step/end', { turn: follow.turn, step: follow.piStep ?? 1 });
            follow.piStep = (follow.piStep ?? 1) + 1;
            this.pushEvent(follow, 'step/start', { turn: follow.turn, step: follow.piStep });
        }
        if (advanceAfterTools)
            follow.piAfterTools = false;
    }
    finishReason(outcome) {
        if (outcome.kind === 'error')
            return { kind: 'error', failure: outcome.error };
        if (outcome.kind === 'aborted') {
            return {
                kind: 'aborted',
                failure: { code: 'ABORTED', message: `${acpBackendLabel(this.context.backend)} reply interrupted.` },
            };
        }
        return { kind: outcome.kind === 'max-tokens' ? 'max-tokens' : 'stop' };
    }
    finishPiAssistant(follow, outcome = { kind: 'completed' }, usage) {
        if (!follow.streamActive)
            return;
        const isPi = this.context.backend === 'pi';
        const step = isPi ? follow.piStep ?? 1 : 1;
        const reasoningText = follow.accumulatedReasoning ?? follow.piReasoning ?? '';
        const blocks = [
            { index: follow.reasoningBlockIndex, type: 'reasoning', text: reasoningText },
            { index: follow.blockIndex, type: 'text', text: follow.accumulatedText },
        ].filter((block) => block.index !== undefined)
            .sort((a, b) => a.index - b.index);
        for (const { index, type, text } of blocks) {
            this.pushAssistantChunk(follow, { type: 'block-end', index, block: { type, text } });
        }
        this.pushAssistantChunk(follow, { type: 'finish', reason: this.finishReason(outcome) });
        const selection = this.context.modelSelection(follow.sessionId);
        const seq = this.pushEvent(follow, 'assistant/message', {
            turn: follow.turn,
            step,
            message: {
                id: isPi ? `${follow.sessionId}:${follow.turn}:${step}` : `${follow.sessionId}:${follow.turn}`,
                role: 'assistant',
                content: blocks.map(({ type, text }) => ({ type, text })),
                source: { kind: 'model', provider: selection.provider, model: selection.model },
                ...(usage !== undefined ? { usage } : {}),
            },
            ...(usage !== undefined ? { usage } : {}),
            stream: follow.assistantAttempt?.stream ?? [],
        });
        this.endAssistantAttempt(follow, { kind: 'committed', eventType: 'assistant/message', seq });
        follow.streamActive = false;
        follow.blockIndex = undefined;
        follow.reasoningBlockIndex = undefined;
        follow.accumulatedText = '';
        follow.accumulatedReasoning = '';
        follow.piReasoning = '';
    }
    closeFollowAfterRemoteStreamClosed(follow, outcome = { kind: 'completed' }, remoteClosed = false, usage) {
        if (follow.closed)
            return;
        const session = this.context.sessions.get(follow.sessionId);
        if (session !== undefined)
            session.running = false;
        const isPi = this.context.backend === 'pi';
        const step = isPi ? follow.piStep ?? 1 : 1;
        this.finishPiAssistant(follow, outcome, usage);
        if (follow.stepOpen) {
            this.pushEvent(follow, 'step/end', { turn: follow.turn, step });
            this.pushEvent(follow, 'turn/end', {
                turn: follow.turn,
                reason: outcome,
                ...(usage !== undefined ? { usage } : {}),
            });
        }
        follow.stepOpen = false;
        if (isPi) {
            follow.piStep = 1;
            follow.piAfterTools = false;
        }
        follow.piToolOutputs.clear();
        follow.piToolCalls.clear();
        follow.activeToolCalls.clear();
        if (session !== undefined)
            this.context.syncSessionCache?.(session);
        if (remoteClosed || !follow.hasConsumer) {
            follow.closed = true;
            this.context.follows.delete(follow);
            follow.queue.close();
            void follow.close?.().catch(() => undefined);
        }
    }
    pushEvent(follow, type, data) {
        const session = this.context.sessions.get(follow.sessionId);
        const seq = session !== undefined ? session.events.length : follow.nextSeq++;
        const event = {
            type,
            seq,
            time: Date.now(),
            data,
            ...(isSurfaceEvent(type) ? { surfaceOp: 'append' } : {}),
        };
        if (session !== undefined) {
            session.events.push({ type: 'event', event });
            this.context.syncSessionCache?.(session);
        }
        for (const f of this.context.follows) {
            if (f.sessionId === follow.sessionId) {
                f.queue.push({ type: 'event', event });
                f.nextSeq = seq + 1;
            }
        }
        return seq;
    }
}
function nonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function normalizeAcpUsage(value) {
    if (!isRecord(value))
        return undefined;
    const totalTokens = nonNegativeNumber(value.totalTokens);
    const inputTokens = nonNegativeNumber(value.inputTokens);
    const outputTokens = nonNegativeNumber(value.outputTokens);
    const cacheReadTokens = nonNegativeNumber(value.cacheReadTokens ?? value.cachedReadTokens);
    const cacheWriteTokens = nonNegativeNumber(value.cacheWriteTokens ?? value.cachedWriteTokens);
    const reasoningTokens = nonNegativeNumber(value.reasoningTokens ?? value.thoughtTokens);
    if (totalTokens === undefined
        && inputTokens === undefined
        && outputTokens === undefined
        && cacheReadTokens === undefined
        && cacheWriteTokens === undefined
        && reasoningTokens === undefined) {
        return undefined;
    }
    const computedTotal = totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0) + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) + (reasoningTokens ?? 0));
    return {
        totalTokens: computedTotal,
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
        ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
        ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    };
}
function normalizeContextUsage(value) {
    const used = nonNegativeNumber(value.used);
    const size = nonNegativeNumber(value.size);
    if (used === undefined && size === undefined)
        return undefined;
    return {
        used: used ?? 0,
        size: size ?? 0,
    };
}
export function contextPressureProjection(usage) {
    const ratio = usage.size > 0 ? Math.min(1, Math.max(0, usage.used / usage.size)) : 0;
    return {
        used: usage.used,
        size: usage.size,
        ratio,
    };
}
function normalizeAvailableCommands(value) {
    if (!Array.isArray(value))
        return undefined;
    const items = [];
    for (const entry of value) {
        if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.trim().length === 0)
            continue;
        const input = isRecord(entry.input) && typeof entry.input.hint === 'string'
            ? { hint: entry.input.hint }
            : undefined;
        items.push({
            name: entry.name.trim(),
            ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
            ...(input !== undefined ? { input } : {}),
        });
    }
    return items;
}
export function normalizeAcpTodos(value) {
    if (!Array.isArray(value))
        return undefined;
    const items = [];
    for (const entry of value) {
        if (!isRecord(entry))
            continue;
        const content = string(entry.content) ?? string(entry.title) ?? string(entry.label);
        if (content === undefined || content.trim().length === 0)
            continue;
        const rawStatus = string(entry.status);
        const status = rawStatus === 'completed' || rawStatus === 'done'
            ? 'completed'
            : rawStatus === 'in_progress' || rawStatus === 'inProgress' || rawStatus === 'running'
                ? 'in_progress'
                : 'pending';
        const priority = string(entry.priority);
        items.push({
            content: content.trim(),
            status,
            ...(priority !== undefined ? { priority } : {}),
        });
    }
    return items;
}
//# sourceMappingURL=virtual-live.js.map
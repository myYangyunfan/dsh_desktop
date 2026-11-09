import { acpImageLimits } from './image-content.js';
import { piToolResult } from './pi-tool-result.js';
import { acpBackendLabel } from './virtual-catalog.js';
import { AsyncValueQueue, extractSessionId, extractText, isRecord, isSurfaceEvent, optionalPositiveInteger, piPromptOutcome, piStreamOutcome, record, string, summarizeQuestions, } from './virtual-contract.js';
export class AcpLiveProjection {
    context;
    constructor(context) {
        this.context = context;
    }
    async sessionFollow(request, signal) {
        const sessionId = extractSessionId(request);
        const session = this.context.ensureSessionRegistered(sessionId) ?? this.context.sessions.get(sessionId);
        if (session === undefined)
            throw new Error('The Session was not found.');
        await this.context.hydrateSession(session);
        const history = this.context.historyPage(session, {
            limit: optionalPositiveInteger(request.maxMessages) ?? 50,
        });
        const queue = new AsyncValueQueue(signal);
        const follow = {
            sessionId,
            acpSessionId: session.acpSessionId,
            queue,
            nextSeq: session.events.length,
            turn: Math.max(0, ...session.events.map(entry => (isRecord(entry.event.data) && typeof entry.event.data.turn === 'number' ? entry.event.data.turn : 0))),
            stepOpen: session.running,
            streamActive: false,
            assistantStreamRevision: 0,
            accumulatedText: '',
            activeToolCalls: new Set(),
            piToolOutputs: new Map(),
            piToolCalls: new Map(),
        };
        this.context.follows.add(follow);
        queue.push({
            type: 'snapshot',
            header: history.header,
            cursor: history.cursor,
            records: history.records,
            hasMore: history.hasMore,
            projections: {
                asOfSeq: history.cursor,
                values: {
                    title: session.title ?? acpBackendLabel(this.context.backend),
                    sessionListMetadata: { blank: session.blank && session.events.length === 0, lastPromptAt: null },
                    modelSelection: this.context.modelSelectionProjection(sessionId),
                    permissions: this.context.permissionsProjection(sessionId),
                    imageLimits: acpImageLimits(this.context.backend),
                },
            },
            assistantStream: { revision: 0 },
        });
        try {
            const stream = await this.context.client.openStream(session.acpSessionId, frame => this.acceptAcpFrame(follow, frame), closed => {
                session.running = false;
                this.context.emitRemoteEvent('api-session/status', [sessionId, false]);
                this.closeFollowAfterRemoteStreamClosed(follow, piStreamOutcome(closed.reason));
            }, signal);
            follow.close = () => stream.close();
        }
        catch (error) {
            this.context.follows.delete(follow);
            queue.close();
            throw error;
        }
        return queue.iterate(() => {
            this.context.follows.delete(follow);
            void follow.close?.().catch(() => undefined);
        });
    }
    async ensureFollow(session) {
        if ([...this.context.follows].some(follow => follow.sessionId === session.sessionId))
            return;
        // Native UI opens session/follow; prompts before follow still work via Host stream open on demand.
        const controller = new AbortController();
        const queue = new AsyncValueQueue(controller.signal);
        const follow = {
            sessionId: session.sessionId,
            acpSessionId: session.acpSessionId,
            queue,
            nextSeq: session.events.length === 0 ? 0 : Math.max(...session.events.map(entry => entry.event.seq)) + 1,
            turn: Math.max(0, ...session.events.map(entry => (isRecord(entry.event.data) && typeof entry.event.data.turn === 'number' ? entry.event.data.turn : 0))),
            stepOpen: false,
            streamActive: false,
            assistantStreamRevision: 0,
            accumulatedText: '',
            activeToolCalls: new Set(),
            piToolOutputs: new Map(),
            piToolCalls: new Map(),
        };
        this.context.follows.add(follow);
        const stream = await this.context.client.openStream(session.acpSessionId, frame => this.acceptAcpFrame(follow, frame), closed => {
            if (this.context.backend === 'pi') {
                session.running = false;
                this.context.emitRemoteEvent('api-session/status', [session.sessionId, false]);
            }
            this.closeFollowAfterRemoteStreamClosed(follow, piStreamOutcome(closed.reason));
        });
        follow.close = async () => {
            controller.abort();
            await stream.close();
        };
    }
    acceptAcpFrame(follow, frame) {
        const method = frame.frame.method;
        const params = record(frame.frame.params);
        if (method === 'session/update') {
            this.acceptSessionUpdate(follow, params);
            return;
        }
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
        if (kind === 'model_selection' && isRecord(update.selected)
            && update.selected.provider === this.context.backend && typeof update.selected.model === 'string') {
            this.context.selectedModels.set(follow.sessionId, update.selected);
            this.context.publishProjection(follow.sessionId, 'modelSelection', this.context.modelSelectionProjection(follow.sessionId), this.context.nextProjectionSeq());
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
            if (this.context.backend === 'pi') {
                const call = follow.piToolCalls.get(callId) ?? { name: toolName };
                if (typeof update.title === 'string')
                    call.name = update.title;
                if (update.rawInput !== undefined)
                    call.input = update.rawInput;
                follow.piToolCalls.set(callId, call);
                const output = piToolResult(update);
                const delta = record(record(update._meta).terminal_output).data;
                if (typeof delta === 'string') {
                    const buffered = follow.piToolOutputs.get(callId) ?? { text: '', overflow: false };
                    if (!buffered.overflow) {
                        if (buffered.text.length + delta.length > 1_048_576) {
                            buffered.text = '';
                            buffered.overflow = true;
                        }
                        else
                            buffered.text += delta;
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
            if (kind === 'tool_call_update' && !terminal)
                return;
            if (kind === 'tool_call' && follow.activeToolCalls.has(callId))
                return;
            this.pushEvent(follow, 'tool/call', {
                turn: follow.turn,
                step: 1,
                callId,
                name: toolName,
                arguments: typeof update.parameters === 'object' && update.parameters !== null
                    ? JSON.stringify(update.parameters)
                    : typeof update.rawInput === 'object' && update.rawInput !== null
                        ? JSON.stringify(update.rawInput)
                        : '{}',
                toolCallId: callId,
                toolName,
                status: status === 'completed' ? 'finished' : status === 'failed' ? 'failed' : 'running',
            });
            if (terminal)
                follow.activeToolCalls.delete(callId);
            else
                follow.activeToolCalls.add(callId);
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
                    const params = isRecord(item.params) ? item.params : {};
                    if (item.method === 'session/update')
                        this.acceptSessionUpdate(follow, params);
                }
            }
            if (session !== undefined) {
                session.running = false;
                session.updatedAt = Date.now();
                this.context.emitRemoteEvent('api-session/status', [follow.sessionId, false]);
                this.context.publishWorkspaceBaseline();
                if (kind === 'prompt_completed')
                    void this.context.refreshSessionTitle(session);
            }
            this.closeFollowAfterRemoteStreamClosed(follow, piPromptOutcome(kind, update));
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
                ...(reason === undefined ? {} : { reason }),
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
    finishPiAssistant(follow, outcome = { kind: 'completed' }) {
        if (!follow.streamActive)
            return;
        const blocks = [
            { index: follow.reasoningBlockIndex, type: 'reasoning', text: follow.piReasoning ?? '' },
            { index: follow.blockIndex, type: 'text', text: follow.accumulatedText },
        ].filter((block) => block.index !== undefined)
            .sort((a, b) => a.index - b.index);
        for (const { index, type, text } of blocks)
            this.pushAssistantChunk(follow, { type: 'block-end', index, block: { type, text } });
        const reason = outcome.kind === 'error' ? { kind: 'error', failure: outcome.error }
            : outcome.kind === 'aborted' ? { kind: 'aborted', failure: { code: 'ABORTED', message: 'Pi reply interrupted.' } }
                : { kind: outcome.kind === 'max-tokens' ? 'max-tokens' : 'stop' };
        this.pushAssistantChunk(follow, { type: 'finish', reason });
        const selection = this.context.modelSelection(follow.sessionId);
        const seq = this.pushEvent(follow, 'assistant/message', {
            turn: follow.turn, step: follow.piStep ?? 1,
            message: {
                id: `${follow.sessionId}:${follow.turn}:${follow.piStep ?? 1}`,
                role: 'assistant', content: blocks.map(({ type, text }) => ({ type, text })),
                source: { kind: 'model', provider: selection.provider, model: selection.model },
            },
            stream: follow.assistantAttempt?.stream ?? [],
        });
        this.endAssistantAttempt(follow, { kind: 'committed', eventType: 'assistant/message', seq });
        follow.streamActive = false;
        follow.blockIndex = undefined;
        follow.reasoningBlockIndex = undefined;
        follow.accumulatedText = '';
        follow.piReasoning = '';
    }
    closeFollowAfterRemoteStreamClosed(follow, outcome = { kind: 'completed' }) {
        if (this.context.backend === 'pi') {
            this.finishPiAssistant(follow, outcome);
            if (follow.stepOpen) {
                this.pushEvent(follow, 'step/end', { turn: follow.turn, step: follow.piStep ?? 1 });
                this.pushEvent(follow, 'turn/end', { turn: follow.turn, reason: outcome });
            }
            follow.stepOpen = false;
            follow.piStep = 1;
            follow.piAfterTools = false;
            follow.piToolOutputs.clear();
            follow.piToolCalls.clear();
            follow.activeToolCalls.clear();
            return;
        }
        if (follow.streamActive) {
            if (follow.reasoningBlockIndex !== undefined) {
                this.pushAssistantChunk(follow, {
                    type: 'block-end',
                    index: follow.reasoningBlockIndex,
                    block: { type: 'reasoning', text: '' },
                });
                follow.reasoningBlockIndex = undefined;
            }
            if (follow.blockIndex !== undefined) {
                const fullText = follow.accumulatedText;
                this.pushAssistantChunk(follow, {
                    type: 'block-end',
                    index: follow.blockIndex,
                    block: { type: 'text', text: fullText },
                });
            }
            this.pushAssistantChunk(follow, {
                type: 'finish',
                reason: { kind: 'stop' },
            });
            const fullText = follow.accumulatedText;
            const selection = this.context.modelSelection(follow.sessionId);
            const stream = follow.assistantAttempt?.stream ?? [];
            const assistantMessageSeq = this.pushEvent(follow, 'assistant/message', {
                turn: follow.turn,
                step: 1,
                message: {
                    id: `${follow.sessionId}:${follow.turn}`,
                    role: 'assistant',
                    content: [{ type: 'text', text: fullText }],
                    source: { kind: 'model', provider: selection.provider, model: selection.model },
                },
                stream,
            });
            this.endAssistantAttempt(follow, {
                kind: 'committed',
                eventType: 'assistant/message',
                seq: assistantMessageSeq,
            });
            this.pushEvent(follow, 'step/end', { turn: follow.turn, step: 1 });
            this.pushEvent(follow, 'turn/end', { turn: follow.turn, reason: { kind: 'completed' } });
        }
        else if (follow.stepOpen) {
            this.pushEvent(follow, 'step/end', { turn: follow.turn, step: 1 });
            this.pushEvent(follow, 'turn/end', { turn: follow.turn, reason: { kind: 'completed' } });
        }
        follow.streamActive = false;
        follow.stepOpen = false;
        follow.blockIndex = undefined;
        follow.reasoningBlockIndex = undefined;
        follow.accumulatedText = '';
        follow.piToolOutputs.clear();
        follow.piToolCalls.clear();
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
//# sourceMappingURL=virtual-live.js.map
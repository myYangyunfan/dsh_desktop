import { collectImageBlocks, toolOutputImageBlocks } from './codex-image-codec.js';
import { codexPermissionPresetFromResponse } from './permissions.js';
import { CODEX_PROVIDER, modelSelectionProjection } from './virtual-catalog.js';
import { AsyncValueQueue, CODEX_IMAGE_ATTACHMENT_PREFIX, codexImageLimitsProjection, codexPermissionsProjection, sessionIdFromAddress, } from './virtual-contract.js';
import { adaptEventData, appendBoundedText, commandText, fileChangeSummary, isSurfaceEvent, isToolItemType, itemEvents, itemText, sanitizedFileChanges, toolResultContentReplacement, toolResultEvent, } from './virtual-history.js';
import { array, integer, nativeThreadId, optionalPositiveInteger, record, string } from './virtual-values.js';
export class CodexLiveProjection {
    context;
    constructor(context) {
        this.context = context;
    }
    async sessionFollow(request, signal) {
        const sessionId = sessionIdFromAddress(record(request.address));
        const threadId = nativeThreadId(sessionId);
        const history = await this.context.readHistoryPage(threadId, {
            maxMessages: optionalPositiveInteger(request.maxMessages),
        }, signal);
        const directory = await this.context.models(signal).catch(() => undefined);
        const queue = new AsyncValueQueue(signal);
        const follow = {
            sessionId,
            threadId,
            queue,
            nextSeq: history.cursor + 1,
            turn: history.nextTurn,
            stepOpen: history.activeTurnId !== undefined,
            startedItems: new Set(),
            completedItems: new Set(),
            streamedBlocks: new Map(),
            nextBlockIndex: 0,
            streamActive: false,
            assistantStreamRevision: 0,
            liveItems: new Map(),
            liveToolOutput: new Map(),
            liveToolResultSeq: new Map(),
            pendingToolImages: [],
            requestId: this.context.pendingRequestIds.get(sessionId),
            ...(history.activeTurnId === undefined ? {} : { activeTurnId: history.activeTurnId }),
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
                    title: this.context.sessionTitle(sessionId),
                    sessionListMetadata: { blank: history.cursor < 0, lastPromptAt: null },
                    modelSelection: modelSelectionProjection(this.context.modelSelection(sessionId, directory)),
                    permissions: codexPermissionsProjection(this.context.permissionSelection(sessionId)),
                    imageLimits: codexImageLimitsProjection(),
                },
            },
            ...(this.context.sessionGeneration === 'v3' ? { assistantStream: { revision: 0 } } : {}),
        });
        try {
            const stream = await this.context.client.subscribe(threadId, frame => this.acceptCodexFrame(follow, frame), signal, () => this.closeFollowAfterRemoteStreamClosed(follow));
            if (this.context.closed || signal.aborted) {
                await stream.close().catch(() => undefined);
                signal.throwIfAborted();
                throw new Error('The CodeX virtual Harness is closed.');
            }
            follow.close = () => stream.close();
        }
        catch (error) {
            this.context.follows.delete(follow);
            queue.close();
            throw error;
        }
        this.context.rememberOpenedSession(sessionId);
        return queue.iterate(() => {
            this.context.follows.delete(follow);
            void follow.close?.().catch(() => undefined);
        });
    }
    acceptCodexFrame(follow, frame) {
        const params = record(frame.params);
        if (frame.method === 'thread/name/updated') {
            const name = string(params.threadName);
            if (name === undefined)
                return;
            const seq = this.context.nextProjectionSeq();
            this.context.updateThreadName(follow.threadId, name);
            const title = name.trim() === '' ? null : name.slice(0, 256);
            this.context.publishProjection(follow.sessionId, 'title', title, seq);
            return;
        }
        if (frame.method === 'thread/settings/updated') {
            const preset = codexPermissionPresetFromResponse(params);
            this.context.setPermissionSelection(follow.sessionId, preset);
            return;
        }
        if (frame.method === 'turn/started') {
            const turn = record(params.turn);
            this.endAssistantAttempt(follow, { kind: 'abandoned' });
            this.resetLiveTurn(follow);
            follow.turn += 1;
            follow.activeTurnId = string(turn.id);
            follow.requestId = this.context.pendingRequestIds.get(follow.sessionId);
            follow.stepOpen = true;
            this.pushEvent(follow, 'turn/start', { turn: follow.turn });
            this.pushEvent(follow, 'step/start', { turn: follow.turn, step: 1 });
            this.context.emitRemoteEvent('api-session/status', [follow.sessionId, true]);
            for (const item of array(turn.items))
                this.acceptCompletedItem(follow, record(item), false);
            return;
        }
        if (frame.method === 'item/started' || frame.method === 'item/completed') {
            const item = record(params.item);
            const itemId = string(item.id);
            if (frame.method === 'item/started' && itemId !== undefined) {
                follow.startedItems.add(itemId);
                follow.liveItems.set(itemId, item);
                if (isToolItemType(string(item.type)))
                    this.ensureToolStarted(follow, item);
            }
            if (frame.method === 'item/completed')
                this.acceptCompletedItem(follow, item, true);
            return;
        }
        if (frame.method === 'item/agentMessage/delta') {
            const itemId = string(params.itemId) ?? `assistant:${follow.turn}`;
            const delta = string(params.delta);
            if (delta === undefined)
                return;
            this.appendStreamDelta(follow, `agent:${itemId}`, itemId, 'text', delta);
            return;
        }
        if (frame.method === 'item/reasoning/summaryPartAdded') {
            const itemId = string(params.itemId);
            if (itemId !== undefined)
                this.ensureStreamBlock(follow, `reasoning-summary:${itemId}:${integer(params.summaryIndex) ?? 0}`, itemId, 'reasoning');
            return;
        }
        if (frame.method === 'item/reasoning/summaryTextDelta'
            || frame.method === 'item/reasoning/textDelta'
            || frame.method === 'item/plan/delta') {
            const itemId = string(params.itemId);
            const delta = string(params.delta);
            if (itemId === undefined || delta === undefined)
                return;
            const key = frame.method === 'item/plan/delta'
                ? `plan:${itemId}`
                : frame.method === 'item/reasoning/summaryTextDelta'
                    ? `reasoning-summary:${itemId}:${integer(params.summaryIndex) ?? 0}`
                    : `reasoning-content:${itemId}:${integer(params.contentIndex) ?? 0}`;
            this.appendStreamDelta(follow, key, itemId, 'reasoning', delta);
            return;
        }
        if (frame.method === 'turn/plan/updated') {
            const todos = array(params.plan).flatMap(value => {
                const item = record(value);
                const content = string(item.step);
                if (content === undefined)
                    return [];
                const status = item.status === 'inProgress'
                    ? 'in_progress'
                    : item.status === 'completed' ? 'completed' : 'pending';
                return [{ content, status }];
            });
            this.pushEvent(follow, 'todo/write', { todos });
            return;
        }
        if (frame.method === 'item/commandExecution/outputDelta'
            || frame.method === 'item/fileChange/outputDelta'
            || frame.method === 'item/mcpToolCall/progress') {
            const itemId = string(params.itemId);
            const delta = frame.method === 'item/mcpToolCall/progress'
                ? string(params.message)
                : string(params.delta);
            if (itemId === undefined || delta === undefined)
                return;
            const type = frame.method === 'item/commandExecution/outputDelta'
                ? 'commandExecution'
                : frame.method === 'item/fileChange/outputDelta' ? 'fileChange' : 'mcpToolCall';
            const item = follow.liveItems.get(itemId) ?? { id: itemId, type, status: 'inProgress' };
            follow.liveItems.set(itemId, item);
            this.ensureToolStarted(follow, item);
            const separator = frame.method === 'item/mcpToolCall/progress' && follow.liveToolOutput.has(itemId) ? '\n' : '';
            const output = appendBoundedText(follow.liveToolOutput.get(itemId) ?? '', `${separator}${delta}`);
            follow.liveToolOutput.set(itemId, output);
            this.emitToolResult(follow, item, output);
            return;
        }
        if (frame.method === 'item/fileChange/patchUpdated') {
            const itemId = string(params.itemId);
            if (itemId === undefined)
                return;
            const previous = follow.liveItems.get(itemId) ?? { id: itemId, type: 'fileChange', status: 'inProgress' };
            const item = { ...previous, changes: sanitizedFileChanges(params.changes) };
            follow.liveItems.set(itemId, item);
            this.ensureToolStarted(follow, item);
            this.emitToolResult(follow, item, fileChangeSummary(item));
            return;
        }
        if (frame.method === 'thread/status/changed') {
            const status = record(params.status);
            const running = status.type === 'active';
            this.context.emitRemoteEvent('api-session/status', [follow.sessionId, running]);
            return;
        }
        if (frame.method === 'model/rerouted') {
            const model = string(params.toModel);
            if (model === undefined)
                return;
            const previous = this.context.selectedModels.get(follow.sessionId);
            const selected = {
                provider: CODEX_PROVIDER,
                model,
                ...(previous?.reasoningEffort === undefined ? {} : { reasoningEffort: previous.reasoningEffort }),
            };
            this.context.selectedModels.set(follow.sessionId, selected);
            const seq = this.pushEvent(follow, 'request/context', { provider: CODEX_PROVIDER, model });
            this.context.publishProjection(follow.sessionId, 'modelSelection', modelSelectionProjection(selected), seq);
            return;
        }
        if (frame.method === 'turn/completed') {
            const turn = record(params.turn);
            for (const item of array(turn.items))
                this.acceptCompletedItem(follow, record(item), true);
            if (follow.stepOpen) {
                this.closeAllStreamBlocks(follow);
                if (follow.streamActive)
                    this.finishStream(follow);
                this.endAssistantAttempt(follow, { kind: 'abandoned' });
                this.pushEvent(follow, 'step/end', { turn: follow.turn, step: 1 });
                follow.stepOpen = false;
            }
            this.pushEvent(follow, 'turn/end', {
                turn: follow.turn,
                reason: turn.status === 'failed' || turn.error !== undefined && turn.error !== null
                    ? { kind: 'error', error: { message: 'CodeX turn failed.', code: 'codex-turn-failed' } }
                    : { kind: 'completed' },
            });
            this.context.emitRemoteEvent('api-session/status', [follow.sessionId, false]);
            this.context.emitRemoteEvent('api-session/activity', [follow.sessionId, Date.now()]);
            follow.activeTurnId = undefined;
            this.context.pendingRequestIds.delete(follow.sessionId);
            void this.context.refreshAndPublishWorkspaces();
            return;
        }
        if (frame.method === 'item/commandExecution/requestApproval'
            || frame.method === 'item/fileChange/requestApproval') {
            const requestHandle = string(params.requestHandle);
            if (requestHandle === undefined)
                return;
            const command = commandText(params.command);
            this.context.pendingApprovals.set(requestHandle, { requestHandle, sessionId: follow.sessionId });
            this.context.emitApproval({
                eventId: requestHandle,
                agentId: follow.sessionId,
                request: {
                    toolName: frame.method.includes('fileChange') ? 'CodeX file change' : 'CodeX command',
                    ...(command === undefined ? {} : { reason: command }),
                },
            });
        }
    }
    acceptCompletedItem(follow, item, settleAssistant) {
        const itemId = string(item.id) ?? `item:${follow.nextSeq}`;
        if (follow.completedItems.has(itemId))
            return;
        const type = string(item.type);
        if (type === 'agentMessage' && !settleAssistant)
            return;
        follow.completedItems.add(itemId);
        this.closeItemStreamBlocks(follow, itemId, itemText(item));
        if (type === 'agentMessage' && follow.streamActive && follow.streamedBlocks.size === 0)
            this.finishStream(follow);
        const supplementalImages = type === 'agentMessage' ? follow.pendingToolImages : [];
        let assistantMessageSeq;
        for (const event of itemEvents(item, follow.turn, 1, follow.requestId, this.context.modelSelection(follow.sessionId), follow.sessionId, supplementalImages)) {
            if (event.type === 'tool/call' && follow.startedItems.has(itemId))
                continue;
            if (event.type === 'tool/result')
                this.pushToolResult(follow, itemId, event);
            else {
                const seq = this.pushEvent(follow, event.type, event.data, event.view);
                if (event.type === 'assistant/message')
                    assistantMessageSeq = seq;
            }
        }
        if (type === 'agentMessage' && assistantMessageSeq !== undefined) {
            this.endAssistantAttempt(follow, {
                kind: 'committed',
                eventType: 'assistant/message',
                seq: assistantMessageSeq,
            });
        }
        if (type === 'agentMessage' && supplementalImages.length > 0)
            follow.pendingToolImages = [];
        else if (type !== undefined && isToolItemType(type)) {
            follow.pendingToolImages.push(...toolOutputImageBlocks(item));
        }
        follow.liveItems.delete(itemId);
        follow.liveToolOutput.delete(itemId);
        follow.liveToolResultSeq.delete(itemId);
        follow.liveToolResultSeq.delete(`${itemId}:call`);
    }
    pushEvent(follow, type, data, view, placement) {
        const seq = follow.nextSeq++;
        const event = {
            type,
            seq,
            time: Date.now(),
            data: adaptEventData(type, type === 'assistant/message' && this.context.sessionGeneration === 'v3' && follow.assistantAttempt !== undefined
                ? { ...record(data), stream: follow.assistantAttempt.stream }
                : data, this.context.sessionGeneration),
            ...(isSurfaceEvent(type)
                ? placement === undefined
                    ? { surfaceOp: 'append' }
                    : {
                        surfaceOp: this.context.sessionGeneration === 'v3'
                            ? { op: 'replace', startSeq: placement.replaceSeq, endSeq: placement.replaceSeq }
                            : { op: 'replace', start: placement.replaceSeq, end: placement.replaceSeq },
                        sourceEventSeqs: [placement.replaceSeq],
                    }
                : {}),
        };
        this.cacheImageBlocks(follow.sessionId, event.data);
        follow.queue.push({
            type: 'event',
            event,
            ...(view === undefined ? {} : { view }),
        });
        return seq;
    }
    cacheImageBlocks(sessionId, value) {
        for (const block of collectImageBlocks(value)) {
            const attachment = record(block.attachment);
            const attachmentId = string(attachment.attachmentId);
            const data = string(block.data);
            if (attachmentId === undefined || data === undefined || !attachmentId.startsWith(CODEX_IMAGE_ATTACHMENT_PREFIX))
                continue;
            this.context.imageAttachments.set(attachmentId, { sessionId, attachment, data });
        }
    }
    ensureStreamBlock(follow, key, itemId, kind) {
        const current = follow.streamedBlocks.get(key);
        if (current !== undefined)
            return current;
        const block = { itemId, index: follow.nextBlockIndex++, kind, text: '' };
        follow.streamedBlocks.set(key, block);
        follow.streamActive = true;
        this.pushAssistantChunk(follow, { type: 'block-start', index: block.index, blockType: kind });
        return block;
    }
    appendStreamDelta(follow, key, itemId, kind, delta) {
        const block = this.ensureStreamBlock(follow, key, itemId, kind);
        block.text = appendBoundedText(block.text, delta);
        this.pushAssistantChunk(follow, {
            type: kind === 'reasoning' ? 'reasoning-delta' : 'text-delta', index: block.index, text: delta,
        });
    }
    closeItemStreamBlocks(follow, itemId, fallback) {
        const matches = [...follow.streamedBlocks].filter(([, block]) => block.itemId === itemId);
        for (const [key, block] of matches) {
            const text = block.text || fallback || '';
            this.pushAssistantChunk(follow, {
                type: 'block-end', index: block.index, block: { type: block.kind, text },
            });
            follow.streamedBlocks.delete(key);
        }
    }
    closeAllStreamBlocks(follow) {
        for (const block of follow.streamedBlocks.values()) {
            this.pushAssistantChunk(follow, {
                type: 'block-end', index: block.index, block: { type: block.kind, text: block.text },
            });
        }
        follow.streamedBlocks.clear();
    }
    finishStream(follow) {
        this.pushAssistantChunk(follow, { type: 'finish', reason: { kind: 'stop' } });
        follow.streamActive = false;
    }
    pushAssistantChunk(follow, chunk) {
        if (this.context.sessionGeneration !== 'v3') {
            this.pushEvent(follow, 'assistant/chunk', { turn: follow.turn, step: 1, chunk });
            return;
        }
        let attempt = follow.assistantAttempt;
        if (attempt === undefined) {
            attempt = {
                attemptId: `codex-attempt:${follow.activeTurnId ?? follow.turn}:${follow.nextSeq}`,
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
                    step: 1,
                },
            });
        }
        const time = Date.now();
        const index = attempt.nextIndex++;
        attempt.stream.push({ time, chunk });
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
        if (this.context.sessionGeneration === 'v3') {
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
    }
    ensureToolStarted(follow, item) {
        const itemId = string(item.id);
        if (itemId === undefined)
            return;
        if (!follow.startedItems.has(itemId))
            follow.startedItems.add(itemId);
        if (follow.liveItems.get(itemId) !== item)
            follow.liveItems.set(itemId, item);
        const call = itemEvents(item, follow.turn, 1, follow.requestId, this.context.modelSelection(follow.sessionId), follow.sessionId).find(event => event.type === 'tool/call');
        if (call !== undefined && !follow.liveToolResultSeq.has(`${itemId}:call`)) {
            this.pushEvent(follow, call.type, call.data, call.view);
            follow.liveToolResultSeq.set(`${itemId}:call`, -1);
        }
    }
    emitToolResult(follow, item, resultText) {
        const itemId = string(item.id);
        if (itemId === undefined)
            return;
        const result = toolResultEvent(item, follow.turn, 1, itemId, resultText);
        this.pushToolResult(follow, itemId, result);
    }
    pushToolResult(follow, itemId, event) {
        const previous = follow.liveToolResultSeq.get(itemId);
        const projected = previous === undefined ? event : toolResultContentReplacement(event);
        const seq = this.pushEvent(follow, projected.type, projected.data, projected.view, previous === undefined ? undefined : { replaceSeq: previous });
        follow.liveToolResultSeq.set(itemId, seq);
    }
    resetLiveTurn(follow) {
        follow.startedItems.clear();
        follow.completedItems.clear();
        follow.streamedBlocks.clear();
        follow.nextBlockIndex = 0;
        follow.streamActive = false;
        follow.assistantAttempt = undefined;
        follow.liveItems.clear();
        follow.liveToolOutput.clear();
        follow.liveToolResultSeq.clear();
        follow.pendingToolImages = [];
    }
    closeFollowAfterRemoteStreamClosed(follow) {
        this.context.follows.delete(follow);
        follow.queue.close();
        this.context.emitRemoteEvent('api-session/status', [follow.sessionId, false]);
    }
}
//# sourceMappingURL=virtual-live.js.map
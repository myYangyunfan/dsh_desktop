import { nativeVisibleWorkspaces, nativeWorkspace } from './virtual-catalog.js';
import { AsyncValueQueue } from './virtual-contract.js';
import { record, string } from './virtual-values.js';
export class CodexEventCarrier {
    context;
    constructor(context) {
        this.context = context;
    }
    async workspaceFollow(signal) {
        const queue = new AsyncValueQueue(signal);
        this.context.workspaceStreams.add(queue);
        const catalog = await this.context.refreshCatalog(signal);
        queue.push({
            type: 'baseline',
            value: {
                items: nativeVisibleWorkspaces(catalog, this.context.selectedWorkspaceId).map(nativeWorkspace),
                archivedSessionIds: catalog.sessions.filter(item => item.archived).map(item => item.id),
                pinnedSessionIds: [],
            },
        });
        return queue.iterate(() => this.context.workspaceStreams.delete(queue));
    }
    async sessionControl(signal) {
        const queue = new AsyncValueQueue(signal);
        this.context.controlStreams.add(queue);
        queue.push({ type: 'baseline', value: { queues: {}, jobs: {}, projections: {} } });
        return queue.iterate(() => this.context.controlStreams.delete(queue));
    }
    /**
     * Background jobs belong to the Host Harness session, not to a CodeX virtual
     * Workspace. The native session header mounts a job roster stream as soon as a
     * Session opens, so answer it with an authoritative empty roster instead of a
     * terminal `method-not-found` failure that tears the page down.
     */
    emptyJobStream(endpoint, signal) {
        const queue = new AsyncValueQueue(signal);
        if (endpoint === 'job/list')
            queue.push({ type: 'rows', jobs: [] });
        return queue.iterate(() => queue.close());
    }
    async remoteEvents(signal) {
        const queue = new AsyncValueQueue(signal);
        const clientId = `codex-events:${this.context.host.deviceId}:${Date.now().toString(36)}`;
        this.context.eventStreams.set(clientId, queue);
        const home = (await this.context.currentCatalog(signal)).workspaces[0]?.path ?? '/';
        queue.push({ type: 'ready', clientId, host: { home } });
        return queue.iterate(() => this.context.eventStreams.delete(clientId));
    }
    emitRemoteEvent(event, args) {
        for (const queue of this.context.eventStreams.values())
            queue.push({ type: 'emit', event, args });
    }
    emitApproval(input) {
        for (const queue of this.context.eventStreams.values())
            queue.push({
                type: 'waterfall',
                event: 'approval/request',
                eventId: input.eventId,
                agentId: input.agentId,
                request: input.request,
            });
    }
    async answerRemoteEvent(args, signal) {
        const eventId = string(args.eventId);
        const outcome = record(args.outcome);
        if (eventId === undefined)
            throw new Error('The CodeX approval result is missing its event id.');
        const pending = this.context.pendingApprovals.get(eventId);
        if (pending === undefined)
            return undefined;
        this.context.pendingApprovals.delete(eventId);
        const decision = outcome.kind === 'result' && outcome.value === 'allowed-once'
            ? 'accept'
            : outcome.kind === 'result' && outcome.value === 'cancelled'
                ? 'cancel'
                : 'decline';
        await this.context.client.respond(pending.requestHandle, decision, signal);
        return undefined;
    }
    publishProjection(sessionId, key, value, seq) {
        for (const queue of this.context.controlStreams)
            queue.push({ type: 'projection', sessionId, key, value, seq });
    }
}
//# sourceMappingURL=virtual-event-carrier.js.map
import { nativeWorkspace } from './virtual-catalog.js';
import { AsyncValueQueue, record, string } from './virtual-contract.js';
export class AcpEventCarrier {
    context;
    constructor(context) {
        this.context = context;
    }
    async workspaceFollow(signal) {
        const queue = new AsyncValueQueue(signal);
        this.context.workspaceStreams.add(queue);
        queue.push({
            type: 'baseline',
            value: {
                items: this.context.visibleWorkspaces().map(nativeWorkspace),
                archivedSessionIds: [...this.context.archivedSessionIds],
                pinnedSessionIds: [],
            },
        });
        return queue.iterate(() => this.context.workspaceStreams.delete(queue));
    }
    async sessionControl(signal) {
        const queue = new AsyncValueQueue(signal);
        this.context.controlStreams.add(queue);
        // Session Controller treats the first control frame as the opening
        // snapshot. Without it the Client-side RemoteSnapshotStream never moves
        // to `ready`, so a workspace selected through the Remote modal remains
        // stuck on the empty shell after the page reload.
        queue.push({ type: 'baseline', value: { projections: {} } });
        return queue.iterate(() => this.context.controlStreams.delete(queue));
    }
    /**
     * Background jobs belong to the Host Harness session, not to a backend-scoped
     * virtual Workspace. The native session header mounts a job roster stream as
     * soon as a Session opens, so answer it with an authoritative empty roster
     * instead of a terminal `method-not-found` failure that tears the page down.
     */
    emptyJobStream(endpoint, signal) {
        const queue = new AsyncValueQueue(signal);
        if (endpoint === 'job/list')
            queue.push({ type: 'rows', jobs: [] });
        return queue.iterate(() => queue.close());
    }
    async remoteEvents(signal) {
        const id = `cursor-events:${Date.now()}:${Math.random()}`;
        const queue = new AsyncValueQueue(signal);
        this.context.eventStreams.set(id, queue);
        const workspace = this.context.selectedWorkspaceId === undefined
            ? undefined
            : this.context.workspaceById.get(this.context.selectedWorkspaceId);
        queue.push({
            type: 'ready',
            clientId: id,
            host: { home: workspace?.path ?? '/' },
        });
        return queue.iterate(() => this.context.eventStreams.delete(id));
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
            throw new Error(`The ${this.context.backendLabel()} approval result is missing its event id.`);
        const pending = this.context.pendingApprovals.get(eventId);
        if (pending === undefined)
            return undefined;
        this.context.pendingApprovals.delete(eventId);
        const decision = outcome.kind === 'result' && outcome.value === 'allowed-once'
            ? 'allow-once'
            : outcome.kind === 'result' && outcome.value === 'cancelled'
                ? 'cancel'
                : 'reject-once';
        await this.context.client.respond(pending.requestHandle, decision, undefined, signal);
        return undefined;
    }
    publishProjection(sessionId, key, value, seq = this.context.nextProjectionSeq()) {
        for (const queue of this.context.controlStreams) {
            queue.push({ type: 'projection', sessionId, key, value, asOfSeq: seq, seq });
        }
    }
}
//# sourceMappingURL=virtual-event-carrier.js.map
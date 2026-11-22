/** Check the public Gateway stream before a terminal Host becomes available. */
export async function assertRemoteEventSource(gateway) {
    const peerGateway = gateway.createPeer?.();
    if (peerGateway?.peer === undefined) {
        await peerGateway?.dispose?.();
        throw new Error('dsh-TUI Remote requires an official owner Peer for Remote events.');
    }
    const signal = AbortSignal.timeout(5_000);
    let iterator;
    try {
        const source = await peerGateway.open('$events', { args: {} }, signal);
        iterator = source[Symbol.asyncIterator]();
        const first = await iterator.next();
        const value = first.value;
        if (first.done || typeof value !== 'object' || value === null
            || !('type' in value) || value.type !== 'ready') {
            throw new Error('The Host Remote event source did not send a ready frame.');
        }
    }
    catch {
        throw new Error('dsh-TUI Remote needs @deepseek-ai/dsh-api-remotes and its Host API packages.');
    }
    finally {
        await iterator?.return?.().catch(() => undefined);
        await peerGateway.dispose?.();
    }
}
//# sourceMappingURL=tui-event-source.js.map
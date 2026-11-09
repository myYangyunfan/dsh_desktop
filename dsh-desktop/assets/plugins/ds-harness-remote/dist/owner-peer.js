/**
 * Owner Peer resolution for the Remote Host carrier.
 *
 * Harness 0.2.2 dereferences the calling Peer for every local Gateway stream
 * (`peer.signal`, `peer.principal`, `peer.interactions`) and rejects forwarded
 * event opens without a live Peer. The plugin therefore always attaches one to
 * its local carrier, preferring the official `Peer` export and falling back to
 * the Connection Host service when a build's module shape no longer exposes it.
 */
/**
 * Select the official `Peer` export of the installed Connection package.
 * @param connectionExports - module namespace of `@deepseek-ai/dsh-client-connection`.
 * @returns the constructor, or undefined when this build exposes neither name.
 */
export function ownerPeerConstructor(connectionExports) {
    const candidate = typeof connectionExports.Peer === 'function'
        ? connectionExports.Peer
        : connectionExports.OperatorPeer;
    return typeof candidate === 'function' ? candidate : undefined;
}
/**
 * Create a factory that mints owner Peers for the calling plugin.
 *
 * A factory is returned even when neither mechanism is available; it then
 * resolves `undefined` and the local carrier reports an actionable peerless
 * failure instead of a `TypeError` from the official Gateway.
 * @param ctx - plugin Context that owns Peer-backed effects.
 * @param constructor - official Peer constructor when exported by this build.
 * @param connection - official Connection Host service, when composed.
 * @returns the owner Peer factory.
 */
export function createOwnerPeerFactory(ctx, constructor, connection) {
    return () => {
        if (constructor !== undefined) {
            try {
                return new constructor(ctx, { principal: { kind: 'owner' }, interactions: 'answer' });
            }
            catch {
                // Fall through to the Connection Host service below.
            }
        }
        const createPeer = connection?.createPeer;
        if (typeof createPeer !== 'function')
            return undefined;
        try {
            return createPeer.call(connection, { principal: { kind: 'owner' }, interactions: 'answer' });
        }
        catch {
            return undefined;
        }
    };
}
//# sourceMappingURL=owner-peer.js.map
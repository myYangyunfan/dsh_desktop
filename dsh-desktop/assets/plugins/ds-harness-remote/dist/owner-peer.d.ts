/**
 * Owner Peer resolution for the Remote Host carrier.
 *
 * Harness 0.2.2 dereferences the calling Peer for every local Gateway stream
 * (`peer.signal`, `peer.principal`, `peer.interactions`) and rejects forwarded
 * event opens without a live Peer. The plugin therefore always attaches one to
 * its local carrier, preferring the official `Peer` export and falling back to
 * the Connection Host service when a build's module shape no longer exposes it.
 */
/** Structural owner Peer used by the switch and per-connection bridges. */
export interface OwnerPeerLike {
    dispose?(): unknown;
}
/** Official Connection Host face that can mint in-process owner Peers. */
export interface OwnerPeerServiceLike {
    createPeer?(options: {
        principal: {
            kind: 'owner';
        };
        interactions?: 'answer' | 'none';
    }): OwnerPeerLike;
}
/** One official `Peer` constructor, or a compatible predecessor export. */
export type OwnerPeerConstructor = new (ctx: unknown, options: {
    principal: {
        kind: 'owner';
    };
    interactions?: 'answer' | 'none';
}) => OwnerPeerLike;
/**
 * Select the official `Peer` export of the installed Connection package.
 * @param connectionExports - module namespace of `@deepseek-ai/dsh-client-connection`.
 * @returns the constructor, or undefined when this build exposes neither name.
 */
export declare function ownerPeerConstructor(connectionExports: Record<string, unknown>): OwnerPeerConstructor | undefined;
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
export declare function createOwnerPeerFactory(ctx: unknown, constructor: OwnerPeerConstructor | undefined, connection: OwnerPeerServiceLike | undefined): () => OwnerPeerLike | undefined;
//# sourceMappingURL=owner-peer.d.ts.map
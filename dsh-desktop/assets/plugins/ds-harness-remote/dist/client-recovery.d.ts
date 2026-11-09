import type { RemoteStatus } from './client/types.js';
import type { StatusFeed } from './status-stream.js';
/** Reopen native read subscriptions after a fresh authenticated carrier is ready. */
export declare function subscribeRemoteRecovery(feed: StatusFeed<RemoteStatus>, reconnect: () => void): () => void;
//# sourceMappingURL=client-recovery.d.ts.map
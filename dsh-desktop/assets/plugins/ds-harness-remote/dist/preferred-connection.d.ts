import type { AdaptiveTransport, AdaptiveTransportOptions } from '@dsh-remote/webrtc';
type Attempt = 'direct' | 'turn' | 'relay';
/** Prepare data paths only. The caller starts Noise once, on the winner. */
export declare function connectPreferredTransport(create: (attempt: Attempt, hooks: Partial<AdaptiveTransportOptions>) => AdaptiveTransport, signal?: AbortSignal): Promise<AdaptiveTransport>;
export {};
//# sourceMappingURL=preferred-connection.d.ts.map
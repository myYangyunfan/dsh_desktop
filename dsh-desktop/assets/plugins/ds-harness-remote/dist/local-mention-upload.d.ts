import type { RemoteTypertGatewayTarget } from './typert-gateway-contract.js';
/** Stage client-local absolute @file mentions before the prompt crosses to a different Host. */
export declare function uploadLocalMentions(payload: unknown, remote: RemoteTypertGatewayTarget, signal: AbortSignal, platform?: NodeJS.Platform, fileIO?: Pick<typeof import('node:fs/promises'), 'lstat' | 'readFile'>): Promise<unknown>;
//# sourceMappingURL=local-mention-upload.d.ts.map
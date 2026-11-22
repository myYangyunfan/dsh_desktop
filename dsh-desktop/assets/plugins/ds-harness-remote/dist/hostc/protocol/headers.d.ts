import type { HeaderList } from "./messages.js";
/**
 * Drops hop-by-hop headers, headers named by the Connection header,
 * and any names in `drop` (lowercase).
 */
export declare function stripHopByHop(headers: HeaderList, drop?: Iterable<string>): HeaderList;
export declare function stripWebSocketHandshake(headers: HeaderList): HeaderList;
//# sourceMappingURL=headers.d.ts.map
import type { HeaderList } from "./protocol/index.js";
/**
 * Makes a public request look like it was made to the local server directly,
 * so dev servers that check Host or Origin (Vite, Next.js) accept it.
 */
export declare function toLocalRequestHeaders(headers: HeaderList, publicOrigin: string, target: URL): HeaderList;
/** Points redirects at the local server back at the public URL. */
export declare function toPublicResponseHeaders(headers: HeaderList, publicOrigin: string, target: URL): HeaderList;
/** Node's rawHeaders format: `[name, value, name, value, ...]`. */
export declare function fromRawHeaders(raw: string[]): HeaderList;
export declare function toRawHeaders(headers: HeaderList): string[];
//# sourceMappingURL=rewrite.d.ts.map
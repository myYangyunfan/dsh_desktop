import WebSocket from 'ws';
/**
 * Host control / Relay data sockets for the Plugin Host process (#353).
 *
 * Scope: `HostServerConnection` only. `dsh web` replaces the process-global
 * `WebSocket` with an implementation that attaches `Origin` from the Harness
 * page. Self-hosted Servers compare that header to `DSH_SERVER_PUBLIC_URL` and
 * reject mismatches (`origin_mismatch` → Host stays offline).
 *
 * The bundled `ws` client omits `Origin` unless `origin` is set. Browser Remote
 * clients and AdaptiveTransport / RelayTransport keep the global `WebSocket`
 * (browsers must send Origin). Plugin Client mode in `dsh web` is out of scope
 * for this fix and needs its own justification and coverage if required later.
 */
export declare function createNodeWebSocket(url: string): WebSocket;
//# sourceMappingURL=node-websocket.d.ts.map
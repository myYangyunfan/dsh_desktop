export type TunnelErrorCode = "upgrade_required" | "rate_limited" | "tunnel_gone" | "replaced" | "unauthorized" | "server_error" | "network_error";
export declare class TunnelError extends Error {
    name: string;
    readonly code: TunnelErrorCode;
    constructor(code: TunnelErrorCode, message: string, options?: ErrorOptions);
}
export declare const PROTOCOL_HEADERS: {
    "hostc-protocol": string;
};
export declare function errorFromResponse(status: number, text: string): TunnelError;
//# sourceMappingURL=api.d.ts.map
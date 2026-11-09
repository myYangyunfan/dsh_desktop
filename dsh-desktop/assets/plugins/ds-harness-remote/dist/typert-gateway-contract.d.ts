export interface TypertGatewayRequest {
    namespace: string;
    method: string;
    /** Typert Remote payloads require one plain object under `args`. */
    args: Readonly<Record<string, unknown>>;
    signal?: AbortSignal;
    peer?: unknown;
    uplink?: AsyncIterable<unknown>;
}
export type TypertRpcResult = {
    ok: true;
    value?: unknown;
    attachments?: readonly {
        path: readonly (string | number)[];
        bytes: Uint8Array;
    }[];
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
    };
};
/** Legacy carrier open (≤0.1.6): the third argument is the cancellation signal. */
export type LegacyWireStreamOpen = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<AsyncIterable<unknown>>;
/**
 * dsh 0.1.7-rc.1 carrier open: the third argument is the Client uplink and the
 * cancellation signal moves to the fifth position. Passing an `AbortSignal` as
 * the third argument makes the Host throw `signals[0] is not of type AbortSignal`.
 */
export type Rc1WireStreamOpen = (endpoint: string, payload: unknown, uplink: AsyncIterable<unknown>, peer: unknown, signal: AbortSignal) => Promise<AsyncIterable<unknown>>;
/** Carrier open signature of the running Harness release. */
export type TypertWireStreamOpen = LegacyWireStreamOpen | Rc1WireStreamOpen;
export interface TypertGatewayWireStreamLike {
    open: TypertWireStreamOpen;
    failure(error: unknown): {
        code: string;
        message: string;
        details: Record<string, unknown>;
    };
}
/** Public Gateway face shared by supported Harness Typert releases. */
export interface TypertGatewayLike {
    invoke(request: TypertGatewayRequest): Promise<unknown>;
    stream?(request: TypertGatewayRequest): Promise<AsyncIterable<unknown>>;
    wireStream?: TypertGatewayWireStreamLike;
}
/** Carrier-level face captured from the alpha Gateway before target switching. */
export interface LocalTypertGateway extends TypertGatewayLike {
    dispatch(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult>;
    open(endpoint: string, payload: unknown, signal: AbortSignal, uplink?: AsyncIterable<unknown>): Promise<AsyncIterable<unknown>>;
    failure(error: unknown): {
        code: string;
        message: string;
        details: Record<string, unknown>;
    };
    supportsCarrier: boolean;
    peer?: unknown;
    createPeer?(): LocalTypertGateway;
    dispose?(): Promise<void>;
}
export interface RemoteTypertGatewayTarget {
    invoke(request: TypertGatewayRequest): Promise<unknown>;
    dispatch(endpoint: string, payload: unknown, signal: AbortSignal): Promise<TypertRpcResult>;
    open(endpoint: string, payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
}
//# sourceMappingURL=typert-gateway-contract.d.ts.map
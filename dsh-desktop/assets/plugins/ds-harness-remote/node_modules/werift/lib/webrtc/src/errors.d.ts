export type WebRtcDomExceptionName = "InvalidAccessError" | "InvalidModificationError" | "InvalidStateError" | "NotSupportedError" | "OperationError";
export declare function createWebRtcDomException(name: WebRtcDomExceptionName, message?: string): DOMException;
export declare function createWebRtcTypeError(message: string): TypeError;

import type { Context } from "./context/context";
export type SessionKeys = {
    localMasterKey: Buffer;
    localMasterSalt: Buffer;
    remoteMasterKey: Buffer;
    remoteMasterSalt: Buffer;
};
export type Config = {
    keys: SessionKeys;
    profile: number;
};
export declare class Session<T extends Context> {
    private ContextCls;
    localContext: T;
    remoteContext: T;
    onData?: (buf: Buffer) => void;
    constructor(ContextCls: any);
    start(localMasterKey: Buffer, localMasterSalt: Buffer, remoteMasterKey: Buffer, remoteMasterSalt: Buffer, profile: number): void;
}

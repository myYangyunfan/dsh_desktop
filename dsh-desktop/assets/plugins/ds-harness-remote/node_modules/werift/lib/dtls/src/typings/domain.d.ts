import type { HandshakeType } from "../handshake/const";
import type { FragmentedHandshake } from "../record/message/fragment";
export type Version = {
    major: number;
    minor: number;
};
export type Random = {
    gmt_unix_time: number;
    random_bytes: Buffer;
};
export type Handshake = {
    msgType: HandshakeType;
    messageSeq?: number;
    serialize: () => Buffer;
    toFragment: () => FragmentedHandshake;
};
export type Extension = {
    type: number;
    data: Buffer;
};

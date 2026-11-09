import type { CipherContext } from "../context/cipher";
import type { DtlsContext } from "../context/dtls";
import { ContentType } from "./const";
import { DtlsPlaintext } from "./message/plaintext";
export declare const parsePacket: (data: Buffer) => DtlsPlaintext[];
export declare const parsePlainText: (dtls: DtlsContext, cipher: CipherContext) => (plain: DtlsPlaintext) => {
    type: ContentType;
    data: any;
}[];

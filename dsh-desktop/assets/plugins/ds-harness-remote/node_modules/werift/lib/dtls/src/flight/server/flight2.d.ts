import type { CipherContext } from "../../context/cipher";
import type { DtlsContext } from "../../context/dtls";
import { SrtpContext } from "../../context/srtp";
import type { TransportContext } from "../../context/transport";
import type { ClientHello } from "../../handshake/message/client/hello";
export declare const flight2: (udp: TransportContext, dtls: DtlsContext, cipher: CipherContext, srtp: SrtpContext) => (clientHello: ClientHello) => void;

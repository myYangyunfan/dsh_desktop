import type { DtlsContext } from "../context/dtls";
import type { TransportContext } from "../context/transport";
import type { Handshake } from "../typings/domain";
declare const flightTypes: readonly ["PREPARING", "SENDING", "WAITING", "FINISHED"];
type FlightType = (typeof flightTypes)[number];
export declare abstract class Flight {
    private transport;
    dtls: DtlsContext;
    private flight;
    private nextFlight?;
    state: FlightType;
    static RetransmitCount: number;
    constructor(transport: TransportContext, dtls: DtlsContext, flight: number, nextFlight?: number | undefined);
    protected createPacket(handshakes: Handshake[]): import("../record/message/plaintext").DtlsPlaintext[];
    protected transmit(buffers: Buffer[]): Promise<void>;
    protected send: (buf: Buffer[]) => Promise<void[]>;
    private setState;
}
export {};

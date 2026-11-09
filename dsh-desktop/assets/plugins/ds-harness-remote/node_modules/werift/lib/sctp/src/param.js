"use strict";
// This parameter is used by the sender to request the reset of some or
// all outgoing streams.
//  0                   1                   2                   3
//  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |     Parameter Type = 13       | Parameter Length = 16 + 2 * N |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |           Re-configuration Request Sequence Number            |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |           Re-configuration Response Sequence Number           |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |                Sender's Last Assigned TSN                     |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |  Stream Number 1 (optional)   |    Stream Number 2 (optional) |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// /                            ......                             /
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |  Stream Number N-1 (optional) |    Stream Number N (optional) |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECONFIG_PARAM_BY_TYPES = exports.ReconfigResponseParam = exports.reconfigResult = exports.StreamAddOutgoingParam = exports.OutgoingSSNResetRequestParam = void 0;
class OutgoingSSNResetRequestParam {
    constructor(requestSequence, responseSequence, lastTsn, streams) {
        Object.defineProperty(this, "requestSequence", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: requestSequence
        });
        Object.defineProperty(this, "responseSequence", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: responseSequence
        });
        Object.defineProperty(this, "lastTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: lastTsn
        });
        Object.defineProperty(this, "streams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: streams
        });
    }
    get type() {
        return OutgoingSSNResetRequestParam.type;
    }
    get bytes() {
        // !LLL — requestSequence / responseSequence / lastTsn (big-endian uint32)
        const data = Buffer.allocUnsafe(12);
        data.writeUInt32BE(this.requestSequence, 0);
        data.writeUInt32BE(this.responseSequence, 4);
        data.writeUInt32BE(this.lastTsn, 8);
        return Buffer.concat([
            data,
            ...this.streams.map((stream) => {
                const buf = Buffer.allocUnsafe(2);
                buf.writeUInt16BE(stream, 0);
                return buf;
            }),
        ]);
    }
    static parse(data) {
        const requestSequence = data.readUInt32BE(0);
        const responseSequence = data.readUInt32BE(4);
        const lastTsn = data.readUInt32BE(8);
        const stream = [];
        for (let pos = 12; pos < data.length; pos += 2) {
            stream.push(data.readUInt16BE(pos));
        }
        return new OutgoingSSNResetRequestParam(requestSequence, responseSequence, lastTsn, stream);
    }
}
exports.OutgoingSSNResetRequestParam = OutgoingSSNResetRequestParam;
Object.defineProperty(OutgoingSSNResetRequestParam, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 13
}); // Outgoing SSN Reset Request Parameter
class StreamAddOutgoingParam {
    constructor(requestSequence, newStreams) {
        Object.defineProperty(this, "requestSequence", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: requestSequence
        });
        Object.defineProperty(this, "newStreams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: newStreams
        });
    }
    get type() {
        return StreamAddOutgoingParam.type;
    }
    get bytes() {
        // !LHH — requestSequence / newStreams / reserved
        const buf = Buffer.allocUnsafe(8);
        buf.writeUInt32BE(this.requestSequence, 0);
        buf.writeUInt16BE(this.newStreams, 4);
        buf.writeUInt16BE(0, 6);
        return buf;
    }
    static parse(data) {
        const requestSequence = data.readUInt32BE(0);
        const newStreams = data.readUInt16BE(4);
        return new StreamAddOutgoingParam(requestSequence, newStreams);
    }
}
exports.StreamAddOutgoingParam = StreamAddOutgoingParam;
Object.defineProperty(StreamAddOutgoingParam, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 17
}); // Add Outgoing Streams Request Parameter
// This parameter is used by the receiver of a Re-configuration Request
// Parameter to respond to the request.
//
// 0                   1                   2                   3
// 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |     Parameter Type = 16       |      Parameter Length         |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |         Re-configuration Response Sequence Number             |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |                            Result                             |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |                   Sender's Next TSN (optional)                |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// |                  Receiver's Next TSN (optional)               |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
exports.reconfigResult = {
    ReconfigResultSuccessPerformed: 1,
    BadSequenceNumber: 5,
};
class ReconfigResponseParam {
    constructor(responseSequence, result) {
        Object.defineProperty(this, "responseSequence", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: responseSequence
        });
        Object.defineProperty(this, "result", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: result
        });
    }
    get type() {
        return ReconfigResponseParam.type;
    }
    get bytes() {
        // !LL — responseSequence / result
        const buf = Buffer.allocUnsafe(8);
        buf.writeUInt32BE(this.responseSequence, 0);
        buf.writeUInt32BE(this.result, 4);
        return buf;
    }
    static parse(data) {
        const requestSequence = data.readUInt32BE(0);
        const result = data.readUInt32BE(4);
        return new ReconfigResponseParam(requestSequence, result);
    }
}
exports.ReconfigResponseParam = ReconfigResponseParam;
Object.defineProperty(ReconfigResponseParam, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 16
}); // Re-configuration Response Parameter
exports.RECONFIG_PARAM_BY_TYPES = {
    13: OutgoingSSNResetRequestParam, // Outgoing SSN Reset Request Parameter
    16: ReconfigResponseParam, // Re-configuration Response Parameter
    17: StreamAddOutgoingParam, // Add Outgoing Streams Request Parameter
};
//# sourceMappingURL=param.js.map
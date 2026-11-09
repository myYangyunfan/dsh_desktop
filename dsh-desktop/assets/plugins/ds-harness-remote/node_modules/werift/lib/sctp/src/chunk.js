"use strict";
// ID Value    Chunk Type
// -----       ----------
// 0          - Payload Data (DATA)
// 1          - Initiation (INIT)
// 2          - Initiation Acknowledgement (INIT ACK)
// 3          - Selective Acknowledgement (SACK)
// 4          - Heartbeat Request (HEARTBEAT)
// 5          - Heartbeat Acknowledgement (HEARTBEAT ACK)
// 6          - Abort (ABORT)
// 7          - Shutdown (SHUTDOWN)
// 8          - Shutdown Acknowledgement (SHUTDOWN ACK)
// 9          - Operation Error (ERROR)
// 10         - State Cookie (COOKIE ECHO)
// 11         - Cookie Acknowledgement (COOKIE ACK)
// 12         - Reserved for Explicit Congestion Notification Echo
//              (ECNE)
// 13         - Reserved for Congestion Window Reduced (CWR)
// 14         - Shutdown Complete (SHUTDOWN COMPLETE)
// 15 to 62   - available
// 63         - reserved for IETF-defined Chunk Extensions
// 64 to 126  - available
// 127        - reserved for IETF-defined Chunk Extensions
// 128 to 190 - available
// 191        - reserved for IETF-defined Chunk Extensions
// 192 to 254 - available
// 255        - reserved for IETF-defined Chunk Extensions
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHUNK_BY_TYPE = exports.ShutdownCompleteChunk = exports.ShutdownAckChunk = exports.ShutdownChunk = exports.SackChunk = exports.ReconfigChunk = exports.HeartbeatAckChunk = exports.HeartbeatChunk = exports.ErrorChunk = exports.AbortChunk = exports.BaseParamsChunk = exports.CookieAckChunk = exports.CookieEchoChunk = exports.DataChunk = exports.ForwardTsnChunk = exports.ReConfigChunk = exports.InitAckChunk = exports.InitChunk = exports.BaseInitChunk = exports.Chunk = void 0;
exports.decodeParams = decodeParams;
exports.parsePacket = parsePacket;
exports.serializePacket = serializePacket;
const common_1 = require("./imports/common");
class Chunk {
    get body() {
        return this._body;
    }
    set body(value) {
        this._body = value;
    }
    constructor(flags = 0, _body = Buffer.from("")) {
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flags
        });
        Object.defineProperty(this, "_body", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: _body
        });
    }
    get type() {
        return Chunk.type;
    }
    get bytes() {
        if (!this.body)
            throw new Error();
        const header = Buffer.alloc(4);
        header.writeUInt8(this.type, 0);
        header.writeUInt8(this.flags, 1);
        header.writeUInt16BE(this.body.length + 4, 2);
        const data = Buffer.concat([
            header,
            this.body,
            ...[...Array(padL(this.body.length))].map(() => Buffer.from("\x00")),
        ]);
        return data;
    }
}
exports.Chunk = Chunk;
Object.defineProperty(Chunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -1
});
class BaseInitChunk extends Chunk {
    constructor(flags = 0, body) {
        super(flags, body);
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flags
        });
        Object.defineProperty(this, "initiateTag", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "advertisedRwnd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "outboundStreams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "inboundStreams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "initialTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "params", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        if (body) {
            this.initiateTag = body.readUInt32BE(0);
            this.advertisedRwnd = body.readUInt32BE(4);
            this.outboundStreams = body.readUInt16BE(8);
            this.inboundStreams = body.readUInt16BE(10);
            this.initialTsn = body.readUInt32BE(12);
            this.params = decodeParams(body.slice(16));
        }
        else {
            this.initiateTag = 0;
            this.advertisedRwnd = 0;
            this.outboundStreams = 0;
            this.inboundStreams = 0;
            this.initialTsn = 0;
            this.params = [];
        }
    }
    get body() {
        const body = Buffer.alloc(16);
        body.writeUInt32BE(this.initiateTag, 0);
        body.writeUInt32BE(this.advertisedRwnd, 4);
        body.writeUInt16BE(this.outboundStreams, 8);
        body.writeUInt16BE(this.inboundStreams, 10);
        body.writeUInt32BE(this.initialTsn, 12);
        return Buffer.concat([body, encodeParams(this.params)]);
    }
}
exports.BaseInitChunk = BaseInitChunk;
class InitChunk extends BaseInitChunk {
    get type() {
        return InitChunk.type;
    }
}
exports.InitChunk = InitChunk;
Object.defineProperty(InitChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 1
});
class InitAckChunk extends BaseInitChunk {
    get type() {
        return InitAckChunk.type;
    }
}
exports.InitAckChunk = InitAckChunk;
Object.defineProperty(InitAckChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 2
});
class ReConfigChunk extends BaseInitChunk {
    get type() {
        return ReConfigChunk.type;
    }
}
exports.ReConfigChunk = ReConfigChunk;
Object.defineProperty(ReConfigChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 130
});
class ForwardTsnChunk extends Chunk {
    constructor(flags = 0, body) {
        super(flags, body);
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flags
        });
        Object.defineProperty(this, "streams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "cumulativeTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        if (body) {
            this.cumulativeTsn = body.readUInt32BE(0);
            let pos = 4;
            while (pos < body.length) {
                this.streams.push([body.readUInt16BE(pos), body.readUInt16BE(pos + 2)]);
                pos += 4;
            }
        }
        else {
            this.cumulativeTsn = 0;
        }
    }
    get type() {
        return ForwardTsnChunk.type;
    }
    set body(_) { }
    get body() {
        const body = Buffer.alloc(4);
        body.writeUInt32BE(this.cumulativeTsn, 0);
        return Buffer.concat([
            body,
            ...this.streams.map(([id, seq]) => {
                const streamBuffer = Buffer.alloc(4);
                streamBuffer.writeUInt16BE(id, 0);
                streamBuffer.writeUInt16BE(seq, 2);
                return streamBuffer;
            }),
        ]);
    }
}
exports.ForwardTsnChunk = ForwardTsnChunk;
Object.defineProperty(ForwardTsnChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 192
});
class DataChunk extends Chunk {
    get type() {
        return DataChunk.type;
    }
    constructor(flags = 0, body) {
        super(flags, body);
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flags
        });
        Object.defineProperty(this, "tsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "streamId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "streamSeqNum", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "protocol", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "userData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Buffer.from("")
        });
        Object.defineProperty(this, "abandoned", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "acked", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "misses", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "retransmit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "sentCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "bookSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "expiry", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxRetransmits", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sentTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        if (body) {
            this.tsn = body.readUInt32BE(0);
            this.streamId = body.readUInt16BE(4);
            this.streamSeqNum = body.readUInt16BE(6);
            this.protocol = body.readUInt32BE(8);
            this.userData = body.slice(12);
        }
    }
    get bytes() {
        const length = 16 + this.userData.length;
        const header = Buffer.alloc(16);
        header.writeUInt8(this.type, 0);
        header.writeUInt8(this.flags, 1);
        header.writeUInt16BE(length, 2);
        header.writeUInt32BE(this.tsn, 4);
        header.writeUInt16BE(this.streamId, 8);
        header.writeUInt16BE(this.streamSeqNum, 10);
        header.writeUInt32BE(this.protocol, 12);
        let data = Buffer.concat([header, this.userData]);
        if (length % 4) {
            data = Buffer.concat([
                data,
                ...[...Array(padL(length))].map(() => Buffer.from("\x00")),
            ]);
        }
        return data;
    }
}
exports.DataChunk = DataChunk;
Object.defineProperty(DataChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 0
});
class CookieEchoChunk extends Chunk {
    get type() {
        return CookieEchoChunk.type;
    }
}
exports.CookieEchoChunk = CookieEchoChunk;
Object.defineProperty(CookieEchoChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 10
});
class CookieAckChunk extends Chunk {
    get type() {
        return CookieAckChunk.type;
    }
}
exports.CookieAckChunk = CookieAckChunk;
Object.defineProperty(CookieAckChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 11
});
class BaseParamsChunk extends Chunk {
    constructor(flags = 0, body = undefined) {
        super(flags, body);
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flags
        });
        Object.defineProperty(this, "params", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        if (body) {
            this.params = decodeParams(body);
        }
    }
    get body() {
        return encodeParams(this.params);
    }
}
exports.BaseParamsChunk = BaseParamsChunk;
class AbortChunk extends BaseParamsChunk {
    get type() {
        return AbortChunk.type;
    }
}
exports.AbortChunk = AbortChunk;
Object.defineProperty(AbortChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 6
});
class ErrorChunk extends BaseParamsChunk {
    get type() {
        return ErrorChunk.type;
    }
    get descriptions() {
        return this.params.map(([code, body]) => {
            const name = (Object.entries(ErrorChunk.CODE).find(([, num]) => num === code) || [])[0];
            return { name, body };
        });
    }
}
exports.ErrorChunk = ErrorChunk;
Object.defineProperty(ErrorChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 9
});
Object.defineProperty(ErrorChunk, "CODE", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        InvalidStreamIdentifier: 1,
        MissingMandatoryParameter: 2,
        StaleCookieError: 3,
        OutofResource: 4,
        UnresolvableAddress: 5,
        UnrecognizedChunkType: 6,
        InvalidMandatoryParameter: 7,
        UnrecognizedParameters: 8,
        NoUserData: 9,
        CookieReceivedWhileShuttingDown: 10,
        RestartofanAssociationwithNewAddresses: 11,
        UserInitiatedAbort: 12,
        ProtocolViolation: 13,
    }
});
class HeartbeatChunk extends BaseParamsChunk {
    get type() {
        return HeartbeatChunk.type;
    }
}
exports.HeartbeatChunk = HeartbeatChunk;
Object.defineProperty(HeartbeatChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4
});
class HeartbeatAckChunk extends BaseParamsChunk {
    get type() {
        return HeartbeatAckChunk.type;
    }
}
exports.HeartbeatAckChunk = HeartbeatAckChunk;
Object.defineProperty(HeartbeatAckChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 5
});
// https://tools.ietf.org/html/rfc6525#section-3.1
// chunkReconfig represents an SCTP Chunk used to reconfigure streams.
//
//  0                   1                   2                   3
//  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// | Type = 130    |  Chunk Flags  |      Chunk Length             |
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// \                                                               \
// /                  Re-configuration Parameter                   /
// \                                                               \
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
// \                                                               \
// /             Re-configuration Parameter (optional)             /
// \                                                               \
// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
class ReconfigChunk extends BaseParamsChunk {
    get type() {
        return ReconfigChunk.type;
    }
}
exports.ReconfigChunk = ReconfigChunk;
Object.defineProperty(ReconfigChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 130
});
class SackChunk extends Chunk {
    get type() {
        return SackChunk.type;
    }
    constructor(flags = 0, body) {
        super(flags, body);
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flags
        });
        Object.defineProperty(this, "gaps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "duplicates", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "cumulativeTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "advertisedRwnd", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        if (body) {
            this.cumulativeTsn = body.readUInt32BE(0);
            this.advertisedRwnd = body.readUInt32BE(4);
            const nbGaps = body.readUInt16BE(8);
            const nbDuplicates = body.readUInt16BE(10);
            let pos = 12;
            [...Array(nbGaps)].forEach(() => {
                this.gaps.push([body.readUInt16BE(pos), body.readUInt16BE(pos + 2)]);
                pos += 4;
            });
            [...Array(nbDuplicates)].forEach(() => {
                this.duplicates.push(body.readUInt32BE(pos));
                pos += 4;
            });
        }
    }
    get bytes() {
        const length = 16 + 4 * (this.gaps.length + this.duplicates.length);
        const header = Buffer.alloc(16);
        header.writeUInt8(this.type, 0);
        header.writeUInt8(this.flags, 1);
        header.writeUInt16BE(length, 2);
        header.writeUInt32BE(this.cumulativeTsn, 4);
        header.writeUInt32BE(this.advertisedRwnd, 8);
        header.writeUInt16BE(this.gaps.length, 12);
        header.writeUInt16BE(this.duplicates.length, 14);
        let data = Buffer.concat([
            header,
            ...this.gaps.map((gap) => {
                const gapBuffer = Buffer.alloc(4);
                gapBuffer.writeUInt16BE(gap[0], 0);
                gapBuffer.writeUInt16BE(gap[1], 2);
                return gapBuffer;
            }),
        ]);
        data = Buffer.concat([
            data,
            ...this.duplicates.map((tsn) => {
                const tsnBuffer = Buffer.alloc(4);
                tsnBuffer.writeUInt32BE(tsn, 0);
                return tsnBuffer;
            }),
        ]);
        return data;
    }
}
exports.SackChunk = SackChunk;
Object.defineProperty(SackChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 3
});
class ShutdownChunk extends Chunk {
    get type() {
        return ShutdownChunk.type;
    }
    constructor(flags = 0, body) {
        super(flags, body);
        Object.defineProperty(this, "flags", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flags
        });
        Object.defineProperty(this, "cumulativeTsn", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        if (body) {
            this.cumulativeTsn = body.readUInt32BE(0);
        }
    }
    get body() {
        const body = Buffer.alloc(4);
        body.writeUInt32BE(this.cumulativeTsn, 0);
        return body;
    }
}
exports.ShutdownChunk = ShutdownChunk;
Object.defineProperty(ShutdownChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 7
});
class ShutdownAckChunk extends Chunk {
    get type() {
        return ShutdownAckChunk.type;
    }
}
exports.ShutdownAckChunk = ShutdownAckChunk;
Object.defineProperty(ShutdownAckChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 8
});
class ShutdownCompleteChunk extends Chunk {
    get type() {
        return ShutdownCompleteChunk.type;
    }
}
exports.ShutdownCompleteChunk = ShutdownCompleteChunk;
Object.defineProperty(ShutdownCompleteChunk, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 14
});
const CHUNK_CLASSES = [
    DataChunk,
    InitChunk,
    InitAckChunk,
    SackChunk,
    HeartbeatChunk,
    HeartbeatAckChunk,
    AbortChunk,
    ShutdownChunk,
    ShutdownAckChunk,
    ErrorChunk,
    CookieEchoChunk,
    CookieAckChunk,
    ShutdownCompleteChunk,
    ReconfigChunk,
    ForwardTsnChunk,
];
exports.CHUNK_BY_TYPE = CHUNK_CLASSES.reduce((acc, cur) => {
    acc[cur.type] = cur;
    return acc;
}, {});
function padL(l) {
    const m = l % 4;
    return m ? 4 - m : 0;
}
function encodeParams(params) {
    let body = Buffer.from("");
    let padding = Buffer.from("");
    params.forEach(([type, value]) => {
        const length = value.length + 4;
        const paramHeader = Buffer.alloc(4);
        paramHeader.writeUInt16BE(type, 0);
        paramHeader.writeUInt16BE(length, 2);
        body = Buffer.concat([body, padding, paramHeader, value]);
        padding = Buffer.concat([...Array(padL(length))].map(() => Buffer.from("\x00")));
    });
    return body;
}
function decodeParams(body) {
    const params = [];
    let pos = 0;
    while (pos <= body.length - 4) {
        const type = body.readUInt16BE(pos);
        const length = body.readUInt16BE(pos + 2);
        params.push([type, body.slice(pos + 4, pos + length)]);
        pos += length + padL(length);
    }
    return params;
}
function parsePacket(data) {
    if (data.length < 12)
        throw new Error("SCTP packet length is less than 12 bytes");
    const sourcePort = data.readUInt16BE(0);
    const destinationPort = data.readUInt16BE(2);
    const verificationTag = data.readUInt32BE(4);
    const checkSum = data.readUInt32LE(8);
    const expect = (0, common_1.crc32c)(Buffer.concat([
        data.slice(0, 8),
        Buffer.from("\x00\x00\x00\x00"),
        data.slice(12),
    ]));
    if (checkSum !== expect)
        throw new Error("SCTP packet has invalid checksum");
    const chunks = [];
    let pos = 12;
    while (pos + 4 <= data.length) {
        const chunkType = data.readUInt8(pos);
        const chunkFlags = data.readUInt8(pos + 1);
        const chunkLength = data.readUInt16BE(pos + 2);
        const chunkBody = data.slice(pos + 4, pos + chunkLength);
        const ChunkClass = exports.CHUNK_BY_TYPE[chunkType.toString()];
        if (ChunkClass) {
            chunks.push(new ChunkClass(chunkFlags, chunkBody));
        }
        else {
            throw new Error("unknown");
        }
        pos += chunkLength + padL(chunkLength);
    }
    return [sourcePort, destinationPort, verificationTag, chunks];
}
function serializePacket(sourcePort, destinationPort, verificationTag, chunk) {
    const header = Buffer.alloc(8);
    header.writeUInt16BE(sourcePort, 0);
    header.writeUInt16BE(destinationPort, 2);
    header.writeUInt32BE(verificationTag, 4);
    const body = chunk.bytes;
    const checksum = (0, common_1.crc32c)(Buffer.concat([header, Buffer.from("\x00\x00\x00\x00"), body]));
    const checkSumBuf = Buffer.alloc(4);
    checkSumBuf.writeUInt32LE(checksum, 0);
    const packet = Buffer.concat([header, checkSumBuf, body]);
    return packet;
}
//# sourceMappingURL=chunk.js.map
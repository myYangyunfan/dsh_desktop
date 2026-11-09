"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MACHeader = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const binary_1 = require("../../handshake/binary");
class MACHeader {
    constructor(epoch, sequenceNumber, contentType, protocolVersion, contentLen) {
        Object.defineProperty(this, "epoch", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: epoch
        });
        Object.defineProperty(this, "sequenceNumber", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sequenceNumber
        });
        Object.defineProperty(this, "contentType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: contentType
        });
        Object.defineProperty(this, "protocolVersion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: protocolVersion
        });
        Object.defineProperty(this, "contentLen", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: contentLen
        });
    }
    static createEmpty() {
        return new MACHeader(undefined, undefined, undefined, undefined, undefined);
    }
    static deSerialize(buf) {
        return new MACHeader(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, MACHeader.spec)));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, MACHeader.spec).slice();
        return Buffer.from(res);
    }
}
exports.MACHeader = MACHeader;
Object.defineProperty(MACHeader, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        epoch: binary_data_1.types.uint16be,
        sequenceNumber: binary_data_1.types.uint48be,
        contentType: binary_data_1.types.uint8,
        protocolVersion: binary_1.ProtocolVersion,
        contentLen: binary_data_1.types.uint16be,
    }
});
//# sourceMappingURL=header.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtlsRandom = void 0;
const crypto_1 = require("crypto");
/* eslint-disable @typescript-eslint/ban-ts-comment */
const binary_data_1 = require("@shinyoshiaki/binary-data");
class DtlsRandom {
    constructor(gmt_unix_time = Math.floor(Date.now() / 1000), random_bytes = (0, crypto_1.randomBytes)(28)) {
        Object.defineProperty(this, "gmt_unix_time", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: gmt_unix_time
        });
        Object.defineProperty(this, "random_bytes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: random_bytes
        });
    }
    static deSerialize(buf) {
        return new DtlsRandom(
        //@ts-ignore
        ...Object.values((0, binary_data_1.decode)(buf, DtlsRandom.spec)));
    }
    static from(spec) {
        //@ts-ignore
        return new DtlsRandom(...Object.values(spec));
    }
    serialize() {
        const res = (0, binary_data_1.encode)(this, DtlsRandom.spec).slice();
        return Buffer.from(res);
    }
}
exports.DtlsRandom = DtlsRandom;
Object.defineProperty(DtlsRandom, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        gmt_unix_time: binary_data_1.types.uint32be,
        random_bytes: binary_data_1.types.buffer(28),
    }
});
//# sourceMappingURL=random.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UseSRTP = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
class UseSRTP {
    constructor(props = {}) {
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: UseSRTP.type
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Buffer.from([])
        });
        Object.defineProperty(this, "profiles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "mki", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: Buffer.from([0x00])
        });
        Object.assign(this, props);
    }
    static create(profiles, mki) {
        const v = new UseSRTP({
            profiles,
            mki,
        });
        return v;
    }
    static deSerialize(buf) {
        const useSrtp = new UseSRTP((0, binary_data_1.decode)(buf, UseSRTP.spec));
        const profileLength = useSrtp.data.readUInt16BE();
        const profiles = new Array(profileLength / 2);
        for (let i = 0; i < profiles.length; i++) {
            profiles[i] = useSrtp.data.readUInt16BE(i * 2 + 2);
        }
        useSrtp.profiles = profiles;
        useSrtp.mki = useSrtp.data.slice(profileLength + 2);
        return useSrtp;
    }
    serialize() {
        const profileLength = Buffer.alloc(2);
        profileLength.writeUInt16BE(this.profiles.length * 2);
        const data = Buffer.concat([
            profileLength,
            ...this.profiles.map((profile) => {
                const buf = Buffer.alloc(2);
                buf.writeUInt16BE(profile);
                return buf;
            }),
            this.mki,
        ]);
        this.data = data;
        const res = (0, binary_data_1.encode)(this, UseSRTP.spec).slice();
        return Buffer.from(res);
    }
    static fromData(buf) {
        const head = Buffer.alloc(4);
        head.writeUInt16BE(UseSRTP.type);
        head.writeUInt16BE(buf.length, 2);
        return UseSRTP.deSerialize(Buffer.concat([head, buf]));
    }
    get extension() {
        return {
            type: this.type,
            data: this.serialize().slice(4),
        };
    }
}
exports.UseSRTP = UseSRTP;
Object.defineProperty(UseSRTP, "type", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 14
}); // 9.  IANA Considerations
Object.defineProperty(UseSRTP, "spec", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        type: binary_data_1.types.uint16be,
        data: binary_data_1.types.buffer(binary_data_1.types.uint16be),
    }
});
//# sourceMappingURL=useSrtp.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saltLength = exports.keyLength = exports.Profiles = exports.ProtectionProfileAeadAes128Gcm = exports.ProtectionProfileAes128CmHmacSha1_80 = void 0;
exports.ProtectionProfileAes128CmHmacSha1_80 = 0x0001;
exports.ProtectionProfileAeadAes128Gcm = 0x0007;
exports.Profiles = [
    exports.ProtectionProfileAes128CmHmacSha1_80,
    exports.ProtectionProfileAeadAes128Gcm,
];
const keyLength = (profile) => {
    switch (profile) {
        case exports.ProtectionProfileAes128CmHmacSha1_80:
        case exports.ProtectionProfileAeadAes128Gcm:
            return 16;
    }
};
exports.keyLength = keyLength;
const saltLength = (profile) => {
    switch (profile) {
        case exports.ProtectionProfileAes128CmHmacSha1_80:
            return 14;
        case exports.ProtectionProfileAeadAes128Gcm:
            return 12;
    }
};
exports.saltLength = saltLength;
//# sourceMappingURL=const.js.map
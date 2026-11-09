"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolVersion = exports.SignatureHashAlgorithm = exports.DistinguishedName = exports.ClientCertificateType = exports.ASN11Cert = exports.ExtensionList = void 0;
const binary_data_1 = require("@shinyoshiaki/binary-data");
const { uint16be, uint24be, buffer, array, uint8, string } = binary_data_1.types;
// export const Random = {
//   gmt_unix_time: uint32be,
//   random_bytes: buffer(28),
// };
const Extension = {
    type: uint16be,
    data: buffer(uint16be),
};
exports.ExtensionList = array(Extension, uint16be, "bytes");
exports.ASN11Cert = buffer(uint24be);
exports.ClientCertificateType = uint8;
exports.DistinguishedName = string(uint16be);
exports.SignatureHashAlgorithm = { hash: uint8, signature: uint8 };
exports.ProtocolVersion = { major: uint8, minor: uint8 };
//# sourceMappingURL=binary.js.map
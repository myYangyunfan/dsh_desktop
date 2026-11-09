"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtlsSocket = exports.DtlsServer = exports.DtlsClient = void 0;
__exportStar(require("./context/cipher"), exports);
__exportStar(require("./context/srtp"), exports);
__exportStar(require("./cipher/const"), exports);
var client_1 = require("./client");
Object.defineProperty(exports, "DtlsClient", { enumerable: true, get: function () { return client_1.DtlsClient; } });
var server_1 = require("./server");
Object.defineProperty(exports, "DtlsServer", { enumerable: true, get: function () { return server_1.DtlsServer; } });
var socket_1 = require("./socket");
Object.defineProperty(exports, "DtlsSocket", { enumerable: true, get: function () { return socket_1.DtlsSocket; } });
/* Client                                          Server
   ------                                          ------

   ClientHello             -------->                           Flight 1

                           <-------    HelloVerifyRequest      Flight 2

   ClientHello             -------->                           Flight 3

                                              ServerHello    \
                                             Certificate*     \
                                       ServerKeyExchange*      Flight 4
                                      CertificateRequest*     /
                           <--------      ServerHelloDone    /

   Certificate*                                              \
   ClientKeyExchange                                          \
   CertificateVerify*                                          Flight 5
   [ChangeCipherSpec]                                         /
   Finished                -------->                         /

                                       [ChangeCipherSpec]    \ Flight 6
                           <--------             Finished    /

               Figure 1. Message Flights for Full Handshake

=======================================================================

   Client                                           Server
   ------                                           ------

   ClientHello             -------->                          Flight 1

                                              ServerHello    \
                                       [ChangeCipherSpec]     Flight 2
                            <--------             Finished    /

   [ChangeCipherSpec]                                         \Flight 3
   Finished                 -------->                         /

         Figure 2. Message Flights for Session-Resuming Handshake
                           (No Cookie Exchange)
*/
// enum HandshakeType {
//   hello_request = 0,
//   client_hello = 1,
//   server_hello = 2,
//   hello_verify_request = 3,
//   certificate = 11,
//   server_key_exchange = 12,
//   certificate_request = 13,
//   server_hello_done = 14,
//   certificate_verify = 15,
//   client_key_exchange = 16,
//   finished = 20,
// }
// enum ContentType {
//   changeCipherSpec = 20,
//   alert = 21,
//   handshake = 22,
//   applicationData = 23,
// }
// enum {
//   close_notify(0),
//   unexpected_message(10),
//   bad_record_mac(20),
//   decryption_failed_RESERVED(21),
//   record_overflow(22),
//   decompression_failure(30),
//   handshake_failure(40),
//   no_certificate_RESERVED(41),
//   bad_certificate(42),
//   unsupported_certificate(43),
//   certificate_revoked(44),
//   certificate_expired(45),
//   certificate_unknown(46),
//   illegal_parameter(47),
//   unknown_ca(48),
//   access_denied(49),
//   decode_error(50),
//   decrypt_error(51),
//   export_restriction_RESERVED(60),
//   protocol_version(70),
//   insufficient_security(71),
//   internal_error(80),
//   user_canceled(90),
//   no_renegotiation(100),
//   unsupported_extension(110),
//   (255)
// } AlertDescription;
//# sourceMappingURL=index.js.map
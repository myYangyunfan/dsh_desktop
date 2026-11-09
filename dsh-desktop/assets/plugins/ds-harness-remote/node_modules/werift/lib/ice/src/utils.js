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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.url2Address = void 0;
exports.getGlobalIp = getGlobalIp;
exports.isLinkLocalAddress = isLinkLocalAddress;
exports.nodeIpAddress = nodeIpAddress;
exports.getHostAddresses = getHostAddresses;
const os = __importStar(require("node:os"));
const common_1 = require("./imports/common");
const selectAddresses_1 = require("./internal/selectAddresses");
const const_1 = require("./stun/const");
const message_1 = require("./stun/message");
const protocol_1 = require("./stun/protocol");
const logger = (0, common_1.debug)("werift-ice : packages/ice/src/utils.ts");
async function getGlobalIp(stunServer, interfaceAddresses) {
    const protocol = new protocol_1.StunProtocol();
    await protocol.connectionMade(true, undefined, interfaceAddresses);
    const request = new message_1.Message(const_1.methods.BINDING, const_1.classes.REQUEST);
    const [response] = await protocol.request(request, stunServer ?? ["stun.l.google.com", 19302]);
    await protocol.close();
    const address = response.getAttributeValue("XOR-MAPPED-ADDRESS");
    return address[0];
}
function isLinkLocalAddress(info) {
    return (((0, common_1.normalizeFamilyNodeV18)(info.family) === 4 &&
        info.address?.startsWith("169.254.")) ||
        ((0, common_1.normalizeFamilyNodeV18)(info.family) === 6 &&
            info.address?.startsWith("fe80::")));
}
function nodeIpAddress(family, { useLinkLocalAddress, } = {}) {
    const interfaces = os.networkInterfaces();
    logger(interfaces);
    return (0, selectAddresses_1.selectAddressesFromInterfaces)(interfaces, family, { useLinkLocalAddress }, isLinkLocalAddress);
}
function getHostAddresses(useIpv4, useIpv6, options = {}) {
    const address = [];
    if (useIpv4) {
        address.push(...nodeIpAddress(4, options));
    }
    if (useIpv6) {
        address.push(...nodeIpAddress(6, options));
    }
    return address;
}
const url2Address = (url) => {
    if (!url)
        return;
    const [address, port] = url.split(":");
    return [address, Number.parseInt(port)];
};
exports.url2Address = url2Address;
//# sourceMappingURL=utils.js.map
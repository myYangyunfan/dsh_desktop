"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interfaceAddress = void 0;
exports.randomPort = randomPort;
exports.randomPorts = randomPorts;
exports.findPort = findPort;
exports.normalizeFamilyNodeV18 = normalizeFamilyNodeV18;
const dgram_1 = require("dgram");
const interfaceAddress = (type, interfaceAddresses) => (interfaceAddresses ? interfaceAddresses[type] : undefined);
exports.interfaceAddress = interfaceAddress;
async function randomPort(protocol = "udp4", interfaceAddresses) {
    const socket = (0, dgram_1.createSocket)(protocol);
    setImmediate(() => socket.bind({
        port: 0,
        address: (0, exports.interfaceAddress)(protocol, interfaceAddresses),
    }));
    await new Promise((r) => {
        socket.once("error", r);
        socket.once("listening", r);
    });
    const port = socket.address()?.port;
    await new Promise((r) => socket.close(() => r()));
    return port;
}
async function randomPorts(num, protocol = "udp4", interfaceAddresses) {
    return Promise.all([...Array(num)].map(() => randomPort(protocol, interfaceAddresses)));
}
async function findPort(min, max, protocol = "udp4", interfaceAddresses) {
    let port;
    for (let i = min; i <= max; i++) {
        const socket = (0, dgram_1.createSocket)(protocol);
        setImmediate(() => socket.bind({
            port: i,
            address: (0, exports.interfaceAddress)(protocol, interfaceAddresses),
        }));
        const err = await new Promise((r) => {
            socket.once("error", (e) => r(e));
            socket.once("listening", () => r());
        });
        if (err) {
            await new Promise((r) => socket.close(() => r()));
            continue;
        }
        port = socket.address()?.port;
        await new Promise((r) => socket.close(() => r()));
        if (min <= port && port <= max) {
            break;
        }
    }
    if (!port)
        throw new Error("port not found");
    return port;
}
function normalizeFamilyNodeV18(family) {
    if (family === "IPv4")
        return 4;
    if (family === "IPv6")
        return 6;
    return family;
}
//# sourceMappingURL=network.js.map
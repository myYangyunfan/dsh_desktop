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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DnsLookup = exports.MdnsLookup = void 0;
const worker_thread = __importStar(require("node:worker_threads"));
const multicast_dns_1 = __importDefault(require("multicast-dns"));
class MdnsLookup {
    constructor() {
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "mdnsInstance", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, multicast_dns_1.default)()
        });
        this.mdnsInstance.setMaxListeners(50);
    }
    lookup(host) {
        return new Promise((r, f) => {
            const cleanup = () => {
                this.mdnsInstance.removeListener("response", l);
                clearTimeout(timeout);
            };
            const timeout = setTimeout(() => {
                cleanup();
                f(new Error("No mDNS response"));
            }, 10000);
            const l = (response) => {
                const a = response.answers?.[0];
                if (a?.type !== "A") {
                    return;
                }
                if (a.name !== host) {
                    return;
                }
                cleanup();
                r(a.data);
            };
            this.mdnsInstance.on("response", l);
            this.mdnsInstance.query(host, "A");
        });
    }
    close() {
        this.mdnsInstance.destroy();
    }
}
exports.MdnsLookup = MdnsLookup;
class DnsLookup {
    constructor() {
        Object.defineProperty(this, "thread", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        const lookupWorkerFunction = () => {
            const worker_thread = global.require("worker_threads");
            const { lookup } = global.require("dns");
            const dnsLookup = (host) => lookup(host, (err, address, family) => {
                const res = {
                    err: err?.message,
                    address,
                    family,
                    host,
                };
                worker_thread.parentPort?.postMessage(res);
                process.exit();
            });
            worker_thread.parentPort?.on("message", (message) => {
                const { host } = message;
                dnsLookup(host);
            });
        };
        const lookupEval = `(${lookupWorkerFunction})()`;
        this.thread = new worker_thread.Worker(lookupEval, {
            eval: true,
        });
        this.thread.setMaxListeners(100);
    }
    async lookup(host) {
        let cached = this.cache.get(host);
        if (cached) {
            return cached;
        }
        cached = new Promise((r, f) => {
            const exitListener = (exitCode) => f(new Error(`dns.lookup thread exited unexpectedly: ${exitCode}`));
            const threadMessageListener = (result) => {
                if (result.host !== host) {
                    return;
                }
                this.thread.removeListener("message", threadMessageListener);
                this.thread.removeListener("exit", exitListener);
                if (!result.address)
                    return f(new Error(result.err || "dns.lookup thread unknown error"));
                r(result.address);
            };
            this.thread.on("message", threadMessageListener);
            this.thread.on("exit", exitListener);
            this.thread.postMessage({
                host,
            });
        });
        this.cache.set(host, cached);
        return cached;
    }
    close() {
        return this.thread.terminate();
    }
}
exports.DnsLookup = DnsLookup;
//# sourceMappingURL=lookup.js.map
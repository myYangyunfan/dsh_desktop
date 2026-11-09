import * as worker_thread from "node:worker_threads";
import mdns from "multicast-dns";
export declare class MdnsLookup {
    cache: Map<string, Promise<string>>;
    mdnsInstance: mdns.MulticastDNS;
    constructor();
    lookup(host: string): Promise<string>;
    close(): void;
}
export declare class DnsLookup {
    thread: worker_thread.Worker;
    cache: Map<string, Promise<string>>;
    constructor();
    lookup(host: string): Promise<string>;
    close(): Promise<number>;
}

import * as os from "node:os";
import { type Address, type InterfaceAddresses } from "./imports/common";
export declare function getGlobalIp(stunServer?: Address, interfaceAddresses?: InterfaceAddresses): Promise<string>;
export declare function isLinkLocalAddress(info: os.NetworkInterfaceInfo): boolean;
export declare function nodeIpAddress(family: number, { useLinkLocalAddress, }?: {
    /** such as google cloud run */
    useLinkLocalAddress?: boolean;
}): string[];
export declare function getHostAddresses(useIpv4: boolean, useIpv6: boolean, options?: {
    /** such as google cloud run */
    useLinkLocalAddress?: boolean;
}): string[];
export declare const url2Address: (url?: string) => readonly [string, number] | undefined;

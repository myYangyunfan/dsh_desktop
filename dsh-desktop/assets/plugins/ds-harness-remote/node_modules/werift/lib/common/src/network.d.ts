import { type SocketType } from "dgram";
export type InterfaceAddresses = {
    [K in SocketType]?: string;
};
export declare const interfaceAddress: (type: SocketType, interfaceAddresses: InterfaceAddresses | undefined) => string | undefined;
export declare function randomPort(protocol?: SocketType, interfaceAddresses?: InterfaceAddresses): Promise<number>;
export declare function randomPorts(num: number, protocol?: SocketType, interfaceAddresses?: InterfaceAddresses): Promise<number[]>;
export declare function findPort(min: number, max: number, protocol?: SocketType, interfaceAddresses?: InterfaceAddresses): Promise<number>;
export type Address = Readonly<[string, number]>;
export declare function normalizeFamilyNodeV18(family: string | number): 4 | 6;

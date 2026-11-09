import type { Address } from "../../../common/src";
import { type AttributeKeys } from "./const";
export declare function unpackErrorCode(data: Buffer): [number, string];
export declare function unpackXorAddress(data: Buffer, transactionId: Buffer): Address;
export declare function packErrorCode(value: [number, string]): Buffer<ArrayBuffer>;
export declare function packUnknownAttributes(value: number[]): Buffer<ArrayBuffer>;
export declare function unpackUnknownAttributes(data: Buffer): number[];
export declare function packXorAddress(value: Address, transactionId: Buffer): Buffer<ArrayBuffer>;
export type ATTRIBUTE = [
    number,
    AttributeKey,
    (...args: any[]) => Buffer,
    (...args: any[]) => any
];
export type RawAttribute = {
    type: number;
    length?: number;
    value: Buffer;
};
export declare class AttributeRepository {
    protected attributes: AttributePair[];
    constructor(attributes?: AttributePair[]);
    getAttributes(): AttributePair[];
    setAttribute(key: AttributeKey, value: any): this;
    getAttributeValue(key: AttributeKey): any;
    get attributesKeys(): AttributeKey[];
    clear(): void;
}
export type AttributeKey = (typeof AttributeKeys)[number];
export type AttributePair = [AttributeKey, any];
export declare const ATTRIBUTES_BY_TYPE: {
    [key: string]: ATTRIBUTE;
};
export declare const ATTRIBUTES_BY_NAME: {
    [key: string]: ATTRIBUTE;
};

import { type AttributePair, AttributeRepository, type RawAttribute } from "./attributes";
import { type classes, type methods } from "./const";
export declare function parseMessage(data: Buffer, integrityKey?: Buffer): Message | undefined;
export declare class Message extends AttributeRepository {
    messageMethod: methods;
    messageClass: classes;
    transactionId: Buffer;
    rawAttributes: RawAttribute[];
    constructor(messageMethod: methods, messageClass: classes, transactionId?: Buffer, attributes?: AttributePair[], rawAttributes?: RawAttribute[]);
    toJSON(): {
        messageMethod: methods;
        messageClass: classes;
        attributes: AttributePair[];
        rawAttributes: {
            type: number;
            length: number;
        }[];
    };
    get json(): {
        messageMethod: methods;
        messageClass: classes;
        attributes: AttributePair[];
        rawAttributes: {
            type: number;
            length: number;
        }[];
    };
    get transactionIdHex(): string;
    appendRawAttribute(type: number, value: Buffer): this;
    get unknownAttributeTypes(): number[];
    get bytes(): Buffer<ArrayBuffer>;
    addMessageIntegrity(key: Buffer): this;
    messageIntegrity(key: Buffer): Buffer<ArrayBuffer>;
    addFingerprint(): this;
    private get serializedAttributes();
}
export declare function paddingLength(length: number): number;

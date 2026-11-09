import type { Address } from "./imports/common";
import type { Message } from "./stun/message";
export declare class TransactionError extends Error {
    response?: Message;
    addr?: Address;
}
export declare class TransactionFailed extends TransactionError {
    response: Message;
    addr: Address;
    constructor(response: Message, addr: Address);
    get str(): string;
}
export declare class TransactionTimeout extends TransactionError {
    get str(): string;
}

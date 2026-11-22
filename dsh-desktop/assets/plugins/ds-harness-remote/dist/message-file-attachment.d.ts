export interface MessageFileAttachment {
    attachmentId: string;
    name: string;
    bytes: number;
}
export declare function messageFileAttachment(block: unknown): MessageFileAttachment | undefined;
export declare function messageFilePath(ref: MessageFileAttachment): string;
export declare function isMessageFilePath(path: unknown): path is string;
/** One authenticated connection's index of attachments delivered by the Host's session journal. */
export declare class MessageFileAttachments {
    private readonly references;
    observe(sessionId: string, value: unknown): void;
    get(sessionId: string, path: string): MessageFileAttachment | undefined;
    clear(): void;
    private key;
}
//# sourceMappingURL=message-file-attachment.d.ts.map
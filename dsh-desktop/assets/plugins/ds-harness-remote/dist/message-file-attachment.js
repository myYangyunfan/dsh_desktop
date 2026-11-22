const PREFIX = '.dsh-remote-message-file/';
const attachmentIdPattern = /^sha256:[a-f0-9]{64}$/;
function record(value) {
    return typeof value === 'object' && value !== null ? value : undefined;
}
export function messageFileAttachment(block) {
    const value = record(block);
    const ref = value?.type === 'file' ? record(value.attachment) : undefined;
    if (typeof ref?.attachmentId !== 'string' || !attachmentIdPattern.test(ref.attachmentId)
        || typeof ref.name !== 'string' || ref.name.length === 0 || ref.name.length > 255
        || ref.name === '.' || ref.name === '..' || /[\\/\x00-\x1f]/u.test(ref.name)
        || typeof ref.bytes !== 'number' || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0)
        return;
    return { attachmentId: ref.attachmentId, name: ref.name, bytes: ref.bytes };
}
export function messageFilePath(ref) {
    return `${PREFIX}${ref.attachmentId}/${ref.name}`;
}
export function isMessageFilePath(path) {
    return typeof path === 'string' && path.startsWith(PREFIX);
}
/** One authenticated connection's index of attachments delivered by the Host's session journal. */
export class MessageFileAttachments {
    references = new Map();
    observe(sessionId, value) {
        const frame = record(value);
        const entries = Array.isArray(frame?.records) ? frame.records : [value];
        for (const entry of entries) {
            const event = record(record(entry)?.event);
            const data = record(event?.data);
            if (event?.type !== 'user/message' || data?.role !== 'user' || !Array.isArray(data.content))
                continue;
            for (const block of data.content) {
                const ref = messageFileAttachment(block);
                if (ref === undefined)
                    continue;
                const key = this.key(sessionId, messageFilePath(ref));
                this.references.delete(key);
                this.references.set(key, ref);
                if (this.references.size > 4096)
                    this.references.delete(this.references.keys().next().value);
            }
        }
    }
    get(sessionId, path) {
        return this.references.get(this.key(sessionId, path));
    }
    clear() {
        this.references.clear();
    }
    key(sessionId, path) {
        return JSON.stringify([sessionId, path]);
    }
}
//# sourceMappingURL=message-file-attachment.js.map
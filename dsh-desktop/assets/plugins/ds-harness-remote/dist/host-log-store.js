import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_BACKUPS = 2;
const MAX_LINE_CHARS = 8192;
const TAIL_READ_BYTES = 512 * 1024;
export function resolveHostLogPath(options = {}) {
    const env = options.env ?? process.env;
    const home = env.DSH_HOME || join(options.homeDirectory ?? homedir(), '.dsh');
    const rawProfile = options.profile ?? env.DSH_PROFILE ?? '';
    const profileSlug = rawProfile
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'host';
    return join(home, 'logs', 'ds-harness-remote', `${profileSlug}.log`);
}
export class HostLogStore {
    filePath;
    maxEntries;
    maxFileBytes;
    maxBackups;
    liveEntries = [];
    persistedEntries = [];
    nextSeq = 1;
    currentBytes = 0;
    fileError;
    writeChain = Promise.resolve();
    initPromise;
    clearedBeforeInit = false;
    sizeVerified = false;
    dirEnsured = false;
    pendingDiskLines = [];
    diskFlushScheduled = false;
    constructor(options = {}) {
        this.filePath = options.filePath;
        this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
        this.maxFileBytes = Math.max(1024, options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES);
        this.maxBackups = Math.max(0, options.maxBackups ?? DEFAULT_MAX_BACKUPS);
        this.initPromise = this.loadInitialFile();
        this.writeChain = this.initPromise.catch(() => undefined);
    }
    record(level, message, now = new Date()) {
        const timestamp = now.toISOString();
        const clean = sanitizeLogMessage(message);
        const line = `${timestamp} [${level.toUpperCase()}] ${clean}`;
        const entry = {
            seq: this.nextSeq++,
            timestamp,
            level,
            line,
        };
        this.liveEntries.push(entry);
        this.trimInMemory();
        if (this.filePath !== undefined) {
            this.pendingDiskLines.push(`${line}\n`);
            this.scheduleDiskFlush();
        }
    }
    async snapshot(options = {}) {
        await this.initPromise.catch(() => undefined);
        const filter = options.filter ?? 'all';
        const limit = Math.min(this.maxEntries, Math.max(1, options.limit ?? 500));
        const combined = this.combinedEntries();
        const filtered = filter === 'warn'
            ? combined.filter(entry => entry.level === 'warn' || entry.level === 'error')
            : combined;
        const entries = filtered.length > limit ? filtered.slice(-limit) : filtered;
        return {
            entries,
            totalBuffered: combined.length,
            ...(this.filePath === undefined ? {} : { filePath: this.filePath }),
            ...(this.fileError === undefined ? {} : { fileError: this.fileError }),
        };
    }
    async clear() {
        this.clearedBeforeInit = true;
        this.persistedEntries = [];
        this.liveEntries = [];
        this.pendingDiskLines = [];
        if (this.filePath !== undefined) {
            this.enqueueWrite(async () => {
                await this.clearDisk();
            });
            await this.writeChain;
        }
        const entries = this.combinedEntries();
        return {
            entries,
            totalBuffered: entries.length,
            ...(this.filePath === undefined ? {} : { filePath: this.filePath }),
            ...(this.fileError === undefined ? {} : { fileError: this.fileError }),
        };
    }
    async flush() {
        await this.writeChain;
    }
    scheduleDiskFlush() {
        if (this.diskFlushScheduled)
            return;
        this.diskFlushScheduled = true;
        this.enqueueWrite(async () => {
            while (this.pendingDiskLines.length > 0) {
                let batch = '';
                let batchBytes = 0;
                while (this.pendingDiskLines.length > 0) {
                    const next = this.pendingDiskLines[0];
                    const nextBytes = Buffer.byteLength(next, 'utf8');
                    if (batch.length > 0 && this.currentBytes + batchBytes + nextBytes > this.maxFileBytes)
                        break;
                    this.pendingDiskLines.shift();
                    batch += next;
                    batchBytes += nextBytes;
                }
                await this.appendToDisk(batch);
            }
            this.diskFlushScheduled = false;
        }, () => {
            this.diskFlushScheduled = false;
        });
    }
    enqueueWrite(task, onError) {
        this.writeChain = this.writeChain.then(async () => {
            try {
                await task();
                this.fileError = undefined;
            }
            catch (error) {
                this.dirEnsured = false;
                onError?.();
                this.fileError = safeFsErrorMessage(error);
            }
        });
    }
    async loadInitialFile() {
        if (this.filePath === undefined)
            return;
        try {
            const info = await stat(this.filePath);
            this.currentBytes = info.size;
            this.sizeVerified = true;
            if (this.clearedBeforeInit || info.size === 0)
                return;
            const text = await readTailUtf8(this.filePath, info.size, TAIL_READ_BYTES);
            if (this.clearedBeforeInit)
                return;
            const lines = text.split(/\r?\n/).filter(line => line.length > 0);
            const tail = lines.slice(-this.maxEntries);
            const parsed = [];
            let seqBase = 1;
            for (const line of tail) {
                parsed.push(parsePersistedLine(line, seqBase++));
            }
            this.persistedEntries = parsed;
            let next = parsed.length + 1;
            for (const entry of this.liveEntries) {
                entry.seq = next++;
            }
            this.nextSeq = next;
            this.trimInMemory();
        }
        catch (error) {
            if (isEnoent(error)) {
                this.currentBytes = 0;
                this.sizeVerified = true;
                return;
            }
            this.fileError = safeFsErrorMessage(error);
        }
    }
    async appendToDisk(payload) {
        const target = this.filePath;
        if (!this.dirEnsured) {
            await mkdir(dirname(target), { recursive: true, mode: 0o700 });
            this.dirEnsured = true;
        }
        if (!this.sizeVerified) {
            const existing = await stat(target).catch(err => (isEnoent(err) ? undefined : Promise.reject(err)));
            this.currentBytes = existing?.size ?? 0;
            this.sizeVerified = true;
        }
        const byteLength = Buffer.byteLength(payload, 'utf8');
        if (this.currentBytes > 0 && this.currentBytes + byteLength > this.maxFileBytes) {
            await this.rotateFiles(target);
        }
        await writeFile(target, payload, { encoding: 'utf8', flag: 'a', mode: 0o600 });
        this.currentBytes += byteLength;
    }
    async rotateFiles(target) {
        if (this.maxBackups === 0) {
            await writeFile(target, '', { encoding: 'utf8', mode: 0o600 });
            this.currentBytes = 0;
            return;
        }
        for (let index = this.maxBackups; index >= 1; index--) {
            const dest = `${target}.${index}`;
            const src = index === 1 ? target : `${target}.${index - 1}`;
            if (index === this.maxBackups) {
                await rm(dest, { force: true }).catch(() => undefined);
            }
            try {
                await rename(src, dest);
            }
            catch (error) {
                if (!isEnoent(error))
                    throw error;
            }
        }
        this.currentBytes = 0;
    }
    async clearDisk() {
        const target = this.filePath;
        if (!this.dirEnsured) {
            await mkdir(dirname(target), { recursive: true, mode: 0o700 });
            this.dirEnsured = true;
        }
        await writeFile(target, '', { encoding: 'utf8', mode: 0o600 });
        this.sizeVerified = true;
        for (let index = 1; index <= this.maxBackups; index++) {
            await rm(`${target}.${index}`, { force: true }).catch(() => undefined);
        }
        this.currentBytes = 0;
    }
    combinedEntries() {
        if (this.persistedEntries.length === 0)
            return [...this.liveEntries];
        const merged = [...this.persistedEntries, ...this.liveEntries];
        return merged.length > this.maxEntries ? merged.slice(-this.maxEntries) : merged;
    }
    trimInMemory() {
        const total = this.persistedEntries.length + this.liveEntries.length;
        if (total <= this.maxEntries)
            return;
        const overflow = total - this.maxEntries;
        if (this.persistedEntries.length >= overflow) {
            this.persistedEntries.splice(0, overflow);
        }
        else {
            const remaining = overflow - this.persistedEntries.length;
            this.persistedEntries = [];
            this.liveEntries.splice(0, remaining);
        }
    }
}
function sanitizeLogMessage(message) {
    const redacted = message
        .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/([?&](?:token|access_token|refresh_token|secret|password|authorization|cookie|code)=)[^&\s]+/gi, '$1[REDACTED]');
    const collapsed = redacted.replace(/[\r\n]+/g, ' ').trimEnd();
    if (collapsed.length <= MAX_LINE_CHARS)
        return collapsed;
    return `${collapsed.slice(0, MAX_LINE_CHARS)}...`;
}
function parsePersistedLine(line, seq) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s+\[(DEBUG|INFO|WARN|ERROR)\]\s+(.*)$/);
    if (match === null) {
        return { seq, timestamp: '', level: 'info', line };
    }
    const level = match[2].toLowerCase();
    return {
        seq,
        timestamp: match[1],
        level,
        line,
    };
}
async function readTailUtf8(filePath, totalSize, maxBytes) {
    if (totalSize <= maxBytes) {
        return readFile(filePath, 'utf8');
    }
    const handle = await open(filePath, 'r');
    try {
        const start = totalSize - maxBytes;
        const buffer = Buffer.allocUnsafe(maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, maxBytes, start);
        const raw = buffer.subarray(0, bytesRead).toString('utf8');
        const firstNewline = raw.indexOf('\n');
        return firstNewline === -1 ? raw : raw.slice(firstNewline + 1);
    }
    finally {
        await handle.close();
    }
}
function isEnoent(error) {
    return typeof error === 'object' && error !== null && error.code === 'ENOENT';
}
function safeFsErrorMessage(error) {
    if (error instanceof Error && error.message.trim().length > 0) {
        const home = homedir();
        const normalized = home.length > 0 ? error.message.split(home).join('~') : error.message;
        return normalized.replace(/[\r\n]+/g, ' ').trim();
    }
    return 'Failed to write log file.';
}
//# sourceMappingURL=host-log-store.js.map
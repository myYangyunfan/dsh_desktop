import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
export class TranscriptWatcher extends EventEmitter {
    conversationId;
    baseDir;
    offset = 0;
    lineRemainder = '';
    decoder = new StringDecoder('utf8');
    readTail = Promise.resolve();
    readQueued = false;
    pollTimer;
    closed = false;
    transcriptPath;
    transcriptFullPath;
    constructor(conversationId, baseDir = join(homedir(), '.gemini/antigravity-cli/brain')) {
        super();
        this.conversationId = conversationId;
        this.baseDir = baseDir;
        const brainDir = join(this.baseDir, conversationId, '.system_generated/logs');
        this.transcriptPath = join(brainDir, 'transcript.jsonl');
        this.transcriptFullPath = join(brainDir, 'transcript_full.jsonl');
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    /**
     * 启动增量文件监听
     */
    start(intervalMs = 250) {
        if (this.closed)
            return;
        const poll = async () => {
            try {
                await this.flush();
            }
            catch {
                // 文件可能尚未创建或临时锁占用，静默重试
            }
            if (!this.closed) {
                this.pollTimer = setTimeout(() => { void poll(); }, intervalMs);
                this.pollTimer.unref?.();
            }
        };
        void poll();
    }
    stop() {
        this.closed = true;
        if (this.pollTimer !== undefined) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
        this.resetDecoder();
    }
    /**
     * 重置读取偏移与解码器状态
     */
    reset() {
        this.offset = 0;
        this.resetDecoder();
    }
    resetDecoder() {
        this.lineRemainder = '';
        this.decoder.end();
        this.decoder = new StringDecoder('utf8');
    }
    /**
     * 立即触发一次读取（同步/主动检查）
     */
    flush() {
        if (this.closed)
            return Promise.resolve();
        // Polling and stdout can both request a read. Keep one reader and
        // coalesce arrivals during that read into a single follow-up.
        if (!this.readQueued) {
            this.readQueued = true;
            this.readTail = this.readTail.catch(() => undefined).then(async () => {
                this.readQueued = false;
                if (!this.closed)
                    await this.readNewLines();
            });
        }
        return this.readTail;
    }
    async readNewLines() {
        let stat;
        try {
            stat = await fs.stat(this.transcriptPath);
        }
        catch {
            return;
        }
        if (stat.size <= this.offset)
            return;
        const handle = await fs.open(this.transcriptPath, 'r');
        try {
            const bytesToRead = stat.size - this.offset;
            const buffer = Buffer.alloc(bytesToRead);
            const { bytesRead } = await handle.read(buffer, 0, bytesToRead, this.offset);
            if (this.closed || bytesRead === 0)
                return;
            this.offset += bytesRead;
            const text = this.lineRemainder + this.decoder.write(buffer.subarray(0, bytesRead));
            const lines = text.split('\n');
            this.lineRemainder = lines.pop() ?? '';
            for (const line of lines) {
                if (this.closed)
                    return;
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                await this.parseAndDispatch(trimmed);
            }
        }
        finally {
            await handle.close();
        }
    }
    async parseAndDispatch(rawLine) {
        let record;
        try {
            record = JSON.parse(rawLine);
        }
        catch {
            return;
        }
        if (Array.isArray(record.truncated_fields) && record.truncated_fields.length > 0) {
            record = await this.enrichFromFullTranscript(record);
        }
        this.emit('step', record);
        if (record.type === 'PLANNER_RESPONSE') {
            if (record.thinking && record.thinking.trim() !== '') {
                this.emit('thinking', {
                    stepIndex: record.step_index,
                    thinking: record.thinking,
                    createdAt: record.created_at,
                });
            }
            if (Array.isArray(record.tool_calls) && record.tool_calls.length > 0) {
                this.emit('toolCall', {
                    stepIndex: record.step_index,
                    toolCalls: record.tool_calls,
                    createdAt: record.created_at,
                });
            }
            if (record.content && record.content.trim() !== '') {
                this.emit('message', {
                    stepIndex: record.step_index,
                    text: record.content,
                    createdAt: record.created_at,
                });
            }
        }
        else if (record.type === 'USER_INPUT' && record.content) {
            this.emit('message', {
                stepIndex: record.step_index,
                text: record.content,
                createdAt: record.created_at,
            });
        }
        if (record.status === 'DONE' && record.type === 'PLANNER_RESPONSE') {
            this.emit('complete', this.conversationId);
        }
    }
    async enrichFromFullTranscript(record) {
        try {
            const content = await fs.readFile(this.transcriptFullPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                const full = JSON.parse(trimmed);
                if (full.step_index === record.step_index) {
                    return full;
                }
            }
        }
        catch {
            // 容错降级
        }
        return record;
    }
}
//# sourceMappingURL=transcript-watcher.js.map
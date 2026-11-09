import { AntigravityExecutor } from './executor.js';
import { TranscriptWatcher } from './transcript-watcher.js';
export class AntigravitySession {
    conversationId;
    watcher;
    executor;
    defaultOptions;
    constructor(conversationId, watcher, executor, defaultOptions = {}) {
        this.conversationId = conversationId;
        this.watcher = watcher;
        this.executor = executor;
        this.defaultOptions = defaultOptions;
    }
    /**
     * 发送 Prompt 并等待完成；期间 watcher 会持续抛出思考与工具调用事件
     */
    async prompt(text, options = {}) {
        const merged = {
            ...this.defaultOptions,
            ...options,
            conversationId: this.conversationId,
        };
        const result = await this.executor.executeOnce(text, merged);
        await this.watcher.flush();
        return result;
    }
    close() {
        this.watcher.stop();
        this.executor.kill();
    }
}
export class AntigravityService {
    executor;
    constructor(executor = new AntigravityExecutor()) {
        this.executor = executor;
    }
    /**
     * 创建新会话并执行首轮 Prompt
     */
    async createSession(initialPrompt, options = {}) {
        const result = await this.executor.executeOnce(initialPrompt, options);
        const conversationId = result.conversationId || 'default';
        const watcher = new TranscriptWatcher(conversationId);
        watcher.start();
        await watcher.flush();
        const session = new AntigravitySession(conversationId, watcher, this.executor, options);
        return { session, result };
    }
    /**
     * 恢复已有会话
     */
    resumeSession(conversationId, options = {}) {
        const watcher = new TranscriptWatcher(conversationId);
        watcher.start();
        return new AntigravitySession(conversationId, watcher, this.executor, {
            ...options,
            conversationId,
        });
    }
    /**
     * 单次无状态执行
     */
    async executeOnce(prompt, options = {}) {
        return this.executor.executeOnce(prompt, options);
    }
}
//# sourceMappingURL=service.js.map
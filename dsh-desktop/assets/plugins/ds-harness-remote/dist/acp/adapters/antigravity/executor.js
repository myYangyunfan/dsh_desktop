import { spawn } from 'node:child_process';
import { resolveAntigravityBinary } from '../antigravity-process.js';
export class AntigravityExecutor {
    activeProcess;
    /**
     * 非交互式调用：`agy -p "<prompt>" --output-format json`
     */
    async executeOnce(prompt, options = {}) {
        const args = ['-p', prompt, '--output-format', 'json'];
        if (options.conversationId) {
            args.push('--conversation', options.conversationId);
        }
        else if (options.continueLast) {
            args.push('-c');
        }
        if (options.skipPermissions) {
            args.push('--dangerously-skip-permissions');
        }
        const timeoutMs = options.timeoutMs ?? 120_000;
        args.push('--print-timeout', String(Math.floor(timeoutMs / 1000)));
        const binary = resolveAntigravityBinary(options.binaryPath);
        const child = spawn(binary, args, {
            cwd: options.cwd ?? process.cwd(),
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.activeProcess = child;
        let stdout = '';
        let stderr = '';
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Antigravity execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            timer.unref?.();
            child.stdout?.on('data', chunk => { stdout += chunk.toString('utf-8'); });
            child.stderr?.on('data', chunk => { stderr += chunk.toString('utf-8'); });
            child.on('error', err => {
                clearTimeout(timer);
                this.activeProcess = undefined;
                reject(err);
            });
            child.on('close', code => {
                clearTimeout(timer);
                this.activeProcess = undefined;
                if (code !== 0) {
                    return reject(new Error(`agy exited with code ${code}: ${stderr.trim()}`));
                }
                try {
                    const parsed = JSON.parse(stdout);
                    const convId = typeof parsed.conversation_id === 'string'
                        ? parsed.conversation_id
                        : options.conversationId;
                    const text = typeof parsed.content === 'string' ? parsed.content : stdout;
                    resolve({
                        conversationId: convId,
                        output: text,
                        raw: parsed,
                    });
                }
                catch {
                    resolve({
                        conversationId: options.conversationId,
                        output: stdout,
                        raw: stdout,
                    });
                }
            });
        });
    }
    /**
     * 启动常驻交互式流式子进程 (stream-json 管道模式)
     */
    spawnStreamSession(options = {}) {
        const args = ['--input-format', 'stream-json', '--output-format', 'stream-json'];
        if (options.conversationId) {
            args.push('--conversation', options.conversationId);
        }
        else if (options.continueLast) {
            args.push('-c');
        }
        if (options.skipPermissions) {
            args.push('--dangerously-skip-permissions');
        }
        const binary = resolveAntigravityBinary(options.binaryPath);
        return spawn(binary, args, {
            cwd: options.cwd ?? process.cwd(),
            env: { ...process.env, ...options.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    }
    kill() {
        if (this.activeProcess && !this.activeProcess.killed) {
            this.activeProcess.kill('SIGTERM');
            this.activeProcess = undefined;
        }
    }
}
//# sourceMappingURL=executor.js.map
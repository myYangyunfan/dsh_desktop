import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify, stripVTControlCharacters } from 'node:util';
import { RpcError } from '../../safe-error.js';
const MAX_RESPONSE_BYTES = 64 * 1024;
const execFileAsync = promisify(execFile);
/** Probe the installed CLI, since ACP builds do not all expose a native HTTP listener. */
export async function opencodeHasNativeApi(binary, args, cwd, signal) {
    try {
        const { stdout, stderr } = await execFileAsync(binary, [...opencodePrivateArgs(args), '--help'], {
            cwd, signal, timeout: 20_000, maxBuffer: MAX_RESPONSE_BYTES, windowsHide: true, killSignal: 'SIGKILL',
        });
        const help = stripVTControlCharacters(`${stdout}\n${stderr}`);
        const hasFlag = (name) => new RegExp(`^\\s*(?:-[A-Za-z],?\\s+)?--${name}(?=[\\s=,\\[]|$)`, 'm').test(help);
        const network = ['hostname', 'port', 'mdns'].map(hasFlag);
        // An incomplete/failed probe must never remove the private bind from an older CLI.
        if (!/\bacp\b/i.test(help) || !hasFlag('help') || (network.some(Boolean) && !network.every(Boolean)))
            throw new Error('Invalid ACP help');
        return network.every(Boolean);
    }
    catch (error) {
        // Do not expose captured CLI output or inherited configuration in errors/logs.
        if (signal.aborted)
            throw new RpcError('OPENCODE_CLOSED', 'OpenCode ACP was closed.');
        if (error?.code === 'ENOENT')
            throw new RpcError('OPENCODE_BINARY_UNAVAILABLE', 'The Host OpenCode executable is unavailable.');
        throw new RpcError('OPENCODE_CLI_PROBE_FAILED', 'Could not inspect OpenCode ACP options. Check opencode acp --help on the Host.');
    }
}
/** The native HTTP listener belongs to the same Host-local `opencode acp` process. */
export class OpencodeNativeApi {
    origin;
    request;
    password = randomBytes(32).toString('hex');
    shutdown = new AbortController();
    constructor(origin, request = fetch) {
        this.origin = origin;
        this.request = request;
        if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin) || Number(new URL(origin).port) > 65535)
            throw unavailable();
    }
    async isArchived(sessionId, cwd) {
        const session = await this.session('GET', sessionId, cwd);
        return typeof session.time.archived === 'number' && Number.isFinite(session.time.archived);
    }
    async archive(sessionId, cwd) {
        if (await this.isArchived(sessionId, cwd))
            return;
        const session = await this.session('PATCH', sessionId, cwd);
        if (typeof session.time.archived !== 'number' || !Number.isFinite(session.time.archived))
            throw unavailable();
    }
    close() { this.shutdown.abort(); }
    async session(method, sessionId, cwd) {
        if (!/^[A-Za-z0-9_-]{1,256}$/.test(sessionId))
            throw new RpcError('INVALID_MESSAGE', 'The OpenCode session ID is invalid.');
        try {
            const url = new URL(`/session/${encodeURIComponent(sessionId)}`, this.origin);
            url.searchParams.set('directory', cwd);
            const response = await this.request(url, {
                method, redirect: 'error', signal: AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(20_000)]),
                headers: { authorization: `Basic ${Buffer.from(`opencode:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
                ...(method === 'PATCH' ? { body: JSON.stringify({ time: { archived: Date.now() } }) } : {}),
            });
            if (!response.ok) {
                await response.body?.cancel();
                throw unavailable();
            }
            const reader = response.body?.getReader();
            if (!reader)
                throw unavailable();
            const chunks = [];
            let bytes = 0;
            try {
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done)
                        break;
                    bytes += chunk.value.byteLength;
                    if (bytes > MAX_RESPONSE_BYTES)
                        throw unavailable();
                    chunks.push(chunk.value);
                }
            }
            finally {
                await reader.cancel().catch(() => undefined);
            }
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!result || result.id !== sessionId || typeof result.directory !== 'string' || !result.time || typeof result.time !== 'object'
                || await realpath(result.directory) !== cwd)
                throw unavailable();
            return result;
        }
        catch {
            throw unavailable();
        }
    }
}
export async function opencodeLoopbackPort() {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
    const address = server.address();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (!address || typeof address === 'string')
        throw unavailable();
    return address.port;
}
/** Strip stale network flags; only add a private listener when the CLI advertises it. */
export function opencodePrivateArgs(args, port) {
    if (args.includes('--'))
        throw unavailable();
    const kept = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (/^--(?:port|hostname|mdns|no-mdns)(?:=|$)/.test(arg)) {
            if ((arg === '--port' || arg === '--hostname') || ((arg === '--mdns' || arg === '--no-mdns') && /^(true|false)$/.test(args[i + 1] ?? '')))
                i++;
        }
        else
            kept.push(arg);
    }
    return port === undefined ? kept : [...kept, `--hostname=127.0.0.1`, `--port=${port}`, '--mdns=false'];
}
function unavailable() {
    return new RpcError('OPENCODE_ARCHIVE_UNAVAILABLE', 'OpenCode did not confirm the archive operation. Check the Host OpenCode version and retry after refreshing its session list.');
}
//# sourceMappingURL=opencode-native-api.js.map
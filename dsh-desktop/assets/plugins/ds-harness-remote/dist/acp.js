export class AcpGateway {
    adapters;
    constructor(adapters) {
        this.adapters = adapters;
    }
    get(p) { const list = this.adapters instanceof Object && 'backend' in this.adapters ? [this.adapters] : [...this.adapters]; const a = list.find(x => !p.backend || x.backend === p.backend); if (!a)
        throw new Error('CAPABILITY_NOT_SUPPORTED'); return a; }
    initialize(p) { return this.get(p).initialize(p); }
    sessionNew(p) { return this.get(p).sessionNew(p); }
    sessionLoad(p) { const a = this.get(p); if (!a.sessionLoad)
        throw new Error('CAPABILITY_NOT_SUPPORTED'); return a.sessionLoad(p); }
    prompt(p, emit) { return this.get(p).prompt(p, emit); }
    respondPermission(p) { const a = this.get(p); if (!a.respondPermission)
        throw new Error('CAPABILITY_NOT_SUPPORTED'); return a.respondPermission(p); }
    cancel(p) { const a = this.get(p); if (!a.cancel)
        throw new Error('CAPABILITY_NOT_SUPPORTED'); return a.cancel(p); }
    setMode(p) { const a = this.get(p); if (!a.setMode)
        throw new Error('CAPABILITY_NOT_SUPPORTED'); return a.setMode(p); }
}
import { spawn } from 'node:child_process';
export const DEFAULT_ACP_IDES = [
    { id: 'pi', command: 'pi-acp', args: [] },
    { id: 'codex', command: 'codex', args: ['acp'] },
    { id: 'cursor', command: 'agent', args: ['acp'] },
    { id: 'kimi', command: 'kimi', args: ['acp'] },
    { id: 'antigravity', command: 'agy', args: ['--input-format', 'stream-json', '--output-format', 'stream-json'] },
];
/** JSON-RPC stdio bridge for ACP agents (Cursor/Kimi/CodeX). */
export class StdioAcpAdapter {
    config;
    backend;
    child;
    nextId = 1;
    constructor(config) {
        this.config = config;
        this.backend = config.id;
    }
    ensure() { if (!this.child)
        this.child = spawn(this.config.command, this.config.args ?? [], { cwd: this.config.cwd, stdio: 'pipe' }); return this.child; }
    async initialize(params) { await this.call('initialize', params); return { protocolVersion: 1, capability: 'agent.acp.v1', backend: this.backend, capabilities: ['session.new', 'session.load', 'session.prompt', 'session.cancel'] }; }
    async sessionNew(params) { const r = await this.call('session/new', params); if (!r.sessionId)
        throw new Error('INVALID_MESSAGE'); return { sessionId: r.sessionId }; }
    async sessionLoad(params) { const r = await this.call('session/load', params); if (!r.sessionId)
        throw new Error('INVALID_MESSAGE'); return { sessionId: r.sessionId }; }
    async prompt(params, emit) { await this.call('session/prompt', params, async (n) => emit({ sessionId: params.sessionId, update: n, seq: this.nextId++ })); }
    async cancel(p) { await this.call('session/cancel', p); }
    async setMode(p) { await this.call('session/set_mode', p); }
    async respondPermission(p) { await this.call('session/request_permission', p); }
    async close() { this.child?.kill(); this.child = undefined; }
    call(method, params, onNotification) { const c = this.ensure(); const id = this.nextId++; c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); return new Promise((resolve, reject) => { let buf = ''; const onData = async (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop() ?? ''; for (const l of lines) {
        try {
            const m = JSON.parse(l);
            if (m.id === id) {
                c.stdout.off('data', onData);
                m.error ? reject(new Error(m.error.message ?? 'ACP error')) : resolve(m.result);
            }
            else if (m.method && onNotification)
                await onNotification(m.params);
        }
        catch { }
    } }; c.stdout.on('data', onData); c.once('error', reject); }); }
}
//# sourceMappingURL=acp.js.map
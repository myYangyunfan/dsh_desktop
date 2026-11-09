import { z } from 'zod';
import { RpcError } from './safe-error.js';
import { parseCodexSessionId } from './codex/session-id.js';
export const TERMINAL_CALLS = new Set(['terminal/environment', 'terminal/shells', 'terminal/list',
    'terminal/create', 'terminal/write', 'terminal/resize', 'terminal/rename', 'terminal/close']);
export const TERMINAL_STREAMS = new Set(['terminal/follow', 'terminal/retain']);
const id = z.string().regex(/^[A-Za-z0-9_:-]{1,256}$/);
/** Host-lifetime device ownership survives transport reconnects; never supplied by the client. */
export class TerminalPolicy {
    enabled;
    deviceId;
    owners;
    static claims = new WeakMap();
    attachments = new Map();
    claims;
    constructor(enabled, deviceId, owners) {
        this.enabled = enabled;
        this.deviceId = deviceId;
        this.owners = owners;
        this.claims = TerminalPolicy.claims.get(owners) ?? new Map();
        TerminalPolicy.claims.set(owners, this.claims);
    }
    /** Host process cleanup releases the exact terminal identity for every connection. */
    static releaseOwner(owners, key) {
        owners.delete(key);
        TerminalPolicy.claims.get(owners)?.delete(key);
    }
    check(endpoint, payload) {
        if (!(typeof this.enabled === 'function' ? this.enabled() : this.enabled))
            throw new RpcError('TERMINAL_DISABLED', 'Remote terminal is disabled on this Host. Enable Remote terminal in the Host Remote settings; the switch saves and applies immediately. / 远程终端未开启，请在 Host 的 Remote 设置中开启「远程终端」，开关切换后立即保存并生效。');
        for (const [key, attachment] of this.attachments)
            if (this.owners.get(key) !== this.deviceId || this.claims.get(key) !== attachment.claim)
                this.attachments.delete(key);
        const args = z.object({ args: z.record(z.unknown()) }).strict().parse(payload).args;
        const rawSessionId = args.agentId ?? args.sessionId;
        const sessionId = id.parse(rawSessionId);
        // CodeX sessions are deliberately opaque keys here. Their thread/cwd
        // authority is resolved by the CodeX Host domain, never by Harness lookup.
        const codexSession = parseCodexSessionId(sessionId);
        void codexSession;
        if (endpoint === 'terminal/environment' || endpoint === 'terminal/shells' || endpoint === 'terminal/list')
            return {};
        const request = endpoint === 'terminal/create' ? z.object({ id }).passthrough().parse(args.request) : undefined;
        const terminalId = id.parse(request?.id ?? args.id);
        const key = `${sessionId}/${terminalId}`;
        if (endpoint === 'terminal/create') {
            if (this.owners.has(key) && this.owners.get(key) !== this.deviceId)
                this.deny();
            if (!this.owners.has(key) && this.owners.size >= 256)
                throw new RpcError('RATE_LIMITED', 'Too many retained remote terminals.');
            const created = !this.owners.has(key);
            this.owners.set(key, this.deviceId);
            if (created || !this.claims.has(key))
                this.claims.set(key, {});
            return { key, created, claim: this.claims.get(key) };
        }
        if (this.owners.get(key) !== this.deviceId)
            this.deny();
        if (endpoint === 'terminal/follow')
            this.attachments.set(key, { id: id.parse(args.attachmentId), claim: this.claims.get(key) });
        if (endpoint === 'terminal/write' || endpoint === 'terminal/resize') {
            if (this.attachments.get(key)?.id !== id.parse(args.attachmentId))
                this.deny();
        }
        return { key, claim: this.claims.get(key) };
    }
    result(endpoint, payload, result, reservation) {
        const releases = (!result.ok && reservation.created && result.error.code !== 'TERMINAL_CLEANUP_FAILED') || (result.ok && endpoint === 'terminal/close');
        // Cleanup can finish before an older RPC response. Its response must not
        // release a new allocation that has since claimed the same identity.
        if (reservation.key !== undefined && releases && this.owners.get(reservation.key) === this.deviceId
            && this.claims.get(reservation.key) === reservation.claim) {
            TerminalPolicy.releaseOwner(this.owners, reservation.key);
            this.attachments.delete(reservation.key);
        }
        if (endpoint === 'terminal/list' && result.ok && Array.isArray(result.value)) {
            const args = payload.args;
            const session = args.sessionId ?? args.agentId;
            return { ok: true, value: result.value.filter(value => typeof value?.id === 'string'
                    && this.owners.get(`${session}/${value.id}`) === this.deviceId) };
        }
        return result;
    }
    deny() { throw new RpcError('PERMISSION_DENIED', 'This terminal or input attachment belongs to another connection or device.'); }
}
//# sourceMappingURL=terminal-policy.js.map
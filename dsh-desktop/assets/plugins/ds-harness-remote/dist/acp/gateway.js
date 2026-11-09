import { IsolatedAcpClient } from './adapters/isolated-process.js';
import { WorkspaceBridge, WorkspaceBridgeState } from '../workspace-bridge.js';
import { TerminalPolicy } from '../terminal-policy.js';
import { AcpWorkspaceTools } from './workspace-tools.js';
import { randomUUID } from 'node:crypto';
import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { RpcError } from '../safe-error.js';
import { PLUGIN_VERSION } from '../version.js';
import { CursorAcpError, } from './adapters/cursor-process.js';
import { ClaudeAcpClient } from './adapters/claude-process.js';
import { PiAcpClient } from './adapters/pi-process.js';
import { AntigravityAcpClient } from './adapters/antigravity-process.js';
import { OpencodeAcpClient, OpencodeAcpError } from './adapters/opencode-process.js';
import { ACP_METHOD_ALLOWLIST, isSessionMutation, parseAcpCall, sessionIdFromParams, } from './method-policy.js';
import { discoverAntigravitySessions, discoverAntigravityWorkspaces, loadTranscriptEvents } from './adapters/antigravity/transcript-loader.js';
import { AcpPeerBridge } from './peer-bridge.js';
const APPROVAL_TTL_MS = 5 * 60_000;
const DEFAULT_RESTART_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const ACP_DIRECTORY_ENTRY_LIMIT = 500;
const MAX_BUFFERED_ACP_FRAMES = 200;
const ACP_FRAME_BUFFER_TTL_MS = 5 * 60_000;
const MAX_TURN_CATCH_UP_FRAMES = 120;
const CATCH_UP_SESSION_UPDATES = new Set([
    'agent_thought_chunk',
    'agent_thought',
    'agent_message_chunk',
    'agent_message',
    'user_message_chunk',
    'tool_call',
    'tool_call_update',
]);
/**
 * Host-side Agent ACP gateway (#65). Reuses the authenticated Remote channel and
 * delegates to independently configured Cursor/Antigravity adapters. Owns method policy,
 * session ownership, subscriptions, and permission handles per connection.
 */
export class AcpRemoteGateway {
    config;
    logger;
    createAcp;
    restartDelaysMs;
    terminalEnabled;
    terminalSpawner;
    backendInstances = new Map();
    sessionCwds = new Map();
    workspaceState = new WorkspaceBridgeState(key => TerminalPolicy.releaseOwner(this.terminalOwners, key));
    terminalOwners = new Map();
    workspaceTools = new Map();
    peers = new Map();
    sessionOwners = new Map();
    sessionBackends = new Map();
    approvals = new Map();
    approvalExpiryTimer;
    restartTimer;
    restartAttempt = 0;
    available = false;
    closed = false;
    state = 'disabled';
    unavailableCode;
    /** Keep ACP → Client fanout ordered; concurrent publish races Noise sends. */
    inboundChain = Promise.resolve();
    /** Catch-up buffer for turns that finish while the Client is reconnecting. */
    recentFrames = new Map();
    /** Per-prompt live updates; attached to prompt_completed when streaming was lossy. */
    promptsInProgress = new Map();
    cancelledSessions = new Set();
    /** Identity fences asynchronous Pi preparation from a later retry of the same session. */
    preparingPrompts = new Map();
    turnCatchUp = new Map();
    startPromise;
    startingClients = new Map();
    /** Desired configuration is saved immediately; unfinished cleanup must remain retryable. */
    pendingReconfiguration = new Set();
    archivingSessions = new Set();
    opencodeOperations = new Map();
    constructor(config, logger, createAcp = (binary, targetLogger, backend) => {
        if (backend.id === 'antigravity') {
            return new AntigravityAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
        }
        if (backend.id === 'claude')
            return new ClaudeAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
        if (backend.id === 'pi')
            return new PiAcpClient(binary, targetLogger, { args: backend.args, cwd: backend.cwd });
        if (backend.id === 'opencode') {
            return new OpencodeAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
        }
        return new IsolatedAcpClient(binary, targetLogger, { args: backend.args, cwd: backend.cwd, backend: 'cursor' });
    }, restartDelaysMs = DEFAULT_RESTART_DELAYS_MS, terminalEnabled = () => false, terminalSpawner) {
        this.config = config;
        this.logger = logger;
        this.createAcp = createAcp;
        this.restartDelaysMs = restartDelaysMs;
        this.terminalEnabled = terminalEnabled;
        this.terminalSpawner = terminalSpawner;
    }
    /** Only implemented adapters are advertised; registry entries never select an adapter by executable name. */
    enabledBackends() {
        if (!this.config.enabled)
            return [];
        return this.config.backends.filter(item => item.enabled && ['antigravity', 'cursor', 'pi', 'claude', 'opencode'].includes(item.id)).map(item => item.id);
    }
    start() {
        if (this.closed)
            return Promise.reject(new RpcError('CURSOR_CLOSED', 'The ACP Remote domain is closed.'));
        if (!this.config.enabled || !this.enabledBackends().some(id => !this.pendingReconfiguration.has(id)))
            return Promise.resolve();
        this.startPromise ??= this.startOnce().finally(() => { this.startPromise = undefined; });
        return this.startPromise;
    }
    async startOnce() {
        try {
            this.state = 'starting';
            await this.launchAcp();
        }
        catch (error) {
            if (this.closed)
                return;
            this.available = false;
            this.state = 'unavailable';
            this.unavailableCode = errorCode(error);
            await this.disposeAllInstances();
            this.logger.warn('ACP Remote domain unavailable', { code: this.unavailableCode });
        }
    }
    isAvailable() {
        return this.config.enabled && this.available && this.availableBackends().length > 0;
    }
    availableBackends() {
        const list = [];
        for (const [id, inst] of this.backendInstances) {
            if (!this.pendingReconfiguration.has(id) && this.enabledBackends().includes(id) && inst.client.isReady())
                list.push(id);
        }
        return list;
    }
    defaultBackend() {
        const ready = this.availableBackends();
        return this.enabledBackends().find(id => ready.includes(id)) ?? this.enabledBackends()[0] ?? 'antigravity';
    }
    status() {
        return {
            enabled: this.config.enabled,
            available: this.isAvailable(),
            state: this.state,
            restartAttempt: this.restartAttempt,
            availableBackends: this.availableBackends(),
            ...(this.unavailableCode === undefined ? {} : { error: this.unavailableCode }),
        };
    }
    createPeer(context, publish) {
        const bridge = new AcpPeerBridge(this, context, publish, this.logger);
        this.peers.set(context.connectionId, bridge);
        const workspaceBridge = new WorkspaceBridge(async (rawId) => {
            const match = rawId.match(/^(acp|cursor|pi|opencode):(.+)$/);
            const session = match ? this.sessionCwds.get(match[2]) : undefined;
            const backend = match?.[1] === 'acp' ? 'antigravity' : match?.[1] === 'pi' ? 'pi' : match?.[1] === 'opencode' ? 'opencode' : 'cursor';
            if (!session || session.backend !== backend)
                throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session has no trusted workspace.');
            this.requireAcp(backend);
            this.requireSessionOwner(context.connectionId, match[2]);
            return session.cwd;
        }, this.terminalEnabled, this.workspaceState, this.terminalSpawner, {
            domain: 'ACP', owns: value => typeof value === 'string' && /^(acp|cursor|pi|opencode):/.test(value),
            parse: value => typeof value === 'string' && /^(acp|cursor|pi|opencode):[A-Za-z0-9_-]{1,240}$/.test(value)
                ? { sessionId: value, nativeId: value } : undefined,
        });
        this.workspaceTools.set(context.connectionId, new AcpWorkspaceTools(workspaceBridge, new TerminalPolicy(this.terminalEnabled, context.peerDeviceId, this.terminalOwners)));
        return bridge;
    }
    async call(connectionId, input) {
        const envelope = parseCallEnvelope(input);
        const call = parseAcpCall(envelope.method, envelope.params);
        const sessionId = sessionIdFromParams(call.method, call.params);
        const backend = call.params.backend ?? (sessionId ? this.sessionBackends.get(sessionId) ?? this.defaultBackend() : undefined);
        const assertCurrent = this.captureCallScope(connectionId, typeof backend === 'string' ? backend : this.defaultBackend());
        const reserve = backend === 'opencode' && sessionId !== undefined && ['session/load', 'session/prompt', 'dsh/selectModel'].includes(call.method);
        if (reserve) {
            if (this.archivingSessions.has(sessionId))
                throw new RpcError('ACP_SESSION_BUSY', 'The OpenCode session is being archived.');
            this.opencodeOperations.set(sessionId, (this.opencodeOperations.get(sessionId) ?? 0) + 1);
        }
        try {
            const result = await this.callInternal(connectionId, call, assertCurrent);
            assertCurrent();
            return result;
        }
        finally {
            if (reserve) {
                const remaining = (this.opencodeOperations.get(sessionId) ?? 1) - 1;
                if (remaining)
                    this.opencodeOperations.set(sessionId, remaining);
                else
                    this.opencodeOperations.delete(sessionId);
            }
        }
    }
    captureCallScope(connectionId, backend) {
        const peer = this.peers.get(connectionId);
        const instance = this.backendInstances.get(backend);
        return () => {
            if (this.closed || this.backendInstances.get(backend) !== instance
                || (instance !== undefined && this.requireAcp(backend) !== instance.client)) {
                throw new RpcError('CURSOR_UNAVAILABLE', 'The ACP backend changed while handling the request.');
            }
            if (peer !== undefined && this.peers.get(connectionId) !== peer) {
                throw new RpcError('ACP_CONNECTION_CLOSED', 'The ACP connection is closed.');
            }
        };
    }
    async callInternal(connectionId, call, assertCurrent) {
        assertCurrent();
        this.logger.info('ACP call received', {
            method: call.method,
            sessionId: typeof call.params?.sessionId === 'string' ? shortSessionId(call.params.sessionId) : undefined,
        });
        if (typeof call.params.backend === 'string') {
            const prefix = typeof call.params.sessionId === 'string' ? /^(acp|cursor|pi|claude|opencode):/.exec(call.params.sessionId)?.[1] : undefined;
            if (prefix && (prefix === 'acp' ? 'antigravity' : prefix) !== call.params.backend) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            }
            const sessionId = call.method === 'dsh/sessionHistory'
                ? String(call.params.sessionId).replace(/^(acp|cursor|pi|claude|opencode):/, '')
                : sessionIdFromParams(call.method, call.params);
            const boundBackend = sessionId === undefined ? undefined : this.sessionBackends.get(sessionId);
            if (boundBackend !== undefined && boundBackend !== call.params.backend) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            }
            this.requireAcp(call.params.backend);
        }
        if (call.method === 'initialize') {
            const requestedBackend = typeof call.params?.backend === 'string' ? call.params.backend : undefined;
            this.requireAcp(requestedBackend);
            return this.initializeResult(call.params, requestedBackend);
        }
        if (call.method === 'dsh/sessionArchive') {
            const sessionId = String(call.params.sessionId);
            if (this.archivingSessions.has(sessionId) || this.opencodeOperations.has(sessionId))
                throw new RpcError('ACP_SESSION_BUSY', 'The OpenCode session is busy.');
            this.archivingSessions.add(sessionId);
            try {
                const backend = 'opencode';
                const client = this.requireAcp(backend);
                const instance = this.backendInstances.get(backend);
                const cwd = await this.catalogSessionCwd(backend, sessionId);
                assertCurrent();
                if (this.closed || this.requireAcp(backend) !== client || this.backendInstances.get(backend) !== instance)
                    throw new RpcError('OPENCODE_ARCHIVE_UNAVAILABLE', 'The OpenCode backend changed. Refresh the session list.');
                if (this.promptsInProgress.has(sessionId) || [...this.approvals.values()].some(item => item.sessionId === sessionId))
                    throw new RpcError('ACP_SESSION_BUSY', 'Stop the OpenCode reply and resolve its approvals before archiving.');
                if (!client.archiveSession)
                    throw new RpcError('OPENCODE_ARCHIVE_UNAVAILABLE', 'The Host OpenCode adapter does not support native archiving.');
                await client.archiveSession(sessionId, cwd);
                if (this.closed || this.requireAcp(backend) !== client || this.backendInstances.get(backend) !== instance)
                    throw new RpcError('OPENCODE_ARCHIVE_UNAVAILABLE', 'The OpenCode backend changed. Refresh the session list to confirm the archive state.');
                const result = { backend, sessionId, archived: true };
                this.inboundChain = this.inboundChain.then(async () => {
                    if (!this.closed && this.backendInstances.get(backend) === instance) {
                        await Promise.allSettled([...this.peers.values()].map(peer => peer.publishArchived(result)));
                    }
                });
                await this.inboundChain;
                if (this.closed || this.backendInstances.get(backend) !== instance)
                    throw new RpcError('OPENCODE_ARCHIVE_UNAVAILABLE', 'The OpenCode backend changed. Refresh the session list to confirm the archive state.');
                return result;
            }
            finally {
                this.archivingSessions.delete(sessionId);
            }
        }
        if (typeof call.params.sessionId === 'string' && this.archivingSessions.has(call.params.sessionId)
            && ['session/load', 'session/prompt', 'dsh/selectModel'].includes(call.method))
            throw new RpcError('ACP_SESSION_BUSY', 'The OpenCode session is being archived.');
        const controlId = sessionIdFromParams(call.method, call.params);
        if (controlId && (call.params.backend ?? this.sessionBackends.get(controlId) ?? this.defaultBackend()) === 'opencode'
            && ['session/load', 'session/prompt', 'dsh/selectModel'].includes(call.method)) {
            const client = this.requireAcp('opencode');
            if (client.isSessionArchived) {
                const cwd = await this.catalogSessionCwd('opencode', controlId);
                const archived = await client.isSessionArchived(controlId, cwd);
                if (this.closed || this.requireAcp('opencode') !== client)
                    throw new RpcError('OPENCODE_ARCHIVE_UNAVAILABLE', 'The OpenCode backend changed.');
                if (archived)
                    throw new RpcError('ACP_SESSION_ARCHIVED', 'This OpenCode session is archived.');
            }
        }
        assertCurrent();
        if (call.method === 'dsh/directoryList') {
            return this.listDirectory(String(call.params.path));
        }
        if (call.method === 'dsh/workspaceList') {
            const requestedBackend = typeof call.params.backend === 'string' ? call.params.backend : this.defaultBackend();
            if (requestedBackend === 'pi' || requestedBackend === 'claude' || requestedBackend === 'opencode') {
                const sessions = await this.listCatalogSessions(requestedBackend);
                const discovered = [...new Set(sessions.map(item => item.cwd))].map(path => ({ path, title: basename(path) || 'workspace' }));
                if (discovered.length > 0 || requestedBackend !== 'opencode')
                    return discovered;
                const defaultCandidates = new Set();
                const cwd = process.cwd();
                if (cwd)
                    defaultCandidates.add(cwd);
                for (const candidate of ['/var/lib/dsh/workspace/ds-harness-remote', '/srv/dsh-workspace', '/var/lib/dsh/local']) {
                    try {
                        const s = await stat(candidate);
                        if (s.isDirectory())
                            defaultCandidates.add(candidate);
                    }
                    catch {
                        // ignore
                    }
                }
                return [...defaultCandidates].map(path => ({ path, title: basename(path) || 'workspace' }));
            }
            const candidates = new Set();
            const cwd = process.cwd();
            if (cwd)
                candidates.add(cwd);
            for (const candidate of ['/var/lib/dsh/workspace/ds-harness-remote', '/var/lib/dsh/local']) {
                try {
                    const s = await stat(candidate);
                    if (s.isDirectory())
                        candidates.add(candidate);
                }
                catch {
                    // ignore
                }
            }
            const backend = typeof call.params?.backend === 'string' ? call.params.backend : undefined;
            if (backend === 'antigravity') {
                try {
                    const agyDirs = await discoverAntigravityWorkspaces();
                    for (const d of agyDirs) {
                        candidates.add(d);
                    }
                }
                catch {
                    // ignore
                }
            }
            const results = await Promise.all([...candidates].map(async (p) => {
                let sessionCount = 0;
                if (backend === 'antigravity') {
                    try {
                        const sessions = await discoverAntigravitySessions(p, 100);
                        sessionCount = sessions.length;
                    }
                    catch {
                        // ignore
                    }
                }
                return {
                    path: p,
                    title: basename(p) || 'workspace',
                    ...(sessionCount > 0 ? { sessionCount } : {}),
                };
            }));
            return results;
        }
        if (call.method === 'dsh/sessionList') {
            const limit = typeof call.params.limit === 'number' ? call.params.limit : 30;
            const path = String(call.params.path || '');
            const backend = typeof call.params.backend === 'string' ? call.params.backend : this.defaultBackend();
            if (backend === 'antigravity') {
                // Workspace selection loads history before the user presses New.
                // Prepare one idle process in that directory without awaiting startup.
                if (path.trim() !== '' && call.params.prewarm !== false) {
                    const cwd = await this.requireExistingDirectory(path);
                    assertCurrent();
                    this.requireAcp('antigravity').prewarmSession?.(cwd);
                }
                const items = await discoverAntigravitySessions(path, limit);
                if (path) {
                    const cwd = await this.requireExistingDirectory(path);
                    assertCurrent();
                    for (const item of items)
                        this.sessionCwds.set(item.conversationId, { backend, cwd });
                }
                this.logger.info('ACP session list fetched', { count: items.length });
                return { items };
            }
            if (backend === 'pi' || backend === 'claude' || backend === 'opencode') {
                const cwd = path ? await this.requireExistingDirectory(path) : undefined;
                const sessions = await this.listCatalogSessions(backend, cwd);
                sessions.sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0)
                    || a.sessionId.localeCompare(b.sessionId));
                return { items: sessions.slice(0, limit).map(item => ({ conversationId: item.sessionId, title: item.title ?? 'Untitled Session', createdAt: Date.parse(item.updatedAt ?? '') || 0, updatedAt: Date.parse(item.updatedAt ?? '') || 0, cwd: item.cwd })) };
            }
            return { items: [] };
        }
        if (call.method === 'dsh/sessionHistory') {
            const rawSessionId = String(call.params.sessionId);
            const conversationId = rawSessionId.startsWith('claude:') ? rawSessionId.slice(7) : rawSessionId.startsWith('pi:') ? rawSessionId.slice(3) : rawSessionId.startsWith('acp:')
                ? rawSessionId.slice('acp:'.length)
                : rawSessionId.startsWith('cursor:')
                    ? rawSessionId.slice('cursor:'.length)
                    : rawSessionId.startsWith('opencode:')
                        ? rawSessionId.slice('opencode:'.length)
                        : rawSessionId;
            const boundBackend = this.sessionBackends.get(conversationId);
            const backend = typeof call.params.backend === 'string' ? call.params.backend : boundBackend ?? this.defaultBackend();
            if ((boundBackend !== undefined && boundBackend !== backend)
                || (rawSessionId.startsWith('claude:') && backend !== 'claude')
                || (rawSessionId.startsWith('pi:') && backend !== 'pi')
                || (rawSessionId.startsWith('cursor:') && backend !== 'cursor')
                || (rawSessionId.startsWith('opencode:') && backend !== 'opencode')
                || (rawSessionId.startsWith('acp:') && backend !== 'antigravity')) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            }
            this.requireAcp(backend);
            if (backend === 'pi' || backend === 'claude' || backend === 'opencode') {
                const cwd = await this.catalogSessionCwd(backend, conversationId);
                // History uses an isolated reader and must neither require nor claim
                // the live session's control ownership.
                const client = this.requireAcp(backend);
                if (!client.history)
                    throw new RpcError('METHOD_NOT_ALLOWED', 'The ACP backend does not support history.');
                return { events: await client.history(conversationId, cwd) };
            }
            if (backend !== 'antigravity')
                return { events: [] };
            const events = await loadTranscriptEvents(conversationId, rawSessionId);
            this.logger.info('ACP session history fetched', {
                sessionId: shortSessionId(rawSessionId),
                eventCount: events.length,
            });
            return { events };
        }
        if (call.method === 'session/new') {
            const cwd = await this.requireExistingDirectory(String(call.params.cwd));
            assertCurrent();
            const requestedBackend = typeof call.params.backend === 'string'
                ? call.params.backend
                : this.defaultBackend();
            const acp = this.requireAcp(requestedBackend);
            const result = await acp.call('session/new', {
                cwd,
                mcpServers: [],
                ...(typeof call.params.mode === 'string' ? { mode: call.params.mode } : {}),
            });
            assertCurrent();
            const sessionId = readSessionId(result);
            if (sessionId !== undefined) {
                const bound = this.sessionBackends.get(sessionId);
                if (this.sessionOwners.has(sessionId) || this.sessionCwds.has(sessionId) || (bound !== undefined && bound !== requestedBackend)) {
                    throw new RpcError('ACP_SESSION_COLLISION', 'The ACP backend returned an existing session identifier.');
                }
                this.sessionOwners.set(sessionId, connectionId);
                this.sessionBackends.set(sessionId, requestedBackend);
                this.sessionCwds.set(sessionId, { backend: requestedBackend, cwd });
            }
            return sanitizeSessionResult(result);
        }
        const sessionId = sessionIdFromParams(call.method, call.params);
        if (sessionId !== undefined && call.method !== 'session/load')
            this.requireSessionAccess(connectionId, sessionId, call.method);
        if (call.method === 'dsh/toolCall') {
            this.requireSessionOwner(connectionId, sessionId);
            return this.tools(connectionId).call(sessionId, String(call.params.backend), String(call.params.endpoint), call.params.args);
        }
        if (call.method === 'session/prompt') {
            const selected = this.sessionBackends.get(sessionId);
            const requested = typeof call.params.backend === 'string' ? call.params.backend : selected ?? this.defaultBackend();
            if (selected !== undefined && selected !== requested)
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            this.requireAcp(requested);
            if (Array.isArray(call.params.prompt) && call.params.prompt.some(part => isRecord(part) && part.type === 'image') && requested !== 'antigravity')
                throw new RpcError('METHOD_NOT_ALLOWED', 'This ACP backend does not accept image prompts.');
            this.sessionBackends.set(sessionId, requested);
        }
        if (call.method === 'session/load') {
            const boundBackend = sessionId !== undefined ? this.sessionBackends.get(sessionId) : undefined;
            if (typeof call.params.backend !== 'string')
                throw new RpcError('INVALID_MESSAGE', 'Session load requires an explicit backend.');
            const targetBackend = call.params.backend;
            if (targetBackend === 'claude' && this.promptsInProgress.has(sessionId))
                throw new RpcError('PROMPT_IN_PROGRESS', 'An ACP reply is already in progress.');
            if (boundBackend !== undefined && targetBackend !== boundBackend) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            }
            if (targetBackend === 'pi' || targetBackend === 'claude' || targetBackend === 'opencode')
                await this.catalogSessionCwd(targetBackend, sessionId);
            assertCurrent();
            this.requireSessionOwner(connectionId, sessionId);
            const acp = this.requireAcp(targetBackend);
            // Track pending loads too, so reconfiguration revokes their ownership
            // before an upstream result can arrive.
            this.sessionBackends.set(sessionId, targetBackend);
            const result = await acp.call(call.method, { ...call.params, ...(sessionId && this.sessionCwds.get(sessionId) ? { cwd: this.sessionCwds.get(sessionId).cwd, mcpServers: [] } : {}) });
            assertCurrent();
            const loadedId = readSessionId(result) ?? sessionId;
            if (loadedId !== undefined) {
                if (loadedId !== sessionId || (this.sessionBackends.has(loadedId) && targetBackend !== undefined && this.sessionBackends.get(loadedId) !== targetBackend)) {
                    throw new RpcError('ACP_SESSION_COLLISION', 'The ACP backend returned a different session identifier.');
                }
                this.sessionOwners.set(loadedId, connectionId);
                if (targetBackend)
                    this.sessionBackends.set(loadedId, targetBackend);
            }
            return sanitizeSessionResult(result);
        }
        if (isSessionMutation(call.method) && sessionId !== undefined) {
            this.requireSessionOwner(connectionId, sessionId);
        }
        if ((call.method === 'dsh/sessionModels' || call.method === 'dsh/selectModel') && (call.params.backend === 'pi' || call.params.backend === 'claude' || call.params.backend === 'opencode')) {
            this.requireSessionOwner(connectionId, sessionId);
            const backend = call.params.backend;
            const cwd = await this.catalogSessionCwd(backend, sessionId);
            assertCurrent();
            await this.requireAcp(backend).call('session/load', { sessionId, cwd, mcpServers: [] });
            assertCurrent();
        }
        if (call.method === 'dsh/selectModel') {
            if (this.promptsInProgress.has(sessionId))
                throw new RpcError('PROMPT_IN_PROGRESS', 'Stop the ACP reply before changing its model.');
            const session = this.sessionCwds.get(sessionId);
            if (!session || session.backend !== call.params.backend) {
                throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session has no trusted workspace.');
            }
            // Resume straight into the target model. Loading the old model first
            // starts a second CLI process that would immediately be discarded.
            const result = await this.requireAcp(session.backend).call(call.method, { ...call.params, cwd: session.cwd });
            assertCurrent();
            this.sessionBackends.set(sessionId, session.backend);
            return sanitizeSessionResult(result);
        }
        // session/prompt blocks until the upstream turn ends. Returning that RPC
        // only after completion prevents some Client transports from delivering
        // interleaved agent.acp.frame events (Android stays on "正在回复" with no
        // thought/text). Accept immediately and finish via stream updates.
        if (call.method === 'session/prompt' && sessionId !== undefined) {
            if (this.promptsInProgress.has(sessionId))
                throw new RpcError('PROMPT_IN_PROGRESS', 'An ACP reply is already in progress.');
            const backend = this.sessionBackends.get(sessionId) ?? this.defaultBackend();
            const task = { backend, client: this.requireAcp(backend) };
            this.promptsInProgress.set(sessionId, task);
            this.cancelledSessions.delete(sessionId);
            const preparationBackend = this.sessionBackends.get(sessionId);
            if (preparationBackend === 'pi' || preparationBackend === 'claude') {
                const preparation = { cancelled: false };
                this.preparingPrompts.set(sessionId, preparation);
                try {
                    const cwd = await this.catalogSessionCwd(preparationBackend, sessionId);
                    if (preparation.cancelled)
                        return { accepted: false, stopReason: 'cancelled' };
                    assertCurrent();
                    await task.client.call('session/load', { sessionId, cwd, mcpServers: [] });
                    if (preparation.cancelled)
                        return { accepted: false, stopReason: 'cancelled' };
                    assertCurrent();
                }
                catch (error) {
                    if (preparation.cancelled)
                        return { accepted: false, stopReason: 'cancelled' };
                    if (this.promptsInProgress.get(sessionId) === task)
                        this.promptsInProgress.delete(sessionId);
                    throw error;
                }
                finally {
                    if (this.preparingPrompts.get(sessionId) === preparation) {
                        this.preparingPrompts.delete(sessionId);
                        if (preparation.cancelled && this.promptsInProgress.get(sessionId) === task)
                            this.promptsInProgress.delete(sessionId);
                    }
                }
            }
            const ownerPeer = this.peers.get(connectionId);
            if (ownerPeer !== undefined && !ownerPeer.hasStreamFor(sessionId)) {
                this.logger?.warn('Cursor prompt started without an open ACP stream', {
                    sessionId: shortSessionId(sessionId),
                });
            }
            this.turnCatchUp.set(sessionId, []);
            void this.runPromptInBackground(sessionId, call.params, task);
            return { accepted: true, stopReason: 'in_progress' };
        }
        if (call.method === 'session/cancel' && sessionId !== undefined) {
            this.cancelledSessions.add(sessionId);
            const preparation = this.preparingPrompts.get(sessionId);
            if (preparation) {
                // No turn exists upstream yet. Do not send a late cancel into a retry
                // sharing this load: cancel only this preparation identity.
                preparation.cancelled = true;
                this.preparingPrompts.delete(sessionId);
                this.promptsInProgress.delete(sessionId);
                return { stopReason: 'cancelled' };
            }
            const pending = [...this.approvals].filter(([, approval]) => approval.sessionId === sessionId && approval.backend === this.sessionBackends.get(sessionId));
            for (const [handle] of pending)
                this.approvals.delete(handle);
            // Send cancellation before rejecting approvals: rejecting a blocked tool first
            // can otherwise complete the turn as end_turn before upstream sees cancel.
            try {
                return sanitizeSessionResult(await this.requireAcp(this.sessionBackends.get(sessionId)).call(call.method, call.params));
            }
            finally {
                await Promise.all(pending.map(([, approval]) => approval.client.respondError(approval.upstreamId, -32800, 'ACP session cancelled.').catch(() => undefined)));
            }
        }
        const sessionBackend = sessionId !== undefined ? this.sessionBackends.get(sessionId) : undefined;
        return sanitizeSessionResult(await this.requireAcp(typeof call.params.backend === 'string' ? call.params.backend : sessionBackend).call(call.method, call.params));
    }
    async runPromptInBackground(sessionId, params, task) {
        const current = () => !this.closed && this.promptsInProgress.get(sessionId) === task
            && !this.pendingReconfiguration.has(task.backend) && this.backendInstances.get(task.backend)?.client === task.client;
        try {
            const result = await task.client.call('session/prompt', params);
            // Cursor emits final session/update lines before the JSON-RPC result.
            // Those notifications are queued on inboundChain; drain it before we
            // snapshot catch-up or the Client only sees an empty prompt_completed.
            await this.inboundChain;
            if (!current())
                return;
            const stopReason = isRecord(result) && typeof result.stopReason === 'string'
                ? result.stopReason
                : 'end_turn';
            const catchUp = takeTurnCatchUp(this.turnCatchUp, sessionId);
            this.logger.info('ACP prompt finished', {
                sessionId: shortSessionId(sessionId),
                stopReason,
                catchUp: catchUp.length,
            });
            await this.publishToSession(sessionId, {
                method: 'session/update',
                params: {
                    sessionId,
                    update: {
                        sessionUpdate: 'prompt_completed',
                        stopReason,
                        ...(catchUp.length > 0 ? { catchUp } : {}),
                    },
                },
            });
        }
        catch (error) {
            if (!current())
                return;
            this.logger?.warn('ACP session/prompt failed', { code: errorCode(error) });
            await this.inboundChain.catch(() => undefined);
            if (!current())
                return;
            const catchUp = takeTurnCatchUp(this.turnCatchUp, sessionId);
            await this.publishToSession(sessionId, {
                method: 'session/update',
                params: {
                    sessionId,
                    update: {
                        sessionUpdate: 'prompt_failed',
                        code: errorCode(error),
                        ...(catchUp.length > 0 ? { catchUp } : {}),
                    },
                },
            }).catch(() => undefined);
        }
        finally {
            if (this.promptsInProgress.get(sessionId) === task)
                this.promptsInProgress.delete(sessionId);
        }
    }
    async respond(connectionId, input) {
        const params = parseRespondEnvelope(input);
        const pending = this.approvals.get(params.requestHandle);
        if (pending === undefined || pending.expiresAt <= Date.now()) {
            this.approvals.delete(params.requestHandle);
            throw new RpcError('CURSOR_APPROVAL_NOT_FOUND', 'The Cursor approval is missing, expired, or belongs to another connection.');
        }
        if (pending.connectionId !== connectionId) {
            throw new RpcError('CURSOR_APPROVAL_NOT_FOUND', 'The Cursor approval is missing, expired, or belongs to another connection.');
        }
        if (this.sessionOwners.get(pending.sessionId) !== connectionId
            || this.sessionBackends.get(pending.sessionId) !== pending.backend
            || this.requireAcp(pending.backend) !== pending.client) {
            throw new RpcError('CURSOR_APPROVAL_NOT_FOUND', 'The ACP approval scope is no longer active.');
        }
        const result = mapPermissionDecision(params, pending);
        this.approvals.delete(params.requestHandle);
        const acp = pending.client;
        if (params.decision === 'cancel') {
            await acp.respondError(pending.upstreamId, -32800, 'Cancelled by Remote client.');
            return { resolved: true };
        }
        await acp.respond(pending.upstreamId, result);
        return { resolved: true };
    }
    dropPeer(connectionId) {
        this.peers.delete(connectionId);
        void this.workspaceTools.get(connectionId)?.close();
        this.workspaceTools.delete(connectionId);
        for (const [sessionId, owner] of this.sessionOwners) {
            if (owner === connectionId)
                this.sessionOwners.delete(sessionId);
        }
        for (const [handle, approval] of this.approvals) {
            if (approval.connectionId === connectionId) {
                this.approvals.delete(handle);
                void approval.client.respondError(approval.upstreamId, -32800, 'Remote peer disconnected.').catch(() => undefined);
            }
        }
    }
    tools(connectionId) {
        const tools = this.workspaceTools.get(connectionId);
        if (!tools)
            throw new RpcError('ACP_CONNECTION_CLOSED', 'The ACP workspace connection is closed.');
        return tools;
    }
    /** Trusted, connection-scoped authority for the dedicated workspace uploader. */
    resolveUploadWorkspace(connectionId, publicId) {
        const match = /^(acp|cursor|pi|opencode|claude):(.+)$/.exec(publicId);
        const backend = match?.[1] === 'acp' ? 'antigravity' : match?.[1];
        const session = match ? this.sessionCwds.get(match[2]) : undefined;
        if (!this.peers.has(connectionId) || !session || session.backend !== backend || this.closed) {
            throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session has no trusted workspace.');
        }
        this.requireAcp(backend);
        this.requireSessionOwner(connectionId, match[2]);
        return session.cwd;
    }
    async openToolStream(connectionId, sessionId, backend, endpoint, args, signal) {
        const session = this.sessionCwds.get(sessionId);
        if (!session || session.backend !== backend)
            throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session has no trusted workspace.');
        this.requireAcp(backend);
        this.requireSessionOwner(connectionId, sessionId);
        return this.tools(connectionId).open(sessionId, backend, endpoint, args, signal);
    }
    /** Used by peer stream open to prove this connection may observe the session. */
    assertStreamable(connectionId, sessionId) {
        this.claimSession(connectionId, sessionId);
    }
    /**
     * After a Client reconnect, session ownership may have been cleared with the
     * old peer. Reclaim the in-memory ACP session for the new connection so
     * stream open / prompt can resume and buffered frames can replay.
     */
    claimSession(connectionId, sessionId) {
        const owner = this.sessionOwners.get(sessionId);
        if (owner === undefined) {
            this.sessionOwners.set(sessionId, connectionId);
            return;
        }
        if (owner !== connectionId) {
            throw new RpcError('CURSOR_SESSION_OWNED', 'Another Remote connection owns this session.');
        }
    }
    /** Replay frames buffered while no healthy peer could receive them. */
    async replayBufferedFrames(connectionId, sessionId) {
        const peer = this.peers.get(connectionId);
        if (peer === undefined)
            return;
        this.pruneFrameBuffer(sessionId);
        const buffered = this.recentFrames.get(sessionId) ?? [];
        if (buffered.length === 0)
            return;
        this.recentFrames.delete(sessionId);
        this.logger.info('Replaying buffered ACP frames', {
            sessionId: shortSessionId(sessionId),
            count: buffered.length,
        });
        for (const frame of buffered) {
            await peer.publishInbound(sessionId, { method: frame.method, params: frame.params });
        }
    }
    async reconfigure(config) {
        if (this.closed)
            throw new RpcError('CURSOR_CLOSED', 'The ACP Remote domain is closed.');
        const previous = this.config;
        const implemented = (value) => ({ enabled: value.enabled,
            backends: value.backends.filter(item => ['cursor', 'antigravity', 'pi', 'claude', 'opencode'].includes(item.id)) });
        this.config = config;
        if (JSON.stringify(implemented(previous)) === JSON.stringify(implemented(config)) && this.pendingReconfiguration.size === 0)
            return;
        if (this.restartTimer !== undefined)
            clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
        const changed = new Set([...this.pendingReconfiguration, ...previous.backends.filter(item => {
                const next = config.backends.find(candidate => candidate.id === item.id);
                return previous.enabled !== config.enabled || JSON.stringify(item) !== JSON.stringify(next);
            }).map(item => item.id)]);
        for (const id of changed)
            this.pendingReconfiguration.add(id);
        const stopping = await Promise.allSettled([...this.startingClients].filter(([, backend]) => changed.has(backend.id)).map(([client]) => client.close()));
        await this.startPromise?.catch(() => undefined);
        const sessions = new Set([...this.sessionBackends].filter(([, backend]) => changed.has(backend)).map(([id]) => id));
        if (sessions.size > 0)
            await Promise.all([...this.peers.values()].map(peer => peer.failStreams('failed', sessions)));
        for (const [id, session] of this.sessionCwds)
            if (changed.has(session.backend))
                this.sessionCwds.delete(id);
        const terminalError = await this.workspaceState.dispose(sessionId => changed.has(sessionId.startsWith('acp:') ? 'antigravity' : sessionId.startsWith('pi:') ? 'pi' : sessionId.startsWith('opencode:') ? 'opencode' : 'cursor'))
            .then(() => undefined, () => new RpcError('TERMINAL_CLEANUP_FAILED', 'Some ACP terminal processes could not be stopped. Save the backend settings again to retry.'));
        for (const id of sessions) {
            this.sessionOwners.delete(id);
            this.promptsInProgress.delete(id);
            const preparation = this.preparingPrompts.get(id);
            if (preparation)
                preparation.cancelled = true;
            this.preparingPrompts.delete(id);
            this.sessionBackends.delete(id);
            this.recentFrames.delete(id);
            this.turnCatchUp.delete(id);
        }
        for (const [id, approval] of this.approvals)
            if (approval.backend !== undefined && changed.has(approval.backend))
                this.approvals.delete(id);
        // A terminal cleanup failure must not prevent stopping any changed backend.
        // Keep failed backend instances fenced from RPC/startup until a later retry.
        const processes = await Promise.allSettled([...changed].map(async (id) => {
            const instance = this.backendInstances.get(id);
            if (instance === undefined)
                return;
            await this.disposeInstance(instance);
            if (this.backendInstances.get(id) === instance)
                this.backendInstances.delete(id);
        }));
        this.available = this.availableBackends().length > 0;
        const cleanupFailed = terminalError !== undefined || [...stopping, ...processes].some(result => result.status === 'rejected');
        this.state = this.available ? 'ready' : cleanupFailed && this.enabledBackends().length > 0 ? 'unavailable' : 'disabled';
        this.restartAttempt = 0;
        this.unavailableCode = terminalError?.code ?? (cleanupFailed ? 'ACP_RECONFIGURE_FAILED' : undefined);
        if (terminalError)
            throw terminalError;
        if (cleanupFailed)
            throw new RpcError('ACP_RECONFIGURE_FAILED', 'Some ACP backend processes could not be stopped. Save the backend settings again to retry.');
        for (const id of changed)
            this.pendingReconfiguration.delete(id);
        await this.start();
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        if (this.restartTimer !== undefined)
            clearTimeout(this.restartTimer);
        if (this.approvalExpiryTimer !== undefined)
            clearTimeout(this.approvalExpiryTimer);
        for (const peer of this.peers.values())
            await peer.closeAll();
        this.peers.clear();
        this.sessionCwds.clear();
        const terminals = this.workspaceState.dispose().then(() => undefined, () => new RpcError('TERMINAL_CLEANUP_FAILED', 'Some ACP terminal processes could not be stopped.'));
        this.sessionOwners.clear();
        this.sessionBackends.clear();
        this.recentFrames.clear();
        this.turnCatchUp.clear();
        this.promptsInProgress.clear();
        for (const preparation of this.preparingPrompts.values())
            preparation.cancelled = true;
        this.preparingPrompts.clear();
        this.approvals.clear();
        const processes = await Promise.allSettled([...this.startingClients.keys()].map(client => client.close()).concat(this.disposeAllInstances()));
        const terminalError = await terminals;
        if (!terminalError)
            this.terminalOwners.clear();
        this.available = false;
        this.state = 'disabled';
        if (terminalError)
            throw terminalError;
        if (processes.some(result => result.status === 'rejected'))
            throw new RpcError('ACP_SHUTDOWN_FAILED', 'Some ACP backend processes could not be stopped.');
    }
    async launchAcp() {
        const candidates = this.config.backends.filter(item => !this.pendingReconfiguration.has(item.id) && this.enabledBackends().includes(item.id));
        const results = await Promise.allSettled(candidates.map(async (candidate) => {
            if (this.backendInstances.get(candidate.id)?.client.isReady())
                return;
            let lastError;
            for (const binary of cursorBinaryCandidates(candidate.command)) {
                if (this.closed || !this.backendCurrent(candidate))
                    return;
                try {
                    await this.launchBackendCandidate(candidate, binary);
                    return;
                }
                catch (error) {
                    lastError = error;
                    this.logger.debug?.('ACP candidate failed', { id: candidate.id, code: errorCode(error) });
                }
            }
            throw lastError;
        }));
        if (this.closed)
            return;
        if (this.enabledBackends().length === 0) {
            this.state = 'disabled';
            return;
        }
        if (this.isAvailable()) {
            this.state = 'ready';
            if (this.pendingReconfiguration.size === 0)
                this.unavailableCode = undefined;
            this.restartAttempt = 0;
            return;
        }
        const failure = results.find(result => result.status === 'rejected');
        throw failure?.status === 'rejected' ? failure.reason : new CursorAcpError('CURSOR_BINARY_UNAVAILABLE', 'No ACP backend is available.');
    }
    backendCurrent(backend) {
        return this.config.enabled && backend.enabled && !this.pendingReconfiguration.has(backend.id)
            && JSON.stringify(this.config.backends.find(item => item.id === backend.id)) === JSON.stringify(backend);
    }
    async launchBackendCandidate(backend, binary) {
        const id = backend.id;
        const acp = this.createAcp(binary, this.logger, backend);
        this.startingClients.set(acp, backend);
        try {
            await acp.start();
            if (this.closed || !this.backendCurrent(backend)) {
                await acp.close();
                return;
            }
        }
        catch (error) {
            await acp.close();
            throw error;
        }
        finally {
            this.startingClients.delete(acp);
        }
        const unsubscribeInbound = acp.onInbound(message => {
            this.inboundChain = this.inboundChain
                .then(() => this.backendInstances.get(id)?.client === acp ? this.handleInbound(id, message) : undefined)
                .catch(error => {
                this.logger.warn('ACP inbound fanout failed', { id, code: errorCode(error) });
            });
        });
        const unsubscribeUnavailable = acp.onUnavailable(code => { void this.handleUnavailable(code); });
        const prev = this.backendInstances.get(id);
        if (prev !== undefined) {
            await this.disposeInstance(prev);
        }
        if (this.closed || !this.backendCurrent(backend)) {
            unsubscribeInbound();
            unsubscribeUnavailable();
            await acp.close();
            return;
        }
        this.available = true;
        this.backendInstances.set(id, {
            id,
            client: acp,
            unsubscribeInbound,
            unsubscribeUnavailable,
        });
    }
    async handleInbound(backend, message) {
        const incomingId = readSessionId(message.params) ?? readNestedSessionId(message.params);
        const boundBackend = incomingId === undefined ? undefined : this.sessionBackends.get(incomingId);
        if (boundBackend !== undefined && boundBackend !== backend) {
            if (message.kind === 'request')
                await this.requireAcp(backend).respondError(message.id, -32602, 'The ACP session backend does not match.');
            return;
        }
        // session/update is a stream notification even if a buggy agent attaches an id.
        if (message.kind === 'notification' || message.method === 'session/update') {
            const sessionId = readSessionId(message.params) ?? readNestedSessionId(message.params);
            if (sessionId === undefined)
                return;
            if (!this.sessionBackends.has(sessionId)) {
                this.sessionBackends.set(sessionId, backend);
            }
            await this.publishToSession(sessionId, { method: message.method, params: message.params });
            return;
        }
        const sessionId = incomingId;
        const owner = sessionId === undefined ? undefined : this.sessionOwners.get(sessionId);
        const peer = owner === undefined ? undefined : this.peers.get(owner);
        const client = this.requireAcp(backend);
        if (sessionId === undefined || this.cancelledSessions.has(sessionId) || owner === undefined || peer === undefined || boundBackend !== backend
            || !['session/request_permission', 'cursor/create_plan', 'cursor/ask_question'].includes(message.method)
            || (message.method.startsWith('cursor/') && backend !== 'cursor')) {
            await client.respondError(message.id, -32602, 'The ACP request has no active owner or supported method.');
            return;
        }
        let options = [];
        try {
            if (message.method === 'session/request_permission')
                options = permissionOptions(message.params);
        }
        catch {
            await client.respondError(message.id, -32602, 'The ACP permission options are invalid.');
            return;
        }
        const requestHandle = randomUUID();
        this.approvals.set(requestHandle, {
            upstreamId: message.id, connectionId: owner, sessionId, method: message.method,
            expiresAt: Date.now() + APPROVAL_TTL_MS, backend, client, options,
        });
        this.scheduleApprovalExpiry();
        try {
            await peer.publishInbound(sessionId, {
                method: message.method,
                params: {
                    ...(isRecord(message.params) ? message.params : {}),
                    requestHandle, sessionId, upstreamMethod: message.method,
                },
            });
        }
        catch {
            this.approvals.delete(requestHandle);
            await client.respondError(message.id, -32800, 'Remote approval delivery failed.');
        }
    }
    async publishToSession(sessionId, frame) {
        this.recordTurnCatchUp(sessionId, frame);
        const ownerId = this.sessionOwners.get(sessionId);
        const entries = [...this.peers.entries()];
        if (entries.length === 0) {
            this.bufferFrame(sessionId, frame);
            return;
        }
        const deliveries = await Promise.all(entries.map(async ([connectionId, peer]) => {
            try {
                await peer.publishInbound(sessionId, frame);
                return { connectionId, ok: true };
            }
            catch {
                return { connectionId, ok: false };
            }
        }));
        const ownerDelivered = ownerId !== undefined
            && deliveries.some(item => item.connectionId === ownerId && item.ok);
        // Loopback peers resolve successfully while swallowing events. Only treat
        // the session owner's delivery as proof the Remote Client received the frame.
        if (ownerId !== undefined ? !ownerDelivered : deliveries.every(item => !item.ok)) {
            this.bufferFrame(sessionId, frame);
        }
    }
    recordTurnCatchUp(sessionId, frame) {
        const list = this.turnCatchUp.get(sessionId);
        if (list === undefined || frame.method !== 'session/update')
            return;
        const params = isRecord(frame.params) ? frame.params : undefined;
        const update = params !== undefined && isRecord(params.update) ? params.update : params;
        const kind = update !== undefined && typeof update.sessionUpdate === 'string'
            ? update.sessionUpdate
            : undefined;
        if (kind === undefined || !CATCH_UP_SESSION_UPDATES.has(kind))
            return;
        list.push({ method: frame.method, params: frame.params });
        while (list.length > MAX_TURN_CATCH_UP_FRAMES)
            list.shift();
    }
    bufferFrame(sessionId, frame) {
        this.pruneFrameBuffer(sessionId);
        const list = this.recentFrames.get(sessionId) ?? [];
        list.push({ method: frame.method, params: frame.params, at: Date.now() });
        while (list.length > MAX_BUFFERED_ACP_FRAMES)
            list.shift();
        this.recentFrames.set(sessionId, list);
        this.logger.warn('Buffered ACP frame for later replay', {
            sessionId: shortSessionId(sessionId),
            method: frame.method,
            buffered: list.length,
        });
    }
    pruneFrameBuffer(sessionId) {
        const list = this.recentFrames.get(sessionId);
        if (list === undefined)
            return;
        const validAfter = Date.now() - ACP_FRAME_BUFFER_TTL_MS;
        const next = list.filter(frame => frame.at >= validAfter);
        if (next.length === 0)
            this.recentFrames.delete(sessionId);
        else
            this.recentFrames.set(sessionId, next);
    }
    async handleUnavailable(code) {
        if (this.closed)
            return;
        this.available = false;
        this.state = 'restarting';
        this.unavailableCode = code;
        await Promise.all([...this.peers.values()].map(peer => peer.failStreams('failed')));
        this.scheduleRestart();
    }
    scheduleRestart() {
        if (this.closed || !this.config.enabled)
            return;
        if (this.restartAttempt >= this.restartDelaysMs.length) {
            this.state = 'unavailable';
            return;
        }
        const delay = this.restartDelaysMs[this.restartAttempt];
        this.restartAttempt += 1;
        if (this.restartTimer !== undefined)
            clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
            void this.start().catch(() => undefined);
        }, delay);
        this.restartTimer.unref?.();
    }
    scheduleApprovalExpiry() {
        if (this.approvalExpiryTimer !== undefined)
            clearTimeout(this.approvalExpiryTimer);
        const next = [...this.approvals.values()].reduce((min, item) => {
            if (min === undefined || item.expiresAt < min)
                return item.expiresAt;
            return min;
        }, undefined);
        if (next === undefined)
            return;
        this.approvalExpiryTimer = setTimeout(() => {
            const now = Date.now();
            for (const [handle, approval] of this.approvals) {
                if (approval.expiresAt <= now) {
                    this.approvals.delete(handle);
                    void approval.client.respondError(approval.upstreamId, -32800, 'Cursor approval expired.').catch(() => undefined);
                }
            }
            this.scheduleApprovalExpiry();
        }, Math.max(0, next - Date.now()));
        this.approvalExpiryTimer.unref?.();
    }
    requireAcp(backend) {
        if (!this.config.enabled || (backend !== undefined && (!this.enabledBackends().includes(backend) || this.pendingReconfiguration.has(backend))) || !this.isAvailable()) {
            throw new RpcError('CURSOR_UNAVAILABLE', 'Cursor ACP is disabled or unavailable on this Host.');
        }
        if (backend !== undefined) {
            const instance = this.backendInstances.get(backend);
            if (instance !== undefined && instance.client.isReady())
                return instance.client;
            throw new RpcError('CURSOR_UNAVAILABLE', 'The requested ACP backend is disabled or unavailable on this Host.');
        }
        const selected = this.backendInstances.get(this.defaultBackend());
        if (selected !== undefined && selected.client.isReady())
            return selected.client;
        throw new RpcError('CURSOR_UNAVAILABLE', 'Cursor ACP is disabled or unavailable on this Host.');
    }
    initializeResult(params, backend) {
        const requested = typeof params.protocolVersion === 'number' ? params.protocolVersion : 1;
        const actualBackend = backend ?? this.defaultBackend();
        return {
            protocolVersion: requested,
            agentInfo: {
                name: actualBackend === 'antigravity' ? 'antigravity' : 'dsh-remote-acp',
                version: PLUGIN_VERSION,
            },
            backend: actualBackend,
            availableBackends: this.availableBackends(),
            authMethods: [],
            capabilities: {
                loadSession: true,
                promptTypes: actualBackend === 'antigravity' ? ['text', 'image'] : ['text'],
                methods: [...ACP_METHOD_ALLOWLIST],
            },
        };
    }
    callUpstream(method, params) {
        return this.requireAcp().call(method, params);
    }
    requireSessionAccess(connectionId, sessionId, method) {
        if (method === 'session/load') {
            this.requireSessionOwner(connectionId, sessionId);
            return;
        }
        const owner = this.sessionOwners.get(sessionId);
        if (owner === undefined) {
            // Allow reclaim after the owning peer disconnected; the ACP process still
            // holds the session.
            this.sessionOwners.set(sessionId, connectionId);
            return;
        }
        if (owner !== connectionId && isSessionMutation(method)) {
            throw new RpcError('CURSOR_SESSION_OWNED', 'Another Remote connection owns this session.');
        }
    }
    requireSessionOwner(connectionId, sessionId) {
        this.claimSession(connectionId, sessionId);
    }
    captureCatalogClient(backend) {
        const client = this.requireAcp(backend);
        const instance = this.backendInstances.get(backend);
        return { client, assertCurrent: () => {
                if (this.closed || this.backendInstances.get(backend) !== instance || this.requireAcp(backend) !== client) {
                    throw new RpcError('CURSOR_UNAVAILABLE', 'The ACP backend changed while resolving session authority.');
                }
            } };
    }
    async listCatalogSessions(backend, cwd) {
        const { client, assertCurrent } = this.captureCatalogClient(backend);
        const items = [];
        let cursor;
        const seen = new Set();
        for (let page = 0; page < 100; page++) {
            const result = await client.call('session/list', { ...(cwd ? { cwd } : {}), ...(cursor ? { cursor } : {}) });
            assertCurrent();
            if (!isRecord(result) || !Array.isArray(result.sessions)
                || (result.nextCursor != null && (typeof result.nextCursor !== 'string' || result.nextCursor.length === 0))) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session catalog response is invalid.');
            }
            for (const item of result.sessions) {
                if (!isRecord(item) || typeof item.sessionId !== 'string' || typeof item.cwd !== 'string')
                    continue;
                // Directory I/O can outlive a backend restart/reconfiguration. Only the
                // directory failure is skippable; a stale generation must reject the RPC.
                const canonical = await this.requireExistingDirectory(item.cwd).catch(() => undefined);
                assertCurrent();
                if (!canonical || (cwd && canonical !== cwd))
                    continue;
                if (this.sessionBackends.has(item.sessionId) && this.sessionBackends.get(item.sessionId) !== backend)
                    continue;
                const trusted = this.sessionCwds.get(item.sessionId);
                if (trusted && (trusted.backend !== backend || trusted.cwd !== canonical))
                    continue;
                this.sessionCwds.set(item.sessionId, { backend, cwd: canonical });
                this.sessionBackends.set(item.sessionId, backend);
                if (backend === 'opencode' && item.archived === true)
                    continue;
                items.push({ sessionId: item.sessionId, cwd: canonical,
                    ...(typeof item.title === 'string' ? { title: item.title } : {}),
                    ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}) });
            }
            if (result.nextCursor == null)
                return items;
            if (seen.has(result.nextCursor) || page === 99) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session catalog pagination did not complete.');
            }
            cursor = result.nextCursor;
            seen.add(cursor);
        }
        return items;
    }
    async catalogSessionCwd(backend, sessionId) {
        const { assertCurrent } = this.captureCatalogClient(backend);
        if (!this.sessionCwds.has(sessionId))
            await this.listCatalogSessions(backend);
        assertCurrent();
        const session = this.sessionCwds.get(sessionId);
        if (!session || session.backend !== backend)
            throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session has no trusted workspace.');
        const canonical = await this.requireExistingDirectory(session.cwd);
        assertCurrent();
        const current = this.sessionCwds.get(sessionId);
        if (canonical !== session.cwd || current?.backend !== backend || current.cwd !== canonical) {
            throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session workspace authority changed.');
        }
        return canonical;
    }
    async requireExistingDirectory(path) {
        if (!isAbsolute(path)) {
            throw new RpcError('CURSOR_PATH_NOT_ALLOWED', 'The Cursor working directory must be an absolute path.');
        }
        try {
            const canonical = await realpath(path);
            const info = await stat(canonical);
            if (!info.isDirectory()) {
                throw new RpcError('CURSOR_PATH_NOT_ALLOWED', 'The Cursor working directory must be an existing directory.');
            }
            return canonical;
        }
        catch (error) {
            if (error instanceof RpcError)
                throw error;
            throw new RpcError('CURSOR_PATH_NOT_ALLOWED', 'The Cursor working directory must be an existing directory.');
        }
    }
    async listDirectory(path) {
        const home = homedir();
        const target = path.trim() === '~' || path.trim() === ''
            ? home
            : path.startsWith('~/')
                ? join(home, path.slice(2))
                : path;
        const canonical = await this.requireExistingDirectory(isAbsolute(target) ? target : resolve(target));
        const names = await readdir(canonical);
        const entries = [];
        let truncated = false;
        for (const name of names.sort((a, b) => a.localeCompare(b))) {
            if (entries.length >= ACP_DIRECTORY_ENTRY_LIMIT) {
                truncated = true;
                break;
            }
            const child = join(canonical, name);
            try {
                const info = await stat(child);
                if (!info.isDirectory())
                    continue;
                entries.push({ name, path: child, hidden: name.startsWith('.') });
            }
            catch {
                // Skip unreadable entries.
            }
        }
        return {
            path: canonical,
            home,
            crumbs: buildCrumbs(canonical, home),
            entries,
            truncated,
        };
    }
    async disposeInstance(inst) {
        inst.unsubscribeInbound();
        inst.unsubscribeUnavailable();
        await inst.client.close();
    }
    async disposeAllInstances() {
        for (const inst of this.backendInstances.values()) {
            await this.disposeInstance(inst);
        }
        this.backendInstances.clear();
    }
}
function parseCallEnvelope(input) {
    if (!isRecord(input) || typeof input.method !== 'string') {
        throw new RpcError('INVALID_MESSAGE', 'The Cursor call envelope is invalid.');
    }
    return { method: input.method, params: input.params ?? {} };
}
function parseRespondEnvelope(input) {
    if (!isRecord(input) || typeof input.requestHandle !== 'string' || input.requestHandle.length === 0
        || Object.keys(input).some(key => !['requestHandle', 'decision', 'result'].includes(key))
        || typeof input.decision !== 'string' || !['allow-once', 'reject-once', 'cancel'].includes(input.decision)) {
        throw new RpcError('INVALID_MESSAGE', 'The ACP respond envelope is invalid.');
    }
    return input;
}
function permissionOptions(params) {
    if (!isRecord(params) || !Array.isArray(params.options) || params.options.length === 0) {
        throw new Error('Missing permission options');
    }
    const ids = new Set();
    const options = params.options.map(option => {
        if (!isRecord(option) || typeof option.optionId !== 'string' || !option.optionId
            || typeof option.kind !== 'string' || !['allow_once', 'allow_always', 'reject_once', 'reject_always'].includes(option.kind)
            || ids.has(option.optionId))
            throw new Error('Invalid permission option');
        ids.add(option.optionId);
        return { kind: option.kind, optionId: option.optionId };
    });
    for (const kind of ['allow_once', 'reject_once']) {
        if (options.filter(option => option.kind === kind).length > 1)
            throw new Error('Ambiguous permission option');
    }
    return options;
}
function mapPermissionDecision(params, pending) {
    const invalid = () => new RpcError('INVALID_MESSAGE', 'The ACP approval result is not allowed.');
    if (pending.method === 'session/request_permission') {
        if (params.result !== undefined)
            throw invalid();
        if (params.decision === 'cancel')
            return undefined;
        const kind = params.decision === 'allow-once' ? 'allow_once' : 'reject_once';
        const option = pending.options.find(item => item.kind === kind);
        if (!option)
            throw invalid();
        return { outcome: { outcome: 'selected', optionId: option.optionId } };
    }
    const outcome = pending.method === 'cursor/create_plan'
        ? params.decision === 'allow-once' ? 'accepted' : params.decision === 'cancel' ? 'cancelled' : 'rejected'
        : 'cancelled';
    if (params.result !== undefined) {
        if (!isRecord(params.result) || Object.keys(params.result).length !== 1
            || !isRecord(params.result.outcome) || Object.keys(params.result.outcome).length !== 1
            || params.result.outcome.outcome !== outcome)
            throw invalid();
    }
    return { outcome: { outcome } };
}
function readSessionId(value) {
    if (!isRecord(value))
        return undefined;
    return typeof value.sessionId === 'string' ? value.sessionId : undefined;
}
function readNestedSessionId(value) {
    if (!isRecord(value))
        return undefined;
    if (isRecord(value.update) && typeof value.update.sessionId === 'string')
        return value.update.sessionId;
    return undefined;
}
function sanitizeSessionResult(value) {
    if (!isRecord(value))
        return value;
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
        if (key === 'sessionId' || key === 'stopReason' || key === 'mode')
            next[key] = entry;
    }
    return Object.keys(next).length > 0 ? next : value;
}
function buildCrumbs(path, home) {
    const crumbs = [];
    let current = path;
    while (true) {
        crumbs.unshift({
            name: current === home ? '~' : basename(current) || current,
            path: current,
            hidden: false,
        });
        const parent = resolve(current, '..');
        if (parent === current)
            break;
        if (home !== '' && relative(home, current) === '' && current !== home)
            break;
        current = parent;
        if (crumbs.length >= 32)
            break;
    }
    return crumbs;
}
/**
 * Prefer `~/.local/bin/agent` when the user kept the default command. Explicit
 * binary configuration is never rewritten.
 */
export function cursorBinaryCandidates(configured) {
    const userHome = homedir();
    if (configured === 'agy' || configured === 'antigravity') {
        return [
            join(userHome, '.local', 'bin', 'agy'),
            'agy',
        ];
    }
    if (configured === 'agent' || configured === 'cursor') {
        return [
            join(userHome, '.local', 'bin', 'agent'),
            'agent',
        ];
    }
    if (configured === 'opencode') {
        return [
            // Official installer location (curl -fsSL https://opencode.ai/install | bash).
            join(userHome, '.opencode', 'bin', 'opencode'),
            join(userHome, '.local', 'bin', 'opencode'),
            'opencode',
        ];
    }
    return [configured];
}
function errorCode(error) {
    if (error instanceof CursorAcpError || error instanceof OpencodeAcpError || error instanceof RpcError)
        return error.code;
    return 'CURSOR_UNAVAILABLE';
}
function shortSessionId(sessionId) {
    return sessionId.length <= 16 ? sessionId : `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}
function takeTurnCatchUp(turnCatchUp, sessionId) {
    const list = turnCatchUp.get(sessionId) ?? [];
    turnCatchUp.delete(sessionId);
    return list;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=gateway.js.map
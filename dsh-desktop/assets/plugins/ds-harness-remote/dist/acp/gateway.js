import { createEvent, encodeMessage, MAX_SECURE_MESSAGE_BYTES } from '@dsh-remote/protocol';
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
import { HermesAcpClient } from './adapters/hermes-process.js';
import { PiAcpClient } from './adapters/pi-process.js';
import { AntigravityAcpClient } from './adapters/antigravity-process.js';
import { AntigravityNativeAcpClient, isLegacyAntigravityStreamJsonArgs, supportsAntigravityNativeAcp, } from './adapters/antigravity-acp.js';
import { OpencodeAcpClient, OpencodeAcpError } from './adapters/opencode-process.js';
import { ACP_METHOD_ALLOWLIST, isSessionMutation, isValidAcpBackendId, parseAcpCall, sessionIdFromParams, } from './method-policy.js';
import { discoverAntigravitySessions, discoverAntigravityWorkspaces, loadTranscriptEvents } from './adapters/antigravity/transcript-loader.js';
import { AcpPeerBridge } from './peer-bridge.js';
import { AcpWorkspaceStore } from './workspace-store.js';
const APPROVAL_TTL_MS = 5 * 60_000;
// A backend that stayed up this long before failing starts a fresh retry budget.
const BACKEND_STABLE_MS = 30_000;
const DEFAULT_RESTART_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const STRICT_CATALOG_BACKENDS = new Set(['pi', 'claude', 'opencode', 'hermes']);
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
    restartDelaysMs;
    terminalEnabled;
    terminalSpawner;
    workspaceStore;
    backendInstances = new Map();
    sessionCwds = new Map();
    workspaceState = new WorkspaceBridgeState(key => TerminalPolicy.releaseOwner(this.terminalOwners, key));
    terminalOwners = new Map();
    workspaceTools = new Map();
    peers = new Map();
    sessionOwners = new Map();
    sessionBackends = new Map();
    sessionPermissions = new Map();
    approvals = new Map();
    approvalExpiryTimer;
    restartAttempts = new Map();
    restartTimers = new Map();
    launching = new Map();
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
    historyEpoch = 0;
    minValidHistoryEpoch = 0;
    historyInvalidatedAt = new Map();
    pendingHistoryReads = new Map();
    backendHistoryChains = new Map();
    backendDiagnostics = new Map();
    backendErrors = new Map();
    customCreateAcp;
    constructor(config, logger, createAcp, restartDelaysMs = DEFAULT_RESTART_DELAYS_MS, terminalEnabled = () => false, terminalSpawner, workspaceStore = new AcpWorkspaceStore()) {
        this.config = config;
        this.logger = logger;
        this.restartDelaysMs = restartDelaysMs;
        this.terminalEnabled = terminalEnabled;
        this.terminalSpawner = terminalSpawner;
        this.workspaceStore = workspaceStore;
        this.customCreateAcp = createAcp !== undefined;
        this.createAcp = createAcp ?? ((binary, targetLogger, backend) => {
            if (backend.id === 'antigravity') {
                if (isLegacyAntigravityStreamJsonArgs(backend.args)) {
                    return new AntigravityAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
                }
                return new AntigravityNativeAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
            }
            if (backend.id === 'claude')
                return new ClaudeAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
            if (backend.id === 'hermes')
                return new HermesAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
            if (backend.id === 'pi')
                return new PiAcpClient(binary, targetLogger, { args: backend.args, cwd: backend.cwd });
            if (backend.id === 'opencode') {
                return new OpencodeAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd });
            }
            if (backend.id === 'cursor') {
                return new IsolatedAcpClient(binary, targetLogger, { args: backend.args, cwd: backend.cwd, backend: 'cursor' });
            }
            return new ClaudeAcpClient(binary, targetLogger, undefined, { args: backend.args, cwd: backend.cwd }, backend.id);
        });
    }
    createAcp;
    /** Allow all valid enabled ACP adapters, including custom `settings.acp.add` backends. */
    enabledBackends() {
        if (!this.config.enabled)
            return [];
        return this.config.backends
            .filter(item => item.enabled && item.id !== 'codex' && item.id !== 'kimi' && isValidAcpBackendId(item.id))
            .map(item => item.id);
    }
    diagnostics() {
        const result = {};
        for (const backend of this.config.backends) {
            if (backend.id === 'codex' || backend.id === 'kimi')
                continue;
            const inst = this.backendInstances.get(backend.id);
            const ready = this.config.enabled && backend.enabled && !this.pendingReconfiguration.has(backend.id) && inst?.client.isReady() === true;
            const state = !this.config.enabled || !backend.enabled
                ? 'disabled'
                : ready ? 'ready' : 'unavailable';
            const clientDiag = inst?.client.diagnostics?.();
            const storedDiag = this.backendDiagnostics.get(backend.id);
            const errorCode = ready ? undefined : (this.backendErrors.get(backend.id) ?? clientDiag?.errorCode ?? storedDiag?.errorCode);
            const auth = ready
                ? (clientDiag ?? { authStatus: 'authenticated' })
                : (storedDiag ?? clientDiag ?? { authStatus: 'unknown' });
            result[backend.id] = {
                state,
                ...(errorCode ? { errorCode } : {}),
                auth,
                capabilities: (inst?.client.capabilities?.() ?? {}),
            };
        }
        return result;
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
            restartAttempt: Math.max(0, ...this.restartAttempts.values()),
            availableBackends: this.availableBackends(),
            ...(this.unavailableCode === undefined ? {} : { error: this.unavailableCode }),
        };
    }
    createPeer(context, publish) {
        const bridge = new AcpPeerBridge(this, context, publish, this.logger);
        this.peers.set(context.connectionId, bridge);
        const workspaceBridge = new WorkspaceBridge(async (rawId) => {
            const parsed = parsePublicSessionId(rawId);
            const session = parsed ? this.sessionCwds.get(parsed.nativeId) : undefined;
            if (!parsed || !session || session.backend !== parsed.backend) {
                throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session has no trusted workspace.');
            }
            this.requireAcp(parsed.backend);
            this.requireSessionOwner(context.connectionId, parsed.nativeId);
            return session.cwd;
        }, this.terminalEnabled, this.workspaceState, this.terminalSpawner, {
            domain: 'ACP',
            owns: value => typeof value === 'string' && parsePublicSessionId(value) !== undefined,
            parse: value => typeof value === 'string' && parsePublicSessionId(value, true) !== undefined
                ? { sessionId: value, nativeId: value } : undefined,
        });
        this.workspaceTools.set(context.connectionId, new AcpWorkspaceTools(workspaceBridge, new TerminalPolicy(this.terminalEnabled, context.peerDeviceId, this.terminalOwners)));
        return bridge;
    }
    async call(connectionId, input) {
        const envelope = parseCallEnvelope(input);
        const call = parseAcpCall(envelope.method, envelope.params);
        const sessionId = sessionIdFromParams(call.method, call.params);
        const backend = typeof call.params.backend === 'string'
            ? call.params.backend
            : call.method === 'dsh/sessionHistory'
                ? this.resolveHistoryTarget(call.params).backend
                : (sessionId ? this.sessionBackends.get(sessionId) ?? this.defaultBackend() : undefined);
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
    resolveHistoryTarget(params) {
        const rawSessionId = String(params.sessionId);
        const parsedPrefix = parsePublicSessionId(rawSessionId);
        const conversationId = parsedPrefix ? parsedPrefix.nativeId : rawSessionId;
        const boundBackend = this.sessionBackends.get(conversationId);
        const backend = typeof params.backend === 'string'
            ? params.backend
            : parsedPrefix?.backend ?? boundBackend ?? this.defaultBackend();
        return { rawSessionId, parsedPrefix, conversationId, boundBackend, backend };
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
            const parsedPrefix = typeof call.params.sessionId === 'string' ? parsePublicSessionId(call.params.sessionId) : undefined;
            if (parsedPrefix && parsedPrefix.backend !== call.params.backend) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            }
            const sessionId = call.method === 'dsh/sessionHistory' && parsedPrefix
                ? parsedPrefix.nativeId
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
        if (call.method === 'dsh/workspaceCreate') {
            const backend = String(call.params.backend);
            this.requireAcp(backend);
            const canonical = await this.requireExistingDirectory(String(call.params.path));
            assertCurrent();
            const title = typeof call.params.title === 'string' ? call.params.title : undefined;
            const entry = await this.workspaceStore.upsertWorkspace(backend, canonical, title);
            return { path: entry.path, title: entry.title ?? (basename(entry.path) || 'workspace'), updatedAt: entry.updatedAt };
        }
        if (call.method === 'dsh/workspaceRename') {
            const backend = String(call.params.backend);
            this.requireAcp(backend);
            const canonical = await this.requireExistingDirectory(String(call.params.path)).catch(() => String(call.params.path));
            assertCurrent();
            const entry = await this.workspaceStore.renameWorkspace(backend, canonical, String(call.params.title));
            return { path: entry.path, title: entry.title ?? (basename(entry.path) || 'workspace'), updatedAt: entry.updatedAt };
        }
        if (call.method === 'dsh/workspaceDelete') {
            const backend = String(call.params.backend);
            this.requireAcp(backend);
            const rawPath = String(call.params.path);
            const canonical = await realpath(rawPath).catch(() => rawPath);
            assertCurrent();
            await this.workspaceStore.deleteWorkspace(backend, canonical);
            if (canonical !== rawPath)
                await this.workspaceStore.deleteWorkspace(backend, rawPath);
            return { deleted: true, path: canonical };
        }
        if (call.method === 'dsh/workspaceReorder') {
            const backend = String(call.params.backend);
            this.requireAcp(backend);
            const rawPaths = Array.isArray(call.params.paths) ? call.params.paths.filter((p) => typeof p === 'string') : [];
            const canonicalPaths = await Promise.all(rawPaths.map(p => realpath(p).catch(() => p)));
            assertCurrent();
            const paths = await this.workspaceStore.reorderWorkspaces(backend, canonicalPaths);
            return { paths };
        }
        if (call.method === 'dsh/sessionPin') {
            const backend = String(call.params.backend);
            this.requireAcp(backend);
            const pinnedSessionIds = await this.workspaceStore.pinSession(backend, String(call.params.sessionId));
            return { pinnedSessionIds };
        }
        if (call.method === 'dsh/sessionUnpin') {
            const backend = String(call.params.backend);
            this.requireAcp(backend);
            const pinnedSessionIds = await this.workspaceStore.unpinSession(backend, String(call.params.sessionId));
            return { pinnedSessionIds };
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
                this.invalidateSessionHistory(sessionId);
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
            const { workspaces: persisted, deletedPaths } = await this.workspaceStore.listWorkspaces(requestedBackend);
            assertCurrent();
            const merged = new Map();
            for (const item of persisted) {
                const canonical = await this.requireExistingDirectory(item.path).catch(() => undefined);
                assertCurrent();
                if (!canonical || deletedPaths.has(canonical))
                    continue;
                merged.set(canonical, { path: canonical, title: item.title ?? (basename(canonical) || 'workspace') });
            }
            if (this.isNativeCatalogBackend(requestedBackend)) {
                const sessions = await this.listCatalogSessions(requestedBackend);
                for (const item of sessions) {
                    if (deletedPaths.has(item.cwd))
                        continue;
                    if (!merged.has(item.cwd)) {
                        merged.set(item.cwd, { path: item.cwd, title: basename(item.cwd) || 'workspace' });
                    }
                }
                if (merged.size === 0 && deletedPaths.size === 0 && (requestedBackend === 'opencode' || requestedBackend === 'cursor')) {
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
                return [...merged.values()];
            }
            const candidates = new Set();
            if (merged.size === 0 && deletedPaths.size === 0) {
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
            }
            if (requestedBackend === 'antigravity') {
                try {
                    const agyDirs = await discoverAntigravityWorkspaces();
                    for (const d of agyDirs) {
                        if (!deletedPaths.has(d))
                            candidates.add(d);
                    }
                }
                catch {
                    // ignore
                }
            }
            for (const candidate of candidates) {
                if (!deletedPaths.has(candidate) && !merged.has(candidate)) {
                    merged.set(candidate, { path: candidate, title: basename(candidate) || 'workspace' });
                }
            }
            const results = await Promise.all([...merged.values()].map(async (entry) => {
                let sessionCount = entry.sessionCount ?? 0;
                if (requestedBackend === 'antigravity') {
                    try {
                        const sessions = await discoverAntigravitySessions(entry.path, 100);
                        sessionCount = sessions.length;
                    }
                    catch {
                        // ignore
                    }
                }
                return {
                    path: entry.path,
                    title: entry.title,
                    ...(sessionCount > 0 ? { sessionCount } : {}),
                };
            }));
            return results;
        }
        if (call.method === 'dsh/sessionList') {
            const limit = typeof call.params.limit === 'number' ? call.params.limit : 30;
            const path = String(call.params.path || '');
            const backend = typeof call.params.backend === 'string' ? call.params.backend : this.defaultBackend();
            if (backend === 'antigravity' && !this.isNativeCatalogBackend('antigravity')) {
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
            if (this.isNativeCatalogBackend(backend)) {
                const cwd = path ? await this.requireExistingDirectory(path) : undefined;
                const sessions = await this.listCatalogSessions(backend, cwd);
                sessions.sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0)
                    || a.sessionId.localeCompare(b.sessionId));
                const pinnedSessionIds = await this.workspaceStore.getPinnedSessions(backend);
                return {
                    items: sessions.slice(0, limit).map(item => ({
                        conversationId: item.sessionId,
                        title: item.title ?? 'Untitled Session',
                        createdAt: Date.parse(item.updatedAt ?? '') || 0,
                        updatedAt: Date.parse(item.updatedAt ?? '') || 0,
                        cwd: item.cwd,
                    })),
                    ...(pinnedSessionIds.length > 0 ? { pinnedSessionIds } : {}),
                };
            }
            return { items: [] };
        }
        if (call.method === 'dsh/sessionHistory') {
            const { rawSessionId, parsedPrefix, conversationId, boundBackend, backend } = this.resolveHistoryTarget(call.params);
            if ((boundBackend !== undefined && boundBackend !== backend)
                || (parsedPrefix && parsedPrefix.backend !== backend)) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            }
            this.requireAcp(backend);
            const persistedPreset = this.sessionPermissions.get(conversationId)
                ?? await this.workspaceStore.getSessionPermission(conversationId);
            if (persistedPreset)
                this.sessionPermissions.set(conversationId, persistedPreset);
            if (this.isNativeCatalogBackend(backend)) {
                const cwd = await this.catalogSessionCwd(backend, conversationId);
                assertCurrent();
                // History uses an isolated reader and must neither require nor claim
                // the live session's control ownership.
                const client = this.requireAcp(backend);
                if (!client.history) {
                    return { events: [], ...(persistedPreset ? { permissionPreset: persistedPreset } : {}) };
                }
                const events = await this.readCatalogHistory(backend, client, conversationId, cwd, assertCurrent);
                const cachedMeta = client.lastHistoryMetadata?.(conversationId);
                return {
                    events,
                    ...(persistedPreset ? { permissionPreset: persistedPreset } : {}),
                    ...(cachedMeta?.modes ? { modes: cachedMeta.modes } : {}),
                    ...(cachedMeta?.commands && cachedMeta.commands.length > 0 ? { commands: cachedMeta.commands } : {}),
                };
            }
            if (backend !== 'antigravity')
                return { events: [] };
            const events = await loadTranscriptEvents(conversationId, rawSessionId);
            this.logger.info('ACP session history fetched', {
                sessionId: shortSessionId(rawSessionId),
                eventCount: events.length,
            });
            return { events, ...(persistedPreset ? { permissionPreset: persistedPreset } : {}) };
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
            const client = this.requireAcp(requested);
            const supportsImages = requested === 'antigravity'
                || requested === 'hermes'
                || client.capabilities?.()?.promptCapabilities?.image === true;
            if (Array.isArray(call.params.prompt) && call.params.prompt.some(part => isRecord(part) && part.type === 'image') && !supportsImages) {
                throw new RpcError('METHOD_NOT_ALLOWED', 'This ACP backend does not accept image prompts.');
            }
            if (sessionId !== undefined && !this.sessionPermissions.has(sessionId)) {
                const persistedPreset = await this.workspaceStore.getSessionPermission(sessionId);
                assertCurrent();
                if (persistedPreset)
                    this.sessionPermissions.set(sessionId, persistedPreset);
            }
            this.sessionBackends.set(sessionId, requested);
        }
        if (call.method === 'session/load') {
            const boundBackend = sessionId !== undefined ? this.sessionBackends.get(sessionId) : undefined;
            if (typeof call.params.backend !== 'string')
                throw new RpcError('INVALID_MESSAGE', 'Session load requires an explicit backend.');
            const targetBackend = call.params.backend;
            if (this.isPerSessionIsolatedBackend(targetBackend) && this.promptsInProgress.has(sessionId)) {
                throw new RpcError('PROMPT_IN_PROGRESS', 'An ACP reply is already in progress.');
            }
            if (boundBackend !== undefined && targetBackend !== boundBackend) {
                throw new RpcError('INVALID_MESSAGE', 'The ACP session backend does not match.');
            }
            if (this.requiresCatalogCwd(targetBackend))
                await this.catalogSessionCwd(targetBackend, sessionId);
            else if (this.isNativeCatalogBackend(targetBackend) && !this.sessionCwds.has(sessionId)) {
                await this.listCatalogSessions(targetBackend).catch(() => undefined);
            }
            assertCurrent();
            const existingOwner = this.sessionOwners.get(sessionId);
            if (existingOwner !== undefined && existingOwner !== connectionId) {
                throw new RpcError('CURSOR_SESSION_OWNED', 'Another Remote connection owns this session.');
            }
            const acp = this.requireAcp(targetBackend);
            const result = await acp.call(call.method, { ...call.params, ...(sessionId && this.sessionCwds.get(sessionId) ? { cwd: this.sessionCwds.get(sessionId).cwd, mcpServers: [] } : {}) });
            assertCurrent();
            const loadedId = readSessionId(result) ?? sessionId;
            if (loadedId !== undefined) {
                const currentOwner = this.sessionOwners.get(loadedId);
                if (currentOwner !== undefined && currentOwner !== connectionId) {
                    throw new RpcError('CURSOR_SESSION_OWNED', 'Another Remote connection owns this session.');
                }
                const currentBackend = this.sessionBackends.get(loadedId);
                if (loadedId !== sessionId || (currentBackend !== undefined && currentBackend !== targetBackend)) {
                    throw new RpcError('ACP_SESSION_COLLISION', 'The ACP backend returned a different session identifier.');
                }
                let persistedPreset;
                if (!this.sessionPermissions.has(loadedId)) {
                    persistedPreset = await this.workspaceStore.getSessionPermission(loadedId);
                    assertCurrent();
                    const postOwner = this.sessionOwners.get(loadedId);
                    if (postOwner !== undefined && postOwner !== connectionId) {
                        throw new RpcError('CURSOR_SESSION_OWNED', 'Another Remote connection owns this session.');
                    }
                    const postBackend = this.sessionBackends.get(loadedId);
                    if (postBackend !== undefined && postBackend !== targetBackend) {
                        throw new RpcError('ACP_SESSION_COLLISION', 'The ACP backend returned a different session identifier.');
                    }
                }
                this.sessionOwners.set(loadedId, connectionId);
                this.sessionBackends.set(loadedId, targetBackend);
                if (persistedPreset)
                    this.sessionPermissions.set(loadedId, persistedPreset);
            }
            return sanitizeSessionResult(result);
        }
        if (isSessionMutation(call.method) && sessionId !== undefined) {
            this.requireSessionOwner(connectionId, sessionId);
        }
        if (call.method === 'dsh/sessionModels' || call.method === 'dsh/selectModel'
            || call.method === 'dsh/sessionModes' || call.method === 'session/set_mode') {
            const preloadBackend = typeof call.params.backend === 'string'
                ? call.params.backend
                : (sessionId ? this.sessionBackends.get(sessionId) : undefined);
            if (preloadBackend !== undefined && sessionId !== undefined && this.requiresCatalogCwd(preloadBackend)) {
                this.requireSessionOwner(connectionId, sessionId);
                const cwd = await this.catalogSessionCwd(preloadBackend, sessionId);
                assertCurrent();
                await this.requireAcp(preloadBackend).call('session/load', { sessionId, cwd, mcpServers: [] });
                assertCurrent();
            }
            else if (preloadBackend === 'cursor' && sessionId !== undefined) {
                if (!this.sessionCwds.has(sessionId) && this.isNativeCatalogBackend('cursor')) {
                    await this.listCatalogSessions('cursor').catch(() => undefined);
                    assertCurrent();
                }
                const entry = this.sessionCwds.get(sessionId);
                if (entry?.backend === 'cursor') {
                    this.requireSessionOwner(connectionId, sessionId);
                    await this.requireAcp('cursor').call('session/load', { sessionId, cwd: entry.cwd, mcpServers: [] });
                    assertCurrent();
                }
            }
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
        if (call.method === 'session/set_mode') {
            if (this.promptsInProgress.has(sessionId))
                throw new RpcError('PROMPT_IN_PROGRESS', 'Stop the ACP reply before changing its mode.');
            const backend = typeof call.params.backend === 'string' ? call.params.backend : this.sessionBackends.get(sessionId) ?? this.defaultBackend();
            const acp = this.requireAcp(backend);
            const result = await acp.call('session/set_mode', { sessionId, modeId: call.params.modeId });
            assertCurrent();
            return sanitizeSessionResult(result);
        }
        if (call.method === 'dsh/sessionModes' || call.method === 'dsh/sessionCommands') {
            const backend = typeof call.params.backend === 'string' ? call.params.backend : this.sessionBackends.get(sessionId) ?? this.defaultBackend();
            return this.requireAcp(backend).call(call.method, { sessionId });
        }
        if (call.method === 'session/fork') {
            if (this.promptsInProgress.has(sessionId))
                throw new RpcError('PROMPT_IN_PROGRESS', 'Stop the ACP reply before forking the session.');
            const backend = typeof call.params.backend === 'string' ? call.params.backend : this.sessionBackends.get(sessionId) ?? this.defaultBackend();
            const acp = this.requireAcp(backend);
            const caps = acp.capabilities?.();
            if (!caps?.sessionCapabilities?.fork) {
                throw new RpcError('METHOD_NOT_ALLOWED', `The ${backend} ACP backend does not support session fork.`);
            }
            if (!this.sessionCwds.has(sessionId)) {
                if (this.requiresCatalogCwd(backend)) {
                    await this.catalogSessionCwd(backend, sessionId);
                }
                else if (this.isNativeCatalogBackend(backend)) {
                    await this.listCatalogSessions(backend).catch(() => undefined);
                }
                assertCurrent();
            }
            const session = this.sessionCwds.get(sessionId);
            const result = await acp.call('session/fork', { sessionId, ...(session ? { cwd: session.cwd } : {}) });
            assertCurrent();
            const forkedId = readSessionId(result);
            if (forkedId !== undefined) {
                this.sessionOwners.set(forkedId, connectionId);
                this.sessionBackends.set(forkedId, backend);
                if (session)
                    this.sessionCwds.set(forkedId, { backend, cwd: session.cwd });
            }
            return sanitizeSessionResult(result);
        }
        if (call.method === 'dsh/selectPermission') {
            this.requireSessionOwner(connectionId, sessionId);
            const preset = typeof call.params.preset === 'string' ? call.params.preset : undefined;
            if (preset !== 'workspace-write' && preset !== 'danger-full-access') {
                throw new RpcError('INVALID_MESSAGE', 'Unknown permission preset.');
            }
            this.sessionPermissions.set(sessionId, preset);
            await this.workspaceStore.setSessionPermission(sessionId, preset);
            assertCurrent();
            const backend = typeof call.params.backend === 'string' ? call.params.backend : this.sessionBackends.get(sessionId);
            if (backend) {
                await this.syncPermissionModeIfCompatible(backend, sessionId, preset).catch(() => undefined);
            }
            return { preset };
        }
        // session/prompt blocks until the upstream turn ends. Returning that RPC
        // only after completion prevents some Client transports from delivering
        // interleaved agent.acp.frame events (Android stays on "正在回复" with no
        // thought/text). Accept immediately and finish via stream updates.
        if (call.method === 'session/prompt' && sessionId !== undefined) {
            if (this.promptsInProgress.has(sessionId))
                throw new RpcError('PROMPT_IN_PROGRESS', 'An ACP reply is already in progress.');
            this.invalidateSessionHistory(sessionId);
            const backend = this.sessionBackends.get(sessionId) ?? this.defaultBackend();
            const task = { backend, client: this.requireAcp(backend) };
            this.promptsInProgress.set(sessionId, task);
            this.cancelledSessions.delete(sessionId);
            const preparationBackend = this.sessionBackends.get(sessionId);
            if (preparationBackend && this.requiresPrePromptLoad(preparationBackend)) {
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
            this.invalidateSessionHistory(sessionId);
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
        // A turn belongs to the session, not to the adapter that ran it: a retry may
        // replace the crashed client while the inbound queue drains.
        const accepted = () => !this.closed && this.promptsInProgress.get(sessionId) === task;
        const current = () => accepted() && !this.pendingReconfiguration.has(task.backend)
            && this.backendInstances.get(task.backend)?.client === task.client;
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
            const usage = isRecord(result) ? sanitizeUsage(result.usage) : undefined;
            const catchUp = takeTurnCatchUp(this.turnCatchUp, sessionId);
            this.logger.info('ACP prompt finished', {
                sessionId: shortSessionId(sessionId),
                stopReason,
                catchUp: catchUp.length,
            });
            await this.publishToSession(sessionId, this.buildTerminalPromptFrame(sessionId, {
                sessionUpdate: 'prompt_completed',
                stopReason,
                ...(usage ? { usage } : {}),
            }, catchUp));
        }
        catch (error) {
            if (!accepted())
                return;
            this.logger?.warn('ACP session/prompt failed', { code: errorCode(error) });
            await this.inboundChain.catch(() => undefined);
            if (!accepted())
                return;
            const catchUp = takeTurnCatchUp(this.turnCatchUp, sessionId);
            await this.publishToSession(sessionId, this.buildTerminalPromptFrame(sessionId, {
                sessionUpdate: 'prompt_failed',
                code: errorCode(error),
            }, catchUp)).catch(() => undefined);
        }
        finally {
            if (this.promptsInProgress.get(sessionId) === task) {
                this.promptsInProgress.delete(sessionId);
                this.invalidateSessionHistory(sessionId);
                // The Client has now been told how the turn ended, so a session whose
                // adapter died can be closed instead of waiting for a producer.
                if (!this.isSessionBackendReady(sessionId))
                    await this.failSessionStreams(sessionId);
            }
        }
    }
    invalidateSessionHistory(sessionId) {
        const invalidationEpoch = ++this.historyEpoch;
        this.historyInvalidatedAt.delete(sessionId);
        this.historyInvalidatedAt.set(sessionId, invalidationEpoch);
        while (this.historyInvalidatedAt.size > 256) {
            const oldestKey = this.historyInvalidatedAt.keys().next().value;
            if (oldestKey === undefined)
                break;
            const oldestEpoch = this.historyInvalidatedAt.get(oldestKey) ?? 0;
            this.minValidHistoryEpoch = Math.max(this.minValidHistoryEpoch, oldestEpoch);
            this.historyInvalidatedAt.delete(oldestKey);
        }
        for (const key of this.pendingHistoryReads.keys()) {
            if (key.endsWith(`:${sessionId}`)) {
                this.pendingHistoryReads.delete(key);
            }
        }
    }
    isHistoryEpochValid(sessionId, readEpoch) {
        return readEpoch > this.minValidHistoryEpoch && readEpoch > (this.historyInvalidatedAt.get(sessionId) ?? 0);
    }
    async readCatalogHistory(backend, client, conversationId, cwd, assertCurrent) {
        const key = `${backend}:${conversationId}`;
        const existing = this.pendingHistoryReads.get(key);
        if (existing !== undefined
            && existing.client === client
            && this.isHistoryEpochValid(conversationId, existing.readEpoch)) {
            const events = await existing.promise;
            assertCurrent();
            return events;
        }
        const readEpoch = ++this.historyEpoch;
        const previous = this.backendHistoryChains.get(backend) ?? Promise.resolve();
        let releaseQueue;
        const currentTurn = new Promise(resolve => { releaseQueue = resolve; });
        const nextChain = previous.then(() => currentTurn, () => currentTurn);
        this.backendHistoryChains.set(backend, nextChain);
        const readPromise = (async () => {
            await previous.catch(() => undefined);
            try {
                assertCurrent();
                if (this.requireAcp(backend) !== client) {
                    throw new RpcError('CURSOR_UNAVAILABLE', `The ${backend} ACP backend is not ready.`);
                }
                return await client.history(conversationId, cwd);
            }
            finally {
                releaseQueue();
                if (this.backendHistoryChains.get(backend) === nextChain) {
                    this.backendHistoryChains.delete(backend);
                }
            }
        })();
        this.pendingHistoryReads.set(key, { client, readEpoch, promise: readPromise });
        try {
            const events = await readPromise;
            assertCurrent();
            return events;
        }
        finally {
            if (this.pendingHistoryReads.get(key)?.promise === readPromise) {
                this.pendingHistoryReads.delete(key);
            }
        }
    }
    async failSessionStreams(sessionId) {
        const sessions = new Set([sessionId]);
        await Promise.all([...this.peers.values()].map(peer => peer.failStreams('failed', sessions).catch(() => undefined)));
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
        const parsed = parsePublicSessionId(publicId);
        const session = parsed ? this.sessionCwds.get(parsed.nativeId) : undefined;
        if (!this.peers.has(connectionId) || !parsed || !session || session.backend !== parsed.backend || this.closed) {
            throw new RpcError('ACP_WORKSPACE_UNAVAILABLE', 'The ACP session has no trusted workspace.');
        }
        this.requireAcp(parsed.backend);
        this.requireSessionOwner(connectionId, parsed.nativeId);
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
    /** Whether the session still has a turn whose terminal event has not arrived. */
    hasTurnInFlight(sessionId) {
        return this.promptsInProgress.has(sessionId);
    }
    /** Whether the adapter that owns this session can still produce frames. */
    isSessionBackendReady(sessionId) {
        const backend = this.sessionBackends.get(sessionId);
        if (backend === undefined)
            return true;
        if (!this.isAvailable())
            return false;
        const instance = this.backendInstances.get(backend);
        return instance !== undefined && instance.client.isReady() && !this.pendingReconfiguration.has(backend);
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
            try {
                await peer.publishInbound(sessionId, { method: frame.method, params: frame.params });
            }
            catch (error) {
                if (isResponseTooLarge(error)) {
                    this.logger.warn('Skipped oversized buffered ACP frame during replay', {
                        sessionId: shortSessionId(sessionId),
                        method: frame.method,
                    });
                    continue;
                }
                throw error;
            }
        }
    }
    async reconfigure(config) {
        if (this.closed)
            throw new RpcError('CURSOR_CLOSED', 'The ACP Remote domain is closed.');
        const previous = this.config;
        const implemented = (value) => ({
            enabled: value.enabled,
            backends: value.backends.filter(item => item.id !== 'codex' && item.id !== 'kimi' && isValidAcpBackendId(item.id)),
        });
        this.config = config;
        if (JSON.stringify(implemented(previous)) === JSON.stringify(implemented(config)) && this.pendingReconfiguration.size === 0)
            return;
        this.clearBackendRestarts();
        const changed = new Set([
            ...this.pendingReconfiguration,
            ...previous.backends.filter(item => {
                const next = config.backends.find(candidate => candidate.id === item.id);
                return previous.enabled !== config.enabled || JSON.stringify(item) !== JSON.stringify(next);
            }).map(item => item.id),
            ...config.backends.filter(item => !previous.backends.some(prev => prev.id === item.id)).map(item => item.id),
        ]);
        for (const id of changed) {
            this.pendingReconfiguration.add(id);
            this.backendDiagnostics.delete(id);
            this.backendErrors.delete(id);
        }
        const stopping = await Promise.allSettled([...this.startingClients].filter(([, backend]) => changed.has(backend.id)).map(([client]) => client.close()));
        await this.startPromise?.catch(() => undefined);
        const inFlightLaunching = [...changed]
            .map(id => this.launching.get(id)?.promise)
            .filter((task) => task !== undefined);
        if (inFlightLaunching.length > 0)
            await Promise.allSettled(inFlightLaunching);
        const sessions = new Set([...this.sessionBackends].filter(([, backend]) => changed.has(backend)).map(([id]) => id));
        if (sessions.size > 0)
            await Promise.all([...this.peers.values()].map(peer => peer.failStreams('failed', sessions)));
        for (const [id, session] of this.sessionCwds)
            if (changed.has(session.backend))
                this.sessionCwds.delete(id);
        const terminalError = await this.workspaceState.dispose(sessionId => {
            const parsed = parsePublicSessionId(sessionId);
            return changed.has(parsed ? parsed.backend : 'cursor');
        })
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
        this.unavailableCode = terminalError?.code ?? (cleanupFailed ? 'ACP_RECONFIGURE_FAILED' : undefined);
        if (terminalError)
            throw terminalError;
        if (cleanupFailed)
            throw new RpcError('ACP_RECONFIGURE_FAILED', 'Some ACP backend processes could not be stopped. Save the backend settings again to retry.');
        for (const id of changed)
            this.pendingReconfiguration.delete(id);
        await this.start();
        if (this.closed)
            return;
        // A backend that did not come back is retried like any other failure, so a
        // settings change elsewhere cannot leave it parked.
        for (const id of this.enabledBackends()) {
            if (!this.availableBackends().includes(id))
                this.scheduleBackendRestart(id);
        }
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.clearBackendRestarts();
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
            await this.launchSerialized(candidate.id);
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
            return;
        }
        const failure = results.find(result => result.status === 'rejected');
        throw failure?.status === 'rejected' ? failure.reason : new CursorAcpError('CURSOR_BINARY_UNAVAILABLE', 'No ACP backend is available.');
    }
    /**
     * Launch one backend at most once at a time. A retry and a `start()` (from a
     * reconfigure or a later failure) can target the same missing backend; without
     * this both would capture the same previous instance and leak a replacement.
     */
    launchSerialized(id) {
        const candidate = this.config.backends.find(item => item.id === id);
        if (candidate === undefined || !this.enabledBackends().includes(id) || this.pendingReconfiguration.has(id))
            return Promise.resolve();
        if (this.backendInstances.get(id)?.client.isReady())
            return Promise.resolve();
        const configKey = JSON.stringify(candidate);
        const inFlight = this.launching.get(id);
        if (inFlight !== undefined) {
            if (inFlight.configKey === configKey)
                return inFlight.promise;
            return inFlight.promise.catch(() => undefined).then(() => this.launchSerialized(id));
        }
        let entry;
        const promise = this.launchCandidateBinaries(candidate).finally(() => {
            if (this.launching.get(id) === entry)
                this.launching.delete(id);
        });
        entry = { configKey, promise };
        this.launching.set(id, entry);
        return promise;
    }
    async launchCandidateBinaries(candidate) {
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
    }
    backendCurrent(backend) {
        return this.config.enabled && backend.enabled && !this.pendingReconfiguration.has(backend.id)
            && JSON.stringify(this.config.backends.find(item => item.id === backend.id)) === JSON.stringify(backend);
    }
    async launchBackendCandidate(backend, binary) {
        const id = backend.id;
        let effectiveBackend = backend;
        if (!this.customCreateAcp && id === 'antigravity') {
            const hasLegacyArgs = isLegacyAntigravityStreamJsonArgs(backend.args);
            const isDefaultNativeArgs = backend.args.length === 1 && backend.args[0] === 'acp';
            if (hasLegacyArgs || isDefaultNativeArgs) {
                const supportsNative = await supportsAntigravityNativeAcp(binary);
                if (this.closed || !this.backendCurrent(backend))
                    return;
                if (hasLegacyArgs && supportsNative) {
                    effectiveBackend = { ...backend, args: ['acp'] };
                }
                else if (isDefaultNativeArgs && !supportsNative) {
                    effectiveBackend = { ...backend, args: ['--input-format', 'stream-json', '--output-format', 'stream-json'] };
                }
            }
        }
        const acp = this.createAcp(binary, this.logger, effectiveBackend);
        this.startingClients.set(acp, backend);
        try {
            await acp.start();
            if (this.closed || !this.backendCurrent(backend)) {
                await acp.close();
                return;
            }
            const diag = acp.diagnostics?.();
            if (diag)
                this.backendDiagnostics.set(id, diag);
            else
                this.backendDiagnostics.delete(id);
            this.backendErrors.delete(id);
        }
        catch (error) {
            if (this.backendCurrent(backend)) {
                const diag = (error instanceof CursorAcpError ? error.authDiagnostic : undefined) ?? acp.diagnostics?.();
                if (diag)
                    this.backendDiagnostics.set(id, diag);
                this.backendErrors.set(id, errorCode(error));
            }
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
        const unsubscribeUnavailable = acp.onUnavailable(code => { void this.handleUnavailable(id, code); });
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
            startedAt: Date.now(),
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
            if (message.method === 'session/request_permission') {
                options = permissionOptions(message.params);
                const allowOption = options.find(item => item.kind === 'allow_once');
                if (this.sessionPermissions.get(sessionId) === 'danger-full-access' && allowOption) {
                    await client.respond(message.id, { outcome: { outcome: 'selected', optionId: allowOption.optionId } });
                    return;
                }
            }
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
        const oversized = isOversizedAcpFrame(sessionId, frame);
        if (!oversized)
            this.recordTurnCatchUp(sessionId, frame);
        const ownerId = this.sessionOwners.get(sessionId);
        const owner = ownerId === undefined ? undefined : this.peers.get(ownerId);
        // A session belongs to exactly one connection (claimSession rejects a second
        // owner), so its live output must never reach another device. Unclaimed or
        // departed owners buffer for the next claimer instead of broadcasting.
        if (owner === undefined) {
            if (oversized) {
                this.logger.warn('Dropped oversized ACP frame without buffering', {
                    sessionId: shortSessionId(sessionId),
                    method: frame.method,
                });
                return;
            }
            this.bufferFrame(sessionId, frame);
            return;
        }
        try {
            await owner.publishInbound(sessionId, frame);
        }
        catch (error) {
            if (oversized || isResponseTooLarge(error)) {
                const list = this.turnCatchUp.get(sessionId);
                if (list !== undefined && list.at(-1)?.params === frame.params)
                    list.pop();
                this.logger.warn('Dropped oversized ACP frame without buffering', {
                    sessionId: shortSessionId(sessionId),
                    method: frame.method,
                });
                return;
            }
            this.bufferFrame(sessionId, frame);
        }
    }
    buildTerminalPromptFrame(sessionId, baseUpdate, catchUp) {
        const build = (items) => ({
            method: 'session/update',
            params: {
                sessionId,
                update: {
                    ...baseUpdate,
                    ...(items.length > 0 ? { catchUp: items } : {}),
                },
            },
        });
        if (catchUp.length === 0)
            return build([]);
        const full = build(catchUp);
        if (!isOversizedAcpFrame(sessionId, full))
            return full;
        let low = 1;
        let high = catchUp.length - 1;
        let best = build([]);
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const candidate = build(catchUp.slice(catchUp.length - mid));
            if (!isOversizedAcpFrame(sessionId, candidate)) {
                best = candidate;
                low = mid + 1;
            }
            else {
                high = mid - 1;
            }
        }
        this.logger.warn('Trimmed ACP turn catchUp to fit secure channel limit', {
            sessionId: shortSessionId(sessionId),
            originalCount: catchUp.length,
        });
        return best;
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
        if (isOversizedAcpFrame(sessionId, frame)) {
            this.logger.warn('Dropped oversized ACP frame without buffering', {
                sessionId: shortSessionId(sessionId),
                method: frame.method,
            });
            return;
        }
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
    async handleUnavailable(backend, code) {
        if (this.closed)
            return;
        // Scope and close the failed backend's streams before any await: a restart can
        // install a replacement adapter while this handler is suspended, and its own
        // streams must not be failed by the previous generation.
        const sessions = new Set();
        for (const [sessionId, ownerBackend] of this.sessionBackends) {
            // A session with a running turn keeps its stream: closing it now would make a
            // connected Client stop listening before the turn reports how it ended.
            if (ownerBackend === backend && !this.promptsInProgress.has(sessionId))
                sessions.add(sessionId);
        }
        const failures = sessions.size === 0
            ? Promise.resolve()
            : Promise.all([...this.peers.values()].map(peer => peer.failStreams('failed', sessions)));
        // The instance entry stays in place: a prompt already running against it
        // publishes its terminal failure only while `current()` still matches. It is
        // not ready, so `launchAcp` replaces it on the next start.
        const instance = this.backendInstances.get(backend);
        if (instance !== undefined)
            await this.disposeInstance(instance).catch(() => undefined);
        // A crash after real uptime is a new episode; one shortly after launch keeps
        // its budget so a permanently broken adapter cannot retry forever.
        if (instance !== undefined && Date.now() - instance.startedAt >= BACKEND_STABLE_MS) {
            this.restartAttempts.delete(backend);
        }
        await failures;
        if (this.closed)
            return;
        this.available = this.availableBackends().length > 0;
        if (this.available) {
            // Another adapter still answers; surface the loss and retry this one later
            // instead of reporting the whole Remote domain as down.
            this.state = 'ready';
            this.logger.warn('ACP backend unavailable; other backends remain ready', { id: backend, code });
        }
        else {
            this.state = 'restarting';
            this.unavailableCode = code;
        }
        this.scheduleBackendRestart(backend);
    }
    // Retries are tracked per backend so one failing adapter cannot consume, or be
    // reset by, another adapter's attempts.
    scheduleBackendRestart(backend) {
        if (this.closed)
            return;
        if (!this.config.enabled || !this.enabledBackends().includes(backend)) {
            this.syncIdleUnavailableState();
            return;
        }
        if (this.pendingReconfiguration.has(backend))
            return;
        if (this.restartTimers.has(backend))
            return;
        const attempt = this.restartAttempts.get(backend) ?? 0;
        if (attempt >= this.restartDelaysMs.length) {
            this.logger.warn('ACP backend restart attempts exhausted', { id: backend });
            this.syncIdleUnavailableState();
            return;
        }
        this.restartAttempts.set(backend, attempt + 1);
        const timer = setTimeout(() => {
            this.restartTimers.delete(backend);
            void this.restartBackend(backend);
        }, this.restartDelaysMs[attempt]);
        timer.unref?.();
        this.restartTimers.set(backend, timer);
    }
    syncIdleUnavailableState() {
        if (this.closed || this.pendingReconfiguration.size > 0 || this.isAvailable())
            return;
        if (this.restartTimers.size > 0 || this.launching.size > 0)
            return;
        this.state = this.config.enabled && this.enabledBackends().length > 0 ? 'unavailable' : 'disabled';
    }
    async restartBackend(backend) {
        if (this.closed)
            return;
        try {
            await this.launchSerialized(backend);
            if (!this.closed && this.pendingReconfiguration.size === 0 && this.isAvailable())
                this.state = 'ready';
        }
        catch (error) {
            this.logger.warn('ACP backend restart failed', { id: backend, code: errorCode(error) });
            if (!this.isAvailable())
                this.unavailableCode ??= errorCode(error);
        }
        if (this.closed)
            return;
        if (this.availableBackends().includes(backend))
            return;
        this.scheduleBackendRestart(backend);
    }
    clearBackendRestarts() {
        for (const timer of this.restartTimers.values())
            clearTimeout(timer);
        this.restartTimers.clear();
        this.restartAttempts.clear();
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
        if (!this.config.enabled) {
            throw new RpcError('CURSOR_UNAVAILABLE', 'Cursor ACP is disabled or unavailable on this Host.');
        }
        // A backend the profile turned off is reported as configured-off, not as a
        // generic outage: it is never launched, so "unavailable" would be misleading.
        const configured = backend === undefined ? undefined : this.config.backends.find(item => item.id === backend);
        if (configured !== undefined && !configured.enabled) {
            throw new RpcError('ACP_BACKEND_DISABLED', `The ${backend} ACP backend is disabled by configuration.`);
        }
        if ((backend !== undefined && (!this.enabledBackends().includes(backend) || this.pendingReconfiguration.has(backend))) || !this.isAvailable()) {
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
    isNativeCatalogBackend(backend) {
        if (backend === 'antigravity') {
            const client = this.backendInstances.get('antigravity')?.client;
            return client !== undefined && typeof client.history === 'function';
        }
        return isValidAcpBackendId(backend);
    }
    requiresCatalogCwd(backend) {
        if (STRICT_CATALOG_BACKENDS.has(backend))
            return true;
        if (backend === 'antigravity')
            return this.isNativeCatalogBackend('antigravity');
        return backend !== 'cursor' && isValidAcpBackendId(backend);
    }
    isPerSessionIsolatedBackend(backend) {
        if (backend === 'claude' || backend === 'hermes')
            return true;
        if (backend === 'antigravity')
            return this.isNativeCatalogBackend('antigravity');
        return !['cursor', 'pi', 'opencode'].includes(backend) && isValidAcpBackendId(backend);
    }
    requiresPrePromptLoad(backend) {
        if (backend === 'pi' || backend === 'claude' || backend === 'hermes')
            return true;
        if (backend === 'antigravity')
            return this.isNativeCatalogBackend('antigravity');
        return backend !== 'cursor' && backend !== 'opencode' && isValidAcpBackendId(backend);
    }
    async syncPermissionModeIfCompatible(backend, sessionId, preset) {
        const client = this.backendInstances.get(backend)?.client;
        if (!client)
            return;
        const modes = await client.call('dsh/sessionModes', { sessionId }).catch(() => undefined);
        if (!isRecord(modes) || !Array.isArray(modes.availableModes))
            return;
        const current = typeof modes.currentModeId === 'string' ? modes.currentModeId : undefined;
        const permissionModes = new Set(['default', 'accept-edits', 'auto', 'acceptEdits', 'bypassPermissions', 'dontAsk', 'yolo', 'full-auto']);
        if (current && !permissionModes.has(current))
            return;
        const ids = modes.availableModes
            .filter((item) => isRecord(item) && typeof item.id === 'string')
            .map(item => item.id);
        const target = preset === 'danger-full-access'
            ? ['auto', 'bypassPermissions', 'yolo', 'full-auto', 'accept-edits', 'acceptEdits'].find(id => ids.includes(id))
            : ids.find(id => id === 'default');
        if (target && target !== current) {
            await client.call('session/set_mode', { sessionId, modeId: target });
        }
    }
    initializeResult(params, backend) {
        const requested = typeof params.protocolVersion === 'number' ? params.protocolVersion : 1;
        const actualBackend = backend ?? this.defaultBackend();
        const inst = this.backendInstances.get(actualBackend);
        const caps = inst?.client.capabilities?.() ?? {};
        const authMethods = inst?.client.authMethods?.() ?? [];
        const supportsImage = actualBackend === 'antigravity'
            || actualBackend === 'hermes'
            || caps.promptCapabilities?.image === true;
        return {
            protocolVersion: requested,
            agentInfo: {
                name: actualBackend === 'antigravity' ? 'antigravity' : 'dsh-remote-acp',
                version: PLUGIN_VERSION,
            },
            backend: actualBackend,
            availableBackends: this.availableBackends(),
            authMethods,
            capabilities: {
                loadSession: caps.loadSession ?? true,
                promptTypes: supportsImage ? ['text', 'image'] : ['text'],
                methods: [...ACP_METHOD_ALLOWLIST],
                ...(caps.sessionCapabilities ? { sessionCapabilities: caps.sessionCapabilities } : {}),
                ...(caps.steering ? { steering: true } : {}),
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
            let result;
            try {
                result = await client.call('session/list', { ...(cwd ? { cwd } : {}), ...(cursor ? { cursor } : {}) });
            }
            catch (error) {
                // Older Cursor CLI releases or minimal mock adapters may not implement session/list.
                if (backend === 'cursor' && !(error instanceof CursorAcpError && (error.code === 'ACP_AUTH_REQUIRED' || error.authDiagnostic?.authStatus === 'auth_required'))) {
                    return items;
                }
                throw error;
            }
            assertCurrent();
            if (backend === 'cursor' && isRecord(result) && result.sessions === undefined && Object.keys(result).length === 0) {
                return items;
            }
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
    if (pending.method === 'cursor/ask_question' && params.decision === 'allow-once') {
        if (params.result === undefined)
            return { outcome: { outcome: 'answered' } };
        if (!isRecord(params.result))
            throw invalid();
        const outcomeRecord = isRecord(params.result.outcome) ? params.result.outcome : params.result;
        const outcomeKind = typeof outcomeRecord.outcome === 'string' ? outcomeRecord.outcome : 'answered';
        if (outcomeKind !== 'answered' && outcomeKind !== 'selected')
            throw invalid();
        const allowedKeys = new Set(['outcome', 'answers', 'selectedOptionIds', 'response']);
        if (Object.keys(outcomeRecord).some(key => !allowedKeys.has(key)))
            throw invalid();
        return {
            outcome: {
                outcome: outcomeKind,
                ...(outcomeRecord.answers !== undefined ? { answers: outcomeRecord.answers } : {}),
                ...(outcomeRecord.selectedOptionIds !== undefined ? { selectedOptionIds: outcomeRecord.selectedOptionIds } : {}),
                ...(typeof outcomeRecord.response === 'string' ? { response: outcomeRecord.response } : {}),
            },
        };
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
        if (key === 'sessionId' || key === 'stopReason' || key === 'mode' || key === 'currentModeId' || key === 'modes') {
            next[key] = entry;
        }
    }
    return Object.keys(next).length > 0 ? next : value;
}
function sanitizeUsage(value) {
    if (!isRecord(value))
        return undefined;
    const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'cachedReadTokens', 'cachedWriteTokens', 'reasoningTokens', 'thoughtTokens', 'totalTokens'];
    const normalized = {};
    for (const field of fields) {
        const num = value[field];
        if (typeof num === 'number' && Number.isFinite(num) && num >= 0) {
            if (field === 'cachedReadTokens' && normalized.cacheReadTokens === undefined)
                normalized.cacheReadTokens = num;
            else if (field === 'cachedWriteTokens' && normalized.cacheWriteTokens === undefined)
                normalized.cacheWriteTokens = num;
            else if (field === 'thoughtTokens' && normalized.reasoningTokens === undefined)
                normalized.reasoningTokens = num;
            else
                normalized[field] = num;
        }
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
}
function parsePublicSessionId(value, strictNativeId = false) {
    const match = /^([a-z0-9][a-z0-9._-]{0,31}):(.+)$/i.exec(value);
    if (!match)
        return undefined;
    const prefix = match[1];
    const nativeId = match[2];
    if (strictNativeId && !/^[A-Za-z0-9_-]{1,240}$/.test(nativeId))
        return undefined;
    const backend = prefix === 'acp' ? 'antigravity' : prefix;
    if (backend === 'codex' || backend === 'harness' || backend === 'kimi')
        return undefined;
    if (!isValidAcpBackendId(backend))
        return undefined;
    return { prefix, backend, nativeId };
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
const OVERSIZED_FRAME_ERROR_CODES = new Set(['RESPONSE_TOO_LARGE', 'FRAME_TOO_LARGE', 'PAYLOAD_TOO_LARGE']);
function isOversizedAcpFrame(sessionId, frame) {
    return encodeMessage(createEvent('agent.acp.frame', {
        streamId: `session:${sessionId}`,
        frame,
    })).byteLength > MAX_SECURE_MESSAGE_BYTES;
}
function isResponseTooLarge(error) {
    const seen = new Set();
    let current = error;
    while (current !== undefined && current !== null && !seen.has(current) && seen.size < 8) {
        seen.add(current);
        if (isRecord(current) && typeof current.code === 'string' && OVERSIZED_FRAME_ERROR_CODES.has(current.code)) {
            return true;
        }
        const message = current instanceof Error
            ? current.message
            : isRecord(current) && typeof current.message === 'string'
                ? current.message
                : undefined;
        if (message !== undefined && /secure message exceeds the reassembly limit|exceeds the secure channel limit/i.test(message)) {
            return true;
        }
        current = current instanceof Error
            ? current.cause
            : isRecord(current)
                ? current.cause
                : undefined;
    }
    return false;
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
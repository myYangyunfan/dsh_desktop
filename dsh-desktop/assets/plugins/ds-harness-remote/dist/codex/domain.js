import { randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { deriveCodexCwdWorkspaces } from '@dsh-remote/client-core';
import { createEvent, encodeMessage, MAX_SECURE_MESSAGE_BYTES } from '@dsh-remote/protocol';
import { RpcError } from '../safe-error.js';
import { normalizeVirtualHistoryTurnWindow, VirtualHistoryResponseTooLargeError, } from '../virtual-history-pagination.js';
import { CODEX_THREAD_UNMATERIALIZED, CodexAppServerClient, CodexAppServerError, } from './app-server.js';
import { isThreadMutation, parseCodexCall, threadIdFromParams, } from './method-policy.js';
import { CodexPeerBridge } from './peer-bridge.js';
import { codexPermissionPresetFromResponse } from './permissions.js';
import { CodexThreadLifecycle } from './thread-lifecycle.js';
import { paginateCodexNativeHistory, projectCodexNativeHistory } from './virtual-harness.js';
const APPROVAL_TTL_MS = 5 * 60_000;
const DEFAULT_RESTART_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
/** Fail closed when App Server goes silent mid-turn (e.g. HTTP 503 without turn/completed). */
const DEFAULT_TURN_SILENCE_TIMEOUT_MS = 10 * 60_000;
const CODEX_PAGE_LIMIT = 100;
const MAX_CODEX_PAGES = 32;
const CODEX_HISTORY_PAGE_LIMIT = 25;
const MAX_CODEX_HISTORY_PAGES = 64;
const CODEX_DIRECTORY_ENTRY_LIMIT = 500;
export const MAX_BUFFERED_CODEX_FRAMES = 200;
const MAX_BUFFERED_CODEX_THREADS = 64;
const CODEX_FRAME_BUFFER_TTL_MS = 5 * 60_000;
const MAX_STREAM_ID_PROBE = 'x'.repeat(128);
const THREAD_METADATA_METHODS = new Set([
    'thread/name/updated',
    'thread/settings/updated',
    'thread/status/changed',
    'thread/archived',
    'thread/unarchived',
    'model/rerouted',
]);
const BUFFERABLE_CODEX_METHODS = new Set([
    ...THREAD_METADATA_METHODS,
    'turn/started',
    'turn/plan/updated',
    'turn/completed',
    'item/started',
    'item/completed',
    'item/agentMessage/delta',
    'item/reasoning/summaryPartAdded',
    'item/reasoning/summaryTextDelta',
    'item/reasoning/textDelta',
    'item/plan/delta',
    'item/commandExecution/outputDelta',
    'item/fileChange/outputDelta',
    'item/mcpToolCall/progress',
    'item/fileChange/patchUpdated',
]);
const TURN_SILENCE_MESSAGE = 'CodeX turn timed out waiting for the App Server. The model provider may be unavailable or rate-limited. Please try again later.';
/**
 * Optional Codex business domain inside the existing Remote Plugin. It shares
 * Remote identity/transport with Harness, but owns its App Server process,
 * method policy, subscriptions, leases, and approval handles.
 */
export class CodexRemoteDomain {
    config;
    logger;
    createAppServer;
    restartDelaysMs;
    turnSilenceTimeoutMs;
    onDemandCooldownMs;
    appServer;
    unsubscribeInbound;
    unsubscribeUnavailable;
    peers = new Map();
    peerThreads = new Map();
    threadGoals = new Map();
    threadLifecycle = new CodexThreadLifecycle(threadId => this.hasSubscriber(threadId) || this.threadGoals.get(threadId)?.active === true
        || [...this.approvals.values()].some(approval => approval.threadId === threadId), threadId => this.callUpstream('thread/unsubscribe', { threadId }), threadId => {
        this.threadGoals.delete(threadId);
        for (const threads of this.peerThreads.values())
            threads.delete(threadId);
    }, error => this.logger.warn('Codex thread release could not be confirmed', { code: errorCode(error) }));
    peerDeviceIds = new Map();
    turnOwners = new Map();
    turnWatchdogs = new Map();
    approvals = new Map();
    permissionPresets = new Map();
    recentFrames = new Map();
    nextBufferSeq = 1;
    inboundChains = new Map();
    pendingRequestThreads = new Map();
    approvalExpiryTimer;
    restartTimer;
    restartAttempt = 0;
    lastOnDemandRecoveryAt = 0;
    available = false;
    closed = false;
    /**
     * Workspace authority is intentionally not cached after a request finishes:
     * project roots can change outside this process and must stay fail-closed.
     * Concurrent calls during one catalog/history refresh do share this promise,
     * though, so they do not each page the same project list independently.
     */
    workspaceAuthorityPromise;
    /**
     * Authorization checks are intentionally not retained after they settle:
     * workspace roots can change outside this process and every new request must
     * still revalidate them.  Calls that overlap one another may share the same
     * bounded thread/read, though, which avoids duplicate first-open checks when
     * a session history and its first prompt arrive together.
     */
    knownThreadPromises = new Map();
    state = 'disabled';
    unavailableCode;
    lifecycleGeneration = 0;
    reconfigureDepth = 0;
    constructor(config, logger, createAppServer = (binary, targetLogger) => new CodexAppServerClient(binary, targetLogger), restartDelaysMs = DEFAULT_RESTART_DELAYS_MS, turnSilenceTimeoutMs = DEFAULT_TURN_SILENCE_TIMEOUT_MS, onDemandCooldownMs = 30_000) {
        this.config = config;
        this.logger = logger;
        this.createAppServer = createAppServer;
        this.restartDelaysMs = restartDelaysMs;
        this.turnSilenceTimeoutMs = turnSilenceTimeoutMs;
        this.onDemandCooldownMs = onDemandCooldownMs;
    }
    startPromise;
    start() {
        this.startPromise ??= this.startOnce().finally(() => { this.startPromise = undefined; });
        return this.startPromise;
    }
    tryRecoverOnDemand() {
        if (this.closed || !this.config.enabled || this.reconfigureDepth > 0 || this.isAvailable())
            return;
        if (this.startPromise !== undefined || this.restartTimer !== undefined)
            return;
        if (this.state === 'starting' || this.state === 'restarting')
            return;
        const now = Date.now();
        if (now - this.lastOnDemandRecoveryAt < this.onDemandCooldownMs)
            return;
        this.lastOnDemandRecoveryAt = now;
        void this.start().catch(() => undefined);
    }
    async startOnce() {
        if (this.closed)
            throw new RpcError('CODEX_CLOSED', 'The Codex Remote domain is closed.');
        if (!this.config.enabled)
            return;
        const generation = this.lifecycleGeneration;
        this.restartAttempt = 0;
        try {
            this.state = 'starting';
            await this.launchAppServer(generation);
        }
        catch (error) {
            if (this.closed || generation !== this.lifecycleGeneration)
                return;
            this.available = false;
            this.lastOnDemandRecoveryAt = Date.now();
            this.unavailableCode = errorCode(error);
            await this.disposeAppServer(this.appServer);
            if (this.closed || generation !== this.lifecycleGeneration)
                return;
            this.logger.warn('Codex Remote domain unavailable', { code: this.unavailableCode });
            if (this.config.enabled && isRetryableCodexStartError(error) && this.restartDelaysMs.length > 0) {
                this.scheduleRestart(generation);
            }
            else {
                this.state = 'unavailable';
            }
        }
    }
    isAvailable() { return this.available && this.appServer?.isReady() === true; }
    status() {
        return {
            enabled: this.config.enabled,
            available: this.isAvailable(),
            state: this.state,
            restartAttempt: this.restartAttempt,
            ...(this.unavailableCode === undefined ? {} : { error: this.unavailableCode }),
        };
    }
    /** Resolve a thread cwd for Host-owned workspace/terminal carriers. */
    async resolveThreadWorkspace(connectionId, threadId) {
        if (!this.peers.has(connectionId))
            throw new RpcError('CODEX_THREAD_UNAVAILABLE', 'The CodeX thread is not available on this connection.');
        try {
            const assertCurrent = this.captureCallScope(connectionId);
            const known = await this.readKnownThread(threadId);
            assertCurrent();
            return known.cwd;
        }
        catch (error) {
            if (error instanceof RpcError && error.code === 'CODEX_THREAD_NOT_ALLOWED') {
                throw new RpcError('CODEX_THREAD_UNAVAILABLE', 'The CodeX thread is not available.');
            }
            throw new RpcError('CODEX_THREAD_UNAVAILABLE', 'The CodeX thread is not available.');
        }
    }
    createPeer(context, publish) {
        const bridge = new CodexPeerBridge(this, context, publish, this.logger);
        this.peers.set(context.connectionId, bridge);
        this.peerDeviceIds.set(context.connectionId, context.peerDeviceId);
        return bridge;
    }
    async call(connectionId, input) {
        const envelope = parseCallEnvelope(input);
        const call = parseCodexCall(envelope.method, envelope.params);
        const assertCurrent = this.captureCallScope(connectionId);
        const action = async () => {
            const result = await this.callInternal(connectionId, call, assertCurrent);
            assertCurrent();
            return result;
        };
        const threadId = threadIdFromParams(call.params);
        return threadId === undefined ? action() : this.threadLifecycle.use(threadId, action);
    }
    useThread(threadId, action) {
        return this.threadLifecycle.use(threadId, action);
    }
    releaseThread(threadId) {
        if (!this.isAvailable() || this.closed)
            return Promise.resolve();
        const tracked = this.threadGoals.has(threadId);
        return this.threadLifecycle.use(threadId, async () => {
            if (tracked && !this.threadGoals.has(threadId))
                return;
            if (await this.refreshThreadGoal(threadId))
                await this.threadLifecycle.release(threadId);
        });
    }
    async refreshThreadGoal(threadId) {
        const appServer = this.requireAppServer();
        const previous = this.threadGoals.get(threadId) ?? { active: true };
        this.threadGoals.set(threadId, previous);
        let active = true;
        try {
            const result = await this.callUpstream('thread/goal/get', { threadId }, 5_000);
            if (!isRecord(result) || !('goal' in result)) {
                throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid Goal.');
            }
            active = result.goal === null ? false : goalRetainsThread(result.goal, threadId);
        }
        catch (error) {
            if (errorCode(error) === 'CODEX_GOALS_UNAVAILABLE')
                active = false;
            else
                this.logger.warn('Codex Goal state could not be confirmed', { code: errorCode(error) });
        }
        if (this.closed || this.appServer !== appServer || !this.isAvailable() || !this.threadGoals.has(threadId))
            return false;
        if (this.threadGoals.get(threadId) === previous)
            this.threadGoals.set(threadId, { active });
        return true;
    }
    rememberThread(connectionId, threadId, releaseDetached = false) {
        if (!this.peers.has(connectionId)) {
            if (releaseDetached)
                void this.releaseThread(threadId).catch(() => undefined);
            return;
        }
        let threads = this.peerThreads.get(connectionId);
        if (threads === undefined) {
            threads = new Set();
            this.peerThreads.set(connectionId, threads);
        }
        threads.add(threadId);
    }
    captureCallScope(connectionId) {
        const appServer = this.requireAppServer();
        const peer = this.peers.get(connectionId);
        return () => {
            if (this.closed || this.appServer !== appServer || !this.isAvailable()) {
                throw new RpcError('CODEX_UNAVAILABLE', 'The Codex App Server changed while handling the request.');
            }
            if (peer !== undefined && this.peers.get(connectionId) !== peer) {
                throw new RpcError('CODEX_CONNECTION_CLOSED', 'The Codex connection is closed.');
            }
        };
    }
    async callInternal(connectionId, call, assertCurrent) {
        assertCurrent();
        const attached = this.peers.has(connectionId);
        if (call.method === 'account/read') {
            return sanitizeAccount(await this.callUpstream(call.method, call.params));
        }
        if (call.method === 'project/list') {
            return sanitizeProjectList(await this.callUpstream(call.method, call.params));
        }
        if (call.method === 'project/create') {
            const roots = call.params.roots;
            const path = await this.requireNewCodexProjectPath(roots[0].path);
            assertCurrent();
            return sanitizeProjectCreate(await this.callUpstream(call.method, {
                name: call.params.name,
                roots: [{ path }],
                idempotencyKey: call.params.idempotencyKey,
            }));
        }
        if (call.method === 'thread/list') {
            const result = sanitizeThreadList(await this.callUpstream(call.method, call.params));
            return filterThreadListByWorkspaceAuthority(result, await this.readWorkspaceAuthority(result.data));
        }
        if (call.method === 'thread/start') {
            const cwd = await this.requireCodexWorkspacePath(call.params.cwd);
            assertCurrent();
            const permission = codexPermission(call.params, 'workspace-write');
            const result = await this.callUpstream(call.method, {
                ...permission.params,
                cwd,
                ...codexThreadPermissionParams(permission),
                serviceName: 'deepseek_harness_remote',
            });
            const createdId = extractThread(result)?.id;
            if (typeof createdId === 'string')
                this.rememberThread(connectionId, createdId, attached);
            assertCurrent();
            if (extractThread(result)?.id === undefined) {
                throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid thread.');
            }
            this.rememberPermission(extractThread(result).id, result);
            return result;
        }
        const threadId = threadIdFromParams(call.params);
        if (call.method === 'dsh/sessionHistory') {
            const latestHistory = call.params.beforeSeq === undefined && call.params.throughSeq === undefined;
            const watermark = latestHistory ? this.nextBufferSeq : undefined;
            const thread = await this.readThreadForHistory(connectionId, threadId);
            assertCurrent();
            if (watermark !== undefined)
                this.pruneBufferedFramesAgainstHistory(threadId, thread, watermark);
            let page;
            try {
                page = paginateCodexNativeHistory(projectCodexNativeHistory(thread, `codex:${threadId}`), {
                    beforeSeq: optionalInteger(call.params.beforeSeq),
                    throughSeq: optionalInteger(call.params.throughSeq),
                    maxMessages: optionalInteger(call.params.maxMessages),
                    turnWindow: normalizeVirtualHistoryTurnWindow(call.params.turnWindow),
                });
            }
            catch (error) {
                if (error instanceof VirtualHistoryResponseTooLargeError) {
                    throw new RpcError('RESPONSE_TOO_LARGE', error.message, { actualBytes: error.actualBytes, maxBytes: error.maxBytes }, false);
                }
                throw error;
            }
            const activeTurnId = typeof page.activeTurnId === 'string'
                ? page.activeTurnId
                : this.turnOwners.get(threadId)?.turnId;
            return {
                ...page,
                ...(activeTurnId === undefined ? {} : { activeTurnId }),
                permissionPreset: this.permissionPresets.get(threadId) ?? null,
            };
        }
        if (call.method === 'dsh/sessionAttachment') {
            const attachmentId = call.params.attachmentId;
            const thread = await this.readThreadForHistory(connectionId, threadId);
            const history = projectCodexNativeHistory(thread, `codex:${threadId}`);
            const found = findProjectedImageAttachment(history.entries, attachmentId);
            if (found === undefined) {
                throw new RpcError('CODEX_ATTACHMENT_NOT_FOUND', 'The CodeX image is not available in this Session.');
            }
            return found;
        }
        if (call.method === 'dsh/directoryList') {
            return this.listCodexDirectory(call.params.path);
        }
        const allowedThread = threadId === undefined ? undefined : await this.readKnownThread(threadId);
        assertCurrent();
        if (threadId !== undefined)
            this.rememberThread(connectionId, threadId);
        if (call.method === 'thread/resume' && call.params.permissionPreset !== undefined) {
            const owner = this.turnOwners.get(threadId);
            if (owner !== undefined && owner.connectionId !== connectionId) {
                throw new RpcError('CODEX_THREAD_BUSY', 'Another Remote client is writing to this CodeX thread.');
            }
            return this.changeThreadPermission(threadId, call.params, allowedThread, assertCurrent);
        }
        if (call.method === 'thread/read') {
            // assertThreadAllowed already produced a bounded summary, but make the
            // requested read again so includeTurns has its official semantics.
            const watermark = call.params.includeTurns === true ? this.nextBufferSeq : undefined;
            const result = await this.callUpstream(call.method, call.params);
            assertCurrent();
            if (watermark !== undefined) {
                const thread = extractThread(result);
                if (thread !== undefined && thread.id === threadId) {
                    this.pruneBufferedFramesAgainstHistory(threadId, thread, watermark);
                }
            }
            return result;
        }
        if (call.method === 'thread/unsubscribe') {
            const bridge = this.peers.get(connectionId);
            bridge?.removeThreadSubscriptions(threadId);
            await this.releaseThread(threadId);
            if (!this.hasSubscriber(threadId))
                this.recentFrames.delete(threadId);
            return { status: 'unsubscribed' };
        }
        let claimed = false;
        let previousOwner;
        let claimedOwner;
        if (isThreadMutation(call.method) && threadId !== undefined) {
            const claim = this.claimTurn(threadId, connectionId, call.method, typeof call.params.turnId === 'string' ? call.params.turnId : undefined);
            claimed = claim.claimed;
            previousOwner = claim.previous;
            claimedOwner = this.turnOwners.get(threadId);
        }
        const finishStart = call.method === 'turn/start' && threadId !== undefined
            ? this.threadLifecycle.starting(threadId)
            : undefined;
        try {
            const permission = codexPermission(call.params);
            const upstreamParams = call.method === 'thread/resume' && allowedThread !== undefined
                ? {
                    ...permission.params,
                    ...(allowedThread.cwd === undefined ? {} : { cwd: allowedThread.cwd }),
                    ...codexThreadPermissionParams(permission),
                    excludeTurns: true,
                }
                : call.method === 'thread/fork' && allowedThread !== undefined
                    ? {
                        ...permission.params,
                        ...(allowedThread.cwd === undefined ? {} : { cwd: allowedThread.cwd }),
                        ...codexThreadPermissionParams(permission),
                    }
                    : call.method === 'turn/start'
                        ? {
                            ...permission.params,
                            ...(allowedThread?.cwd === undefined ? {} : { cwd: allowedThread.cwd }),
                            ...codexTurnPermissionParams(permission, allowedThread?.cwd),
                        }
                        : permission.params;
            let result;
            try {
                result = await this.callUpstream(call.method, upstreamParams);
            }
            catch (error) {
                assertCurrent();
                // App Server rejects thread/resume when this process already has the
                // thread loaded. Remote callers should be able to resume defensively
                // before every turn, including immediately after thread/start.
                if (call.method === 'thread/resume'
                    && allowedThread !== undefined
                    && error instanceof RpcError
                    && (error.code === 'CODEX_UPSTREAM_ERROR' || error.code === CODEX_THREAD_UNMATERIALIZED)
                    && call.params.permissionPreset === undefined) {
                    return { thread: allowedThread.thread };
                }
                throw error;
            }
            finishStart?.(true);
            if (call.method === 'thread/fork') {
                const createdId = extractThread(result)?.id;
                if (typeof createdId === 'string')
                    this.rememberThread(connectionId, createdId, attached);
            }
            assertCurrent();
            if (call.method === 'thread/resume' || call.method === 'thread/fork' || call.method === 'thread/unarchive') {
                await this.assertResultThreadAllowed(result);
                assertCurrent();
            }
            if (call.method === 'thread/resume' || call.method === 'thread/fork') {
                const resultId = extractThread(result)?.id;
                if (typeof resultId === 'string') {
                    this.rememberPermission(resultId, result);
                    if (call.params.permissionPreset !== undefined)
                        await this.publishPermission(resultId, result);
                }
            }
            if (call.method === 'turn/start' && threadId !== undefined) {
                this.rememberTurnId(threadId, connectionId, extractTurnId(result));
                this.armTurnWatchdog(threadId);
                if (call.params.permissionPreset !== undefined) {
                    await this.publishPermission(threadId, codexTurnPermissionParams(permission, allowedThread?.cwd));
                }
            }
            return result;
        }
        catch (error) {
            finishStart?.(errorCode(error) === 'CODEX_REQUEST_TIMEOUT');
            if (claimed && threadId !== undefined && this.turnOwners.get(threadId) === claimedOwner) {
                if (previousOwner === undefined)
                    this.turnOwners.delete(threadId);
                else
                    this.turnOwners.set(threadId, previousOwner);
                if (previousOwner === undefined)
                    this.clearTurnWatchdog(threadId);
            }
            throw mapAppServerError(error);
        }
    }
    async respond(connectionId, input) {
        await this.expireApprovals();
        const params = parseRespond(input);
        const approval = this.approvals.get(params.requestHandle);
        if (approval === undefined || approval.connectionId !== connectionId) {
            throw new RpcError('CODEX_APPROVAL_NOT_FOUND', 'The Codex approval is missing, expired, or belongs to another connection.');
        }
        this.approvals.delete(params.requestHandle);
        this.scheduleApprovalExpiry();
        await this.requireAppServer().respond(approval.upstreamId, { decision: params.decision });
        await this.threadLifecycle.retry(approval.threadId);
        return { resolved: true };
    }
    async detachPeer(connectionId) {
        const threadIds = this.peerThreads.get(connectionId) ?? new Set();
        this.peerThreads.delete(connectionId);
        const bridge = this.peers.get(connectionId);
        if (bridge !== undefined)
            this.peers.delete(connectionId);
        this.peerDeviceIds.delete(connectionId);
        for (const [threadId, owner] of this.turnOwners) {
            if (owner.connectionId !== connectionId)
                continue;
            this.turnOwners.delete(threadId);
            this.clearTurnWatchdog(threadId);
        }
        const appServer = this.appServer;
        const pending = [...this.approvals.entries()].filter(([, approval]) => approval.connectionId === connectionId);
        for (const [handle, approval] of pending) {
            this.approvals.delete(handle);
            await appServer?.respond(approval.upstreamId, { decision: 'decline' }).catch(() => undefined);
        }
        this.scheduleApprovalExpiry();
        await Promise.allSettled([...threadIds].map(threadId => this.releaseThread(threadId)));
    }
    async reconfigure(config) {
        if (this.closed)
            throw new RpcError('CODEX_CLOSED', 'The Codex Remote domain is closed.');
        if (JSON.stringify(this.config) === JSON.stringify(config))
            return;
        this.reconfigureDepth += 1;
        try {
            this.config = config;
            this.lifecycleGeneration += 1;
            this.available = false;
            this.state = config.enabled ? 'starting' : 'disabled';
            this.threadLifecycle.reset();
            this.peerThreads.clear();
            this.threadGoals.clear();
            if (this.restartTimer !== undefined)
                clearTimeout(this.restartTimer);
            this.restartTimer = undefined;
            await this.disposeAppServer(this.appServer);
            await this.startPromise?.catch(() => undefined);
            if (this.restartTimer !== undefined)
                clearTimeout(this.restartTimer);
            this.restartTimer = undefined;
            this.available = false;
            await Promise.all([...this.peers.values()].map(peer => peer.failStreams('failed')));
            this.clearAllTurnWatchdogs();
            this.turnOwners.clear();
            this.permissionPresets.clear();
            this.recentFrames.clear();
            this.knownThreadPromises.clear();
            this.approvals.clear();
            if (this.approvalExpiryTimer !== undefined)
                clearTimeout(this.approvalExpiryTimer);
            this.approvalExpiryTimer = undefined;
            await this.disposeAppServer(this.appServer);
            this.inboundChains.clear();
            this.pendingRequestThreads.clear();
            this.lastOnDemandRecoveryAt = 0;
            this.restartAttempt = 0;
            this.unavailableCode = undefined;
            this.state = 'disabled';
            if (this.closed)
                throw new RpcError('CODEX_CLOSED', 'The Codex Remote domain is closed.');
            await this.start();
        }
        finally {
            this.reconfigureDepth -= 1;
        }
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.lifecycleGeneration += 1;
        this.available = false;
        this.threadLifecycle.reset();
        this.peerThreads.clear();
        this.threadGoals.clear();
        this.state = this.config.enabled ? 'unavailable' : 'disabled';
        if (this.restartTimer !== undefined)
            clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
        for (const bridge of [...this.peers.values()])
            await bridge.closeAll();
        this.peers.clear();
        this.peerDeviceIds.clear();
        this.clearAllTurnWatchdogs();
        this.turnOwners.clear();
        this.permissionPresets.clear();
        this.recentFrames.clear();
        if (this.approvalExpiryTimer !== undefined)
            clearTimeout(this.approvalExpiryTimer);
        this.approvalExpiryTimer = undefined;
        this.approvals.clear();
        this.inboundChains.clear();
        this.pendingRequestThreads.clear();
        this.unsubscribeInbound?.();
        this.unsubscribeInbound = undefined;
        this.unsubscribeUnavailable?.();
        this.unsubscribeUnavailable = undefined;
        await this.appServer?.close();
        this.appServer = undefined;
    }
    async launchAppServer(generation = this.lifecycleGeneration) {
        let lastError;
        for (const binary of codexBinaryCandidates(this.config.binary)) {
            if (this.closed || generation !== this.lifecycleGeneration)
                return;
            try {
                await this.launchAppServerCandidate(binary, generation);
                return;
            }
            catch (error) {
                if (this.closed || generation !== this.lifecycleGeneration)
                    return;
                lastError = error;
                if (!canTryNextBinary(error))
                    throw error;
            }
        }
        throw lastError ?? new RpcError('CODEX_START_FAILED', 'Codex App Server could not be started.');
    }
    async launchAppServerCandidate(binary, generation) {
        if (this.closed || generation !== this.lifecycleGeneration)
            return;
        const appServer = this.createAppServer(binary, this.logger);
        this.appServer = appServer;
        this.unsubscribeInbound = appServer.onInbound(message => {
            this.enqueueInbound(appServer, message);
        });
        this.unsubscribeUnavailable = appServer.onUnavailable(code => {
            if (this.available && this.appServer === appServer) {
                void this.handleAppServerUnavailable(appServer, code);
            }
        });
        try {
            await appServer.start();
            if (this.closed || generation !== this.lifecycleGeneration || this.appServer !== appServer) {
                await this.disposeAppServer(appServer);
                await appServer.close().catch(() => undefined);
                return;
            }
            const account = await appServer.call('account/read', { refreshToken: false }, 15_000);
            if (!accountCanRun(account)) {
                throw new RpcError('CODEX_AUTH_REQUIRED', 'Codex is not signed in on this Host.');
            }
            if (this.closed || generation !== this.lifecycleGeneration || this.appServer !== appServer) {
                await this.disposeAppServer(appServer);
                await appServer.close().catch(() => undefined);
                return;
            }
            this.available = true;
            this.state = 'ready';
            this.restartAttempt = 0;
            this.unavailableCode = undefined;
            this.logger.info('Codex Remote domain ready');
        }
        catch (error) {
            await this.disposeAppServer(appServer);
            throw error;
        }
    }
    async handleAppServerUnavailable(appServer, code) {
        if (this.closed || this.appServer !== appServer)
            return;
        const generation = this.lifecycleGeneration;
        this.available = false;
        this.threadLifecycle.reset();
        this.peerThreads.clear();
        this.threadGoals.clear();
        this.state = 'restarting';
        this.unavailableCode = code;
        this.clearAllTurnWatchdogs();
        this.turnOwners.clear();
        this.permissionPresets.clear();
        this.recentFrames.clear();
        this.approvals.clear();
        if (this.approvalExpiryTimer !== undefined)
            clearTimeout(this.approvalExpiryTimer);
        this.approvalExpiryTimer = undefined;
        await Promise.all([...this.peers.values()].map(peer => peer.failStreams('failed')));
        if (this.closed || generation !== this.lifecycleGeneration)
            return;
        await this.disposeAppServer(appServer);
        if (this.closed || generation !== this.lifecycleGeneration)
            return;
        this.inboundChains.clear();
        this.pendingRequestThreads.clear();
        this.scheduleRestart(generation);
    }
    scheduleRestart(generation = this.lifecycleGeneration) {
        if (this.closed || this.restartTimer !== undefined || generation !== this.lifecycleGeneration)
            return;
        if (this.restartAttempt >= this.restartDelaysMs.length) {
            this.state = 'unavailable';
            this.logger.warn('Codex App Server restart attempts exhausted', { attempts: this.restartAttempt });
            return;
        }
        const delayMs = Math.max(0, this.restartDelaysMs[this.restartAttempt] ?? 0);
        this.restartAttempt += 1;
        this.state = 'restarting';
        this.restartTimer = setTimeout(() => {
            this.restartTimer = undefined;
            void this.restartAfterFailure(generation);
        }, delayMs);
        this.restartTimer.unref?.();
        this.logger.warn('Codex App Server restart scheduled', { attempt: this.restartAttempt, delayMs });
    }
    async restartAfterFailure(generation) {
        if (this.closed || generation !== this.lifecycleGeneration)
            return;
        try {
            await this.launchAppServer(generation);
        }
        catch (error) {
            if (this.closed || generation !== this.lifecycleGeneration)
                return;
            this.available = false;
            this.lastOnDemandRecoveryAt = Date.now();
            this.unavailableCode = errorCode(error);
            this.logger.warn('Codex App Server restart failed', {
                attempt: this.restartAttempt,
                code: this.unavailableCode,
            });
            if (!isRetryableCodexStartError(error)) {
                this.state = 'unavailable';
                return;
            }
            this.scheduleRestart(generation);
        }
    }
    async disposeAppServer(appServer) {
        if (appServer === undefined || this.appServer !== appServer)
            return;
        this.unsubscribeInbound?.();
        this.unsubscribeInbound = undefined;
        this.unsubscribeUnavailable?.();
        this.unsubscribeUnavailable = undefined;
        this.appServer = undefined;
        await appServer.close().catch(() => undefined);
    }
    async handleInbound(message, receivedAt = Date.now()) {
        if (!this.available)
            return;
        if (message.kind === 'request') {
            await this.handleServerRequest(message);
            return;
        }
        const threadId = extractThreadId(message.params);
        if (threadId !== undefined && (message.method === 'thread/goal/updated' || message.method === 'thread/goal/cleared')) {
            const active = message.method !== 'thread/goal/cleared'
                && (!isRecord(message.params) || goalRetainsThread(message.params.goal, threadId));
            this.threadGoals.set(threadId, { active });
            void this.threadLifecycle.retry(threadId);
        }
        if (message.method === 'thread/settings/updated' && threadId !== undefined) {
            this.rememberPermission(threadId, message.params);
        }
        if (message.method === 'thread/closed' && threadId !== undefined) {
            const releasing = this.threadLifecycle.isReleasing(threadId);
            this.permissionPresets.delete(threadId);
            this.turnOwners.delete(threadId);
            this.clearTurnWatchdog(threadId);
            this.threadLifecycle.closed(threadId);
            if (!releasing)
                this.recentFrames.delete(threadId);
        }
        if (message.method === 'turn/completed' && threadId !== undefined) {
            this.turnOwners.delete(threadId);
            this.clearTurnWatchdog(threadId);
            this.threadLifecycle.active(threadId, false);
        }
        if (message.method === 'thread/status/changed' && threadId !== undefined
            && isTerminalThreadStatus(message.params)) {
            // Some App Server failure/interruption paths publish only the terminal
            // Thread status and omit turn/completed. Release the Host-side writer
            // lease as soon as the authoritative status is no longer active, or a
            // later Prompt can be rejected as owned by a dead connection.
            this.turnOwners.delete(threadId);
            this.clearTurnWatchdog(threadId);
            for (const [handle, approval] of this.approvals) {
                if (approval.threadId !== threadId)
                    continue;
                this.approvals.delete(handle);
                void this.appServer?.respond(approval.upstreamId, { decision: 'decline' }).catch(() => undefined);
            }
            this.scheduleApprovalExpiry();
            this.threadLifecycle.active(threadId, false);
        }
        if (message.method === 'turn/started' && threadId !== undefined) {
            this.threadLifecycle.active(threadId, true);
            const owner = this.turnOwners.get(threadId);
            const turnId = extractTurnId(message.params);
            if (owner !== undefined) {
                this.turnOwners.set(threadId, { ...owner, ...(turnId === undefined ? {} : { turnId }) });
            }
            this.armTurnWatchdog(threadId);
        }
        if (message.method === 'thread/status/changed' && threadId !== undefined
            && isRecord(message.params) && isRecord(message.params.status) && message.params.status.type === 'active') {
            this.threadLifecycle.active(threadId, true);
        }
        if (message.method === 'serverRequest/resolved') {
            const resolved = this.resolveUpstreamApproval(message.params);
            if (resolved.length > 0) {
                for (const entry of resolved) {
                    const targetThreadId = threadId ?? entry.threadId;
                    if (this.turnOwners.has(targetThreadId))
                        this.armTurnWatchdog(targetThreadId);
                    const params = isRecord(message.params)
                        ? { ...message.params, threadId: targetThreadId, requestHandle: entry.handle }
                        : { threadId: targetThreadId, requestHandle: entry.handle };
                    await this.publishToThread(targetThreadId, {
                        method: message.method,
                        params,
                    }, receivedAt);
                }
                return;
            }
        }
        if (threadId === undefined)
            return;
        if (this.turnOwners.has(threadId))
            this.armTurnWatchdog(threadId);
        await this.publishToThread(threadId, {
            method: message.method,
            params: message.params,
        }, receivedAt);
    }
    /** Replay buffered real-time frames missed while no stream was subscribed. */
    async replayBufferedFrames(connectionId, streamId, threadId) {
        const peer = this.peers.get(connectionId);
        if (peer === undefined)
            return { count: 0, truncated: false };
        this.pruneFrameBuffer(threadId);
        const buffered = this.recentFrames.get(threadId);
        if (buffered === undefined || buffered.frames.length === 0)
            return { count: 0, truncated: false };
        this.recentFrames.delete(threadId);
        const truncated = buffered.truncated;
        let count = 0;
        for (let index = 0; index < buffered.frames.length; index += 1) {
            const frame = buffered.frames[index];
            try {
                await peer.publishReplayFrame(streamId, { method: frame.method, params: frame.params });
                count += 1;
            }
            catch (error) {
                if (isResponseTooLargeError(error)) {
                    this.logger.warn('Skipped oversized buffered Codex frame during replay', {
                        threadId: maskId(threadId),
                        method: frame.method,
                    });
                    continue;
                }
                this.restoreBufferedFrames(threadId, buffered.frames.slice(index), truncated, buffered.truncatedAtSeq);
                throw error;
            }
        }
        if (count > 0 || truncated) {
            this.logger.info('Replaying buffered Codex frames', {
                threadId: maskId(threadId),
                count,
                ...(truncated ? { truncated: true } : {}),
            });
        }
        return { count, truncated };
    }
    rebufferOpeningFrames(threadId, frames, truncated) {
        if (frames.length === 0 || this.hasSubscriber(threadId))
            return;
        for (const frame of frames)
            this.bufferFrame(threadId, frame);
        if (truncated) {
            const entry = this.recentFrames.get(threadId);
            if (entry !== undefined) {
                entry.truncated = true;
                entry.truncatedAtSeq = this.nextBufferSeq;
            }
        }
    }
    async publishToThread(threadId, frame, receivedAt = Date.now()) {
        const subscribers = [...this.peers.values()].filter(peer => peer.hasThreadSubscription(threadId));
        if (subscribers.length === 0) {
            this.bufferFrame(threadId, frame, receivedAt);
            return;
        }
        let deliveryFailed = false;
        await Promise.all(subscribers.map(async (peer) => {
            try {
                await peer.publishInbound(threadId, frame);
            }
            catch (error) {
                if (isResponseTooLargeError(error))
                    return;
                deliveryFailed = true;
                this.logger.warn('Codex frame publish failed', {
                    threadId: maskId(threadId),
                    method: frame.method,
                    code: errorCode(error),
                });
            }
        }));
        if (deliveryFailed)
            this.bufferFrame(threadId, frame, receivedAt);
    }
    bufferFrame(threadId, frame, receivedAt = Date.now()) {
        if (!BUFFERABLE_CODEX_METHODS.has(frame.method))
            return;
        if (isOversizedCodexFrame(frame)) {
            this.logger.warn('Skipped buffering oversized Codex frame', {
                threadId: maskId(threadId),
                method: frame.method,
            });
            return;
        }
        this.pruneFrameBuffer(undefined, receivedAt);
        const entry = this.recentFrames.get(threadId) ?? { frames: [], truncated: false, truncatedAtSeq: 0 };
        this.recentFrames.delete(threadId);
        entry.frames.push({ seq: this.nextBufferSeq++, method: frame.method, params: frame.params, at: receivedAt });
        while (entry.frames.length > MAX_BUFFERED_CODEX_FRAMES) {
            entry.frames.shift();
            entry.truncated = true;
            entry.truncatedAtSeq = this.nextBufferSeq;
        }
        this.recentFrames.set(threadId, entry);
        this.evictExcessBufferedThreads();
    }
    restoreBufferedFrames(threadId, frames, truncated, truncatedAtSeq) {
        if (frames.length === 0)
            return;
        this.pruneFrameBuffer();
        const existing = this.recentFrames.get(threadId);
        const combined = [...frames, ...(existing?.frames ?? [])];
        let nextTruncated = truncated || existing?.truncated === true;
        let nextTruncatedAtSeq = Math.max(truncatedAtSeq, existing?.truncatedAtSeq ?? 0);
        while (combined.length > MAX_BUFFERED_CODEX_FRAMES) {
            combined.shift();
            nextTruncated = true;
            nextTruncatedAtSeq = this.nextBufferSeq;
        }
        this.recentFrames.delete(threadId);
        this.recentFrames.set(threadId, { frames: combined, truncated: nextTruncated, truncatedAtSeq: nextTruncatedAtSeq });
        this.evictExcessBufferedThreads();
    }
    pruneFrameBuffer(threadId, now = Date.now()) {
        const validAfter = now - CODEX_FRAME_BUFFER_TTL_MS;
        const pruneEntry = (id, entry) => {
            const next = entry.frames.filter(frame => frame.at >= validAfter);
            if (next.length === 0) {
                this.recentFrames.delete(id);
                return;
            }
            if (next.length < entry.frames.length) {
                entry.truncated = true;
                entry.truncatedAtSeq = this.nextBufferSeq;
            }
            entry.frames = next;
        };
        if (threadId !== undefined) {
            const entry = this.recentFrames.get(threadId);
            if (entry !== undefined)
                pruneEntry(threadId, entry);
            return;
        }
        for (const [id, entry] of this.recentFrames) {
            pruneEntry(id, entry);
        }
    }
    pruneBufferedFramesAgainstHistory(threadId, thread, watermark) {
        this.pruneFrameBuffer(threadId);
        const entry = this.recentFrames.get(threadId);
        if (entry === undefined)
            return;
        const turns = Array.isArray(thread.turns) ? thread.turns.filter(isRecord) : [];
        if (turns.length === 0)
            return;
        let activeTurn;
        for (let index = turns.length - 1; index >= 0; index -= 1) {
            const turn = turns[index];
            if (turn.status === 'inProgress' || turn.status === 'running') {
                activeTurn = turn;
                break;
            }
        }
        if (activeTurn === undefined) {
            const next = entry.frames.filter(frame => frame.seq >= watermark);
            if (next.length === 0)
                this.recentFrames.delete(threadId);
            else {
                entry.frames = next;
                if (entry.truncated && entry.truncatedAtSeq < watermark) {
                    entry.truncated = false;
                    entry.truncatedAtSeq = 0;
                }
            }
            return;
        }
        const activeTurnId = typeof activeTurn.id === 'string' && activeTurn.id.length > 0 ? activeTurn.id : undefined;
        const completedTurnIds = new Set();
        const persistedItemIds = new Set();
        for (const turn of turns) {
            if (turn !== activeTurn && typeof turn.id === 'string' && turn.id.length > 0) {
                completedTurnIds.add(turn.id);
            }
            if (Array.isArray(turn.items)) {
                for (const item of turn.items) {
                    if (isRecord(item) && typeof item.id === 'string' && item.id.length > 0) {
                        persistedItemIds.add(item.id);
                    }
                }
            }
        }
        const next = entry.frames.filter(frame => {
            if (frame.seq >= watermark)
                return true;
            if (THREAD_METADATA_METHODS.has(frame.method))
                return false;
            const frameTurnId = extractFrameTurnId(frame.params);
            if (frameTurnId !== undefined && completedTurnIds.has(frameTurnId))
                return false;
            if (frame.method === 'turn/started'
                && (activeTurnId === undefined || frameTurnId === undefined || frameTurnId === activeTurnId)) {
                return false;
            }
            const frameItemId = extractFrameItemId(frame.params);
            if (frameItemId !== undefined && persistedItemIds.has(frameItemId))
                return false;
            return true;
        });
        if (next.length === 0)
            this.recentFrames.delete(threadId);
        else
            entry.frames = next;
    }
    evictExcessBufferedThreads() {
        while (this.recentFrames.size > MAX_BUFFERED_CODEX_THREADS) {
            const oldest = this.recentFrames.keys().next().value;
            if (oldest === undefined)
                break;
            this.recentFrames.delete(oldest);
        }
    }
    rememberPermission(threadId, value) {
        const preset = codexPermissionPresetFromResponse(value);
        if (preset === undefined)
            this.permissionPresets.delete(threadId);
        else
            this.permissionPresets.set(threadId, preset);
    }
    async changeThreadPermission(threadId, params, allowed, assertCurrent) {
        const permission = codexPermission(params);
        const settings = {
            ...codexTurnPermissionParams(permission, allowed.cwd),
            ...(params.model === undefined ? {} : { model: params.model }),
        };
        let result;
        try {
            // Loaded threads can reject resume or ignore its configuration overrides.
            await this.callUpstream('thread/settings/update', { threadId, ...settings });
            assertCurrent();
            result = { thread: allowed.thread, ...settings, sandbox: settings.sandboxPolicy };
        }
        catch (error) {
            assertCurrent();
            // Threads created in this App Server process may not be persisted yet;
            // the resume contract rejects them even though the thread is usable.
            // Treating that as a loaded thread keeps new-session permission changes
            // working while genuine upstream failures still fail closed.
            if (isUnpersistedThreadError(error)) {
                return { thread: allowed.thread, ...settings, sandbox: settings.sandboxPolicy };
            }
            // Unloaded threads and older App Servers still use the resume contract.
            // The resume contract also rejects threads created in this App Server
            // process before their rollout file exists; those threads are usable.
            try {
                result = await this.callUpstream('thread/resume', {
                    ...permission.params,
                    ...(allowed.cwd === undefined ? {} : { cwd: allowed.cwd }),
                    ...codexThreadPermissionParams(permission),
                    excludeTurns: true,
                });
                assertCurrent();
            }
            catch (resumeError) {
                assertCurrent();
                if (isUnpersistedThreadError(resumeError)) {
                    return { thread: allowed.thread, ...settings, sandbox: settings.sandboxPolicy };
                }
                throw resumeError;
            }
            await this.assertResultThreadAllowed(result);
            assertCurrent();
            if (codexPermissionPresetFromResponse(result) !== params.permissionPreset) {
                await this.callUpstream('thread/settings/update', { threadId, ...settings });
                assertCurrent();
                result = { ...(isRecord(result) ? result : {}), ...settings, sandbox: settings.sandboxPolicy };
            }
        }
        await this.publishPermission(threadId, result);
        return result;
    }
    async publishPermission(threadId, value) {
        if (!this.available)
            return;
        const source = isRecord(value) ? value : {};
        const threadSettings = { approvalPolicy: source.approvalPolicy, sandboxPolicy: source.sandboxPolicy ?? source.sandbox };
        const params = { threadId, threadSettings };
        this.rememberPermission(threadId, params);
        await this.publishToThread(threadId, { method: 'thread/settings/updated', params });
    }
    async handleServerRequest(message) {
        const appServer = this.requireAppServer();
        await this.expireApprovals();
        if (this.appServer !== appServer || !this.isAvailable())
            return;
        if (message.method !== 'item/commandExecution/requestApproval'
            && message.method !== 'item/fileChange/requestApproval') {
            await appServer.respondError(message.id, -32601, 'This Remote client does not support the server request.');
            return;
        }
        const threadId = extractThreadId(message.params);
        const owner = threadId === undefined ? undefined : this.turnOwners.get(threadId);
        const peer = owner === undefined ? undefined : this.peers.get(owner.connectionId);
        if (threadId === undefined || owner === undefined || peer === undefined || !peer.hasThreadSubscription(threadId)) {
            await appServer.respond(message.id, { decision: 'decline' });
            return;
        }
        const requestHandle = randomUUID();
        this.approvals.set(requestHandle, {
            upstreamId: message.id,
            connectionId: owner.connectionId,
            threadId,
            method: message.method,
            expiresAt: Date.now() + APPROVAL_TTL_MS,
        });
        this.scheduleApprovalExpiry();
        this.armTurnWatchdog(threadId);
        try {
            await peer.publishInbound(threadId, {
                method: message.method,
                params: sanitizeApprovalParams(message.params, requestHandle),
            });
        }
        catch (error) {
            this.approvals.delete(requestHandle);
            this.scheduleApprovalExpiry();
            await appServer.respond(message.id, { decision: 'decline' }).catch(() => undefined);
            throw error;
        }
    }
    readKnownThread(threadId) {
        const pending = this.knownThreadPromises.get(threadId);
        if (pending !== undefined)
            return pending;
        const current = this.readKnownThreadUncached(threadId);
        this.knownThreadPromises.set(threadId, current);
        void current.finally(() => {
            if (this.knownThreadPromises.get(threadId) === current)
                this.knownThreadPromises.delete(threadId);
        }).catch(() => undefined);
        return current;
    }
    async readKnownThreadUncached(threadId) {
        const authority = await this.readWorkspaceAuthority();
        let result;
        try {
            result = await this.callUpstream('thread/read', { threadId, includeTurns: false });
        }
        catch (error) {
            if (!isHistoryReadRecoverable(error))
                throw error;
            const listed = await this.findKnownThreadInList(threadId, authority);
            if (listed === undefined) {
                throw new RpcError('CODEX_THREAD_NOT_ALLOWED', 'The Codex thread is not available through this Remote Host.');
            }
            return { thread: listed, ...(typeof listed.cwd === 'string' && listed.cwd.length > 0 ? { cwd: listed.cwd } : {}) };
        }
        const thread = extractThread(result);
        if (thread === undefined || thread.id !== threadId || !isThreadAllowedByWorkspaceAuthority(thread, authority)) {
            throw new RpcError('CODEX_THREAD_NOT_ALLOWED', 'The Codex thread is not available through this Remote Host.');
        }
        return { thread, ...(typeof thread.cwd === 'string' && thread.cwd.length > 0 ? { cwd: thread.cwd } : {}) };
    }
    async readThreadForHistory(connectionId, threadId) {
        const { thread: metadata } = await this.readKnownThread(threadId);
        try {
            return { ...metadata, turns: await this.readThreadTurns(connectionId, threadId, 'full') };
        }
        catch (fullError) {
            if (!isHistoryFormatFallback(fullError))
                throw fullError;
            this.logHistoryFallback(connectionId, 'turns-full', fullError);
        }
        try {
            return { ...metadata, turns: await this.readThreadTurns(connectionId, threadId, 'summary') };
        }
        catch (summaryError) {
            if (!isHistoryFormatFallback(summaryError))
                throw summaryError;
            this.logHistoryFallback(connectionId, 'turns-summary', summaryError);
        }
        try {
            const legacyResult = await this.callUpstream('thread/read', { threadId, includeTurns: true });
            const legacyThread = extractThread(legacyResult);
            if (legacyThread === undefined || legacyThread.id !== threadId || !Array.isArray(legacyThread.turns)) {
                throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid Thread history.');
            }
            if (legacyThread.turns.some(turn => !isRecord(turn) || typeof turn.id !== 'string'
                || !Array.isArray(turn.items) || turn.items.some(item => !isRecord(item)))) {
                throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned invalid Thread history content.');
            }
            return legacyThread;
        }
        catch (legacyError) {
            // Only a single legacy read happened here, so there is no earlier
            // baseline to protect: an unmaterialized Thread is empty history.
            if (isUnmaterializedThreadError(legacyError)) {
                this.logEmptyUnmaterializedHistory(connectionId, 'thread-read-full');
                return { ...metadata, turns: [] };
            }
            if (!isHistoryReadRecoverable(legacyError))
                throw legacyError;
            this.logHistoryFallback(connectionId, 'thread-read-full', legacyError);
            // A failed read is not an empty conversation. Let clients retry instead
            // of replacing a previously populated baseline with a successful blank.
            throw legacyError;
        }
    }
    async readThreadTurns(connectionId, threadId, itemsView) {
        const turns = [];
        let cursor;
        for (let page = 0; page < MAX_CODEX_HISTORY_PAGES; page += 1) {
            let result;
            try {
                result = await this.callUpstream('thread/turns/list', {
                    threadId,
                    limit: CODEX_HISTORY_PAGE_LIMIT,
                    sortDirection: 'asc',
                    itemsView,
                    ...(cursor === undefined ? {} : { cursor }),
                });
            }
            catch (error) {
                // A Thread created in this App Server process has no turns until its
                // first user message materializes it. Only an empty first page is that
                // state; a later failure must not replace turns already read.
                if (page === 0 && isUnmaterializedThreadError(error)) {
                    this.logEmptyUnmaterializedHistory(connectionId, `turns-${itemsView}`);
                    return [];
                }
                throw error;
            }
            if (!isRecord(result) || !Array.isArray(result.data)) {
                throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid Turn page.');
            }
            const pageResult = result;
            // Turn item pages are independent once the turn page is available. Fetch
            // them together to avoid making a long history wait for every prior turn;
            // Promise.all preserves the upstream turn order in the resulting array.
            const pageTurns = await Promise.all(result.data.map(async (rawTurn) => {
                if (!isRecord(rawTurn) || typeof rawTurn.id !== 'string' || rawTurn.id.length === 0
                    || rawTurn.itemsView === 'full' && !Array.isArray(rawTurn.items)) {
                    throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid history Turn.');
                }
                const inlineFull = rawTurn.itemsView === 'full'
                    || rawTurn.itemsView === undefined && itemsView === 'full' && Array.isArray(rawTurn.items);
                const items = inlineFull ? rawTurn.items : await this.readThreadItems(threadId, rawTurn.id);
                if (items.some(item => !isRecord(item))) {
                    throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid history Item.');
                }
                return { ...rawTurn, items };
            }));
            turns.push(...pageTurns);
            cursor = historyNextCursor(pageResult.nextCursor);
            if (cursor === undefined)
                return turns;
        }
        throw new RpcError('PAYLOAD_TOO_LARGE', 'Codex history exceeds the Turn page limit.');
    }
    async readThreadItems(threadId, turnId) {
        const items = [];
        let cursor;
        for (let page = 0; page < MAX_CODEX_HISTORY_PAGES; page += 1) {
            const result = await this.callUpstream('thread/items/list', {
                threadId,
                turnId,
                limit: CODEX_HISTORY_PAGE_LIMIT,
                sortDirection: 'asc',
                ...(cursor === undefined ? {} : { cursor }),
            });
            if (!isRecord(result) || !Array.isArray(result.data)) {
                throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid Item page.');
            }
            for (const entry of result.data) {
                if (!isRecord(entry) || !isRecord(entry.item)) {
                    throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid history Item.');
                }
                items.push(entry.item);
            }
            cursor = historyNextCursor(result.nextCursor);
            if (cursor === undefined)
                return items;
        }
        // Summary inline Items cannot replace a failed full read: tool output and
        // message content may be omitted. Never publish a truncated baseline.
        throw new RpcError('PAYLOAD_TOO_LARGE', 'Codex history exceeds the Item page limit.');
    }
    logHistoryFallback(connectionId, stage, error) {
        this.logger.warn('Codex history read fallback', {
            connectionId: maskId(connectionId),
            stage,
            code: errorCode(error),
        });
    }
    logEmptyUnmaterializedHistory(connectionId, stage) {
        // Empty history is a normal state for a new Thread; keep this at debug so
        // the reason is still observable without warning noise on every open.
        this.logger.debug('Codex history projected as empty unmaterialized thread', {
            connectionId: maskId(connectionId),
            stage,
        });
    }
    async assertResultThreadAllowed(result) {
        const thread = extractThread(result);
        if (thread === undefined || typeof thread.id !== 'string') {
            throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid thread.');
        }
        if (!isThreadAllowedByWorkspaceAuthority(thread, await this.readWorkspaceAuthority())) {
            throw new RpcError('CODEX_THREAD_NOT_ALLOWED', 'The Codex thread is not available through this Remote Host.');
        }
    }
    claimTurn(threadId, connectionId, method, turnId) {
        const owner = this.turnOwners.get(threadId);
        const peerDeviceId = this.peerDeviceIds.get(connectionId) ?? connectionId;
        const nextOwner = { connectionId, peerDeviceId, ...(turnId === undefined ? {} : { turnId }) };
        if (method === 'turn/interrupt') {
            if (owner === undefined) {
                // A replacement connection may recover an already-running persisted
                // turn. Claim only for this explicit mutation; passive viewers still
                // remain observers and cannot steal a live connection's lease.
                this.turnOwners.set(threadId, nextOwner);
                return { claimed: true };
            }
            if (owner.connectionId !== connectionId && owner.peerDeviceId !== peerDeviceId) {
                throw new RpcError('CODEX_TURN_OWNED', 'Only the connection that started this Codex turn can interrupt it.');
            }
            if (owner.connectionId !== connectionId) {
                this.turnOwners.set(threadId, { ...owner, connectionId, peerDeviceId, ...(turnId === undefined ? {} : { turnId }) });
                return { claimed: true, previous: owner };
            }
            if (turnId !== undefined && owner.turnId === undefined)
                this.turnOwners.set(threadId, { ...owner, turnId });
            return { claimed: false };
        }
        if (owner !== undefined && owner.connectionId !== connectionId && owner.peerDeviceId !== peerDeviceId) {
            throw new RpcError('CODEX_TURN_OWNED', 'Another Remote connection owns the active Codex turn.');
        }
        if (owner?.connectionId === connectionId)
            return { claimed: false };
        this.turnOwners.set(threadId, owner === undefined ? nextOwner : { ...owner, connectionId, peerDeviceId });
        return { claimed: true, previous: owner };
    }
    rememberTurnId(threadId, connectionId, turnId) {
        if (turnId === undefined)
            return;
        const owner = this.turnOwners.get(threadId);
        if (owner === undefined || owner.connectionId !== connectionId)
            return;
        this.turnOwners.set(threadId, { ...owner, turnId });
    }
    hasSubscriber(threadId) {
        return [...this.peers.values()].some(peer => peer.hasThreadSubscription(threadId));
    }
    enqueueInbound(appServer, message) {
        if (this.closed || this.appServer !== appServer)
            return;
        const receivedAt = Date.now();
        const explicitThreadId = extractThreadId(message.params);
        const pendingToken = message.kind === 'request' && explicitThreadId !== undefined
            ? { id: message.id, threadId: explicitThreadId }
            : undefined;
        if (pendingToken !== undefined) {
            this.pendingRequestThreads.set(pendingToken.id, pendingToken);
        }
        const chainThreadId = explicitThreadId
            ?? (message.kind === 'notification' && message.method === 'serverRequest/resolved'
                ? this.findInboundThreadForResolved(message.params)
                : undefined);
        const key = chainThreadId === undefined ? '__global__' : `thread:${chainThreadId}`;
        const prev = this.inboundChains.get(key) ?? Promise.resolve();
        const next = prev.then(async () => {
            try {
                if (this.closed || this.appServer !== appServer)
                    return;
                await this.handleInbound(message, receivedAt);
            }
            catch (error) {
                this.logger.warn('Codex inbound handling failed', { code: errorCode(error) });
            }
            finally {
                if (pendingToken !== undefined && this.pendingRequestThreads.get(pendingToken.id) === pendingToken) {
                    this.pendingRequestThreads.delete(pendingToken.id);
                }
            }
        });
        this.inboundChains.set(key, next);
        void next.finally(() => {
            if (this.inboundChains.get(key) === next)
                this.inboundChains.delete(key);
        });
    }
    findInboundThreadForResolved(params) {
        if (!isRecord(params) || (typeof params.requestId !== 'string' && typeof params.requestId !== 'number'))
            return undefined;
        return this.pendingRequestThreads.get(params.requestId)?.threadId
            ?? this.findMatchingApprovals(params)[0]?.threadId;
    }
    findMatchingApprovals(params) {
        if (!isRecord(params) || (typeof params.requestId !== 'string' && typeof params.requestId !== 'number'))
            return [];
        const matches = [];
        for (const [handle, approval] of this.approvals) {
            if (approval.upstreamId === params.requestId) {
                matches.push({ handle, threadId: approval.threadId });
            }
        }
        return matches;
    }
    resolveUpstreamApproval(params) {
        const matches = this.findMatchingApprovals(params);
        if (matches.length === 0)
            return matches;
        for (const match of matches) {
            this.approvals.delete(match.handle);
            void this.threadLifecycle.retry(match.threadId);
        }
        this.scheduleApprovalExpiry();
        return matches;
    }
    async expireApprovals() {
        const now = Date.now();
        const appServer = this.appServer;
        for (const [handle, approval] of this.approvals) {
            if (approval.expiresAt > now)
                continue;
            this.approvals.delete(handle);
            await appServer?.respond(approval.upstreamId, { decision: 'decline' }).catch(() => undefined);
            void this.threadLifecycle.retry(approval.threadId);
        }
        this.scheduleApprovalExpiry();
    }
    scheduleApprovalExpiry() {
        if (this.approvalExpiryTimer !== undefined)
            clearTimeout(this.approvalExpiryTimer);
        this.approvalExpiryTimer = undefined;
        const nextExpiry = Math.min(...[...this.approvals.values()].map(approval => approval.expiresAt));
        if (!Number.isFinite(nextExpiry))
            return;
        this.approvalExpiryTimer = setTimeout(() => {
            this.approvalExpiryTimer = undefined;
            void this.expireApprovals().catch(error => {
                this.logger.warn('Codex approval expiry failed', { code: errorCode(error) });
            });
        }, Math.max(0, nextExpiry - Date.now()));
        this.approvalExpiryTimer.unref?.();
    }
    armTurnWatchdog(threadId) {
        if (this.closed || this.turnSilenceTimeoutMs <= 0 || !this.turnOwners.has(threadId))
            return;
        this.clearTurnWatchdog(threadId);
        const timer = setTimeout(() => {
            this.turnWatchdogs.delete(threadId);
            void this.failSilentTurn(threadId).catch(error => {
                this.logger.warn('Codex turn silence watchdog failed', { code: errorCode(error) });
            });
        }, this.turnSilenceTimeoutMs);
        timer.unref?.();
        this.turnWatchdogs.set(threadId, timer);
    }
    clearTurnWatchdog(threadId) {
        const timer = this.turnWatchdogs.get(threadId);
        if (timer === undefined)
            return;
        clearTimeout(timer);
        this.turnWatchdogs.delete(threadId);
    }
    clearAllTurnWatchdogs() {
        for (const timer of this.turnWatchdogs.values())
            clearTimeout(timer);
        this.turnWatchdogs.clear();
    }
    /**
     * App Server can drop a turn without `turn/completed` (observed on HTTP 503).
     * Release the writer lease and project a failed turn/end so Remote clients
     * leave the forever-"thinking" state.
     */
    async failSilentTurn(threadId) {
        const owner = this.turnOwners.get(threadId);
        this.clearTurnWatchdog(threadId);
        if (owner === undefined || this.closed)
            return;
        this.turnOwners.delete(threadId);
        for (const [handle, approval] of this.approvals) {
            if (approval.threadId !== threadId)
                continue;
            this.approvals.delete(handle);
            void this.appServer?.respond(approval.upstreamId, { decision: 'decline' }).catch(() => undefined);
        }
        this.scheduleApprovalExpiry();
        const turn = {
            id: owner.turnId ?? `silence:${threadId}`,
            status: 'failed',
            error: {
                message: TURN_SILENCE_MESSAGE,
                codex_error_info: 'remote_turn_silence',
            },
            items: [],
        };
        this.logger.warn('Codex turn silence watchdog fired', { code: 'remote_turn_silence' });
        await this.publishToThread(threadId, {
            method: 'turn/completed',
            params: { threadId, turn },
        });
    }
    requireAppServer() {
        if (!this.config.enabled || !this.isAvailable() || this.appServer === undefined) {
            throw new RpcError('CODEX_UNAVAILABLE', 'Codex Remote is disabled or unavailable on this Host.');
        }
        return this.appServer;
    }
    async callUpstream(method, params, timeoutMs) {
        const appServer = this.requireAppServer();
        try {
            const result = await appServer.call(method, params, timeoutMs);
            if (this.closed || this.appServer !== appServer || !this.isAvailable()) {
                throw new RpcError('CODEX_UNAVAILABLE', 'The Codex App Server changed while handling the request.');
            }
            return result;
        }
        catch (error) {
            throw mapAppServerError(error);
        }
    }
    readWorkspaceAuthority(listedThreads) {
        const pending = this.workspaceAuthorityPromise;
        if (pending !== undefined)
            return pending;
        const current = this.readWorkspaceAuthorityUncached(listedThreads);
        this.workspaceAuthorityPromise = current;
        current.then(() => { if (this.workspaceAuthorityPromise === current)
            this.workspaceAuthorityPromise = undefined; }, () => { if (this.workspaceAuthorityPromise === current)
            this.workspaceAuthorityPromise = undefined; });
        return current;
    }
    async readWorkspaceAuthorityUncached(listedThreads) {
        const projectIds = new Set();
        const roots = [];
        let cursor;
        try {
            for (let page = 0; page < MAX_CODEX_PAGES; page += 1) {
                const result = sanitizeProjectList(await this.callUpstream('project/list', {
                    limit: CODEX_PAGE_LIMIT,
                    ...(cursor === undefined ? {} : { cursor }),
                }));
                for (const project of result.data) {
                    const projectRoots = project.roots.map(root => root.path).filter(path => isAbsolute(path));
                    if (projectRoots.length === 0)
                        continue;
                    projectIds.add(project.id);
                    roots.push(...projectRoots);
                }
                cursor = typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : undefined;
                if (cursor === undefined)
                    break;
            }
        }
        catch (error) {
            if (!isProjectListFallbackError(error))
                throw error;
        }
        if (roots.length > 0)
            return { projectIds, roots };
        const threads = listedThreads === undefined ? [] : [...listedThreads];
        if (listedThreads === undefined) {
            cursor = undefined;
            for (let page = 0; page < MAX_CODEX_PAGES; page += 1) {
                const result = sanitizeThreadList(await this.callUpstream('thread/list', {
                    limit: CODEX_PAGE_LIMIT,
                    sortKey: 'updated_at',
                    sortDirection: 'desc',
                    archived: false,
                    ...(cursor === undefined ? {} : { cursor }),
                }));
                threads.push(...result.data);
                cursor = typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : undefined;
                if (cursor === undefined)
                    break;
            }
        }
        for (const workspace of deriveCodexCwdWorkspaces(threads)) {
            if (isAbsolute(workspace.path))
                roots.push(workspace.path);
        }
        return { projectIds, roots };
    }
    async findKnownThreadInList(threadId, authority) {
        let cursor;
        for (let page = 0; page < MAX_CODEX_PAGES; page += 1) {
            const result = sanitizeThreadList(await this.callUpstream('thread/list', {
                limit: 100,
                sortKey: 'updated_at',
                sortDirection: 'desc',
                archived: false,
                ...(cursor === undefined ? {} : { cursor }),
            }));
            const thread = result.data.find(item => item.id === threadId);
            if (thread !== undefined) {
                return isThreadAllowedByWorkspaceAuthority(thread, authority) ? thread : undefined;
            }
            cursor = typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : undefined;
            if (cursor === undefined)
                break;
        }
        return undefined;
    }
    async requireCodexWorkspacePath(path) {
        if (!isAbsolute(path)) {
            throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX working directory is not available as a Workspace.');
        }
        const paths = await this.listCodexWorkspacePaths();
        const lexicalCandidate = resolve(path);
        let candidate;
        try {
            candidate = await realpath(path);
            if (!(await stat(candidate)).isDirectory())
                throw new Error('not a directory');
        }
        catch {
            throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX working directory is not available as a Workspace.');
        }
        for (const root of paths.values()) {
            try {
                if (!containsCodexPath(resolve(root), lexicalCandidate))
                    continue;
                const canonicalRoot = await realpath(root);
                if (containsCodexPath(canonicalRoot, candidate))
                    return lexicalCandidate;
            }
            catch {
                // A stale project or Thread cwd is not authority for a new Thread.
            }
        }
        throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX working directory is not available as a Workspace.');
    }
    async requireNewCodexProjectPath(path) {
        if (!isAbsolute(path)) {
            throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX project directory must be an existing absolute directory.');
        }
        try {
            const canonical = await realpath(resolve(path));
            if (!(await stat(canonical)).isDirectory())
                throw new Error('not a directory');
            return canonical;
        }
        catch {
            throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX project directory must be an existing absolute directory.');
        }
    }
    async listCodexDirectory(path) {
        const target = await this.resolveCodexDirectory(path);
        const rows = await readdir(target.path, { withFileTypes: true }).catch(() => undefined);
        if (rows === undefined) {
            throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX working directory is not available as a Workspace.');
        }
        const entries = [];
        for (const row of rows) {
            const child = resolve(target.path, row.name);
            let directory = row.isDirectory();
            if (!directory && row.isSymbolicLink()) {
                directory = await stat(child).then(value => value.isDirectory()).catch(() => false);
            }
            if (!directory)
                continue;
            try {
                const canonicalChild = await realpath(child);
                if (!(await stat(canonicalChild)).isDirectory())
                    continue;
                if (!containsCodexPath(target.canonicalRoot, canonicalChild))
                    continue;
            }
            catch {
                continue;
            }
            entries.push({
                name: row.name,
                path: child,
                hidden: process.platform !== 'win32' && row.name.startsWith('.'),
            });
        }
        entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
        return {
            path: target.path,
            home: target.root,
            crumbs: codexDirectoryCrumbs(target.root, target.path),
            entries: entries.slice(0, CODEX_DIRECTORY_ENTRY_LIMIT),
            truncated: entries.length > CODEX_DIRECTORY_ENTRY_LIMIT,
        };
    }
    async resolveCodexDirectory(path) {
        if (!isAbsolute(path)) {
            throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX working directory is not available as a Workspace.');
        }
        const authority = await this.readWorkspaceAuthority();
        const lexicalCandidate = resolve(path);
        let canonicalCandidate;
        try {
            canonicalCandidate = await realpath(path);
            if (!(await stat(canonicalCandidate)).isDirectory())
                throw new Error('not a directory');
        }
        catch {
            throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX working directory is not available as a Workspace.');
        }
        for (const root of authority.roots) {
            try {
                const lexicalRoot = resolve(root);
                if (!containsCodexPath(lexicalRoot, lexicalCandidate))
                    continue;
                const canonicalRoot = await realpath(root);
                if (containsCodexPath(canonicalRoot, canonicalCandidate)) {
                    return { path: lexicalCandidate, root: lexicalRoot, canonicalRoot };
                }
            }
            catch {
                // A stale project or Thread cwd is not authority for directory browsing.
            }
        }
        throw new RpcError('CODEX_PATH_NOT_ALLOWED', 'The CodeX working directory is not available as a Workspace.');
    }
    async listCodexWorkspacePaths() {
        const paths = new Map();
        const authority = await this.readWorkspaceAuthority();
        for (const root of authority.roots)
            paths.set(normalizeCodexPathForCompare(root), root);
        return paths;
    }
}
function findProjectedImageAttachment(entries, attachmentId) {
    for (const entry of entries) {
        const found = findImageBlock(entry.event.data, attachmentId);
        if (found !== undefined)
            return found;
    }
    return undefined;
}
function findImageBlock(value, attachmentId) {
    if (Array.isArray(value)) {
        for (const child of value) {
            const found = findImageBlock(child, attachmentId);
            if (found !== undefined)
                return found;
        }
        return undefined;
    }
    if (!isRecord(value))
        return undefined;
    if (value.type === 'image' && isRecord(value.attachment)
        && value.attachment.attachmentId === attachmentId && typeof value.data === 'string') {
        return { attachment: value.attachment, data: value.data };
    }
    for (const child of Object.values(value)) {
        const found = findImageBlock(child, attachmentId);
        if (found !== undefined)
            return found;
    }
    return undefined;
}
/**
 * Prefer Codex bundled with the current ChatGPT desktop app on macOS when the
 * user kept the default command. Explicit binary configuration is never
 * rewritten or supplemented.
 */
export function codexBinaryCandidates(configured, hostPlatform = process.platform, userHome = homedir()) {
    if (configured !== 'codex')
        return [configured];
    if (hostPlatform === 'darwin')
        return macOSCodexBinaryCandidates(userHome);
    // The Codex desktop app on Windows ships its own codex CLI under
    // %LOCALAPPDATA%\OpenAI\Codex\bin\<build-hash>\codex.exe. Prefer the newest
    // build so the app's current version is used; fall back to the configured
    // `codex` when the app is absent or unreadable.
    if (hostPlatform === 'win32') {
        return [...new Set([...windowsBundledCodexCandidates(userHome), configured])];
    }
    return [configured];
}
function macOSCodexBinaryCandidates(userHome) {
    const bundledCandidates = [
        '/Applications/ChatGPT.app',
        join(userHome, 'Applications', 'ChatGPT.app'),
    ].flatMap(chatGptApp => {
        const codexCli = join(chatGptApp, 'Contents', 'Resources', 'codex-cli');
        try {
            const manifest = JSON.parse(readFileSync(join(codexCli, 'codex-package.json'), 'utf8'));
            if (!isRecord(manifest) || typeof manifest.entrypoint !== 'string' || manifest.entrypoint.length === 0) {
                return [];
            }
            const candidate = join(codexCli, manifest.entrypoint);
            if (!existsSync(candidate))
                return [];
            accessSync(candidate, constants.X_OK);
            return [candidate];
        }
        catch {
            return [];
        }
    });
    return [...new Set([
            ...bundledCandidates,
            '/Applications/ChatGPT.app/Contents/Resources/codex',
            join(userHome, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex'),
            'codex',
        ])];
}
/**
 * Codex desktop (ChatGPT/Codex for Windows) bundled CLI candidates, newest
 * build first. Reads `%LOCALAPPDATA%\OpenAI\Codex\bin`; returns an empty list
 * when the app is not installed. Never throws.
 */
function windowsBundledCodexCandidates(userHome) {
    const localAppData = process.env.LOCALAPPDATA ?? join(userHome, 'AppData', 'Local');
    const binRoot = join(localAppData, 'OpenAI', 'Codex', 'bin');
    try {
        return readdirSync(binRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => join(binRoot, entry.name, 'codex.exe'))
            .filter(candidate => existsSync(candidate))
            .map(candidate => {
            try {
                return { candidate, mtime: statSync(candidate).mtimeMs };
            }
            catch {
                return { candidate, mtime: 0 };
            }
        })
            .sort((left, right) => right.mtime - left.mtime)
            .map(entry => entry.candidate);
    }
    catch {
        return [];
    }
}
function parseCallEnvelope(input) {
    if (!isRecord(input) || typeof input.method !== 'string' || !('params' in input)
        || Object.keys(input).some(key => key !== 'method' && key !== 'params')) {
        throw new RpcError('INVALID_MESSAGE', 'The Codex call envelope is invalid.');
    }
    return { method: input.method, params: input.params };
}
function parseRespond(input) {
    if (!isRecord(input)
        || typeof input.requestHandle !== 'string'
        || !['accept', 'decline', 'cancel'].includes(String(input.decision))
        || Object.keys(input).some(key => key !== 'requestHandle' && key !== 'decision')) {
        throw new RpcError('INVALID_MESSAGE', 'The Codex approval response is invalid.');
    }
    return input;
}
function accountCanRun(result) {
    if (!isRecord(result) || typeof result.requiresOpenaiAuth !== 'boolean')
        return false;
    return result.requiresOpenaiAuth === false || isRecord(result.account);
}
function sanitizeAccount(result) {
    if (!isRecord(result))
        throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned invalid account state.');
    const account = isRecord(result.account) ? result.account : undefined;
    return {
        authenticated: account !== undefined || result.requiresOpenaiAuth === false,
        requiresOpenaiAuth: result.requiresOpenaiAuth === true,
        ...(account === undefined ? {} : {
            account: {
                ...(typeof account.type === 'string' ? { type: account.type } : {}),
                ...(typeof account.planType === 'string' ? { planType: account.planType } : {}),
            },
        }),
    };
}
function sanitizeThreadList(result) {
    if (!isRecord(result) || !Array.isArray(result.data)) {
        throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid thread list.');
    }
    const data = result.data.flatMap(value => {
        if (!isRecord(value) || typeof value.id !== 'string')
            return [];
        return [{
                id: value.id,
                ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
                ...(typeof value.projectId === 'string' ? { projectId: value.projectId } : {}),
                ...(typeof value.name === 'string' ? { name: value.name } : {}),
                ...(typeof value.preview === 'string' ? { preview: value.preview } : {}),
                ...(typeof value.cwd === 'string' ? { cwd: value.cwd } : {}),
                ...(typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? { createdAt: value.createdAt } : {}),
                ...(typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
                ...(typeof value.archived === 'boolean' ? { archived: value.archived } : {}),
                ...(typeof value.isPinned === 'boolean' ? { isPinned: value.isPinned } : {}),
                ...(isRecord(value.status) ? { status: value.status } : {}),
            }];
    });
    return {
        data,
        ...(typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? { nextCursor: result.nextCursor } : { nextCursor: null }),
        ...(typeof result.backwardsCursor === 'string' && result.backwardsCursor.length > 0
            ? { backwardsCursor: result.backwardsCursor }
            : {}),
    };
}
function filterThreadListByWorkspaceAuthority(result, authority) {
    if (!isRecord(result) || !Array.isArray(result.data)) {
        throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid thread list.');
    }
    return {
        ...result,
        data: result.data
            .map(record => isRecord(record) ? record : undefined)
            .filter((thread) => (thread !== undefined && isThreadAllowedByWorkspaceAuthority(thread, authority))),
    };
}
function sanitizeProject(value) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string')
        return undefined;
    const roots = Array.isArray(value.roots)
        ? value.roots.flatMap(root => {
            const path = isRecord(root) && typeof root.path === 'string' && root.path.length > 0 ? root.path : undefined;
            return path === undefined || !isAbsolute(path) ? [] : [{ path }];
        })
        : [];
    if (roots.length === 0)
        return undefined;
    return {
        id: value.id,
        name: value.name,
        roots,
        ...(typeof value.position === 'number' && Number.isFinite(value.position) ? { position: value.position } : {}),
        ...(typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? { createdAt: value.createdAt } : {}),
        ...(typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
    };
}
function sanitizeProjectList(result) {
    if (!isRecord(result) || !Array.isArray(result.data)) {
        throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid project list.');
    }
    const data = result.data.flatMap(value => sanitizeProject(value) ?? []);
    return {
        data,
        ...(typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? { nextCursor: result.nextCursor } : { nextCursor: null }),
    };
}
function sanitizeProjectCreate(result) {
    const project = isRecord(result) ? sanitizeProject(result.project) : undefined;
    if (project === undefined) {
        throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid created project.');
    }
    return { project };
}
function isThreadAllowedByWorkspaceAuthority(thread, authority) {
    const projectId = typeof thread.projectId === 'string' ? thread.projectId : undefined;
    if (projectId !== undefined && authority.projectIds.has(projectId))
        return true;
    const cwd = typeof thread.cwd === 'string' ? thread.cwd : undefined;
    return cwd !== undefined && authority.roots.some(root => containsCodexPath(root, cwd));
}
function containsCodexPath(root, candidate) {
    const normalizedRoot = normalizeCodexPathForCompare(root);
    const normalizedCandidate = normalizeCodexPathForCompare(candidate);
    return normalizedCandidate === normalizedRoot
        || normalizedCandidate.startsWith(`${normalizedRoot}/`)
        || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}
function normalizeCodexPathForCompare(path) {
    return path.replace(/[\\/]+$/u, '') || path;
}
function codexDirectoryCrumbs(root, path) {
    const crumbs = [{ name: basename(root) || root, path: root, hidden: false }];
    const remainder = relative(root, path);
    if (remainder === '')
        return crumbs;
    let current = root;
    for (const segment of remainder.split(/[\\/]+/u).filter(Boolean)) {
        current = resolve(current, segment);
        crumbs.push({ name: segment, path: current, hidden: false });
    }
    return crumbs;
}
function extractThread(result) {
    return isRecord(result) && isRecord(result.thread) ? result.thread : undefined;
}
function extractTurnId(result) {
    if (!isRecord(result))
        return undefined;
    if (typeof result.turnId === 'string' && result.turnId.length > 0)
        return result.turnId;
    if (isRecord(result.turn) && typeof result.turn.id === 'string' && result.turn.id.length > 0)
        return result.turn.id;
    return undefined;
}
function extractThreadId(params) {
    if (!isRecord(params))
        return undefined;
    if (typeof params.threadId === 'string')
        return params.threadId;
    if (isRecord(params.thread) && typeof params.thread.id === 'string')
        return params.thread.id;
    if (isRecord(params.turn) && typeof params.turn.threadId === 'string')
        return params.turn.threadId;
    return undefined;
}
function goalRetainsThread(goal, threadId) {
    if (!isRecord(goal) || goal.threadId !== threadId || typeof goal.status !== 'string')
        return true;
    return !['complete', 'paused', 'blocked', 'usageLimited', 'budgetLimited'].includes(goal.status);
}
function isTerminalThreadStatus(params) {
    if (!isRecord(params) || !isRecord(params.status) || typeof params.status.type !== 'string')
        return false;
    return params.status.type !== 'active';
}
function optionalInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}
function codexPermission(params, fallbackPreset) {
    const { permissionPreset, ...rest } = params;
    const preset = permissionPreset === 'workspace-write' || permissionPreset === 'danger-full-access'
        ? permissionPreset
        : fallbackPreset;
    if (preset === undefined)
        return { params: mapCodexImageInputs(rest) };
    const fullAccess = preset === 'danger-full-access';
    return {
        params: mapCodexImageInputs(rest),
        approvalPolicy: fullAccess ? 'never' : 'on-request',
        sandbox: fullAccess ? 'danger-full-access' : 'workspace-write',
    };
}
function codexThreadPermissionParams(permission) {
    if (permission.approvalPolicy === undefined || permission.sandbox === undefined)
        return {};
    return {
        approvalPolicy: permission.approvalPolicy,
        sandbox: permission.sandbox,
    };
}
function codexTurnPermissionParams(permission, cwd) {
    if (permission.approvalPolicy === undefined || permission.sandbox === undefined)
        return {};
    return {
        approvalPolicy: permission.approvalPolicy,
        sandboxPolicy: permission.sandbox === 'danger-full-access'
            ? { type: 'dangerFullAccess' }
            : {
                type: 'workspaceWrite',
                writableRoots: cwd === undefined ? [] : [cwd],
                networkAccess: false,
                excludeTmpdirEnvVar: false,
                excludeSlashTmp: false,
            },
    };
}
function mapCodexImageInputs(params) {
    if (!Array.isArray(params.input))
        return params;
    return {
        ...params,
        input: params.input.map(value => {
            if (!isRecord(value) || value.type !== 'image'
                || typeof value.mediaType !== 'string' || typeof value.data !== 'string')
                return value;
            return { type: 'image', url: `data:${value.mediaType};base64,${value.data}` };
        }),
    };
}
function sanitizeApprovalParams(params, requestHandle) {
    if (!isRecord(params))
        return { requestHandle };
    const safe = { ...params };
    delete safe.proposedExecpolicyAmendment;
    delete safe.additionalPermissions;
    safe.availableDecisions = ['accept', 'decline', 'cancel'];
    safe.requestHandle = requestHandle;
    return safe;
}
function mapAppServerError(error) {
    if (error instanceof RpcError)
        return error;
    if (error instanceof CodexAppServerError) {
        if (error.code === 'CODEX_UPSTREAM_ERROR' && isActiveWriterMessage(error.message)) {
            return new RpcError('CODEX_THREAD_BUSY', 'The selected CodeX thread is already active in another CodeX client.');
        }
        return new RpcError(error.code, error.message, undefined, error.code === 'CODEX_REQUEST_TIMEOUT');
    }
    return new RpcError('CODEX_UPSTREAM_ERROR', 'Codex App Server could not complete the request.');
}
function errorCode(error) {
    if (error instanceof RpcError || error instanceof CodexAppServerError)
        return error.code;
    return 'CODEX_START_FAILED';
}
function isHistoryReadRecoverable(error) {
    return error instanceof RpcError
        && ['METHOD_NOT_ALLOWED', 'METHOD_NOT_FOUND', 'CODEX_UPSTREAM_ERROR', 'CODEX_REQUEST_TIMEOUT', 'CODEX_THREAD_BUSY'].includes(error.code);
}
function historyNextCursor(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value !== 'string') {
        throw new RpcError('CODEX_INVALID_RESPONSE', 'Codex App Server returned an invalid history cursor.');
    }
    return value;
}
// Only try another history API for version/format compatibility. Busy and
// timeout failures must remain errors, not successful empty/partial baselines.
function isHistoryFormatFallback(error) {
    return error instanceof RpcError
        && ['METHOD_NOT_ALLOWED', 'METHOD_NOT_FOUND', 'CODEX_UPSTREAM_ERROR'].includes(error.code);
}
function isProjectListFallbackError(error) {
    return error instanceof RpcError
        && ['METHOD_NOT_ALLOWED', 'METHOD_NOT_FOUND', 'CODEX_UPSTREAM_ERROR'].includes(error.code);
}
function canTryNextBinary(error) {
    return !(error instanceof RpcError) || !['CODEX_AUTH_REQUIRED', 'CODEX_CLOSED'].includes(error.code);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function array(value) {
    return Array.isArray(value) ? value : [];
}
function maskId(value) {
    return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}
function isActiveWriterMessage(message) {
    return message.toLowerCase().includes('active writer');
}
function isUnpersistedThreadError(error) {
    return error instanceof RpcError
        && error.code === 'CODEX_UPSTREAM_ERROR'
        && error.message.toLowerCase().includes('not persisted yet');
}
function extractFrameTurnId(params) {
    if (!isRecord(params))
        return undefined;
    if (typeof params.turnId === 'string' && params.turnId.length > 0)
        return params.turnId;
    if (isRecord(params.turn) && typeof params.turn.id === 'string' && params.turn.id.length > 0)
        return params.turn.id;
    return undefined;
}
function extractFrameItemId(params) {
    if (!isRecord(params))
        return undefined;
    if (typeof params.itemId === 'string' && params.itemId.length > 0)
        return params.itemId;
    if (isRecord(params.item) && typeof params.item.id === 'string' && params.item.id.length > 0)
        return params.item.id;
    return undefined;
}
function isOversizedCodexFrame(frame) {
    return encodeMessage(createEvent('codex.app.frame', { streamId: MAX_STREAM_ID_PROBE, frame })).byteLength > MAX_SECURE_MESSAGE_BYTES;
}
function isResponseTooLargeError(error) {
    return isRecord(error) && error.code === 'RESPONSE_TOO_LARGE';
}
/** A new Thread is materialized by its first user message; before that its
 * turn list is unavailable and must be projected as an empty history. */
function isUnmaterializedThreadError(error) {
    return error instanceof RpcError && error.code === CODEX_THREAD_UNMATERIALIZED;
}
function isRetryableCodexStartError(error) {
    return !['CODEX_BINARY_UNAVAILABLE', 'CODEX_AUTH_REQUIRED', 'CODEX_CLOSED'].includes(errorCode(error));
}
//# sourceMappingURL=domain.js.map
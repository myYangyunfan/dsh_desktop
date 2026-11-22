import { AgentAcpClient } from '@dsh-remote/client-core';
import { ACP_TOOL_CALL_ENDPOINTS, ACP_TOOL_STREAM_ENDPOINTS } from '@dsh-remote/protocol';
import { AcpSessionHistoryCache } from '../session-history-cache.js';
import { normalizeVirtualHistoryTurnWindow, selectVirtualHistorySlice, utf8JsonByteLength, VIRTUAL_HISTORY_MAX_BYTES, VirtualHistoryResponseTooLargeError, } from '../virtual-history-pagination.js';
import { acpImageContent, acpImageLimits, parseAcpImage } from './image-content.js';
import { acpBackendLabel, createAcpWorkspaceView, modelCatalog, nativeWorkspace, recreateWorkspaceFromId } from './virtual-catalog.js';
import { acpPermissionsProjection, array, AsyncValueQueue, business, carrierArgs, extractPromptText, extractSessionId, fail, failFrom, failure, isAcpPermissionPreset, isRecord, nativeAcpId, optionalInteger, optionalPositiveInteger, record, requestArg, requiredString, sessionPrefix, string, success, } from './virtual-contract.js';
import { AcpEventCarrier } from './virtual-event-carrier.js';
import { AcpLiveProjection, contextPressureProjection } from './virtual-live.js';
import { AcpSessionTitles } from './virtual-titles.js';
/**
 * Browser-safe, in-memory Harness projection for the independent Agent ACP domain. Projects
 * cwd workspaces and ACP sessions onto the native DSH Workspace / Session /
 * Composer surface without writing DSH SessionStore.
 */
export class AcpVirtualHarness {
    client;
    host;
    backend;
    hostCarrier;
    historyCache;
    live;
    events;
    titles;
    workspaceById = new Map();
    sessions = new Map();
    workspaceStreams = new Set();
    controlStreams = new Set();
    eventStreams = new Map();
    follows = new Set();
    pendingApprovals = new Map();
    pendingHistory = new Map();
    selectedWorkspaceId;
    lastOpenedSessionId;
    openedWorkspaceSessions = new Map();
    selectedModels = new Map();
    selectedPermissions = new Map();
    commandSeq = 0;
    lastProjectionSeq = 0;
    imageAttachments = new Map();
    closed = false;
    archivedSessionIds = new Set();
    pinnedSessionIds = new Set();
    workspaceOrder = [];
    unsubscribeArchived;
    constructor(client, host, backend = "cursor", 
    /**
     * Host gateway used for endpoints this virtual Harness does not project
     * (settings, plugins, models, credentials, …). A real Harness workspace
     * serves them from the Host; without this fallback the native Client would
     * see `method-not-found` for every global surface and can fail its render.
     */
    hostCarrier, historyCache = new AcpSessionHistoryCache()) {
        this.client = client;
        this.host = host;
        this.backend = backend;
        this.hostCarrier = hostCarrier;
        this.historyCache = historyCache;
        const owner = this;
        this.live = new AcpLiveProjection({
            lookupSession: (...args) => owner.lookupSession(...args),
            get sessions() { return owner.sessions; },
            hydrateSession: (...args) => owner.hydrateSession(...args),
            historyPage: (...args) => owner.historyPage(...args),
            get follows() { return owner.follows; },
            get backend() { return owner.backend; },
            modelSelectionProjection: (...args) => owner.modelSelectionProjection(...args),
            get client() { return owner.client; },
            emitRemoteEvent: (...args) => owner.events.emitRemoteEvent(...args),
            get selectedModels() { return owner.selectedModels; },
            publishProjection: (...args) => owner.publishProjection(...args),
            nextProjectionSeq: (...args) => owner.nextProjectionSeq(...args),
            refreshSessionTitle: (...args) => owner.titles.refresh(...args),
            applySessionTitle: (...args) => owner.titles.applyNative(...args),
            publishWorkspaceBaseline: () => owner.publishWorkspaceBaseline(),
            get pendingApprovals() { return owner.pendingApprovals; },
            emitApproval: (...args) => owner.events.emitApproval(...args),
            modelSelection: (...args) => owner.modelSelection(...args),
            permissionsProjection: (...args) => owner.permissionsProjection(...args),
            permissionSelection: (...args) => owner.permissionSelection(...args),
            rememberOpenedSession: sessionId => owner.rememberOpenedSession(sessionId),
            syncSessionCache: session => owner.syncSessionCache(session),
        });
        this.events = new AcpEventCarrier({
            get archivedSessionIds() { return owner.archivedSessionIds; },
            get workspaceStreams() { return owner.workspaceStreams; },
            visibleWorkspaces: (...args) => owner.visibleWorkspaces(...args),
            get controlStreams() { return owner.controlStreams; },
            get eventStreams() { return owner.eventStreams; },
            get selectedWorkspaceId() { return owner.selectedWorkspaceId; },
            get workspaceById() { return owner.workspaceById; },
            backendLabel: (...args) => owner.backendLabel(...args),
            get pendingApprovals() { return owner.pendingApprovals; },
            get client() { return owner.client; },
            get sessions() { return owner.sessions; },
            nextProjectionSeq: (...args) => owner.nextProjectionSeq(...args),
            get pinnedSessionIds() { return owner.pinnedSessionIds; },
        });
        this.titles = new AcpSessionTitles(backend, client, this.sessions, (sessionId, title) => {
            const session = this.sessions.get(sessionId);
            if (session !== undefined)
                this.syncSessionCache(session);
            this.publishProjection(sessionId, 'title', title);
        });
        this.unsubscribeArchived = client.onSessionArchived?.(data => {
            if (this.closed || data.backend !== this.backend)
                return;
            this.applyArchived(`${sessionPrefix(this.backend)}${data.sessionId}`);
        });
    }
    static remote(core, host, backend = "cursor", capabilities = [], hostCarrier, historyCache) {
        return new AcpVirtualHarness(new AgentAcpClient(core, capabilities), host, backend, hostCarrier, historyCache);
    }
    get openedSessionId() {
        return this.lastOpenedSessionId;
    }
    get openedSessions() {
        return new Map(this.openedWorkspaceSessions);
    }
    rememberOpenedSession(sessionId) {
        if (this.closed)
            return;
        this.lastOpenedSessionId = sessionId;
        for (const workspace of this.workspaceById.values()) {
            if (!workspace.sessionIds.includes(sessionId))
                continue;
            this.openedWorkspaceSessions.delete(workspace.workspaceId);
            this.openedWorkspaceSessions.set(workspace.workspaceId, sessionId);
            if (this.openedWorkspaceSessions.size > 64) {
                this.openedWorkspaceSessions.delete(this.openedWorkspaceSessions.keys().next().value);
            }
        }
    }
    async workspaces() {
        for (const workspace of this.workspaceById.values())
            this.sortWorkspaceSessions(workspace);
        return [...this.workspaceById.values()];
    }
    backendLabel() {
        return acpBackendLabel(this.backend);
    }
    rememberWorkspace(workspace) {
        this.workspaceById.set(workspace.workspaceId, workspace);
        if (!this.workspaceOrder.includes(workspace.workspaceId)) {
            this.workspaceOrder.push(workspace.workspaceId);
        }
    }
    async selectWorkspace(workspaceId) {
        const workspace = this.workspaceById.get(workspaceId) ?? recreateWorkspaceFromId(workspaceId, this.backend);
        if (workspace === undefined)
            throw new Error(`The selected ${this.backendLabel()} workspace is no longer available.`);
        this.rememberWorkspace(workspace);
        this.selectedWorkspaceId = workspace.workspaceId;
        await this.discoverAndAttachSessions(workspace);
        if (workspace.sessionIds.length === 0) {
            await this.ensureInitialSession(workspace);
        }
        this.publishWorkspaceBaseline();
        return this.workspaceById.get(workspace.workspaceId) ?? workspace;
    }
    async selectOrCreateWorkspace(path, title) {
        const trimmed = path.trim();
        if (trimmed.length === 0)
            throw new Error(`A ${this.backendLabel()} working directory is required.`);
        const existing = [...this.workspaceById.values()].find(item => item.path === trimmed);
        let persisted;
        if (existing === undefined && this.client.createWorkspace !== undefined) {
            try {
                persisted = await this.client.createWorkspace(trimmed, this.backend, title);
            }
            catch (err) {
                const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
                if (code !== 'METHOD_NOT_FOUND' && code !== 'method-not-found' && code !== -32601) {
                    throw err;
                }
            }
        }
        const resolvedPath = persisted?.path ?? trimmed;
        const resolvedTitle = persisted?.title ?? title;
        const workspace = existing ?? createAcpWorkspaceView(resolvedPath, this.backend, resolvedTitle);
        this.rememberWorkspace(workspace);
        this.selectedWorkspaceId = workspace.workspaceId;
        await this.discoverAndAttachSessions(workspace);
        if (workspace.sessionIds.length === 0) {
            await this.ensureInitialSession(workspace);
        }
        this.publishWorkspaceBaseline();
        return this.workspaceById.get(workspace.workspaceId) ?? workspace;
    }
    async preferredSessionId(preferredSessionId = this.openedWorkspaceSessions.get(this.selectedWorkspaceId ?? '')) {
        const selected = this.selectedWorkspaceId === undefined
            ? undefined
            : this.workspaceById.get(this.selectedWorkspaceId);
        const sessionIds = selected?.sessionIds ?? [];
        if (preferredSessionId !== undefined && sessionIds.includes(preferredSessionId) && !this.archivedSessionIds.has(preferredSessionId)) {
            return preferredSessionId;
        }
        let bestSessionId;
        let bestUpdatedAt = -1;
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session !== undefined && !session.running && !session.blank && session.updatedAt > bestUpdatedAt) {
                bestUpdatedAt = session.updatedAt;
                bestSessionId = sessionId;
            }
        }
        if (bestSessionId !== undefined)
            return bestSessionId;
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session !== undefined && !session.running)
                return sessionId;
        }
        return sessionIds[0] ?? sessionIds.at(-1);
    }
    async invoke(request) {
        const result = await this.dispatch(`${request.namespace}/${request.method}`, { args: request.args }, request.signal ?? new AbortController().signal);
        if (result.ok)
            return result.value;
        throw Object.assign(new Error(result.error.message), {
            isDSHRemoteError: true,
            code: result.error.code,
            details: result.error.details,
        });
    }
    async dispatch(endpoint, payload, signal) {
        try {
            const args = carrierArgs(payload);
            if (ACP_TOOL_CALL_ENDPOINTS.some(item => item === endpoint)) {
                if (!this.client.workspaceToolCall)
                    return business(failure('method-not-found', 'The Host does not support ACP workspace tools.'));
                const sessionId = requiredString(args.workspaceFileScopeId ?? args.agentId ?? args.sessionId, 'sessionId');
                return business(await this.client.workspaceToolCall(nativeAcpId(sessionId, this.backend), this.backend, endpoint, args, signal));
            }
            switch (endpoint) {
                case '$events/result': return business(await this.events.answerRemoteEvent(args, signal));
                case 'workspace/list': return business(success({
                    items: this.visibleWorkspaces().map(nativeWorkspace),
                    archivedSessionIds: [...this.archivedSessionIds],
                    pinnedSessionIds: [...this.pinnedSessionIds],
                }));
                case 'workspace/create': return business(await this.createWorkspace(requestArg(args)));
                case 'workspace/rename': return business(await this.renameWorkspace(requestArg(args)));
                case 'workspace/delete': return business(await this.deleteWorkspace(requestArg(args)));
                case 'workspace/insertBefore': return business(await this.reorderWorkspaces(requestArg(args)));
                case 'workspace/insertSessionBefore': return business(await this.workspaceForSession(requestArg(args)));
                case 'workspace/archiveSession': return business(await this.archiveSession(requestArg(args)));
                case 'workspace/pinSession': return business(await this.pinSession(requestArg(args)));
                case 'workspace/unpinSession': return business(await this.unpinSession(requestArg(args)));
                case 'session/list': return business(success({ items: await this.handleSessionList() }));
                case 'session/projections': return business(await this.sessionProjections(requestArg(args)));
                case 'session/search': return business(success(this.searchSessions(requestArg(args))));
                case 'session/create': return business(await this.createSession(requestArg(args), signal));
                case 'session/fork': return business(await this.forkSession(requestArg(args), signal));
                case 'session/history': return business(await this.sessionHistory(requestArg(args)));
                case 'session/events':
                case 'session/page': return business(await this.sessionPage(requestArg(args)));
                case 'session/prompt': return business(await this.prompt(requestArg(args), signal));
                case 'session/cancel': return business(await this.cancel(requestArg(args), signal));
                case 'session/rename': return business(await this.renameSession(requestArg(args)));
                case 'session/updateQueue': return business(failure('queue-item-not-found', `${this.backendLabel()} does not expose a DSH inbox queue.`));
                case 'session/attachment': return business(await this.attachment(requestArg(args)));
                case 'agentPresets/list': return business(await this.agentPresetsList());
                case 'agentPresets/select': return business(await this.agentPresetSelect(args, signal));
                case 'session/modelCatalog': {
                    const sessionId = await this.preferredSessionId();
                    const catalog = modelCatalog(this.backend);
                    if (!sessionId)
                        return business(success(catalog));
                    const models = await this.hostSessionModels(sessionId);
                    return business(success({ default: models.current, routableProviders: models.routable ? [models.current.provider] : [], groups: models.groups, failures: models.failures }));
                }
                case 'session/models': {
                    const sessionId = this.resolveSessionId(extractSessionId(requestArg(args)));
                    try {
                        return business(success(await this.hostSessionModels(sessionId)));
                    }
                    catch {
                        return business(failure('model-unavailable', 'The Host model catalog is unavailable.'));
                    }
                }
                case 'session/selectModel': return business(await this.selectModel(requestArg(args)));
                case 'session/selectPermission': {
                    const rawId = extractSessionId(requestArg(args));
                    const sessionId = this.resolveSessionId(rawId);
                    const preset = requiredString(requestArg(args).preset, 'preset');
                    if (!isAcpPermissionPreset(preset))
                        return business(failure('invalid-preset', `unknown preset "${preset}"`));
                    this.setPermissionSelection(sessionId, preset);
                    return business(success({ preset }));
                }
                case 'session/initializeDefaultModel': return business(success(undefined));
                case 'session/canOpenWorkspacePath': return business(this.selectedWorkspaceId !== undefined);
                case 'session/openWorkspacePath': return business(failure('bad-request', `Opening Host paths is unavailable in ${this.backendLabel()} mode.`));
                case 'host/describe': return business(success(this.describeHost()));
                case 'host/listDirectory':
                case 'directoryPicker/list': return business(await this.listDirectory(requestArg(args), signal));
                case 'skills/list': return business(success({ skills: [] }));
                case 'job/kill': return business(success({ outcome: 'already-finished' }));
                case 'commands/list': return business(await this.commandList(requestArg(args)));
                case 'commands/execute': return business(await this.executeCommand(requestArg(args), signal));
                default:
                    return this.hostCarrier !== undefined && isAllowedHostCarrierDispatch(endpoint)
                        ? await this.hostCarrier.dispatch(endpoint, payload, signal)
                        : fail('method-not-found', `${this.backendLabel()} virtual Harness does not implement ${endpoint}.`);
            }
        }
        catch (error) {
            return failFrom(error);
        }
    }
    async open(endpoint, payload, signal) {
        const args = carrierArgs(payload);
        if (ACP_TOOL_STREAM_ENDPOINTS.some(item => item === endpoint)) {
            const sessionId = requiredString(args.workspaceFileScopeId ?? args.agentId ?? args.sessionId, 'sessionId');
            const queue = new AsyncValueQueue(signal);
            const stream = await this.client.openStream(nativeAcpId(sessionId, this.backend), frame => {
                if (frame.frame.method === 'dsh/workspaceTool')
                    queue.push(record(frame.frame.params).value);
            }, () => queue.close(), signal, { backend: this.backend, endpoint: endpoint, args });
            return queue.iterate(() => { void stream.close().catch(() => undefined); });
        }
        if (endpoint === 'workspace/follow')
            return this.events.workspaceFollow(signal);
        if (endpoint === 'session/control')
            return this.events.sessionControl(signal);
        if (endpoint === 'session/follow')
            return this.live.sessionFollow(requestArg(args), signal);
        if (endpoint === '$events')
            return this.events.remoteEvents(signal);
        if (endpoint === 'job/list' || endpoint === 'job/follow')
            return this.events.emptyJobStream(endpoint, signal);
        if (this.hostCarrier !== undefined && isAllowedHostCarrierOpen(endpoint)) {
            return this.hostCarrier.open(endpoint, payload, signal);
        }
        throw Object.assign(new Error(`${this.backendLabel()} virtual Harness does not implement stream ${endpoint}.`), {
            isDSHRemoteError: true,
            code: 'method-not-found',
            details: {},
        });
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const session of this.sessions.values()) {
            if (session.hydrated || session.events.length > 0) {
                this.syncSessionCache(session);
            }
        }
        this.titles.close();
        this.unsubscribeArchived?.();
        for (const stream of this.workspaceStreams)
            stream.close();
        for (const stream of this.controlStreams)
            stream.close();
        for (const stream of this.eventStreams.values())
            stream.close();
        this.workspaceStreams.clear();
        this.controlStreams.clear();
        this.eventStreams.clear();
        const follows = [...this.follows];
        this.follows.clear();
        for (const follow of follows) {
            follow.closed = true;
            follow.queue.close();
            await follow.close?.().catch(() => undefined);
        }
        this.pendingApprovals.clear();
        this.imageAttachments.clear();
    }
    hasExplicitWorkspaceOrder = false;
    visibleWorkspaces() {
        for (const workspace of this.workspaceById.values())
            this.sortWorkspaceSessions(workspace);
        const ordered = [];
        for (const id of this.workspaceOrder) {
            const item = this.workspaceById.get(id);
            if (item !== undefined)
                ordered.push(item);
        }
        for (const item of this.workspaceById.values()) {
            if (!ordered.some(existing => existing.workspaceId === item.workspaceId))
                ordered.push(item);
        }
        if (this.hasExplicitWorkspaceOrder || this.selectedWorkspaceId === undefined)
            return ordered;
        const selected = this.workspaceById.get(this.selectedWorkspaceId);
        if (selected === undefined)
            return ordered;
        return [
            selected,
            ...ordered.filter(item => item.workspaceId !== selected.workspaceId),
        ];
    }
    async createWorkspace(request) {
        const path = string(request.path)?.trim();
        const title = string(request.title)?.trim();
        if (path === undefined || path.length === 0)
            return failure('bad-request', `A ${this.backendLabel()} working directory is required.`);
        const workspace = await this.selectOrCreateWorkspace(path, title);
        this.publishWorkspaceBaseline();
        return success({ workspace: nativeWorkspace(workspace), created: true });
    }
    async renameWorkspace(request) {
        const workspaceId = requiredString(request.workspaceId, 'workspaceId');
        const title = string(request.title)?.trim();
        const workspace = this.workspaceById.get(workspaceId);
        if (workspace === undefined)
            return failure('workspace-not-found', `The ${this.backendLabel()} virtual Workspace was not found.`);
        if (title === undefined || title.length === 0)
            return failure('bad-request', 'A Workspace name is required.');
        if (this.client.renameWorkspace !== undefined) {
            await this.client.renameWorkspace(workspace.path, this.backend, title);
        }
        const next = { ...workspace, title, updatedAt: new Date().toISOString() };
        this.workspaceById.set(workspaceId, next);
        this.publishWorkspaceBaseline();
        return success({ workspace: nativeWorkspace(next) });
    }
    async deleteWorkspace(request) {
        const workspaceId = requiredString(request.workspaceId, 'workspaceId');
        const workspace = this.workspaceById.get(workspaceId);
        if (workspace === undefined)
            return failure('workspace-not-found', `The ${this.backendLabel()} virtual Workspace was not found.`);
        if (this.client.deleteWorkspace !== undefined) {
            await this.client.deleteWorkspace(workspace.path, this.backend);
        }
        this.workspaceById.delete(workspaceId);
        const idx = this.workspaceOrder.indexOf(workspaceId);
        if (idx !== -1)
            this.workspaceOrder.splice(idx, 1);
        if (this.selectedWorkspaceId === workspaceId) {
            this.selectedWorkspaceId = this.visibleWorkspaces()[0]?.workspaceId;
        }
        this.publishWorkspaceBaseline();
        return success({ workspaceIds: this.visibleWorkspaces().map(item => item.workspaceId) });
    }
    async reorderWorkspaces(request) {
        const workspaceId = requiredString(request.workspaceId, 'workspaceId');
        const beforeWorkspaceId = string(request.beforeWorkspaceId);
        const current = this.visibleWorkspaces().map(item => item.workspaceId);
        if (!current.includes(workspaceId)) {
            return failure('workspace-not-found', `The ${this.backendLabel()} virtual Workspace was not found.`);
        }
        const remaining = current.filter(id => id !== workspaceId);
        const targetIdx = beforeWorkspaceId !== undefined ? remaining.indexOf(beforeWorkspaceId) : -1;
        if (targetIdx === -1)
            remaining.push(workspaceId);
        else
            remaining.splice(targetIdx, 0, workspaceId);
        this.workspaceOrder.splice(0, this.workspaceOrder.length, ...remaining);
        this.hasExplicitWorkspaceOrder = true;
        if (this.client.reorderWorkspaces !== undefined) {
            const paths = remaining
                .map(id => this.workspaceById.get(id)?.path)
                .filter((p) => p !== undefined);
            await this.client.reorderWorkspaces(this.backend, paths);
        }
        this.publishWorkspaceBaseline();
        return success({ workspaceIds: remaining });
    }
    async pinSession(request) {
        const sessionId = this.resolveSessionId(extractSessionId(request));
        if (this.client.pinSession !== undefined) {
            const updated = await this.client.pinSession(nativeAcpId(sessionId, this.backend), this.backend);
            this.pinnedSessionIds.clear();
            for (const raw of updated) {
                this.pinnedSessionIds.add(raw.startsWith(sessionPrefix(this.backend)) ? raw : `${sessionPrefix(this.backend)}${raw}`);
            }
        }
        else {
            this.pinnedSessionIds.add(sessionId);
        }
        this.publishWorkspaceBaseline();
        return success({ pinnedSessionIds: [...this.pinnedSessionIds] });
    }
    async unpinSession(request) {
        const sessionId = this.resolveSessionId(extractSessionId(request));
        if (this.client.unpinSession !== undefined) {
            const updated = await this.client.unpinSession(nativeAcpId(sessionId, this.backend), this.backend);
            this.pinnedSessionIds.clear();
            for (const raw of updated) {
                this.pinnedSessionIds.add(raw.startsWith(sessionPrefix(this.backend)) ? raw : `${sessionPrefix(this.backend)}${raw}`);
            }
        }
        else {
            this.pinnedSessionIds.delete(sessionId);
        }
        this.publishWorkspaceBaseline();
        return success({ pinnedSessionIds: [...this.pinnedSessionIds] });
    }
    searchSessions(request) {
        const query = (string(request.query) ?? '').trim().toLowerCase();
        const workspaceId = string(request.workspaceId);
        const allowedWorkspace = workspaceId !== undefined ? this.workspaceById.get(workspaceId) : undefined;
        const allowedIds = allowedWorkspace !== undefined ? new Set(allowedWorkspace.sessionIds) : undefined;
        const limit = optionalPositiveInteger(request.limit) ?? 30;
        const matched = [...this.sessions.values()]
            .filter(session => !this.archivedSessionIds.has(session.sessionId))
            .filter(session => allowedIds === undefined || allowedIds.has(session.sessionId))
            .filter(session => {
            if (!query)
                return true;
            if ((session.title ?? '').toLowerCase().includes(query))
                return true;
            if (session.cwd.toLowerCase().includes(query))
                return true;
            return session.events.some(entry => {
                const text = JSON.stringify(entry.event.data ?? '').toLowerCase();
                return text.includes(query);
            });
        })
            .sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId));
        const slice = matched.slice(0, limit).map(session => this.sessionSummary(session, session.projectionSeq ?? -1));
        return { items: slice, hasMore: matched.length > slice.length };
    }
    async forkSession(request, signal) {
        const rawId = extractSessionId(request);
        const source = this.lookupSession(rawId);
        if (source === undefined)
            return failure('session-not-found', 'The Session was not found.');
        if (this.client.forkSession === undefined) {
            return failure('fork-unavailable', `${this.backendLabel()} Remote does not support session fork yet.`);
        }
        const forked = await this.client.forkSession(source.acpSessionId, this.backend, signal);
        const session = this.registerSession(forked.sessionId, source.cwd, source.title ? `${source.title} (fork)` : undefined, Date.now(), Date.now(), source.blank);
        if (source.modes !== undefined)
            session.modes = { ...source.modes };
        if (source.agentPreset !== undefined)
            session.agentPreset = source.agentPreset;
        this.attachSessionToWorkspace(source.cwd, session.sessionId);
        this.publishWorkspaceBaseline();
        const summarySeq = this.nextProjectionSeq(session.sessionId);
        this.events.emitRemoteEvent('api-session/added', [this.sessionSummary(session, summarySeq)]);
        this.events.publishProjection(session.sessionId, 'title', session.title ?? this.backendLabel(), this.nextProjectionSeq(session.sessionId));
        this.events.publishProjection(session.sessionId, 'modelSelection', this.modelSelectionProjection(session.sessionId), this.nextProjectionSeq(session.sessionId));
        return success({ sessionId: session.sessionId });
    }
    async agentPresetsList() {
        const sessionId = await this.preferredSessionId();
        if (sessionId === undefined || this.client.sessionModes === undefined) {
            return success({ presets: [] });
        }
        const session = this.sessions.get(sessionId);
        const modes = session?.modes ?? await this.client.sessionModes(nativeAcpId(sessionId, this.backend), this.backend);
        if (session !== undefined) {
            session.modes = modes;
            if (modes.currentModeId)
                session.agentPreset = modes.currentModeId;
        }
        const presets = modes.availableModes.map(mode => ({
            id: mode.id,
            isDefault: mode.id === 'default' || mode.id === modes.currentModeId,
            ...(mode.name !== undefined ? { name: mode.name } : {}),
            ...(mode.description !== undefined ? { description: mode.description } : {}),
        }));
        return success({ presets });
    }
    async agentPresetSelect(args, signal) {
        const req = requestArg(args);
        const rawId = string(args.agentId) ?? extractSessionId(req);
        const sessionId = this.resolveSessionId(rawId);
        const session = this.sessions.get(sessionId);
        const agentPreset = requiredString(args.agentPreset ?? req.agentPreset ?? req.modeId, 'agentPreset');
        if (this.client.setMode === undefined) {
            return failure('mode-unavailable', `${this.backendLabel()} Remote does not support mode switching.`);
        }
        const result = await this.client.setMode(nativeAcpId(sessionId, this.backend), this.backend, agentPreset, signal);
        const committed = result.currentModeId ?? agentPreset;
        if (session !== undefined) {
            session.agentPreset = committed;
            if (session.modes !== undefined)
                session.modes = { ...session.modes, currentModeId: committed };
        }
        const seq = this.nextProjectionSeq(sessionId);
        this.events.publishProjection(sessionId, 'agentPreset', committed, seq);
        return success(committed);
    }
    async workspaceForSession(request) {
        const sessionId = string(request.sessionId);
        const workspace = [...this.workspaceById.values()].find(item => sessionId !== undefined && item.sessionIds.includes(sessionId));
        return workspace === undefined
            ? failure('workspace-not-found', 'The Cursor virtual Workspace was not found.')
            : success({ workspace: nativeWorkspace(workspace) });
    }
    async archiveSession(request) {
        const sessionId = extractSessionId(request);
        if (this.backend === 'opencode') {
            if (!this.client.supportsArchive?.(this.backend) || !this.client.archiveSession)
                return failure('archive-unavailable', 'Update the Host plugin to archive OpenCode conversations.');
            await this.client.archiveSession(nativeAcpId(sessionId, this.backend), this.backend);
            this.applyArchived(sessionId);
            return success({ archivedSessionIds: [...this.archivedSessionIds] });
        }
        return failure('archive-unavailable', `Native session archiving is unavailable for ${this.backendLabel()}.`);
    }
    applyArchived(sessionId) {
        this.archivedSessionIds.add(sessionId);
        this.historyCache.delete(sessionId);
        for (const [workspaceId, workspace] of this.workspaceById) {
            if (!workspace.sessionIds.includes(sessionId))
                continue;
            const sessionIds = workspace.sessionIds.filter(id => id !== sessionId);
            this.workspaceById.set(workspaceId, {
                ...workspace,
                sessionIds,
                sessionCount: sessionIds.length,
                updatedAt: new Date().toISOString(),
            });
        }
        this.events.emitRemoteEvent('api-session/removed', [sessionId]);
        this.publishWorkspaceBaseline();
    }
    async createSession(request, signal) {
        const workspaceId = string(request.workspaceId) ?? this.selectedWorkspaceId;
        const workspace = workspaceId === undefined ? undefined : this.workspaceById.get(workspaceId);
        const cwd = string(request.cwd) ?? workspace?.path;
        if (cwd === undefined)
            return failure('workspace-not-found', 'The Cursor virtual Workspace was not found.');
        const requestedSessionId = string(request.sessionId);
        const reusable = requestedSessionId === undefined ? undefined : this.sessions.get(requestedSessionId);
        if (reusable !== undefined && reusable.cwd === cwd && reusable.blank && !reusable.running) {
            return success({ sessionId: reusable.sessionId });
        }
        const created = await this.client.createSession(cwd, 'agent', this.backend, signal);
        if (this.backend !== 'cursor' && this.sessions.has(`${sessionPrefix(this.backend)}${created.sessionId}`)) {
            return failure('session-already-exists', 'The backend returned an existing conversation for a new Session.');
        }
        const session = this.registerSession(created.sessionId, cwd, workspace?.title);
        this.attachSessionToWorkspace(cwd, session.sessionId);
        this.publishWorkspaceBaseline();
        const summarySeq = this.nextProjectionSeq(session.sessionId);
        this.events.emitRemoteEvent('api-session/added', [this.sessionSummary(session, summarySeq)]);
        this.events.publishProjection(session.sessionId, 'title', session.title ?? this.backendLabel(), this.nextProjectionSeq(session.sessionId));
        this.events.publishProjection(session.sessionId, 'modelSelection', this.modelSelectionProjection(session.sessionId), this.nextProjectionSeq(session.sessionId));
        return success({ sessionId: session.sessionId });
    }
    lookupSession(sessionId) {
        const direct = this.sessions.get(sessionId);
        if (direct !== undefined)
            return direct;
        if (this.backend !== 'cursor') {
            return this.sessions.get(`${sessionPrefix(this.backend)}${sessionId}`);
        }
        return undefined;
    }
    async prompt(request, signal) {
        const requestedId = extractSessionId(request);
        const session = this.lookupSession(requestedId);
        if (session === undefined)
            return failure('session-not-found', 'The Session was not found.');
        const sessionId = session.sessionId;
        await this.hydrateSession(session);
        const text = extractPromptText(array(request.content));
        let images;
        try {
            images = array(request.content).filter(part => record(part).type === 'image').map(parseAcpImage);
            if (images.length > 4 || (images.length > 0 && this.backend !== 'antigravity' && this.backend !== 'hermes') || array(request.content).some(part => !['text', 'image'].includes(String(record(part).type))))
                throw new Error('Unsupported ACP content.');
        }
        catch {
            return failure('attachment-error', 'Invalid or unsupported image attachment.');
        }
        if (text === undefined && images.length === 0)
            return failure('attachment-error', 'A prompt or image is required.');
        const imageBlocks = images.map(image => acpImageContent(image, `agy-image:${crypto.randomUUID()}.${image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.slice(6)}`));
        const hadFollow = [...this.follows].some(f => f.sessionId === sessionId);
        const prevEventsLen = session.events.length;
        const prevBlank = session.blank;
        const prevHydrated = session.hydrated;
        const prevRunning = session.running;
        const prevUpdatedAt = session.updatedAt;
        const prevTitle = session.title;
        const prevTitleFromPrompt = session.titleFromPrompt;
        const prevTitleOverridden = session.titleOverridden;
        const prevAttachmentIds = new Set(this.imageAttachments.keys());
        this.cacheImageAttachments(sessionId, imageBlocks);
        const requestId = typeof request.requestId === 'string' && request.requestId.length > 0
            ? request.requestId
            : undefined;
        try {
            await this.live.ensureFollow(session);
        }
        catch (error) {
            for (const id of [...this.imageAttachments.keys()]) {
                if (!prevAttachmentIds.has(id))
                    this.imageAttachments.delete(id);
            }
            throw error;
        }
        const follow = [...this.follows].find(f => f.sessionId === sessionId);
        const prevTurn = follow?.turn;
        const prevStepOpen = follow?.stepOpen;
        const prevNextSeq = follow?.nextSeq;
        if (follow !== undefined) {
            follow.turn += 1;
            follow.stepOpen = true;
            this.live.pushEvent(follow, 'turn/start', { turn: follow.turn });
            this.live.pushEvent(follow, 'step/start', { turn: follow.turn, step: 1 });
            this.live.pushEvent(follow, 'user/message', {
                id: `user:${Date.now()}`,
                role: 'user',
                content: [...(text ? [{ type: 'text', text }] : []), ...imageBlocks],
                source: requestId ? { kind: 'user', rpcId: requestId } : { kind: 'user' },
            });
        }
        this.titles.applyPrompt(session, text);
        session.blank = false;
        session.hydrated = true;
        session.running = true;
        session.updatedAt = Date.now();
        this.syncSessionCache(session);
        this.events.emitRemoteEvent('api-session/status', [sessionId, true]);
        this.publishWorkspaceBaseline();
        try {
            await this.client.prompt(session.acpSessionId, text ?? '', signal, images, this.backend);
        }
        catch (error) {
            if (!follow?.streamActive && session.events.length === prevEventsLen + 3) {
                session.events.length = prevEventsLen;
                session.blank = prevBlank;
                session.hydrated = prevHydrated;
                session.running = prevRunning;
                session.updatedAt = prevUpdatedAt;
                const titleChanged = session.title !== prevTitle;
                session.title = prevTitle;
                session.titleFromPrompt = prevTitleFromPrompt;
                session.titleOverridden = prevTitleOverridden;
                if (titleChanged) {
                    this.publishProjection(sessionId, 'title', prevTitle ?? this.backendLabel());
                }
                for (const id of [...this.imageAttachments.keys()]) {
                    if (!prevAttachmentIds.has(id))
                        this.imageAttachments.delete(id);
                }
                if (follow !== undefined) {
                    follow.turn = prevTurn;
                    follow.stepOpen = prevStepOpen;
                    follow.nextSeq = prevNextSeq;
                    if (!hadFollow || follow.hasConsumer) {
                        follow.closed = true;
                        this.follows.delete(follow);
                        follow.queue.close();
                        void follow.close?.().catch(() => undefined);
                    }
                }
            }
            else {
                session.running = false;
                if (follow !== undefined && !follow.closed && (follow.stepOpen || follow.streamActive)) {
                    const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
                        ? error.code
                        : 'ACP_PROMPT_FAILED';
                    const message = error instanceof Error ? error.message : String(error);
                    this.live.closeFollowAfterRemoteStreamClosed(follow, { kind: 'error', error: { code, message } });
                }
            }
            this.events.emitRemoteEvent('api-session/status', [sessionId, false]);
            this.syncSessionCache(session);
            this.publishWorkspaceBaseline();
            throw error;
        }
        return success({ accepted: true });
    }
    async cancel(request, signal) {
        const requestedId = extractSessionId(request);
        const session = this.lookupSession(requestedId);
        if (session === undefined)
            return failure('session-not-found', 'The Session was not found.');
        const sessionId = session.sessionId;
        await this.client.cancel(session.acpSessionId, signal);
        session.running = false;
        for (const follow of this.follows) {
            if (follow.sessionId === sessionId) {
                this.live.closeFollowAfterRemoteStreamClosed(follow, { kind: 'aborted', reason: { kind: 'user' } });
            }
        }
        this.syncSessionCache(session);
        this.events.emitRemoteEvent('api-session/status', [sessionId, false]);
        return success({ accepted: true });
    }
    async renameSession(request) {
        const requestedId = extractSessionId(request);
        const title = string(request.title)?.trim();
        const session = this.lookupSession(requestedId);
        if (session === undefined)
            return failure('session-not-found', 'The Session was not found.');
        if (!title)
            return failure('bad-request', 'A Session title is required.');
        session.title = title;
        session.titleOverridden = true;
        session.updatedAt = Date.now();
        this.syncSessionCache(session);
        const seq = this.nextProjectionSeq(session.sessionId);
        this.events.publishProjection(session.sessionId, 'title', title, seq);
        return success({ title, seq });
    }
    cacheImageAttachments(sessionId, content) {
        for (const value of content) {
            const block = record(value);
            const attachment = record(block.attachment);
            if (block.type === 'image' && typeof attachment.attachmentId === 'string' && typeof block.data === 'string') {
                this.imageAttachments.set(attachment.attachmentId, { sessionId, attachment, data: block.data });
            }
        }
    }
    async attachment(request) {
        const requestedId = extractSessionId(request);
        // 0.2.2 sends the full ImageAttachmentRef; older clients send only its id.
        const attachmentId = string(request.attachmentId)
            ?? string(record(request.attachment).attachmentId);
        const session = this.lookupSession(requestedId);
        if ((this.backend !== 'antigravity' && this.backend !== 'hermes') || session === undefined || !attachmentId?.startsWith('agy-image:'))
            return failure('attachment-error', 'The image is not referenced by this Session.');
        await this.hydrateSession(session);
        const cached = this.imageAttachments.get(attachmentId);
        return cached?.sessionId === session.sessionId ? success({ attachment: cached.attachment, data: cached.data }) : failure('attachment-error', 'The image attachment is unavailable or expired.');
    }
    async hydrateSession(session) {
        if (session.blank || (session.events.length > 0 && !session.staleHistory))
            return;
        const cached = this.historyCache.getFresh(session.sessionId);
        if (cached !== undefined && (!Number.isFinite(session.updatedAt) || session.updatedAt === cached.hostUpdatedAt)) {
            this.restoreCachedSession(session, cached, false);
            return;
        }
        const pending = this.pendingHistory.get(session.sessionId);
        if (pending)
            return pending;
        const read = this.hydrateSessionOnce(session);
        this.pendingHistory.set(session.sessionId, read);
        try {
            await read;
        }
        finally {
            if (this.pendingHistory.get(session.sessionId) === read)
                this.pendingHistory.delete(session.sessionId);
        }
    }
    async hydrateSessionOnce(session) {
        let events = [];
        if (this.client.loadSessionDetails !== undefined) {
            try {
                const details = await this.client.loadSessionDetails(session.sessionId, this.backend);
                events = details.events;
                if (details.modes !== undefined) {
                    session.modes = details.modes;
                    if (details.modes.currentModeId)
                        session.agentPreset = details.modes.currentModeId;
                }
                if (details.availableCommands !== undefined) {
                    session.availableCommands = details.availableCommands;
                }
                if (details.permissionPreset !== undefined && isAcpPermissionPreset(details.permissionPreset) && !this.selectedPermissions.has(session.sessionId)) {
                    this.selectedPermissions.set(session.sessionId, details.permissionPreset);
                }
            }
            catch (error) {
                const stale = this.historyCache.getStale(session.sessionId);
                if (stale !== undefined && stale.events.length > 0) {
                    this.restoreCachedSession(session, stale, true);
                    return;
                }
                if (this.backend === 'pi' || this.backend === 'claude' || this.backend === 'opencode' || this.backend === 'hermes')
                    throw error;
            }
        }
        else if (this.client.loadSessionHistory !== undefined) {
            try {
                events = await this.client.loadSessionHistory(session.sessionId, this.backend);
            }
            catch (error) {
                const stale = this.historyCache.getStale(session.sessionId);
                if (stale !== undefined && stale.events.length > 0) {
                    this.restoreCachedSession(session, stale, true);
                    return;
                }
                // A failed history read is not a successful empty baseline; do not continue
                // a restored conversation until its authoritative history is available.
                if (this.backend === 'pi' || this.backend === 'claude' || this.backend === 'opencode' || this.backend === 'hermes')
                    throw error;
                // Preserve legacy AGY history availability behavior.
            }
        }
        if (events.length > 0) {
            session.hydrated = true;
            session.staleHistory = false;
            session.events = events;
            const firstUser = session.events.find(entry => entry.event.type === 'user/message');
            this.titles.applyPrompt(session, extractPromptText(array(record(firstUser?.event.data).content)));
            session.blank = false;
            for (const event of session.events)
                this.cacheImageAttachments(session.sessionId, array(record(event.event.data).content ?? record(record(event.event.data).message).content));
            this.syncSessionCache(session);
        }
    }
    restoreCachedSession(session, cached, staleFallback) {
        session.events = cached.events;
        session.hydrated = !staleFallback && !cached.stale && !cached.truncated;
        session.staleHistory = staleFallback || Boolean(cached.stale) || Boolean(cached.truncated);
        session.blank = cached.blank;
        if (cached.title !== undefined && (!session.titleOverridden || cached.titleOverridden)) {
            session.title = cached.title;
            session.titleOverridden = cached.titleOverridden;
            session.titleFromPrompt = cached.titleFromPrompt;
        }
        if (cached.selectedModel !== undefined && !this.selectedModels.has(session.sessionId)) {
            this.selectedModels.set(session.sessionId, cached.selectedModel);
        }
        if (cached.permissionPreset !== undefined && !this.selectedPermissions.has(session.sessionId)) {
            this.selectedPermissions.set(session.sessionId, cached.permissionPreset);
        }
        for (const event of session.events) {
            this.cacheImageAttachments(session.sessionId, array(record(event.event.data).content ?? record(record(event.event.data).message).content));
        }
    }
    syncSessionCache(session) {
        const existing = this.historyCache.getStale(session.sessionId);
        const isStale = Boolean(session.running || session.staleHistory);
        const hostUpdatedAt = session.staleHistory && existing !== undefined
            ? existing.hostUpdatedAt
            : session.updatedAt;
        const selectedModel = this.selectedModels.get(session.sessionId);
        const permissionPreset = this.selectedPermissions.get(session.sessionId);
        this.historyCache.set(session.sessionId, {
            events: session.events,
            blank: session.blank && session.events.length === 0,
            hydrated: Boolean((session.hydrated || session.events.length > 0) && !session.staleHistory),
            stale: isStale,
            ...(session.title === undefined ? {} : { title: session.title }),
            ...(session.titleOverridden === undefined ? {} : { titleOverridden: session.titleOverridden }),
            ...(session.titleFromPrompt === undefined ? {} : { titleFromPrompt: session.titleFromPrompt }),
            hostUpdatedAt,
            ...(selectedModel === undefined ? {} : { selectedModel }),
            ...(permissionPreset === undefined ? {} : { permissionPreset }),
        });
    }
    async sessionHistory(request) {
        const requestedId = extractSessionId(request);
        const session = this.lookupSession(requestedId);
        if (session === undefined)
            return failure('session-not-found', 'The Session was not found.');
        const sessionId = session.sessionId;
        await this.hydrateSession(session);
        const beforeSeq = optionalInteger(request.beforeSeq);
        if (beforeSeq === undefined) {
            this.rememberOpenedSession(sessionId);
        }
        const projections = {
            asOfSeq: session.projectionSeq ?? -1,
            values: {
                title: session.title ?? acpBackendLabel(this.backend),
                sessionListMetadata: { blank: session.blank && session.events.length === 0, lastPromptAt: null },
                modelSelection: this.modelSelectionProjection(sessionId),
                permissions: this.permissionsProjection(sessionId),
                imageLimits: acpImageLimits(this.backend),
                ...(session.agentPreset !== undefined ? { agentPreset: session.agentPreset } : {}),
                ...(session.todos !== undefined ? { todos: session.todos } : {}),
                ...(session.contextUsage !== undefined ? { contextPressure: contextPressureProjection(session.contextUsage) } : {}),
            },
        };
        let page;
        try {
            page = this.historyPage(session, {
                beforeSeq,
                throughSeq: optionalInteger(request.throughSeq),
                limit: optionalPositiveInteger(request.maxMessages) ?? optionalPositiveInteger(request.limit),
                turnWindow: normalizeVirtualHistoryTurnWindow(request.turnWindow),
                extraEnvelopeBytes: utf8JsonByteLength({ events: [], projections }) + 16,
                measureRecordBytes: entry => utf8JsonByteLength(entry) + utf8JsonByteLength({ event: entry.event }) + 1,
            });
        }
        catch (error) {
            if (error instanceof VirtualHistoryResponseTooLargeError) {
                return failure('response-too-large', error.message, { actualBytes: error.actualBytes, maxBytes: error.maxBytes });
            }
            throw error;
        }
        return success({
            ...page,
            events: page.records.map(entry => ({ event: entry.event })),
            projections,
        });
    }
    async sessionProjections(request) {
        const requestedId = extractSessionId(request);
        const session = this.lookupSession(requestedId);
        if (session === undefined)
            return success(null);
        await this.hydrateSession(session);
        return success(this.sessionSummary(session, session.projectionSeq ?? -1).projections);
    }
    async sessionPage(request) {
        const requestedId = extractSessionId(request);
        const session = this.lookupSession(requestedId);
        if (session === undefined)
            return failure('session-not-found', 'The Session was not found.');
        await this.hydrateSession(session);
        try {
            const page = this.historyPage(session, {
                beforeSeq: optionalInteger(request.beforeSeq),
                throughSeq: optionalInteger(request.throughSeq),
                limit: optionalPositiveInteger(request.limit) ?? optionalPositiveInteger(request.maxMessages),
                turnWindow: normalizeVirtualHistoryTurnWindow(request.turnWindow),
            });
            return success({ records: page.records, hasMore: page.hasMore, cursor: page.cursor });
        }
        catch (error) {
            if (error instanceof VirtualHistoryResponseTooLargeError) {
                return failure('response-too-large', error.message, { actualBytes: error.actualBytes, maxBytes: error.maxBytes });
            }
            throw error;
        }
    }
    historyPage(session, options = {}) {
        const lastSessionSeq = session.events.at(-1)?.event.seq ?? -1;
        const throughSeq = Math.min(options.throughSeq ?? lastSessionSeq, lastSessionSeq);
        const endSeq = Math.min(throughSeq, options.beforeSeq === undefined ? throughSeq : options.beforeSeq - 1);
        const window = endSeq < 0 ? [] : session.events.filter(entry => entry.event.seq <= endSeq);
        let maxTurn = 0;
        for (const entry of session.events) {
            if (isRecord(entry.event.data) && typeof entry.event.data.turn === 'number' && entry.event.data.turn > maxTurn) {
                maxTurn = entry.event.data.turn;
            }
        }
        const header = {
            version: 3,
            id: session.sessionId,
            createdAt: session.createdAt,
            cwd: session.cwd,
            isSeeded: false,
        };
        const baseEnvelopeBytes = utf8JsonByteLength({
            header,
            cursor: endSeq,
            nextTurn: maxTurn + 1,
            records: [],
            hasMore: true,
            ...(session.running ? { activeTurnId: 'cursor-live' } : {}),
            assistantStream: { revision: 0 },
        }) + (options.extraEnvelopeBytes ?? 0);
        const slice = selectVirtualHistorySlice(window, {
            maxMessages: options.limit,
            turnWindow: options.turnWindow,
            countSurfaceMessages: false,
            maxBytes: options.maxBytes ?? VIRTUAL_HISTORY_MAX_BYTES,
            hardMaxBytes: options.hardMaxBytes,
            envelopeBytes: baseEnvelopeBytes,
            measureRecordBytes: options.measureRecordBytes,
        });
        const cursor = slice.records.at(-1)?.event.seq ?? -1;
        return {
            header,
            cursor,
            nextTurn: maxTurn + 1,
            records: slice.records,
            hasMore: slice.hasMore,
            ...(session.running ? { activeTurnId: 'cursor-live' } : {}),
            assistantStream: { revision: 0 },
        };
    }
    describeHost() {
        const workspace = this.selectedWorkspaceId === undefined
            ? undefined
            : this.workspaceById.get(this.selectedWorkspaceId);
        const name = this.backendLabel();
        return {
            version: `${name} Remote`,
            cwd: workspace?.path ?? '',
            home: workspace?.path ?? '',
            provider: name,
            model: modelCatalog(this.backend).default.model,
            attachedSessions: this.sessions.size,
            canOpenPath: workspace !== undefined,
        };
    }
    async listDirectory(request, signal) {
        const workspace = this.selectedWorkspaceId === undefined
            ? undefined
            : this.workspaceById.get(this.selectedWorkspaceId);
        if (workspace === undefined)
            return failure('workspace-not-found', `The ${this.backendLabel()} virtual Workspace was not found.`);
        const path = string(request.path) ?? workspace.path;
        return success(await this.client.listDirectory(path, signal));
    }
    registerSession(acpSessionId, cwd, title, createdAt = Date.now(), updatedAt = Date.now(), blank = true) {
        const nativeTitle = this.titles.nativeTitle(title);
        const session = {
            sessionId: `${sessionPrefix(this.backend)}${acpSessionId}`,
            acpSessionId,
            cwd,
            ...(nativeTitle === undefined ? {} : { title: nativeTitle }),
            blank,
            running: false,
            createdAt,
            updatedAt,
            events: [],
        };
        this.sessions.set(session.sessionId, session);
        return session;
    }
    async discoverAndAttachSessions(workspace) {
        const previousTitles = new Map([...this.sessions].map(([id, session]) => [id, session.title]));
        try {
            let discovered = [];
            if (this.client.listSessions !== undefined) {
                try {
                    discovered = await this.client.listSessions(workspace.path, this.backend, 30);
                }
                catch (error) {
                    if (this.backend === 'pi' || this.backend === 'claude' || this.backend === 'hermes')
                        throw error;
                    // Preserve legacy AGY/Cursor catalog availability behavior.
                }
            }
            for (const item of discovered) {
                const sessionId = `${sessionPrefix(this.backend)}${item.conversationId}`;
                if (!this.sessions.has(sessionId)) {
                    this.registerSession(item.conversationId, workspace.path, item.title, item.createdAt, item.updatedAt, false);
                }
                const existing = this.sessions.get(sessionId);
                if (existing !== undefined) {
                    // Refresh activity from the Host without moving a live turn backwards.
                    if (Number.isFinite(item.updatedAt))
                        existing.updatedAt = Math.max(existing.updatedAt, item.updatedAt);
                    if (!previousTitles.has(sessionId) || existing.title === previousTitles.get(sessionId)) {
                        this.titles.applyNative(existing, item.title);
                    }
                }
                if (item.pinned)
                    this.pinnedSessionIds.add(sessionId);
                if (!this.archivedSessionIds.has(sessionId) && !workspace.sessionIds.includes(sessionId)) {
                    workspace.sessionIds.push(sessionId);
                }
            }
            workspace.sessionCount = workspace.sessionIds.length;
            this.sortWorkspaceSessions(workspace);
            workspace.updatedAt = new Date().toISOString();
        }
        catch (error) {
            if (this.backend === 'pi' || this.backend === 'claude' || this.backend === 'hermes')
                throw error;
            // Preserve legacy AGY/Cursor catalog availability behavior.
        }
    }
    attachSessionToWorkspace(cwd, sessionId) {
        const workspace = [...this.workspaceById.values()].find(item => item.path === cwd)
            ?? createAcpWorkspaceView(cwd, this.backend);
        const sessionIds = [sessionId, ...workspace.sessionIds.filter(id => id !== sessionId)];
        const next = {
            ...workspace,
            sessionIds,
            sessionCount: sessionIds.length,
            updatedAt: new Date().toISOString(),
        };
        this.rememberWorkspace(next);
        if (this.selectedWorkspaceId === undefined)
            this.selectedWorkspaceId = next.workspaceId;
    }
    async ensureInitialSession(workspace) {
        const cwd = workspace.path;
        const created = await this.client.createSession(cwd, 'agent', this.backend);
        const sessionId = created.sessionId;
        const title = this.backend === 'antigravity' ? 'Antigravity' : this.backend === 'opencode' ? 'OpenCode' : workspace.title;
        const session = this.registerSession(sessionId, cwd, title);
        this.attachSessionToWorkspace(cwd, session.sessionId);
        const summarySeq = this.nextProjectionSeq(session.sessionId);
        this.events.emitRemoteEvent('api-session/added', [this.sessionSummary(session, summarySeq)]);
        this.events.publishProjection(session.sessionId, 'title', session.title ?? this.backendLabel(), this.nextProjectionSeq(session.sessionId));
        this.events.publishProjection(session.sessionId, 'modelSelection', this.modelSelectionProjection(session.sessionId), this.nextProjectionSeq(session.sessionId));
        this.publishWorkspaceBaseline();
        return session;
    }
    async handleSessionList() {
        for (const workspace of this.workspaceById.values()) {
            await this.discoverAndAttachSessions(workspace);
            if (workspace.sessionIds.length === 0) {
                await this.ensureInitialSession(workspace);
            }
        }
        return this.sessionSummaries();
    }
    sessionSummaries() {
        const selected = this.selectedWorkspaceId === undefined
            ? undefined
            : this.workspaceById.get(this.selectedWorkspaceId);
        const allowed = new Set(selected?.sessionIds ?? [...this.sessions.keys()]);
        return [...this.sessions.values()]
            .filter(session => allowed.has(session.sessionId) && !this.archivedSessionIds.has(session.sessionId))
            .sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId))
            .map(session => this.sessionSummary(session, session.projectionSeq ?? -1));
    }
    sortWorkspaceSessions(workspace) {
        workspace.sessionIds.sort((a, b) => (this.sessions.get(b)?.updatedAt ?? 0) - (this.sessions.get(a)?.updatedAt ?? 0) || a.localeCompare(b));
    }
    sessionSummary(session, asOfSeq) {
        return {
            sessionId: session.sessionId,
            agentAvailable: true,
            running: session.running,
            blank: session.blank,
            cwd: session.cwd,
            updatedAt: session.updatedAt,
            projections: {
                kind: 'sequenced',
                asOfSeq,
                values: {
                    title: session.title ?? acpBackendLabel(this.backend),
                    sessionListMetadata: { blank: session.blank, lastPromptAt: null },
                    modelSelection: this.modelSelectionProjection(session.sessionId),
                    permissions: this.permissionsProjection(session.sessionId),
                    imageLimits: acpImageLimits(this.backend),
                    ...(session.agentPreset !== undefined ? { agentPreset: session.agentPreset } : {}),
                    ...(session.todos !== undefined ? { todos: session.todos } : {}),
                    ...(session.contextUsage !== undefined ? { contextPressure: contextPressureProjection(session.contextUsage) } : {}),
                },
            },
        };
    }
    resolveSessionId(rawId) {
        if (this.sessions.has(rawId)) {
            return rawId;
        }
        const prefixed = `${sessionPrefix(this.backend)}${rawId}`;
        if (this.sessions.has(prefixed)) {
            return prefixed;
        }
        throw Object.assign(new Error('The Session was not found.'), { code: 'session-not-found' });
    }
    modelSelection(sessionId) {
        const resolved = this.resolveSessionId(sessionId);
        return this.selectedModels.get(resolved) ?? this.selectedModels.get(sessionId) ?? modelCatalog(this.backend).default;
    }
    modelSelectionProjection(sessionId) {
        const selection = this.modelSelection(sessionId);
        return { lastUsed: selection, next: selection };
    }
    permissionSelection(sessionId) {
        const resolved = this.resolveSessionId(sessionId);
        return this.selectedPermissions.get(resolved) ?? this.selectedPermissions.get(sessionId);
    }
    permissionsProjection(sessionId) {
        return acpPermissionsProjection(this.permissionSelection(sessionId));
    }
    setPermissionSelection(sessionId, preset) {
        const resolved = this.resolveSessionId(sessionId);
        if (preset === undefined) {
            this.selectedPermissions.delete(resolved);
            this.selectedPermissions.delete(sessionId);
        }
        else {
            this.selectedPermissions.set(resolved, preset);
            this.selectedPermissions.set(sessionId, preset);
        }
        const seq = this.nextProjectionSeq(resolved);
        this.events.publishProjection(resolved, 'permissions', this.permissionsProjection(resolved), seq);
        if (resolved !== sessionId) {
            this.events.publishProjection(sessionId, 'permissions', this.permissionsProjection(resolved), seq);
        }
        const session = this.sessions.get(resolved);
        if (session !== undefined)
            this.syncSessionCache(session);
        if (this.client.selectPermission) {
            void this.client.selectPermission(nativeAcpId(resolved, this.backend), this.backend, preset ?? 'workspace-write').catch(() => undefined);
        }
    }
    async commandList(args) {
        const rawId = extractSessionId(args);
        const sessionId = rawId ? this.resolveSessionId(rawId) : undefined;
        const session = sessionId ? this.sessions.get(sessionId) : undefined;
        const base = [
            {
                name: 'permission',
                description: `Switch the ${this.backendLabel()} Remote sandbox mode and approval policy`,
                input: { hint: '<preset>' },
            },
        ];
        let remote = session?.availableCommands ?? [];
        if (remote.length === 0 && sessionId !== undefined && this.client.sessionCommands !== undefined) {
            try {
                remote = await this.client.sessionCommands(nativeAcpId(sessionId, this.backend), this.backend);
                if (session !== undefined && remote.length > 0)
                    session.availableCommands = remote;
            }
            catch { /* Graceful fallback to local commands if upstream does not expose session commands. */ }
        }
        const merged = [...base];
        for (const cmd of remote) {
            if (merged.some(item => item.name === cmd.name))
                continue;
            const hint = typeof cmd.input?.hint === 'string' ? cmd.input.hint : undefined;
            merged.push({
                name: cmd.name,
                description: cmd.description ?? `Run /${cmd.name} on ${this.backendLabel()}`,
                ...(hint !== undefined ? { input: { hint } } : {}),
            });
        }
        if ((this.client.sessionCommands !== undefined || remote.length > 0) && !merged.some(item => item.name === 'compact')) {
            merged.push({
                name: 'compact',
                description: `Compact conversation history in ${this.backendLabel()}`,
            });
        }
        return merged;
    }
    async executeCommand(args, signal) {
        const rawId = requiredString(args.agentId ?? args.sessionId, 'agentId');
        const sessionId = this.resolveSessionId(rawId);
        const session = this.sessions.get(sessionId);
        const line = requiredString(args.line, 'command line').trim();
        const permissionMatch = /^\/permission(?:\s+([\s\S]*))?$/u.exec(line);
        if (permissionMatch !== null) {
            const commandId = `acp-permission:${++this.commandSeq}`;
            const requested = (permissionMatch[1] ?? '').trim();
            if (requested === '') {
                return {
                    commandId,
                    result: { kind: 'success', text: `current preset ${this.permissionSelection(sessionId) ?? 'Host settings (not reported)'}` },
                };
            }
            if (!isAcpPermissionPreset(requested)) {
                return {
                    commandId,
                    result: { kind: 'error', text: `unknown preset "${requested}" (available: workspace-write, danger-full-access)` },
                };
            }
            this.setPermissionSelection(sessionId, requested);
            return { commandId, result: { kind: 'success', text: `preset ${requested}` } };
        }
        const slashMatch = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/u.exec(line);
        if (slashMatch === null || session === undefined)
            return undefined;
        const commandName = slashMatch[1].toLowerCase();
        const upstreamNames = new Set((session.availableCommands ?? []).map(cmd => cmd.name.toLowerCase()));
        if (commandName !== 'compact' && !upstreamNames.has(commandName)) {
            return undefined;
        }
        const commandId = `acp-command:${++this.commandSeq}`;
        await this.prompt({ sessionId, content: [{ type: 'text', text: line }] }, signal ?? new AbortController().signal);
        return { commandId, result: { kind: 'success', text: `Ran ${line}` } };
    }
    async hostSessionModels(sessionId) {
        const resolvedId = this.resolveSessionId(sessionId);
        if (!this.client.sessionModels) {
            const catalog = modelCatalog(this.backend);
            return {
                current: this.modelSelection(resolvedId),
                routable: false,
                groups: catalog.groups,
                failures: [],
            };
        }
        const models = await this.client.sessionModels(nativeAcpId(resolvedId, this.backend), this.backend);
        this.selectedModels.set(resolvedId, models.current);
        return models;
    }
    async selectModel(request) {
        const rawSessionId = extractSessionId(request);
        const sessionId = this.resolveSessionId(rawSessionId);
        const provider = requiredString(request.provider, 'provider');
        const model = requiredString(request.model, 'model');
        const reasoningEffort = string(request.reasoningEffort);
        const catalog = await this.hostSessionModels(sessionId);
        const group = catalog.groups.find(g => g.id === provider || g.id.toLowerCase() === provider.toLowerCase());
        let targetModel = group?.models.find(item => item.id === model);
        if (targetModel === undefined) {
            const aliases = group?.models.filter(item => item.id.endsWith(`/${model}`) || model.endsWith(`/${item.id}`));
            if (aliases?.length === 1)
                targetModel = aliases[0];
        }
        if (group === undefined || targetModel === undefined) {
            return failure('model-unavailable', `The selected ${this.backend} model is unavailable on this Host.`);
        }
        const supportedEfforts = targetModel.reasoning?.efforts.map(effort => effort.id) ?? [];
        if (reasoningEffort !== undefined && !supportedEfforts.includes(reasoningEffort)) {
            return failure('model-unavailable', `The selected reasoning effort is unavailable for this ${this.backend} model.`);
        }
        const selected = {
            provider: group.id,
            model: targetModel.id,
            ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
        };
        if (!this.client.selectModel)
            return failure('model-unavailable', 'The Host does not support ACP model selection.');
        const confirmed = await this.client.selectModel(nativeAcpId(sessionId, this.backend), this.backend, selected);
        this.selectedModels.set(sessionId, confirmed);
        if (rawSessionId && rawSessionId !== sessionId)
            this.selectedModels.set(rawSessionId, confirmed);
        const session = this.sessions.get(sessionId);
        if (session !== undefined)
            this.syncSessionCache(session);
        const seq = this.nextProjectionSeq(sessionId);
        this.events.publishProjection(sessionId, 'modelSelection', this.modelSelectionProjection(sessionId), seq);
        if (rawSessionId && rawSessionId !== sessionId) {
            this.events.publishProjection(rawSessionId, 'modelSelection', this.modelSelectionProjection(sessionId), seq);
        }
        return success({ selected: this.modelSelection(sessionId) });
    }
    publishWorkspaceBaseline() {
        for (const queue of this.workspaceStreams) {
            for (const workspace of this.visibleWorkspaces()) {
                queue.push({ type: 'upsert', workspace: nativeWorkspace(workspace) });
            }
            queue.push({ type: 'archived', archivedSessionIds: [...this.archivedSessionIds] });
            queue.push({ type: 'pinned', pinnedSessionIds: [...this.pinnedSessionIds] });
        }
    }
    publishProjection(sessionId, key, value, seq = this.nextProjectionSeq(sessionId)) {
        this.events.publishProjection(sessionId, key, value, seq);
    }
    nextProjectionSeq(sessionId) {
        this.lastProjectionSeq += 1;
        if (sessionId !== undefined) {
            const session = this.lookupSession(sessionId);
            if (session !== undefined)
                session.projectionSeq = this.lastProjectionSeq;
        }
        return this.lastProjectionSeq;
    }
}
const ALLOWED_HOST_CARRIER_DISPATCH_PREFIXES = [
    'settings/',
    'pluginManager/',
    'pluginMarket/',
    'pluginRecommendations/',
    'pluginRegistryProbe/',
    'credentials/',
    'llm/',
    'speech/',
    'account/',
];
const ALLOWED_HOST_CARRIER_DISPATCH_EXACT = new Set([
    'pluginInventory/list',
    'permissionPresets/catalog',
]);
function isAllowedHostCarrierDispatch(endpoint) {
    return ALLOWED_HOST_CARRIER_DISPATCH_EXACT.has(endpoint)
        || ALLOWED_HOST_CARRIER_DISPATCH_PREFIXES.some(prefix => endpoint.startsWith(prefix));
}
function isAllowedHostCarrierOpen(endpoint) {
    return endpoint === 'remoteAccess/follow'
        || endpoint.startsWith('account/')
        || endpoint.startsWith('settings/');
}
export { acpCwdWorkspaceId, createAcpWorkspaceView, discoverAcpVirtualWorkspaces, modelCatalog } from './virtual-catalog.js';
export { acpPermissionsProjection, isAcpPermissionPreset } from './virtual-contract.js';
//# sourceMappingURL=virtual-harness.js.map
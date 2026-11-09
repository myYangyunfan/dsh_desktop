import { CodexRemoteClient, projectCodexThread } from '@dsh-remote/client-core';
import { codexPermissionPresetFromResponse } from './permissions.js';
import { CODEX_PROVIDER, codexModelParams, containsPath, displayTitle, isCodexDirectoryListing, loadCatalog, loadModelDirectory, modelCatalog, modelSelection, modelSelectionProjection, nativeVisibleWorkspaces, nativeWorkspace, } from './virtual-catalog.js';
import { business, carrierArgs, CODEX_DEFAULT_PERMISSION, CODEX_IMAGE_ATTACHMENT_PREFIX, codexImageLimitsProjection, codexPermissionsProjection, codexPromptInput, fail, failFrom, failure, isCodexPermissionPreset, isHostWorkspaceEndpoint, isHostWorkspaceStreamEndpoint, isLegacySessionHistoryUnsupported, ok, requestArg, SESSION_SEARCH_RESULT_LIMIT, SESSION_SEARCH_SNIPPET_CODE_POINTS, sessionIdFromAddress, success, truncateCodePoints, } from './virtual-contract.js';
import { CodexEventCarrier } from './virtual-event-carrier.js';
import { adaptCodexHistoryPage, isCodexNativeHistoryPage, paginateCodexNativeHistory, projectCodexNativeHistory, } from './virtual-history.js';
import { CodexLiveProjection } from './virtual-live.js';
import { array, errorCode, nativeThreadId, optionalInteger, optionalNonNegativeInteger, optionalPositiveInteger, record, requiredString, string, } from './virtual-values.js';
/**
 * A plugin-owned virtual Harness target. It projects CodeX Thread/Turn data at
 * the existing Typert carrier boundary, so every UI layer above the
 * official Workspace and Session controllers remains native DSH.
 */
export class CodexVirtualHarness {
    client;
    host;
    sessionGeneration;
    hostCarrier;
    live;
    events;
    catalog;
    workspaceStreams = new Set();
    controlStreams = new Set();
    eventStreams = new Map();
    follows = new Set();
    pendingRequestIds = new Map();
    pendingApprovals = new Map();
    pendingThreads = new Map();
    blankThreads = new Set();
    selectedModels = new Map();
    selectedPermissions = new Map();
    imageAttachments = new Map();
    modelDirectory;
    modelDirectoryPromise;
    lastProjectionSeq = 0;
    commandSeq = 0;
    selectedWorkspaceId;
    lastOpenedSessionId;
    openedWorkspaceSessions = new Map();
    closed = false;
    constructor(client, host, sessionGeneration = 'legacy', hostCarrier) {
        this.client = client;
        this.host = host;
        this.sessionGeneration = sessionGeneration;
        this.hostCarrier = hostCarrier;
        const owner = this;
        this.live = new CodexLiveProjection({
            readHistoryPage: (...args) => owner.readHistoryPage(...args),
            models: (...args) => owner.models(...args),
            get pendingRequestIds() { return owner.pendingRequestIds; },
            get follows() { return owner.follows; },
            sessionTitle: (...args) => owner.sessionTitle(...args),
            modelSelection: (...args) => owner.modelSelection(...args),
            permissionSelection: (...args) => owner.permissionSelection(...args),
            get sessionGeneration() { return owner.sessionGeneration; },
            get client() { return owner.client; },
            get closed() { return owner.closed; },
            rememberOpenedSession: (...args) => owner.rememberOpenedSession(...args),
            nextProjectionSeq: (...args) => owner.nextProjectionSeq(...args),
            updateThreadName: (...args) => owner.updateThreadName(...args),
            publishProjection: (...args) => owner.events.publishProjection(...args),
            setPermissionSelection: (...args) => owner.setPermissionSelection(...args),
            emitRemoteEvent: (...args) => owner.events.emitRemoteEvent(...args),
            get selectedModels() { return owner.selectedModels; },
            refreshAndPublishWorkspaces: (...args) => owner.refreshAndPublishWorkspaces(...args),
            get pendingApprovals() { return owner.pendingApprovals; },
            emitApproval: (...args) => owner.events.emitApproval(...args),
            get imageAttachments() { return owner.imageAttachments; },
        });
        this.events = new CodexEventCarrier({
            get workspaceStreams() { return owner.workspaceStreams; },
            refreshCatalog: (...args) => owner.refreshCatalog(...args),
            get selectedWorkspaceId() { return owner.selectedWorkspaceId; },
            get controlStreams() { return owner.controlStreams; },
            get host() { return owner.host; },
            get eventStreams() { return owner.eventStreams; },
            currentCatalog: (...args) => owner.currentCatalog(...args),
            get pendingApprovals() { return owner.pendingApprovals; },
            get client() { return owner.client; },
        });
    }
    static remote(core, host, sessionGeneration = 'legacy', hostCarrier) {
        return new CodexVirtualHarness(new CodexRemoteClient(core), host, sessionGeneration, hostCarrier);
    }
    async workspaces(signal) {
        return (await this.refreshCatalog(signal)).workspaces;
    }
    async selectWorkspace(workspaceId, signal) {
        const catalog = await loadCatalog(this.client, signal);
        const workspace = catalog.workspaces.find(item => item.workspaceId === workspaceId);
        if (workspace === undefined)
            throw new Error('The selected CodeX workspace is no longer available.');
        this.selectedWorkspaceId = workspace.workspaceId;
        this.catalog = catalog;
        return workspace;
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
        // Native navigation can open another visible Workspace without replacing
        // this carrier. Remember the actual catalog membership, not its entry URL.
        for (const workspace of this.catalog?.workspaces ?? []) {
            if (!workspace.sessionIds.includes(sessionId))
                continue;
            this.openedWorkspaceSessions.delete(workspace.workspaceId);
            this.openedWorkspaceSessions.set(workspace.workspaceId, sessionId);
            if (this.openedWorkspaceSessions.size > 64) {
                this.openedWorkspaceSessions.delete(this.openedWorkspaceSessions.keys().next().value);
            }
        }
    }
    async preferredSessionId(signal, preferredSessionId = this.openedWorkspaceSessions.get(this.selectedWorkspaceId ?? '')) {
        signal?.throwIfAborted();
        const catalog = this.catalog;
        const selected = catalog?.workspaces.find(workspace => workspace.workspaceId === this.selectedWorkspaceId);
        const selectedSessionIds = new Set(selected?.sessionIds ?? []);
        const sessions = (catalog?.sessions ?? []).filter(session => selectedSessionIds.has(session.id));
        if (sessions.some(session => session.id === preferredSessionId))
            return preferredSessionId;
        // The Host catalog already validated these IDs. Restore the latest Thread
        // regardless of title or busy status; transient history-read failures must
        // not redirect navigation to an older Thread or a new blank Session.
        // Do not probe Threads here: one busy read can stall workspace recovery.
        return sessions.reduce((latest, session) => latest === undefined || session.updatedAt > latest.updatedAt ? session : latest, undefined)?.id;
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
            if (isHostWorkspaceEndpoint(endpoint)) {
                if (this.hostCarrier === undefined)
                    return fail('method-not-found', `CodeX virtual Harness does not implement ${endpoint}.`);
                return await this.hostCarrier.dispatch(endpoint, payload, signal);
            }
            const args = carrierArgs(payload);
            switch (endpoint) {
                case '$events/result': return business(await this.events.answerRemoteEvent(args, signal));
                case 'workspace/list': {
                    const catalog = await this.refreshCatalog(signal);
                    return business(success({
                        items: nativeVisibleWorkspaces(catalog, this.selectedWorkspaceId).map(nativeWorkspace),
                        archivedSessionIds: catalog.sessions.filter(item => item.archived).map(item => item.id),
                        pinnedSessionIds: [],
                    }));
                }
                case 'workspace/create': return business(await this.createWorkspace(requestArg(args), signal));
                case 'workspace/rename': return business(await this.renameWorkspace(requestArg(args)));
                case 'workspace/delete': return business(failure('workspace-read-only', 'CodeX virtual Workspaces cannot be deleted.'));
                case 'workspace/insertBefore': return business({
                    workspaceIds: nativeVisibleWorkspaces(await this.currentCatalog(signal), this.selectedWorkspaceId).map(item => item.workspaceId),
                });
                case 'workspace/insertSessionBefore': return business(await this.workspaceForSession(requestArg(args), signal));
                case 'workspace/archiveSession': return business(await this.archiveSession(requestArg(args), signal));
                case 'session/list': return business(success({ items: await this.sessionSummaries(signal) }));
                case 'session/projections': return business(await this.sessionProjections(requestArg(args), signal));
                case 'session/search': return business(await this.searchSessions(requestArg(args), signal));
                case 'session/create': return business(await this.createSession(requestArg(args), signal));
                case 'session/fork': return business(await this.forkSession(requestArg(args), signal));
                case 'session/history': return business(await this.sessionHistory(requestArg(args), signal));
                case 'session/page': return business(await this.sessionPage(requestArg(args), signal));
                case 'session/prompt': return business(await this.prompt(requestArg(args), signal));
                case 'session/cancel': return business(await this.cancel(requestArg(args), signal));
                case 'session/rename': return business(await this.renameSession(requestArg(args), signal));
                case 'session/updateQueue': return business(failure('queue-item-not-found', 'CodeX does not expose a DSH inbox queue.'));
                case 'session/attachment': return business(await this.attachment(requestArg(args), signal));
                case 'session/modelCatalog': return business(success(modelCatalog(await this.models(signal))));
                case 'session/models': {
                    const sessionId = requiredString(requestArg(args).sessionId, 'sessionId');
                    nativeThreadId(sessionId);
                    const directory = await this.models(signal);
                    return business(success({
                        current: this.modelSelection(sessionId, directory),
                        routable: true,
                        groups: directory.groups,
                        failures: [],
                    }));
                }
                case 'session/selectModel': return business(await this.selectModel(requestArg(args), signal));
                case 'session/canOpenWorkspacePath': return business(this.selectedWorkspaceId !== undefined);
                case 'session/openWorkspacePath': return business(failure('bad-request', 'Opening Host paths is unavailable in CodeX mode.'));
                case 'host/describe': return business(success(await this.describeHost(signal)));
                case 'host/listDirectory': return business(await this.listDirectory(requestArg(args), signal));
                case 'directoryPicker/list': return business(await this.listDirectory(requestArg(args), signal));
                case 'skills/list': return business(success({ items: [] }));
                case 'commands/list': return ok(this.commandList(args));
                case 'commands/execute': return ok(await this.executeCommand(args, signal));
                default: return this.hostCarrier === undefined
                    ? fail('method-not-found', `CodeX virtual Harness does not implement ${endpoint}.`)
                    : await this.hostCarrier.dispatch(endpoint, payload, signal);
            }
        }
        catch (error) {
            return failFrom(error);
        }
    }
    async open(endpoint, payload, signal) {
        if (isHostWorkspaceStreamEndpoint(endpoint)) {
            if (this.hostCarrier === undefined) {
                throw Object.assign(new Error(`CodeX virtual Harness does not implement stream ${endpoint}.`), {
                    isDSHRemoteError: true,
                    code: 'method-not-found',
                    details: {},
                });
            }
            return this.hostCarrier.open(endpoint, payload, signal);
        }
        const args = carrierArgs(payload);
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
        if (this.hostCarrier !== undefined)
            return this.hostCarrier.open(endpoint, payload, signal);
        throw Object.assign(new Error(`CodeX virtual Harness does not implement stream ${endpoint}.`), {
            isDSHRemoteError: true,
            code: 'method-not-found',
            details: {},
        });
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
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
            follow.queue.close();
            await follow.close?.().catch(() => undefined);
        }
        this.pendingApprovals.clear();
        this.pendingRequestIds.clear();
        this.pendingThreads.clear();
        this.blankThreads.clear();
        this.selectedModels.clear();
        this.selectedPermissions.clear();
        this.imageAttachments.clear();
    }
    async refreshCatalog(signal) {
        const catalog = await loadCatalog(this.client, signal, this.pendingThreads);
        if (this.selectedWorkspaceId !== undefined
            && !catalog.workspaces.some(workspace => workspace.workspaceId === this.selectedWorkspaceId)) {
            this.selectedWorkspaceId = undefined;
        }
        this.catalog = catalog;
        return catalog;
    }
    async currentCatalog(signal) {
        return this.catalog ?? this.refreshCatalog(signal);
    }
    models(signal) {
        if (this.modelDirectory !== undefined)
            return Promise.resolve(this.modelDirectory);
        this.modelDirectoryPromise ??= loadModelDirectory(this.client, signal)
            .then(directory => {
            this.modelDirectory = directory;
            return directory;
        })
            .finally(() => { this.modelDirectoryPromise = undefined; });
        return this.modelDirectoryPromise;
    }
    modelSelection(sessionId, directory) {
        return this.selectedModels.get(sessionId) ?? directory?.default ?? modelSelection();
    }
    permissionSelection(sessionId) {
        return this.selectedPermissions.get(sessionId);
    }
    setPermissionSelection(sessionId, preset) {
        if (preset === undefined)
            this.selectedPermissions.delete(sessionId);
        else
            this.selectedPermissions.set(sessionId, preset);
        this.events.publishProjection(sessionId, 'permissions', codexPermissionsProjection(preset), this.nextProjectionSeq());
    }
    commandList(args) {
        nativeThreadId(requiredString(args.agentId, 'agentId'));
        return [{
                name: 'permission',
                description: 'Switch the CodeX Remote sandbox mode and approval policy',
                input: { hint: '<preset>' },
            }];
    }
    async executeCommand(args, signal) {
        const sessionId = requiredString(args.agentId, 'agentId');
        const threadId = nativeThreadId(sessionId);
        const line = requiredString(args.line, 'command line').trim();
        if (!Array.isArray(args.images))
            throw new Error('The CodeX command image list is required.');
        const match = /^\/permission(?:\s+([\s\S]*))?$/u.exec(line);
        if (match === null)
            return undefined;
        const commandId = `codex-permission:${++this.commandSeq}`;
        if (args.images.length > 0)
            return {
                commandId,
                result: { kind: 'error', text: 'CodeX Remote permission commands do not accept attachments.' },
            };
        const requested = (match[1] ?? '').trim();
        if (requested === '') {
            await this.readHistoryPage(threadId, { maxMessages: 1 }, signal);
            return {
                commandId,
                result: { kind: 'success', text: `current preset ${this.permissionSelection(sessionId) ?? 'Host settings (not reported)'}` },
            };
        }
        if (!isCodexPermissionPreset(requested))
            return {
                commandId,
                result: { kind: 'error', text: `unknown preset "${requested}" (available: workspace-write, danger-full-access)` },
            };
        const result = await this.client.request('thread/resume', { threadId, permissionPreset: requested }, signal);
        const effective = codexPermissionPresetFromResponse(result);
        if (effective === undefined)
            throw new Error('The Host did not confirm the CodeX permission preset.');
        this.setPermissionSelection(sessionId, effective);
        if (effective !== requested)
            throw new Error('The Host did not apply the requested CodeX permission preset.');
        return { commandId, result: { kind: 'success', text: `preset ${effective}` } };
    }
    sessionTitle(sessionId) {
        const session = this.catalog?.sessions.find(item => item.id === sessionId);
        return session === undefined ? null : displayTitle(session);
    }
    async selectModel(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        nativeThreadId(sessionId);
        const provider = requiredString(request.provider, 'provider');
        const model = requiredString(request.model, 'model');
        const reasoningEffort = string(request.reasoningEffort);
        const directory = await this.models(signal);
        const available = directory.models.get(model);
        if (provider !== CODEX_PROVIDER || available === undefined) {
            return failure('model-unavailable', 'The selected CodeX model is unavailable on this Host.');
        }
        const supportedEfforts = available.reasoning?.efforts.map(effort => effort.id) ?? [];
        if (reasoningEffort !== undefined && !supportedEfforts.includes(reasoningEffort)) {
            return failure('model-unavailable', 'The selected reasoning effort is unavailable for this CodeX model.');
        }
        const selected = {
            provider,
            model,
            ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
        };
        this.selectedModels.set(sessionId, selected);
        const seq = Date.now();
        this.events.publishProjection(sessionId, 'modelSelection', modelSelectionProjection(selected), seq);
        return success({ selected });
    }
    nextProjectionSeq() {
        const seq = Math.max(Date.now(), this.lastProjectionSeq + 1);
        this.lastProjectionSeq = seq;
        return seq;
    }
    updateThreadName(threadId, name) {
        const pending = this.pendingThreads.get(threadId);
        if (pending !== undefined)
            this.pendingThreads.set(threadId, { ...pending, name });
        if (this.catalog === undefined)
            return;
        const threads = this.catalog.threads.map(thread => string(thread.id) === threadId ? { ...thread, name } : thread);
        const sessions = this.catalog.sessions.map(session => {
            if (session.nativeId !== threadId)
                return session;
            const { title: _title, ...rest } = session;
            return name.trim() === '' ? rest : { ...rest, title: name };
        });
        this.catalog = { ...this.catalog, threads, sessions };
    }
    async sessionSummaries(signal) {
        const catalog = await this.refreshCatalog(signal);
        const directory = await this.models(signal).catch(() => undefined);
        return catalog.sessions.map(session => {
            const blank = this.blankThreads.has(session.nativeId)
                || this.pendingThreads.has(session.nativeId);
            return this.sessionSummary(session, {
                blank,
                modelSelection: this.modelSelection(session.id, directory),
                lastPromptAt: session.updatedAt || null,
            });
        });
    }
    sessionSummary(session, options) {
        return {
            sessionId: session.id,
            updatedAt: session.updatedAt,
            running: session.status === 'running' || session.status === 'waiting',
            blank: options.blank,
            ...(session.cwd === undefined ? {} : { cwd: session.cwd }),
            projections: {
                kind: 'sequenced',
                asOfSeq: options.asOfSeq ?? 0,
                values: {
                    title: displayTitle(session),
                    sessionListMetadata: { blank: options.blank, lastPromptAt: options.lastPromptAt },
                    modelSelection: modelSelectionProjection(options.modelSelection),
                    permissions: codexPermissionsProjection(this.permissionSelection(session.id)),
                    imageLimits: codexImageLimitsProjection(),
                },
            },
        };
    }
    async searchSessions(request, signal) {
        const query = requiredString(request.query, 'query').trim();
        if (query.length === 0 || query.length > 500 || query.includes('\0')) {
            return failure('bad-request', 'The CodeX Session search query is invalid.');
        }
        const catalog = await this.currentCatalog(signal);
        const needle = query.toLocaleLowerCase();
        const matches = catalog.threads.flatMap(thread => {
            const session = projectCodexThread(thread);
            if (session === undefined)
                return [];
            const candidates = [session.title, session.preview, session.cwd, session.nativeId]
                .filter((value) => value !== undefined && value.length > 0);
            const snippet = candidates.find(value => value.toLocaleLowerCase().includes(needle));
            if (snippet === undefined)
                return [];
            return [{ sessionId: session.id, snippet: truncateCodePoints(snippet, SESSION_SEARCH_SNIPPET_CODE_POINTS) }];
        });
        return success({
            items: matches.slice(0, SESSION_SEARCH_RESULT_LIMIT),
            hasMore: matches.length > SESSION_SEARCH_RESULT_LIMIT,
        });
    }
    async createWorkspace(request, signal) {
        const path = string(request.path);
        if (path === undefined || path.trim() === '')
            return failure('bad-request', 'A CodeX working directory is required.');
        const catalog = await this.currentCatalog(signal);
        const existing = catalog.workspaces.find(item => item.path === path);
        if (existing !== undefined)
            return success({ workspace: nativeWorkspace(existing), created: false });
        return failure('workspace-not-found', 'The selected directory is not visible to CodeX Remote.');
    }
    async renameWorkspace(request) {
        return failure('workspace-read-only', `CodeX virtual Workspace ${string(request.workspaceId) ?? ''} cannot be renamed.`);
    }
    async workspaceForSession(request, signal) {
        const sessionId = string(request.sessionId);
        const catalog = await this.currentCatalog(signal);
        const workspace = catalog.workspaces.find(item => sessionId !== undefined && item.sessionIds.includes(sessionId));
        return workspace === undefined
            ? failure('workspace-not-found', 'The CodeX virtual Workspace was not found.')
            : success({ workspace: nativeWorkspace(workspace) });
    }
    selectedWorkspace(catalog) {
        return this.selectedWorkspaceId === undefined
            ? undefined
            : catalog.workspaces.find(item => item.workspaceId === this.selectedWorkspaceId);
    }
    async describeHost(signal) {
        const catalog = await this.currentCatalog(signal);
        const workspace = this.selectedWorkspace(catalog);
        const models = await this.models(signal).catch(() => undefined);
        return {
            version: 'CodeX Remote',
            cwd: workspace?.path ?? '',
            home: workspace?.path ?? '',
            provider: 'CodeX',
            ...(models === undefined ? {} : { model: models.default.model }),
            attachedSessions: catalog.sessions.length,
            canOpenPath: workspace !== undefined,
        };
    }
    async listDirectory(request, signal) {
        const catalog = await this.currentCatalog(signal);
        const workspace = this.selectedWorkspace(catalog);
        if (workspace === undefined)
            return failure('workspace-not-found', 'The CodeX virtual Workspace was not found.');
        const path = string(request.path) ?? workspace.path;
        if (!containsPath(workspace.path, path)) {
            return failure('workspace-not-found', 'The selected directory is outside the current CodeX virtual Workspace.');
        }
        const listing = record(await this.client.request('dsh/directoryList', { path }, signal));
        if (!isCodexDirectoryListing(listing)) {
            return failure('internal', 'CodeX Remote returned an invalid directory listing.');
        }
        const listedPaths = [
            listing.path,
            listing.home,
            ...listing.crumbs.map(item => item.path),
            ...listing.entries.map(item => item.path),
        ];
        if (listedPaths.some(path => !containsPath(workspace.path, path))) {
            return failure('internal', 'CodeX Remote returned a directory outside the current Workspace.');
        }
        return success(listing);
    }
    async archiveSession(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        await this.client.request('thread/archive', { threadId: nativeThreadId(sessionId) }, signal);
        const catalog = await this.refreshCatalog(signal);
        this.publishWorkspaceBaseline(catalog);
        return success({ archivedSessionIds: [sessionId] });
    }
    async createSession(request, signal) {
        const catalog = await this.currentCatalog(signal);
        const workspaceId = string(request.workspaceId) ?? this.selectedWorkspaceId;
        const workspace = workspaceId === undefined ? undefined : catalog.workspaces.find(item => item.workspaceId === workspaceId);
        const cwd = string(request.cwd)
            ?? workspace?.path;
        if (cwd === undefined)
            return failure('workspace-not-found', 'The CodeX virtual Workspace was not found.');
        if (workspace !== undefined && !containsPath(workspace.path, cwd)) {
            return failure('workspace-not-found', 'The selected directory is outside the current CodeX virtual Workspace.');
        }
        const directory = await this.models(signal);
        const selection = directory.default;
        const requestedPreset = CODEX_DEFAULT_PERMISSION;
        const result = record(await this.client.request('thread/start', {
            cwd,
            model: selection.model,
            permissionPreset: requestedPreset,
        }, signal));
        const permissionPreset = codexPermissionPresetFromResponse(result) ?? requestedPreset;
        const thread = { ...record(result.thread), cwd, turns: array(record(result.thread).turns) };
        const projected = projectCodexThread(thread);
        if (projected === undefined)
            return failure('internal', 'CodeX returned an invalid Thread.');
        this.pendingThreads.set(projected.nativeId, thread);
        this.blankThreads.add(projected.nativeId);
        this.selectedModels.set(projected.id, selection);
        this.selectedPermissions.set(projected.id, permissionPreset);
        await this.refreshAndPublishWorkspaces();
        const seq = this.nextProjectionSeq();
        this.events.emitRemoteEvent('api-session/added', [this.sessionSummary(projected, {
                blank: true,
                modelSelection: selection,
                lastPromptAt: null,
                asOfSeq: seq,
            })]);
        this.events.publishProjection(projected.id, 'title', displayTitle(projected), seq);
        return success({ sessionId: projected.id });
    }
    async forkSession(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        const result = record(await this.client.request('thread/fork', {
            threadId: nativeThreadId(sessionId),
        }, signal));
        const permissionPreset = codexPermissionPresetFromResponse(result);
        const projected = projectCodexThread(record(result.thread));
        if (projected === undefined)
            return failure('internal', 'CodeX returned an invalid forked Thread.');
        this.selectedModels.set(projected.id, this.modelSelection(sessionId, await this.models(signal)));
        this.setPermissionSelection(projected.id, permissionPreset);
        await this.refreshAndPublishWorkspaces();
        const seq = this.nextProjectionSeq();
        this.events.publishProjection(projected.id, 'title', displayTitle(projected), seq);
        return success({ sessionId: projected.id });
    }
    async prompt(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        const content = array(request.content);
        const input = codexPromptInput(content);
        if (input === undefined)
            return failure('attachment-error', 'CodeX virtual Sessions accept text and pasted PNG, JPEG, WebP, or GIF images only.');
        const threadId = nativeThreadId(sessionId);
        const selection = this.modelSelection(sessionId, await this.models(signal));
        const isFreshBlankThread = this.blankThreads.has(threadId) || this.pendingThreads.has(threadId);
        if (!isFreshBlankThread) {
            const resumeResult = await this.client.request('thread/resume', {
                threadId,
                model: selection.model,
            }, signal);
            const serverPreset = codexPermissionPresetFromResponse(resumeResult);
            if (serverPreset !== undefined) {
                this.setPermissionSelection(sessionId, serverPreset);
            }
        }
        this.pendingRequestIds.set(sessionId, string(request.requestId) ?? '');
        const mode = request.mode === 'steer' ? 'turn/steer' : 'turn/start';
        if (mode === 'turn/steer') {
            const active = this.activeTurnId(threadId);
            if (active === undefined)
                return failure('steer-unavailable', 'The CodeX Thread has no active turn to steer.');
            await this.client.request(mode, { threadId, expectedTurnId: active, input }, signal);
        }
        else {
            await this.client.request(mode, {
                threadId,
                input,
                ...codexModelParams(selection),
            }, signal);
        }
        this.blankThreads.delete(threadId);
        return success({ accepted: true });
    }
    async attachment(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        const attachmentId = requiredString(request.attachmentId, 'attachmentId');
        if (!attachmentId.startsWith(CODEX_IMAGE_ATTACHMENT_PREFIX)) {
            return failure('attachment-error', 'The CodeX image is not available in this virtual Session.', { reason: 'not-referenced' });
        }
        nativeThreadId(sessionId);
        const cached = this.imageAttachments.get(attachmentId);
        if (cached?.sessionId === sessionId)
            return success({ attachment: cached.attachment, data: cached.data });
        await this.hydrateImageAttachments(sessionId, signal);
        const hydrated = this.imageAttachments.get(attachmentId);
        return hydrated?.sessionId === sessionId
            ? success({ attachment: hydrated.attachment, data: hydrated.data })
            : failure('attachment-error', 'The CodeX image is not available in this virtual Session.', { reason: 'not-referenced' });
    }
    async hydrateImageAttachments(sessionId, signal) {
        const threadId = nativeThreadId(sessionId);
        const result = record(await this.client.request('thread/read', { threadId, includeTurns: true }, signal));
        const thread = record(result.thread);
        if (string(thread.id) !== threadId)
            throw new Error('CodeX returned an invalid Thread history.');
        this.cacheHistoryImages(projectCodexNativeHistory(thread, sessionId));
    }
    async cancel(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        const threadId = nativeThreadId(sessionId);
        const turnId = this.activeTurnId(threadId);
        if (turnId !== undefined)
            await this.client.request('turn/interrupt', { threadId, turnId }, signal);
        return success({ accepted: true });
    }
    async renameSession(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        const title = requiredString(request.title, 'title');
        await this.client.request('thread/name/set', { threadId: nativeThreadId(sessionId), name: title }, signal);
        const seq = this.nextProjectionSeq();
        this.updateThreadName(nativeThreadId(sessionId), title);
        this.events.publishProjection(sessionId, 'title', title, seq);
        await this.refreshAndPublishWorkspaces();
        return success({ title, seq });
    }
    async sessionProjections(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        const catalog = await this.currentCatalog(signal);
        const session = catalog.sessions.find(item => item.id === sessionId);
        if (session === undefined)
            return success(null);
        const history = await this.readHistoryPage(nativeThreadId(sessionId), { maxMessages: 1 }, signal);
        const directory = await this.models(signal).catch(() => undefined);
        return success(record(this.sessionSummary(session, {
            blank: history.cursor < 0,
            modelSelection: this.modelSelection(sessionId, directory),
            lastPromptAt: session.updatedAt || null,
            asOfSeq: history.cursor,
        })).projections);
    }
    async sessionPage(request, signal) {
        const sessionId = sessionIdFromAddress(record(request.address));
        const page = await this.readHistoryPage(nativeThreadId(sessionId), {
            beforeSeq: optionalNonNegativeInteger(request.beforeSeq),
            throughSeq: optionalInteger(request.throughSeq),
            maxMessages: optionalPositiveInteger(request.maxMessages),
        }, signal);
        return success({ records: page.records, hasMore: page.hasMore });
    }
    activeTurnId(threadId) {
        for (const follow of this.follows)
            if (follow.threadId === threadId && follow.stepOpen)
                return follow.activeTurnId;
        return undefined;
    }
    async readHistoryPage(threadId, page, signal) {
        let value;
        try {
            value = record(await this.client.request('dsh/sessionHistory', {
                threadId,
                ...(page.beforeSeq === undefined ? {} : { beforeSeq: page.beforeSeq }),
                ...(page.throughSeq === undefined ? {} : { throughSeq: page.throughSeq }),
                ...(page.maxMessages === undefined ? {} : { maxMessages: page.maxMessages }),
            }, signal));
        }
        catch (error) {
            if (!isLegacySessionHistoryUnsupported(error))
                throw error;
            let thread;
            try {
                const result = record(await this.client.request('thread/read', { threadId, includeTurns: true }, signal));
                thread = record(result.thread);
            }
            catch (historyError) {
                // A Host old enough to lack paginated history cannot read a Thread that
                // current Codex has not materialized yet. Only a Thread this client just
                // created is known blank, and only an upstream rejection (not a timeout
                // or disconnect) may be projected as its empty baseline.
                const code = historyError instanceof Error ? errorCode(historyError) : undefined;
                if (!this.blankThreads.has(threadId) || code !== 'CODEX_UPSTREAM_ERROR')
                    throw historyError;
                thread = { id: threadId, turns: [] };
            }
            if (string(thread.id) !== threadId)
                throw new Error('CodeX returned an invalid Thread history.');
            value = paginateCodexNativeHistory(projectCodexNativeHistory(thread, `codex:${threadId}`, this.sessionGeneration), {
                beforeSeq: page.beforeSeq,
                throughSeq: page.throughSeq,
                maxMessages: page.maxMessages,
            });
        }
        value = adaptCodexHistoryPage(value, this.sessionGeneration);
        if (!isCodexNativeHistoryPage(value, `codex:${threadId}`)) {
            throw new Error('CodeX Remote returned an invalid paginated History.');
        }
        if (Object.hasOwn(value, 'permissionPreset')) {
            const preset = value.permissionPreset;
            this.setPermissionSelection(`codex:${threadId}`, preset === 'workspace-write' || preset === 'danger-full-access' ? preset : undefined);
        }
        this.cacheHistoryImages(value);
        return value;
    }
    cacheHistoryImages(history) {
        const sessionId = history.header.id;
        const entries = 'entries' in history ? history.entries : history.records;
        for (const entry of entries)
            this.live.cacheImageBlocks(sessionId, entry.event.data);
    }
    async sessionHistory(request, signal) {
        const sessionId = requiredString(request.sessionId, 'sessionId');
        const beforeSeq = optionalNonNegativeInteger(request.beforeSeq);
        const history = await this.readHistoryPage(nativeThreadId(sessionId), {
            beforeSeq,
            maxMessages: optionalPositiveInteger(request.maxMessages),
        }, signal);
        const directory = await this.models(signal).catch(() => undefined);
        if (beforeSeq === undefined) {
            signal.throwIfAborted();
            if (this.closed)
                throw new Error('The CodeX virtual Harness is closed.');
            this.rememberOpenedSession(sessionId);
        }
        return success({
            events: history.records.map(entry => ({
                event: entry.event,
                ...(entry.view === undefined ? {} : { view: entry.view }),
            })),
            hasMore: history.hasMore,
            ...(beforeSeq !== undefined ? {} : {
                projections: {
                    asOfSeq: history.cursor,
                    values: {
                        title: this.sessionTitle(sessionId),
                        sessionListMetadata: { blank: history.cursor < 0, lastPromptAt: null },
                        modelSelection: modelSelectionProjection(this.modelSelection(sessionId, directory)),
                        permissions: codexPermissionsProjection(this.permissionSelection(sessionId)),
                        imageLimits: codexImageLimitsProjection(),
                    },
                },
            }),
        });
    }
    async refreshAndPublishWorkspaces() {
        const catalog = await this.refreshCatalog().catch(() => undefined);
        if (catalog !== undefined)
            this.publishWorkspaceBaseline(catalog);
    }
    publishWorkspaceBaseline(catalog) {
        for (const queue of this.workspaceStreams) {
            for (const workspace of nativeVisibleWorkspaces(catalog, this.selectedWorkspaceId)) {
                queue.push({ type: 'upsert', workspace: nativeWorkspace(workspace) });
            }
            queue.push({ type: 'archived', archivedSessionIds: catalog.sessions.filter(item => item.archived).map(item => item.id) });
        }
    }
}
// Keep existing Host and Client imports stable.
export { codexProjectWorkspaceId, discoverCodexVirtualWorkspaces } from './virtual-catalog.js';
export { paginateCodexNativeHistory, projectCodexNativeHistory } from './virtual-history.js';
//# sourceMappingURL=virtual-harness.js.map
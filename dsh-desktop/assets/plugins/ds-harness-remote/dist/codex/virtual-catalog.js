import { deriveCodexCwdWorkspaces, projectCodexThread } from '@dsh-remote/client-core';
import { array, basename, errorCode, finiteNumber, isoTime, normalizeTime, record, string } from './virtual-values.js';
const CODEX_WORKSPACE_PREFIX = 'codex-workspace:';
export const CODEX_PROVIDER = 'codex';
const CODEX_MODEL = 'codex';
const CODEX_PAGE_LIMIT = 100;
const MAX_CODEX_PAGES = 32;
export function codexProjectWorkspaceId(projectId) {
    return `${CODEX_WORKSPACE_PREFIX}project:${projectId}`;
}
/** Discover the CodeX projects visible through the Host App Server. */
export async function discoverCodexVirtualWorkspaces(client, signal) {
    return (await loadCatalog(client, signal)).workspaces;
}
export async function loadCatalog(client, signal, pendingThreads) {
    let projects = await loadCodexProjects(client, signal);
    const threads = [];
    let cursor;
    for (let page = 0; page < MAX_CODEX_PAGES; page += 1) {
        const result = record(await client.request('thread/list', {
            limit: CODEX_PAGE_LIMIT,
            sortKey: 'updated_at',
            sortDirection: 'desc',
            archived: false,
            ...(cursor === undefined ? {} : { cursor }),
        }, signal));
        for (const value of array(result.data)) {
            const thread = record(value);
            if (string(thread.id) !== undefined)
                threads.push(thread);
        }
        cursor = typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : undefined;
        if (cursor === undefined)
            break;
    }
    if (pendingThreads !== undefined) {
        const listedIds = new Set(threads.map(thread => string(thread.id)).filter((id) => id !== undefined));
        for (const [threadId, thread] of pendingThreads) {
            if (listedIds.has(threadId))
                pendingThreads.delete(threadId);
            else
                threads.unshift(thread);
        }
    }
    if (projects.length === 0) {
        projects = deriveCodexCwdWorkspaces(threads).map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            roots: [{ path: workspace.path }],
            position: workspace.position,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
        }));
    }
    const projected = threads.map(thread => {
        const session = projectCodexThread(thread);
        return session === undefined ? undefined : { thread, session };
    }).filter((value) => value !== undefined);
    const projectWorkspaces = projects.map(projectWorkspace);
    const workspaceByProjectId = new Map(projects.map((project, index) => [project.id, projectWorkspaces[index]]));
    const visibleSessionIds = new Set();
    const visibleThreads = [];
    for (const { thread, session } of projected) {
        const projectWorkspaceForSession = findProjectWorkspace(thread, session, projects, workspaceByProjectId);
        if (projectWorkspaceForSession !== undefined) {
            addSessionToWorkspace(projectWorkspaceForSession, session);
            visibleSessionIds.add(session.id);
            visibleThreads.push(thread);
        }
    }
    const sessions = projected
        .map(value => value.session)
        .filter(session => visibleSessionIds.has(session.id));
    return {
        threads: visibleThreads,
        sessions,
        projects,
        workspaces: projectWorkspaces,
    };
}
async function loadCodexProjects(client, signal) {
    const projects = [];
    let cursor;
    try {
        for (let page = 0; page < MAX_CODEX_PAGES; page += 1) {
            const result = record(await client.request('project/list', {
                limit: CODEX_PAGE_LIMIT,
                ...(cursor === undefined ? {} : { cursor }),
            }, signal));
            for (const value of array(result.data)) {
                const project = projectCodexProject(value, projects.length);
                if (project !== undefined && !projects.some(item => item.id === project.id))
                    projects.push(project);
            }
            cursor = typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : undefined;
            if (cursor === undefined)
                break;
        }
    }
    catch (error) {
        if (isProjectListUnsupported(error))
            return [];
        throw error;
    }
    return projects.sort((left, right) => left.position - right.position || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}
export async function loadModelDirectory(client, signal) {
    const models = new Map();
    let defaultModelId;
    let cursor;
    for (let page = 0; page < MAX_CODEX_PAGES; page += 1) {
        const result = record(await client.request('model/list', {
            limit: CODEX_PAGE_LIMIT,
            includeHidden: false,
            ...(cursor === undefined ? {} : { cursor }),
        }, signal));
        for (const value of array(result.data)) {
            const source = record(value);
            if (source.hidden === true)
                continue;
            const id = string(source.model) ?? string(source.id);
            if (id === undefined || models.has(id))
                continue;
            const efforts = array(source.supportedReasoningEfforts).map(value => {
                const effort = record(value);
                const effortId = string(effort.reasoningEffort);
                if (effortId === undefined)
                    return undefined;
                const description = string(effort.description);
                return {
                    id: effortId,
                    name: reasoningEffortName(effortId),
                    ...(description === undefined ? {} : { description }),
                };
            }).filter((value) => value !== undefined);
            const defaultEffort = string(source.defaultReasoningEffort);
            const description = string(source.description);
            const model = {
                id,
                name: string(source.displayName) ?? id,
                ...(description === undefined ? {} : { description }),
                ...(efforts.length === 0 ? {} : {
                    reasoning: {
                        efforts,
                        ...(defaultEffort === undefined || !efforts.some(effort => effort.id === defaultEffort)
                            ? {}
                            : { defaultEffort }),
                    },
                }),
            };
            models.set(id, model);
            if (source.isDefault === true)
                defaultModelId = id;
        }
        cursor = typeof result.nextCursor === 'string' && result.nextCursor.length > 0 ? result.nextCursor : undefined;
        if (cursor === undefined)
            break;
    }
    const defaultModel = models.get(defaultModelId ?? '') ?? models.values().next().value;
    if (defaultModel === undefined)
        throw new Error('CodeX did not advertise any available models.');
    const defaultEffort = defaultModel.reasoning?.defaultEffort;
    return {
        default: {
            provider: CODEX_PROVIDER,
            model: defaultModel.id,
            ...(defaultEffort === undefined ? {} : { reasoningEffort: defaultEffort }),
        },
        groups: [{ id: CODEX_PROVIDER, name: 'CodeX', models: [...models.values()] }],
        models,
    };
}
export function nativeWorkspace(view) {
    const { sessionCount: _sessionCount, ...workspace } = view;
    return workspace;
}
export function nativeVisibleWorkspaces(catalog, selectedWorkspaceId) {
    return catalog.workspaces.filter(workspace => workspace.sessionIds.length > 0 || workspace.workspaceId === selectedWorkspaceId);
}
function projectWorkspace(project) {
    const root = project.roots[0];
    return {
        workspaceId: codexProjectWorkspaceId(project.id),
        path: root.path,
        title: project.name.trim() || basename(root.path),
        sessionIds: [],
        sessionCount: 0,
        createdAt: isoTime(project.createdAt),
        updatedAt: isoTime(project.updatedAt || project.createdAt),
    };
}
function projectCodexProject(value, fallbackPosition) {
    const source = record(value);
    const id = string(source.id);
    if (id === undefined)
        return undefined;
    const roots = array(source.roots)
        .map(root => string(record(root).path))
        .filter((path) => path !== undefined && path.length > 0)
        .map(path => ({ path }));
    if (roots.length === 0)
        return undefined;
    return {
        id,
        name: string(source.name) ?? basename(roots[0].path),
        roots,
        position: finiteNumber(source.position) ?? fallbackPosition,
        createdAt: normalizeTime(source.createdAt),
        updatedAt: normalizeTime(source.updatedAt),
    };
}
function findProjectWorkspace(thread, session, projects, workspaceByProjectId) {
    const explicitProjectId = string(thread.projectId);
    const explicitWorkspace = explicitProjectId === undefined ? undefined : workspaceByProjectId.get(explicitProjectId);
    if (explicitWorkspace !== undefined)
        return explicitWorkspace;
    if (session.cwd === undefined)
        return undefined;
    const match = projects
        .flatMap(project => project.roots.map(root => ({ project, root })))
        .filter(value => containsPath(value.root.path, session.cwd))
        .sort((left, right) => {
        const length = right.root.path.length - left.root.path.length;
        if (length !== 0)
            return length;
        const position = left.project.position - right.project.position;
        if (position !== 0)
            return position;
        return left.project.id.localeCompare(right.project.id);
    })[0];
    return match === undefined ? undefined : workspaceByProjectId.get(match.project.id);
}
function addSessionToWorkspace(workspace, session) {
    if (!workspace.sessionIds.includes(session.id)) {
        workspace.sessionIds.push(session.id);
        workspace.sessionCount = workspace.sessionIds.length;
    }
    const createdAt = isoTime(session.createdAt);
    const updatedAt = isoTime(session.updatedAt || session.createdAt);
    if (createdAt < workspace.createdAt)
        workspace.createdAt = createdAt;
    if (updatedAt > workspace.updatedAt)
        workspace.updatedAt = updatedAt;
}
export function containsPath(root, candidate) {
    const normalizedRoot = normalizePathForCompare(root);
    const normalizedCandidate = normalizePathForCompare(candidate);
    return normalizedCandidate === normalizedRoot
        || normalizedCandidate.startsWith(`${normalizedRoot}/`)
        || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}
function normalizePathForCompare(path) {
    return path.replace(/[\\/]+$/u, '') || path;
}
export function modelSelection() {
    return { provider: CODEX_PROVIDER, model: CODEX_MODEL };
}
export function modelSelectionProjection(selection) {
    return { lastUsed: selection, next: selection };
}
export function modelCatalog(directory) {
    return {
        default: directory.default,
        routableProviders: [CODEX_PROVIDER],
        groups: directory.groups,
        failures: [],
    };
}
export function codexModelParams(selection) {
    return {
        model: selection.model,
        ...(selection.reasoningEffort === undefined ? {} : { effort: selection.reasoningEffort }),
    };
}
function reasoningEffortName(effort) {
    const names = {
        none: 'None',
        minimal: 'Minimal',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        xhigh: 'Extra High',
        max: 'Max',
        ultra: 'Ultra',
    };
    return names[effort] ?? effort;
}
export function displayTitle(session) {
    const value = session.title ?? session.preview;
    return value === undefined || value.trim() === '' ? null : value.slice(0, 256);
}
export function isCodexDirectoryListing(value) {
    const listing = record(value);
    return typeof listing.path === 'string'
        && typeof listing.home === 'string'
        && Array.isArray(listing.crumbs)
        && listing.crumbs.every(isCodexDirectoryEntry)
        && Array.isArray(listing.entries)
        && listing.entries.every(isCodexDirectoryEntry)
        && typeof listing.truncated === 'boolean';
}
function isCodexDirectoryEntry(value) {
    const entry = record(value);
    return typeof entry.name === 'string'
        && typeof entry.path === 'string'
        && typeof entry.hidden === 'boolean';
}
function isProjectListUnsupported(error) {
    if (!(error instanceof Error))
        return false;
    const code = errorCode(error);
    return code === 'METHOD_NOT_ALLOWED'
        || code === 'METHOD_NOT_FOUND'
        || code === 'CODEX_UPSTREAM_ERROR'
        || error.message.includes('The requested Codex method is not available over Remote.');
}
//# sourceMappingURL=virtual-catalog.js.map
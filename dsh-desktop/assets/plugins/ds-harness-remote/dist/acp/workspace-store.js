import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function emptyBackends() {
    return Object.create(null);
}
function emptyPermissions() {
    return Object.create(null);
}
function createEmptyStore() {
    return {
        version: 1,
        backends: emptyBackends(),
        sessionPermissions: emptyPermissions(),
    };
}
/**
 * Lightweight Host-side persistence for ACP workspace lists, order, renames,
 * delete tombstones, pinned sessions, and session permission presets.
 * Never touches DSH SessionStore or Workspace database.
 */
export class AcpWorkspaceStore {
    filePath;
    data = createEmptyStore();
    loaded = false;
    loadPromise;
    writeChain = Promise.resolve();
    constructor(filePath) {
        this.filePath = filePath;
    }
    static inDirectory(directory) {
        return typeof directory === 'string' && directory.length > 0
            ? new AcpWorkspaceStore(join(directory, 'acp-state.json'))
            : new AcpWorkspaceStore();
    }
    async load() {
        if (this.loaded)
            return;
        this.loadPromise ??= this.loadOnce().finally(() => { this.loadPromise = undefined; });
        return this.loadPromise;
    }
    async loadOnce() {
        if (this.filePath === undefined) {
            this.loaded = true;
            return;
        }
        try {
            const raw = await readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            this.data = normalizeStore(parsed);
        }
        catch {
            this.data = createEmptyStore();
        }
        this.loaded = true;
    }
    getBackend(backend) {
        if (PROTOTYPE_KEYS.has(backend) || !Object.hasOwn(this.data.backends, backend))
            return undefined;
        return this.data.backends[backend];
    }
    ensureBackend(backend) {
        if (PROTOTYPE_KEYS.has(backend)) {
            throw new Error(`Reserved ACP backend key: ${backend}`);
        }
        let entry = Object.hasOwn(this.data.backends, backend) ? this.data.backends[backend] : undefined;
        if (entry === undefined) {
            entry = { workspaces: [], deletedPaths: [], pinnedSessionIds: [] };
            this.data.backends[backend] = entry;
        }
        return entry;
    }
    async persist() {
        if (this.filePath === undefined)
            return;
        const filePath = this.filePath;
        const snapshot = JSON.stringify(this.data, null, 2);
        const next = this.writeChain
            .catch(() => undefined)
            .then(async () => {
            await mkdir(dirname(filePath), { recursive: true });
            const temp = `${filePath}.${process.pid}.tmp`;
            await writeFile(temp, snapshot, 'utf8');
            await rename(temp, filePath);
        });
        this.writeChain = next;
        return next;
    }
    async listWorkspaces(backend) {
        await this.load();
        const entry = this.getBackend(backend);
        return {
            workspaces: (entry?.workspaces ?? []).map(item => ({ ...item })),
            deletedPaths: new Set(entry?.deletedPaths ?? []),
        };
    }
    async upsertWorkspace(backend, path, title) {
        await this.load();
        const entry = this.ensureBackend(backend);
        entry.deletedPaths = entry.deletedPaths.filter(item => item !== path);
        const now = new Date().toISOString();
        const existing = entry.workspaces.find(item => item.path === path);
        if (existing !== undefined) {
            if (title !== undefined && title.trim().length > 0)
                existing.title = title.trim();
            existing.updatedAt = now;
            await this.persist();
            return { ...existing };
        }
        const created = {
            path,
            ...(title !== undefined && title.trim().length > 0 ? { title: title.trim() } : {}),
            updatedAt: now,
        };
        entry.workspaces.push(created);
        await this.persist();
        return { ...created };
    }
    async renameWorkspace(backend, path, title) {
        await this.load();
        const trimmed = title.trim();
        const entry = this.ensureBackend(backend);
        entry.deletedPaths = entry.deletedPaths.filter(item => item !== path);
        const now = new Date().toISOString();
        const existing = entry.workspaces.find(item => item.path === path);
        if (existing !== undefined) {
            existing.title = trimmed;
            existing.updatedAt = now;
            await this.persist();
            return { ...existing };
        }
        const created = { path, title: trimmed, updatedAt: now };
        entry.workspaces.push(created);
        await this.persist();
        return { ...created };
    }
    async deleteWorkspace(backend, path) {
        await this.load();
        const entry = this.ensureBackend(backend);
        entry.workspaces = entry.workspaces.filter(item => item.path !== path);
        if (!entry.deletedPaths.includes(path))
            entry.deletedPaths.push(path);
        await this.persist();
    }
    async reorderWorkspaces(backend, orderedPaths) {
        await this.load();
        const entry = this.ensureBackend(backend);
        const byPath = new Map(entry.workspaces.map(item => [item.path, item]));
        const next = [];
        const seen = new Set();
        for (const path of orderedPaths) {
            if (seen.has(path))
                continue;
            seen.add(path);
            const existing = byPath.get(path);
            if (existing !== undefined)
                next.push(existing);
            else if (!entry.deletedPaths.includes(path)) {
                next.push({ path, updatedAt: new Date().toISOString() });
            }
        }
        for (const item of entry.workspaces) {
            if (!seen.has(item.path))
                next.push(item);
        }
        entry.workspaces = next;
        await this.persist();
        return next.map(item => item.path);
    }
    async getPinnedSessions(backend) {
        await this.load();
        return [...(this.getBackend(backend)?.pinnedSessionIds ?? [])];
    }
    async pinSession(backend, sessionId) {
        await this.load();
        const entry = this.ensureBackend(backend);
        entry.pinnedSessionIds = [sessionId, ...entry.pinnedSessionIds.filter(id => id !== sessionId)];
        await this.persist();
        return [...entry.pinnedSessionIds];
    }
    async unpinSession(backend, sessionId) {
        await this.load();
        const entry = this.ensureBackend(backend);
        entry.pinnedSessionIds = entry.pinnedSessionIds.filter(id => id !== sessionId);
        await this.persist();
        return [...entry.pinnedSessionIds];
    }
    async getSessionPermission(sessionId) {
        await this.load();
        if (PROTOTYPE_KEYS.has(sessionId) || !Object.hasOwn(this.data.sessionPermissions, sessionId))
            return undefined;
        return this.data.sessionPermissions[sessionId];
    }
    async setSessionPermission(sessionId, preset) {
        await this.load();
        if (PROTOTYPE_KEYS.has(sessionId)) {
            throw new Error(`Reserved ACP session key: ${sessionId}`);
        }
        this.data.sessionPermissions[sessionId] = preset;
        await this.persist();
    }
    async getAllSessionPermissions() {
        await this.load();
        return { ...this.data.sessionPermissions };
    }
}
function normalizeStore(value) {
    if (!isRecord(value) || value.version !== 1)
        return createEmptyStore();
    const backends = emptyBackends();
    if (isRecord(value.backends)) {
        for (const [key, raw] of Object.entries(value.backends)) {
            if (PROTOTYPE_KEYS.has(key) || !isRecord(raw))
                continue;
            const workspaces = Array.isArray(raw.workspaces)
                ? raw.workspaces.flatMap(item => (isRecord(item) && typeof item.path === 'string' && item.path.length > 0
                    ? [{
                            path: item.path,
                            ...(typeof item.title === 'string' && item.title.trim() ? { title: item.title.trim() } : {}),
                            updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
                        }]
                    : []))
                : [];
            const deletedPaths = Array.isArray(raw.deletedPaths)
                ? raw.deletedPaths.filter((item) => typeof item === 'string' && item.length > 0)
                : [];
            const pinnedSessionIds = Array.isArray(raw.pinnedSessionIds)
                ? raw.pinnedSessionIds.filter((item) => typeof item === 'string' && item.length > 0)
                : [];
            backends[key] = { workspaces, deletedPaths, pinnedSessionIds };
        }
    }
    const sessionPermissions = emptyPermissions();
    if (isRecord(value.sessionPermissions)) {
        for (const [key, preset] of Object.entries(value.sessionPermissions)) {
            if (!PROTOTYPE_KEYS.has(key) && (preset === 'workspace-write' || preset === 'danger-full-access')) {
                sessionPermissions[key] = preset;
            }
        }
    }
    return { version: 1, backends, sessionPermissions };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=workspace-store.js.map
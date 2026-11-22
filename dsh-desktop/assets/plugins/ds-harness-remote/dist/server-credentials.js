import { chmod, link, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { z } from 'zod';
import { uuidV7 } from './ids.js';
import { CREDENTIALS_LOCK_DIRECTORY_MESSAGE } from './safe-error.js';
const credentialSchema = z.object({
    schemaVersion: z.literal(1),
    serverUrl: z.string().url(),
    deviceId: z.string().min(1),
    authorizationMethod: z.enum(['account', 'host_registration_code', 'owned_device', 'device_pairing']),
    accountKind: z.enum(['standard', 'device_only']).optional(),
    pairingRestricted: z.boolean().optional(),
    inboundOnly: z.boolean().optional(),
    account: z.string().min(1).max(254).optional(),
    accessToken: z.string().min(16),
    accessTokenExpiresAt: z.number().int().positive(),
    refreshToken: z.string().min(16),
    refreshTokenExpiresAt: z.number().int().positive(),
}).strict();
export class ServerCredentialStore {
    path;
    constructor(directory) { this.path = join(directory, 'server-credentials.json'); }
    /** Each process owns one queue record. A dead process cannot hold the queue. */
    async withRefreshLock(operation) {
        const gate = defaultMigrationGate(dirname(this.path));
        const run = () => withQueueLock(`${this.path}.refresh-lock`, operation);
        return gate === undefined ? run() : withQueueLock(gate, run);
    }
    async pairingHostOnly() {
        const policy = await readPrivateJson(join(dirname(this.path), 'pairing-host-only.json'));
        if (policy === undefined)
            return false;
        z.object({ hostOnly: z.literal(true) }).strict().parse(policy);
        return true;
    }
    async restrictPairingHostOnly() {
        await atomicWritePrivate(join(dirname(this.path), 'pairing-host-only.json'), '{"hostOnly":true}');
    }
    async load(serverUrl, deviceId) {
        if (!(await exists(this.path)))
            return undefined;
        await assertPrivateMode(this.path);
        let parsed;
        try {
            parsed = credentialSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
        }
        catch (error) {
            throw new ServerCredentialsInvalidError(`server credentials are invalid: ${safeMessage(error)}`);
        }
        return parsed.serverUrl === serverUrl && parsed.deviceId === deviceId ? parsed : undefined;
    }
    async save(credentials) {
        const record = credentialSchema.parse({ schemaVersion: 1, ...credentials });
        await atomicWritePrivate(this.path, `${JSON.stringify(record, null, 2)}\n`);
        return record;
    }
    async clear() {
        await rm(this.path, { force: true });
    }
}
function defaultMigrationGate(directory) {
    const parts = directory.split(sep);
    let rootIndex = -1;
    for (let index = parts.length - 1; index >= 0; index--) {
        if ((parts[index] === 'remote' || parts[index] === 'ds-harness-remote')
            && (index === parts.length - 1 || parts[index + 1] === 'servers')) {
            rootIndex = index;
            break;
        }
    }
    if (rootIndex < 1)
        return undefined;
    const suffix = parts.slice(rootIndex + 1);
    if (suffix.length !== 0 && (suffix.length !== 3 || suffix[0] !== 'servers'
        || !/^[a-f0-9]{24}$/.test(suffix[1]) || !['host', 'client'].includes(suffix[2])))
        return undefined;
    return join(parts.slice(0, rootIndex).join(sep) || sep, '.ds-harness-remote-migration', 'credential-refresh-gate');
}
export function withDefaultCredentialMigrationGate(home, operation) {
    return withQueueLock(join(home, '.ds-harness-remote-migration', 'credential-refresh-gate'), operation);
}
export async function assertRefreshQueueIdle(directory) {
    const lock = join(directory, 'server-credentials.json.refresh-lock');
    const marker = await readQueueMarker(lock);
    if (marker === undefined) {
        if ((await readdir(directory)).some(name => name.startsWith(`${basename(lock)}.holder-`) && !name.endsWith('.tmp'))) {
            throw new ServerCredentialsBusyError();
        }
        return;
    }
    if (marker !== SERVER_CREDENTIALS_QUEUE_MARKER)
        throw new ServerCredentialsBusyError();
    if ((await participants(lock)).length > 0)
        throw new ServerCredentialsBusyError();
}
async function withQueueLock(lock, operation) {
    await mkdir(dirname(lock), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + 15_000;
    await ensureQueueMarker(lock, deadline);
    const id = `${process.pid}-${uuidV7()}`;
    const holder = `${lock}.holder-${id}`;
    // Publish intent first. A later contender must see this record before it chooses a ticket.
    await publishExclusive(holder, `${id} choosing\n`);
    try {
        const ticket = 1 + (await participants(lock)).reduce((max, entry) => Math.max(max, entry.ticket ?? 0), 0);
        if (!Number.isSafeInteger(ticket))
            throw new ServerCredentialsBusyError();
        await atomicWritePrivate(holder, `${id} ${ticket}\n`);
        for (;;) {
            const entries = await participants(lock);
            const preceding = entries.some(entry => entry.id !== id && (entry.ticket === undefined
                || entry.ticket < ticket || (entry.ticket === ticket && entry.id < id)));
            if (!preceding)
                break;
            if (Date.now() >= deadline)
                throw new ServerCredentialsBusyError();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return await operation();
    }
    finally {
        await rm(holder, { force: true });
    }
}
export class ServerCredentialsInvalidError extends Error {
    code = 'SERVER_CREDENTIALS_INVALID';
}
export class ServerCredentialsBusyError extends Error {
    code = 'SERVER_CREDENTIALS_BUSY';
    constructor() {
        super('Credential refresh is busy. Stop other instances. Remove a legacy refresh lock only after every instance stops.');
    }
}
export class ServerCredentialsLockUnsupportedError extends Error {
    code = 'SERVER_CREDENTIALS_LOCK_UNSUPPORTED';
    constructor() {
        super('Credential lock cannot create a hard link in DSH_HOME. Use a writable local ext4 or XFS file system.');
    }
}
export class ServerCredentialsLockDirectoryError extends Error {
    code = 'SERVER_CREDENTIALS_LOCK_DIRECTORY';
    constructor() { super(CREDENTIALS_LOCK_DIRECTORY_MESSAGE); }
}
export const SERVER_CREDENTIALS_QUEUE_MARKER = 'DSH_REFRESH_LOCK_V2\n';
async function ensureQueueMarker(lock, deadline) {
    // Old versions use this path as their lock. Keep them outside the new queue.
    for (;;) {
        try {
            await publishExclusive(lock, SERVER_CREDENTIALS_QUEUE_MARKER);
            return;
        }
        catch (error) {
            if (error instanceof ServerCredentialsLockUnsupportedError) {
                // On Windows a hard link to an occupied directory can fail with EPERM.
                await assertLockIsNotDirectory(lock);
                throw error;
            }
            if (!(await isLockContention(error, lock)))
                throw error;
            if (await readQueueMarker(lock) === SERVER_CREDENTIALS_QUEUE_MARKER)
                return;
            if (Date.now() >= deadline)
                throw new ServerCredentialsBusyError();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
}
async function participants(lock) {
    const prefix = `${basename(lock)}.holder-`;
    const entries = await readdir(dirname(lock));
    const result = [];
    for (const name of entries) {
        if (!name.startsWith(prefix))
            continue;
        if (name.endsWith('.tmp'))
            continue;
        const id = name.slice(prefix.length);
        if (!/^\d+-[0-9a-f-]{36}$/.test(id))
            throw new ServerCredentialsBusyError();
        const path = join(dirname(lock), name);
        const record = await readLockRecord(path);
        if (record === undefined)
            continue;
        const match = new RegExp(`^${id} (choosing|[1-9]\\d*)\\n$`).exec(record);
        if (match === null)
            throw new ServerCredentialsBusyError();
        const pid = Number(id.slice(0, id.indexOf('-')));
        // A unique path cannot become a new owner's record. Dead records can leave the queue.
        if (await ownerExited(pid)) {
            await rm(path, { force: true });
            continue;
        }
        const ticket = match[1] === 'choosing' ? undefined : Number(match[1]);
        if (ticket !== undefined && !Number.isSafeInteger(ticket))
            throw new ServerCredentialsBusyError();
        result.push({ id, ...(ticket === undefined ? {} : { ticket }) });
    }
    return result;
}
async function publishExclusive(path, record) {
    const temporary = `${path}.${process.pid}.${uuidV7()}.tmp`;
    await writeFile(temporary, record, { mode: 0o600, flag: 'wx' });
    try {
        try {
            await link(temporary, path);
        }
        catch (error) {
            if (error instanceof Error && 'code' in error
                && ['EXDEV', 'EOPNOTSUPP', 'ENOTSUP', 'ENOSYS', 'EPERM', 'EACCES'].includes(String(error.code))) {
                throw new ServerCredentialsLockUnsupportedError();
            }
            throw error;
        }
    }
    finally {
        await rm(temporary, { force: true });
    }
}
async function isLockContention(error, path) {
    if (!(error instanceof Error) || !('code' in error))
        return false;
    if (error.code === 'EEXIST')
        return true;
    if (process.platform !== 'win32' || error.code !== 'EPERM')
        return false;
    return exists(path);
}
async function readLockRecord(path) {
    try {
        return await readFile(path, 'utf8');
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return undefined;
        throw error;
    }
}
async function readQueueMarker(lock) {
    await assertLockIsNotDirectory(lock);
    try {
        return await readLockRecord(lock);
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EISDIR')
            throw new ServerCredentialsLockDirectoryError();
        throw error;
    }
}
async function assertLockIsNotDirectory(lock) {
    const metadata = await lstat(lock).catch(error => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return undefined;
        throw error;
    });
    if (metadata?.isDirectory())
        throw new ServerCredentialsLockDirectoryError();
}
async function ownerExited(pid) {
    if (pid < 1 || pid > 2147483647 || pid === process.pid)
        return false;
    try {
        process.kill(pid, 0);
        return false;
    }
    catch (error) {
        return error instanceof Error && 'code' in error && error.code === 'ESRCH';
    }
}
export async function atomicWritePrivate(path, contents) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${uuidV7()}.tmp`;
    await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    await chmod(path, 0o600);
}
async function assertPrivateMode(path) {
    if (process.platform === 'win32')
        return;
    const mode = (await stat(path)).mode & 0o777;
    if ((mode & 0o077) !== 0)
        throw new ServerCredentialsInvalidError('server credentials permissions must be 0600');
}
async function exists(path) {
    try {
        await stat(path);
        return true;
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return false;
        throw error;
    }
}
function safeMessage(error) { return error instanceof Error ? error.message : 'invalid credential data'; }
export async function readPrivateJson(path) {
    if (!await exists(path))
        return undefined;
    await assertPrivateMode(path);
    return JSON.parse(await readFile(path, 'utf8'));
}
//# sourceMappingURL=server-credentials.js.map
import { savedPairingSchema } from './pairing-contract.js';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fromBase64Url, generateKeyPair } from '@dsh-remote/crypto';
import { z } from 'zod';
import { uuidV7 } from './ids.js';
import { SERVER_CREDENTIALS_QUEUE_MARKER, ServerCredentialStore, ServerCredentialsBusyError, ServerCredentialsLockDirectoryError, assertRefreshQueueIdle, withDefaultCredentialMigrationGate } from './server-credentials.js';
const identitySchema = z.object({
    schemaVersion: z.literal(1),
    deviceId: z.string().uuid(),
    name: z.string().min(1).max(80),
    publicKey: z.string().min(1),
}).strict();
const trustedPeerSchema = z.object({
    deviceId: z.string().min(1),
    name: z.string().min(1).max(80),
    platform: z.string().min(1).max(40),
    publicKey: z.string().min(1),
    fingerprint: z.string().min(1),
    trustedAt: z.number().int().nonnegative(),
    membershipId: z.string().min(1).optional(),
}).strict();
const trustedPeersSchema = z.object({
    schemaVersion: z.literal(1),
    // Discovery can persist multiple pages; reading must accept every record we write.
    peers: z.array(trustedPeerSchema),
}).strict();
const STORAGE_CONFLICT_MESSAGE = 'Remote storage ownership could not be verified; nothing was moved. Inspect the legacy directory manually.';
const STORAGE_CONFLICT_ENTRY_PATTERN = /^(?:device\.json|device\.key|trusted-peers\.json|server-credentials\.json|host-pairing\.json|pairing-host-only\.json)(?:\.bak(?:-[0-9]+)?|\.old|\.orig|~|\.swp)$/;
export class IdentityInvalidError extends Error {
    code;
    constructor(message, code = 'IDENTITY_INVALID') {
        super(message);
        this.code = code;
    }
}
export class IdentityStore {
    storageDirectory;
    get directory() { return this.storageDirectory; }
    identity;
    peers = new Map();
    peerSaveChain = Promise.resolve();
    defaultOptions;
    role;
    constructor(options = {}) {
        const env = options.env ?? process.env;
        const dshHome = env.DSH_HOME || join(options.homeDirectory ?? homedir(), '.dsh');
        this.storageDirectory = options.directory ?? join(dshHome, 'ds-harness-remote');
        this.defaultOptions = options.directory === undefined ? options : undefined;
        this.role = options.role;
    }
    async loadOrCreate(deviceName) {
        if (this.defaultOptions !== undefined)
            this.storageDirectory = await prepareDefaultIdentityDirectory(this.defaultOptions);
        await ensureDirectory(this.directory);
        // Creation writes two files that must agree. Without a cross-process lock a
        // Desktop restart overlapping the previous Host reaches the "create" branch
        // twice; each writes its own key pair and the directory ends up holding one
        // process's device.json beside another's device.key. That mismatch fails
        // closed forever — every later start throws before registering the control
        // route — so serialize the whole read-create-verify cycle.
        return withIdentityLock(this.directory, () => this.loadOrCreateLocked(deviceName));
    }
    /**
     * Read and verify an existing identity without creating files, mutating
     * device metadata, or triggering client self-heal. Returns `undefined` when
     * neither identity file exists yet.
     */
    async loadExisting() {
        if (this.defaultOptions !== undefined)
            this.storageDirectory = await prepareDefaultIdentityDirectory(this.defaultOptions);
        const devicePath = join(this.directory, 'device.json');
        const keyPath = join(this.directory, 'device.key');
        const [hasDevice, hasKey] = await Promise.all([exists(devicePath), exists(keyPath)]);
        if (!hasDevice && !hasKey)
            return undefined;
        if (hasDevice !== hasKey) {
            throw new IdentityInvalidError('device identity is incomplete; repair it explicitly before reconnecting');
        }
        await assertPrivateMode(keyPath);
        try {
            const record = identitySchema.parse(JSON.parse(await readFile(devicePath, 'utf8')));
            const privateKey = (await readFile(keyPath, 'utf8')).trim();
            const regenerated = generateKeyPair(fromBase64Url(privateKey));
            if (regenerated.publicKey !== record.publicKey) {
                throw new IdentityInvalidError('device public and private keys do not match');
            }
            return { ...record, privateKey, fingerprint: fingerprint(record.publicKey) };
        }
        catch (error) {
            if (error instanceof IdentityInvalidError)
                throw error;
            throw new IdentityInvalidError(`device identity is invalid: ${safeErrorMessage(error)}`);
        }
    }
    async loadOrCreateLocked(deviceName) {
        const devicePath = join(this.directory, 'device.json');
        const keyPath = join(this.directory, 'device.key');
        const [hasDevice, hasKey] = await Promise.all([exists(devicePath), exists(keyPath)]);
        const isScopedOrExplicitClient = this.role === 'client' || (this.role === undefined && isScopedClientDirectory(this.directory));
        const isFlatRootWithScopedIdentity = !isScopedOrExplicitClient
            && this.role === undefined
            && await hasVerifiedScopedIdentity(this.directory);
        const isClientRole = isScopedOrExplicitClient || isFlatRootWithScopedIdentity;
        if (hasDevice !== hasKey) {
            if (isClientRole && await canAutoHealClientIdentity(this.directory, isFlatRootWithScopedIdentity)) {
                await removeIdentityRecords(this.directory);
                return this.createAndReadIdentityLocked(devicePath, keyPath, deviceName);
            }
            throw new IdentityInvalidError('device identity is incomplete; repair it explicitly before reconnecting');
        }
        if (!hasDevice) {
            return this.createAndReadIdentityLocked(devicePath, keyPath, deviceName);
        }
        let identity;
        try {
            identity = await this.readIdentity(devicePath, keyPath, deviceName);
        }
        catch (error) {
            if (error instanceof IdentityInvalidError
                && isClientRole
                && await canAutoHealClientIdentity(this.directory, isFlatRootWithScopedIdentity)) {
                await removeIdentityRecords(this.directory);
                return this.createAndReadIdentityLocked(devicePath, keyPath, deviceName);
            }
            throw error;
        }
        // Only a verified pair makes the leftovers dead weight. In the #276 residue
        // the surviving device.key.*.tmp is the only private key that still matches
        // device.json, so a failed verification keeps it for manual recovery.
        await removeStaleTemporaries(this.directory);
        return identity;
    }
    async createAndReadIdentityLocked(devicePath, keyPath, deviceName) {
        const keys = generateKeyPair();
        const record = { schemaVersion: 1, deviceId: uuidV7(), name: deviceName, publicKey: keys.publicKey };
        // Write the key first: a crash between the two leaves device.key alone,
        // which the incomplete-pair guard above reports explicitly, instead of
        // leaving a device.json whose published public key has no private half.
        await atomicTextWrite(keyPath, `${keys.privateKey}
`, 0o600);
        await atomicJsonWrite(devicePath, record, 0o600);
        const identity = await this.readIdentity(devicePath, keyPath, deviceName);
        await removeStaleTemporaries(this.directory);
        return identity;
    }
    async readIdentity(devicePath, keyPath, deviceName) {
        await assertPrivateMode(keyPath);
        try {
            let record = identitySchema.parse(JSON.parse(await readFile(devicePath, 'utf8')));
            const privateKey = (await readFile(keyPath, 'utf8')).trim();
            const regenerated = generateKeyPair(fromBase64Url(privateKey));
            if (regenerated.publicKey !== record.publicKey) {
                throw new IdentityInvalidError('device public and private keys do not match');
            }
            if (record.name !== deviceName) {
                record = { ...record, name: deviceName };
                await atomicJsonWrite(devicePath, record, 0o600);
            }
            this.identity = { ...record, privateKey, fingerprint: fingerprint(record.publicKey) };
            await this.loadPeers();
            return this.identity;
        }
        catch (error) {
            if (error instanceof IdentityInvalidError)
                throw error;
            throw new IdentityInvalidError(`device identity is invalid: ${safeErrorMessage(error)}`);
        }
    }
    current() {
        if (this.identity === undefined)
            throw new Error('identity store has not been loaded');
        return this.identity;
    }
    /**
     * Replace the identity. Runs in the same lock domain as creation, so a reset
     * can never interleave with another process's read-create-verify. The lock
     * file lives outside `removeIdentityRecords`, so resetting cannot delete a
     * lock another process holds — and cannot leave itself unprotected either.
     */
    async reset(deviceName, options = {}) {
        if (this.defaultOptions !== undefined)
            this.storageDirectory = await prepareDefaultIdentityDirectory(this.defaultOptions);
        await ensureDirectory(this.directory);
        return withIdentityLock(this.directory, async () => {
            await this.peerSaveChain.catch(() => undefined);
            this.identity = undefined;
            this.peers.clear();
            await removeIdentityRecords(this.directory);
            const identity = await this.loadOrCreateLocked(deviceName);
            if (options.clearPairingPolicy)
                await rm(join(this.directory, 'pairing-host-only.json'), { force: true });
            return identity;
        });
    }
    listTrustedPeers() {
        return [...this.peers.values()].map(peer => ({ ...peer }));
    }
    trustedPeer(deviceId) {
        const peer = this.peers.get(deviceId);
        return peer === undefined ? undefined : { ...peer };
    }
    isTrusted(deviceId, publicKey) {
        return this.peers.get(deviceId)?.publicKey === publicKey;
    }
    async trustPeer(input) {
        this.current();
        const peer = {
            ...input,
            fingerprint: fingerprint(input.publicKey),
            trustedAt: Date.now(),
        };
        this.peers.set(peer.deviceId, peer);
        await this.savePeers();
        return { ...peer };
    }
    async revokePeer(deviceId) {
        const removed = this.peers.delete(deviceId);
        if (removed)
            await this.savePeers();
        return removed;
    }
    async loadPeers() {
        const path = join(this.directory, 'trusted-peers.json');
        if (!(await exists(path))) {
            await atomicJsonWrite(path, { schemaVersion: 1, peers: [] }, 0o600);
        }
        const parsed = trustedPeersSchema.parse(JSON.parse(await readFile(path, 'utf8')));
        const peers = new Map();
        for (const peer of parsed.peers) {
            if (peer.fingerprint !== fingerprint(peer.publicKey)) {
                throw new IdentityInvalidError(`trusted peer ${peer.deviceId} has an invalid fingerprint`);
            }
            if (peers.has(peer.deviceId))
                throw new IdentityInvalidError(`trusted peer ${peer.deviceId} is duplicated`);
            peers.set(peer.deviceId, peer);
        }
        this.peers = peers;
    }
    savePeers() {
        const next = this.peerSaveChain.catch(() => undefined).then(() => atomicJsonWrite(join(this.directory, 'trusted-peers.json'), {
            schemaVersion: 1,
            peers: [...this.peers.values()],
        }, 0o600));
        this.peerSaveChain = next;
        return next;
    }
}
const statIdSchema = z.union([
    z.number().int().nonnegative().transform(value => BigInt(value)),
    z.string().regex(/^(?:0|[1-9]\d{0,19})$/).transform(value => BigInt(value)),
]);
const legacyRootPinSchema = z.object({
    schemaVersion: z.literal(1),
    dev: statIdSchema,
    ino: statIdSchema,
}).strict();
function serializeStatId(value) {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}
/** Resolve storage and migrate legacy data before startup or installation uses it.
 * Upgrade/restart must stop old instances: idle old processes do not hold file locks.
 */
export async function prepareDefaultIdentityDirectory(options = {}) {
    if (options.directory !== undefined)
        return options.directory;
    return withDefaultStorageTransaction(options, prepareDefaultIdentityDirectoryLocked);
}
async function withDefaultStorageTransaction(options, operation) {
    const env = options.env ?? process.env;
    const home = env.DSH_HOME || join(options.homeDirectory ?? homedir(), '.dsh');
    const source = join(home, 'remote');
    const target = join(home, 'ds-harness-remote');
    await mkdir(home, { recursive: true, mode: 0o700 });
    // Kept outside the renamed tree so competing new-version migrators share one lock.
    const lockDirectory = join(home, '.ds-harness-remote-migration');
    await storageDirectoryStat(lockDirectory);
    await ensureDirectory(lockDirectory);
    return withIdentityLock(lockDirectory, () => withDefaultCredentialMigrationGate(home, () => operation({ source, target, lockDirectory })));
}
async function prepareDefaultIdentityDirectoryLocked({ source, target, lockDirectory }) {
    const old = await storageDirectoryStat(source);
    const current = await storageDirectoryStat(target);
    const pinPath = join(lockDirectory, 'legacy-root.json');
    const pinMetadata = await lstat(pinPath).catch(error => {
        if (isNodeError(error) && error.code === 'ENOENT')
            return undefined;
        throw error;
    });
    let pin;
    if (pinMetadata !== undefined) {
        if (!pinMetadata.isFile() || pinMetadata.isSymbolicLink() || pinMetadata.nlink !== 1 || pinMetadata.size > 4096) {
            throw new IdentityInvalidError('Remote storage fallback record is invalid; no credentials were changed.', 'STORAGE_CONFLICT');
        }
        await assertPrivateMode(pinPath);
        try {
            pin = legacyRootPinSchema.parse(JSON.parse(await readFile(pinPath, 'utf8')));
        }
        catch {
            throw new IdentityInvalidError('Remote storage fallback record is invalid; no credentials were changed.', 'STORAGE_CONFLICT');
        }
    }
    if (old !== undefined) {
        if (current !== undefined) {
            throw new IdentityInvalidError('Both Remote storage directories exist; stop all Harness instances and resolve them manually. No credentials were overwritten.', 'STORAGE_CONFLICT');
        }
        await assertOwnedRemoteStorage(source);
        await assertStorageIdle(source);
        // Persist the choice across processes. A later installer/CLI must not move
        // storage out from under a Host that is already using the fallback.
        if (pin !== undefined) {
            if (pin.dev !== old.dev || pin.ino !== old.ino) {
                throw new IdentityInvalidError('Legacy Remote storage changed after fallback; inspect it before reconnecting.', 'STORAGE_CONFLICT');
            }
            return source;
        }
        try {
            // Same parent/filesystem: preserve every byte, mode, Server scope and role in one rename.
            await rename(source, target);
        }
        catch (error) {
            if (!isNodeError(error) || !['EACCES', 'EPERM', 'EBUSY', 'EXDEV', 'EROFS', 'EEXIST', 'ENOTEMPTY', 'ENOSPC', 'EDQUOT'].includes(error.code ?? ''))
                throw error;
            const remaining = await storageDirectoryStat(source);
            // A failed move is compatible only if the same verified tree still exists
            // and no destination appeared. Never fall back from an ambiguous outcome.
            if (remaining === undefined || remaining.dev !== old.dev || remaining.ino !== old.ino || await storageDirectoryStat(target) !== undefined)
                throw error;
            await assertOwnedRemoteStorage(source);
            await assertStorageIdle(source);
            // If the fallback choice cannot be recorded, stop rather than risk
            // another process moving a directory this process starts using.
            await atomicJsonWrite(pinPath, {
                schemaVersion: 1,
                dev: serializeStatId(old.dev),
                ino: serializeStatId(old.ino),
            }, 0o600);
            return source;
        }
    }
    else if (pin !== undefined) {
        if (current === undefined)
            throw new IdentityInvalidError('Pinned Remote storage is missing; no replacement identity was created.', 'STORAGE_CONFLICT');
        await assertOwnedRemoteStorage(target);
    }
    return target;
}
/**
 * Reset the selected role identities and credentials in either an explicit
 * storage root or the default `$DSH_HOME` root. When legacy `<DSH_HOME>/remote`
 * could not be migrated only because one of its owned role identities was
 * corrupt, resetting that role repairs the legacy tree first and then completes
 * the standard migration without creating a conflicting second root.
 */
export async function resetDefaultIdentityRoles(roles, serverUrl, deviceName, options = {}) {
    const createStore = options.createIdentityStore ?? (storeOptions => new IdentityStore(storeOptions));
    const resetRolesInRoot = async (root) => {
        if (serverUrl === undefined) {
            if (!roles.includes('host'))
                return;
            const identities = createStore({ directory: root, env: options.env, homeDirectory: options.homeDirectory, role: 'host' });
            await identities.reset(deviceName);
            await new ServerCredentialStore(root).clear();
            return;
        }
        for (const role of roles) {
            const directory = serverStorageDirectory(root, serverUrl, role);
            const identities = createStore({ directory, env: options.env, homeDirectory: options.homeDirectory, role });
            await identities.reset(deviceName);
            await new ServerCredentialStore(directory).clear();
        }
    };
    if (options.directory !== undefined) {
        await resetRolesInRoot(options.directory);
        return options.directory;
    }
    return withDefaultStorageTransaction(options, async (paths) => {
        try {
            const root = await prepareDefaultIdentityDirectoryLocked(paths);
            await resetRolesInRoot(root);
            return root;
        }
        catch (error) {
            if (!(error instanceof IdentityInvalidError) || error.code !== 'IDENTITY_INVALID')
                throw error;
            const [old, current] = await Promise.all([storageDirectoryStat(paths.source), storageDirectoryStat(paths.target)]);
            if (old === undefined || current !== undefined)
                throw error;
            await assertStorageIdle(paths.source);
            await resetRolesInRoot(paths.source);
            return prepareDefaultIdentityDirectoryLocked(paths);
        }
    });
}
/** Legacy storage has no owner marker. Require its complete known layout and
 * cryptographically consistent identities, rather than trusting the directory name.
 * Read-only: never repair, create peers, rename devices or refresh tokens here.
 */
export async function assertOwnedRemoteStorage(root) {
    let failureCode = 'STORAGE_CONFLICT';
    const rejected = (code = failureCode, entryName) => new IdentityInvalidError(entryName === undefined
        ? STORAGE_CONFLICT_MESSAGE
        : `${STORAGE_CONFLICT_MESSAGE} Unexpected entry "${safeStorageEntryName(entryName)}" was found.`, code);
    const identityFiles = new Set([
        'device.json',
        'device.key',
        'trusted-peers.json',
        'server-credentials.json',
        'server-credentials.json.refresh-lock',
        'host-pairing.json',
        'pairing-host-only.json',
    ]);
    let identities = 0;
    let verifiedScopedIdentities = 0;
    const checkIdentity = async (directory, scope, role) => {
        const canAutoHeal = role === 'client' || (directory === root && verifiedScopedIdentities > 0);
        const entries = (await readStorageEntries(directory)).filter(entry => !(directory === root && entry.name === 'servers' && entry.isDirectory()));
        for (const entry of entries) {
            if (entry.name === 'server-credentials.json.refresh-lock' && entry.isDirectory()) {
                throw new ServerCredentialsLockDirectoryError();
            }
            if (entry.name.includes('.refresh-lock')
                && entry.name !== 'server-credentials.json.refresh-lock'
                && !isRefreshQueueArtifact(entry.name)) {
                if (entry.isSymbolicLink())
                    throw rejected('STORAGE_CONFLICT');
                throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
            }
            if (isLockArtifact(entry.name)) {
                const lockPath = join(directory, entry.name);
                const metadata = await lstat(lockPath);
                if (!entry.isFile() || !metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size > 16 * 1024 * 1024) {
                    throw rejected('STORAGE_CONFLICT');
                }
                if (!(await isExitedLockArtifact(lockPath))) {
                    throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
                }
                continue;
            }
            const allowedFile = identityFiles.has(entry.name) || isOwnedTempArtifact(entry.name)
                || isRefreshQueueArtifact(entry.name) || isBackupArtifact(entry.name)
                || (canAutoHeal && isIdentityTempArtifact(entry.name));
            if (!entry.isFile() || !allowedFile)
                throw rejected('STORAGE_CONFLICT', entry.name);
            const metadata = await lstat(join(directory, entry.name));
            if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16 * 1024 * 1024
                || (metadata.nlink !== 1 && !(await isVerifiedRefreshHardlink(directory, entry.name, entries.map(item => item.name))))) {
                throw rejected('STORAGE_CONFLICT', entry.name);
            }
        }
        const names = new Set(entries.map(entry => entry.name).filter(name => !isLockArtifact(name)));
        if (names.has('server-credentials.json.refresh-lock')
            && await readFile(join(directory, 'server-credentials.json.refresh-lock'), 'utf8') !== SERVER_CREDENTIALS_QUEUE_MARKER) {
            throw rejected('STORAGE_CONFLICT');
        }
        if (!names.has('device.json') && !names.has('device.key')) {
            if (canAutoHeal && await isRepairableLegacyClientDirectory(directory, names)) {
                if (names.size > 0)
                    identities++;
                return;
            }
            throw rejected('STORAGE_CONFLICT');
        }
        failureCode = 'IDENTITY_INVALID';
        if (!names.has('device.json') || !names.has('device.key')) {
            if (canAutoHeal && await isRepairableLegacyClientDirectory(directory, names)) {
                identities++;
                return;
            }
            throw rejected('IDENTITY_INVALID');
        }
        await assertPrivateMode(join(directory, 'device.key'));
        let record;
        try {
            record = identitySchema.parse(JSON.parse(await readFile(join(directory, 'device.json'), 'utf8')));
            const key = (await readFile(join(directory, 'device.key'), 'utf8')).trim();
            if (generateKeyPair(fromBase64Url(key)).publicKey !== record.publicKey) {
                throw new IdentityInvalidError('device public and private keys do not match');
            }
        }
        catch {
            if (canAutoHeal && await isRepairableLegacyClientDirectory(directory, names)) {
                identities++;
                return;
            }
            throw rejected('IDENTITY_INVALID');
        }
        if (names.has('trusted-peers.json')) {
            const peers = trustedPeersSchema.parse(JSON.parse(await readFile(join(directory, 'trusted-peers.json'), 'utf8'))).peers;
            const ids = new Set();
            for (const peer of peers) {
                if (peer.fingerprint !== fingerprint(peer.publicKey) || ids.has(peer.deviceId))
                    throw rejected('IDENTITY_INVALID');
                ids.add(peer.deviceId);
            }
        }
        if (names.has('server-credentials.json')) {
            // Use the existing strict schema and permission checks without refreshing or writing.
            const raw = JSON.parse(await readFile(join(directory, 'server-credentials.json'), 'utf8'));
            if (typeof raw.serverUrl !== 'string')
                throw rejected('IDENTITY_INVALID');
            const expectedDeviceId = role === 'client' && typeof raw.deviceId === 'string' && z.string().uuid().safeParse(raw.deviceId).success
                ? raw.deviceId
                : record.deviceId;
            const credentials = await new ServerCredentialStore(directory).load(raw.serverUrl, expectedDeviceId);
            if (credentials === undefined)
                throw rejected('IDENTITY_INVALID');
            const origin = new URL(credentials.serverUrl);
            if (!['http:', 'https:'].includes(origin.protocol))
                throw rejected('IDENTITY_INVALID');
            if (scope !== undefined && createHash('sha256').update(origin.origin).digest('hex').slice(0, 24) !== scope) {
                throw rejected('STORAGE_CONFLICT');
            }
        }
        if (names.has('pairing-host-only.json')) {
            await assertPrivateMode(join(directory, 'pairing-host-only.json'));
            z.object({ hostOnly: z.literal(true) }).strict().parse(JSON.parse(await readFile(join(directory, 'pairing-host-only.json'), 'utf8')));
        }
        if (names.has('host-pairing.json')) {
            await assertPrivateMode(join(directory, 'host-pairing.json'));
            const pairing = savedPairingSchema.parse(JSON.parse(await readFile(join(directory, 'host-pairing.json'), 'utf8')));
            if (pairing.deviceId !== record.deviceId || pairing.session.host.deviceId !== record.deviceId || pairing.session.host.identityKey !== record.publicKey || pairing.session.host.role !== 'host')
                throw rejected('IDENTITY_INVALID');
            const origin = new URL(pairing.serverUrl);
            if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== pairing.serverUrl)
                throw rejected('IDENTITY_INVALID');
            if (scope !== undefined && createHash('sha256').update(origin.origin).digest('hex').slice(0, 24) !== scope) {
                throw rejected('STORAGE_CONFLICT');
            }
        }
        identities++;
        if (scope !== undefined)
            verifiedScopedIdentities++;
    };
    try {
        const entries = await readStorageEntries(root);
        const servers = entries.find(entry => entry.name === 'servers');
        if (servers !== undefined) {
            if (!servers.isDirectory())
                throw rejected('STORAGE_CONFLICT', servers.name);
            for (const scope of await readStorageEntries(join(root, 'servers'))) {
                if (!scope.isDirectory() || !/^[a-f0-9]{24}$/.test(scope.name))
                    throw rejected('STORAGE_CONFLICT', scope.name);
                for (const role of await readStorageEntries(join(root, 'servers', scope.name))) {
                    if (!role.isDirectory() || (role.name !== 'host' && role.name !== 'client'))
                        throw rejected('STORAGE_CONFLICT', role.name);
                    await checkIdentity(join(root, 'servers', scope.name, role.name), scope.name, role.name);
                }
            }
        }
        const flat = entries.filter(entry => entry.name !== 'servers');
        if (flat.length > 0) {
            // Validate a historical unscoped identity without including the servers container.
            const unexpected = flat.find(entry => {
                if (entry.name.includes('.refresh-lock'))
                    return entry.isSymbolicLink();
                if (!entry.isFile())
                    return true;
                return !identityFiles.has(entry.name)
                    && !isOwnedTempArtifact(entry.name)
                    && !isRefreshQueueArtifact(entry.name)
                    && !isLockArtifact(entry.name)
                    && !isBackupArtifact(entry.name)
                    && !(verifiedScopedIdentities > 0 && isIdentityTempArtifact(entry.name));
            });
            if (unexpected !== undefined)
                throw rejected('STORAGE_CONFLICT', unexpected.name);
            await checkIdentity(root);
        }
        if (identities === 0)
            throw rejected(failureCode);
    }
    catch (error) {
        if (error instanceof IdentityInvalidError && (error.code === 'STORAGE_CONFLICT'
            || error.code === 'IDENTITY_LOCKED')) {
            throw error;
        }
        // Do not surface schema errors or file contents that might contain secrets.
        throw rejected(failureCode);
    }
}
async function isRepairableLegacyClientDirectory(directory, names) {
    for (const name of names) {
        if (name === 'server-credentials.json'
            || name === 'host-pairing.json'
            || name === 'pairing-host-only.json'
            || name.startsWith('server-credentials.json.')
            || name.startsWith('host-pairing.json.')
            || name.startsWith('pairing-host-only.json.')) {
            return false;
        }
    }
    if (names.has('trusted-peers.json')) {
        const peers = trustedPeersSchema.parse(JSON.parse(await readFile(join(directory, 'trusted-peers.json'), 'utf8'))).peers;
        if (peers.length > 0)
            return false;
    }
    if (names.has('device.key')) {
        await assertPrivateMode(join(directory, 'device.key'));
    }
    return true;
}
async function storageDirectoryStat(path) {
    try {
        const entry = await lstat(path, { bigint: true });
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            throw new IdentityInvalidError('Remote storage must be a real directory; symbolic links are not migrated.', 'STORAGE_CONFLICT');
        }
        return entry;
    }
    catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT')
            return undefined;
        throw error;
    }
}
async function assertStorageIdle(directory) {
    const takeoverPaths = [];
    const lockPaths = [];
    const scan = async (currentDirectory) => {
        const before = await readdir(currentDirectory, { withFileTypes: true });
        const names = before.map(entry => entry.name);
        const linkedTemps = [];
        for (const entry of before) {
            if (!isRefreshQueueTemp(entry.name))
                continue;
            const metadata = await lstat(join(currentDirectory, entry.name));
            if (metadata.nlink === 2 && await isVerifiedRefreshHardlink(currentDirectory, entry.name, names)) {
                linkedTemps.push(join(currentDirectory, entry.name));
            }
        }
        try {
            await assertRefreshQueueIdle(currentDirectory);
        }
        catch (error) {
            if (!(error instanceof ServerCredentialsBusyError))
                throw error;
            throw new IdentityInvalidError('Remote storage has an active credential refresh; stop it before migration.', 'IDENTITY_LOCKED');
        }
        for (const temporary of linkedTemps)
            await unlink(temporary);
        for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
            const entryPath = join(currentDirectory, entry.name);
            if (entry.name === 'server-credentials.json.refresh-lock' && entry.isFile()
                && await readFile(entryPath, 'utf8') === SERVER_CREDENTIALS_QUEUE_MARKER)
                continue;
            if (entry.isFile() && isRefreshQueueArtifact(entry.name))
                continue;
            if (entry.isSymbolicLink()) {
                throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'STORAGE_CONFLICT');
            }
            if (entry.name === LOCK_FILE_NAME && entry.isFile()) {
                if (!(await isExitedLockArtifact(entryPath))) {
                    throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
                }
                lockPaths.push(entryPath);
                continue;
            }
            if (isTakeoverLockArtifact(entry.name) && entry.isFile()) {
                if (!(await isExitedLockArtifact(entryPath))) {
                    throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
                }
                takeoverPaths.push(entryPath);
                continue;
            }
            if (isOwnedTempArtifact(entry.name) && entry.isFile() && !isStaleOwnedTempArtifact(entry.name)) {
                throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
            }
            if (entry.name === LOCK_FILE_NAME || entry.name.includes('.refresh-lock') || entry.name.startsWith(`${LOCK_FILE_NAME}.takeover-`)) {
                throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
            }
            if (entry.isDirectory())
                await scan(entryPath);
        }
    };
    await scan(directory);
    // Reclaim stale takeover claims before device.lock: a previous takeover that
    // crashed after creating device.lock.takeover-<sha256(lockRecord).slice(0,16)>
    // would otherwise collide with the new takeover claim for that same lockRecord.
    const reclaimed = new Set();
    for (const takeoverPath of takeoverPaths) {
        if (reclaimed.has(takeoverPath))
            continue;
        if (!(await takeOverLockOfExitedOwner(takeoverPath, 0, reclaimed))) {
            throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
        }
    }
    for (const lockPath of lockPaths) {
        if (!(await takeOverLockOfExitedOwner(lockPath, 0, reclaimed))) {
            throw new IdentityInvalidError('Remote storage contains a lock or symbolic link; stop all Harness instances and inspect it before migration.', 'IDENTITY_LOCKED');
        }
    }
}
const REFRESH_QUEUE_TEMP_PATTERN = /^(server-credentials\.json\.refresh-lock(?:\.holder-\d+-[0-9a-f-]{36})?)\.([1-9]\d*)\.[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;
function isRefreshQueueTemp(name) {
    return REFRESH_QUEUE_TEMP_PATTERN.test(name);
}
async function isVerifiedRefreshHardlink(directory, name, names) {
    const temporary = REFRESH_QUEUE_TEMP_PATTERN.exec(name) === null
        ? names.filter(candidate => REFRESH_QUEUE_TEMP_PATTERN.exec(candidate)?.[1] === name)
        : [name];
    if (temporary.length !== 1)
        return false;
    const match = REFRESH_QUEUE_TEMP_PATTERN.exec(temporary[0]);
    if (match === null || !names.includes(match[1]) || !ownerExited(`${match[2]}\n`))
        return false;
    const [source, published] = await Promise.all([
        lstat(join(directory, temporary[0]), { bigint: true }),
        lstat(join(directory, match[1]), { bigint: true }),
    ]);
    return source.isFile() && published.isFile() && source.nlink === 2n && published.nlink === 2n
        && source.dev === published.dev && source.ino === published.ino;
}
function isRefreshQueueArtifact(name) {
    return /^server-credentials\.json\.refresh-lock\.holder-\d+-[0-9a-f-]{36}$/.test(name)
        || isRefreshQueueTemp(name);
}
export function serverStorageDirectory(root, serverUrl, role) {
    const origin = new URL(serverUrl).origin;
    const scope = createHash('sha256').update(origin).digest('hex').slice(0, 24);
    return join(root, 'servers', scope, role);
}
export function fingerprint(publicKey) {
    const compact = createHash('sha256').update(fromBase64Url(publicKey)).digest('hex').slice(0, 12).toUpperCase();
    return compact.match(/.{1,4}/g).join(' ');
}
async function assertPrivateMode(path) {
    if (process.platform === 'win32')
        return;
    const mode = (await stat(path)).mode & 0o777;
    if ((mode & 0o077) !== 0) {
        throw new IdentityInvalidError(`private key permissions must be 0600, got ${mode.toString(8).padStart(3, '0')}`);
    }
}
async function atomicJsonWrite(path, value, mode) {
    await atomicTextWrite(path, `${JSON.stringify(value, null, 2)}
`, mode);
}
async function atomicTextWrite(path, value, mode) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${uuidV7()}.tmp`;
    await writeFile(temporary, value, { encoding: 'utf8', mode, flag: 'wx' });
    await chmod(temporary, mode);
    await rename(temporary, path);
    await chmod(path, mode);
}
async function exists(path) {
    try {
        await stat(path);
        return true;
    }
    catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT')
            return false;
        throw error;
    }
}
function isNodeError(error) {
    return error instanceof Error && 'code' in error;
}
function safeErrorMessage(error) {
    return error instanceof Error ? error.message : 'invalid identity data';
}
/**
 * Serialize every read-create-verify cycle that touches `directory`.
 */
const LOCK_FILE_NAME = 'device.lock';
const LOCK_TIMEOUT_MS = 15_000;
const LOCK_RETRY_INITIAL_MS = 20;
const LOCK_RETRY_MAX_MS = 200;
async function withIdentityLock(directory, operation) {
    const lockPath = join(directory, LOCK_FILE_NAME);
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    let delay = LOCK_RETRY_INITIAL_MS;
    for (;;) {
        try {
            await writeFile(lockPath, `${process.pid}
`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            break;
        }
        catch (error) {
            if (!(await isLockContention(error, lockPath)))
                throw error;
            if (await takeOverLockOfExitedOwner(lockPath))
                continue;
        }
        if (Date.now() >= deadline) {
            throw new IdentityInvalidError('device identity is locked by another process; stop other DSH instances and retry', 'IDENTITY_LOCKED');
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS);
    }
    try {
        return await operation();
    }
    finally {
        await rm(lockPath, { force: true });
    }
}
/** Whether an exclusive create failed because the lock already exists. */
async function isLockContention(error, lockPath) {
    if (!isNodeError(error))
        return false;
    if (error.code === 'EEXIST')
        return true;
    // Windows reports a held exclusive create as EPERM; confirm by looking.
    if (error.code !== 'EPERM' || process.platform !== 'win32')
        return false;
    return exists(lockPath);
}
/**
 * Remove a lock whose recorded owner is proven gone, and report whether this
 * call did it. An unreadable or malformed record is not proof of anything and
 * is left alone for its owner or an operator to resolve.
 */
const MAX_LOCK_TAKEOVER_DEPTH = 8;
async function takeOverLockOfExitedOwner(lockPath, depth = 0, reclaimed) {
    if (depth >= MAX_LOCK_TAKEOVER_DEPTH)
        return false;
    const record = await readLockRecord(lockPath);
    if (record === undefined || !ownerExited(record))
        return false;
    const lockName = basename(lockPath);
    const claimInput = lockName === LOCK_FILE_NAME ? record : `${lockName}\n${record}`;
    const claimPath = join(dirname(lockPath), `${LOCK_FILE_NAME}.takeover-${createHash('sha256').update(claimInput).digest('hex').slice(0, 16)}`);
    if (claimPath === lockPath)
        return false;
    if (!(await acquireTakeoverClaim(claimPath, depth, reclaimed)))
        return false;
    try {
        if (await readLockRecord(lockPath) !== record || !ownerExited(record))
            return false;
        await rm(lockPath, { force: true });
        reclaimed?.add(lockPath);
        return true;
    }
    finally {
        await rm(claimPath, { force: true }).catch(() => undefined);
    }
}
async function acquireTakeoverClaim(claimPath, depth, reclaimed) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await writeFile(claimPath, `${process.pid}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            return true;
        }
        catch (error) {
            if (!(await isLockContention(error, claimPath)))
                throw error;
            // Another live contender is reclaiming this same record; let it finish.
            if (attempt > 0 || !(await takeOverLockOfExitedOwner(claimPath, depth + 1, reclaimed)))
                return false;
        }
    }
    return false;
}
async function readLockRecord(lockPath) {
    try {
        return await readFile(lockPath, 'utf8');
    }
    catch {
        return undefined;
    }
}
/** Whether the owner a `<pid>\n` record names is proven gone. */
function ownerExited(record) {
    if (!/^\d+\n$/.test(record))
        return false;
    const pid = Number(record.trim());
    if (pid === 0 || pid > 2147483647)
        return false;
    if (pid === process.pid)
        return false;
    try {
        process.kill(pid, 0);
        return false;
    }
    catch (error) {
        return isNodeError(error) && error.code === 'ESRCH';
    }
}
function isScopedClientDirectory(directory) {
    return /[\\/]servers[\\/][a-f0-9]{24}[\\/]client$/.test(directory);
}
async function hasVerifiedScopedIdentity(directory) {
    try {
        const serversPath = join(directory, 'servers');
        const metadata = await lstat(serversPath);
        if (!metadata.isDirectory() || metadata.isSymbolicLink())
            return false;
        for (const scope of await readdir(serversPath, { withFileTypes: true })) {
            if (!scope.isDirectory() || scope.isSymbolicLink() || !/^[a-f0-9]{24}$/.test(scope.name))
                continue;
            for (const role of await readdir(join(serversPath, scope.name), { withFileTypes: true })) {
                if (!role.isDirectory() || role.isSymbolicLink() || (role.name !== 'host' && role.name !== 'client'))
                    continue;
                const roleDir = join(serversPath, scope.name, role.name);
                try {
                    for (const fileName of ['device.json', 'device.key']) {
                        const fileStat = await lstat(join(roleDir, fileName));
                        if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.nlink !== 1 || fileStat.size > 16 * 1024 * 1024) {
                            throw new Error('invalid identity file metadata');
                        }
                    }
                    await assertPrivateMode(join(roleDir, 'device.key'));
                    const record = identitySchema.parse(JSON.parse(await readFile(join(roleDir, 'device.json'), 'utf8')));
                    const key = (await readFile(join(roleDir, 'device.key'), 'utf8')).trim();
                    if (generateKeyPair(fromBase64Url(key)).publicKey === record.publicKey)
                        return true;
                }
                catch {
                    continue;
                }
            }
        }
        return false;
    }
    catch {
        return false;
    }
}
/**
 * Narrow client self-heal is allowed only when the directory contains nothing
 * but uncredentialed, unpeered client identity files. Any credential record,
 * refresh lock, non-empty or unreadable trusted-peers file, symlink, or unknown
 * entry fails closed so existing authorization or recovery material is kept.
 */
async function canAutoHealClientIdentity(directory, allowServersDirectory = false) {
    try {
        const entries = await readStorageEntries(directory);
        for (const entry of entries) {
            if (isLockArtifact(entry.name))
                continue;
            const entryPath = join(directory, entry.name);
            const metadata = await lstat(entryPath);
            if (metadata.isSymbolicLink())
                return false;
            if (allowServersDirectory && entry.name === 'servers' && metadata.isDirectory())
                continue;
            if (!metadata.isFile())
                return false;
            if (entry.name === 'device.json' || entry.name === 'device.key' || isIdentityTempArtifact(entry.name)
                || isPeerTempArtifact(entry.name) || isBackupArtifact(entry.name)) {
                continue;
            }
            if (entry.name === 'trusted-peers.json') {
                const parsed = trustedPeersSchema.parse(JSON.parse(await readFile(entryPath, 'utf8')));
                if (parsed.peers.length > 0)
                    return false;
                continue;
            }
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
async function ensureDirectory(directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
}
/** Drop owned identity records in `directory`, preserving locks and sibling trees. */
async function removeIdentityRecords(directory) {
    let entries;
    try {
        entries = await readdir(directory);
    }
    catch {
        return;
    }
    await Promise.all(entries
        .filter(name => isOwnedIdentityRecord(name))
        .map(name => unlink(join(directory, name)).catch(() => undefined)));
}
function isTakeoverLockArtifact(name) {
    return /^device\.lock\.takeover-[0-9a-f]{16}$/.test(name);
}
function isLockArtifact(name) {
    return name === LOCK_FILE_NAME || isTakeoverLockArtifact(name);
}
// Operating systems write their own index or metadata files into user
// directories. They carry no Remote identity, so they are skipped instead of
// being read as an unknown scope, role or identity file. The set is closed:
// every other unexpected entry still fails the ownership check, and a
// metadata name is only skipped when it is a plain file with a single link.
const STORAGE_METADATA_ARTIFACTS = new Set(['.ds_store', 'desktop.ini', 'thumbs.db']);
function isStorageMetadataArtifact(name) {
    return STORAGE_METADATA_ARTIFACTS.has(name.toLowerCase());
}
function isBackupArtifact(name) {
    return STORAGE_CONFLICT_ENTRY_PATTERN.test(name);
}
function safeStorageEntryName(name) {
    const safe = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
    return safe === '' ? 'unnamed' : safe;
}
async function readStorageEntries(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        if (isStorageMetadataArtifact(entry.name) && entry.isFile()) {
            const metadata = await lstat(join(directory, entry.name));
            if (metadata.isFile() && metadata.nlink === 1 && metadata.size <= 16 * 1024 * 1024)
                continue;
        }
        result.push(entry);
    }
    return result;
}
async function isExitedLockArtifact(path) {
    const record = await readLockRecord(path);
    return record !== undefined && ownerExited(record);
}
// Only the exact atomic writer format for our trust record is accepted.
function isPeerTempArtifact(name) {
    return /^trusted-peers\.json\.[1-9]\d*\.[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/.test(name);
}
const OWNED_TEMP_ARTIFACT_PATTERN = /^(?:device\.json|device\.key|trusted-peers\.json|server-credentials\.json|host-pairing\.json|pairing-host-only\.json)\.([1-9]\d*)\.[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;
// Only the exact atomic writer format for our owned storage files is accepted.
function isOwnedTempArtifact(name) {
    return OWNED_TEMP_ARTIFACT_PATTERN.test(name);
}
function isStaleOwnedTempArtifact(name) {
    const match = OWNED_TEMP_ARTIFACT_PATTERN.exec(name);
    if (match === null)
        return false;
    return ownerExited(`${match[1]}\n`);
}
function isIdentityTempArtifact(name) {
    return (name.startsWith('device.json.') || name.startsWith('device.key.')) && name.endsWith('.tmp');
}
function isOwnedIdentityRecord(name) {
    if (name === 'device.json' || name === 'device.key' || name === 'trusted-peers.json' || name === 'host-pairing.json')
        return true;
    return (name.startsWith('device.json.')
        || name.startsWith('device.key.')
        || name.startsWith('trusted-peers.json.')
        || name.startsWith('host-pairing.json.')) && name.endsWith('.tmp');
}
/** Drop temp files a previous interrupted write left beside the identity pair. */
async function removeStaleTemporaries(directory) {
    let entries;
    try {
        entries = await readdir(directory);
    }
    catch {
        return;
    }
    await Promise.all(entries.map(async (name) => {
        const entryPath = join(directory, name);
        if (isIdentityTempArtifact(name) || isStaleOwnedTempArtifact(name)) {
            await unlink(entryPath).catch(() => undefined);
            return;
        }
        if (isTakeoverLockArtifact(name)) {
            await takeOverLockOfExitedOwner(entryPath).catch(() => undefined);
        }
    }));
}
//# sourceMappingURL=identity-store.js.map
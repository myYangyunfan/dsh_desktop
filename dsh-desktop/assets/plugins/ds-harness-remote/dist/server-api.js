import { platform } from 'node:os';
import { fromBase64Url, toBase64Url } from '@dsh-remote/crypto';
import { deviceTokenPairSchema } from '@dsh-remote/protocol';
import { ServerCredentialsBusyError } from './server-credentials.js';
import { normalizeServerUrl } from './config.js';
import { PLUGIN_VERSION } from './version.js';
const TERMINAL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
export class HostServerApi {
    store;
    fetchImplementation;
    role;
    baseUrl;
    hostOnly = false;
    identity;
    credentials;
    credentialsPromise;
    harnessVersion;
    lifetime = new AbortController();
    constructor(serverUrl, store, fetchImplementation = fetch, role = 'host') {
        this.store = store;
        this.fetchImplementation = fetchImplementation;
        this.role = role;
        this.baseUrl = normalizeServerUrl(serverUrl);
    }
    bindIdentity(identity) { this.identity = identity; }
    setHarnessVersion(version) { this.harnessVersion = version; }
    /** End this runtime's HTTP requests, including authentication and response bodies. */
    close() {
        this.lifetime.abort(new ServerApiError('CONNECTION_CLOSED', 'The Server API has been closed.', false));
    }
    pairingHostOnly() { return this.hostOnly; }
    async loadStoredPolicy() {
        this.hostOnly = this.role === 'host' && (await this.store.pairingHostOnly() || (await this.store.load(this.baseUrl, this.requireIdentity().deviceId))?.pairingRestricted === true);
    }
    async adoptPairing(result) {
        const identity = this.requireIdentity();
        if (this.role !== 'host' || result.device.role !== 'host' || result.device.deviceId !== identity.deviceId || result.device.identityKey !== identity.publicKey)
            throw new ServerApiError('PAIRING_IDENTITY_INVALID', 'Pairing identity mismatch.', false);
        if (result.pairingRestricted) {
            if (!result.inboundOnly)
                throw new ServerApiError('DEVICE_SCOPE_REQUIRED', 'Paired Host must remain inbound only.', false);
            this.hostOnly = true;
            await this.store.restrictPairingHostOnly();
        }
        this.credentials = await this.withRefreshLock(async () => {
            const existing = await this.store.load(this.baseUrl, identity.deviceId);
            if (existing?.account !== undefined && existing.account !== result.account)
                throw new ServerApiError('PAIRING_ACCOUNT_CONFLICT', 'Pairing cannot replace the current account.', false);
            if (existing !== undefined && existing.refreshTokenExpiresAt > Date.now() + 30_000)
                return existing;
            return this.store.save({ serverUrl: this.baseUrl, deviceId: identity.deviceId,
                authorizationMethod: 'device_pairing', account: result.account, accountKind: result.accountKind,
                pairingRestricted: result.pairingRestricted, inboundOnly: result.inboundOnly, ...validateTokens(result.tokens) });
        });
    }
    currentAuthorization() {
        if (this.credentials === undefined)
            return undefined;
        return {
            method: this.credentials.authorizationMethod,
            ...(this.credentials.account === undefined ? {} : { account: this.credentials.account }),
        };
    }
    /** Check the persisted device credential without issuing or refreshing one. */
    async hasStoredAuthorization() {
        const identity = this.requireIdentity();
        return await this.store.load(this.baseUrl, identity.deviceId) !== undefined;
    }
    async clearAuthorization() {
        this.credentials = undefined;
        this.credentialsPromise = undefined;
        await this.store.clear();
    }
    async revokeCurrentDevice() {
        const identity = this.requireIdentity();
        if (await this.store.load(this.baseUrl, identity.deviceId) === undefined) {
            await this.clearAuthorization();
            return;
        }
        try {
            await this.request('/api/v1/devices/self', { method: 'DELETE' });
        }
        finally {
            await this.clearAuthorization();
        }
    }
    async authorizeWithAccount(identity, email, password, recoverIdentity) {
        this.bindIdentity(identity);
        const account = email.trim();
        if (account.length === 0 || password.length === 0) {
            throw new ServerApiError('INVALID_MESSAGE', 'Email and password are required.', false);
        }
        const login = validateWebLogin(await this.publicRequest('/api/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: account, password }),
        }));
        const authorization = {
            accountToken: login.token,
            account: login.account,
            authorizationMethod: 'account',
        };
        try {
            await this.register(identity, authorization);
        }
        catch (error) {
            // A Server-side device removal revokes the old identity permanently.
            // Account login is the explicit re-authorization boundary, so callers
            // may rotate the local identity and retry without requiring a separate
            // settings logout first.
            if (!(error instanceof ServerApiError) || error.code !== 'DEVICE_REVOKED' || recoverIdentity === undefined)
                throw error;
            const nextIdentity = await recoverIdentity();
            this.bindIdentity(nextIdentity);
            await this.register(nextIdentity, authorization);
        }
        return {
            method: 'account',
            account: login.account,
            expiresAt: login.expiresAt,
            isAdmin: login.isAdmin,
        };
    }
    async oauthProviders() {
        let body;
        try {
            body = await this.publicRequest('/api/v1/auth/oauth/providers', { method: 'GET' });
        }
        catch (error) {
            if (!(error instanceof ServerApiError) || error.status !== 404)
                throw error;
            // Older servers expose only individual status endpoints. Do not hide
            // network errors or malformed discovery responses behind this fallback.
            const legacy = [
                { id: 'zhihu', displayName: 'Zhihu', startUrl: '/api/v1/auth/oauth/start', statusUrl: '/api/v1/auth/oauth/status' },
                { id: 'github', displayName: 'GitHub', startUrl: '/api/v1/auth/oauth/github/start', statusUrl: '/api/v1/auth/oauth/github/status' },
            ];
            const items = await Promise.all(legacy.map(async ({ statusUrl, ...provider }) => {
                try {
                    const status = requireRecord(await this.publicRequest(statusUrl, { method: 'GET' }), 'OAuth status');
                    if (typeof status.configured !== 'boolean')
                        throw invalidOAuthProviders();
                    return status.configured ? [{ ...provider, qrStartUrl: `/api/v1/auth/oauth/qr/start?provider=${provider.id}` }] : [];
                }
                catch (reason) {
                    if (reason instanceof ServerApiError && reason.status === 404)
                        return [];
                    throw reason;
                }
            }));
            return items.flat();
        }
        const value = requireRecord(body, 'OAuth providers');
        if (!Array.isArray(value.items))
            throw invalidOAuthProviders();
        const ids = new Set();
        const providers = value.items.map(item => {
            const provider = requireRecord(item, 'OAuth provider');
            if (typeof provider.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(provider.id)
                || ids.has(provider.id)
                || typeof provider.displayName !== 'string' || !provider.displayName.trim()
                || provider.displayName.length > 128 || TERMINAL_CONTROL_CHARACTERS.test(provider.displayName)
                || !isOAuthEntryPath(provider.startUrl)
                || (provider.qrStartUrl != null && !isOAuthEntryPath(provider.qrStartUrl)))
                throw invalidOAuthProviders();
            ids.add(provider.id);
            return { id: provider.id, displayName: provider.displayName, startUrl: provider.startUrl,
                ...(typeof provider.qrStartUrl === 'string' ? { qrStartUrl: provider.qrStartUrl } : {}) };
        });
        const capabilities = value.capabilities;
        if (typeof capabilities === 'object' && capabilities !== null
            && capabilities.devicePairing === 'dsh-pairing-v1') {
            providers.push({ id: 'dsh-go-pairing-v1', displayName: 'DSH-Go', startUrl: '/api/v1/device-pairing', devicePairing: true });
        }
        return providers;
    }
    async startOAuthQrLogin(provider = 'zhihu') {
        const entry = (await this.oauthProviders()).find(item => item.id === provider);
        if (entry?.qrStartUrl == null) {
            throw new ServerApiError('OAUTH_PROVIDER_UNAVAILABLE', 'This OAuth provider is unavailable for QR login.', false);
        }
        const value = requireRecord(await this.publicRequest(entry.qrStartUrl, {
            method: 'POST',
            body: '{}',
        }), 'QR login');
        const scanUrl = normalizeOAuthScanUrl(value.scanUrl, this.baseUrl);
        if (typeof value.qrId !== 'string' || value.qrId.length < 20
            || scanUrl === undefined
            || !Number.isSafeInteger(value.expiresIn)
            || (provider !== 'zhihu' && value.provider !== provider)
            || (value.provider !== undefined && value.provider !== provider)) {
            throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid QR login session.', false);
        }
        return { qrId: value.qrId, scanUrl, expiresIn: value.expiresIn };
    }
    async pollOAuthQrLogin(identity, qrId, recoverIdentity) {
        this.bindIdentity(identity);
        const value = requireRecord(await this.publicRequest(`/api/v1/auth/oauth/qr/${encodeURIComponent(qrId)}`, { method: 'GET' }), 'QR login status');
        if (value.status === 'pending' || value.status === 'expired')
            return { status: value.status };
        if (value.status !== 'complete' || typeof value.token !== 'string' || value.token.length < 16) {
            throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid QR login status.', false);
        }
        const account = requireRecord(await this.publicRequest('/api/v1/auth/me', { method: 'GET' }, value.token), 'account profile');
        if (typeof account.account !== 'string' || account.account.length === 0 || typeof account.isAdmin !== 'boolean') {
            throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid account profile.', false);
        }
        const authorization = {
            accountToken: value.token,
            account: account.account,
            authorizationMethod: 'account',
        };
        try {
            await this.register(identity, authorization);
        }
        catch (error) {
            if (!(error instanceof ServerApiError) || error.code !== 'DEVICE_REVOKED' || recoverIdentity === undefined)
                throw error;
            const nextIdentity = await recoverIdentity();
            this.bindIdentity(nextIdentity);
            await this.register(nextIdentity, authorization);
        }
        return {
            status: 'complete',
            authorization: { method: 'account', account: account.account, isAdmin: account.isAdmin },
        };
    }
    async authorizeHostWithCode(identity, code) {
        if (this.role !== 'host') {
            throw new ServerApiError('METHOD_NOT_ALLOWED', 'Host registration codes can only authorize a Host device.', false);
        }
        const registrationCode = code.trim().toUpperCase();
        if (registrationCode.length === 0) {
            throw new ServerApiError('INVALID_MESSAGE', 'A Host registration code is required.', false);
        }
        this.bindIdentity(identity);
        const tokens = await this.publicRequest('/api/v1/devices/register-with-code', {
            method: 'POST',
            body: JSON.stringify({ v: 1, code: registrationCode, device: this.deviceDescriptor(identity) }),
        });
        this.credentials = await this.saveTokens(identity, validateTokens(tokens), {
            authorizationMethod: 'host_registration_code',
        });
        return { method: 'host_registration_code' };
    }
    async authorizeOwnedRole(identity, authorizingAccessToken, account) {
        this.bindIdentity(identity);
        const tokens = await this.publicRequest('/api/v1/devices/register-owned-role', {
            method: 'POST',
            body: JSON.stringify({ v: 1, device: this.deviceDescriptor(identity) }),
        }, authorizingAccessToken);
        this.credentials = await this.saveTokens(identity, validateTokens(tokens), {
            authorizationMethod: 'owned_device',
            ...(account === undefined ? {} : { account }),
        });
        return {
            method: 'owned_device',
            ...(account === undefined ? {} : { account }),
        };
    }
    async authenticate(identity = this.requireIdentity()) {
        this.bindIdentity(identity);
        if (this.credentials !== undefined && this.credentials.accessTokenExpiresAt > Date.now() + 30_000) {
            return this.credentials;
        }
        this.credentialsPromise ??= this.loadOrIssue(identity).finally(() => { this.credentialsPromise = undefined; });
        this.credentials = await this.credentialsPromise;
        return this.credentials;
    }
    async refreshCredentials(rejectedAccessToken = this.credentials?.accessToken) {
        const identity = this.requireIdentity();
        this.credentials = await this.withRefreshLock(async () => {
            // Another process may have rotated the token while we waited for the lock.
            const stored = await this.store.load(this.baseUrl, identity.deviceId);
            if (stored === undefined || stored.refreshTokenExpiresAt <= Date.now()) {
                // A rejected Client read must not implicitly register a signed-out device.
                if (this.role === 'client')
                    throw new ServerApiError('ACCOUNT_AUTH_REQUIRED', 'Client sign-in is required.', false);
                return this.register(identity);
            }
            if (stored.accessToken !== rejectedAccessToken && stored.accessTokenExpiresAt > Date.now() + 30_000) {
                return stored;
            }
            return this.rotateCredentials(identity, stored);
        });
        return this.credentials;
    }
    async withRefreshLock(operation) {
        try {
            return await this.store.withRefreshLock(operation);
        }
        catch (error) {
            if (error instanceof ServerCredentialsBusyError) {
                throw new ServerApiError(error.code, error.message, false);
            }
            throw error;
        }
    }
    async rotateCredentials(identity, stored) {
        let tokens;
        try {
            tokens = await this.publicRequest('/api/v1/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ deviceId: identity.deviceId, refreshToken: stored.refreshToken }),
            });
        }
        catch (error) {
            if (error instanceof ServerApiError) {
                // A delayed rejection must not discard credentials another writer saved.
                if (error.code === 'AUTH_INVALID') {
                    const latest = await this.store.load(this.baseUrl, identity.deviceId);
                    if (latest !== undefined && latest.refreshToken !== stored.refreshToken &&
                        latest.refreshTokenExpiresAt > Date.now() && latest.accessTokenExpiresAt > Date.now() + 30_000) {
                        return latest;
                    }
                }
                throw new ServerApiError(error.code, error.message, error.retryable, error.status, 'credential_refresh', error.reason);
            }
            throw error;
        }
        return this.store.save({
            ...stored,
            ...validateTokens(tokens),
        });
    }
    async listDevices(signal) {
        const devices = [];
        for await (const page of this.devicePages(signal))
            devices.push(...page);
        return devices;
    }
    async *devicePages(signal) {
        let cursor;
        const cursors = new Set();
        const ids = new Set();
        do {
            signal?.throwIfAborted();
            const query = new URLSearchParams({ limit: '50' });
            if (cursor !== undefined)
                query.set('cursor', cursor);
            const result = await this.request(`/api/v1/devices?${query}`, { signal });
            if (!Array.isArray(result.items))
                throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid device list.', false);
            const page = result.items.map(parseHostDevice);
            const next = result.nextCursor;
            if (next !== undefined && next !== null
                && (typeof next !== 'string' || next.length === 0 || next.length > 512 || cursors.has(next) || page.length === 0)) {
                throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid device list cursor.', false);
            }
            for (const device of page) {
                if (ids.has(device.deviceId))
                    throw new ServerApiError('INVALID_MESSAGE', 'The Server returned a duplicate device.', false);
                ids.add(device.deviceId);
            }
            cursor = typeof next === 'string' ? next : undefined;
            if (cursor !== undefined)
                cursors.add(cursor);
            // Older Servers may ignore limit and return all devices with no cursor.
            yield page;
        } while (cursor !== undefined);
    }
    async deviceFor(peerDeviceId, signal) {
        const result = await this.request(`/api/v1/devices/${encodeURIComponent(peerDeviceId)}`, { signal });
        return parseAuthorizedPeer(result);
    }
    async turnCredentials(connectionId) {
        const result = await this.request(`/api/v1/turn/credentials?connection_id=${encodeURIComponent(connectionId)}`);
        if (!Array.isArray(result.iceServers))
            return [];
        return result.iceServers.map(parseIceServer);
    }
    async presenceFor(deviceId, signal) {
        const result = await this.request(`/api/v1/devices/${encodeURIComponent(deviceId)}/presence`, { signal });
        if (typeof result.online !== 'boolean'
            || (result.lastSeenAt !== null && result.lastSeenAt !== undefined && !Number.isSafeInteger(result.lastSeenAt))) {
            throw new ServerApiError('INVALID_MESSAGE', 'The Server returned invalid device presence.', false);
        }
        return { online: result.online, ...(typeof result.lastSeenAt === 'number' ? { lastSeenAt: result.lastSeenAt } : {}) };
    }
    async loadOrIssue(identity) {
        return this.withRefreshLock(async () => {
            const stored = await this.store.load(this.baseUrl, identity.deviceId);
            if (stored === undefined || stored.refreshTokenExpiresAt <= Date.now() + 30_000) {
                return this.register(identity);
            }
            if (stored.accessTokenExpiresAt > Date.now() + 30_000)
                return stored;
            return this.rotateCredentials(identity, stored);
        });
    }
    async register(identity, authorization) {
        const tokens = await this.publicRequest('/api/v1/devices/register', {
            method: 'POST',
            body: JSON.stringify({
                v: 1,
                device: this.deviceDescriptor(identity),
            }),
        }, authorization?.accountToken);
        this.credentials = await this.saveTokens(identity, validateTokens(tokens), {
            authorizationMethod: authorization?.authorizationMethod ?? 'account',
            ...(authorization?.account === undefined ? {} : { account: authorization.account }),
        });
        return this.credentials;
    }
    deviceDescriptor(identity) {
        return {
            deviceId: identity.deviceId,
            name: identity.name,
            role: this.role,
            platform: platform(),
            identityKey: identity.publicKey,
            clientVersion: PLUGIN_VERSION,
            ...(this.role === 'host' && this.harnessVersion !== undefined ? { harnessVersion: this.harnessVersion } : {}),
        };
    }
    saveTokens(identity, tokens, authorization) {
        return this.store.save({
            serverUrl: this.baseUrl,
            deviceId: identity.deviceId,
            authorizationMethod: authorization.authorizationMethod,
            ...(authorization.account === undefined ? {} : { account: authorization.account }),
            ...tokens,
        });
    }
    async request(path, init = {}) {
        const credentials = await this.authenticate();
        try {
            return await this.publicRequest(path, init, credentials.accessToken);
        }
        catch (error) {
            // The Server may reject a bearer before its locally cached expiry.
            // Only retry an explicitly rejected, read-only Client request, once.
            if (this.role !== 'client' || this.identity?.deviceId !== credentials.deviceId || (init.method ?? 'GET') !== 'GET'
                || !(error instanceof ServerApiError) || error.status !== 401
                || (error.code !== 'AUTH_INVALID' && error.code !== 'TOKEN_EXPIRED'))
                throw error;
            init.signal?.throwIfAborted();
            const next = await this.refreshCredentials(credentials.accessToken);
            if (next.account !== credentials.account || this.identity?.deviceId !== credentials.deviceId)
                throw error;
            return this.publicRequest(path, init, next.accessToken);
        }
    }
    async publicRequest(path, init, accessToken) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const signal = AbortSignal.any([
            this.lifetime.signal,
            controller.signal,
            ...(init.signal == null ? [] : [init.signal]),
        ]);
        try {
            signal.throwIfAborted();
            const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
                ...init,
                signal,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
                    ...init.headers,
                },
            });
            const body = await parseBody(response);
            signal.throwIfAborted();
            if (!response.ok) {
                const envelope = isErrorEnvelope(body) ? body : undefined;
                // A gateway can challenge requests during startup. Only a protocol
                // error envelope establishes that the device credentials were rejected.
                if ((response.status === 401 || response.status === 403) && envelope === undefined) {
                    throw new ServerApiError('CONNECTION_FAILED', 'The Server returned an invalid authorization response.', true, response.status, undefined, 'invalid_error_envelope');
                }
                throw new ServerApiError(responseErrorCode(response.status, envelope?.error.code), envelope?.error.message ?? 'The Server rejected the request.', envelope?.error.retryable === true || response.status >= 500 || response.status === 429, response.status, undefined, 'http_error');
            }
            return body;
        }
        catch (error) {
            if (this.lifetime.signal.aborted)
                throw this.lifetime.signal.reason;
            if (error instanceof ServerApiError)
                throw error;
            throw new ServerApiError('CONNECTION_FAILED', 'Server request failed.', true, undefined, undefined, controller.signal.aborted ? 'timeout' : 'network_error');
        }
        finally {
            clearTimeout(timer);
        }
    }
    requireIdentity() {
        if (this.identity === undefined)
            throw new ServerApiError('IDENTITY_INVALID', 'The device identity is not loaded.', false);
        return this.identity;
    }
}
function isOAuthEntryPath(value) {
    return typeof value === 'string' && /^\/api\/v1\/auth\/[^\s\\#]*$/.test(value)
        && !TERMINAL_CONTROL_CHARACTERS.test(value)
        && !value.split('?')[0]?.split('/').some(segment => segment === '.' || segment === '..' || /%/u.test(segment));
}
function invalidOAuthProviders() {
    return new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid OAuth provider list.', false);
}
function normalizeOAuthScanUrl(value, baseUrl) {
    if (typeof value !== 'string' || TERMINAL_CONTROL_CHARACTERS.test(value))
        return undefined;
    try {
        const normalized = new URL(value).href;
        return normalized.startsWith(`${baseUrl}/`) ? normalized : undefined;
    }
    catch {
        return undefined;
    }
}
export class ClientServerApi extends HostServerApi {
    constructor(serverUrl, store, fetchImplementation = fetch) {
        super(serverUrl, store, fetchImplementation, 'client');
    }
}
export class ServerApiError extends Error {
    code;
    retryable;
    status;
    phase;
    reason;
    constructor(code, message, retryable, status, phase, reason) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.status = status;
        this.phase = phase;
        this.reason = reason;
    }
}
function validateTokens(value) {
    const parsed = deviceTokenPairSchema.safeParse(value);
    if (!parsed.success) {
        throw new ServerApiError('INVALID_MESSAGE', 'The Server returned invalid device credentials.', false);
    }
    return parsed.data;
}
function validateWebLogin(value) {
    const item = requireRecord(value, 'account login');
    if (typeof item.token !== 'string' || item.token.length < 16
        || !Number.isSafeInteger(item.expiresAt)
        || typeof item.account !== 'string' || item.account.length === 0 || item.account.length > 254
        || typeof item.isAdmin !== 'boolean') {
        throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid account session.', false);
    }
    return {
        token: item.token,
        expiresAt: item.expiresAt,
        account: item.account,
        profile: item.profile,
        isAdmin: item.isAdmin,
    };
}
function isErrorEnvelope(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const error = value.error;
    if (typeof error !== 'object' || error === null || Array.isArray(error))
        return false;
    const fields = error;
    return typeof fields.code === 'string' && fields.code.length > 0
        && typeof fields.message === 'string' && typeof fields.retryable === 'boolean';
}
async function parseBody(response) {
    const text = await response.text();
    if (text.length === 0)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        const unstructuredAuth = response.status === 401 || response.status === 403;
        throw new ServerApiError(unstructuredAuth ? 'CONNECTION_FAILED' : response.ok ? 'INVALID_MESSAGE' : responseErrorCode(response.status, undefined), 'The Server returned invalid JSON.', unstructuredAuth || response.ok || response.status >= 500 || response.status === 429, response.status, undefined, 'invalid_json');
    }
}
function responseErrorCode(status, serverCode) {
    // Only a specific authorization response may change the local login state.
    // A proxy error or an unclassified rejection must preserve stored credentials.
    if (status >= 500)
        return 'CONNECTION_FAILED';
    if (status === 429)
        return 'RATE_LIMITED';
    if ((status === 401 || status === 403) && typeof serverCode === 'string')
        return serverCode;
    if (status === 401 || status === 403)
        return 'REQUEST_REJECTED';
    if (typeof serverCode === 'string' && !AUTHORIZATION_ERROR_CODES.has(serverCode))
        return serverCode;
    if (status === 404)
        return 'DEVICE_NOT_FOUND';
    return 'INVALID_MESSAGE';
}
const AUTHORIZATION_ERROR_CODES = new Set([
    'ACCOUNT_AUTH_REQUIRED',
    'AUTH_INVALID',
    'AUTH_REQUIRED',
    'TOKEN_EXPIRED',
    'DEVICE_REVOKED',
    'DEVICE_OWNERSHIP_REQUIRED',
]);
function parseHostDevice(value) {
    const item = requireRecord(value, 'host device');
    if (item.role !== 'host' || typeof item.deviceId !== 'string' || typeof item.name !== 'string'
        || typeof item.platform !== 'string' || typeof item.membershipId !== 'string' || item.membershipId.length === 0) {
        throw new ServerApiError('INVALID_MESSAGE', 'The Server returned invalid host device data.', false);
    }
    return {
        deviceId: item.deviceId,
        name: item.name,
        platform: item.platform,
        membershipId: item.membershipId,
        ...(typeof item.online === 'boolean' ? { online: item.online } : {}),
        ...(typeof item.lastSeenAt === 'number' && Number.isSafeInteger(item.lastSeenAt) ? { lastSeenAt: item.lastSeenAt } : {}),
        ...(typeof item.clientVersion === 'string' ? { clientVersion: item.clientVersion } : {}),
        ...(typeof item.harnessVersion === 'string' ? { harnessVersion: item.harnessVersion } : {}),
    };
}
function parseAuthorizedPeer(value) {
    const item = requireRecord(value, 'authorized peer');
    if ((item.role !== 'host' && item.role !== 'client')
        || typeof item.deviceId !== 'string' || item.deviceId.length === 0
        || typeof item.name !== 'string' || item.name.length === 0
        || typeof item.platform !== 'string' || item.platform.length === 0
        || typeof item.identityKey !== 'string' || !isIdentityKey(item.identityKey)
        || typeof item.membershipId !== 'string' || item.membershipId.length === 0) {
        throw new ServerApiError('INVALID_MESSAGE', 'The Server returned invalid authorized peer data.', false);
    }
    return {
        deviceId: item.deviceId,
        name: item.name,
        role: item.role,
        platform: item.platform,
        identityKey: item.identityKey,
        membershipId: item.membershipId,
        ...(typeof item.online === 'boolean' ? { online: item.online } : {}),
        ...(typeof item.lastSeenAt === 'number' && Number.isSafeInteger(item.lastSeenAt) ? { lastSeenAt: item.lastSeenAt } : {}),
    };
}
function parseIceServer(value) {
    const item = requireRecord(value, 'ICE server');
    const urls = item.urls;
    if (typeof urls !== 'string' && !(Array.isArray(urls) && urls.every(url => typeof url === 'string'))) {
        throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid ICE server.', false);
    }
    return {
        urls,
        ...(typeof item.username === 'string' ? { username: item.username } : {}),
        ...(typeof item.credential === 'string' ? { credential: item.credential } : {}),
    };
}
function isIdentityKey(value) {
    try {
        const decoded = fromBase64Url(value);
        return decoded.length === 32 && toBase64Url(decoded) === value;
    }
    catch {
        return false;
    }
}
function requireRecord(value, name) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ServerApiError('INVALID_MESSAGE', `The Server returned invalid ${name} data.`, false);
    }
    return value;
}
//# sourceMappingURL=server-api.js.map
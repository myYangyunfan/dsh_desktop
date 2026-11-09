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
        return value.items.map(item => {
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
            if (stored === undefined || stored.refreshTokenExpiresAt <= Date.now())
                return this.register(identity);
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
                throw new ServerApiError(error.code, error.message, error.retryable, error.status, 'credential_refresh');
            }
            throw error;
        }
        return this.store.save({
            serverUrl: this.baseUrl,
            deviceId: identity.deviceId,
            authorizationMethod: stored.authorizationMethod,
            ...(stored.account === undefined ? {} : { account: stored.account }),
            ...validateTokens(tokens),
        });
    }
    async listDevices() {
        const result = await this.request('/api/v1/devices');
        if (!Array.isArray(result.items))
            throw new ServerApiError('INVALID_MESSAGE', 'The Server returned an invalid device list.', false);
        return result.items.map(parseHostDevice);
    }
    async deviceFor(peerDeviceId) {
        const result = await this.request(`/api/v1/devices/${encodeURIComponent(peerDeviceId)}`);
        return parseAuthorizedPeer(result);
    }
    async turnCredentials(connectionId) {
        const result = await this.request(`/api/v1/turn/credentials?connection_id=${encodeURIComponent(connectionId)}`);
        if (!Array.isArray(result.iceServers))
            return [];
        return result.iceServers.map(parseIceServer);
    }
    async presenceFor(deviceId) {
        const result = await this.request(`/api/v1/devices/${encodeURIComponent(deviceId)}/presence`);
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
        return this.publicRequest(path, init, credentials.accessToken);
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
                const envelope = (body ?? {});
                throw new ServerApiError(typeof envelope.error?.code === 'string' ? envelope.error.code : mapStatus(response.status), typeof envelope.error?.message === 'string' ? envelope.error.message : 'The Server rejected the request.', envelope.error?.retryable === true || response.status >= 500, response.status);
            }
            return body;
        }
        catch (error) {
            if (this.lifetime.signal.aborted)
                throw this.lifetime.signal.reason;
            if (error instanceof ServerApiError)
                throw error;
            throw new ServerApiError('CONNECTION_FAILED', error instanceof Error ? error.message : 'Server request failed.', true);
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
    constructor(code, message, retryable, status, phase) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.status = status;
        this.phase = phase;
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
async function parseBody(response) {
    const text = await response.text();
    if (text.length === 0)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        throw new ServerApiError('INVALID_MESSAGE', 'The Server returned invalid JSON.', false, response.status);
    }
}
function mapStatus(status) {
    if (status === 401)
        return 'AUTH_INVALID';
    if (status === 403)
        return 'AUTH_REQUIRED';
    if (status === 404)
        return 'DEVICE_NOT_FOUND';
    if (status === 429)
        return 'RATE_LIMITED';
    return status >= 500 ? 'CONNECTION_FAILED' : 'INVALID_MESSAGE';
}
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
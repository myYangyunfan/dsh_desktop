import { stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_REMOTE_SERVER_URL, normalizeServerUrl } from './config.js';
import { IdentityInvalidError, IdentityStore, prepareDefaultIdentityDirectory, resetDefaultIdentityRoles, serverStorageDirectory, } from './identity-store.js';
import { HostServerApi, ServerApiError, } from './server-api.js';
import { ServerCredentialStore, ServerCredentialsInvalidError, } from './server-credentials.js';
const QR_POLL_INTERVAL_MS = 2_000;
const TERMINAL_QR_MARGIN = 4;
/** Headless account bootstrap. Configuration remains owned by the DSH profile. */
export async function runCli(args = process.argv.slice(2), dependencies = {}) {
    const runtime = resolveDependencies(dependencies);
    const [command, ...rest] = args;
    try {
        if (command === 'login')
            return await login(rest, runtime);
        if (command === 'register')
            return await register(rest, runtime);
        if (command === 'status')
            return await status(rest, runtime);
        if (command === 'logout')
            return await logout(rest, runtime);
        if (command === 'reset-identity')
            return await resetIdentity(rest, runtime);
        if (command === 'help' || command === '--help' || command === '-h' || command === undefined) {
            write(runtime.stdout, helpText());
            return 0;
        }
        throw new CliUsageError(`Unknown command: ${command}`);
    }
    catch (error) {
        write(runtime.stderr, `${cliErrorMessage(error)}\n`);
        if (error instanceof CliUsageError)
            write(runtime.stderr, `\n${helpText()}`);
        return error instanceof CliUsageError ? 2 : 1;
    }
}
async function register(args, runtime) {
    if (args.length !== 1 || args[0] === undefined || args[0].trim() === '') {
        throw new CliUsageError('Usage: ds-harness-remote register <server-token>');
    }
    const context = await hostContext(runtime);
    await context.api.authorizeHostWithCode(context.identity, args[0]);
    write(runtime.stdout, 'Remote Host registration complete. Restart the Harness instance to bring the Remote Host online.\n');
    return 0;
}
async function login(args, runtime) {
    if (args.length > 1)
        throw new CliUsageError('Usage: ds-harness-remote login [provider|list]');
    const context = await hostContext(runtime);
    const providers = (await context.api.oauthProviders()).filter(item => item.qrStartUrl != null);
    if (args[0] === 'list') {
        write(runtime.stdout, providers.length === 0 ? 'No QR sign-in providers are available.\n'
            : providers.map(item => `${item.displayName}: ds-harness-remote login ${item.id}\n`).join(''));
        return 0;
    }
    const selected = args[0] === undefined
        ? providers.find(item => item.id === 'zhihu') ?? providers[0]
        : providers.find(item => item.id === args[0]);
    if (selected === undefined)
        throw new CliUsageError('OAuth provider unavailable. Run "ds-harness-remote login list" to see available providers.');
    const provider = selected.id;
    const session = await context.api.startOAuthQrLogin(provider);
    const qr = await runtime.renderQr(session.scanUrl);
    write(runtime.stdout, `Using ${selected.displayName} QR login. Run "ds-harness-remote login list" for available providers.\n`);
    write(runtime.stdout, 'Scan this QR code to authorize this Host:\n\n');
    write(runtime.stdout, `${qr.trimEnd()}\n`);
    write(runtime.stdout, `Authorization URL: ${terminalLink(session.scanUrl, runtime.stdout)}\n\nWaiting for authorization...\n`);
    const deadline = runtime.now() + session.expiresIn * 1_000;
    let identity = context.identity;
    while (runtime.now() < deadline) {
        let result;
        try {
            result = await context.api.pollOAuthQrLogin(identity, session.qrId, async () => {
                identity = await context.identities.reset(context.deviceName);
                return identity;
            });
        }
        catch (error) {
            if (!(error instanceof ServerApiError) || !error.retryable)
                throw error;
            await runtime.wait(Math.min(QR_POLL_INTERVAL_MS, Math.max(1, deadline - runtime.now())));
            continue;
        }
        if (result.status === 'complete') {
            write(runtime.stdout, `${authorizedMessage(result.authorization)} Restart the Harness instance to bring the Remote Host online.\n`);
            return 0;
        }
        if (result.status === 'expired')
            break;
        await runtime.wait(Math.min(QR_POLL_INTERVAL_MS, Math.max(1, deadline - runtime.now())));
    }
    write(runtime.stderr, 'The QR login expired. Run the login command again to generate a new code.\n');
    return 1;
}
async function status(args, runtime) {
    if (args.length !== 0)
        throw new CliUsageError('Usage: ds-harness-remote status');
    const serverUrl = selectedServer();
    const root = await prepareDefaultIdentityDirectory({ env: runtime.env });
    const directory = serverStorageDirectory(root, serverUrl, 'host');
    const lines = [
        'Remote Host status',
        `Server: ${serverUrl}`,
        'Host control: enabled',
    ];
    if (!await exists(join(directory, 'device.json'))) {
        lines.push('Device: not initialized', 'Authorization: logged out', 'Credential: unavailable');
        write(runtime.stdout, `${lines.join('\n')}\n\nRun "ds-harness-remote login" to authorize this Host.\n`);
        return 0;
    }
    const identities = runtime.createIdentityStore({ directory, env: runtime.env, role: 'host' });
    const deviceName = runtime.env.DSH_REMOTE_DEVICE_NAME ?? hostname();
    const identity = await identities.loadOrCreate(deviceName);
    const store = new ServerCredentialStore(directory);
    const stored = await store.load(serverUrl, identity.deviceId);
    lines.push(`Device: ${identity.name} (${identity.deviceId})`);
    if (stored === undefined) {
        lines.push('Authorization: logged out', 'Credential: unavailable');
        write(runtime.stdout, `${lines.join('\n')}\n\nRun "ds-harness-remote login" to authorize this Host.\n`);
        return 0;
    }
    lines.push(`Authorization: logged in (${authorizationLabel(stored.authorizationMethod)})`);
    if (stored.account !== undefined)
        lines.push(`Account: ${stored.account}`);
    const api = runtime.createHostApi(serverUrl, store);
    api.bindIdentity(identity);
    try {
        await api.authenticate(identity);
        lines.push('Credential: ready');
        lines.push('Presence: published while the Harness process is running');
        write(runtime.stdout, `${lines.join('\n')}\n`);
        return 0;
    }
    catch (error) {
        lines.push(`Credential: unavailable (${statusErrorCode(error)})`);
        write(runtime.stdout, `${lines.join('\n')}\n`);
        return 1;
    }
}
async function logout(args, runtime) {
    if (args.length !== 0)
        throw new CliUsageError('Usage: ds-harness-remote logout');
    const serverUrl = selectedServer();
    const deviceName = runtime.env.DSH_REMOTE_DEVICE_NAME ?? hostname();
    let root;
    try {
        root = await prepareDefaultIdentityDirectory({ env: runtime.env });
    }
    catch (error) {
        if (error instanceof IdentityInvalidError && error.code === 'IDENTITY_INVALID') {
            await resetDefaultIdentityRoles(['host'], serverUrl, deviceName, {
                env: runtime.env,
                createIdentityStore: runtime.createIdentityStore,
            });
            write(runtime.stdout, 'Remote Host logged out and its local device identity was rotated. Restart the Harness instance.\n');
            return 0;
        }
        throw error;
    }
    const directory = serverStorageDirectory(root, serverUrl, 'host');
    const [hasDevice, hasKey, hasCredentials] = await Promise.all([
        exists(join(directory, 'device.json')),
        exists(join(directory, 'device.key')),
        exists(join(directory, 'server-credentials.json')),
    ]);
    if (!hasDevice && !hasKey && !hasCredentials) {
        await new ServerCredentialStore(directory).clear();
        write(runtime.stdout, 'This Host is already logged out.\n');
        return 0;
    }
    const identities = runtime.createIdentityStore({ directory, env: runtime.env, role: 'host' });
    let revokeFailure;
    try {
        const identity = await identities.loadOrCreate(deviceName);
        const api = runtime.createHostApi(serverUrl, new ServerCredentialStore(directory));
        api.bindIdentity(identity);
        await api.revokeCurrentDevice();
    }
    catch (error) {
        revokeFailure = error;
    }
    await identities.reset(deviceName);
    await new ServerCredentialStore(directory).clear();
    if (revokeFailure !== undefined
        && !(revokeFailure instanceof IdentityInvalidError)
        && !(revokeFailure instanceof ServerCredentialsInvalidError)) {
        throw new Error(`Local Host credentials were cleared, but Server revocation failed: ${cliErrorMessage(revokeFailure)}`);
    }
    write(runtime.stdout, 'Remote Host logged out and its local device identity was rotated. Restart the Harness instance.\n');
    return 0;
}
async function resetIdentity(args, runtime) {
    if (args.length > 1) {
        throw new CliUsageError('Usage: ds-harness-remote reset-identity [host|client|all]');
    }
    const roleArg = args[0];
    if (roleArg !== undefined && roleArg !== 'host' && roleArg !== 'client' && roleArg !== 'all') {
        throw new CliUsageError('Usage: ds-harness-remote reset-identity [host|client|all]');
    }
    const serverUrl = selectedServer();
    const deviceName = runtime.env.DSH_REMOTE_DEVICE_NAME ?? hostname();
    const roles = roleArg === 'client' ? ['client'] : roleArg === 'host' ? ['host'] : ['host', 'client'];
    await resetDefaultIdentityRoles(roles, serverUrl, deviceName, {
        env: runtime.env,
        createIdentityStore: runtime.createIdentityStore,
    });
    for (const role of roles) {
        write(runtime.stdout, `Remote ${role} identity was reset and a new key pair was created.\n`);
    }
    write(runtime.stdout, 'Restart the Harness instance to use the fresh identity.\n');
    return 0;
}
async function hostContext(runtime) {
    const serverUrl = selectedServer();
    const root = await prepareDefaultIdentityDirectory({ env: runtime.env });
    const directory = serverStorageDirectory(root, serverUrl, 'host');
    const deviceName = runtime.env.DSH_REMOTE_DEVICE_NAME ?? hostname();
    const identities = runtime.createIdentityStore({ directory, env: runtime.env, role: 'host' });
    const identity = await identities.loadOrCreate(deviceName);
    const api = runtime.createHostApi(serverUrl, new ServerCredentialStore(directory));
    return { api, identities, identity, deviceName };
}
function selectedServer() {
    return normalizeServerUrl(DEFAULT_REMOTE_SERVER_URL);
}
function resolveDependencies(input) {
    return {
        env: input.env ?? process.env,
        stdout: input.stdout ?? process.stdout,
        stderr: input.stderr ?? process.stderr,
        now: input.now ?? Date.now,
        wait: input.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))),
        renderQr: input.renderQr ?? renderTerminalQr,
        createIdentityStore: input.createIdentityStore ?? (options => new IdentityStore(options)),
        createHostApi: input.createHostApi ?? ((serverUrl, store) => new HostServerApi(serverUrl, store)),
    };
}
export async function renderTerminalQr(url) {
    // Keep the terminal-only renderer off the Host plugin startup path. Render
    // square modules with an explicit standard four-module quiet zone so phone
    // cameras recognize the code in narrow terminal profiles.
    const { default: QRCode } = await import('qrcode');
    const modules = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
    const width = modules.size + TERMINAL_QR_MARGIN * 2;
    const quietLine = `\u001B[47m${' '.repeat(width * 2)}\u001B[0m`;
    const lines = Array.from({ length: TERMINAL_QR_MARGIN }, () => quietLine);
    for (let row = 0; row < modules.size; row += 1) {
        let line = `\u001B[47m${' '.repeat(TERMINAL_QR_MARGIN * 2)}`;
        for (let column = 0; column < modules.size; column += 1) {
            line += modules.get(row, column) === 1 ? '\u001B[40m  ' : '\u001B[47m  ';
        }
        line += `\u001B[47m${' '.repeat(TERMINAL_QR_MARGIN * 2)}\u001B[0m`;
        lines.push(line);
    }
    lines.push(...Array.from({ length: TERMINAL_QR_MARGIN }, () => quietLine));
    return lines.join('\n');
}
function authorizedMessage(authorization) {
    return authorization.account === undefined
        ? 'Remote Host login complete.'
        : `Remote Host login complete for ${authorization.account}.`;
}
function authorizationLabel(method) {
    if (method === 'host_registration_code')
        return 'Host registration code';
    if (method === 'owned_device')
        return 'owned device';
    return 'account';
}
function statusErrorCode(error) {
    return error instanceof ServerApiError ? error.code : 'CONNECTION_FAILED';
}
function cliErrorMessage(error) {
    const message = error instanceof Error ? error.message : 'The Remote command failed.';
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    return code === undefined ? message : `${message} (${code})`;
}
function helpText() {
    return [
        'Usage:',
        '  ds-harness-remote login [provider|list]',
        '  ds-harness-remote register <server-token>',
        '  ds-harness-remote status',
        '  ds-harness-remote logout',
        '  ds-harness-remote reset-identity [host|client|all]',
        '',
        'login uses an available QR provider (preferring Zhihu). Use login list to see available providers.',
        `The Server is ${DEFAULT_REMOTE_SERVER_URL}.`,
        'Host configuration is not exposed by this CLI yet. Restart the Harness instance after login or logout.',
        '',
    ].join('\n');
}
function write(target, value) {
    target.write(value);
}
function terminalLink(url, target) {
    if (target.isTTY !== true)
        return url;
    return `\u001B]8;;${url}\u0007${url}\u001B]8;;\u0007`;
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
class CliUsageError extends Error {
}
//# sourceMappingURL=cli.js.map
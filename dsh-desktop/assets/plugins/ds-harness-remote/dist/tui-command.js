import { renderCompactTerminalQr, renderTerminalQr } from './cli.js';
import { ServerApiError } from './server-api.js';
const QR_POLL_INTERVAL_MS = 2_000;
const REMOTE_LOGIN_SCENE_ID = 'remote-login';
const REMOTE_STATUS_SCENE_ID = 'remote-status';
/** Soft TUI integration: Desktop profiles never wait for terminal-only services. */
export function installTuiRemoteCommand(ctx, resolveTarget) {
    const tuiContext = ctx;
    // The bundle's TUI-only Loader row exposes these services at the entry
    // boundary. A Desktop entry has neither and stays completely inert here.
    const commands = tuiContext.get('commands', false);
    if (commands === undefined)
        return;
    // Newer dsh-TUI versions attribute commands to their owning plugin through
    // this optional service. Older versions only expose the direct registry.
    const pluginHost = tuiContext.get('tuiPluginHost', false);
    const trees = tuiContext.get('tuiCommandTrees', false);
    const scenes = tuiContext.get('tuiScenes', false);
    const login = new RemoteLoginController(resolveTarget);
    const LoginScene = createRemoteLoginScene(login);
    const StatusScene = createRemoteStatusScene(resolveTarget);
    tuiContext.effect(() => {
        const definition = {
            name: 'remote',
            description: 'Manage Remote Host login and connection status',
            input: { hint: '[status | login [provider|list] | logout]' },
            recordInput: false,
            handler: async ({ rawInput }) => {
                const args = rawInput.trim().split(/\s+/u).filter(Boolean);
                const command = args[0] ?? 'status';
                if (command === 'status' && args.length <= 1) {
                    if (scenes?.open(REMOTE_STATUS_SCENE_ID) === true)
                        return { kind: 'success' };
                    return { kind: 'success', text: formatRemoteStatusInline(resolveTarget()) };
                }
                if (command === 'login' && args.length <= 2) {
                    const provider = args[1] ?? '';
                    if (provider === 'list') {
                        const target = resolveTarget();
                        if (target === undefined)
                            return remoteNotReady();
                        try {
                            const providers = await target.runtime.hostOAuthProviders();
                            return { kind: 'success', text: providers.filter(item => item.qrStartUrl != null)
                                    .map(item => `${item.displayName}: /remote login ${item.id}`).join('\n') || 'No QR sign-in providers are available.' };
                        }
                        catch (error) {
                            return { kind: 'error', text: errorCode(error) };
                        }
                    }
                    if (provider !== '' && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(provider)) {
                        return { kind: 'error', text: 'Usage: /remote login [provider|list]' };
                    }
                    if (scenes === undefined) {
                        return {
                            kind: 'error',
                            text: `The Remote login screen is unavailable. Run "ds-harness-remote login ${provider}" outside dsh-TUI, then restart it.`,
                        };
                    }
                    login.start(provider);
                    if (!scenes.open(REMOTE_LOGIN_SCENE_ID)) {
                        login.cancel();
                        return { kind: 'error', text: 'The Remote login screen is unavailable.' };
                    }
                    return { kind: 'success' };
                }
                if (command === 'logout' && args.length === 1) {
                    const target = resolveTarget();
                    if (target === undefined)
                        return remoteNotReady();
                    try {
                        await target.runtime.clearHostAuthorization();
                        return {
                            kind: 'success',
                            text: 'Remote Host logged out and its local device identity was rotated.',
                        };
                    }
                    catch (error) {
                        return {
                            kind: 'error',
                            text: `Local Remote Host credentials were cleared, but Server revocation failed (${errorCode(error)}).`,
                        };
                    }
                }
                if (command === 'config') {
                    return { kind: 'error', text: 'Host configuration is not supported yet.' };
                }
                return { kind: 'error', text: remoteCommandUsage() };
            },
        };
        const disposeCommand = registerRemoteCommand(tuiContext, commands, pluginHost, definition);
        const disposeTree = registerOptional(tuiContext, 'command completion', () => trees?.register({
            root: 'remote',
            descriptions: {
                en: 'Manage Remote Host login and connection status',
                zh: '管理 Remote Host 登录和连接状态',
            },
            children: path => remoteCommandChildren(path, login.completionProviders()),
        }));
        const disposeScene = registerOptional(tuiContext, 'login scene', () => scenes?.register({
            id: REMOTE_LOGIN_SCENE_ID,
            title: 'Remote Host login',
            component: LoginScene,
        }, tuiContext));
        const disposeStatusScene = registerOptional(tuiContext, 'status scene', () => scenes?.register({
            id: REMOTE_STATUS_SCENE_ID,
            title: 'Remote Host status',
            component: StatusScene,
        }, tuiContext));
        return () => {
            login.cancel();
            disposeCommand();
            disposeTree();
            disposeScene();
            disposeStatusScene();
        };
    }, 'ds-harness-remote: dsh-tui /remote command');
}
function registerRemoteCommand(ctx, commands, pluginHost, definition) {
    if (pluginHost === undefined)
        return commands.register(definition);
    try {
        return pluginHost.registerCommand(ctx, definition);
    }
    catch (error) {
        // dsh rc.2 with dsh-TUI 0.10.0-beta.4 mounts the mediated service but its
        // Cordis bundle loader does not admit third-party activations yet. Keep the
        // command usable on that exact compatibility seam; every other mediated
        // registration failure remains fail-closed.
        if (!hasErrorCode(error, 'COMPONENT_NOT_ADMITTED'))
            throw error;
        ctx.logger.debug('dsh-TUI Remote command is using the legacy command registry because Component admission is unavailable');
        return commands.register(definition);
    }
}
function hasErrorCode(error, code) {
    return typeof error === 'object' && error !== null && 'code' in error
        && error.code === code;
}
function registerOptional(ctx, feature, register) {
    try {
        return register() ?? (() => { });
    }
    catch (error) {
        ctx.logger.warn(`dsh-TUI Remote ${feature} is unavailable`, { code: errorCode(error) });
        return () => { };
    }
}
function remoteCommandChildren(canonicalPath, providers) {
    if (canonicalPath.length === 1 && canonicalPath[0] === 'remote') {
        return [
            {
                name: 'status',
                description: 'Show Remote Host authorization and connection status',
                descriptions: { zh: '查看 Remote Host 授权和连接状态' },
            },
            {
                name: 'login',
                description: 'Authorize this Host with an available OAuth QR provider',
                descriptions: { zh: '使用服务端提供的 OAuth 二维码授权当前 Host' },
            },
            {
                name: 'logout',
                description: 'Revoke this Host and rotate its local identity',
                descriptions: { zh: '撤销当前 Host 并轮换本地身份' },
            },
        ];
    }
    if (canonicalPath.length === 2 && canonicalPath[0] === 'remote' && canonicalPath[1] === 'login') {
        return [{ name: 'list', description: 'List available sign-in providers', descriptions: { zh: '列出可用登录方式' } },
            ...providers.filter(item => item.qrStartUrl != null).map(item => ({
                name: item.id, description: `Sign in with ${item.displayName}`, descriptions: { zh: `使用 ${item.displayName} 登录` },
            }))];
    }
    return [];
}
function remoteStatusLines(target) {
    if (target === undefined) {
        return ['Remote Host is disabled or still starting. Check the ds-harness-remote settings and retry.'];
    }
    const { runtime, config } = target;
    const status = runtime.hostStatus();
    const diagnostics = runtime.diagnostics();
    const codex = runtime.codexStatus();
    const cursor = runtime.acpStatus();
    const capabilities = new Set(diagnostics.capabilities);
    const connection = status.online
        ? 'online'
        : status.reconnecting
            ? 'reconnecting'
            : status.accountRequired
                ? 'authorization required'
                : 'offline';
    return [
        `Server: ${config.serverUrl ?? 'not configured'}`,
        'Host control: enabled',
        `Device: ${status.deviceId ?? 'not initialized'}`,
        `Authorization: ${status.authorized ? status.account === undefined ? 'logged in' : `logged in (${status.account})` : 'logged out'}`,
        `Server connection: ${connection}`,
        ...(status.error === undefined ? [] : [`Connection error: ${status.error}`]),
        ...(status.error === 'CONNECTION_REPLACED'
            ? ['Another instance is using this Host identity. Stop it or use a separate DSH_HOME before reconnecting.']
            : status.error === 'SERVER_CREDENTIALS_BUSY'
                ? ['Credential refresh is locked. Stop all instances before removing an orphaned server-credentials.json.refresh-lock and authorizing again.']
                : status.accountRequired ? ['Authorize again with /remote login [provider|list].'] : []),
        `Harness Remote API: ${capabilities.has('harness.remote.v3')
            ? 'available (Typert Remote Session V3)'
            : capabilities.has('harness.remote.v1')
                ? 'available (Typert Remote)'
                : 'unavailable'}`,
        `Remote clients: ${diagnostics.activeConnections}`,
        `Codex Remote: ${codex.enabled ? codex.state : 'disabled'}`,
        `Agent ACP: ${cursor.enabled ? cursor.state : 'disabled'}`,
        '',
        'Commands: /remote login [provider|list] · /remote status · /remote logout',
    ];
}
function formatRemoteStatusInline(target) {
    return remoteStatusLines(target).filter(Boolean).join(' · ');
}
function remoteCommandUsage() {
    return [
        'Usage:',
        '  /remote',
        '  /remote status',
        '  /remote login [provider|list]',
        '  /remote logout',
    ].join('\n');
}
function remoteNotReady() {
    return {
        kind: 'error',
        text: 'Remote Host is disabled or still starting. Check the ds-harness-remote settings and retry.',
    };
}
class RemoteLoginController {
    resolveTarget;
    current = { phase: 'idle', provider: 'zhihu' };
    listeners = new Set();
    attempt = 0;
    providers = [];
    providersLoading = false;
    providersCheckedAt = 0;
    providersServerUrl;
    constructor(resolveTarget) {
        this.resolveTarget = resolveTarget;
    }
    snapshot = () => this.current;
    completionProviders() {
        const target = this.resolveTarget();
        if (!this.providersLoading && target !== undefined
            && (target.config.serverUrl !== this.providersServerUrl || Date.now() - this.providersCheckedAt > 30_000)) {
            this.providersLoading = true;
            this.providersServerUrl = target.config.serverUrl;
            this.providersCheckedAt = Date.now();
            this.providers = [];
            void target.runtime.hostOAuthProviders().then(items => { this.providers = items; })
                .catch(() => undefined).finally(() => { this.providersLoading = false; });
        }
        return this.providers;
    }
    providerName(provider) {
        return this.providers.find(item => item.id === provider)?.displayName ?? provider;
    }
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    start(provider) {
        const attempt = ++this.attempt;
        this.update({ phase: 'loading', provider });
        void this.run(attempt, provider);
    }
    cancel() {
        this.attempt += 1;
    }
    async run(attempt, provider) {
        try {
            const target = this.resolveTarget();
            if (target === undefined)
                throw new Error('REMOTE_NOT_READY');
            this.providers = await target.runtime.hostOAuthProviders();
            if (attempt !== this.attempt)
                return;
            const available = this.providers.filter(item => item.qrStartUrl != null);
            if (provider === '')
                provider = (available.find(item => item.id === 'zhihu') ?? available[0])?.id ?? '';
            if (!available.some(item => item.id === provider))
                throw new Error('OAUTH_PROVIDER_UNAVAILABLE');
            const session = await target.runtime.startHostOAuthQrLogin(provider);
            const [qr, compactQr] = await Promise.all([
                renderTerminalQr(session.scanUrl),
                renderCompactTerminalQr(session.scanUrl),
            ]);
            if (attempt !== this.attempt)
                return;
            this.update({ phase: 'waiting', provider, qr, compactQr, scanUrl: session.scanUrl });
            await this.poll(attempt, provider, session, target.runtime);
        }
        catch (error) {
            if (attempt !== this.attempt)
                return;
            this.update({ phase: 'error', provider, error: errorCode(error) });
        }
    }
    async poll(attempt, provider, session, runtime) {
        const deadline = Date.now() + session.expiresIn * 1_000;
        while (attempt === this.attempt && Date.now() < deadline) {
            try {
                const result = await runtime.pollHostOAuthQrLogin(session.qrId);
                if (attempt !== this.attempt)
                    return;
                if (result.status === 'complete') {
                    this.update({ phase: 'complete', provider, account: result.authorization.account });
                    return;
                }
                if (result.status === 'expired')
                    break;
            }
            catch (error) {
                if (!(error instanceof ServerApiError) || !error.retryable)
                    throw error;
            }
            await wait(Math.min(QR_POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        }
        if (attempt === this.attempt)
            this.update({ phase: 'expired', provider });
    }
    update(snapshot) {
        this.current = snapshot;
        for (const listener of this.listeners)
            listener(snapshot);
    }
}
function createRemoteLoginScene(controller) {
    return function RemoteLoginScene({ React, ui, close }) {
        const [snapshot, setSnapshot] = React.useState(controller.snapshot());
        const terminal = ui.useTerminalSize();
        React.useEffect(() => {
            const unsubscribe = controller.subscribe(setSnapshot);
            return () => {
                unsubscribe();
                controller.cancel();
            };
        }, []);
        ui.useInput((input, key) => {
            if (key.escape === true || input.toLowerCase() === 'q') {
                controller.cancel();
                close();
            }
        });
        const provider = controller.providerName(snapshot.provider);
        const children = [
            React.createElement(ui.Text, { key: 'title', bold: true, color: 'accent' }, 'Remote Host login'),
            React.createElement(ui.Text, { key: 'provider' }, `Provider: ${provider} · Available providers: /remote login list`),
        ];
        if (snapshot.phase === 'loading') {
            children.push(React.createElement(ui.Text, { key: 'loading', color: 'subtle' }, 'Creating authorization QR code…'));
        }
        else if (snapshot.phase === 'waiting' && snapshot.qr !== undefined && snapshot.scanUrl !== undefined) {
            const fullRows = snapshot.qr.split('\n').length;
            const fullColumns = printableWidth(snapshot.qr.split('\n')[0] ?? '');
            const useFullQr = terminal.rows >= fullRows + 7 && terminal.columns >= fullColumns + 4;
            const qr = useFullQr || snapshot.compactQr === undefined ? snapshot.qr : snapshot.compactQr;
            const qrRows = qr.split('\n').length;
            const qrColumns = printableWidth(qr.split('\n')[0] ?? '');
            if (terminal.rows < qrRows + 7 || terminal.columns < qrColumns + 4) {
                children.push(React.createElement(ui.Text, { key: 'size-warning', color: 'warning' }, `Resize the terminal to at least ${qrColumns + 4} × ${qrRows + 7} if the QR code is clipped.`));
            }
            children.push(React.createElement(ui.Text, { key: 'scan' }, 'Scan this QR code to authorize this Host:'), React.createElement(ui.Text, { key: 'qr', wrap: 'truncate' }, qr), React.createElement(ui.Text, { key: 'url', color: 'link', underline: true }, terminalLink(snapshot.scanUrl)), React.createElement(ui.Text, { key: 'waiting', color: 'subtle' }, 'Waiting for authorization…'));
        }
        else if (snapshot.phase === 'complete') {
            children.push(React.createElement(ui.Text, { key: 'complete', color: 'success' }, snapshot.account === undefined
                ? 'Remote Host login complete. The Host is reconnecting now.'
                : `Remote Host login complete for ${snapshot.account}. The Host is reconnecting now.`));
        }
        else if (snapshot.phase === 'expired') {
            children.push(React.createElement(ui.Text, { key: 'expired', color: 'warning' }, 'The QR code expired. Close this screen and run /remote login again.'));
        }
        else if (snapshot.phase === 'error') {
            children.push(React.createElement(ui.Text, { key: 'error', color: 'error' }, `Remote Host login failed (${snapshot.error ?? 'UNKNOWN'}).`));
        }
        children.push(React.createElement(ui.Text, { key: 'close', color: 'subtle' }, 'Press Esc or q to return.'));
        return React.createElement(ui.Box, {
            flexDirection: 'column',
            gap: 1,
            paddingX: Math.max(0, Math.min(2, Math.floor((terminal.columns - 1) / 2))),
        }, ...children);
    };
}
function createRemoteStatusScene(resolveTarget) {
    return function RemoteStatusScene({ React, ui, close }) {
        const terminal = ui.useTerminalSize();
        ui.useInput((input, key) => {
            if (key.escape === true || input.toLowerCase() === 'q')
                close();
        });
        const children = [
            React.createElement(ui.Text, { key: 'title', bold: true, color: 'accent' }, 'Remote Host status'),
            ...remoteStatusLines(resolveTarget()).map((line, index) => React.createElement(ui.Text, { key: `status-${index}`, color: line === '' ? 'subtle' : undefined }, line === '' ? ' ' : line)),
            React.createElement(ui.Text, { key: 'close', color: 'subtle' }, 'Press Esc or q to return.'),
        ];
        return React.createElement(ui.Box, {
            flexDirection: 'column',
            gap: 1,
            paddingX: Math.max(0, Math.min(2, Math.floor((terminal.columns - 1) / 2))),
        }, ...children);
    };
}
function terminalLink(url) {
    return `\u001B]8;;${url}\u0007${url}\u001B]8;;\u0007`;
}
function printableWidth(value) {
    return value.replace(/\u001B\[[0-9;]*m/gu, '').length;
}
function errorCode(error) {
    if (error instanceof ServerApiError)
        return error.code;
    if (error instanceof Error && 'code' in error && typeof error.code === 'string')
        return error.code;
    return 'CONNECTION_FAILED';
}
function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
//# sourceMappingURL=tui-command.js.map
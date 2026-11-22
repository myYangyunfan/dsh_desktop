const DEFAULT_LOGIN_COMMANDS = {
    cursor: 'agent login',
    antigravity: 'agy acp --login',
    pi: 'pi',
    opencode: 'opencode auth login',
    claude: 'claude login',
    hermes: 'hermes setup',
};
export function parseInitializeMetadata(result) {
    if (!isRecord(result)) {
        return { agentCapabilities: {}, authMethods: [] };
    }
    const caps = isRecord(result.agentCapabilities) ? result.agentCapabilities : {};
    const promptCaps = isRecord(caps.promptCapabilities) ? caps.promptCapabilities : undefined;
    const sessionCaps = isRecord(caps.sessionCapabilities) ? caps.sessionCapabilities : isRecord(caps.session_capabilities) ? caps.session_capabilities : undefined;
    const rawMeta = isRecord(result._meta) ? result._meta : isRecord(caps._meta) ? caps._meta : undefined;
    const steering = isRecord(rawMeta?.steering) && rawMeta.steering.supported === true;
    const rawInfo = isRecord(result.agentInfo) ? result.agentInfo : undefined;
    const authMethods = Array.isArray(result.authMethods)
        ? result.authMethods.flatMap(item => {
            if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string')
                return [];
            return [{
                    id: item.id,
                    name: item.name,
                    ...(typeof item.description === 'string' ? { description: redactPaths(item.description) } : {}),
                    ...(typeof item.type === 'string' ? { type: item.type } : {}),
                    ...(Array.isArray(item.args) ? { args: item.args.filter((arg) => typeof arg === 'string').slice(0, 8).map(redactPaths) } : {}),
                }];
        })
        : [];
    return {
        ...(rawInfo ? {
            agentInfo: {
                ...(typeof rawInfo.name === 'string' ? { name: rawInfo.name } : {}),
                ...(typeof rawInfo.version === 'string' ? { version: rawInfo.version } : {}),
            },
        } : {}),
        agentCapabilities: {
            ...(typeof caps.loadSession === 'boolean' ? { loadSession: caps.loadSession } : {}),
            ...(promptCaps ? {
                promptCapabilities: {
                    ...(typeof promptCaps.image === 'boolean' ? { image: promptCaps.image } : {}),
                    ...(typeof promptCaps.audio === 'boolean' ? { audio: promptCaps.audio } : {}),
                    ...(typeof promptCaps.embeddedContext === 'boolean' ? { embeddedContext: promptCaps.embeddedContext } : {}),
                },
            } : {}),
            ...(sessionCaps ? {
                sessionCapabilities: {
                    ...(isRecord(sessionCaps.list) || sessionCaps.list === true ? { list: true } : {}),
                    ...(isRecord(sessionCaps.fork) || sessionCaps.fork === true ? { fork: true } : {}),
                    ...(isRecord(sessionCaps.delete) || sessionCaps.delete === true ? { delete: true } : {}),
                    ...(isRecord(sessionCaps.resume) || sessionCaps.resume === true ? { resume: true } : {}),
                    ...(isRecord(sessionCaps.close) || sessionCaps.close === true ? { close: true } : {}),
                    ...(isRecord(sessionCaps.additionalDirectories) || sessionCaps.additionalDirectories === true ? { additionalDirectories: true } : {}),
                },
            } : {}),
            ...(steering ? { steering: true } : {}),
        },
        authMethods,
    };
}
export function detectUpstreamAuthFailure(backend, errorValue, authMethods = []) {
    if (!isRecord(errorValue))
        return undefined;
    const rpcCode = typeof errorValue.code === 'number' ? errorValue.code : undefined;
    const messageText = typeof errorValue.message === 'string' ? errorValue.message : '';
    const dataMessage = isRecord(errorValue.data) && typeof errorValue.data.message === 'string' ? errorValue.data.message : '';
    const combined = `${messageText} ${dataMessage}`.trim();
    const lower = combined.toLowerCase();
    const browserOpenFailed = (rpcCode === -32602 || lower.includes('browser')) && lower.includes('open browser');
    const isAuthError = rpcCode === -32000
        || browserOpenFailed
        || lower.includes('authentication required')
        || lower.includes('not logged in')
        || lower.includes('unauthorized')
        || lower.includes('api key')
        || lower.includes('auth') && lower.includes('login');
    if (!isAuthError)
        return undefined;
    const terminalMethod = authMethods.find(method => method.type === 'terminal');
    const rawLoginCommand = DEFAULT_LOGIN_COMMANDS[backend]
        ?? (terminalMethod?.args?.length ? `${backend} ${terminalMethod.args.join(' ')}` : undefined);
    const loginCommand = rawLoginCommand ? redactPaths(rawLoginCommand) : undefined;
    const loginUrl = extractSafeHttpsUrl(combined);
    const guidance = browserOpenFailed
        ? `Headless login cannot open a browser on this Host. Run \`${loginCommand ?? `${backend} login`}\` in a Host terminal (or configure the backend API key), then check again.`
        : terminalMethod
            ? `${terminalMethod.name}: ${terminalMethod.description ?? `run \`${loginCommand ?? backend}\` in a Host terminal.`}`
            : loginCommand
                ? `Authentication required on this Host. Run \`${loginCommand}\` in a Host terminal and retry.`
                : 'Authentication required on this Host. Complete CLI login in a Host terminal and retry.';
    return {
        authStatus: 'auth_required',
        errorCode: browserOpenFailed ? 'ACP_HEADLESS_BROWSER_LOGIN_FAILED' : 'ACP_AUTH_REQUIRED',
        guidance: redactPaths(guidance),
        ...(loginCommand ? { loginCommand } : {}),
        ...(loginUrl ? { loginUrl } : {}),
        ...(authMethods.length > 0 ? { authMethods: [...authMethods] } : {}),
    };
}
export function buildAuthDiagnosticFromMetadata(backend, metadata, lastDiagnostic, ready) {
    if (lastDiagnostic) {
        return {
            ...lastDiagnostic,
            ...(metadata?.authMethods.length && !lastDiagnostic.authMethods?.length ? { authMethods: metadata.authMethods } : {}),
        };
    }
    const authMethods = metadata?.authMethods ?? [];
    const terminalMethod = authMethods.find(method => method.type === 'terminal');
    const rawLoginCommand = DEFAULT_LOGIN_COMMANDS[backend];
    const loginCommand = rawLoginCommand ? redactPaths(rawLoginCommand) : undefined;
    if (ready) {
        return {
            authStatus: 'authenticated',
            ...(authMethods.length > 0 ? { authMethods } : {}),
            ...(terminalMethod && loginCommand ? { loginCommand } : {}),
        };
    }
    return {
        authStatus: 'unknown',
        ...(authMethods.length > 0 ? { authMethods } : {}),
        ...(terminalMethod ? {
            guidance: redactPaths(terminalMethod.description ?? `Run \`${loginCommand ?? backend}\` in a Host terminal to configure credentials.`),
            ...(loginCommand ? { loginCommand } : {}),
        } : {}),
    };
}
export function parseAvailableCommands(update) {
    if (!isRecord(update) || !Array.isArray(update.availableCommands))
        return [];
    return update.availableCommands.flatMap(item => {
        if (!isRecord(item) || typeof item.name !== 'string' || item.name.trim().length === 0)
            return [];
        const input = isRecord(item.input) && typeof item.input.hint === 'string'
            ? { hint: item.input.hint }
            : undefined;
        return [{
                name: item.name.trim(),
                ...(typeof item.description === 'string' ? { description: item.description } : {}),
                ...(input ? { input } : {}),
            }];
    });
}
export function extractSafeHttpsUrl(text) {
    const match = /https:\/\/[^\s"'<>]+/i.exec(text);
    if (!match)
        return undefined;
    try {
        const parsed = new URL(match[0]);
        return `${parsed.origin}${parsed.pathname}`;
    }
    catch {
        return undefined;
    }
}
export function redactPaths(text) {
    return text
        .replace(/(["'])[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\\\r\n"']+?(?:\\[^\\\r\n"']+)*\1/gi, quote => `${quote[0]}<host-path>${quote[0]}`)
        .replace(/[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\\\r\n:*?"<>|]+(?:\\[^\s\\/:*?"<>|'`]+)+/gi, '<host-path>')
        .replace(/[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s\\/:*?"<>|'`]+/gi, '<host-path>')
        .replace(/(["'])\/(?:Users|home)\/[^/\r\n"']+?(?:\/[^/\r\n"']+)*\1/g, quote => `${quote[0]}<host-path>${quote[0]}`)
        .replace(/\/(?:Users|home)\/[^/\r\n:*?"<>|]+(?:\/[^\s/:*?"<>|'`]+)+/g, '<host-path>')
        .replace(/\/(?:Users|home)\/[^\s/:*?"<>|'`]+/g, '<host-path>');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=auth-diagnostics.js.map
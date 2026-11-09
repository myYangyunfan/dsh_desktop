const defaultPreferredTransports = ['lan', 'p2p', 'turn', 'relay'];
function normalizedPreferredTransports(value) {
    return value === undefined || value.length === 0 ? [...defaultPreferredTransports] : [...value];
}
export function formatLocalTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
export function formatByteSize(value) {
    if (value < 1024)
        return `${value.toLocaleString()} B`;
    const units = ['KiB', 'MiB', 'GiB'];
    let amount = value;
    let unit = 'B';
    for (const nextUnit of units) {
        amount /= 1024;
        unit = nextUnit;
        if (amount < 1024)
            break;
    }
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
}
export function formatBitrate(value) {
    const units = ['bit/s', 'Kbit/s', 'Mbit/s', 'Gbit/s'];
    let amount = value;
    let unitIndex = 0;
    while (amount >= 1000 && unitIndex < units.length - 1) {
        amount /= 1000;
        unitIndex += 1;
    }
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}
export function shortDeviceId(value) {
    return value.length <= 14 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}
function serverHostname(value) {
    try {
        return new URL(value).hostname;
    }
    catch {
        return value;
    }
}
export function transportLabel(value, t) {
    if (value === 'lan')
        return t('remoteNetworkLan');
    if (value === 'p2p')
        return t('remoteNetworkP2p');
    if (value === 'turn')
        return t('remoteNetworkTurn');
    return t('remoteNetworkRelay');
}
export function transportDiagnosticLabel(value) {
    if (value === 'lan')
        return 'LAN';
    if (value === 'p2p')
        return 'P2P';
    if (value === 'turn')
        return 'TURN';
    return 'Relay';
}
function transportProgressCopy(value) {
    if (value === 'lan')
        return { label: 'remoteProgressProbeLan', detail: 'remoteProgressProbeLanDetail' };
    if (value === 'p2p')
        return { label: 'remoteProgressProbeP2p', detail: 'remoteProgressProbeP2pDetail' };
    if (value === 'turn')
        return { label: 'remoteProgressProbeTurn', detail: 'remoteProgressProbeTurnDetail' };
    return { label: 'remoteProgressProbeRelay', detail: 'remoteProgressProbeRelayDetail' };
}
function statusTransportPreference(status) {
    if (status?.transport === 'LAN')
        return 'lan';
    if (status?.transport === 'P2P')
        return 'p2p';
    if (status?.transport === 'TURN')
        return 'turn';
    if (status?.transport === 'Relay')
        return 'relay';
    return undefined;
}
export function connectedProgress(status) {
    const activeTransport = statusTransportPreference(status);
    if (activeTransport === undefined)
        return undefined;
    return {
        label: 'remoteProgressReady',
        detail: 'remoteProgressReadyDetail',
        percent: 100,
        transports: normalizedPreferredTransports(status?.preferredTransports),
        activeTransports: [activeTransport],
        routeVerb: 'using',
    };
}
function loadingProgressPercent(elapsedMs) {
    if (elapsedMs >= 6_800)
        return 96;
    if (elapsedMs >= 3_800)
        return 93;
    if (elapsedMs >= 1_600)
        return 89;
    return 84;
}
export function observedConnectionProgress(status, targetDeviceId, preferredTransports, connectedStep, connectedAt) {
    const transports = normalizedPreferredTransports(status.preferredTransports ?? preferredTransports);
    const connection = status.connectionProgress;
    if (connection?.targetDeviceId === targetDeviceId) {
        if (connection.phase === 'checking-host') {
            return { label: 'remoteProgressCheckingHost', detail: 'remoteProgressCheckingHostDetail', percent: 12 };
        }
        if (connection.phase === 'authorizing-peer') {
            return { label: 'remoteProgressAuthorizingPeer', detail: 'remoteProgressAuthorizingPeerDetail', percent: 30 };
        }
        const activeTransports = connection.activeTransports?.filter(transport => transports.includes(transport)) ?? [];
        if (connection.phase === 'probing') {
            const activeIndex = Math.max(0, ...activeTransports.map(transport => transports.indexOf(transport)));
            const copy = activeTransports.length === 1
                ? transportProgressCopy(activeTransports[0])
                : { label: 'remoteProgressOpeningChannel', detail: 'remoteProgressOpeningChannelDetail' };
            return {
                ...copy,
                percent: Math.min(76, 42 + activeIndex * 10),
                transports,
                activeTransports,
                routeVerb: 'trying',
            };
        }
        return {
            ...connectedStep,
            percent: loadingProgressPercent(connectedAt === undefined ? 0 : Date.now() - connectedAt),
            transports,
            activeTransports,
            routeVerb: 'using',
        };
    }
    if (status.connectedTargetDeviceId !== targetDeviceId)
        return undefined;
    const activeTransport = statusTransportPreference(status);
    return {
        ...connectedStep,
        percent: loadingProgressPercent(connectedAt === undefined ? 0 : Date.now() - connectedAt),
        transports,
        ...(activeTransport === undefined ? {} : { activeTransports: [activeTransport], routeVerb: 'using' }),
    };
}
export function connectionErrorMessage(code, t) {
    if (code === 'ACCOUNT_AUTH_REQUIRED' || code === 'AUTH_INVALID' || code === 'TOKEN_EXPIRED') {
        return t('connectionAuthorizationExpired');
    }
    if (code === 'CONNECTION_REPLACED')
        return t('connectionReplaced');
    if (code === 'SERVER_CREDENTIALS_BUSY')
        return t('connectionCredentialsBusy');
    if (code === 'DEVICE_REVOKED')
        return t('connectionDeviceRevoked');
    if (code === 'DEVICE_OWNERSHIP_REQUIRED')
        return t('connectionOwnershipRequired');
    if (code === 'RATE_LIMITED')
        return t('connectionRateLimited');
    if (code === 'UNSUPPORTED_VERSION')
        return t('connectionVersionMismatch');
    if (code === 'INVALID_MESSAGE')
        return t('connectionInvalidResponse');
    if (code === 'CONNECTION_FAILED' || code === 'SERVER_NOT_CONFIGURED')
        return t('connectionReachability');
    return t('connectionUnexpected');
}
export function connectionStatusLabel(status, t) {
    if (status === undefined)
        return t('checkingConnection');
    if (status.online)
        return t('online');
    if (!status.reconnecting)
        return t('offline');
    return t(status.lastActiveAt === undefined && status.error === undefined ? 'connecting' : 'reconnecting');
}
export function connectionStatusClass(status) {
    if (status?.online)
        return ' isOnline';
    if (status?.reconnecting)
        return ' isReconnecting';
    return status === undefined ? '' : ' isOffline';
}
export function messageOf(reason) { return reason instanceof Error ? reason.message : String(reason); }
export function formatPlatform(value) {
    const normalized = value.toLowerCase();
    if (normalized === 'darwin' || normalized === 'macos')
        return 'macOS';
    if (normalized === 'win32' || normalized === 'windows')
        return 'Windows';
    if (normalized === 'linux')
        return 'Linux';
    if (normalized === 'android')
        return 'Android';
    return value;
}
export function connectedClientModeLabel(mode, t) {
    if (mode === 'LAN')
        return t('remoteNetworkLan');
    if (mode === 'P2P')
        return t('remoteNetworkP2p');
    if (mode === 'TURN')
        return t('remoteNetworkTurn');
    if (mode === 'Relay')
        return t('remoteNetworkRelay');
    return t('connected');
}
//# sourceMappingURL=presentation.js.map
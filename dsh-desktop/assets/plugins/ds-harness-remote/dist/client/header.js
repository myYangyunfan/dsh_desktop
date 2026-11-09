import { createServerNotice } from './server-notice.js';
import { renderBodyPortal } from './portal.js';
import { formatBitrate, formatByteSize, formatLocalTime, shortDeviceId, transportLabel } from './presentation.js';
export function createRemoteSessionHeaderAction(React, portal) {
    const ServerNotice = createServerNotice(React);
    function RemoteSessionHeaderAction(props) {
        const { t } = props;
        const status = React.useSyncExternalStore(props.statusFeed.subscribe, props.statusFeed.getSnapshot, props.statusFeed.getSnapshot);
        const [busy, setBusy] = React.useState(false);
        const [routeOpen, setRouteOpen] = React.useState(false);
        const [hostReference, setHostReference] = React.useState(undefined);
        React.useEffect(() => {
            const onReference = (event) => {
                const detail = event.detail;
                if (detail === null || typeof detail !== 'object')
                    return;
                if (typeof detail.label !== 'string' || typeof detail.platform !== 'string' || typeof detail.deviceId !== 'string' || typeof detail.invocation !== 'string')
                    return;
                setHostReference(detail);
            };
            window.addEventListener('dsh-remote-host-reference', onReference);
            return () => window.removeEventListener('dsh-remote-host-reference', onReference);
        }, []);
        React.useEffect(() => {
            if (status?.mode !== 'remote')
                return;
            return hideLocalSessionActions();
        }, [status?.mode]);
        React.useEffect(() => {
            document.documentElement.classList.toggle('dshRemoteCodexTargetActive', status?.mode === 'remote' && status.backend === 'codex');
            document.documentElement.classList.toggle('dshRemoteCursorTargetActive', status?.mode === 'remote' && status.backend === 'cursor');
            document.documentElement.classList.toggle('dshRemoteAntigravityTargetActive', status?.mode === 'remote' && status.backend === 'antigravity');
            document.documentElement.classList.toggle('dshRemotePiTargetActive', status?.mode === 'remote' && status.backend === 'pi');
            document.documentElement.classList.toggle('dshRemoteOpencodeTargetActive', status?.mode === 'remote' && status.backend === 'opencode');
            return () => {
                document.documentElement.classList.remove('dshRemoteCodexTargetActive');
                document.documentElement.classList.remove('dshRemoteCursorTargetActive');
                document.documentElement.classList.remove('dshRemoteAntigravityTargetActive');
                document.documentElement.classList.remove('dshRemotePiTargetActive');
                document.documentElement.classList.remove('dshRemoteOpencodeTargetActive');
            };
        }, [status?.mode, status?.backend]);
        React.useEffect(() => {
            if (!routeOpen)
                return;
            const closeOnEscape = (event) => {
                if (event.key === 'Escape')
                    setRouteOpen(false);
            };
            document.addEventListener('keydown', closeOnEscape);
            return () => document.removeEventListener('keydown', closeOnEscape);
        }, [routeOpen]);
        const renderHostReference = () => hostReference === undefined ? null : renderBodyPortal(portal, React.createElement('aside', { className: 'dshRemoteHostReferencePanel', role: 'dialog', 'aria-label': 'Remote Host' }, React.createElement('header', null, React.createElement('strong', null, 'Remote Host'), React.createElement('button', { type: 'button', 'aria-label': t('close'), onClick: () => setHostReference(undefined) }, '×')), React.createElement('dl', null, React.createElement('div', null, React.createElement('dt', null, '名称'), React.createElement('dd', null, hostReference.label)), React.createElement('div', null, React.createElement('dt', null, '系统'), React.createElement('dd', null, hostReference.platform)), React.createElement('div', null, React.createElement('dt', null, '设备 ID'), React.createElement('dd', { className: 'isMono' }, hostReference.deviceId)), React.createElement('div', null, React.createElement('dt', null, '调用内容'), React.createElement('dd', { className: 'isMono' }, hostReference.invocation)))));
        if (status?.mode !== 'remote')
            return renderHostReference();
        const exit = async () => {
            setBusy(true);
            try {
                await props.control('mode.set', { mode: 'local' });
                window.location.reload();
            }
            finally {
                setBusy(false);
            }
        };
        const transport = status.network?.webRtc?.mode ?? status.transport ?? 'Disconnected';
        const networkLabel = transport === 'P2P'
            ? t('remoteNetworkP2p')
            : transport === 'TURN'
                ? t('remoteNetworkTurn')
                : transport === 'Relay'
                    ? t('remoteNetworkRelay')
                    : transport === 'LAN'
                        ? t('remoteNetworkLan')
                        : t('remoteNetworkOffline');
        const networkOnline = status.connected === true && transport !== 'Disconnected';
        const routeVia = transport === 'P2P'
            ? t('connectionRouteP2p')
            : transport === 'TURN'
                ? t('connectionRouteTurn')
                : transport === 'Relay'
                    ? t('connectionRouteRelay')
                    : t('connectionRouteLan');
        const routeViaDetail = transport === 'P2P'
            ? t('connectionRouteP2pDetail')
            : transport === 'TURN'
                ? t('connectionRouteTurnDetail')
                : transport === 'Relay'
                    ? t('connectionRouteRelayDetail')
                    : t('connectionRouteLanDetail');
        const network = status.network;
        const webRtc = network?.webRtc;
        const controlStateLabel = network?.controlChannelState === 'connecting'
            ? t('controlStateConnecting')
            : network?.controlChannelState === 'open'
                ? t('controlStateOpen')
                : network?.controlChannelState === 'closing'
                    ? t('controlStateClosing')
                    : t('controlStateClosed');
        const detailValue = (value) => value === undefined || value === ''
            ? t('notProvided')
            : String(value);
        const candidateLabel = (value) => value === 'host'
            ? t('candidateHost')
            : value === 'srflx'
                ? t('candidateSrflx')
                : value === 'prflx'
                    ? t('candidatePrflx')
                    : value === 'relay'
                        ? t('candidateRelay')
                        : detailValue(value);
        const fact = (label, value, mono = false) => React.createElement('div', null, React.createElement('dt', null, label), React.createElement('dd', { className: mono ? 'isMono' : undefined, title: mono ? value : undefined }, value));
        return React.createElement('div', { className: 'dshRemoteSessionHeader', role: 'status' }, React.createElement('svg', {
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
            strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        }, React.createElement('rect', { x: 3, y: 4, width: 18, height: 13, rx: 2 }), React.createElement('path', { d: 'M8 21h8M12 17v4' })), React.createElement('span', { className: 'dshRemoteSessionTarget' }, t('remoteModeLabel', { name: status.target?.name ?? t('host') })), status.clientAuthRequired ? React.createElement('button', {
            type: 'button', className: 'dshRemoteNetwork isOffline', onClick: props.onSignIn,
        }, t('clientSignInAgain')) : React.createElement('button', {
            type: 'button',
            className: `dshRemoteNetwork${networkOnline ? ' isOnline' : ' isOffline'}`,
            title: networkLabel,
            'aria-haspopup': 'dialog',
            'aria-expanded': routeOpen,
            onClick: () => setRouteOpen(value => !value),
        }, React.createElement('i', { 'aria-hidden': true }), networkLabel), React.createElement(ServerNotice, {
            compact: true,
            offline: network !== undefined && network.controlChannelState !== 'open',
            linked: networkOnline, expiresAt: network?.recoveryExpiresAt, t,
        }), renderHostReference(), React.createElement('button', { type: 'button', className: 'dshRemoteHeaderExitLink', disabled: busy, onClick: () => void exit() }, t('exitRemote')), !routeOpen || !networkOnline ? null : renderBodyPortal(portal, React.createElement('div', {
            className: 'dshRemoteRouteBackdrop',
            role: 'presentation',
            onMouseDown: (event) => { if (event.target === event.currentTarget)
                setRouteOpen(false); },
        }, React.createElement('section', {
            className: 'dshRemoteRoutePanel',
            role: 'dialog',
            'aria-label': t('connectionRouteTitle'),
        }, React.createElement('header', null, React.createElement('strong', null, t('connectionRouteTitle')), React.createElement('button', { type: 'button', 'aria-label': t('close'), onClick: () => setRouteOpen(false) }, '×')), React.createElement(ServerNotice, {
            offline: network !== undefined && network.controlChannelState !== 'open',
            linked: networkOnline, expiresAt: network?.recoveryExpiresAt, t,
            onReconnect: () => { void props.control('mode.set', { mode: 'remote', targetDeviceId: status.target?.deviceId }).catch(() => undefined); },
        }), React.createElement('ol', null, React.createElement('li', null, React.createElement('small', null, t('connectionRouteFrom')), React.createElement('strong', null, network?.local.name ?? t('connectionRouteCurrentDevice')), network === undefined ? null : React.createElement('span', null, `${network.local.platform} · ${shortDeviceId(network.local.deviceId)}`)), React.createElement('li', null, React.createElement('small', null, t('connectionRouteVia')), React.createElement('strong', null, routeVia), React.createElement('span', null, routeViaDetail)), React.createElement('li', null, React.createElement('small', null, t('connectionRouteTo')), React.createElement('strong', null, network?.remote.name ?? status.target?.name ?? t('host')), React.createElement('span', null, network === undefined
            ? t('connectionRouteHost')
            : `${network.remote.platform} · ${shortDeviceId(network.remote.deviceId)}`))), network === undefined ? null : React.createElement('section', { className: 'dshRemoteRouteSection' }, React.createElement('h3', null, t('connectionDetailsConnection')), React.createElement('dl', null, fact(t('connectionId'), detailValue(network.connectionId), true), fact(t('connectedAt'), network.connectedAt === undefined ? t('notProvided') : formatLocalTime(network.connectedAt)), fact(t('preferredTransports'), network.preferredTransports.map(value => transportLabel(value, t)).join(' → ')), fact(t('controlChannel'), `WebSocket · ${controlStateLabel}`), fact(t('controlAddress'), network.controlChannelUrl, true))), webRtc === undefined ? null : React.createElement('section', { className: 'dshRemoteRouteSection' }, React.createElement('h3', null, t('connectionDetailsWebRtc')), React.createElement('dl', null, fact(t('peerState'), `${webRtc.connectionState} · ICE ${webRtc.iceConnectionState}`), fact(t('dataChannel'), detailValue(webRtc.dataChannelState)), fact(t('localCandidate'), candidateLabel(webRtc.localCandidateType)), fact(t('remoteCandidate'), candidateLabel(webRtc.remoteCandidateType)), fact(t('localAddress'), detailValue(webRtc.localAddress), true), fact(t('remoteAddress'), detailValue(webRtc.remoteAddress), true), fact(t('networkProtocol'), detailValue(webRtc.protocol?.toUpperCase())), fact(t('relayProtocol'), detailValue(webRtc.relayProtocol?.toUpperCase())), fact(t('roundTripTime'), webRtc.currentRoundTripTimeMs === undefined
            ? t('notProvided')
            : `${webRtc.currentRoundTripTimeMs.toLocaleString()} ms`), fact(t('availableBitrate'), webRtc.availableOutgoingBitrate === undefined
            ? t('notProvided')
            : formatBitrate(webRtc.availableOutgoingBitrate)), fact(t('bytesSent'), webRtc.bytesSent === undefined ? t('notProvided') : formatByteSize(webRtc.bytesSent)), fact(t('bytesReceived'), webRtc.bytesReceived === undefined ? t('notProvided') : formatByteSize(webRtc.bytesReceived)))), React.createElement('p', null, t('connectionRouteEncrypted'))))));
    }
    return RemoteSessionHeaderAction;
}
export function hideLocalSessionActions() {
    const selector = 'button,a,[role="button"]';
    const hiddenAttribute = 'data-dsh-remote-hidden-action';
    const localAction = /(?:open|打开).{0,12}vs\s*code|vs\s*code.{0,12}(?:open|打开)|session\s*logs?|download.{0,12}session\s*logs?|会话日志|下载.{0,8}日志/i;
    const inspect = (root) => {
        const candidates = root instanceof Element && root.matches(selector)
            ? [root, ...Array.from(root.querySelectorAll(selector))]
            : Array.from(root.querySelectorAll(selector));
        for (const candidate of candidates) {
            if (candidate.closest('.dshRemoteSessionHeader') !== null)
                continue;
            const label = [
                candidate.getAttribute('aria-label'),
                candidate.getAttribute('title'),
                candidate.getAttribute('data-tooltip'),
                candidate.textContent,
            ].filter(Boolean).join(' ');
            if (localAction.test(label))
                candidate.setAttribute(hiddenAttribute, '');
        }
    };
    inspect(document.body);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'attributes')
                inspect(record.target);
            for (const node of Array.from(record.addedNodes)) {
                if (node instanceof Element)
                    inspect(node);
            }
        }
    });
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'data-tooltip'],
    });
    return () => {
        observer.disconnect();
        document.querySelectorAll(`[${hiddenAttribute}]`).forEach(element => element.removeAttribute(hiddenAttribute));
    };
}
export function createRemoteHostReferenceView(React) {
    return function RemoteHostReferenceView() {
        const [reference, setReference] = React.useState(undefined);
        React.useEffect(() => {
            const onReference = (event) => {
                const detail = event.detail;
                if (detail && typeof detail === 'object' && typeof detail.label === 'string' && typeof detail.platform === 'string' && typeof detail.deviceId === 'string' && typeof detail.invocation === 'string')
                    setReference(detail);
            };
            window.addEventListener('dsh-remote-host-reference', onReference);
            return () => window.removeEventListener('dsh-remote-host-reference', onReference);
        }, []);
        if (!reference)
            return React.createElement('div', { className: 'dshRemoteHostReferenceEmpty' }, '点击消息中的主机引用查看详情');
        const row = (label, value, mono = false) => React.createElement('div', null, React.createElement('dt', null, label), React.createElement('dd', { className: mono ? 'isMono' : undefined }, value));
        return React.createElement('section', { className: 'dshRemoteHostReferenceView' }, React.createElement('h2', null, reference.label), React.createElement('dl', null, row('系统', reference.platform), row('设备 ID', reference.deviceId, true), row('远端调用', reference.invocation)));
    };
}
//# sourceMappingURL=header.js.map
import { observedConnectionProgress, transportDiagnosticLabel } from './presentation.js';
export function createRemoteProgressView(React) {
    function RemoteProgressView(props) {
        const progress = props.progress;
        if (progress === undefined)
            return null;
        const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
        const activeTransports = new Set(progress.activeTransports ?? []);
        const detail = progress.transports !== undefined && activeTransports.size > 0
            ? React.createElement('span', { className: 'dshRemoteProgressRoute' }, props.t(progress.routeVerb === 'using' ? 'remoteProgressUsingPrefix' : 'remoteProgressTryingPrefix'), progress.transports.map((transport, index) => React.createElement(React.Fragment, { key: `${transport}:${index}` }, index === 0 ? null : React.createElement('span', { className: 'dshRemoteProgressRouteArrow', 'aria-hidden': true }, ' -> '), React.createElement('span', {
                className: activeTransports.has(transport) ? 'isActive' : undefined,
            }, transportDiagnosticLabel(transport)))))
            : props.t(progress.detail);
        return React.createElement('div', {
            className: 'dshRemoteProgress',
            role: 'status',
            'aria-live': 'polite',
        }, React.createElement('div', { className: 'dshRemoteProgressHeader' }, React.createElement('strong', null, props.t(progress.label)), React.createElement('span', null, `${percent}%`)), React.createElement('p', null, detail), React.createElement('div', {
            className: 'dshRemoteProgressBar',
            role: 'progressbar',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': percent,
            'aria-label': props.t(progress.label),
        }, React.createElement('span', { style: { transform: `scaleX(${percent / 100})` } })));
    }
    return RemoteProgressView;
}
export async function runConnectHostProgress(preferredTransports, targetDeviceId, control, connectedStep, setProgress, progressRun, action, readyProgress) {
    const runId = progressRun.current + 1;
    progressRun.current = runId;
    let polling = true;
    let pollTimer;
    let connectedAt;
    const apply = (next) => {
        if (progressRun.current === runId)
            setProgress(next);
    };
    const poll = async () => {
        try {
            const status = await control('status');
            if (!polling || progressRun.current !== runId)
                return;
            const isConnected = status.connectionProgress?.phase === 'connected'
                || status.connectedTargetDeviceId === targetDeviceId;
            if (isConnected && connectedAt === undefined)
                connectedAt = Date.now();
            const next = observedConnectionProgress(status, targetDeviceId, preferredTransports, connectedStep, connectedAt);
            if (next !== undefined)
                apply(next);
        }
        catch {
            // The primary action owns failure reporting. A missed status sample
            // must not replace it with a secondary progress error.
        }
        finally {
            if (polling && progressRun.current === runId) {
                pollTimer = window.setTimeout(() => { void poll(); }, 300);
            }
        }
    };
    apply({ label: 'remoteProgressCheckingHost', detail: 'remoteProgressCheckingHostDetail', percent: 12 });
    const pending = action();
    void poll();
    try {
        const result = await pending;
        polling = false;
        if (pollTimer !== undefined)
            window.clearTimeout(pollTimer);
        apply(readyProgress?.(result) ?? { label: 'remoteProgressReady', detail: 'remoteProgressReadyDetail', percent: 100 });
        await new Promise(resolve => window.setTimeout(resolve, 520));
        return result;
    }
    finally {
        polling = false;
        if (pollTimer !== undefined)
            window.clearTimeout(pollTimer);
        if (progressRun.current === runId)
            setProgress(undefined);
    }
}
//# sourceMappingURL=progress.js.map
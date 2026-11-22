import QRCode from 'qrcode';
import { messageOf } from './presentation.js';
export function createHostPairingPanel(React) {
    return function HostPairingPanel(props) {
        const { t } = props;
        const [view, setView] = React.useState(undefined);
        const [image, setImage] = React.useState(undefined);
        const [now, setNow] = React.useState(Date.now());
        const [code, setCode] = React.useState('');
        const [busy, setBusy] = React.useState(false);
        const [locked, setLocked] = React.useState(false);
        const [error, setError] = React.useState(undefined);
        const mounted = React.useRef(false);
        const flight = React.useRef(false);
        const epoch = React.useRef(0);
        const hydratedServer = React.useRef(undefined);
        const prevServerUrl = React.useRef(props.serverUrl);
        const attempts = React.useRef(new Set());
        const completed = React.useRef(undefined);
        const completing = React.useRef(undefined);
        const completion = React.useRef(props.onComplete);
        completion.current = props.onComplete;
        const runComplete = async () => {
            const pending = completing.current ?? (async () => completion.current())();
            completing.current = pending;
            try {
                await pending;
            }
            finally {
                if (completing.current === pending)
                    completing.current = undefined;
            }
        };
        const triggerComplete = async (sessionId) => {
            if (completed.current === sessionId)
                return;
            completed.current = sessionId;
            const currentEpoch = epoch.current;
            try {
                await runComplete();
            }
            catch (reason) {
                if (completed.current === sessionId)
                    completed.current = undefined;
                if (mounted.current && currentEpoch === epoch.current)
                    setError(messageOf(reason, t));
            }
        };
        const apply = (next) => {
            if (!mounted.current)
                return;
            if (next && !['created', 'claimed', 'approved'].includes(next.state))
                attempts.current.delete(next.sessionId);
            setView(next);
            setLocked(next?.canRetry === true || next !== undefined && attempts.current.has(next.sessionId));
            if (next?.localSaved)
                void triggerComplete(next.sessionId);
        };
        React.useEffect(() => {
            mounted.current = true;
            return () => { mounted.current = false; };
        }, []);
        React.useEffect(() => {
            if (prevServerUrl.current === props.serverUrl)
                return;
            prevServerUrl.current = props.serverUrl;
            hydratedServer.current = undefined;
            epoch.current += 1;
            completed.current = undefined;
            completing.current = undefined;
            attempts.current.clear();
            setView(undefined);
            setLocked(false);
            setCode('');
            setError(undefined);
        }, [props.serverUrl]);
        React.useEffect(() => {
            if (props.disabled || !props.serverUrl || hydratedServer.current === props.serverUrl)
                return;
            let cancelled = false;
            const currentEpoch = epoch.current;
            const hydrate = async () => {
                if (flight.current)
                    return;
                try {
                    const next = await props.control('host.pairing.status');
                    if (cancelled || !mounted.current || currentEpoch !== epoch.current)
                        return;
                    hydratedServer.current = props.serverUrl;
                    apply(next);
                }
                catch { /* foreground actions own errors */ }
            };
            void hydrate();
            return () => { cancelled = true; };
        }, [props.serverUrl, props.disabled]);
        const active = view !== undefined && ['created', 'claimed', 'approved'].includes(view.state);
        React.useEffect(() => {
            if (!active || props.disabled || !props.serverUrl)
                return;
            let cancelled = false;
            let timer;
            const schedulePoll = () => {
                if (cancelled || !mounted.current)
                    return;
                timer = setTimeout(() => { void poll(); }, 2500);
            };
            const poll = async () => {
                if (cancelled || !mounted.current)
                    return;
                if (!flight.current) {
                    const currentEpoch = epoch.current;
                    try {
                        const next = await props.control('host.pairing.status');
                        if (!cancelled && mounted.current && currentEpoch === epoch.current)
                            apply(next);
                    }
                    catch { /* foreground actions own errors */ }
                }
                schedulePoll();
            };
            schedulePoll();
            return () => {
                cancelled = true;
                if (timer !== undefined)
                    clearTimeout(timer);
            };
        }, [active, props.serverUrl, props.disabled]);
        React.useEffect(() => {
            let current = true;
            setImage(undefined);
            if (view?.qrPayload)
                void QRCode.toDataURL(view.qrPayload, { width: 184, margin: 1, errorCorrectionLevel: 'L' })
                    .then(value => { if (current)
                    setImage(value); }).catch(() => { if (current)
                    setError(t('pairingError')); });
            return () => { current = false; };
        }, [view?.qrPayload]);
        const run = async (action, retry = false) => {
            if (flight.current)
                return;
            flight.current = true;
            const currentEpoch = ++epoch.current;
            setBusy(true);
            setError(undefined);
            if (action === 'confirm') {
                if (view)
                    attempts.current.add(view.sessionId);
                setLocked(true);
                setCode('');
            }
            try {
                const next = await props.control('host.pairing.' + action, action === 'start' ? {} : {
                    sessionId: view?.sessionId, ...(action === 'confirm' && !retry ? { verificationCode: code } : {}),
                });
                if (!mounted.current || currentEpoch !== epoch.current)
                    return;
                hydratedServer.current = props.serverUrl;
                apply(next);
            }
            catch (reason) {
                if (mounted.current && currentEpoch === epoch.current) {
                    const e = reason;
                    setError(t(e.code === 'PAIRING_UNSUPPORTED' || e.details?.remoteCode === 'PAIRING_UNSUPPORTED' ? 'pairingUnsupported' : 'pairingError'));
                }
            }
            finally {
                flight.current = false;
                if (mounted.current)
                    setBusy(false);
            }
        };
        const finish = async () => {
            if (flight.current)
                return;
            flight.current = true;
            const currentEpoch = ++epoch.current;
            setBusy(true);
            setError(undefined);
            try {
                await runComplete();
                if (!mounted.current || currentEpoch !== epoch.current)
                    return;
                completed.current = undefined;
                setView(undefined);
                setLocked(false);
                setCode('');
            }
            catch (reason) {
                if (mounted.current && currentEpoch === epoch.current)
                    setError(messageOf(reason, t));
            }
            finally {
                flight.current = false;
                if (mounted.current)
                    setBusy(false);
            }
        };
        React.useEffect(() => {
            if (!active)
                return;
            setNow(Date.now());
            const timer = setInterval(() => setNow(Date.now()), 1000);
            return () => clearInterval(timer);
        }, [active, view?.expiresAt]);
        const remaining = view === undefined ? 0 : Math.max(0, Math.ceil((new Date(view.expiresAt).getTime() - now) / 1000));
        const remainingText = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
        const retry = locked || view?.canRetry || view?.state === 'approved';
        const status = view === undefined ? 'pairingHint' : view.state === 'created' ? 'pairingScan'
            : view.state === 'claimed' ? 'pairingEnter' : view.state === 'completed' ? 'pairingComplete'
                : view.state === 'approved' ? 'pairingPending' : 'pairingClosed';
        const instructionLines = t(status).split('\n');
        const countdown = !active ? null : React.createElement('span', { className: 'dshRemotePairingCountdown', role: 'timer' }, remaining > 0 ? t('pairingExpires', { time: remainingText }) : t('pairingExpired'));
        return React.createElement('section', { className: 'dshRemotePairing', 'aria-label': t('pairingTitle') }, React.createElement('div', { className: 'dshRemotePairingHeading' }, React.createElement('p', { role: 'status', 'aria-live': 'polite', className: 'dshRemotePairingInstructions' }, ...instructionLines.flatMap((line, lineIndex) => [React.createElement('span', { key: lineIndex, className: lineIndex === 0 ? 'dshRemotePairingInstructionPrimary' : 'dshRemotePairingInstructionSecondary' }, ...line.split('DSH Go').flatMap((part, index) => index === 0 ? [part] : [React.createElement('a', { key: index, href: 'https://github.com/ccch1mneyyy/dsh-go', target: '_blank', rel: 'noopener noreferrer' }, 'DSH Go'), part])), lineIndex < instructionLines.length - 1 ? React.createElement('br', { key: `break-${lineIndex}` }) : null])), active && view?.state !== 'created' ? countdown : null), props.disabled ? React.createElement('p', null, t('pairingSaveServer')) : null, image === undefined ? null : React.createElement('img', { src: image, width: 200, height: 200, alt: t('pairingQr'), className: 'dshRemotePairingQr' }), view?.state !== 'created' ? null : React.createElement('div', { className: 'dshRemotePairingQrActions' }, countdown, React.createElement('button', { type: 'button', className: 'dshRemoteDiscard', disabled: busy || props.disabled,
            onClick: () => void run('cancel') }, t(busy ? 'pairingBusy' : 'pairingCancel'))), view?.mobile === undefined ? null : React.createElement('p', { className: 'dshRemotePairingIdentity' }, React.createElement('strong', null, view.mobile.name), React.createElement('br'), React.createElement('code', null, view.mobile.fingerprint)), view?.state !== 'claimed' || retry ? null : React.createElement('form', { className: 'dshRemotePairingCodeForm', onSubmit: (event) => {
                event.preventDefault();
                // Reject synthetic dispatch; this is not a claim of protection from OS automation.
                if (event.nativeEvent?.isTrusted && /^[0-9]{8}$/.test(code))
                    void run('confirm');
            } }, React.createElement('label', null, t('pairingCode'), React.createElement('input', {
            type: 'text', inputMode: 'numeric', autoComplete: 'off', pattern: '[0-9]{8}', maxLength: 8, value: code, disabled: busy,
            onChange: (event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 8)),
        })), React.createElement('p', { className: 'dshRemotePairingCodeWarning' }, t('pairingWarning')), React.createElement('div', { className: 'dshRemotePairingCodeActions' }, React.createElement('button', { type: 'submit', className: 'dshRemoteSave', disabled: busy || props.disabled || !/^[0-9]{8}$/.test(code) }, t('pairingConfirm')), React.createElement('button', { type: 'button', className: 'dshRemoteDiscard', disabled: busy || props.disabled, onClick: () => void run('cancel') }, t('pairingCancel')))), error === undefined ? null : React.createElement('p', { role: 'alert', className: 'dshRemoteError' }, error), React.createElement('div', { className: 'dshRemotePairingActions' }, active && retry ? React.createElement('button', { type: 'button', disabled: busy || props.disabled, className: 'dshRemoteSave',
            onClick: (event) => { if (event.nativeEvent?.isTrusted)
                void run('confirm', true); } }, t('pairingRetry')) : null, active && retry ? React.createElement('button', { type: 'button', className: 'dshRemoteDiscard', disabled: busy || props.disabled, onClick: () => void run('cancel') }, t('pairingCancel')) : null, view?.state === 'completed' ? React.createElement('button', { type: 'button', className: 'dshRemoteSave', disabled: busy || props.disabled,
            onClick: () => void finish() }, t(busy ? 'pairingBusy' : 'pairingDone')) : null, active || view?.state === 'completed' ? null : React.createElement('button', { type: 'button', className: 'dshRemoteSave', disabled: busy || props.disabled || !props.serverUrl,
            onClick: () => void run(active ? 'cancel' : 'start') }, t(busy ? 'pairingBusy' : active ? 'pairingCancel' : 'pairingStart'))));
    };
}
//# sourceMappingURL=pairing.js.map
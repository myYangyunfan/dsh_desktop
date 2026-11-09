import QRCode from 'qrcode';
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
        const attempts = React.useRef(new Set());
        const completed = React.useRef(undefined);
        const completion = React.useRef(props.onComplete);
        completion.current = props.onComplete;
        const apply = (next) => {
            if (!mounted.current)
                return;
            if (next && !['created', 'claimed', 'approved'].includes(next.state))
                attempts.current.delete(next.sessionId);
            setView(next);
            setLocked(next?.canRetry === true || next !== undefined && attempts.current.has(next.sessionId));
            if (next?.localSaved && completed.current !== next.sessionId) {
                completed.current = next.sessionId;
                completion.current();
            }
        };
        React.useEffect(() => {
            mounted.current = true;
            let timer;
            const poll = async () => {
                if (!flight.current && !props.disabled && props.serverUrl) {
                    try {
                        apply(await props.control('host.pairing.status'));
                    }
                    catch { /* foreground actions own errors */ }
                }
                if (mounted.current)
                    timer = setTimeout(() => void poll(), 2500);
            };
            void poll();
            return () => { mounted.current = false; if (timer)
                clearTimeout(timer); };
        }, [props.serverUrl, props.disabled]);
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
            setBusy(true);
            setError(undefined);
            if (action === 'confirm') {
                if (view)
                    attempts.current.add(view.sessionId);
                setLocked(true);
                setCode('');
            }
            try {
                apply(await props.control('host.pairing.' + action, action === 'start' ? {} : {
                    sessionId: view?.sessionId, ...(action === 'confirm' && !retry ? { verificationCode: code } : {}),
                }));
            }
            catch (reason) {
                if (mounted.current) {
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
        const active = view !== undefined && ['created', 'claimed', 'approved'].includes(view.state);
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
                void run('confirm', true); } }, t('pairingRetry')) : null, active && retry ? React.createElement('button', { type: 'button', className: 'dshRemoteDiscard', disabled: busy || props.disabled, onClick: () => void run('cancel') }, t('pairingCancel')) : null, active || view?.state === 'completed' ? null : React.createElement('button', { type: 'button', className: 'dshRemoteSave', disabled: busy || props.disabled || !props.serverUrl,
            onClick: () => void run(active ? 'cancel' : 'start') }, t(busy ? 'pairingBusy' : active ? 'pairingCancel' : 'pairingStart'))));
    };
}
//# sourceMappingURL=pairing.js.map
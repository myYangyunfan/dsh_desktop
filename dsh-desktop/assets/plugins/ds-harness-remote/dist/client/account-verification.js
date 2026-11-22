export function useAccountVerification(React, scope) {
    const [pending, setPending] = React.useState(undefined);
    const [code, setCode] = React.useState('');
    const clear = () => {
        setPending(undefined);
        setCode('');
    };
    React.useEffect(clear, [scope]);
    return {
        pending: pending !== undefined,
        ready: pending === undefined || code.trim().length > 0,
        verification: pending === undefined ? undefined : { ...pending, code },
        clear,
        handle(error) {
            const failure = error;
            if (failure?.code === 'TWO_FACTOR_EXPIRED')
                clear();
            if (failure?.code !== 'TWO_FACTOR_REQUIRED'
                || typeof failure.details?.challenge !== 'string' || typeof failure.details.serverUrl !== 'string')
                return false;
            setPending({ challenge: failure.details.challenge, serverUrl: failure.details.serverUrl });
            setCode('');
            return true;
        },
        fields(t, busy, ...passwordFields) {
            if (pending === undefined)
                return React.createElement(React.Fragment, null, ...passwordFields);
            return React.createElement(React.Fragment, null, React.createElement('input', {
                value: code, disabled: busy, autoComplete: 'one-time-code', maxLength: 64,
                placeholder: t('twoFactorCode'), 'aria-label': t('twoFactorCode'),
                onChange: (event) => setCode(event.target.value),
            }), React.createElement('button', { type: 'button', disabled: busy, onClick: clear }, t('twoFactorRestart')));
        },
    };
}
//# sourceMappingURL=account-verification.js.map
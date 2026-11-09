/** Shared copy for the controlling Client and the controlled Host. */
export function createServerNotice(React) {
    return function ServerNotice(props) {
        const { offline, linked, expiresAt, t } = props;
        const wasOffline = React.useRef(false);
        const hadLink = React.useRef(linked);
        const [restored, setRestored] = React.useState(false);
        const [now, setNow] = React.useState(Date.now());
        React.useEffect(() => {
            if (linked)
                hadLink.current = true;
            if (offline) {
                wasOffline.current = true;
                setRestored(false);
                setNow(Date.now());
                const timer = setInterval(() => setNow(Date.now()), 1000);
                return () => clearInterval(timer);
            }
            if (!wasOffline.current)
                return;
            wasOffline.current = false;
            setRestored(true);
            const timer = setTimeout(() => setRestored(false), 4000);
            return () => clearTimeout(timer);
        }, [offline, linked]);
        const seconds = expiresAt === undefined ? undefined : Math.max(0, Math.ceil((expiresAt - now) / 1000));
        const lost = hadLink.current && (!linked || (offline && seconds === 0));
        const text = props.compact
            ? lost ? t('serverLinkDisconnected')
                : offline ? linked && seconds !== undefined
                    ? t('serverUnavailableCountdown', { seconds }) : t('serverUnavailableShort')
                    : linked ? t('remoteLinkEncrypted') : undefined
            : lost ? t('serverLinkDisconnected')
                : offline && linked && seconds !== undefined ? t(props.countdownOnly ? 'connectionHoldCountdown' : 'serverUnavailableCountdown', { seconds })
                    : offline ? t('serverUnavailableShort')
                        : restored ? t('serverRestored') : undefined;
        return text === undefined ? null : React.createElement('span', {
            className: props.compact && !offline && !lost
                ? 'dshRemoteEncrypted'
                : `dshRemoteServerNotice${lost ? ' isError' : offline ? ' isWarning' : ' isRestored'}`,
            role: 'status', 'aria-live': 'polite',
        }, text, lost && props.onReconnect ? React.createElement('button', {
            type: 'button', onClick: props.onReconnect,
        }, t('reconnect')) : null);
    };
}
//# sourceMappingURL=server-notice.js.map
/** Reopen native read subscriptions after a fresh authenticated carrier is ready. */
export function subscribeRemoteRecovery(feed, reconnect) {
    let previous;
    return feed.subscribe(status => {
        const recovered = status.mode === 'remote' && status.connected === true
            && previous?.mode === 'remote' && previous.target?.deviceId === status.target?.deviceId
            && status.recoveryGeneration !== undefined
            && status.recoveryGeneration !== previous.recoveryGeneration;
        previous = status;
        if (recovered)
            reconnect();
    });
}
//# sourceMappingURL=client-recovery.js.map
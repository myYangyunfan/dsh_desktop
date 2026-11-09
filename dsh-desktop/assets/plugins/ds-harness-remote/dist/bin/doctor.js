export function doctor(runtime) {
    const state = runtime.diagnostics();
    return [
        'DSH Remote doctor',
        `Plugin: ${state.loaded ? 'loaded' : 'starting'}`,
        `Identity: ${state.identityValid ? `valid (${state.deviceId})` : 'unavailable'}`,
        `Server: ${state.serverConfigured ? state.serverOnline ? 'online' : 'configured, offline' : 'not configured'}`,
        ...(state.serverError === undefined ? [] : [`Server error: ${state.serverError}`]),
        `Peer channel: ${state.online ? 'online' : 'offline'}`,
        `Trusted devices: ${state.trustedPeers}`,
    ].join('\n');
}
//# sourceMappingURL=doctor.js.map
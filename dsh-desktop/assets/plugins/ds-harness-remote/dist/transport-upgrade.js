import { TRANSPORT_UPGRADE_CAPABILITY, createEvent, transportTierRank, transportUpgradeAbortSchema, transportUpgradeActivateSchema, transportUpgradeDrainSchema, transportUpgradeIceSchema, transportUpgradeOfferSchema, unwrapUpgradedTransportFrame, wrapUpgradedTransportFrame, } from '@dsh-remote/protocol';
import { RtcDataChannelTransport, } from '@dsh-remote/webrtc';
import { RpcError } from './safe-error.js';
export { TRANSPORT_UPGRADE_CAPABILITY, wrapUpgradedTransportFrame, unwrapUpgradedTransportFrame };
/**
 * Per-connection responder for in-band WebRTC transport upgrades
 * (`Relay -> TURN -> P2P -> LAN`).
 *
 * Path tier classification strictly trusts the Host's own verified ICE
 * candidate-pair stats (`rtc.connectionDetails()`); client hints can never
 * elevate a lower-tier path into `LAN` or `P2P`.
 */
export class TransportUpgradeHost {
    options;
    candidate;
    closed = false;
    offerEpoch = 0;
    activating = false;
    constructor(options) {
        this.options = options;
    }
    async offer(rawParams) {
        if (this.closed)
            throw new RpcError('INVALID_MESSAGE', 'The connection is closed.');
        const { attemptId, sdp } = transportUpgradeOfferSchema.parse(rawParams);
        const current = this.options.currentMode();
        if (current === 'LAN') {
            throw new RpcError('REQUEST_CONFLICT', 'Transport is already at LAN tier.');
        }
        const epoch = ++this.offerEpoch;
        await this.clearCandidate();
        const factory = await this.options.loadRtcFactory();
        if (this.closed || epoch !== this.offerEpoch) {
            throw new RpcError('REQUEST_CONFLICT', 'Transport upgrade offer was superseded.');
        }
        if (factory === undefined) {
            throw new RpcError('CAPABILITY_NOT_SUPPORTED', 'WebRTC is unavailable on this Host.');
        }
        let iceServers = [];
        try {
            iceServers = await this.options.fetchIceServers(this.options.connectionId);
        }
        catch {
            iceServers = [];
        }
        if (this.closed || epoch !== this.offerEpoch) {
            throw new RpcError('REQUEST_CONFLICT', 'Transport upgrade offer was superseded.');
        }
        let answerResolve;
        let answerReject;
        const answerReady = new Promise((resolve, reject) => {
            answerResolve = resolve;
            answerReject = reject;
        });
        const rtc = new RtcDataChannelTransport({
            role: 'responder',
            factory,
            iceServers,
            negotiateTimeoutMs: 12_000,
            onSignal: signal => {
                if (this.closed)
                    return;
                if (signal.type === 'answer') {
                    answerResolve?.(signal.sdp);
                    return;
                }
                if (signal.type === 'ice' && this.candidate?.attemptId === attemptId && !this.candidate.activated) {
                    void this.options.publishEvent(createEvent('remote.transport.upgrade.ice', {
                        attemptId,
                        candidate: signal.candidate,
                    })).catch(() => undefined);
                }
            },
        });
        const unsubscribeMessage = rtc.onMessage(frame => {
            try {
                const parsed = unwrapUpgradedTransportFrame(frame);
                this.options.onReceiveSequencedCiphertext(parsed.counter, parsed.ciphertext, rtc);
            }
            catch {
                void rtc.close().catch(() => undefined);
            }
        });
        const unsubscribeClose = rtc.onClose(() => {
            if (this.candidate?.attemptId === attemptId && !this.candidate.activated) {
                void this.clearCandidate();
            }
        });
        const expiryTimer = setTimeout(() => {
            if (this.candidate?.attemptId === attemptId && !this.candidate.activated) {
                void this.clearCandidate();
            }
        }, this.options.attemptTtlMs ?? 20_000);
        expiryTimer.unref?.();
        const attempt = {
            attemptId,
            rtc,
            unsubscribeMessage,
            unsubscribeClose,
            expiryTimer,
            activated: false,
        };
        this.candidate = attempt;
        void rtc.connect().catch(err => {
            answerReject?.(err instanceof Error ? err : new Error(String(err)));
        });
        rtc.handleSignal({ type: 'offer', sdp });
        let timer;
        try {
            const answerSdp = await Promise.race([
                answerReady,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Timed out creating WebRTC upgrade answer.')), 8_000);
                    timer.unref?.();
                }),
            ]);
            if (this.closed || this.candidate !== attempt) {
                await this.disposeAttempt(attempt, true);
                throw new RpcError('REQUEST_CONFLICT', 'Transport upgrade offer was superseded.');
            }
            return { attemptId, sdp: answerSdp };
        }
        catch (error) {
            if (this.candidate === attempt)
                await this.clearCandidate();
            else
                await this.disposeAttempt(attempt, true);
            if (error instanceof RpcError)
                throw error;
            throw new RpcError('CONNECTION_FAILED', error instanceof Error ? error.message : 'Failed to negotiate WebRTC upgrade.', true);
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
        }
    }
    async addIce(rawParams) {
        const { attemptId, candidate } = transportUpgradeIceSchema.parse(rawParams);
        if (this.closed || this.candidate?.attemptId !== attemptId)
            return { ok: true };
        this.candidate.rtc.handleSignal({ type: 'ice', candidate: candidate });
        return { ok: true };
    }
    async activate(rawParams) {
        if (this.closed)
            throw new RpcError('INVALID_MESSAGE', 'The connection is closed.');
        if (this.activating)
            throw new RpcError('REQUEST_CONFLICT', 'Another transport activation is already in progress.');
        const { attemptId } = transportUpgradeActivateSchema.parse(rawParams);
        const attempt = this.candidate;
        if (attempt === undefined || attempt.attemptId !== attemptId) {
            throw new RpcError('REQUEST_CONFLICT', 'Transport upgrade attempt is no longer active.');
        }
        this.activating = true;
        try {
            let timer;
            try {
                await Promise.race([
                    attempt.rtc.connect(),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Timed out waiting for upgraded DataChannel to open.')), 6_000);
                        timer.unref?.();
                    }),
                ]);
            }
            finally {
                if (timer !== undefined)
                    clearTimeout(timer);
            }
            if (this.closed || this.candidate !== attempt) {
                await this.disposeAttempt(attempt, true);
                return { activated: false, mode: this.options.currentMode() ?? 'Relay' };
            }
            // Authoritative path verification: only Host-observed ICE stats determine tier.
            // Poll briefly (up to 200ms) if native stats have not populated the nominated pair yet.
            let verifiedMode;
            for (let i = 0; i < 5; i += 1) {
                const details = await attempt.rtc.connectionDetails().catch(() => undefined);
                verifiedMode = details?.mode;
                if (verifiedMode !== undefined)
                    break;
                if (i < 4)
                    await new Promise(resolve => setTimeout(resolve, 40));
            }
            if (this.closed || this.candidate !== attempt) {
                await this.disposeAttempt(attempt, true);
                return { activated: false, mode: this.options.currentMode() ?? 'Relay' };
            }
            const beforeMode = this.options.currentMode() ?? 'Relay';
            if (verifiedMode === undefined || transportTierRank(verifiedMode) <= transportTierRank(beforeMode)) {
                await this.clearCandidate();
                return { activated: false, mode: beforeMode };
            }
            clearTimeout(attempt.expiryTimer);
            attempt.unsubscribeClose();
            attempt.activated = true;
            this.candidate = undefined;
            const hostPreviousLegEndCounter = await this.options.adoptRtc(attempt.rtc, verifiedMode, attemptId);
            this.options.logger?.info('in-band transport upgraded', {
                connectionId: this.options.connectionId.slice(0, 8),
                from: beforeMode,
                to: verifiedMode,
            });
            return {
                activated: true,
                mode: verifiedMode,
                previousLegEndCounter: hostPreviousLegEndCounter,
            };
        }
        finally {
            this.activating = false;
        }
    }
    async drain(rawParams) {
        const { attemptId, previousLegEndCounter } = transportUpgradeDrainSchema.parse(rawParams);
        if (!this.closed) {
            this.options.confirmPreviousLegDrain?.(attemptId, previousLegEndCounter);
        }
        return { ok: true };
    }
    async abort(rawParams) {
        const { attemptId } = transportUpgradeAbortSchema.parse(rawParams ?? {});
        if (attemptId === undefined || this.candidate?.attemptId === attemptId) {
            await this.clearCandidate();
        }
        return { ok: true };
    }
    async closeAll() {
        this.closed = true;
        this.offerEpoch += 1;
        await this.clearCandidate();
    }
    async clearCandidate() {
        const current = this.candidate;
        if (current === undefined)
            return;
        this.candidate = undefined;
        await this.disposeAttempt(current, !current.activated);
    }
    async disposeAttempt(attempt, closeRtc) {
        clearTimeout(attempt.expiryTimer);
        attempt.unsubscribeClose();
        if (closeRtc) {
            attempt.unsubscribeMessage();
            await attempt.rtc.close().catch(() => undefined);
        }
    }
}
//# sourceMappingURL=transport-upgrade.js.map
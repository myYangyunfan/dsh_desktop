import { SerialSend } from '@dsh-remote/webrtc';
import { NoiseIkSession, createNoisePrologue } from '@dsh-remote/crypto';
import { SecureMessageCodec, MAX_SECURE_MESSAGE_BYTES } from '@dsh-remote/protocol';
/** Client-side Noise IK wrapper used by the local Harness remote-mode runtime. */
export class ClientSecureTransport {
    inner;
    identity;
    host;
    noise;
    unsubscribeInner;
    incoming = new SecureMessageCodec();
    outgoing = new SecureMessageCodec();
    closed = false;
    lifetime;
    sends = new SerialSend();
    closeError;
    constructor(inner, identity, host) {
        this.inner = inner;
        this.identity = identity;
        this.host = host;
    }
    async connect() {
        const lifetime = new AbortController();
        this.lifetime = lifetime;
        this.closed = false;
        this.closeError = undefined;
        this.incoming.reset();
        this.outgoing.reset();
        await this.inner.connect();
        lifetime.signal.throwIfAborted();
        const info = this.inner.connectionInfo();
        if (info.localDeviceId !== this.identity.deviceId || info.remoteDeviceId !== this.host.deviceId) {
            await this.inner.close();
            throw Object.assign(new Error('The relay connection is bound to an unexpected device.'), { code: 'PEER_IDENTITY_MISMATCH' });
        }
        const noise = new NoiseIkSession({
            role: 'initiator',
            localPrivateKey: this.identity.privateKey,
            localPublicKey: this.identity.publicKey,
            remotePublicKey: this.host.publicKey,
            prologue: createNoisePrologue(info.connectionId, this.host.deviceId, this.identity.deviceId),
        });
        this.noise = noise;
        try {
            await waitForResponder(this.inner, noise, lifetime.signal);
            this.inner.markSecureReady?.();
        }
        catch (error) {
            noise.destroy();
            if (this.lifetime === lifetime) {
                this.noise = undefined;
                await this.inner.close();
            }
            throw error;
        }
    }
    async send(data) {
        if (data.byteLength > MAX_SECURE_MESSAGE_BYTES)
            throw new Error('Secure message exceeds the reassembly limit.');
        const noise = this.requireNoise();
        try {
            await this.sends.run(data.byteLength, async () => {
                if (this.closed || this.noise !== noise)
                    throw new Error('Secure transport replaced');
                for (const plaintext of this.outgoing.encode(data))
                    await this.inner.send(noise.encrypt(plaintext));
            });
        }
        catch (error) {
            await this.close().catch(() => undefined);
            throw error;
        }
    }
    onMessage(handler) {
        this.unsubscribeInner?.();
        this.unsubscribeInner = this.inner.onMessage(data => {
            const noise = this.noise;
            if (noise === undefined || !noise.complete || this.closed)
                return;
            try {
                const message = this.incoming.decode(noise.decrypt(data));
                if (message !== undefined)
                    handler(message);
            }
            catch {
                this.closeError = Object.assign(new Error('The authenticated Remote channel rejected a frame.'), { code: 'SECURE_CHANNEL_FAILED' });
                void this.close();
            }
        });
        return () => {
            this.unsubscribeInner?.();
            this.unsubscribeInner = undefined;
        };
    }
    onClose(handler) {
        return this.inner.onClose?.(error => handler(this.closeError ?? error)) ?? (() => undefined);
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.lifetime?.abort();
        this.lifetime = undefined;
        this.unsubscribeInner?.();
        this.unsubscribeInner = undefined;
        this.incoming.reset();
        this.outgoing.reset();
        this.noise?.destroy();
        this.noise = undefined;
        await this.inner.close();
    }
    getStats() { return this.inner.getStats(); }
    requireNoise() {
        if (this.noise === undefined || !this.noise.complete || this.closed) {
            throw new Error('The authenticated Noise channel is not connected.');
        }
        return this.noise;
    }
}
async function waitForResponder(inner, noise, signal) {
    await new Promise((resolve, reject) => {
        let settled = false;
        let unsubscribe = () => { };
        let unsubscribeClose = () => { };
        const timer = setTimeout(() => finish(new Error('Noise IK handshake timed out.')), 10_000);
        const onAbort = () => finish(new Error('Noise IK handshake was aborted.'));
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            unsubscribeClose();
            signal.removeEventListener('abort', onAbort);
            if (error === undefined)
                resolve();
            else
                reject(error);
        };
        unsubscribe = inner.onHandshake((step, data) => {
            if (settled)
                return;
            try {
                if (step !== 2)
                    throw new Error('Noise IK responder sent an out-of-order handshake message.');
                noise.readHandshake(data);
                if (!noise.complete)
                    throw new Error('Noise IK handshake did not complete.');
                finish();
            }
            catch (error) {
                finish(Object.assign(error instanceof Error ? error : new Error('Noise IK handshake failed.'), { code: 'SECURE_CHANNEL_FAILED' }));
            }
        });
        unsubscribeClose = inner.onClose?.(error => finish(error ?? new Error('Control channel closed during Noise IK handshake.'))) ?? (() => { });
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
            onAbort();
            return;
        }
        void inner.sendHandshake(1, noise.writeHandshake()).catch(error => {
            finish(error instanceof Error ? error : new Error('Noise IK handshake failed.'));
        });
    });
}
//# sourceMappingURL=client-secure-transport.js.map
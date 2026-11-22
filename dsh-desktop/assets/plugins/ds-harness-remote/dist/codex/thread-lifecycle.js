import { RpcError } from '../safe-error.js';
export class CodexThreadLifecycle {
    retained;
    unsubscribe;
    released;
    failed;
    closeTimeoutMs;
    threads = new Map();
    constructor(retained, unsubscribe, released, failed, closeTimeoutMs = 5_000) {
        this.retained = retained;
        this.unsubscribe = unsubscribe;
        this.released = released;
        this.failed = failed;
        this.closeTimeoutMs = closeTimeoutMs;
    }
    async use(threadId, action) {
        const state = this.state(threadId);
        state.uses += 1;
        try {
            await state.release;
            if (this.threads.get(threadId) !== state)
                throw new RpcError('CODEX_UNAVAILABLE', 'The Codex App Server changed while handling the request.');
            return await action();
        }
        finally {
            state.uses -= 1;
            await this.settle(threadId, state);
        }
    }
    active(threadId, active) {
        const state = this.state(threadId);
        state.active = active;
        state.activityVersion += 1;
        if (!active)
            void this.settle(threadId, state);
    }
    starting(threadId) {
        const state = this.state(threadId);
        const version = state.activityVersion;
        return accepted => {
            if (accepted && this.threads.get(threadId) === state && state.activityVersion === version) {
                state.active = true;
            }
        };
    }
    async retry(threadId) {
        const state = this.threads.get(threadId);
        if (state !== undefined)
            await this.settle(threadId, state);
    }
    async release(threadId) {
        const state = this.state(threadId);
        state.pending = true;
        await this.settle(threadId, state);
    }
    isReleasing(threadId) {
        return this.threads.get(threadId)?.releasing === true;
    }
    closed(threadId) {
        const state = this.threads.get(threadId);
        state?.closed?.();
        if (state !== undefined) {
            state.active = false;
            state.activityVersion += 1;
            state.pending = false;
            state.releasing = false;
            state.release = undefined;
            state.closed = undefined;
            if (state.uses === 0)
                this.threads.delete(threadId);
        }
        this.released(threadId);
    }
    reset() {
        const states = [...this.threads.values()];
        this.threads.clear();
        for (const state of states)
            state.closed?.();
    }
    state(threadId) {
        let state = this.threads.get(threadId);
        if (state === undefined) {
            state = { uses: 0, active: false, activityVersion: 0, pending: false, releasing: false };
            this.threads.set(threadId, state);
        }
        return state;
    }
    async settle(threadId, state) {
        if (this.threads.get(threadId) !== state || state.release !== undefined)
            return;
        if (state.uses > 0 || state.active || this.retained(threadId))
            return;
        if (!state.pending) {
            this.threads.delete(threadId);
            return;
        }
        state.releasing = true;
        const release = this.unload(threadId, state).finally(() => {
            if (state.release === release)
                state.releasing = false;
        });
        state.release = release;
        await release.catch(error => this.failed(error));
    }
    async unload(threadId, state) {
        let timer;
        let onClosed;
        const closed = new Promise((resolve, reject) => {
            onClosed = resolve;
            state.closed = resolve;
            timer = setTimeout(() => reject(new RpcError('CODEX_THREAD_CLOSING', 'The CodeX thread is still closing. Please retry shortly.')), this.closeTimeoutMs);
            timer.unref?.();
        });
        void closed.catch(() => undefined);
        try {
            const result = await this.unsubscribe(threadId);
            if (typeof result === 'object' && result !== null && 'status' in result && result.status === 'notLoaded') {
                if (this.threads.get(threadId) === state && state.closed === onClosed)
                    this.closed(threadId);
            }
            else if (this.threads.get(threadId) === state && state.closed === onClosed) {
                await closed;
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
}
//# sourceMappingURL=thread-lifecycle.js.map
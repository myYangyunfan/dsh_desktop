const OPENCODE_DEFAULT_TITLE = /^(?:New|Child) session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Title recovery belongs to the browser-safe projection, never to a native database. */
export class AcpSessionTitles {
    backend;
    client;
    sessions;
    publish;
    pending = new Map();
    closed = false;
    constructor(backend, client, sessions, publish) {
        this.backend = backend;
        this.client = client;
        this.sessions = sessions;
        this.publish = publish;
    }
    nativeTitle(title) {
        const next = title?.trim();
        if (!next || next === 'Untitled Session' || (this.backend === 'opencode' && OPENCODE_DEFAULT_TITLE.test(next)))
            return undefined;
        return next;
    }
    applyNative(session, title) {
        const next = this.nativeTitle(title);
        if (this.closed || session.titleOverridden || !next || this.sessions.get(session.sessionId) !== session)
            return;
        session.titleFromPrompt = false;
        this.pending.get(session.sessionId)?.abort();
        if (next === session.title)
            return;
        session.title = next;
        this.publish(session.sessionId, next);
    }
    applyPrompt(session, text) {
        if (this.backend !== 'opencode' || this.closed || session.titleOverridden || session.titleFromPrompt
            || (!session.blank && this.nativeTitle(session.title) !== undefined))
            return;
        const next = Array.from(text?.replace(/\s+/g, ' ').trim() ?? '').slice(0, 60).join('');
        if (!next)
            return;
        session.titleFromPrompt = true;
        session.title = next;
        this.publish(session.sessionId, next);
    }
    async refresh(session) {
        if (this.backend === 'cursor' || this.closed || session.titleOverridden || !this.client.listSessions)
            return;
        this.pending.get(session.sessionId)?.abort();
        const controller = new AbortController();
        const signal = controller.signal;
        this.pending.set(session.sessionId, controller);
        const deadline = this.backend === 'opencode' ? setTimeout(() => controller.abort(), 20_000) : undefined;
        try {
            // OpenCode generates titles independently of the reply and does not always
            // forward renames over ACP. Recover late titles for at most twenty seconds.
            for (const delay of this.backend === 'opencode' ? [0, 1000, 3000, 6000, 9000] : [0]) {
                if (delay)
                    await waitForTitle(delay, signal);
                if (signal.aborted || this.closed || session.titleOverridden)
                    return;
                const previous = session.title;
                try {
                    const items = await this.client.listSessions(session.cwd, this.backend, 30, signal);
                    if (signal.aborted || this.sessions.get(session.sessionId) !== session || session.title !== previous)
                        return;
                    const current = items.find(item => item.conversationId === session.acpSessionId);
                    if (current && this.nativeTitle(current.title) !== undefined) {
                        this.applyNative(session, current.title);
                        return;
                    }
                }
                catch {
                    // Metadata recovery must never fail an already completed turn.
                }
            }
        }
        finally {
            if (deadline !== undefined)
                clearTimeout(deadline);
            if (this.pending.get(session.sessionId) === controller)
                this.pending.delete(session.sessionId);
        }
    }
    close() {
        this.closed = true;
        for (const controller of this.pending.values())
            controller.abort();
        this.pending.clear();
    }
}
function waitForTitle(delay, signal) {
    return new Promise(resolve => {
        const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, delay);
        signal.addEventListener('abort', finish, { once: true });
        if (signal.aborted)
            finish();
    });
}
//# sourceMappingURL=virtual-titles.js.map
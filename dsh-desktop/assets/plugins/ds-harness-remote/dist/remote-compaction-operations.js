import { randomUUID } from 'node:crypto';
import { RpcError } from './safe-error.js';
const MIN_BUDGET_MS = 60_000;
const MAX_BUDGET_MS = 7_200_000;
const DEFAULT_BUDGET_MS = 1_800_000;
/** Keep settled operations readable long enough for a reconnect to collect them. */
const RETENTION_MS = 600_000;
/** A cancel request waits this long for the command call to settle. */
const CANCEL_SETTLE_MS = 15_000;
/** Bound bound records so a client cannot create unbounded tasks. */
const MAX_OPERATIONS = 32;
function requestIndexKey(ownerDeviceId, sessionId, requestId) {
    return `${ownerDeviceId}\u0000${sessionId}\u0000${requestId}`;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function commandIdOf(result) {
    if (result?.ok !== true || !isRecord(result.value))
        return undefined;
    return typeof result.value.commandId === 'string' ? result.value.commandId : undefined;
}
export class RemoteCompactionOperations {
    runner;
    operations = new Map();
    requestIndex = new Map();
    confirm;
    logger;
    now;
    closed = false;
    constructor(runner, options = {}) {
        this.runner = runner;
        this.confirm = options.confirm;
        this.logger = options.logger;
        this.now = options.now ?? Date.now;
    }
    submit(params, owner) {
        if (this.closed)
            throw new RpcError('HARNESS_UNAVAILABLE', 'The Remote Host is shutting down.');
        this.prune();
        const key = requestIndexKey(owner.deviceId, params.sessionId, params.requestId);
        const existing = this.requestIndex.get(key);
        if (existing !== undefined) {
            const operation = this.operations.get(existing);
            if (operation !== undefined)
                return { operationId: operation.operationId, state: operation.state };
            this.requestIndex.delete(key);
        }
        // One unfinished compaction per Session: new request ids must not stack
        // work on top of a run whose handler may still be finishing.
        for (const operation of this.operations.values()) {
            if (operation.sessionId === params.sessionId && operation.finishedAt === undefined) {
                throw new RpcError('AGENT_BUSY', 'A compaction operation is already running for this Session.');
            }
        }
        if (this.operations.size >= MAX_OPERATIONS) {
            throw new RpcError('RATE_LIMITED', 'Too many Remote compaction operations are tracked by this Host.', undefined, true);
        }
        const budgetMs = clampBudget(params.budgetMs);
        const operation = this.createOperation(params, owner, budgetMs);
        this.operations.set(operation.operationId, operation);
        this.requestIndex.set(key, operation.operationId);
        this.logger?.info('remote compaction accepted', {
            operationId: operation.operationId,
            sessionId: operation.sessionId,
            budgetMs,
        });
        void this.run(operation);
        return { operationId: operation.operationId, state: 'accepted' };
    }
    async status(params, owner) {
        this.prune();
        const operation = this.find(params, owner);
        if (operation === undefined)
            return this.interrupted(params);
        if (operation.finishedAt === undefined && operation.commandSettledFlag
            && (operation.state === 'cancelling' || operation.state === 'unconfirmed')) {
            await this.reconcile(operation);
        }
        return this.view(operation);
    }
    async cancel(params, owner) {
        this.prune();
        const operation = this.find(params, owner);
        if (operation === undefined)
            return this.interrupted(params);
        if (operation.finishedAt !== undefined)
            return this.view(operation);
        if (!operation.cancelled) {
            operation.cancelled = true;
            operation.state = 'cancelling';
            operation.controller.abort(new Error('Remote compaction cancelled by the client.'));
            this.logger?.info('remote compaction cancellation requested', { operationId: operation.operationId });
        }
        // `withAbort` settles the command call early; reconciliation below waits for
        // the compaction lifecycle (or reports that it is still unconfirmed).
        await Promise.race([operation.commandSettled, delay(CANCEL_SETTLE_MS)]);
        if (operation.commandSettledFlag)
            await this.reconcile(operation);
        return this.view(operation);
    }
    /** Host shutdown: stop work and report every unfinished operation as interrupted. */
    closeAll() {
        this.closed = true;
        for (const operation of this.operations.values()) {
            if (operation.finishedAt !== undefined)
                continue;
            this.settle(operation, 'interrupted', 'The Remote Host shut down before the compaction finished.');
            operation.controller.abort(new Error('Remote Host shut down.'));
        }
    }
    createOperation(params, owner, budgetMs) {
        let resolveCommandSettled = () => { };
        const commandSettled = new Promise(resolve => { resolveCommandSettled = resolve; });
        return {
            operationId: randomUUID(),
            requestId: params.requestId,
            sessionId: params.sessionId,
            ownerDeviceId: owner.deviceId,
            budgetMs,
            acceptedAt: this.now(),
            controller: new AbortController(),
            commandSettled,
            resolveCommandSettled,
            state: 'accepted',
            cancelled: false,
            timedOut: false,
            commandSettledFlag: false,
            confirmation: 'pending',
        };
    }
    async run(operation) {
        operation.state = 'running';
        operation.startedAt = this.now();
        operation.timer = setTimeout(() => {
            operation.timedOut = true;
            operation.controller.abort(new Error('Remote compaction exceeded its budget.'));
        }, operation.budgetMs);
        let result;
        let thrown;
        try {
            result = await this.runner(operation.sessionId, operation.controller.signal);
        }
        catch (error) {
            thrown = error;
        }
        finally {
            if (operation.timer !== undefined) {
                clearTimeout(operation.timer);
                operation.timer = undefined;
            }
            operation.commandSettledFlag = true;
            operation.resolveCommandSettled();
        }
        operation.commandId = commandIdOf(result);
        if (result?.ok === true && isCommandSuccess(result)) {
            this.settle(operation, 'succeeded', commandText(result) ?? undefined);
            return;
        }
        // A stop request (cancel or budget) must not let us claim the handler is
        // gone: `withAbort` returns before the handler finishes. Inspect the Session
        // lifecycle instead, and keep `cancelling` while that is unconfirmed.
        if (operation.cancelled || operation.timedOut) {
            await this.reconcile(operation);
            return;
        }
        this.settle(operation, 'failed', this.commandFailureMessage(operation, result, thrown));
    }
    /**
     * Inspect the compaction lifecycle for a settled command call. A confirmed
     * `compaction/end` with an error marks the run stopped; a confirmed end
     * without error means it committed, but the final persistence result is no
     * longer observable after the abort.
     */
    async reconcile(operation) {
        if (operation.finishedAt !== undefined)
            return;
        if (!operation.commandSettledFlag)
            return;
        if (this.confirm === undefined) {
            operation.state = 'unconfirmed';
            operation.message = 'The Host cannot observe the compaction lifecycle for this run.';
            operation.finishedAt = this.now();
            return;
        }
        let confirmation;
        try {
            confirmation = await this.confirm(operation.sessionId, operation.acceptedAt, operation.commandId);
        }
        catch {
            confirmation = { kind: 'unknown' };
        }
        this.logger?.info('remote compaction confirmation', {
            operationId: operation.operationId,
            kind: confirmation.kind,
            ...(confirmation.kind === 'finished' ? { failed: confirmation.error !== undefined } : {}),
        });
        if (confirmation.kind === 'finished') {
            operation.confirmation = 'finished';
            operation.confirmError = confirmation.error;
            if (confirmation.error !== undefined) {
                this.settle(operation, operation.cancelled ? 'cancelled' : 'failed', operation.cancelled ? 'Compaction cancelled and the Host confirmed the run stopped.' : sanitizeMessage(confirmation.error));
                return;
            }
            // The run committed, but cancellation/timeout raced with its completion.
            // Do not report a clean success when the persistence result is unknown.
            this.settle(operation, 'unconfirmed', 'Compaction committed despite the stop request; the final persistence result could not be confirmed.');
            return;
        }
        if (confirmation.kind === 'not-yet' || confirmation.kind === 'unknown') {
            operation.confirmation = 'unknown';
            operation.state = 'cancelling';
            operation.message = operation.cancelled
                ? 'Cancellation was requested; the Host is still waiting for the compaction to finish.'
                : 'The compaction budget expired; the Host is still waiting for the compaction to finish.';
            return;
        }
    }
    commandFailureMessage(operation, result, thrown) {
        if (result?.ok === true) {
            const text = commandText(result);
            return text === undefined ? 'The Host rejected the compaction command.' : sanitizeMessage(text);
        }
        if (result !== undefined && result.ok === false)
            return sanitizeMessage(result.error.message);
        if (operation.timedOut)
            return `Compaction exceeded its ${operation.budgetMs}ms budget.`;
        if (thrown instanceof RpcError)
            return sanitizeMessage(thrown.message);
        this.logger?.warn('remote compaction failed', {
            operationId: operation.operationId,
            reason: thrown instanceof Error ? thrown.name : 'unknown',
        });
        return 'The Host failed to run the compaction command.';
    }
    settle(operation, state, message) {
        if (operation.finishedAt !== undefined)
            return;
        if (operation.timer !== undefined) {
            clearTimeout(operation.timer);
            operation.timer = undefined;
        }
        operation.state = state;
        operation.finishedAt = this.now();
        if (message !== undefined)
            operation.message = message;
        this.logger?.info('remote compaction settled', {
            operationId: operation.operationId,
            state,
            durationMs: operation.startedAt === undefined ? 0 : operation.finishedAt - operation.startedAt,
        });
        this.prune();
    }
    find(params, owner) {
        const operation = this.operations.get(params.operationId);
        if (operation === undefined)
            return undefined;
        if (operation.ownerDeviceId !== owner.deviceId) {
            throw new RpcError('PERMISSION_DENIED', 'This compaction operation belongs to another device.');
        }
        if (operation.sessionId !== params.sessionId) {
            throw new RpcError('INVALID_MESSAGE', 'The compaction operation does not belong to this Session.');
        }
        return operation;
    }
    view(operation) {
        return {
            operationId: operation.operationId,
            sessionId: operation.sessionId,
            state: operation.state,
            acceptedAt: operation.acceptedAt,
            ...(operation.startedAt === undefined ? {} : { startedAt: operation.startedAt }),
            ...(operation.finishedAt === undefined ? {} : { finishedAt: operation.finishedAt }),
            ...(operation.message === undefined ? {} : { message: operation.message }),
        };
    }
    interrupted(params) {
        return {
            operationId: params.operationId,
            sessionId: params.sessionId,
            state: 'interrupted',
            message: 'The Host no longer tracks this operation; it may have restarted.',
        };
    }
    /** Drop settled operations past retention; unfinished ones are never pruned. */
    prune() {
        const cutoff = this.now() - RETENTION_MS;
        for (const [operationId, operation] of this.operations) {
            if (operation.finishedAt === undefined || operation.finishedAt > cutoff)
                continue;
            this.operations.delete(operationId);
            this.requestIndex.delete(requestIndexKey(operation.ownerDeviceId, operation.sessionId, operation.requestId));
        }
    }
}
function clampBudget(value) {
    if (value === undefined)
        return DEFAULT_BUDGET_MS;
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
        throw new RpcError('INVALID_MESSAGE', 'budgetMs must be a safe integer.');
    }
    return Math.min(Math.max(value, MIN_BUDGET_MS), MAX_BUDGET_MS);
}
function isCommandSuccess(result) {
    if (result.ok !== true || !isRecord(result.value))
        return false;
    const command = isRecord(result.value.result) ? result.value.result : undefined;
    return command?.kind === 'success';
}
function commandText(result) {
    if (result.ok !== true || !isRecord(result.value))
        return undefined;
    const command = isRecord(result.value.result) ? result.value.result : undefined;
    return typeof command?.text === 'string' && command.text.trim() !== '' ? command.text : undefined;
}
function sanitizeMessage(message) {
    return message.length <= 2_000 ? message : `${message.slice(0, 2_000)}…`;
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Read the tail of a `session/events` result and decide whether the compaction
 * behind `commandId` finished. Handles both the 0.2.2 `records[].event` shape
 * and the legacy `events[]` shape used by older bridges.
 */
export function readCompactionConfirmation(result, acceptedAt, commandId) {
    if (result.ok !== true || !isRecord(result.value))
        return { kind: 'unknown' };
    const records = Array.isArray(result.value.records) ? result.value.records : [];
    const legacy = Array.isArray(result.value.events) ? result.value.events : [];
    const events = [];
    for (const record of [...records, ...legacy]) {
        const event = isRecord(record) && isRecord(record.event) ? record.event : record;
        if (isRecord(event) && typeof event.type === 'string')
            events.push(event);
    }
    if (events.length === 0)
        return { kind: 'unknown' };
    const resolvedCommandId = commandId ?? latestCompactCommandId(events, acceptedAt);
    if (resolvedCommandId === undefined)
        return { kind: 'not-yet' };
    const end = [...events].reverse().find(event => {
        if (event.type !== 'compaction/end')
            return false;
        const data = isRecord(event.data) ? event.data : undefined;
        return data?.sourceCommandId === resolvedCommandId;
    });
    if (end === undefined)
        return { kind: 'not-yet' };
    const data = isRecord(end.data) ? end.data : {};
    const error = data.error === undefined ? undefined : errorText(data.error);
    return error === undefined ? { kind: 'finished' } : { kind: 'finished', error };
}
function latestCompactCommandId(events, acceptedAt) {
    for (const event of [...events].reverse()) {
        if (event.type !== 'command/run')
            continue;
        const data = isRecord(event.data) ? event.data : undefined;
        if (data?.name !== 'compact' || typeof data.commandId !== 'string')
            continue;
        const time = typeof event.time === 'number' ? event.time : 0;
        if (time !== 0 && time < acceptedAt - 5_000)
            continue;
        return data.commandId;
    }
    return undefined;
}
function errorText(error) {
    if (typeof error === 'string')
        return sanitizeMessage(error);
    if (isRecord(error)) {
        const message = error.message ?? error.error ?? error.reason;
        if (typeof message === 'string' && message.trim() !== '')
            return sanitizeMessage(message);
        try {
            return sanitizeMessage(JSON.stringify(error));
        }
        catch {
            return 'The compaction failed.';
        }
    }
    return 'The compaction failed.';
}
//# sourceMappingURL=remote-compaction-operations.js.map
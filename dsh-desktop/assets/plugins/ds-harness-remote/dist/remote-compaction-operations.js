import { randomUUID } from 'node:crypto';
import { RpcError } from './safe-error.js';
const MIN_BUDGET_MS = 60_000;
const MAX_BUDGET_MS = 7_200_000;
const DEFAULT_BUDGET_MS = 1_800_000;
const DEFAULT_CANCELLING_GRACE_MS = 120_000;
/** Keep settled operations readable long enough for a reconnect to collect them. */
const RETENTION_MS = 600_000;
/** A cancel request waits this long for the command call to settle. */
const CANCEL_SETTLE_MS = 15_000;
/** Bound tracked records so a client cannot create unbounded tasks. */
const MAX_OPERATIONS = 32;
const ABORT_CODE_PATTERN = /(?:^|[/_-])(abort(?:ed)?|cancel(?:led|ed)?|timeout|timed[_-]?out|etimedout)(?:$|[/_-])/iu;
const GENERIC_ERROR_CODE_PATTERN = /^(?:gateway\/)?(?:internal|unknown)$/iu;
const ABORT_MESSAGE_PATTERN = /\b(abort(?:ed)?|cancel(?:led|ed)?|timed?\s*out|timeout|exceeded\s+(?:its\s+)?budget|budget\s+(?:exceeded|expired))\b/iu;
const MAX_CAUSE_DEPTH = 8;
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
    cancellingGraceMs;
    closed = false;
    constructor(runner, options = {}) {
        this.runner = runner;
        this.confirm = options.confirm;
        this.logger = options.logger;
        this.now = options.now ?? Date.now;
        this.cancellingGraceMs = normalizeCancellingGrace(options.cancellingGraceMs);
    }
    submit(params, owner) {
        if (this.closed)
            throw new RpcError('HARNESS_UNAVAILABLE', 'The Remote Host is shutting down.');
        this.expireCancellingOperations();
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
            && (operation.cancelled || operation.timedOut || operation.state === 'cancelling' || operation.state === 'unconfirmed')) {
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
        await waitWithTimeout(operation.commandSettled, CANCEL_SETTLE_MS);
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
            abortInterrupted: false,
            commandErrorResult: false,
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
        operation.timer.unref?.();
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
            operation.commandId = commandIdOf(result);
            operation.commandSettledAt = this.now();
            const succeeded = result?.ok === true && isCommandSuccess(result);
            if (!succeeded) {
                operation.abortInterrupted = isAbortOutcome(operation.controller.signal, result, thrown);
                operation.commandErrorResult = result?.ok === true;
                if (!operation.abortInterrupted) {
                    operation.commandFailureMessage = this.commandFailureMessage(operation, result, thrown);
                }
            }
            operation.commandSettledFlag = true;
            operation.resolveCommandSettled();
        }
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
        this.settle(operation, 'failed', operation.commandFailureMessage ?? this.commandFailureMessage(operation, result, thrown));
    }
    /**
     * Inspect the compaction lifecycle for a settled command call. A confirmed
     * `compaction/end` with an error marks the run stopped; a confirmed end
     * without error means it committed, but the final persistence result is no
     * longer observable after the abort.
     */
    reconcile(operation) {
        if (operation.finishedAt !== undefined || !operation.commandSettledFlag)
            return Promise.resolve();
        if (operation.inFlightReconcile !== undefined)
            return operation.inFlightReconcile;
        const task = this.reconcileOnce(operation).finally(() => {
            if (operation.inFlightReconcile === task)
                operation.inFlightReconcile = undefined;
        });
        operation.inFlightReconcile = task;
        return task;
    }
    async reconcileOnce(operation) {
        if (operation.finishedAt !== undefined)
            return;
        if (!operation.commandSettledFlag)
            return;
        if (this.confirm === undefined) {
            if (!operation.abortInterrupted && operation.commandErrorResult) {
                this.settle(operation, 'failed', operation.commandFailureMessage ?? 'The Host rejected the compaction command.');
                return;
            }
            this.settle(operation, 'unconfirmed', 'The Host cannot observe the compaction lifecycle for this run.');
            return;
        }
        let confirmation;
        try {
            confirmation = await this.confirm(operation.sessionId, operation.acceptedAt, operation.commandId);
        }
        catch {
            confirmation = { kind: 'unknown' };
        }
        if (operation.finishedAt !== undefined)
            return;
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
            const stillPossiblyRunning = operation.abortInterrupted
                || (confirmation.kind === 'not-yet'
                    && (confirmation.started === true
                        || (!operation.commandErrorResult && confirmation.commandRecorded === true)));
            if (!stillPossiblyRunning) {
                operation.confirmation = 'unknown';
                if (confirmation.kind === 'not-yet' || operation.commandErrorResult) {
                    this.settle(operation, 'failed', operation.commandFailureMessage ?? 'The Host failed to run the compaction command.');
                    return;
                }
                this.settle(operation, 'unconfirmed', this.unconfirmedFailureMessage(operation));
                return;
            }
            const deadline = this.cancellingDeadlineOf(operation);
            if (this.now() >= deadline) {
                operation.confirmation = 'unknown';
                this.settle(operation, 'unconfirmed', this.cancellingGraceExpiredMessage(operation));
                return;
            }
            this.scheduleCancellingGrace(operation, deadline);
            operation.confirmation = 'unknown';
            operation.state = 'cancelling';
            operation.message = operation.cancelled
                ? 'Cancellation was requested; the Host is still waiting for the compaction to finish.'
                : 'The compaction budget expired; the Host is still waiting for the compaction to finish.';
            return;
        }
    }
    cancellingDeadlineOf(operation) {
        if (operation.cancellingDeadlineAt !== undefined)
            return operation.cancellingDeadlineAt;
        const settledAt = operation.commandSettledAt ?? this.now();
        const graceMs = Math.min(this.cancellingGraceMs, operation.budgetMs);
        const deadline = settledAt + graceMs;
        operation.cancellingDeadlineAt = deadline;
        return deadline;
    }
    scheduleCancellingGrace(operation, deadline) {
        if (operation.graceTimer !== undefined || operation.finishedAt !== undefined)
            return;
        const remainingMs = Math.max(0, deadline - this.now());
        operation.graceTimer = setTimeout(() => {
            operation.graceTimer = undefined;
            void this.reconcile(operation);
        }, remainingMs);
        operation.graceTimer.unref?.();
    }
    expireCancellingOperations() {
        const now = this.now();
        for (const operation of this.operations.values()) {
            if (operation.finishedAt !== undefined)
                continue;
            if (operation.cancellingDeadlineAt === undefined || now < operation.cancellingDeadlineAt)
                continue;
            operation.confirmation = 'unknown';
            this.settle(operation, 'unconfirmed', this.cancellingGraceExpiredMessage(operation), operation.cancellingDeadlineAt);
        }
    }
    cancellingGraceExpiredMessage(operation) {
        return operation.cancelled
            ? 'Cancellation was requested, but the Host could not confirm compaction completion within the grace window.'
            : 'The compaction budget expired, and the Host could not confirm compaction completion within the grace window.';
    }
    unconfirmedFailureMessage(operation) {
        return operation.cancelled
            ? 'Compaction failed after cancellation was requested, and the Host could not inspect the Session log to confirm its state.'
            : 'Compaction failed after its budget expired, and the Host could not inspect the Session log to confirm its state.';
    }
    commandFailureMessage(operation, result, thrown) {
        if (result?.ok === true) {
            const text = commandText(result);
            return text === undefined ? 'The Host rejected the compaction command.' : sanitizeMessage(text);
        }
        if (result !== undefined && result.ok === false)
            return sanitizeMessage(result.error.message);
        if (thrown instanceof RpcError)
            return sanitizeMessage(thrown.message);
        if (operation.timedOut)
            return `Compaction exceeded its ${operation.budgetMs}ms budget.`;
        this.logger?.warn('remote compaction failed', {
            operationId: operation.operationId,
            reason: thrown instanceof Error ? thrown.name : 'unknown',
        });
        return 'The Host failed to run the compaction command.';
    }
    settle(operation, state, message, settledAt) {
        if (operation.finishedAt !== undefined)
            return;
        if (operation.timer !== undefined) {
            clearTimeout(operation.timer);
            operation.timer = undefined;
        }
        if (operation.graceTimer !== undefined) {
            clearTimeout(operation.graceTimer);
            operation.graceTimer = undefined;
        }
        operation.state = state;
        operation.finishedAt = settledAt ?? this.now();
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
function normalizeCancellingGrace(value) {
    if (value === undefined)
        return DEFAULT_CANCELLING_GRACE_MS;
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 1) {
        throw new RpcError('INVALID_MESSAGE', 'cancellingGraceMs must be a positive safe integer.');
    }
    return Math.min(value, MAX_BUDGET_MS);
}
function isAbortOutcome(signal, result, thrown) {
    if (!signal.aborted)
        return false;
    if (result !== undefined) {
        if (result.ok)
            return false;
        return ABORT_CODE_PATTERN.test(result.error.code)
            || matchesSignalReason(result.error.message, signal.reason)
            || (GENERIC_ERROR_CODE_PATTERN.test(result.error.code) && ABORT_MESSAGE_PATTERN.test(result.error.message))
            || ('cause' in result.error.details && isAbortThrown(result.error.details.cause, signal.reason));
    }
    return isAbortThrown(thrown, signal.reason);
}
function isAbortThrown(thrown, reason) {
    const seen = new Set();
    let current = thrown;
    for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
        if (seen.has(current))
            return false;
        seen.add(current);
        if (current === reason)
            return true;
        if (typeof current === 'string') {
            return matchesSignalReason(current, reason) || ABORT_MESSAGE_PATTERN.test(current);
        }
        if (current instanceof Error) {
            if (current.name === 'AbortError' || current.name === 'TimeoutError')
                return true;
            if ('code' in current && typeof current.code === 'string' && ABORT_CODE_PATTERN.test(current.code))
                return true;
            if (matchesSignalReason(current.message, reason))
                return true;
            if (!(current instanceof RpcError) && ABORT_MESSAGE_PATTERN.test(current.message))
                return true;
            current = 'cause' in current ? current.cause : undefined;
            continue;
        }
        if (isRecord(current)) {
            if (typeof current.code === 'string' && ABORT_CODE_PATTERN.test(current.code))
                return true;
            if (typeof current.message === 'string' && matchesSignalReason(current.message, reason))
                return true;
            current = current.cause;
            continue;
        }
        return false;
    }
    return false;
}
function matchesSignalReason(message, reason) {
    const reasonMessage = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : undefined;
    return reasonMessage !== undefined && reasonMessage !== '' && message.includes(reasonMessage);
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
function waitWithTimeout(promise, ms) {
    return new Promise(resolve => {
        const timer = setTimeout(() => { resolve(); }, ms);
        timer.unref?.();
        void promise.finally(() => {
            clearTimeout(timer);
            resolve();
        });
    });
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
    const matchedCommandRun = commandId === undefined
        ? latestCompactCommandId(events, acceptedAt)
        : hasCompactCommandRun(events, commandId) ? commandId : undefined;
    const resolvedCommandId = commandId ?? matchedCommandRun;
    if (resolvedCommandId === undefined)
        return { kind: 'not-yet' };
    const end = [...events].reverse().find(event => {
        if (event.type !== 'compaction/end')
            return false;
        const data = isRecord(event.data) ? event.data : undefined;
        return data?.sourceCommandId === resolvedCommandId;
    });
    if (end === undefined) {
        const hasCompactionStart = events.some(event => {
            if (event.type !== 'compaction/start')
                return false;
            const data = isRecord(event.data) ? event.data : undefined;
            return data?.sourceCommandId === resolvedCommandId;
        });
        if (hasCompactionStart)
            return { kind: 'not-yet', started: true };
        if (matchedCommandRun !== undefined)
            return { kind: 'not-yet', commandRecorded: true };
        return { kind: 'not-yet' };
    }
    const data = isRecord(end.data) ? end.data : {};
    const error = data.error === undefined ? undefined : errorText(data.error);
    return error === undefined ? { kind: 'finished' } : { kind: 'finished', error };
}
function hasCompactCommandRun(events, commandId) {
    return events.some(event => {
        if (event.type !== 'command/run')
            return false;
        const data = isRecord(event.data) ? event.data : undefined;
        return data?.name === 'compact' && data.commandId === commandId;
    });
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
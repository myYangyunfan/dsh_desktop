export const CODEX_SESSION_PREFIX = 'codex:';
export function nativeThreadId(sessionId) {
    if (!sessionId.startsWith(CODEX_SESSION_PREFIX) || sessionId.length === CODEX_SESSION_PREFIX.length) {
        throw new Error('The selected Session does not belong to CodeX.');
    }
    return sessionId.slice(CODEX_SESSION_PREFIX.length);
}
export function record(value) {
    return isRecord(value) ? value : {};
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function array(value) {
    return Array.isArray(value) ? value : [];
}
export function string(value) {
    return typeof value === 'string' ? value : undefined;
}
export function integer(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}
export function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function optionalInteger(value) {
    if (value === undefined)
        return undefined;
    const parsed = integer(value);
    if (parsed === undefined)
        throw new Error('The CodeX History cursor is invalid.');
    return parsed;
}
export function optionalNonNegativeInteger(value) {
    const parsed = optionalInteger(value);
    if (parsed !== undefined && parsed < 0)
        throw new Error('The CodeX History cursor is invalid.');
    return parsed;
}
export function optionalPositiveInteger(value) {
    const parsed = optionalInteger(value);
    if (parsed !== undefined && parsed <= 0)
        throw new Error('The CodeX History page size is invalid.');
    return parsed;
}
export function requiredString(value, field) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`The CodeX ${field} is required.`);
    return value;
}
export function normalizeTime(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        return 0;
    return value < 10_000_000_000 ? Math.floor(value * 1000) : Math.floor(value);
}
export function isoTime(value) {
    return new Date(normalizeTime(value) || Date.now()).toISOString();
}
export function basename(path) {
    const normalized = path.replace(/[\\/]+$/u, '');
    const parts = normalized.split(/[\\/]/u);
    return parts.at(-1) || path;
}
export function hashString(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
export function errorCode(error) {
    return 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
//# sourceMappingURL=virtual-values.js.map
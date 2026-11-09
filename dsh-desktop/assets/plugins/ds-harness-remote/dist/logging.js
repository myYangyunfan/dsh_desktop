const levels = ['debug', 'info', 'warn', 'error'];
const secretKey = /authorization|cookie|token|secret|private|shared|ciphertext|payload|prompt|source|workspace|output|registrationCode|deviceCode/i;
export class SafeLogger {
    sink;
    threshold;
    constructor(sink, threshold = 'info') {
        this.sink = sink;
        this.threshold = threshold;
    }
    debug(message, fields) { this.write('debug', message, fields); }
    info(message, fields) { this.write('info', message, fields); }
    warn(message, fields) { this.write('warn', message, fields); }
    error(message, fields) { this.write('error', message, fields); }
    write(level, message, fields) {
        if (levels.indexOf(level) < levels.indexOf(this.threshold))
            return;
        const safeFields = fields === undefined ? '' : ` ${JSON.stringify(redact(fields))}`;
        this.sink[level](`[dsh-remote] ${message}${safeFields}`);
    }
}
function redact(value, key = '') {
    if (secretKey.test(key))
        return '[REDACTED]';
    if (Array.isArray(value))
        return value.map(item => redact(item));
    if (typeof value !== 'object' || value === null)
        return value;
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
}
//# sourceMappingURL=logging.js.map
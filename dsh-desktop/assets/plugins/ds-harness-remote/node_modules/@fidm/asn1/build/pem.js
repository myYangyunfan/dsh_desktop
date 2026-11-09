'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// **Github:** https://github.com/fidm/asn1
//
// **License:** MIT
const util_1 = require("util");
const pemLineLength = 64;
const pemStart = '-----BEGIN ';
const pemEnd = '-----END ';
const pemEndOfLine = '-----';
const procType = 'Proc-Type';
/**
 * Implements the PEM data encoding, which originated in Privacy
 * Enhanced Mail. The most common use of PEM encoding today is in TLS keys and
 * certificates. See RFC 1421.
 *
 * A PEM represents a PEM encoded structure.
 *
 * The encoded form is:
 * ```
 * -----BEGIN Type-----
 * Headers
 * base64-encoded Bytes
 * -----END Type-----
 * ```
 *
 * Headers like:
 * ```
 * Proc-Type: 4,ENCRYPTED
 * DEK-Info: DES-EDE3-CBC,29DE8F99F382D122
 * ```
 */
class PEM {
    /**
     * Parse PEM formatted buffer, returns one or more PEM object.
     * If there is no PEM object, it will throw error.
     * @param data buffer to parse.
     */
    static parse(data) {
        const res = [];
        const lines = data.toString('utf8').split('\n')
            .map((s) => s.trim())
            .filter((s) => s !== '' && !s.startsWith('#'));
        while (lines.length > 0) {
            res.push(parse(lines));
        }
        if (res.length === 0) {
            throw new Error('PEM: no block');
        }
        return res;
    }
    constructor(type, body) {
        this.type = type;
        this.body = body;
        this.headers = Object.create(null);
    }
    /**
     * Return exists Proc-Type header or empty string
     */
    get procType() {
        return this.getHeader(procType);
    }
    /**
     * Return a header or empty string with given key.
     */
    getHeader(key) {
        const val = this.headers[key];
        return val == null ? '' : val;
    }
    /**
     * Set a header with given key/value.
     */
    setHeader(key, val) {
        if (key.includes(':')) {
            throw new Error('pem: cannot encode a header key that contains a colon');
        }
        if (key === '' || val === '') {
            throw new Error('pem: invalid header key or value');
        }
        this.headers[key] = val;
    }
    /**
     * Encode to PEM formatted string.
     */
    toString() {
        let rVal = pemStart + this.type + pemEndOfLine + '\n';
        const headers = Object.keys(this.headers);
        if (headers.length > 0) {
            // The Proc-Type header must be written first. See RFC 1421, section 4.6.1.1
            const type = this.procType;
            if (type !== '') {
                rVal += `${procType}: ${type}\n`;
            }
            // For consistency of output, write other headers sorted by key.
            headers.sort();
            for (const key of headers) {
                if (key !== procType) {
                    rVal += `${key}: ${this.headers[key]}\n`;
                }
            }
            rVal += '\n';
        }
        const body = this.body.toString('base64');
        let offset = 0;
        while (offset < body.length) {
            rVal += body.slice(offset, offset + pemLineLength) + '\n';
            offset += pemLineLength;
        }
        rVal += pemEnd + this.type + pemEndOfLine + '\n';
        return rVal;
    }
    /**
     * Encode to PEM formatted buffer.
     */
    toBuffer() {
        return Buffer.from(this.toString(), 'utf8');
    }
    /**
     * Returns the body.
     */
    valueOf() {
        return this.body;
    }
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON() {
        return {
            type: this.type,
            body: this.body,
            headers: this.headers,
        };
    }
    [util_1.inspect.custom](_depth, options) {
        return `<${this.constructor.name} ${util_1.inspect(this.toJSON(), options)}>`;
    }
}
exports.PEM = PEM;
function parse(lines) {
    let line = lines.shift();
    if (line == null || !line.startsWith(pemStart) || !line.endsWith(pemEndOfLine)) {
        throw new Error('pem: invalid BEGIN line');
    }
    const type = line.slice(pemStart.length, line.length - pemEndOfLine.length);
    if (type === '') {
        throw new Error('pem: invalid type');
    }
    const headers = [];
    line = lines.shift();
    while (line != null && line.includes(': ')) {
        const header = line.split(': ');
        if (header.length !== 2 || header[0] === '' || header[1] === '') {
            throw new Error('pem: invalid Header line');
        }
        headers.push(header);
        line = lines.shift();
    }
    let body = '';
    while (line != null && !line.startsWith(pemEnd)) {
        body += line;
        line = lines.shift();
    }
    if (line == null || line !== `${pemEnd}${type}${pemEndOfLine}`) {
        throw new Error('pem: invalid END line');
    }
    const pem = new PEM(type, Buffer.from(body, 'base64'));
    if (body === '' || pem.body.toString('base64') !== body) {
        throw new Error('pem: invalid base64 body');
    }
    for (const header of headers) {
        pem.setHeader(header[0], header[1]);
    }
    return pem;
}
//# sourceMappingURL=pem.js.map
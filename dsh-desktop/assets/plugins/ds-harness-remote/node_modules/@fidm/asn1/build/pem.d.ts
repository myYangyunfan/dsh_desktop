/// <reference types="node" />
import { inspect } from 'util';
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
export declare class PEM {
    /**
     * Parse PEM formatted buffer, returns one or more PEM object.
     * If there is no PEM object, it will throw error.
     * @param data buffer to parse.
     */
    static parse(data: Buffer): PEM[];
    /**
     * The type, taken from the preamble (i.e. "RSA PRIVATE KEY").
     */
    type: string;
    /**
     * The decoded bytes of the contents. Typically a DER encoded ASN.1 structure.
     */
    body: Buffer;
    private headers;
    constructor(type: string, body: Buffer);
    /**
     * Return exists Proc-Type header or empty string
     */
    readonly procType: string;
    /**
     * Return a header or empty string with given key.
     */
    getHeader(key: string): string;
    /**
     * Set a header with given key/value.
     */
    setHeader(key: string, val: string): void;
    /**
     * Encode to PEM formatted string.
     */
    toString(): string;
    /**
     * Encode to PEM formatted buffer.
     */
    toBuffer(): Buffer;
    /**
     * Returns the body.
     */
    valueOf(): Buffer;
    /**
     * Return a friendly JSON object for debuging.
     */
    toJSON(): any;
    protected [inspect.custom](_depth: any, options: any): string;
}

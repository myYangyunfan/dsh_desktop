/// <reference types="node" />
/**
 * Converts IP string into buffer, 4 bytes for IPv4, and 16 bytes for IPv6.
 * It will return null when IP string invalid.
 *
 * ```js
 * console.log(bytesFromIP('::1')) // <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01>
 * ```
 * @param ip IP string to convert
 */
export declare function bytesFromIP(ip: string): Buffer | null;
/**
 * Converts 4-bytes into an IPv4 string representation or 16-bytes into
 * an IPv6 string representation. The bytes must be in network order.
 *
 * ```js
 * console.log(bytesToIP(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]))) // '::1'
 * ```
 * @param bytes buffer to convert
 */
export declare function bytesToIP(bytes: Buffer): string;
/**
 * Returns Object Identifier (dot-separated numeric string) that registered by initOID function.
 * It will return empty string if not exists.
 * @param nameOrId OID name or OID
 */
export declare function getOID(nameOrId: string): string;
/**
 * Returns Object Identifier name that registered by initOID function.
 * It will return the argument nameOrId if not exists.
 * @param nameOrId OID name or OID
 */
export declare function getOIDName(nameOrId: string): string;

/**
 * Convert an IPv4 / IPv6 text address to the STUN wire binary form.
 * IPv4 → 4 bytes, IPv6 → 16 bytes (supports :: compression and IPv4-mapped).
 */
export declare function ipAddressToBuffer(address: string): Buffer;
/**
 * Convert STUN address bytes (4 or 16) back to a text IP address.
 * IPv6 uses the same zero-run compression style as the previous `ip` helper.
 */
export declare function bufferToIpAddress(buf: Buffer): string;
export declare function isIpV4Address(address: string): boolean;
export declare function isIpV6Address(address: string): boolean;

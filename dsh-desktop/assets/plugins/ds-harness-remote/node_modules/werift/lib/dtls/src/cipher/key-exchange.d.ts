/**
 * This class represent type of key exchange mechanism.
 */
export declare class KeyExchange {
    id: number;
    name?: string;
    signType?: number;
    keyType?: number;
    /**
     * @returns {string}
     */
    toString(): string | undefined;
}
/**
 * Creates `RSA` key exchange.
 * @returns {KeyExchange}
 */
export declare function createRSAKeyExchange(): KeyExchange;
/**
 * Creates `ECDHE_RSA` key exchange.
 * @returns {KeyExchange}
 */
export declare function createECDHERSAKeyExchange(): KeyExchange;
/**
 * Creates `ECDHE_ECDSA` key exchange.
 * @returns {KeyExchange}
 */
export declare function createECDHEECDSAKeyExchange(): KeyExchange;
/**
 * Creates `NULL` key exchange.
 * @returns {KeyExchange}
 */
export declare function createNULLKeyExchange(): KeyExchange;
/**
 * Creates `PSK` key exchange.
 * @returns {KeyExchange}
 */
export declare function createPSKKeyExchange(): KeyExchange;
/**
 * Creates `ECDHE_PSK` key exchange.
 * @returns {KeyExchange}
 */
export declare function createECDHEPSKKeyExchange(): KeyExchange;

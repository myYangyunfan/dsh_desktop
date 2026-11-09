import type { CipherGCMTypes } from "crypto";
import { type KeyExchange } from "./key-exchange";
import AEADCipher from "./suites/aead";
/**
 * Convert cipher value to cipher instance.
 * @param {number} cipher
 */
export declare function createCipher(cipher: number): AEADCipher;
/**
 * @param {number} id An internal id of cipher suite.
 * @param {string} name A valid cipher suite name.
 * @param {string} block A valid nodejs cipher name.
 * @param {KeyExchange} kx Key exchange type.
 * @param {Object} constants Cipher specific constants.
 * @param {string} hash
 * @returns {AEADCipher}
 */
export declare function createAEADCipher(id: number, name: string, block: CipherGCMTypes, kx: KeyExchange, constants: {
    K_LEN: number;
    N_MAX: number;
}, hash?: string): AEADCipher;

/**
 * ```asn1
 * SecretBag ::= SEQUENCE {
 *   secretTypeId  BAG-TYPE.&id ({SecretTypes}),
 *   secretValue   [0] EXPLICIT BAG-TYPE.&Type ({SecretTypes}
 *                                              {@secretTypeId})
 * }
 * ```
 */
export declare class SecretBag {
    secretTypeId: string;
    secretValue: ArrayBuffer;
    constructor(params?: Partial<SecretBag>);
}

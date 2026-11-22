export declare class AccountTwoFactorRequired extends Error {
    readonly challenge: string;
    readonly serverUrl: string;
    readonly code = "TWO_FACTOR_REQUIRED";
    constructor(challenge: string, serverUrl: string);
}
//# sourceMappingURL=account-two-factor-required.d.ts.map
export class AccountTwoFactorRequired extends Error {
    challenge;
    serverUrl;
    code = 'TWO_FACTOR_REQUIRED';
    constructor(challenge, serverUrl) {
        super('Two-factor verification is required.');
        this.challenge = challenge;
        this.serverUrl = serverUrl;
    }
}
//# sourceMappingURL=account-two-factor-required.js.map
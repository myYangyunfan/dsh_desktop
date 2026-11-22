import type { Translate } from '../client-locale.js';
import type { ClientReact } from './types.js';
export declare function useAccountVerification(React: ClientReact, scope: unknown): {
    pending: boolean;
    ready: boolean;
    verification: {
        code: string;
        challenge: string;
        serverUrl: string;
    } | undefined;
    clear: () => void;
    handle(error: unknown): boolean;
    fields(t: Translate, busy: boolean, ...passwordFields: unknown[]): unknown;
};
//# sourceMappingURL=account-verification.d.ts.map
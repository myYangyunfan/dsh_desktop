import type { Translate } from '../client-locale.js';
import type { ClientReact } from './types.js';
/** Shared copy for the controlling Client and the controlled Host. */
export declare function createServerNotice(React: ClientReact): (props: {
    offline: boolean;
    linked: boolean;
    expiresAt?: number;
    countdownOnly?: boolean;
    compact?: boolean;
    onReconnect?: () => void;
    t: Translate;
}) => unknown;
//# sourceMappingURL=server-notice.d.ts.map
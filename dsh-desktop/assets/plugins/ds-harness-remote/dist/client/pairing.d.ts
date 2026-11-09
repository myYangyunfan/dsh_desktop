import type { ClientReact } from './types.js';
import type { Translate } from '../client-locale.js';
export declare function createHostPairingPanel(React: ClientReact): (props: {
    control: <T>(endpoint: string, payload?: unknown) => Promise<T>;
    serverUrl: string;
    disabled: boolean;
    t: Translate;
    onComplete(): void;
}) => unknown;
//# sourceMappingURL=pairing.d.ts.map
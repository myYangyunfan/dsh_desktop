import type { Translate } from '../client-locale.js';
import type { StatusFeed } from '../status-stream.js';
import type { ClientReact, PortalRenderer, RemoteStatus } from './types.js';
export declare function createRemoteSessionHeaderAction(React: ClientReact, portal?: PortalRenderer): (props: {
    control: <T>(endpoint: string, payload?: unknown) => Promise<T>;
    statusFeed: StatusFeed<RemoteStatus>;
    onSignIn: () => void;
    t: Translate;
}) => unknown;
export declare function hideLocalSessionActions(): () => void;
export declare function createRemoteHostReferenceView(React: ClientReact): unknown;
//# sourceMappingURL=header.d.ts.map
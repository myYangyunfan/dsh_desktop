import type { Translate } from '../client-locale.js';
import type { StatusFeed } from '../status-stream.js';
import type { ClientReact, OAuthProvider, RemoteStatus } from './types.js';
export declare function createRemoteWorkspaceAction(React: ClientReact): (props: {
    wide: boolean;
    control: <T>(endpoint: string, payload?: unknown) => Promise<T>;
    statusFeed: StatusFeed<RemoteStatus>;
    preferredQrProvider: OAuthProvider;
    t: Translate;
}) => unknown;
//# sourceMappingURL=workspaces.d.ts.map
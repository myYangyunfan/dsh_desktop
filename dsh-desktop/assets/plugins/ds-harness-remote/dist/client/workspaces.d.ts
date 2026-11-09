import type { Translate } from '../client-locale.js';
import type { StatusFeed } from '../status-stream.js';
import type { ClientReact, OAuthProvider, RemoteStatus, PortalRenderer, SidebarEntryPreference } from './types.js';
export declare function createRemoteWorkspaceAction(React: ClientReact, portal?: PortalRenderer): (props: {
    wide: boolean;
    control: <T>(endpoint: string, payload?: unknown) => Promise<T>;
    statusFeed: StatusFeed<RemoteStatus>;
    subscribeOpen: (listener: () => void) => () => void;
    preferredQrProvider: OAuthProvider;
    sidebarEntry: SidebarEntryPreference;
    portal?: PortalRenderer;
    t: Translate;
    openSettings?: () => void;
}) => unknown;
//# sourceMappingURL=workspaces.d.ts.map
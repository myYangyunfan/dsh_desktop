import type { Translate } from '../client-locale.js';
import type { StatusFeed } from '../status-stream.js';
import type { ClientReact, RemoteStatus, SidebarEntryPreference } from './types.js';
export declare function createRemotePluginOptions(React: ClientReact): (props: {
    control: <T>(endpoint: string, payload?: unknown) => Promise<T>;
    statusFeed: StatusFeed<RemoteStatus>;
    onSignIn?: () => void;
    preferredQrProvider?: string;
    sidebarEntry?: SidebarEntryPreference;
    t: Translate;
    view?: "summary" | "page";
}) => unknown;
//# sourceMappingURL=settings.d.ts.map
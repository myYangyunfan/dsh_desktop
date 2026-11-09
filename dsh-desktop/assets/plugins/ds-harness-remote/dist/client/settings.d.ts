import type { Translate } from '../client-locale.js';
import type { StatusFeed } from '../status-stream.js';
import type { ClientReact, RemoteStatus } from './types.js';
export declare function createRemotePluginOptions(React: ClientReact): (props: {
    control: <T>(endpoint: string, payload?: unknown) => Promise<T>;
    statusFeed: StatusFeed<RemoteStatus>;
    t: Translate;
    view?: "summary" | "page";
}) => unknown;
//# sourceMappingURL=settings.d.ts.map
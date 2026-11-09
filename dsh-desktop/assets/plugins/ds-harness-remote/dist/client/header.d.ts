import type { Translate } from '../client-locale.js';
import type { StatusFeed } from '../status-stream.js';
import type { ClientReact, RemoteStatus } from './types.js';
export declare function createRemoteSessionHeaderAction(React: ClientReact): (props: {
    control: <T>(endpoint: string, payload?: unknown) => Promise<T>;
    statusFeed: StatusFeed<RemoteStatus>;
    t: Translate;
}) => unknown;
export declare function hideLocalSessionActions(): () => void;
//# sourceMappingURL=header.d.ts.map
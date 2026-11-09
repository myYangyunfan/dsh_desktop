import type { Translate } from '../client-locale.js';
import type { ClientReact, RemoteConnectionProgress, RemoteTransportPreference } from './types.js';
export declare function createRemoteProgressView(React: ClientReact): (props: {
    progress: RemoteConnectionProgress | undefined;
    t: Translate;
}) => unknown;
export declare function runConnectHostProgress<T>(preferredTransports: readonly RemoteTransportPreference[] | undefined, targetDeviceId: string, control: <R>(endpoint: string, payload?: unknown) => Promise<R>, connectedStep: Pick<RemoteConnectionProgress, 'label' | 'detail'>, setProgress: (value: RemoteConnectionProgress | undefined) => void, progressRun: {
    current: number;
}, action: () => Promise<T>, readyProgress?: (result: T) => RemoteConnectionProgress | undefined): Promise<T>;
//# sourceMappingURL=progress.d.ts.map
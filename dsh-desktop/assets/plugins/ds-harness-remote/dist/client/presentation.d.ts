import type { Translate } from '../client-locale.js';
import type { RemoteConnectionProgress, RemoteStatus, RemoteTransportPreference } from './types.js';
export declare function formatLocalTime(value: number): string;
export declare function formatByteSize(value: number): string;
export declare function formatBitrate(value: number): string;
export declare function shortDeviceId(value: string): string;
export declare function transportLabel(value: RemoteTransportPreference, t: Translate): string;
export declare function transportDiagnosticLabel(value: RemoteTransportPreference): string;
export declare function connectedProgress(status: RemoteStatus | undefined): RemoteConnectionProgress | undefined;
export declare function observedConnectionProgress(status: RemoteStatus, targetDeviceId: string, preferredTransports: readonly RemoteTransportPreference[] | undefined, connectedStep: Pick<RemoteConnectionProgress, 'label' | 'detail'>, connectedAt: number | undefined): RemoteConnectionProgress | undefined;
export declare function connectionErrorMessage(code: string, t: Translate): string;
export declare function connectionStatusLabel(status: RemoteStatus['host'] | undefined, t: Translate): string;
export declare function connectionStatusClass(status: RemoteStatus['host'] | undefined): string;
export declare function messageOf(reason: unknown): string;
export declare function formatPlatform(value: string): string;
export declare function connectedClientModeLabel(mode: 'LAN' | 'P2P' | 'TURN' | 'Relay' | undefined, t: Translate): string;
//# sourceMappingURL=presentation.d.ts.map
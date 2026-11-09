import type { RtcPeerConnectionFactory } from '@dsh-remote/webrtc';
export declare function loadExternalNativeRtcFactory(): Promise<RtcPeerConnectionFactory | undefined>;
export declare function buildExternalNativeRtcFactory(nodeBinary: string, requireFrom?: string): RtcPeerConnectionFactory;
/**
 * Resolve dependencies from the plugin's physical package location.
 *
 * DSH profiles load plugins through a top-level symlink (or a Windows
 * junction), while pnpm links optional dependencies such as `@roamhq/wrtc`
 * beside the physical package under `.pnpm`. Using the surfaced plugin path
 * makes Node skip that virtual dependency directory and incorrectly reports
 * that the installed native backend is missing.
 */
export declare function resolveNativeRtcRequireFrom(moduleUrl?: string): string;
export declare function isUsableExternalNode(candidate: string, requireFrom: string): boolean;
//# sourceMappingURL=native-rtc-helper.d.ts.map
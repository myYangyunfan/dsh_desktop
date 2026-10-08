import type { TabComponentProps } from '../service.ts';
/** The session's traced-op count as of the last poll (undefined before the
 *  tab has ever pulled; 0 hides the badge pill). */
export declare function opCountOf(sessionId: string): number | undefined;
export declare function ChangesTab({ ctx, store, scope, tab, visible, onOpenFile, onOpenDiff }: TabComponentProps): import("react").JSX.Element;

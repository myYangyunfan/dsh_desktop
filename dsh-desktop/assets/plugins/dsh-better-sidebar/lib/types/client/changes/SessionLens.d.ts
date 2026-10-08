import { type FileOp } from './ops.ts';
export interface SessionLensProps {
    /** The folded file operations, newest first (the tab's poll owns them). */
    ops: readonly FileOp[];
    /** Every poll failed and nothing loaded: an inline notice, not an empty
     *  state that would read as "no operations". */
    loadError: boolean;
    /** Preview one op in the shared bottom pane. */
    onPreview: (path: string, op: FileOp) => void;
    /** The op currently previewed (row highlight); null when the pane is closed. */
    selectedCallId: string | null;
}
export declare function SessionLens({ ops, loadError, onPreview, selectedCallId }: SessionLensProps): import("react").JSX.Element;

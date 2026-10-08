/** Labels for the sidebar's markdown / diff / read Block chrome. */
export interface BlockLabels {
    copy: string;
    copied: string;
    collapse: string;
    collapseAria: string;
    expand: (hidden: number) => string;
    expandAria: (hidden: number) => string;
}
/**
 * The sidebar's Blocks reuse the Side Chat dictionary's chrome family (copy
 * pair + the collapse/expand family that is common to every Block kind).
 */
export declare function blockLabels(): BlockLabels;
/** The `TerminalBlockLabels` shape (structural mirror; the host owns the type). */
export interface TerminalLabels {
    signal: (signal: string) => string;
    exitCode: (exitCode: number) => string;
    noExitCode: string;
    running: string;
    failed: string;
    done: string;
    copy: string;
    copied: string;
    noOutput: string;
    collapseAria: string;
    collapse: string;
    expandAria: (hidden: number) => string;
    expand: (hidden: number) => string;
}
/** Labels for one `TerminalBlock` (a captured command plus its output). */
export declare function terminalBlockLabels(): TerminalLabels;

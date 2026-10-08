/** One application that can open the path. */
export interface OpenInAppEntry {
    /** Host-side id: an OS handler id for files, a catalog id for directories. */
    id: string;
    /** Display name (the OS reports handlers; the catalog id is localized). */
    name: string;
    /** PNG/SVG data URL for a handler, an icon route for a catalog app, else null. */
    icon: string | null;
    /** Whether the OS reports it as the default handler (files only). */
    isDefault: boolean;
}
/** The adapter the pages consume. */
export interface OpenInApp {
    /** Whether the host can open paths on a desktop; null until probed. */
    available(): boolean | null;
    /** Probe availability once (shared across callers). */
    probe(): Promise<boolean>;
    /** The installed-application catalog, in host menu order (directories). */
    directoryApps(): Promise<readonly OpenInAppEntry[]>;
    /** The OS handlers registered for one file, or null when the query failed. */
    fileApps(path: string): Promise<readonly OpenInAppEntry[] | null>;
    /** Open a path with its default handler, or with one explicit application. */
    open(path: string, application?: string): Promise<boolean>;
    /** Reveal a path in the OS file manager. */
    reveal(path: string): Promise<boolean>;
}
/** A ctx that can resolve client services (the cordis client root). */
interface CtxLike {
    get(name: string): unknown;
}
/** Build the adapter for one client ctx. */
export declare function createOpenInApp(ctx: CtxLike): OpenInApp;
export {};

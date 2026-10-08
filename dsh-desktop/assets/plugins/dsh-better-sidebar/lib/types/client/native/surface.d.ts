/**
 * The plugin's write face over DSH's native right Sidebar (`ctx.sidebarRight`).
 *
 * The service speaks in the plugin's own vocabulary (tab type, seed, session
 * scope); this module turns those into the native surface's vocabulary
 * (kind + navigation params, or a `dsh-resource://` address) and forwards
 * tab-record operations to the plugin's native record registry.
 *
 * Two native limits shape the implementation:
 *
 * - the surface exists only while a session's panel is mounted, and the
 *   service's public face (`ISidebarRight`) writes only into THAT session.
 *   "Which session that is" comes from the controller's `mounted` observation
 *   ({@link mountedSessions}) — never from the session list, which has no
 *   current-session field. The controller also carries `openTabIn` /
 *   `openResourceIn` / `closeIn`, which act on any session whose store the
 *   runtime has minted; both are probed at call time, and an open for a
 *   session that has no store yet is QUEUED and replayed when that session
 *   comes on screen;
 * - layout state is memory-only, so a queued open is not durable either.
 */
import type { Context } from '../../context-types.ts';
import type { SidebarSurface } from '../service.ts';
import type { NativeTabRecords } from './tab-adapter.tsx';
/**
 * The observation "which session's seat is on screen": DSH 0.1.7 publishes it
 * as `ISidebarRight.mounted` (`ObservableSnapshot<SessionId | undefined>`, set
 * only when the mounted seat really changes). `undefined` means NO seat is
 * drawn — a global panel, or a right column that was never mounted.
 */
export interface MountedSessions {
    getSnapshot(): string | undefined;
    subscribe(listener: () => void): () => void;
}
/** The plugin's write face over the native surface. */
export interface NativeSurface extends SidebarSurface {
    /** Replay opens that were queued for a session that had no mounted surface. */
    flushPending(): void;
    /** Stop observing the session list and the mounted-seat feed. */
    dispose(): void;
}
/**
 * The on-screen-session feed, as anything outside this module should read it.
 *
 * The session-list snapshot carries NO current-session field in any DSH
 * release (0.1.6 and 0.1.7 both publish only `ids` / `byId` / `phase` plus
 * projections), so a read of one was always `undefined`: `mounted` is the
 * only sanctioned source, and the plugin's own type invented the field it
 * used to read.
 *
 * The probe tolerates a host without `mounted` (or a controller the runtime
 * has not provided yet — the seat race this plugin already hit once on
 * 0.1.5): the session list then doubles as the change pulse, so a late
 * service is still picked up on the next list publish instead of never.
 *
 * @param ctx - the client context.
 * @returns the observable face of the mounted seat's session id.
 */
export declare function mountedSessions(ctx: Context): MountedSessions;
/**
 * The session whose seat is on screen, or `undefined` — no seat is mounted
 * (global panel, column not mounted) or the host has no mounted feed. Callers
 * treat `undefined` as "not this session": nothing the plugin draws belongs to
 * that surface, so it must neither write into it nor manage its column.
 *
 * @param ctx - the client context.
 * @returns the on-screen session id, when there is one.
 */
export declare function mountedSessionId(ctx: Context): string | undefined;
/**
 * Bind the plugin's write face to the native controller.
 * @param ctx - the client context (session list + `ctx.sidebarRight`).
 * @param records - the plugin's native tab record registry.
 * @returns the surface, plus a disposer unbinding its two feed subscriptions.
 */
export declare function createNativeSurface(ctx: Context, records: NativeTabRecords): NativeSurface;

/**
 * Client-side read of the user-facing "Side card" preferences. The host owns
 * the namespace through the settings seam (in-process); the DSH settings RPC
 * domain only serves allowlisted namespaces to configuration clients, so the
 * client reads and writes THIS namespace through the plugin's own fenced
 * /sidebar routes instead (api.settingsGet/settingsUpdate). Any failure
 * (route rejected, namespace absent, a field of the wrong type, a value out
 * of the contract range) falls back to the schema defaults — the side card
 * must keep working exactly as composed when the settings surface is missing.
 */
import type { api } from './api.ts';
import { clampTitleBarStrip, SIDEBAR_PREFS_DEFAULTS, TITLE_BAR_SCHEMES, TITLE_BAR_STRIP_DEFAULT, type SidebarPrefs, type TitleBarScheme } from '../prefs-shared.ts';
export { SIDEBAR_PREFS_DEFAULTS, TITLE_BAR_SCHEMES, TITLE_BAR_STRIP_DEFAULT, clampTitleBarStrip, };
export type { SidebarPrefs, TitleBarScheme };
/** The settings wire face the preferences need (a subset of the plugin api). */
export type SidebarSettingsClient = Pick<typeof api, 'settingsGet' | 'settingsUpdate'>;
/** Validate one raw resolved value into {@link SidebarPrefs}. Used for the
 * settings.get payload AND the settings.update response (both carry the
 * layered resolved value); any malformed field falls back to its default.
 * @param value - the raw resolved section from the settings wire.
 * @returns validated prefs (always well-formed).
 */
export declare function parsePrefs(value: unknown): SidebarPrefs;
/**
 * Read the resolved side card preferences through the plugin's settings route.
 * @param settings - the settings wire face (the plugin api by default).
 * @returns validated prefs, or the schema defaults when the route rejects,
 * the namespace is absent, or a stored value violates the contract.
 */
export declare function loadPrefs(settings: SidebarSettingsClient): Promise<SidebarPrefs>;
/**
 * Read the external-disable flag from the same settings route: the
 * dsh-web-ui family's aionui-panel provider choice. True only when the host
 * resolved `aionui-panel.rightPanel` to 'aionui-panel' — while true the
 * sidebar must not mount (the two right panels are mutually exclusive). Any
 * failure (route rejected, aionui absent, malformed response) reads false,
 * so a missing family never hides the sidebar.
 * @param settings - the settings wire face (the plugin api by default).
 * @returns the external-disable flag (false on any failure).
 */
export declare function loadExternalDisable(settings: SidebarSettingsClient): Promise<boolean>;
/** The boot decision both the prefs and the external-disable flag need:
 *  ONE settings fetch answers both (the boot path used to await
 *  {@link loadPrefs} and {@link loadExternalDisable} serially — two round
 *  trips of the same document before the first paint, and the second had no
 *  timeout, so a stalled wire could keep the sidebar unmounted forever). */
export interface BootDecision {
    prefs: SidebarPrefs;
    suspended: boolean;
}
export declare function loadBootDecision(settings: SidebarSettingsClient): Promise<BootDecision>;

import { type Config, type ConfigInput, type ResolvedConfig } from './config.js';
import { type ClientModeRuntime, type HostConnectionHandle, type HostAuthorizationControl } from './client-runtime.js';
import { type HostWebServerLike } from './control-route.js';
export interface PluginSettingsView {
    config: Config;
    deviceName: string;
    writable: boolean;
    applies: 'live' | 'restart';
    association?: PluginAssociation;
    associations: Partial<Record<'host' | 'client', PluginAssociation>>;
    acpAvailability?: Record<string, boolean>;
}
export interface PluginAssociation {
    method: 'account' | 'host_registration_code' | 'owned_device';
    account?: string;
}
/**
 * Live read/write face of the plugin's profile-owned entry Config.
 *
 * DSH 0.1.7-rc.1 (DSH-0.1.7-RC1-04) removed the settings-namespace registry
 * and its scope type: the entry's editable fields are a single
 * `.volatile()` Cordis Config, read through `.get()`, and writes go to
 * `ctx.settings.replace(entryId, section)` (persisted in the active profile's
 * `cordis.patch.yml` under the entry id).
 */
export interface PluginSettingsBinding {
    /** The current config, read from the entry's live volatile reference. */
    get(): ConfigInput;
    /** Replace the entry's editable fields in the active profile. */
    replace(section: Config): Promise<void>;
}
/** Loopback-only control plane shared by Local/Remote switching and plugin setup. */
export declare class PluginControlRuntime {
    private config;
    private readonly identityDirectory;
    private readonly settings;
    private client;
    private host;
    private readonly switchServer?;
    private logoutFlight?;
    private serverSwitchFlight?;
    constructor(config: ResolvedConfig, identityDirectory: string, settings: PluginSettingsBinding | undefined, client: ClientModeRuntime | undefined, host: HostAuthorizationControl | undefined, switchServer?: ((config: ResolvedConfig) => Promise<{
        client: ClientModeRuntime | undefined;
        host: HostAuthorizationControl;
    }>) | undefined);
    register(connection: HostConnectionHandle, webServer?: HostWebServerLike): () => Promise<void>;
    /**
     * Read the value the status event stream pushes. It resolves through the same
     * endpoint handler as the unary `status` control call, so a pushed status and
     * a polled one can never diverge.
     */
    private streamStatus;
    private handle;
    private configure;
    private setServer;
    private applyServer;
    private setRole;
    private setDevelopment;
    private setCodex;
    private setCursor;
    private setAcp;
    private addAcp;
    private removeAcp;
    private authorizeOwnedRole;
    private logout;
    private clearAuthorization;
    private settingsView;
    private associations;
    private association;
    private hostOnlyStatus;
}
//# sourceMappingURL=control-runtime.d.ts.map
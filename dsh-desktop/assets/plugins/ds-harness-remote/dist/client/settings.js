import { createHostPairingPanel } from './pairing.js';
import { createServerNotice } from './server-notice.js';
import QRCode from 'qrcode';
import { connectionErrorMessage, connectionStatusClass, connectionStatusLabel, formatLocalTime, displayRemoteAccount, messageOf, startupErrorMessage, } from './presentation.js';
const sidebarEntryChoices = [
    { value: 'standard', label: 'sidebarEntryStandard' },
    { value: 'compact', label: 'sidebarEntryCompact' },
];
export function createRemotePluginOptions(React) {
    const ServerNotice = createServerNotice(React);
    const HostPairingPanel = createHostPairingPanel(React);
    function RemotePluginOptions(props) {
        const { t } = props;
        const subscribeStatus = typeof props.statusFeed?.subscribe === 'function'
            ? props.statusFeed.subscribe
            : () => () => { };
        const getStatusSnapshot = typeof props.statusFeed?.getSnapshot === 'function'
            ? props.statusFeed.getSnapshot
            : () => undefined;
        const modeStatus = React.useSyncExternalStore(subscribeStatus, getStatusSnapshot, getStatusSnapshot);
        const [open, setOpen] = React.useState(props.view === 'page');
        const [serverUrl, setServerUrl] = React.useState('');
        const [savingServer, setSavingServer] = React.useState(false);
        const [editingServer, setEditingServer] = React.useState(false);
        const serverDraftEdited = React.useRef(false);
        const [remoteToolsBusy, setRemoteToolsBusy] = React.useState(false);
        const [remoteToolsEnabled, setRemoteToolsEnabled] = React.useState(true);
        const [associations, setAssociations] = React.useState({});
        const [loaded, setLoaded] = React.useState(false);
        const [writable, setWritable] = React.useState(false);
        const [busy, setBusy] = React.useState(false);
        const [terminalEnabled, setTerminalEnabled] = React.useState(false);
        const [debugBusy, setDebugBusy] = React.useState(false);
        const [debugLogging, setDebugLogging] = React.useState(false);
        const [resetBusy, setResetBusy] = React.useState(false);
        const [terminalBusy, setTerminalBusy] = React.useState(false);
        const [sidebarEntry, setSidebarEntry] = React.useState(() => props.sidebarEntry?.read?.() ?? 'standard');
        const [sidebarEntryBusy, setSidebarEntryBusy] = React.useState(false);
        const [acpBackends, setAcpBackends] = React.useState([]);
        const [acpAvailability, setAcpAvailability] = React.useState({});
        const [acpChecking, setAcpChecking] = React.useState({});
        const [acpInstalling, setAcpInstalling] = React.useState({});
        const [acpCheckResults, setAcpCheckResults] = React.useState({});
        const [reconnectBusy, setReconnectBusy] = React.useState(false);
        const [hostStatus, setHostStatus] = React.useState(undefined);
        const [hostName, setHostName] = React.useState('');
        const [hostDeviceId, setHostDeviceId] = React.useState('');
        const [notice, setNotice] = React.useState(undefined);
        const [error, setError] = React.useState(undefined);
        const [settingsView, setSettingsView] = React.useState(undefined);
        // Inline Sign-In state (folds/unfolds inside the settings card without modal dialog)
        const [signInOpen, setSignInOpen] = React.useState(false);
        const [loginEmail, setLoginEmail] = React.useState('');
        const [loginPassword, setLoginPassword] = React.useState('');
        const [loginMethod, setLoginMethod] = React.useState('password');
        const [oauthProviders, setOAuthProviders] = React.useState([]);
        const [providersLoading, setProvidersLoading] = React.useState(false);
        const [providersFailed, setProvidersFailed] = React.useState(false);
        const [pairingAvailable, setPairingAvailable] = React.useState(false);
        const [qrSession, setQrSession] = React.useState(undefined);
        const [qrImage, setQrImage] = React.useState(undefined);
        const [qrExpired, setQrExpired] = React.useState(false);
        const [qrFailed, setQrFailed] = React.useState(false);
        const [qrBusy, setQrBusy] = React.useState(false);
        const [qrCompleted, setQrCompleted] = React.useState(false);
        const [providerReload, setProviderReload] = React.useState(0);
        const [completionReload, setCompletionReload] = React.useState(0);
        const qrFlowRun = React.useRef(0);
        const providerRequestRun = React.useRef(0);
        const loginMethodManuallySelected = React.useRef(false);
        const selectedLoginMethod = React.useRef(loginMethod);
        selectedLoginMethod.current = loginMethod;
        const associationReadRun = React.useRef(0);
        const association = associations.client ?? associations.host;
        React.useEffect(() => { if (association !== undefined)
            setSignInOpen(false); }, [association]);
        const savedServerUrl = settingsView?.config.serverUrl;
        const serverDirty = savedServerUrl === undefined || serverUrl.trim() !== savedServerUrl;
        const applyAssociations = (view) => {
            setAssociations(view.associations ?? (view.association === undefined ? {} : { host: view.association }));
        };
        const applyView = (view, updateAssociations = true) => {
            setSettingsView(view);
            if (!serverDraftEdited.current)
                setServerUrl(view.config.serverUrl ?? 'https://dsh.r2049.cn');
            setTerminalEnabled(view.config.terminal?.enabled ?? true);
            setDebugLogging(view.config.logLevel === 'debug');
            setRemoteToolsEnabled(view.config.remoteTools?.enabled ?? true);
            setSidebarEntry(view.config.sidebar?.entry ?? 'standard');
            props.sidebarEntry?.publish(view.config.sidebar?.entry ?? 'standard');
            setAcpBackends((view.config.acp?.backends ?? []).map(item => ({ id: item.id, enabled: item.enabled !== false })));
            setAcpAvailability(view.acpAvailability ?? {});
            if (updateAssociations)
                applyAssociations(view);
            setWritable(view.writable);
            setLoaded(true);
        };
        const load = async () => {
            const run = ++associationReadRun.current;
            const [view, status] = await Promise.all([
                props.control('settings.get'),
                props.control('status').catch(() => undefined),
            ]);
            applyView(view, run === associationReadRun.current);
            setHostStatus(status?.host);
            setHostName(status?.deviceName ?? '');
            setHostDeviceId(status?.host?.deviceId ?? '');
        };
        React.useEffect(() => {
            void load().catch(reason => setError(messageOf(reason, t)));
        }, []);
        React.useEffect(() => {
            let active = true;
            let authorizationKey;
            const unsubscribe = props.statusFeed.subscribe(status => {
                setHostStatus(status.host);
                setHostName(status.deviceName ?? '');
                setHostDeviceId(status.host?.deviceId ?? '');
                // Either account entry point rotates these identities on sign-out.
                // Refresh the read-only settings snapshot on that change without
                // fetching settings for ordinary connection/statistics updates.
                const key = JSON.stringify([status.serverUrl, status.deviceId, status.host?.deviceId,
                    status.host?.authorized, status.host?.account, status.startupError?.code]);
                if (key === authorizationKey)
                    return;
                authorizationKey = key;
                const run = ++associationReadRun.current;
                void props.control('settings.get').then(view => {
                    if (active && run === associationReadRun.current)
                        applyView(view);
                }).catch(() => undefined);
            });
            return () => { active = false; unsubscribe(); };
        }, [props.statusFeed]);
        React.useEffect(() => {
            if (!signInOpen || savingServer || serverDirty)
                return;
            let active = true;
            const run = ++providerRequestRun.current;
            qrFlowRun.current += 1;
            setQrSession(undefined);
            setQrImage(undefined);
            setQrExpired(false);
            setQrFailed(false);
            setQrBusy(false);
            setQrCompleted(false);
            setOAuthProviders([]);
            setPairingAvailable(false);
            setProvidersLoading(true);
            setProvidersFailed(false);
            void props.control('client.account.providers').then(items => {
                if (!active || run !== providerRequestRun.current)
                    return;
                const pairingSupported = items.some(item => item.devicePairing === true);
                setPairingAvailable(pairingSupported);
                const available = items.filter(item => item.qrStartUrl != null);
                setOAuthProviders(available);
                setLoginMethod(current => {
                    if (loginMethodManuallySelected.current && (current === 'password' || current === 'device_pairing' && pairingSupported
                        || available.some(item => `oauth:${item.id}` === current)))
                        return current;
                    const preferred = available.find(item => item.id === props.preferredQrProvider) ?? available[0];
                    return preferred === undefined ? 'password' : `oauth:${preferred.id}`;
                });
            }).catch(reason => {
                if (!active || run !== providerRequestRun.current)
                    return;
                setProvidersFailed(true);
                setPairingAvailable(false);
                setLoginMethod('password');
                if (selectedLoginMethod.current !== 'device_pairing')
                    setError(messageOf(reason, t));
            }).finally(() => {
                if (active && run === providerRequestRun.current)
                    setProvidersLoading(false);
            });
            return () => { active = false; };
        }, [signInOpen, props.preferredQrProvider, providerReload, savingServer, serverDirty, savedServerUrl]);
        React.useEffect(() => {
            if (!signInOpen || savingServer || serverDirty || providersLoading || !loginMethod.startsWith('oauth:')
                || !oauthProviders.some(item => `oauth:${item.id}` === loginMethod)
                || qrSession !== undefined || qrExpired || qrFailed || qrCompleted)
                return;
            let active = true;
            const run = ++qrFlowRun.current;
            setQrBusy(true);
            setQrFailed(false);
            setError(undefined);
            setQrExpired(false);
            void props.control('client.account.qr.start', { provider: loginMethod.slice(6) })
                .then(async (session) => {
                if (!active || run !== qrFlowRun.current)
                    return;
                const image = await QRCode.toDataURL(session.scanUrl, {
                    width: 184,
                    margin: 1,
                    errorCorrectionLevel: 'L',
                });
                if (!active || run !== qrFlowRun.current)
                    return;
                setQrSession(session);
                setQrImage(image);
            })
                .catch(reason => {
                if (!active || run !== qrFlowRun.current)
                    return;
                setQrFailed(true);
                setError(messageOf(reason, t));
            })
                .finally(() => {
                if (active && run === qrFlowRun.current)
                    setQrBusy(false);
            });
            return () => { active = false; };
        }, [signInOpen, providersLoading, oauthProviders, loginMethod, qrSession, qrExpired, qrFailed, providerReload, savingServer, serverDirty]);
        React.useEffect(() => {
            if (!signInOpen || savingServer || serverDirty || !loginMethod.startsWith('oauth:') || qrSession === undefined)
                return;
            let active = true;
            let polling = false;
            let settled = false;
            const run = qrFlowRun.current;
            let timer;
            const poll = () => {
                if (polling || settled || !active || run !== qrFlowRun.current)
                    return;
                polling = true;
                void props.control('client.account.qr.poll', { qrId: qrSession.qrId }).then(result => {
                    if (!active || settled || run !== qrFlowRun.current)
                        return;
                    if (result.status === 'complete') {
                        settled = true;
                        if (timer !== undefined)
                            clearInterval(timer);
                        setError(undefined);
                        setQrExpired(false);
                        setQrCompleted(true);
                        setQrSession(undefined);
                        setQrImage(undefined);
                        setQrBusy(false);
                    }
                    else if (result.status === 'expired') {
                        settled = true;
                        if (timer !== undefined)
                            clearInterval(timer);
                        setQrExpired(true);
                        setQrSession(undefined);
                        setQrImage(undefined);
                        setQrBusy(false);
                    }
                }).catch(reason => {
                    if (active && !settled && run === qrFlowRun.current)
                        setError(messageOf(reason, t));
                }).finally(() => {
                    polling = false;
                });
            };
            poll();
            timer = setInterval(poll, 1_500);
            return () => {
                active = false;
                settled = true;
                if (timer !== undefined)
                    clearInterval(timer);
            };
        }, [signInOpen, loginMethod, qrSession, savingServer, serverDirty]);
        // Dedicated settings refresh effect on QR authorization completion
        React.useEffect(() => {
            if (!signInOpen || savingServer || serverDirty || !qrCompleted)
                return;
            let active = true;
            setError(undefined);
            void props.control('settings.get')
                .then(view => {
                if (!active)
                    return;
                applyView(view);
                setSignInOpen(false);
                setQrCompleted(false);
                setLoginPassword('');
                setNotice({ key: 'authorizationComplete' });
            })
                .catch(reason => {
                if (!active)
                    return;
                setError(messageOf(reason, t));
            });
            return () => {
                active = false;
            };
        }, [signInOpen, qrCompleted, completionReload, savingServer, serverDirty]);
        const saveLoginServer = async (serverUrlOverride) => {
            const nextServerUrl = (serverUrlOverride ?? serverUrl).trim();
            if (busy || savingServer || !writable || nextServerUrl === '' || serverUrlOverride === undefined && !serverDirty)
                return;
            setSavingServer(true);
            setBusy(true);
            setError(undefined);
            setNotice(undefined);
            qrFlowRun.current += 1;
            providerRequestRun.current += 1;
            setQrSession(undefined);
            setQrImage(undefined);
            setQrCompleted(false);
            setQrFailed(false);
            setQrExpired(false);
            setQrBusy(false);
            try {
                const view = await props.control('settings.server.set', { serverUrl: nextServerUrl });
                serverDraftEdited.current = false;
                setEditingServer(false);
                applyView(view);
                setLoginPassword('');
                setLoginEmail('');
                setHostStatus(undefined);
                setProviderReload(value => value + 1);
                setNotice({ key: view.applies === 'live' ? 'serverSavedLive' : 'serverSaved' });
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setSavingServer(false);
                setBusy(false);
            }
        };
        const signInClient = async () => {
            if (savingServer || serverDirty || loginEmail.trim() === '' || loginPassword === '')
                return;
            setBusy(true);
            setError(undefined);
            try {
                const result = await props.control('settings.configure', {
                    role: 'client',
                    serverUrl: serverUrl.trim() || 'https://dsh.r2049.cn',
                    email: loginEmail.trim(),
                    password: loginPassword,
                });
                applyView(result.settings);
                setSignInOpen(false);
                setLoginPassword('');
                setNotice({ key: 'authorizationComplete' });
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setBusy(false);
            }
        };
        const selectLoginMethod = (method) => {
            loginMethodManuallySelected.current = true;
            if (method === loginMethod)
                return;
            qrFlowRun.current += 1;
            setLoginMethod(method);
            setQrSession(undefined);
            setQrImage(undefined);
            setQrExpired(false);
            setQrFailed(false);
            setQrBusy(false);
            setQrCompleted(false);
            setError(undefined);
        };
        const logout = async () => {
            const run = ++associationReadRun.current;
            setBusy(true);
            setError(undefined);
            setNotice(undefined);
            try {
                const view = await props.control('settings.logout');
                applyView(view, run === associationReadRun.current);
                setSignInOpen(false);
                setNotice({ key: 'signedOut' });
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setBusy(false);
            }
        };
        const reconnectHost = async () => {
            setReconnectBusy(true);
            setError(undefined);
            setNotice(undefined);
            try {
                const status = await props.control('host.reconnect');
                setHostStatus(status.host);
                setNotice({ key: 'reconnectStarted' });
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setReconnectBusy(false);
            }
        };
        const setCurrentDeviceControl = async (enabled) => {
            setBusy(true);
            setError(undefined);
            setNotice(undefined);
            try {
                const status = await props.control('host.authorization.set', { enabled });
                setHostStatus(status.host);
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setBusy(false);
            }
        };
        const setTerminalRemote = async (enabled) => {
            const previous = terminalEnabled;
            setTerminalEnabled(enabled);
            setTerminalBusy(true);
            setError(undefined);
            setNotice(undefined);
            try {
                const view = await props.control('settings.development.set', { terminalEnabled: enabled });
                applyView(view);
                setNotice({ key: 'terminalSaved' });
            }
            catch (reason) {
                setTerminalEnabled(previous);
                setError(messageOf(reason, t));
            }
            finally {
                setTerminalBusy(false);
            }
        };
        const setSidebarEntryStyle = async (entry) => {
            if (entry === sidebarEntry)
                return;
            const previous = sidebarEntry;
            setSidebarEntry(entry);
            setSidebarEntryBusy(true);
            setError(undefined);
            setNotice(undefined);
            try {
                const view = await props.control('settings.appearance.set', { sidebarEntry: entry });
                applyView(view);
                setNotice({ key: 'sidebarEntrySaved' });
            }
            catch (reason) {
                setSidebarEntry(previous);
                setError(messageOf(reason, t));
            }
            finally {
                setSidebarEntryBusy(false);
            }
        };
        const setRemoteTools = async (enabled) => {
            setRemoteToolsBusy(true);
            setError(undefined);
            setNotice(undefined);
            try {
                // Include the terminal value for compatibility with older Hosts whose
                // development settings endpoint requires one of the legacy fields.
                const view = await props.control('settings.development.set', { remoteToolsEnabled: enabled, terminalEnabled });
                applyView(view);
                setNotice({ key: 'remoteToolsSaved' });
            }
            catch (reason) {
                setRemoteToolsEnabled(!enabled);
                setError(messageOf(reason, t));
            }
            finally {
                setRemoteToolsBusy(false);
            }
        };
        const checkAcp = async (backend) => {
            if (acpChecking[backend])
                return;
            setAcpChecking(current => ({ ...current, [backend]: true }));
            setAcpCheckResults(current => ({ ...current, [backend]: undefined }));
            setError(undefined);
            try {
                const view = await props.control('settings.get');
                applyView(view);
                const available = view.acpAvailability?.[backend] === true;
                if (!available && view.writable && view.config.acp?.backends?.some(item => item.id === backend && item.enabled !== false)) {
                    applyView(await props.control('settings.acp.set', { backend, enabled: false }));
                }
                setAcpCheckResults(current => ({ ...current, [backend]: available }));
                setNotice({ key: available ? 'acpAvailable' : 'acpUnavailable' });
                setTimeout(() => setAcpCheckResults(current => ({ ...current, [backend]: undefined })), 5_000);
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setAcpChecking(current => ({ ...current, [backend]: false }));
            }
        };
        const removeAcp = async (backend) => {
            setBusy(true);
            setError(undefined);
            try {
                const view = await props.control('settings.acp.remove', { id: backend });
                applyView(view);
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setBusy(false);
            }
        };
        const installOrConfigureAcp = async (backend) => {
            if (acpInstalling[backend])
                return;
            setAcpInstalling(current => ({ ...current, [backend]: true }));
            setError(undefined);
            try {
                const view = await props.control('settings.acp.installOrConfigure', { backend });
                applyView(view);
                if (view.acpInstallResult?.action === 'download_required' && view.acpInstallResult.downloadUrl) {
                    const name = backend === 'cursor' ? 'Cursor' : backend === 'antigravity' ? 'Antigravity' : backend === 'hermes' ? 'Hermes' : backend;
                    setNotice({
                        key: 'acpDownloadRequired',
                        params: { backend: name, url: view.acpInstallResult.downloadUrl },
                    });
                }
                else if (view.acpInstallResult?.action === 'installed') {
                    setNotice({ key: 'acpInstalledNotice' });
                }
                else {
                    setNotice({ key: 'acpConfiguredNotice' });
                }
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setAcpInstalling(current => ({ ...current, [backend]: false }));
            }
        };
        const setDebug = async (enabled) => {
            if (debugBusy)
                return;
            setDebugBusy(true);
            setError(undefined);
            try {
                applyView(await props.control('settings.development.set', { debugLogging: enabled }));
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setDebugBusy(false);
            }
        };
        const developmentSetting = React.createElement('section', { className: 'dshRemoteDevelopmentSettings' }, React.createElement('div', { className: 'dshRemoteAuthorizationSetting' }, React.createElement('div', null, React.createElement('strong', null, t('debugLogging')), React.createElement('p', null, t('debugLoggingHint'))), React.createElement('input', {
            type: 'checkbox', role: 'switch', checked: debugLogging,
            disabled: busy || debugBusy || !writable, 'aria-label': t('debugLogging'),
            onChange: (event) => void setDebug(event.target.checked),
        })), React.createElement('div', { className: 'dshRemoteAuthorizationSetting' }, React.createElement('div', null, React.createElement('strong', null, t('terminalRemote')), React.createElement('p', null, t('terminalRemoteHint'))), React.createElement('input', {
            type: 'checkbox', role: 'switch', checked: terminalEnabled,
            disabled: busy || terminalBusy || !writable, 'aria-label': t('terminalRemote'),
            onChange: (event) => void setTerminalRemote(event.target.checked),
        })), React.createElement('div', { className: 'dshRemoteAuthorizationSetting' }, React.createElement('div', null, React.createElement('strong', null, t('remoteTools')), React.createElement('p', null, t('remoteToolsHint'))), React.createElement('input', {
            type: 'checkbox', role: 'switch', checked: remoteToolsEnabled,
            disabled: remoteToolsBusy || !writable, 'aria-label': t('remoteTools'),
            onChange: (event) => {
                const enabled = event.target.checked;
                setRemoteToolsEnabled(enabled);
                void setRemoteTools(enabled);
            },
        })));
        // The entry style is presentation only, so it lives beside the development
        const resetIdentity = async () => {
            if (!window.confirm(t('resetIdentityConfirm')))
                return;
            const run = ++associationReadRun.current;
            setResetBusy(true);
            setError(undefined);
            setNotice(undefined);
            try {
                const view = await props.control('settings.identity.reset', {});
                const status = await props.control('status').catch(() => undefined);
                applyView(view, run === associationReadRun.current);
                if (status !== undefined) {
                    setHostStatus(status.host);
                    setHostName(status.deviceName ?? '');
                    setHostDeviceId(status.host?.deviceId ?? '');
                }
                setSignInOpen(false);
                setNotice({ key: 'resetIdentitySuccess' });
            }
            catch (reason) {
                setError(messageOf(reason, t));
            }
            finally {
                setResetBusy(false);
            }
        };
        const resetDisabledByStartupState = settingsView?.startupError?.code === 'STORAGE_CONFLICT'
            || settingsView?.startupError?.code === 'IDENTITY_LOCKED';
        const resetIdentitySetting = React.createElement('div', { className: 'dshRemoteAuthorizationSetting' }, React.createElement('div', null, React.createElement('strong', null, t('resetIdentity')), React.createElement('p', null, t('resetIdentityHint'))), React.createElement('button', {
            type: 'button',
            className: 'dshRemoteDiscard',
            disabled: busy || resetBusy || !writable || resetDisabledByStartupState,
            onClick: () => void resetIdentity(),
        }, t(resetBusy ? 'resettingAction' : 'resetIdentity')));
        const startupErrorBanner = settingsView?.startupError !== undefined
            ? React.createElement('p', { className: 'dshRemoteError', role: 'alert' }, startupErrorMessage(settingsView.startupError, t))
            : null;
        // switches instead of inside the Host-facing settings block.
        const sidebarEntrySetting = React.createElement('div', { className: 'dshRemoteAuthorizationSetting' }, React.createElement('div', null, React.createElement('strong', null, t('sidebarEntry')), React.createElement('p', null, t('sidebarEntryHint'))), React.createElement('div', {
            className: 'dshRemoteEntryStyleChoices',
            role: 'radiogroup',
            'aria-label': t('sidebarEntry'),
        }, sidebarEntryChoices.map(choice => React.createElement('button', {
            key: choice.value,
            type: 'button',
            role: 'radio',
            'aria-checked': sidebarEntry === choice.value,
            className: sidebarEntry === choice.value ? 'isSelected' : undefined,
            disabled: sidebarEntryBusy || !writable,
            onClick: () => void setSidebarEntryStyle(choice.value),
        }, t(choice.label)))));
        const acpSetting = React.createElement('details', { className: 'dshRemoteAuthorizationSetting dshRemoteAcpSetting' }, React.createElement('summary', null, React.createElement('div', { className: 'dshRemoteAcpSummaryText' }, React.createElement('strong', null, t('agentBackends')), React.createElement('p', null, t('acpHint'), React.createElement('a', {
            href: 'https://github.com/liguobao/ds-harness-remote/blob/feat/cursor-remote/docs/acp-remote.md',
            target: '_blank', rel: 'noopener noreferrer',
            onClick: (event) => event.stopPropagation(),
        }, t('acpDocumentation'))))), React.createElement('div', { className: 'dshRemoteAcpList' }, acpBackends.map(item => React.createElement('div', { key: item.id, className: 'dshRemoteAuthorizationSetting' }, React.createElement('div', null, React.createElement('strong', null, item.id === 'codex' ? 'CodeX' : item.id === 'cursor' ? 'Cursor' : item.id === 'antigravity' ? 'AGY' : item.id === 'claude' ? 'Claude' : item.id === 'pi' ? 'Pi' : item.id === 'opencode' ? 'OpenCode' : item.id === 'hermes' ? 'Hermes' : item.id), null), React.createElement('span', { className: 'dshRemoteAcpCheckCell' }, 
        // One entry per backend: while the command is unresolved this slot is
        // the fix (scan / install), once it resolves it turns back into the
        // read-only availability check. Keeping both visible at once made the
        // row read as two competing actions.
        writable && !busy && acpAvailability[item.id] !== true && ['codex', 'cursor', 'antigravity', 'pi', 'claude', 'opencode', 'hermes'].includes(item.id)
            ? React.createElement('a', {
                href: `#install-acp-${item.id}`,
                className: `dshRemoteAcpInstallLink${acpInstalling[item.id] ? ' isInstalling' : ''}`,
                onClick: (event) => { event.preventDefault(); void installOrConfigureAcp(item.id); },
            }, acpInstalling[item.id] ? t('installingAcp') : (['cursor', 'antigravity', 'hermes'].includes(item.id) ? t('configureAcp') : t('installAcp')))
            : React.createElement('a', { href: `#check-acp-${item.id}`, className: `dshRemoteAcpCheckLink${acpChecking[item.id] ? ' isChecking' : acpCheckResults[item.id] === undefined ? '' : acpCheckResults[item.id] ? ' isPassed' : ' isFailed'}`, onClick: (event) => { event.preventDefault(); void checkAcp(item.id); } }, acpChecking[item.id] ? t('checkingAcp') : acpCheckResults[item.id] === undefined ? t('checkAcp') : t(acpCheckResults[item.id] ? 'acpCheckPassed' : 'acpCheckFailed'))), ['codex', 'cursor', 'antigravity', 'pi', 'claude', 'opencode', 'hermes'].includes(item.id) ? null : React.createElement('a', { href: `#remove-acp-${item.id}`, className: 'dshRemoteAcpRemoveLink', onClick: (event) => { event.preventDefault(); void removeAcp(item.id); } }, t('removeAcp')), React.createElement('input', {
            type: 'checkbox', role: 'switch', checked: settingsView?.config.acp?.enabled === true && item.enabled && acpAvailability[item.id] === true, 'aria-label': item.id, disabled: busy || !writable || acpChecking[item.id] === true || acpAvailability[item.id] !== true,
            onChange: (event) => void props.control('settings.acp.set', { backend: item.id, enabled: event.target.checked }).then(view => { applyView(view); setAcpBackends((view.config.acp?.backends ?? []).map(v => ({ id: v.id, enabled: v.enabled !== false }))); }).catch(reason => setError(messageOf(reason, t)))
        })))));
        if (props.view === 'summary')
            return React.createElement('span', null, t('pluginDescription'));
        const orderedQrProviders = [...oauthProviders].sort((a, b) => Number(b.id === props.preferredQrProvider) - Number(a.id === props.preferredQrProvider));
        const selectedProvider = oauthProviders.find(item => `oauth:${item.id}` === loginMethod);
        const scanLabel = t('scanWithProvider', { provider: selectedProvider?.displayName ?? '' });
        const passwordVisible = !savingServer && !serverDirty && loginMethod === 'password' && (loginMethodManuallySelected.current || (!providersLoading && !providersFailed && oauthProviders.length === 0));
        const qrLoginTab = (provider) => React.createElement('button', {
            key: provider.id, type: 'button', role: 'tab', id: `dsh-remote-settings-oauth:${provider.id}-tab`,
            'aria-selected': loginMethod === `oauth:${provider.id}`, 'aria-controls': `dsh-remote-settings-oauth:${provider.id}-panel`,
            className: loginMethod === `oauth:${provider.id}` ? 'isActive' : '', disabled: busy,
            onClick: () => selectLoginMethod(`oauth:${provider.id}`),
        }, provider.displayName);
        const inlineSignIn = !signInOpen || association !== undefined ? null : React.createElement('div', {
            id: 'dsh-remote-inline-signin',
            className: 'dshRemoteInlineSignIn',
        }, serverDirty && loginMethod !== 'device_pairing' ? React.createElement('p', { className: 'dshRemoteSettingsState', role: 'status' }, t('saveServerBeforeLogin')) : null, React.createElement('div', { className: 'dshRemoteLoginTabs', role: 'tablist', 'aria-label': t('signInAccount') }, pairingAvailable ? React.createElement('button', {
            type: 'button', role: 'tab', id: 'dsh-remote-settings-device-pairing-tab',
            'aria-selected': loginMethod === 'device_pairing', 'aria-controls': 'dsh-remote-settings-device-pairing-panel',
            className: loginMethod === 'device_pairing' ? 'isActive' : '', disabled: busy,
            onClick: () => selectLoginMethod('device_pairing'),
        }, t('pairingLoginTab')) : null, ...orderedQrProviders.map(qrLoginTab), React.createElement('button', {
            type: 'button', role: 'tab', id: 'dsh-remote-settings-password-tab',
            'aria-selected': passwordVisible, 'aria-controls': 'dsh-remote-settings-password-panel',
            className: passwordVisible ? 'isActive' : '', disabled: busy,
            onClick: () => selectLoginMethod('password'),
        }, t('accountPasswordLogin'))), React.createElement('div', { className: 'dshRemoteLoginContent' }, providersLoading && loginMethod !== 'device_pairing' ? React.createElement('p', { className: 'dshRemoteSettingsState', role: 'status' }, t('loadingLoginProviders')) : null, loginMethod === 'device_pairing' && pairingAvailable
            ? React.createElement('div', { role: 'tabpanel', id: 'dsh-remote-settings-device-pairing-panel', 'aria-labelledby': 'dsh-remote-settings-device-pairing-tab' }, React.createElement(HostPairingPanel, { key: settingsView?.config.serverUrl ?? '', control: props.control, serverUrl: settingsView?.config.serverUrl ?? '', disabled: busy || !writable || serverDirty, t, onComplete: () => void props.control('settings.get').then(view => { applyView(view); setSignInOpen(false); props.onSignIn?.(); }).catch(() => undefined) }))
            : passwordVisible
                ? React.createElement('div', {
                    className: 'dshRemoteClientLogin', role: 'tabpanel', id: 'dsh-remote-settings-password-panel',
                    'aria-labelledby': 'dsh-remote-settings-password-tab',
                }, React.createElement('input', {
                    type: 'email', value: loginEmail, disabled: busy, autoComplete: 'username', placeholder: t('account'),
                    'aria-label': t('account'), onChange: (event) => setLoginEmail(event.target.value),
                }), React.createElement('input', {
                    type: 'password', value: loginPassword, disabled: busy, autoComplete: 'current-password', placeholder: t('password'),
                    'aria-label': t('password'), onChange: (event) => setLoginPassword(event.target.value),
                }), React.createElement('button', {
                    type: 'button', disabled: busy || loginEmail.trim() === '' || loginPassword === '',
                    onClick: () => void signInClient(),
                }, t(busy ? 'signingIn' : 'startSignIn')), React.createElement('p', { className: 'dshRemotePasswordHint' }, t('passwordHint')))
                : !savingServer && !serverDirty && selectedProvider !== undefined
                    ? React.createElement('div', {
                        className: 'dshRemoteQrLogin', role: 'tabpanel', id: `dsh-remote-settings-${loginMethod}-panel`,
                        'aria-labelledby': `dsh-remote-settings-${loginMethod}-tab`,
                    }, qrCompleted
                        ? React.createElement('div', { className: 'dshRemoteInlineSignInQrState' }, React.createElement('p', null, t('loadingSettings')), React.createElement('button', {
                            type: 'button', className: 'dshRemoteReconnect', disabled: busy,
                            onClick: () => {
                                setError(undefined);
                                setCompletionReload(v => v + 1);
                            },
                        }, t('retryLoginProviders')))
                        : qrFailed
                            ? React.createElement('div', { className: 'dshRemoteInlineSignInQrState' }, React.createElement('p', null, t('retryLoginProviders')), React.createElement('button', {
                                type: 'button', className: 'dshRemoteReconnect', disabled: qrBusy,
                                onClick: () => {
                                    setQrFailed(false);
                                    setQrExpired(false);
                                    setQrSession(undefined);
                                    setQrImage(undefined);
                                },
                            }, t('retryLoginProviders')))
                            : qrExpired
                                ? React.createElement('div', { className: 'dshRemoteInlineSignInQrState' }, React.createElement('p', null, t('qrLoginExpired')), React.createElement('button', {
                                    type: 'button', className: 'dshRemoteReconnect', disabled: qrBusy,
                                    onClick: () => {
                                        setQrExpired(false);
                                        setQrFailed(false);
                                        setQrSession(undefined);
                                        setQrImage(undefined);
                                    },
                                }, t('refreshQrCode')))
                                : qrImage === undefined
                                    ? React.createElement('div', { className: 'dshRemoteQrPlaceholder', 'aria-busy': qrBusy }, React.createElement('span', null, t('checkingConnection')))
                                    : qrSession !== undefined
                                        ? React.createElement('a', {
                                            className: 'dshRemoteQrOpen', href: qrSession.scanUrl,
                                            target: '_blank', rel: 'noopener noreferrer',
                                            'aria-label': t('openInBrowser'),
                                        }, React.createElement('img', {
                                            src: qrImage, width: 184, height: 184,
                                            alt: scanLabel,
                                        }), React.createElement('span', null, t('openInBrowser'), ' ↗'))
                                        : null, React.createElement('strong', null, scanLabel), React.createElement('p', null, t('scanLoginHint')))
                    : null), React.createElement('div', { className: 'dshRemoteServiceAddress' }, React.createElement('span', null, t('currentServiceAddress')), editingServer
            ? React.createElement('form', {
                className: 'dshRemoteLoginServer',
                onSubmit: (event) => { event.preventDefault(); void saveLoginServer(); },
            }, React.createElement('input', {
                id: 'dsh-remote-settings-server', type: 'url', required: true,
                'aria-label': t('serverUrl'), value: serverUrl,
                disabled: busy || savingServer || !writable, autoComplete: 'url',
                placeholder: t('serverUrl'), onChange: (event) => {
                    serverDraftEdited.current = true;
                    setServerUrl(event.target.value);
                },
            }), React.createElement('button', {
                type: 'submit', disabled: busy || savingServer || !writable || !serverDirty || serverUrl.trim() === '',
            }, t(savingServer ? 'saving' : 'save')), React.createElement('button', {
                type: 'button', disabled: busy || savingServer || !writable,
                onClick: () => { serverDraftEdited.current = true; setServerUrl('https://dsh.r2049.cn'); void saveLoginServer('https://dsh.r2049.cn'); },
            }, t('restoreDefaultServiceAddress')), React.createElement('button', {
                type: 'button', disabled: busy || savingServer || !writable,
                onClick: () => {
                    serverDraftEdited.current = false;
                    setServerUrl(savedServerUrl ?? 'https://dsh.r2049.cn');
                    setEditingServer(false);
                },
            }, t('cancelServiceAddressEdit')))
            : React.createElement(React.Fragment, null, React.createElement('a', {
                href: savedServerUrl ?? serverUrl, target: '_blank', rel: 'noreferrer',
            }, savedServerUrl ?? serverUrl), React.createElement('button', {
                type: 'button', className: 'dshRemoteServiceAddressEdit',
                disabled: busy || savingServer || !writable,
                title: t('editServiceAddress'), 'aria-label': t('editServiceAddress'),
                onClick: () => setEditingServer(true),
            }, React.createElement('svg', {
                viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none',
                stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': true,
            }, React.createElement('path', { d: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z' }))))));
        return React.createElement(props.view === 'page' ? 'div' : 'li', {
            className: `dshRemotePluginCard${open ? ' isOpen' : ''}${props.view === 'page' ? ' dshRemotePluginModern' : ''}`,
            ...(props.view === 'page' ? { 'data-dsh-remote-settings': '' } : {}),
        }, React.createElement('div', { className: 'dshRemotePluginCardHeader' }, React.createElement('button', {
            type: 'button',
            className: 'dshRemotePluginCardToggle',
            'aria-expanded': open,
            'aria-label': t(open ? 'collapseSettings' : 'expandSettings', { name: t('pluginTitle') }),
            onClick: () => setOpen(current => !current),
        }, React.createElement('span', { className: 'dshRemotePluginCardHeading' }, React.createElement('strong', null, t('pluginTitle')), React.createElement('span', null, t('pluginDescription'))), association === undefined ? null : React.createElement('span', {
            className: `dshRemotePluginCardStatus${connectionStatusClass(hostStatus)}`,
        }, hostStatus?.authorized && !hostStatus.accountRequired && !hostStatus.online
            && (hostStatus.error !== undefined || hostStatus.lastActiveAt !== undefined)
            ? React.createElement(ServerNotice, {
                offline: true,
                linked: (hostStatus.connectedClients?.length ?? 0) > 0,
                expiresAt: hostStatus.recoveryExpiresAt, t,
            })
            : modeStatus?.mode === 'remote'
                ? t('remoteTarget', { name: modeStatus.target?.name ?? t('host') })
                : t('local')), React.createElement('span', { className: 'dshRemotePluginCardChevron', 'aria-hidden': true }, '⌄'))), !open ? null : React.createElement('div', { className: 'dshRemotePluginCardBody' }, !loaded
            ? React.createElement('p', { className: 'dshRemoteSettingsState' }, error ?? t('loadingSettings'))
            : association !== undefined
                ? React.createElement('div', { className: 'dshRemoteSettings' }, React.createElement('div', { className: 'dshRemoteSettingsTop' }, React.createElement('div', { className: 'dshRemoteAssociation' }, React.createElement('span', null, t(association.account === undefined ? 'authorization' : 'account')), React.createElement('strong', null, association.account === undefined ? t('authorizationComplete') : displayRemoteAccount(association.account)), React.createElement('p', null, association.account === undefined
                    ? serverUrl
                    : t('authorizedOn', { role: 'Remote', serverUrl })))), React.createElement('div', { className: 'dshRemoteHostIdentity' }, React.createElement('div', null, React.createElement('span', null, t('hostName')), React.createElement('strong', null, hostName || '—')), React.createElement('div', null, React.createElement('span', null, t('deviceId')), React.createElement('code', null, hostDeviceId || '—'))), startupErrorBanner, developmentSetting, sidebarEntrySetting, resetIdentitySetting, acpSetting, React.createElement('div', { className: 'dshRemoteAuthorizationSetting' }, React.createElement('div', null, React.createElement('strong', null, t('allowControlCurrentDevice')), React.createElement('p', null, t('thisMachineHost'))), React.createElement('input', {
                    type: 'checkbox', role: 'switch', disabled: busy,
                    'aria-label': t('allowControlCurrentDevice'),
                    checked: hostStatus?.authorized === true,
                    onChange: (event) => void setCurrentDeviceControl(event.target.checked),
                })), React.createElement('div', { className: 'dshRemoteConnection', 'aria-live': 'polite' }, React.createElement('div', { className: 'dshRemoteConnectionSummary' }, React.createElement('span', null, t('connection')), React.createElement('strong', null, React.createElement('span', {
                    className: `dshRemoteConnectionDot${connectionStatusClass(hostStatus)}`,
                    'aria-hidden': true,
                }), connectionStatusLabel(hostStatus, t)), React.createElement('p', null, hostStatus === undefined
                    ? t('checkingConnection')
                    : hostStatus.lastActiveAt === undefined
                        ? t('neverConnected')
                        : t('lastActive', { time: formatLocalTime(hostStatus.lastActiveAt) }))), React.createElement('button', {
                    type: 'button',
                    className: 'dshRemoteReconnect',
                    disabled: reconnectBusy || hostStatus?.configured === false,
                    onClick: () => void reconnectHost(),
                }, t(reconnectBusy ? 'reconnectingAction' : 'reconnect'))), hostStatus?.authorized && !hostStatus.accountRequired ? React.createElement(ServerNotice, {
                    offline: !hostStatus.online && hostStatus.reconnecting,
                    linked: (hostStatus.connectedClients?.length ?? 0) > 0,
                    expiresAt: hostStatus.recoveryExpiresAt, t,
                }) : null, hostStatus?.error === undefined || hostStatus.online || (hostStatus.reconnecting && hostStatus.error === 'CONNECTION_FAILED')
                    ? null
                    : React.createElement('p', { className: 'dshRemoteConnectionIssue', role: 'status' }, connectionErrorMessage(hostStatus.error, t)), !writable ? React.createElement('p', { className: 'dshRemoteError' }, t('readOnly')) : null, React.createElement('div', { className: 'dshRemoteSettingsFooter' }, React.createElement('p', {
                    className: error !== undefined ? 'dshRemoteError' : 'dshRemoteNotice',
                    role: error !== undefined ? 'alert' : 'status',
                }, error ?? (notice === undefined ? '' : t(notice.key, notice.params))), React.createElement('button', {
                    type: 'button',
                    className: 'dshRemoteDiscard',
                    disabled: busy || !writable,
                    onClick: () => void logout(),
                }, t(busy ? 'signingOut' : 'signOut'))), inlineSignIn)
                : React.createElement('div', { className: 'dshRemoteSettings' }, startupErrorBanner, React.createElement('div', { className: 'dshRemoteHostIdentity' }, React.createElement('div', null, React.createElement('span', null, t('hostName')), React.createElement('strong', null, hostName || '—')), React.createElement('div', null, React.createElement('span', null, t('deviceId')), React.createElement('code', null, hostDeviceId || '—'))), developmentSetting, sidebarEntrySetting, resetIdentitySetting, acpSetting, React.createElement('div', { className: 'dshRemoteSettingsSignIn' }, React.createElement('p', { className: 'dshRemoteSettingsState' }, t('authorizeFromRemote')), React.createElement('button', {
                    type: 'button',
                    className: signInOpen ? 'dshRemoteDiscard' : 'dshRemoteSave',
                    disabled: busy || resetBusy || !loaded || settingsView?.startupError !== undefined,
                    'aria-expanded': signInOpen,
                    'aria-controls': 'dsh-remote-inline-signin',
                    onClick: () => {
                        setError(undefined);
                        setSignInOpen(current => !current);
                    },
                }, t(signInOpen ? 'close' : 'signInAccount'))), inlineSignIn, !writable ? React.createElement('p', { className: 'dshRemoteError' }, t('readOnly')) : null, error !== undefined || notice !== undefined ? React.createElement('div', { className: 'dshRemoteSettingsFooter' }, React.createElement('p', {
                    className: error !== undefined ? 'dshRemoteError' : 'dshRemoteNotice',
                    role: error !== undefined ? 'alert' : 'status',
                }, error ?? t(notice.key, notice.params))) : null)));
    }
    return RemotePluginOptions;
}
//# sourceMappingURL=settings.js.map
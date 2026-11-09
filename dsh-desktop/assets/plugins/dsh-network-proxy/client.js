window.__ModuleLoader__.load({
  id: '@local/dsh-network-proxy',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'network-proxy';

    /** Simplified Chinese copy; also the key-set source of truth. */
    const zh = {
      'general.title': 'HTTP 代理',
      'general.description': '模型、MCP、命令工具与网页抓取的网络请求都会经过这条策略。系统代理会自动读取操作系统的代理设置；修改后立即生效，无需重启。',
      'mode.label': '代理模式',
      'mode.direct': '直连',
      'mode.system': '跟随系统',
      'mode.custom': '自定义',
      'system.detected': '检测到的系统代理：{url}',
      'system.dormant': '系统代理未开启（检测到 {url}，可在系统里开启）',
      'system.none': '系统代理未启用 / 未检测到系统代理',
      'system.pac': '检测到 PAC 自动配置：{url}',
      'system.redetect': '重新检测',
      'system.detecting': '检测中…',
      'custom.label': '自定义代理地址',
      'custom.placeholder': 'http://127.0.0.1:7890',
      'custom.save': '保存',
      'custom.saving': '保存中…',
      'custom.unsaved': '尚未保存',
      'status.active': '当前生效：{url}',
      'status.direct': '当前生效：直连',
      'status.launch': '当前生效：启动时的代理策略（来自环境变量）',
      'status.reachable': '已连通',
      'status.unreachable': '无法连接',
      'status.pac': 'PAC 自动配置',
      'common.loading': '加载中…',
      'error.retry': '重试',
      'error.timeout': 'Host 响应超时，请重试。',
      'error.offline': '无法连接到 Host；请刷新页面后重试。',
      'code.systemDisabled': '系统代理已关闭',
      'code.systemNone': '未检测到系统代理',
      'code.systemUnreadable': '无法读取系统代理设置',
      'code.pacDetected': '使用 PAC 自动配置脚本',
      'code.pacFailed': 'PAC 自动配置脚本无法解析',
      'code.wpadUnsupported': '已启用自动检测（WPAD），暂不支持',
      'code.socksUnsupported': '检测到 SOCKS 代理，暂不支持',
      'code.proxyUnreachable': '代理端口无法连接',
      'code.invalidCustom': '代理地址无效，请使用 http:// 或 https://',
      'code.undiciUnavailable': '当前运行时缺少网络组件，无法切换',
      'code.applyFailed': '切换失败',
      'code.persistFailed': '设置已生效，但保存失败（重启后会丢失）',
      'code.bypassAll': '旁路列表为 *，所有流量都直连',
      'code.unknown': '未知状态',
    };

    /** English copy, key-identical to the Chinese one. */
    const en = {
      'general.title': 'HTTP proxy',
      'general.description': 'Network requests from models, MCP servers, command tools and web fetch follow this policy. The system proxy is read from your OS automatically; changes apply immediately without a restart.',
      'mode.label': 'Proxy mode',
      'mode.direct': 'Direct',
      'mode.system': 'Follow system',
      'mode.custom': 'Custom',
      'system.detected': 'Detected system proxy: {url}',
      'system.dormant': 'System proxy is off (found {url}; you can enable it in your OS settings)',
      'system.none': 'System proxy is off / no system proxy detected',
      'system.pac': 'PAC auto-config detected: {url}',
      'system.redetect': 'Detect again',
      'system.detecting': 'Detecting…',
      'custom.label': 'Custom proxy address',
      'custom.placeholder': 'http://127.0.0.1:7890',
      'custom.save': 'Save',
      'custom.saving': 'Saving…',
      'custom.unsaved': 'Not saved',
      'status.active': 'In effect: {url}',
      'status.direct': 'In effect: direct',
      'status.launch': 'In effect: the launch-time proxy policy (from environment variables)',
      'status.reachable': 'reachable',
      'status.unreachable': 'unreachable',
      'status.pac': 'via PAC',
      'common.loading': 'Loading…',
      'error.retry': 'Retry',
      'error.timeout': 'The Host took too long to respond; try again.',
      'error.offline': 'Cannot reach the Host; reload the page and try again.',
      'code.systemDisabled': 'System proxy is turned off',
      'code.systemNone': 'No system proxy detected',
      'code.systemUnreadable': 'Could not read the system proxy settings',
      'code.pacDetected': 'A PAC auto-config script is in use',
      'code.pacFailed': 'The PAC auto-config script could not be resolved',
      'code.wpadUnsupported': 'Automatic proxy detection (WPAD) is enabled, which is not supported yet',
      'code.socksUnsupported': 'A SOCKS proxy was detected, which is not supported yet',
      'code.proxyUnreachable': 'The proxy port is unreachable',
      'code.invalidCustom': 'Invalid proxy address; use an http:// or https:// URL with a port',
      'code.undiciUnavailable': 'This runtime lacks the network component needed to switch',
      'code.applyFailed': 'Could not switch',
      'code.persistFailed': 'Applied, but saving failed; it will be lost after a restart',
      'code.bypassAll': 'The bypass list is *, so every request connects directly',
      'code.unknown': 'Unknown status',
    };

    /** Mode segments, in display order. */
    const MODES = [
      { id: 'direct', key: 'mode.direct' },
      { id: 'system', key: 'mode.system' },
      { id: 'custom', key: 'mode.custom' },
    ];

    /** Diagnostic code → locale key. Unknown codes fall back to the Host message. */
    const CODE_KEYS = {
      'system-disabled': 'code.systemDisabled',
      'system-none': 'code.systemNone',
      'system-unreadable': 'code.systemUnreadable',
      'pac-detected': 'code.pacDetected',
      'pac-failed': 'code.pacFailed',
      'wpad-unsupported': 'code.wpadUnsupported',
      'socks-unsupported': 'code.socksUnsupported',
      'proxy-unreachable': 'code.proxyUnreachable',
      'invalid-custom': 'code.invalidCustom',
      'undici-unavailable': 'code.undiciUnavailable',
      'apply-failed': 'code.applyFailed',
      'persist-failed': 'code.persistFailed',
      'bypass-all': 'code.bypassAll',
      'timeout': 'error.timeout',
    };

    /** Codes that describe a broken state rather than a mere notice. */
    const ERROR_CODES = ['invalid-custom', 'undici-unavailable', 'apply-failed'];

    let clientCtx = null;
    let seatTranslate = null;

    /** Replace `{name}` placeholders in one template. */
    function fill(template, vars) {
      if (typeof template !== 'string') return '';
      if (vars === undefined || vars === null) return template;
      let out = template;
      for (const key of Object.keys(vars)) out = out.split('{' + key + '}').join(String(vars[key]));
      return out;
    }

    function currentDict() {
      try {
        const locale = clientCtx === null ? undefined : clientCtx.get('locale');
        const snapshot = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : undefined;
        const id = String((snapshot && (snapshot.active ?? snapshot.id ?? snapshot.locale)) ?? 'en').toLowerCase();
        return id.startsWith('zh') ? zh : en;
      } catch (error) { return en; }
    }

    function tr(key, vars) {
      if (typeof seatTranslate === 'function') {
        try {
          const text = seatTranslate(key, vars);
          if (typeof text === 'string' && text.length > 0 && text !== key) return fill(text, vars);
        } catch (error) { /* fall back to the local dictionary */ }
      }
      const dict = currentDict();
      const template = dict[key] !== undefined ? dict[key] : en[key];
      return fill(template === undefined ? key : template, vars);
    }

    /** A translator for one component, preferring the slot's locale seat. */
    function translatorFor(props) {
      return (key, vars) => {
        if (typeof props.t === 'function') {
          try {
            const text = props.t(key, vars);
            if (typeof text === 'string' && text.length > 0 && text !== key) return fill(text, vars);
          } catch (error) { /* fall back */ }
        }
        return tr(key, vars);
      };
    }

    /** A plain object, or null for anything else. */
    function asObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }

    /** A non-empty string, or null. */
    function asText(value) {
      return typeof value === 'string' && value.length > 0 ? value : null;
    }

    /** Normalize the saved preference shape. */
    function normalizeSettings(raw) {
      const record = asObject(raw);
      const mode = record !== null && (record.mode === 'direct' || record.mode === 'system' || record.mode === 'custom')
        ? record.mode
        : 'system';
      return { mode, custom: asText(record === null ? null : record.custom) ?? '' };
    }

    /** Read the diagnostic codes carried by a status or detection payload. */
    function codesOf(record) {
      const codes = record !== null && Array.isArray(record.codes) ? record.codes : [];
      return codes.filter((code) => typeof code === 'string' && code.length > 0);
    }

    /** Project the applied status into the small shape the row renders. */
    function summarizeStatus(raw) {
      const record = asObject(raw);
      const sample = asText(record === null ? null : record.sample);
      const http = asText(record === null ? null : record.http);
      const https = asText(record === null ? null : record.https);
      const active = record !== null && record.active === true;
      const reachable = record !== null && record.reachable === true
        ? true
        : (record !== null && record.reachable === false ? false : null);
      return {
        active,
        source: asText(record === null ? null : record.source),
        url: active ? (sample ?? http ?? https) : null,
        reachable,
        pac: record !== null && record.pac === true,
        codes: codesOf(record),
      };
    }

    /** Carries the diagnostic `code` (and a network hint) alongside the message. */
    function carry(error, code, offline) {
      if (typeof code === 'string' && code.length > 0) error.code = code;
      if (offline === true) error.offline = true;
      return error;
    }

    /** The `{ code, message }` pair of one failed response body. */
    function failureShape(data) {
      const payload = asObject(data);
      const detail = payload === null ? null : asObject(payload.error);
      const code = detail === null ? undefined : asText(detail.code);
      let message = detail === null ? '' : (asText(detail.message) ?? '');
      if (message === '' && payload !== null && typeof payload.message === 'string') message = payload.message;
      return { code: code === null ? undefined : code, message };
    }

    /** Call the package's own authenticated Host route. */
    async function hostCall(payload) {
      const base = new URL('.', document.baseURI);
      const url = new URL('api/network-proxy', base);
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller === null ? null : window.setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url.toString(), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          ...(controller === null ? {} : { signal: controller.signal }),
        });
      } catch (cause) {
        const aborted = controller !== null && controller.signal.aborted;
        throw carry(
          new Error(aborted ? 'request timed out' : (cause && cause.message ? cause.message : 'network error')),
          aborted ? 'timeout' : undefined,
          aborted ? false : true,
        );
      } finally {
        if (timer !== null) window.clearTimeout(timer);
      }
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch (error) { data = null; }
      if (!response.ok) {
        const failure = failureShape(data);
        const message = failure.message !== '' ? failure.message : 'HTTP ' + response.status;
        throw carry(new Error(message), failure.code, false);
      }
      if (data === null) throw carry(new Error('empty response'), undefined, false);
      if (data.ok !== true) {
        const failure = failureShape(data);
        throw carry(new Error(failure.message !== '' ? failure.message : 'failed'), failure.code, false);
      }
      return data;
    }

    /** Turn a thrown rejection into the row's comparable failure shape. */
    function toFailure(error) {
      if (error === undefined || error === null) return { code: undefined, message: '', offline: false };
      return {
        code: typeof error.code === 'string' && error.code.length > 0 ? error.code : undefined,
        message: typeof error.message === 'string' ? error.message : String(error),
        offline: error.offline === true,
      };
    }

    /** Localized text for one failure, code first and Host message as fallback. */
    function failureText(failure, translate) {
      if (failure === null || failure === undefined) return '';
      if (failure.offline === true) return translate('error.offline');
      const key = failure.code === undefined ? undefined : CODE_KEYS[failure.code];
      if (key !== undefined) return translate(key);
      if (typeof failure.message === 'string' && failure.message.length > 0) return failure.message;
      return translate('code.unknown');
    }

    /** Localized text for one diagnostic code with no message attached. */
    function codeText(code, translate) {
      const key = CODE_KEYS[code];
      return key === undefined ? translate('code.unknown') : translate(key);
    }

    /** Treat a diagnostic code as an error rather than a notice. */
    function isErrorCode(code) {
      return ERROR_CODES.indexOf(code) !== -1;
    }

    /** The one-line summary of what Windows currently reports. */
    function systemText(detection, translate) {
      const record = asObject(detection);
      if (record === null) return translate('system.none');
      if (codesOf(record).indexOf('system-unreadable') !== -1) return translate('code.systemUnreadable');
      const http = asText(record.http);
      const https = asText(record.https);
      const url = http ?? https;
      const pacUrl = asText(record.pacUrl);
      const dormant = asText(record.dormant);
      if (record.enabled === true && url !== null) return translate('system.detected', { url });
      if (record.enabled === true && pacUrl !== null) return translate('system.pac', { url: pacUrl });
      if (record.enabled !== true && dormant !== null) return translate('system.dormant', { url: dormant });
      return translate('system.none');
    }

    /** The authority of a URL as written, without userinfo. */
    function rawAuthority(text) {
      const start = text.indexOf('//');
      const rest = start === -1 ? text : text.slice(start + 2);
      const end = rest.search(/[/?#]/);
      const authority = end === -1 ? rest : rest.slice(0, end);
      const at = authority.lastIndexOf('@');
      return at === -1 ? authority : authority.slice(at + 1);
    }

    /** The port the text writes, even when it is the scheme's default. */
    function explicitPort(text) {
      const match = /^(?:\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(rawAuthority(text));
      if (match === null) return null;
      const port = Number(match[1]);
      return port >= 1 && port <= 65535 ? String(port) : null;
    }

    /** Validate a typed proxy URL the same way the Host does. */
    function isProxyUrl(value) {
      const text = String(value ?? '').trim();
      if (text === '') return false;
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
      try {
        const url = new URL(text);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        if (url.hostname === '') return false;
        // `url.port` is empty for the scheme's default port, so recover the
        // digits from the text; a port must still be written explicitly.
        if (url.port === '' && explicitPort(text) === null) return false;
        // Match the Host: malformed percent escapes would make every proxied
        // request throw URIError inside undici's ProxyAgent.
        decodeURIComponent(url.username);
        decodeURIComponent(url.password);
        return true;
      } catch (error) { return false; }
    }

    // ------------------------------------------------------------ components

    /**
     * The General-settings preference row: title, description, the three-way
     * mode segment, the mode-specific detail, and the applied-status line.
     */
    function NetworkProxyRow(props) {
      const translate = translatorFor(props);
      const [view, setView] = React.useState({ phase: 'loading', settings: null, status: null, detection: null, failure: null });
      const [mode, setMode] = React.useState(null);
      const [customText, setCustomText] = React.useState('');
      const [customFailure, setCustomFailure] = React.useState(null);
      const [pending, setPending] = React.useState(null);
      const [attempt, setAttempt] = React.useState(0);

      /** Adopt one successful response and optionally pin the visible mode. */
      const adopt = (response, pinnedMode) => {
        const record = asObject(response) ?? {};
        const settings = normalizeSettings(record.settings);
        setView({
          phase: 'ready',
          settings,
          status: asObject(record.status),
          detection: asObject(record.detection),
          failure: null,
        });
        setMode(typeof pinnedMode === 'string' ? pinnedMode : settings.mode);
        // Re-sync the editable field: an unsaved edit is discarded when the
        // Host confirms a mode, so the row never shows a value the Host lacks.
        setCustomText(settings.custom);
        setCustomFailure(null);
        return settings;
      };

      React.useEffect(() => {
        let cancelled = false;
        setView({ phase: 'loading', settings: null, status: null, detection: null, failure: null });
        hostCall({ action: 'get' }).then((response) => {
          if (cancelled) return;
          adopt(response, undefined);
        }, (error) => {
          if (cancelled) return;
          setView({ phase: 'error', settings: null, status: null, detection: null, failure: toFailure(error) });
        });
        return () => { cancelled = true; };
        // One ask per mount or explicit retry; mode changes carry their own response.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [attempt]);

      /** Re-run the initial load after a transient failure. */
      const retry = () => {
        if (pending !== null) return;
        setAttempt((value) => value + 1);
      };

      /** Swap the active mode; the Host applies it before the selection moves. */
      const selectMode = (next) => {
        if (pending !== null || view.phase === 'loading') return;
        if (next === mode) return;
        setCustomFailure(null);
        if (next === 'custom') {
          // A custom address is only applied by 保存/Enter. Seed an empty field
          // with the proxy the OS reports while its own switch is off.
          setMode('custom');
          if (String(customText ?? '').trim() === '') {
            const dormant = asText(asObject(view.detection) === null ? null : view.detection.dormant);
            if (dormant !== null) setCustomText(dormant);
          }
          return;
        }
        setPending('mode');
        hostCall({ action: 'set', mode: next }).then((response) => {
          setPending(null);
          adopt(response, next);
        }, (error) => {
          setPending(null);
          setView((current) => ({ ...current, failure: toFailure(error) }));
        });
      };

      /**
       * Re-read the OS proxy and re-apply it while staying in system mode.
       * `detect` alone only refreshes the display, so a proxy the user just
       * enabled in the OS would not take effect until the mode was switched.
       */
      const detect = () => {
        if (pending !== null) return;
        setPending('detect');
        hostCall({ action: 'set', mode: 'system', refresh: true }).then((response) => {
          setPending(null);
          adopt(response, 'system');
        }, (error) => {
          setPending(null);
          setView((current) => ({ ...current, failure: toFailure(error) }));
        });
      };

      /** Apply the typed custom address. */
      const saveCustom = () => {
        if (pending !== null) return;
        const value = String(customText === null ? '' : customText).trim();
        if (!isProxyUrl(value)) {
          setCustomFailure({ code: 'invalid-custom', message: '', offline: false });
          return;
        }
        setCustomFailure(null);
        setPending('save');
        hostCall({ action: 'set', mode: 'custom', custom: value }).then((response) => {
          setPending(null);
          const settings = adopt(response, 'custom');
          setCustomText(settings.custom === '' ? value : settings.custom);
        }, (error) => {
          setPending(null);
          setCustomFailure(toFailure(error));
        });
      };

      const busy = pending !== null;
      const loaded = view.phase !== 'loading';

      const modes = MODES.map((entry) => h('button', {
        key: entry.id,
        type: 'button',
        className: 'dnp-mode',
        'aria-pressed': mode === entry.id,
        disabled: busy || !loaded,
        onClick: () => selectMode(entry.id),
      }, translate(entry.key)));

      const savedCustom = view.settings === null ? '' : view.settings.custom;
      const dirty = mode === 'custom' && String(customText ?? '').trim() !== savedCustom;

      let detail = null;
      if (mode === 'system') {
        detail = h('div', { className: 'dnp-detail' },
          h('div', { className: 'dnp-line' }, systemText(view.detection, translate)),
          h('button', {
            type: 'button',
            className: 'dnp-mini',
            disabled: busy,
            onClick: detect,
          }, translate(pending === 'detect' ? 'system.detecting' : 'system.redetect')));
      } else if (mode === 'custom') {
        detail = h('div', { className: 'dnp-detail' },
          h('input', {
            className: 'dnp-input',
            type: 'text',
            value: customText,
            placeholder: translate('custom.placeholder'),
            'aria-label': translate('custom.label'),
            disabled: busy,
            spellCheck: false,
            autoComplete: 'off',
            onChange: (event) => {
              setCustomText(event.target.value);
              setCustomFailure(null);
            },
            onKeyDown: (event) => {
              // Enter that confirms an IME candidate must not submit the field.
              if (event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return;
              if (event.key !== 'Enter') return;
              event.preventDefault();
              saveCustom();
            },
          }),
          h('button', {
            type: 'button',
            className: 'dnp-primary',
            disabled: busy,
            onClick: saveCustom,
          }, translate(pending === 'save' ? 'custom.saving' : 'custom.save')),
          dirty ? h('span', { className: 'dnp-unsaved' }, translate('custom.unsaved')) : null,
          customFailure === null ? null : h('div', {
            className: 'dnp-inlineError',
            role: 'alert',
          }, failureText(customFailure, translate)));
      }

      const statusLines = [];
      if (view.phase === 'loading') {
        statusLines.push(h('div', {
          key: 'loading',
          className: 'dnp-status',
          'data-tone': 'muted',
        }, translate('common.loading')));
      } else if (view.status !== null) {
        const summary = summarizeStatus(view.status);
        const pacOnly = summary.active && summary.pac && summary.url === null;
        let headline;
        if (summary.source === 'launch') {
          headline = translate('status.launch');
        } else if (summary.url === null) {
          headline = pacOnly ? translate('status.active', { url: translate('status.pac') }) : translate('status.direct');
        } else {
          headline = translate('status.active', { url: summary.url });
        }
        const parts = [headline];
        if (summary.url !== null && summary.pac) parts.push(translate('status.pac'));
        let tone = 'normal';
        if (summary.url !== null && summary.reachable === false) {
          parts.push(translate('status.unreachable'));
          tone = 'warn';
        } else if (summary.url !== null && summary.reachable === true) {
          parts.push(translate('status.reachable'));
        }
        statusLines.push(h('div', {
          key: 'status',
          className: 'dnp-status',
          'data-tone': tone,
          role: 'status',
        }, parts.join(' · ')));
        const codes = summary.codes.filter((code) => !(code === 'proxy-unreachable' && summary.reachable === false));
        if (codes.length > 0) {
          statusLines.push(h('div', {
            key: 'codes',
            className: 'dnp-codes',
            'data-tone': codes.some(isErrorCode) ? 'error' : 'warn',
          }, codes.map((code) => codeText(code, translate)).join(' · ')));
        }
      }
      if (view.failure !== null) {
        statusLines.push(h('div', {
          key: 'failure',
          className: 'dnp-status',
          'data-tone': 'error',
          role: 'alert',
        },
        failureText(view.failure, translate),
        view.phase === 'error'
          ? h('button', {
            type: 'button',
            className: 'dnp-mini dnp-retry',
            disabled: busy,
            onClick: retry,
          }, translate('error.retry'))
          : null));
      }

      return h('div', { className: 'dnp-group' },
        h('div', { className: 'dnp-head' },
          h('div', { className: 'dnp-title' }, translate('general.title')),
          h('div', { className: 'dnp-desc' }, translate('general.description'))),
        h('div', {
          className: 'dnp-modes',
          role: 'group',
          'aria-label': translate('mode.label'),
        }, modes),
        detail,
        statusLines.length === 0 ? null : h('div', { className: 'dnp-statusGroup' }, statusLines));
    }

    // ---------------------------------------------------------------- styles

    const CSS = [
      '.dnp-group{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dnp-head{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.dnp-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
      '.dnp-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
      '.dnp-modes{display:flex;align-items:stretch;gap:8px;min-width:0}',
      '.dnp-mode{box-sizing:border-box;flex:1 1 0;min-width:0;padding:10px 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-xl);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;white-space:nowrap;text-align:center;cursor:pointer}',
      '.dnp-mode:hover:not(:disabled):not([aria-pressed=true]){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dnp-mode[aria-pressed=true]{background:var(--dsw-alias-bg-module-platform);border-color:var(--dsw-static-neutral-bluish-400)}',
      '.dnp-mode:disabled{opacity:.55;cursor:default}',
      '.dnp-detail{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}',
      '.dnp-line{flex:1 1 auto;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}',
      '.dnp-mini{box-sizing:border-box;flex:none;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.dnp-mini:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dnp-mini:disabled{opacity:.55;cursor:default}',
      '.dnp-input{box-sizing:border-box;flex:1 1 180px;min-width:0;height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}',
      '.dnp-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dnp-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dnp-input:disabled{opacity:.55}',
      '.dnp-primary{box-sizing:border-box;flex:none;height:32px;padding:0 16px;border:.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);border-radius:var(--dsw-radius-sm);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}',
      '.dnp-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 20%,transparent)}',
      '.dnp-primary:disabled{opacity:.55;cursor:default}',
      '.dnp-inlineError{flex:1 1 100%;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}',
      '.dnp-unsaved{flex:none;color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}',
      '.dnp-retry{margin-left:8px;height:22px;padding:0 8px}',
      '.dnp-statusGroup{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dnp-status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}',
      '.dnp-status[data-tone=muted]{color:var(--dsw-alias-label-tertiary)}',
      '.dnp-status[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}',
      '.dnp-status[data-tone=error]{color:var(--dsw-alias-state-error-primary)}',
      '.dnp-codes{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow-wrap:anywhere}',
      '.dnp-codes[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}',
      '.dnp-codes[data-tone=error]{color:var(--dsw-alias-state-error-primary)}',
    ].join('');

    // ---------------------------------------------------------------- plugin

    function apply(ctx) {
      clientCtx = ctx;

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'network-proxy: dictionaries');
      try { seatTranslate = ctx.locale.bind(NS); } catch (error) { seatTranslate = null; }

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = '@local/dsh-network-proxy';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => { tag.remove(); };
      }, 'network-proxy: styles');

      ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'network-proxy',
        order: 13,
        locale: NS,
      }, NetworkProxyRow)), 'network-proxy: settings row');
    }

    return {
      inject: ['slots', 'locale'],
      apply,
      // Pure helpers for `test/client.test.mjs`; the ModuleLoader ignores extra exports.
      __test: {
        codeKeys: CODE_KEYS,
        codeText,
        dictionaries: { zh, en },
        explicitPort,
        failureText,
        fill,
        isProxyUrl,
        normalizeSettings,
        summarizeStatus,
        systemText,
      },
    };
  },
});

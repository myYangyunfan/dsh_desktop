window.__ModuleLoader__.load({ id: "dsh-community-market", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  NS: () => NS,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/MarketLauncher.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function MarketLauncher({ wide, useStore, actions, t }) {
  const open = useStore((state) => state.open);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("tab"), delayMs: 500, disabled: wide, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.Button,
    {
      variant: "ghost",
      className: "dshMarketLauncher",
      "data-wide": wide,
      "aria-label": t("tab"),
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCordisPluginOutline14, { size: wide ? 16 : 18 }),
      onClick: () => actions.open(),
      children: wide ? t("tab") : null
    }
  ) });
}

// src/client/MarketOverlay.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/MarketSettingsTab.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/media/ref.ts
function marketMediaAssetUrl(assetRef) {
  return `/api/community-market/assets?ref=${encodeURIComponent(assetRef)}`;
}

// src/client/api.ts
var CATALOG_PAGE_LIMIT = 50;
async function readJson(response) {
  const value = await response.json();
  if (!response.ok) {
    throw new MarketApiError(
      typeof value.error === "string" ? value.error : `request failed: ${response.status}`,
      response.status,
      typeof value.code === "string" ? value.code : void 0
    );
  }
  return value;
}
var MarketApiError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "MarketApiError";
  }
};
async function readMarketState(signal) {
  return await readJson(await fetch("/api/community-market/state", {
    cache: "no-store",
    ...signal === void 0 ? {} : { signal }
  }));
}
function marketCatalogUrl(sourceRecordId, q, locale, categories) {
  const url = new URL("/api/community-market/catalog", window.location.origin);
  url.searchParams.set("sourceRecordId", sourceRecordId);
  if (q.trim()) url.searchParams.set("q", q.trim());
  for (const category of categories) url.searchParams.append("category", category);
  url.searchParams.set("limit", String(CATALOG_PAGE_LIMIT));
  url.searchParams.set("locale", locale);
  return url;
}
async function readMarketCatalog(sourceRecordId, q, locale, categories, signal, refresh = false) {
  const url = marketCatalogUrl(sourceRecordId, q, locale, categories);
  if (refresh) url.searchParams.set("refresh", "1");
  return await readJson(await fetch(url, {
    cache: "no-store",
    ...signal === void 0 ? {} : { signal }
  }));
}
async function readMoreMarketCatalog(sourceRecordId, cursor, q, locale, categories, signal) {
  const url = marketCatalogUrl(sourceRecordId, q, locale, categories);
  url.searchParams.set("cursor", cursor);
  return await readJson(await fetch(url, {
    cache: "no-store",
    ...signal === void 0 ? {} : { signal }
  }));
}
async function mutateMarketSource(mutation, signal) {
  const response = await readJson(await fetch("/api/community-market/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mutation),
    ...signal === void 0 ? {} : { signal }
  }));
  return response.sources;
}
async function readMarketInstallations(signal) {
  return await readJson(await fetch("/api/community-market/installations", {
    cache: "no-store",
    ...signal === void 0 ? {} : { signal }
  }));
}
async function readMarketInstallable(locale, refresh = false, signal) {
  const url = new URL("/api/community-market/installable", window.location.origin);
  url.searchParams.set("locale", locale);
  if (refresh) url.searchParams.set("refresh", "1");
  return await readJson(await fetch(url, {
    cache: "no-store",
    ...signal === void 0 ? {} : { signal }
  }));
}
async function previewMarketOperation(request, signal) {
  return await readJson(await fetch("/api/community-market/operations/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    ...signal === void 0 ? {} : { signal }
  }));
}
async function executeMarketOperation(previewId, signal) {
  return await readJson(await fetch("/api/community-market/operations/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ previewId }),
    ...signal === void 0 ? {} : { signal }
  }));
}
async function openMarketTerminal(signal) {
  return await readJson(await fetch("/api/community-market/desktop/open-terminal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
    ...signal === void 0 ? {} : { signal }
  }));
}
async function requestMarketRestart(restartToken, signal) {
  // [desktop-restart-fix] DSH Desktop 受监管环境：重启权归壳层。host 半边的
  // desktopActions.requestRestart() 是 no-op；这里转接壳层桥
  // window.dshDesktop.restartService()（原地监管重启，不走 host 自杀路径）。
  // HTTP 确认仍先发（消费一次性 restartToken），再触发壳层重启。
  try {
    const bridge = typeof window !== "undefined" ? window.dshDesktop : undefined;
    if (bridge !== undefined && typeof bridge.restartService === "function") {
      await readJson(await fetch("/api/community-market/desktop/request-restart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restartToken }),
        ...signal === void 0 ? {} : { signal }
      }));
      Promise.resolve().then(() => bridge.restartService()).catch(() => {});
      return { ok: true };
    }
  } catch { /* 桥路径失败时回落原生 HTTP 重启路径 */ }
  return await readJson(await fetch("/api/community-market/desktop/request-restart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restartToken }),
    ...signal === void 0 ? {} : { signal }
  }));
}

// src/client/MarketSettingsTab.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var INSTALLABLE_PAGE_SIZE = 50;
var INSTALL_REQUIREMENTS_DOCS = {
  en: "https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-community-market/docs/install-and-uninstall.md",
  zh: "https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-community-market/docs/install-and-uninstall.zh.md"
};
var CATALOG_ADAPTER_GUIDE_DOCS = {
  en: "https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-community-market/docs/catalog-adapter-guide.md",
  zh: "https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-community-market/docs/catalog-adapter-guide.zh.md"
};
var DSH_DESKTOP_ISSUES_URL = "https://github.com/anywhere-labs/deepseek-harness-desktop/issues";
function installRequirementsUrl(locale) {
  return locale.toLowerCase().startsWith("zh") ? INSTALL_REQUIREMENTS_DOCS.zh : INSTALL_REQUIREMENTS_DOCS.en;
}
function catalogAdapterGuideUrl(locale) {
  return locale.toLowerCase().startsWith("zh") ? CATALOG_ADAPTER_GUIDE_DOCS.zh : CATALOG_ADAPTER_GUIDE_DOCS.en;
}
function visibleItemKey(value) {
  return `${value.source.sourceRecordId}\0${value.source.providerId}\0${value.item.id}\0${value.item.package?.name ?? ""}`;
}
function matchingInstallation(value, installations) {
  const packageName = value.item.package?.name;
  if (packageName === void 0) return void 0;
  const managed = installations.filter((installation) => installation.kind === "managed" && installation.receipt.sourceRecordId === value.source.sourceRecordId && installation.receipt.providerId === value.source.providerId && installation.receipt.itemId === value.item.id && installation.receipt.packageName === packageName);
  if (managed.length === 1) return managed[0];
  if (managed.length > 1) return void 0;
  const external = installations.filter((installation) => installation.kind === "external" && installation.packageName === packageName);
  if (external.length === 1) return external[0];
  if (external.length > 1) return void 0;
  const immutable = installations.filter((installation) => installation.kind === "immutable" && installation.packageName === packageName);
  return immutable.length === 1 ? immutable[0] : void 0;
}
function isDesktopUnavailable(cause) {
  return cause !== null && typeof cause === "object" && "status" in cause && cause.status === 503;
}
var UPDATE_ERROR_MESSAGE_KEYS = {
  UPDATE_NO_INTEGRITY: "updateErrorNoIntegrity",
  UPDATE_INTEGRITY_MISMATCH: "updateErrorIntegrityMismatch",
  UPDATE_BAD_URL: "updateErrorBadUrl",
  UPDATE_ARCHIVE_UNSAFE: "updateErrorArchiveUnsafe",
  UPDATE_PACKAGE_MISMATCH: "updateErrorPackageMismatch",
  UPDATE_SCAN_BLOCKED: "updateErrorScanBlocked",
  UPDATE_ROLLBACK_FAILED: "updateErrorRollbackFailed",
  UPDATE_DOWNLOAD_FAILED: "updateErrorDownloadFailed"
};
function operationErrorMessage(cause, fallback, t) {
  const code = cause !== null && typeof cause === "object" && "code" in cause ? cause.code : void 0;
  if (typeof code === "string" && t !== void 0 && UPDATE_ERROR_MESSAGE_KEYS[code] !== void 0) {
    return t(UPDATE_ERROR_MESSAGE_KEYS[code]);
  }
  return cause instanceof Error && cause.message.trim().length > 0 ? cause.message : fallback;
}
function catalogFailureMessage(cause, source, t) {
  const code = cause !== null && typeof cause === "object" && "code" in cause ? cause.code : void 0;
  const reason = code === "catalog-timeout" ? t("catalogFailureTimeout") : code === "catalog-invalid-response" ? t("catalogFailureInvalidResponse") : t("catalogFailureUnavailable");
  return `${t("catalogFailureSource")}: ${source.name}. ${reason}`;
}
function PluginIcon({ item, large = false }) {
  const icon = item.media?.icon;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: large ? "dshMarketGlyph dshMarketGlyphLarge" : "dshMarketGlyph", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCordisPluginOutline14, { size: large ? 28 : 20 }),
    icon !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "img",
      {
        src: marketMediaAssetUrl(icon.assetRef),
        alt: "",
        loading: "lazy",
        decoding: "async",
        referrerPolicy: "no-referrer",
        onError: (event) => {
          event.currentTarget.remove();
        }
      }
    )
  ] });
}
function retainEnabledCatalog(catalog, sources) {
  if (catalog === void 0) return void 0;
  const selected = [...sources].filter((source) => source.enabled).sort((left, right) => left.order - right.order).at(0);
  if (selected === void 0) return void 0;
  const result = catalog.results.find((value) => value.source.sourceRecordId === selected.sourceRecordId);
  return result === void 0 ? void 0 : { ...catalog, results: [{ ...result, source: selected }] };
}
function selectedSource(sources) {
  return [...sources].filter((source) => source.enabled).sort((left, right) => left.order - right.order).at(0);
}
function categoriesFromItems(items) {
  const categories = /* @__PURE__ */ new Set();
  for (const item of items) {
    for (const category of item.categories ?? []) categories.add(category);
  }
  return [...categories].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
}
function matchesInstallableQuery(item, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [
    item.displayName,
    item.name,
    item.summary,
    item.description,
    item.publisher?.name,
    item.package?.name,
    ...item.categories ?? []
  ].some((value) => value?.toLocaleLowerCase().includes(needle) === true);
}
function mergeCatalogPages(catalog, pages, manualInstall) {
  if (catalog === void 0 || pages.length === 0) return catalog;
  const updates = new Map(pages.map((page) => [page.source.sourceRecordId, page]));
  const results = catalog.results.map((current) => {
    const next = updates.get(current.source.sourceRecordId);
    if (current.snapshot === void 0 || next?.snapshot === void 0) return current;
    const seen = /* @__PURE__ */ new Set();
    const items = [...current.snapshot.items, ...next.snapshot.items].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return {
      ...next,
      source: current.source,
      snapshot: { ...next.snapshot, items, page: next.snapshot.page }
    };
  });
  const hints = new Map([...catalog.manualInstall, ...manualInstall].map((hint) => [
    `${hint.sourceRecordId}:${hint.itemId}`,
    hint
  ]));
  return { ...catalog, results, manualInstall: [...hints.values()], fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
function MarketSurface({ initialView = "installable", readLocale, t, showHeader = true }) {
  const [view, setView] = (0, import_react.useState)(initialView);
  const [state, setState] = (0, import_react.useState)();
  const [catalog, setCatalog] = (0, import_react.useState)();
  const [query, setQuery] = (0, import_react.useState)("");
  const [appliedQuery, setAppliedQuery] = (0, import_react.useState)("");
  const [categoryOptions, setCategoryOptions] = (0, import_react.useState)([]);
  const [selectedCategories, setSelectedCategories] = (0, import_react.useState)([]);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [loadingMore, setLoadingMore] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)();
  const [loadMoreError, setLoadMoreError] = (0, import_react.useState)();
  const [selected, setSelected] = (0, import_react.useState)();
  const [addOpen, setAddOpen] = (0, import_react.useState)(false);
  const [manifestUrl, setManifestUrl] = (0, import_react.useState)("");
  const [mutationError, setMutationError] = (0, import_react.useState)();
  const [mutationPending, setMutationPending] = (0, import_react.useState)(false);
  const [installations, setInstallations] = (0, import_react.useState)([]);
  const [installableIndex, setInstallableIndex] = (0, import_react.useState)();
  const [installableQuery, setInstallableQuery] = (0, import_react.useState)("");
  const [appliedInstallableQuery, setAppliedInstallableQuery] = (0, import_react.useState)("");
  const [installableCategories, setInstallableCategories] = (0, import_react.useState)([]);
  const [installableLimit, setInstallableLimit] = (0, import_react.useState)(INSTALLABLE_PAGE_SIZE);
  const [installableLoaded, setInstallableLoaded] = (0, import_react.useState)(false);
  const [installableLoading, setInstallableLoading] = (0, import_react.useState)(false);
  const [installableUnavailable, setInstallableUnavailable] = (0, import_react.useState)(false);
  const [installableError, setInstallableError] = (0, import_react.useState)();
  const [installationsLoaded, setInstallationsLoaded] = (0, import_react.useState)(false);
  const [installationsLoading, setInstallationsLoading] = (0, import_react.useState)(false);
  const [installationsUnavailable, setInstallationsUnavailable] = (0, import_react.useState)(false);
  const [installationsError, setInstallationsError] = (0, import_react.useState)();
  const [selectedInstallation, setSelectedInstallation] = (0, import_react.useState)();
  const [selectedInventoryLoading, setSelectedInventoryLoading] = (0, import_react.useState)(false);
  const [selectedInventoryError, setSelectedInventoryError] = (0, import_react.useState)();
  const [operationPreview, setOperationPreview] = (0, import_react.useState)();
  const [operationSuccess, setOperationSuccess] = (0, import_react.useState)();
  const [operationError, setOperationError] = (0, import_react.useState)();
  const [operationPending, setOperationPending] = (0, import_react.useState)(false);
  const [desktopActionError, setDesktopActionError] = (0, import_react.useState)();
  const [desktopActionPending, setDesktopActionPending] = (0, import_react.useState)(false);
  const readRequest = (0, import_react.useRef)();
  const pageRequest = (0, import_react.useRef)();
  const mutationRequest = (0, import_react.useRef)();
  const installableRequest = (0, import_react.useRef)();
  const installationsRequest = (0, import_react.useRef)();
  const operationRequest = (0, import_react.useRef)();
  const operationStage = (0, import_react.useRef)();
  const operationBundleId = (0, import_react.useRef)();
  const desktopActionRequest = (0, import_react.useRef)();
  const selectedKeyRef = (0, import_react.useRef)();
  const viewRef = (0, import_react.useRef)(initialView);
  const rememberCategories = (0, import_react.useCallback)((next) => {
    setCategoryOptions([...next.categories].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" })));
  }, []);
  const loadCatalog = (0, import_react.useCallback)(async (nextState, q, categories, forceRefresh = false) => {
    readRequest.current?.abort();
    pageRequest.current?.abort();
    pageRequest.current = void 0;
    setLoadingMore(false);
    setLoadMoreError(void 0);
    const selected2 = selectedSource(nextState.sources);
    if (selected2 === void 0) {
      readRequest.current = void 0;
      setCatalog(void 0);
      setQuery("");
      setAppliedQuery("");
      setCategoryOptions([]);
      setSelectedCategories([]);
      setError(void 0);
      setLoading(false);
      return;
    }
    const effectiveQuery = q.trim();
    const request = new AbortController();
    readRequest.current = request;
    setLoading(true);
    setError(void 0);
    let catalogApplied = false;
    const applyCatalog = (next) => {
      const retained = retainEnabledCatalog(next, nextState.sources);
      const result = retained?.results[0];
      if (retained === void 0 || result?.snapshot === void 0) return void 0;
      rememberCategories(retained);
      setAppliedQuery(effectiveQuery);
      setSelectedCategories([...categories]);
      setCatalog(retained);
      catalogApplied = true;
      return retained;
    };
    try {
      const next = forceRefresh ? await readMarketCatalog(selected2.sourceRecordId, effectiveQuery, readLocale(), categories, request.signal, true) : await readMarketCatalog(selected2.sourceRecordId, effectiveQuery, readLocale(), categories, request.signal);
      if (!request.signal.aborted && readRequest.current === request) {
        const retained = applyCatalog(next);
        if (retained === void 0) {
          setError(catalogFailureMessage({ code: "catalog-invalid-response" }, selected2, t));
          return;
        }
        if (!forceRefresh && effectiveQuery === "" && categories.length === 0 && retained.results[0]?.stale === true) {
          const refreshed = await readMarketCatalog(
            selected2.sourceRecordId,
            effectiveQuery,
            readLocale(),
            categories,
            request.signal,
            true
          );
          if (!request.signal.aborted && readRequest.current === request) applyCatalog(refreshed);
        }
      }
    } catch (cause) {
      if (!request.signal.aborted && readRequest.current === request && !catalogApplied) {
        setError(catalogFailureMessage(cause, selected2, t));
      }
    } finally {
      if (readRequest.current === request) {
        readRequest.current = void 0;
        setLoading(false);
      }
    }
  }, [readLocale, rememberCategories, t]);
  const loadState = (0, import_react.useCallback)(async (q, categories, forceRefresh = false, loadCatalogAfterState = true) => {
    if (mutationRequest.current !== void 0) return;
    readRequest.current?.abort();
    pageRequest.current?.abort();
    pageRequest.current = void 0;
    setLoadingMore(false);
    setLoadMoreError(void 0);
    const request = new AbortController();
    readRequest.current = request;
    setLoading(true);
    setError(void 0);
    try {
      const next = await readMarketState(request.signal);
      if (request.signal.aborted || readRequest.current !== request) return;
      setState(next);
      setCatalog((current) => retainEnabledCatalog(current, next.sources));
      readRequest.current = void 0;
      if (!loadCatalogAfterState) {
        if (viewRef.current === "discover") {
          await loadCatalog(next, q, categories, forceRefresh);
        } else {
          setLoading(false);
        }
        return;
      }
      await loadCatalog(next, q, categories, forceRefresh);
    } catch {
      if (!request.signal.aborted && readRequest.current === request) setError(t("catalogError"));
    } finally {
      if (readRequest.current === request) {
        readRequest.current = void 0;
        setLoading(false);
      }
    }
  }, [loadCatalog, t]);
  const loadInstallations = (0, import_react.useCallback)(async () => {
    installationsRequest.current?.abort();
    const request = new AbortController();
    installationsRequest.current = request;
    setInstallationsLoading(true);
    setInstallationsError(void 0);
    setInstallationsUnavailable(false);
    try {
      const response = await readMarketInstallations(request.signal);
      if (request.signal.aborted || installationsRequest.current !== request) return;
      setInstallations(response.installations);
      setInstallationsLoaded(true);
      setInstallationsUnavailable(false);
      return { installations: response.installations };
    } catch (cause) {
      if (request.signal.aborted || installationsRequest.current !== request) return;
      const message = isDesktopUnavailable(cause) ? t("desktopUnavailable") : t("installationsError");
      setInstallationsUnavailable(isDesktopUnavailable(cause));
      setInstallationsError(message);
      return { error: message };
    } finally {
      if (installationsRequest.current === request) {
        installationsRequest.current = void 0;
        setInstallationsLoading(false);
      }
    }
  }, [t]);
  const loadInstallable = (0, import_react.useCallback)(async (refresh = false) => {
    installableRequest.current?.abort();
    const request = new AbortController();
    installableRequest.current = request;
    setInstallableIndex(void 0);
    setInstallableLoaded(false);
    setInstallableLoading(true);
    setInstallableError(void 0);
    setInstallableUnavailable(false);
    try {
      const response = await readMarketInstallable(readLocale(), refresh, request.signal);
      if (request.signal.aborted || installableRequest.current !== request) return;
      setInstallableIndex(response);
      setInstallableLoaded(true);
      setInstallableUnavailable(false);
      setInstallableLimit(INSTALLABLE_PAGE_SIZE);
    } catch (cause) {
      if (request.signal.aborted || installableRequest.current !== request) return;
      setInstallableIndex(void 0);
      setInstallableLoaded(false);
      setInstallableUnavailable(isDesktopUnavailable(cause));
      setInstallableError(isDesktopUnavailable(cause) ? t("desktopUnavailable") : t("installableError"));
    } finally {
      if (installableRequest.current === request) {
        installableRequest.current = void 0;
        setInstallableLoading(false);
      }
    }
  }, [readLocale, t]);
  (0, import_react.useEffect)(() => {
    setQuery("");
    if (viewRef.current === "installable") {
      void loadState("", [], false, false);
      void loadInstallable();
    } else {
      void loadState("", []);
    }
    return () => {
      readRequest.current?.abort();
      pageRequest.current?.abort();
      mutationRequest.current?.abort();
      installableRequest.current?.abort();
      installationsRequest.current?.abort();
      operationRequest.current?.abort();
      desktopActionRequest.current?.abort();
      readRequest.current = void 0;
      pageRequest.current = void 0;
      mutationRequest.current = void 0;
      installableRequest.current = void 0;
      installationsRequest.current = void 0;
      operationRequest.current = void 0;
      desktopActionRequest.current = void 0;
    };
  }, [loadInstallable, loadState]);
  const items = (0, import_react.useMemo)(() => catalog?.results.flatMap((result) => (result.snapshot?.items ?? []).map((item) => ({ item, source: result.source, stale: result.stale }))) ?? [], [catalog]);
  const installableCategoryOptions = (0, import_react.useMemo)(
    () => categoriesFromItems(installableIndex?.items ?? []),
    [installableIndex]
  );
  const filteredInstallableItems = (0, import_react.useMemo)(() => (installableIndex?.items ?? []).filter((item) => matchesInstallableQuery(item, appliedInstallableQuery)).filter((item) => installableCategories.length === 0 || item.categories?.some((category) => installableCategories.includes(category)) === true).map((item) => ({ item, source: installableIndex.source, stale: false })), [
    appliedInstallableQuery,
    installableCategories,
    installableIndex
  ]);
  const installableItems = (0, import_react.useMemo)(
    () => filteredInstallableItems.slice(0, installableLimit),
    [filteredInstallableItems, installableLimit]
  );
  const pageTarget = (0, import_react.useMemo)(() => catalog?.results.flatMap((result) => {
    const cursor = result.snapshot?.page?.nextCursor;
    return cursor === void 0 ? [] : [{ sourceRecordId: result.source.sourceRecordId, cursor }];
  }).at(0), [catalog]);
  const partialFailure = catalog?.results.some((result) => result.error !== void 0) ?? false;
  const currentSource = state === void 0 ? void 0 : selectedSource(state.sources);
  const currentSourceHref = currentSource === void 0 ? void 0 : safeHttpsExternalHref(currentSource.homepage) ?? safeHttpsExternalHref(currentSource.attribution?.url);
  const selectedManualInstall = (0, import_react.useMemo)(() => {
    if (selected === void 0) return void 0;
    const hints = view === "installable" ? installableIndex?.manualInstall ?? [] : catalog?.manualInstall ?? [];
    return hints.find((hint) => hint.sourceRecordId === selected.source.sourceRecordId && hint.providerId === selected.source.providerId && hint.itemId === selected.item.id);
  }, [catalog, installableIndex, selected, view]);
  const mutate = async (mutation) => {
    if (mutationRequest.current !== void 0) return false;
    readRequest.current?.abort();
    pageRequest.current?.abort();
    installableRequest.current?.abort();
    readRequest.current = void 0;
    pageRequest.current = void 0;
    installableRequest.current = void 0;
    setLoading(false);
    setLoadingMore(false);
    setLoadMoreError(void 0);
    const request = new AbortController();
    mutationRequest.current = request;
    setMutationPending(true);
    setMutationError(void 0);
    try {
      const sources = await mutateMarketSource(mutation, request.signal);
      if (request.signal.aborted || mutationRequest.current !== request) return false;
      const next = {
        sources,
        builtIns: state?.builtIns ?? [],
        desktopActions: state?.desktopActions ?? { openTerminal: false, requestRestart: false }
      };
      const sourceChanged = selectedSource(state?.sources ?? [])?.sourceRecordId !== selectedSource(sources)?.sourceRecordId;
      setState(next);
      if (sourceChanged) {
        setCatalog(void 0);
        setInstallableIndex(void 0);
        setInstallableLoaded(false);
        setInstallableLoading(false);
        setInstallableUnavailable(false);
        setInstallableError(void 0);
        setInstallableQuery("");
        setAppliedInstallableQuery("");
        setInstallableCategories([]);
        setInstallableLimit(INSTALLABLE_PAGE_SIZE);
        setQuery("");
        setAppliedQuery("");
        setCategoryOptions([]);
        setSelectedCategories([]);
        selectedKeyRef.current = void 0;
        setSelected(void 0);
      } else {
        setCatalog((current) => retainEnabledCatalog(current, sources));
      }
      mutationRequest.current = void 0;
      setMutationPending(false);
      await loadCatalog(next, sourceChanged ? "" : appliedQuery, sourceChanged ? [] : selectedCategories);
      return true;
    } catch {
      if (!request.signal.aborted && mutationRequest.current === request) setMutationError(t("sourceError"));
      return false;
    } finally {
      if (mutationRequest.current === request) {
        mutationRequest.current = void 0;
        setMutationPending(false);
      }
    }
  };
  const toggleCategory = (category) => {
    if (state === void 0) return;
    const categories = selectedCategories.includes(category) ? selectedCategories.filter((value) => value !== category) : [...selectedCategories, category];
    selectedKeyRef.current = void 0;
    setSelected(void 0);
    void loadCatalog(state, appliedQuery, categories);
  };
  const loadMore = async () => {
    if (pageRequest.current !== void 0 || pageTarget === void 0) return;
    const request = new AbortController();
    pageRequest.current = request;
    setLoadingMore(true);
    setLoadMoreError(void 0);
    try {
      const next = await readMoreMarketCatalog(
        pageTarget.sourceRecordId,
        pageTarget.cursor,
        appliedQuery,
        readLocale(),
        selectedCategories,
        request.signal
      );
      if (request.signal.aborted || pageRequest.current !== request) return;
      const page = next.results.find((value) => value.source.sourceRecordId === pageTarget.sourceRecordId);
      if (page?.snapshot === void 0 || page.error !== void 0) {
        setLoadMoreError(t("loadMoreError"));
        return;
      }
      rememberCategories(next);
      setCatalog((current) => mergeCatalogPages(current, [page], next.manualInstall));
    } catch {
      if (!request.signal.aborted && pageRequest.current === request) setLoadMoreError(t("loadMoreError"));
    } finally {
      if (pageRequest.current === request) {
        pageRequest.current = void 0;
        setLoadingMore(false);
      }
    }
  };
  const selectMarketView = (next) => {
    if (viewRef.current === next) return;
    viewRef.current = next;
    setView(next);
    selectedKeyRef.current = void 0;
    setSelected(void 0);
    setOperationError(void 0);
    if (next === "installable") {
      installationsRequest.current?.abort();
      installationsRequest.current = void 0;
      setInstallationsLoading(false);
      void loadInstallable();
    } else if (next === "installed") {
      installableRequest.current?.abort();
      installableRequest.current = void 0;
      setInstallableLoading(false);
      void loadInstallations();
    } else if (next === "discover") {
      installableRequest.current?.abort();
      installationsRequest.current?.abort();
      installableRequest.current = void 0;
      installationsRequest.current = void 0;
      setInstallableLoading(false);
      setInstallationsLoading(false);
      if (state !== void 0 && catalog === void 0 && readRequest.current === void 0) {
        void loadCatalog(state, appliedQuery, selectedCategories);
      }
    } else {
      installableRequest.current?.abort();
      installationsRequest.current?.abort();
      installableRequest.current = void 0;
      installationsRequest.current = void 0;
      setInstallableLoading(false);
      setInstallationsLoading(false);
    }
  };
  const beginOperationPreview = async (requestValue) => {
    if (operationRequest.current !== void 0) return;
    const request = new AbortController();
    operationRequest.current = request;
    operationStage.current = "preview";
    operationBundleId.current = void 0;
    setOperationPending(true);
    setOperationError(void 0);
    setDesktopActionError(void 0);
    setOperationSuccess(void 0);
    try {
      const preview = await previewMarketOperation(requestValue, request.signal);
      if (request.signal.aborted || operationRequest.current !== request) return;
      if (preview.action !== requestValue.action) throw new Error("operation preview action mismatch");
      setInstallationsUnavailable(false);
      if (requestValue.action === "disable" || requestValue.action === "enable") {
        operationBundleId.current = requestValue.bundleId;
      }
      setOperationPreview(preview);
    } catch (cause) {
      if (request.signal.aborted || operationRequest.current !== request) return;
      if (isDesktopUnavailable(cause)) {
        setInstallationsUnavailable(true);
        setInstallationsError(t("desktopUnavailable"));
        setOperationError(t("desktopUnavailable"));
      } else {
        setOperationError(operationErrorMessage(cause, t(requestValue.action === "install" ? "previewError" : requestValue.action === "uninstall" ? "uninstallPreviewError" : requestValue.action === "disable" ? "disablePreviewError" : requestValue.action === "update" ? "updatePreviewError" : "enablePreviewError"), t));
      }
    } finally {
      if (operationRequest.current === request) {
        operationRequest.current = void 0;
        operationStage.current = void 0;
        setOperationPending(false);
      }
    }
  };
  const openItem = (value) => {
    if (operationStage.current === "execute") return;
    if (operationStage.current === "preview") {
      operationRequest.current?.abort();
      operationRequest.current = void 0;
      operationStage.current = void 0;
      setOperationPending(false);
    }
    const selectionKey = visibleItemKey(value);
    selectedKeyRef.current = selectionKey;
    setSelected(value);
    setSelectedInstallation(void 0);
    setSelectedInventoryLoading(false);
    setSelectedInventoryError(void 0);
    setOperationPreview(void 0);
    setOperationSuccess(void 0);
    setOperationError(void 0);
    setDesktopActionError(void 0);
    const beginInstallPreview = () => {
      if (selectedKeyRef.current !== selectionKey) return;
      void beginOperationPreview({
        action: "install",
        sourceRecordId: value.source.sourceRecordId,
        itemId: value.item.id
      });
    };
    const packageName = value.item.package?.name;
    if (packageName === void 0) {
      beginInstallPreview();
      return;
    }
    const resolveInventory = (current) => {
      if (selectedKeyRef.current !== selectionKey) return;
      const installation = matchingInstallation(value, current);
      setSelectedInventoryLoading(false);
      if (installation !== void 0) setSelectedInstallation(installation);
      else beginInstallPreview();
    };
    if (installationsLoaded) {
      resolveInventory(installations);
      return;
    }
    setSelectedInventoryLoading(true);
    void loadInstallations().then((outcome) => {
      if (selectedKeyRef.current !== selectionKey || outcome === void 0) return;
      if ("error" in outcome) {
        setSelectedInventoryLoading(false);
        setSelectedInventoryError(outcome.error);
        return;
      }
      resolveInventory(outcome.installations);
    });
  };
  const closeItem = () => {
    if (operationPending && operationPreview !== void 0) return;
    operationRequest.current?.abort();
    operationRequest.current = void 0;
    operationStage.current = void 0;
    desktopActionRequest.current?.abort();
    desktopActionRequest.current = void 0;
    setOperationPending(false);
    setDesktopActionPending(false);
    operationBundleId.current = void 0;
    selectedKeyRef.current = void 0;
    setSelected(void 0);
    setSelectedInstallation(void 0);
    setSelectedInventoryLoading(false);
    setSelectedInventoryError(void 0);
    setOperationPreview(void 0);
    setOperationError(void 0);
    setDesktopActionError(void 0);
  };
  const executePreview = async () => {
    const preview = operationPreview;
    if (preview === void 0 || operationRequest.current !== void 0) return;
    const targetBundleId = operationBundleId.current;
    const request = new AbortController();
    operationRequest.current = request;
    operationStage.current = "execute";
    setOperationPending(true);
    setOperationError(void 0);
    setDesktopActionError(void 0);
    try {
      const result = await executeMarketOperation(preview.previewId, request.signal);
      if (request.signal.aborted || operationRequest.current !== request) return;
      if (result.action !== preview.action) throw new Error("operation response action mismatch");
      setInstallations((current) => {
        if (result.action === "install") return current;
        if (result.action === "update") return current;
        if (result.action === "uninstall") {
          return current.filter((installation) => installation.kind !== "managed" || installation.receipt.receiptId !== result.receiptId);
        }
        if (result.action === "disable") {
          return current.map((installation) => {
            if (installation.kind === "external" && installation.action === "disable" && installation.bundleId === targetBundleId && installation.packageName === result.packageName) {
              return {
                kind: "external",
                status: "disabled",
                action: "enable",
                bundleId: installation.bundleId,
                packageName: installation.packageName
              };
            }
            if (targetBundleId !== void 0 && installation.kind === "managed" && installation.status === "active" && installation.disableBundleId === targetBundleId && installation.receipt.packageName === result.packageName) {
              return {
                kind: "managed",
                status: "disabled",
                action: "uninstall",
                enableBundleId: targetBundleId,
                receipt: installation.receipt
              };
            }
            return installation;
          });
        }
        return current.map((installation) => {
          if (installation.kind === "external" && installation.action === "enable" && installation.bundleId === targetBundleId && installation.packageName === result.packageName) {
            return {
              kind: "external",
              status: "active",
              action: "disable",
              bundleId: installation.bundleId,
              packageName: installation.packageName
            };
          }
          if (targetBundleId !== void 0 && installation.kind === "managed" && installation.status === "disabled" && installation.enableBundleId === targetBundleId && installation.receipt.packageName === result.packageName) {
            return {
              kind: "managed",
              status: "active",
              action: "uninstall",
              disableBundleId: targetBundleId,
              receipt: installation.receipt
            };
          }
          return installation;
        });
      });
      setInstallationsLoaded(true);
      operationBundleId.current = void 0;
      setOperationPreview(void 0);
      selectedKeyRef.current = void 0;
      setSelected(void 0);
      setOperationSuccess({ preview, restartToken: result.restartToken });
      if (result.action === "install" && viewRef.current === "installable") void loadInstallable();
      if ((result.action === "uninstall" || result.action === "disable" || result.action === "enable" || result.action === "update") && viewRef.current === "installed") {
        void loadInstallations();
      }
    } catch (cause) {
      if (request.signal.aborted || operationRequest.current !== request) return;
      if (isDesktopUnavailable(cause)) {
        setInstallationsUnavailable(true);
        setInstallationsError(t("desktopUnavailable"));
        setOperationError(t("desktopUnavailable"));
      } else {
        setOperationError(operationErrorMessage(cause, t("executeError"), t));
      }
    } finally {
      if (operationRequest.current === request) {
        operationRequest.current = void 0;
        operationStage.current = void 0;
        setOperationPending(false);
      }
    }
  };
  const runDesktopAction = async (action, restartToken) => {
    if (desktopActionRequest.current !== void 0) return;
    const request = new AbortController();
    desktopActionRequest.current = request;
    setDesktopActionPending(true);
    setDesktopActionError(void 0);
    try {
      if (action === "open-terminal") await openMarketTerminal(request.signal);
      else if (restartToken !== void 0) await requestMarketRestart(restartToken, request.signal);
      else throw new Error("restart token missing");
    } catch (cause) {
      if (request.signal.aborted || desktopActionRequest.current !== request) return;
      setDesktopActionError(t(isDesktopUnavailable(cause) ? "desktopActionUnavailable" : action === "open-terminal" ? "terminalError" : "restartError"));
    } finally {
      if (desktopActionRequest.current === request) {
        desktopActionRequest.current = void 0;
        setDesktopActionPending(false);
      }
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "section",
    {
      className: "dshMarketRoot",
      "aria-label": t("title"),
      "aria-busy": loading || loadingMore || mutationPending || installationsLoading || operationPending || desktopActionPending,
      children: [
        showHeader && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("header", { className: "dshMarketHeader", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketHeaderTitle", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: t("title") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("subtitle") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketViewBar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketViewSwitch", role: "group", "aria-label": t("title"), children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives2.Pill, { active: view === "discover", "aria-pressed": view === "discover", onClick: () => selectMarketView("discover"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconDataOutline16, { size: 14 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("discover") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives2.Pill, { active: view === "installable", "aria-pressed": view === "installable", onClick: () => selectMarketView("installable"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconDownloadOutline16, { size: 14 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("installable") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives2.Pill, { active: view === "installed", "aria-pressed": view === "installed", onClick: () => selectMarketView("installed"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCheckOutline16, { size: 14 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("installed") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives2.Pill, { active: view === "sources", "aria-pressed": view === "sources", onClick: () => selectMarketView("sources"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSettingsOutline16, { size: 14 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("sources") })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { className: "dshMarketCurrentSource", children: currentSource === void 0 ? t("noSourceSelected") : currentSourceHref === void 0 ? `${t("currentSource")}: ${currentSource.name}` : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("a", { href: currentSourceHref, target: "_blank", rel: "noopener noreferrer", children: [
            t("currentSource"),
            ": ",
            currentSource.name,
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRightUpOutline16, { size: 12 })
          ] }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("main", { className: "dshMarketMain", children: view === "discover" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          DiscoverView,
          {
            state,
            items,
            metadata: catalog?.metadata,
            query,
            categoryOptions,
            selectedCategories,
            loading,
            loadingMore,
            mutationPending,
            error,
            loadMoreError,
            partialFailure,
            onQuery: setQuery,
            onSearch: () => state !== void 0 && void loadCatalog(state, query, selectedCategories),
            onRefresh: () => void loadState(appliedQuery, selectedCategories, true),
            onToggleCategory: toggleCategory,
            onLoadMore: () => {
              void loadMore();
            },
            hasMore: pageTarget !== void 0,
            onSources: () => selectMarketView("sources"),
            onSelect: openItem,
            t
          }
        ) : view === "installable" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          InstallableView,
          {
            state,
            items: installableItems,
            totalItems: filteredInstallableItems.length,
            query: installableQuery,
            categoryOptions: installableCategoryOptions,
            selectedCategories: installableCategories,
            metadata: installableIndex?.metadata,
            loaded: installableLoaded,
            loading: installableLoading,
            unavailable: installableUnavailable,
            error: installableError,
            operationPending,
            onQuery: setInstallableQuery,
            onSearch: () => {
              setAppliedInstallableQuery(installableQuery.trim());
              setInstallableLimit(INSTALLABLE_PAGE_SIZE);
            },
            onRefresh: () => {
              void loadInstallable(true);
            },
            onToggleCategory: (category) => {
              setInstallableCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
              setInstallableLimit(INSTALLABLE_PAGE_SIZE);
            },
            onLoadMore: () => setInstallableLimit((current) => current + INSTALLABLE_PAGE_SIZE),
            onRetry: () => {
              void loadInstallable();
            },
            onSources: () => selectMarketView("sources"),
            onInstall: openItem,
            t
          }
        ) : view === "installed" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          InstalledView,
          {
            installations,
            loaded: installationsLoaded,
            loading: installationsLoading,
            unavailable: installationsUnavailable,
            error: installationsError ?? operationError,
            operationPending,
            onRetry: () => {
              void loadInstallations();
            },
            onUninstall: (receipt) => {
              void beginOperationPreview({ action: "uninstall", receiptId: receipt.receiptId });
            },
            onUpdate: (receipt) => {
              void beginOperationPreview({ action: "update", receiptId: receipt.receiptId });
            },
            onDisable: (bundleId) => {
              void beginOperationPreview({ action: "disable", bundleId });
            },
            onEnable: (bundleId) => {
              void beginOperationPreview({ action: "enable", bundleId });
            },
            t
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          SourcesView,
          {
            state,
            catalog,
            error: mutationError,
            pending: mutationPending,
            adapterGuideHref: catalogAdapterGuideUrl(readLocale()),
            onMutation: (mutation) => {
              void mutate(mutation);
            },
            onAddStandard: () => setAddOpen(true),
            t
          }
        ) }),
        selected !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          ItemActionModal,
          {
            value: selected,
            installation: selectedInstallation,
            inventoryLoading: selectedInventoryLoading,
            inventoryError: selectedInventoryError,
            manualInstall: selectedManualInstall,
            preview: operationPreview?.action === "install" ? operationPreview : void 0,
            pending: operationPending,
            operationError,
            desktopActionError,
            desktopActionPending,
            canOpenTerminal: state?.desktopActions.openTerminal === true,
            verificationHelpHref: installRequirementsUrl(readLocale()),
            onClose: closeItem,
            onConfirm: () => {
              void executePreview();
            },
            onOpenTerminal: () => {
              void runDesktopAction("open-terminal");
            },
            onUninstall: (receipt) => {
              selectedKeyRef.current = void 0;
              setSelected(void 0);
              setSelectedInstallation(void 0);
              void beginOperationPreview({ action: "uninstall", receiptId: receipt.receiptId });
            },
            onDisable: (bundleId) => {
              selectedKeyRef.current = void 0;
              setSelected(void 0);
              setSelectedInstallation(void 0);
              void beginOperationPreview({ action: "disable", bundleId });
            },
            onEnable: (bundleId) => {
              selectedKeyRef.current = void 0;
              setSelected(void 0);
              setSelectedInstallation(void 0);
              void beginOperationPreview({ action: "enable", bundleId });
            },
            t
          }
        ),
        selected === void 0 && operationPreview !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          OperationConfirmModal,
          {
            preview: operationPreview,
            pending: operationPending,
            error: operationError,
            onCancel: () => {
              if (operationPending) return;
              operationBundleId.current = void 0;
              setOperationPreview(void 0);
              setOperationError(void 0);
            },
            onConfirm: () => {
              void executePreview();
            },
            t
          }
        ),
        operationSuccess !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          OperationSuccessModal,
          {
            operation: operationSuccess,
            canRestart: state?.desktopActions.requestRestart === true,
            pending: desktopActionPending,
            error: desktopActionError,
            onClose: () => setOperationSuccess(void 0),
            onRestart: () => {
              void runDesktopAction("request-restart", operationSuccess.restartToken);
            },
            t
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Modal,
          {
            open: addOpen,
            className: "dshMarketModal dshMarketSourceModal",
            contentClassName: "dshMarketModalContent",
            onClose: () => {
              if (!mutationPending) setAddOpen(false);
            },
            title: t("addStandard"),
            closeLabel: t("cancel"),
            description: t("sourceNotice"),
            footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketModalActions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", disabled: mutationPending, onClick: () => setAddOpen(false), children: t("cancel") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Button,
                {
                  variant: "primary",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutline16, {}),
                  disabled: mutationPending || !manifestUrl.trim(),
                  onClick: () => {
                    void mutate({ action: "add-standard", manifestUrl: manifestUrl.trim() }).then((succeeded) => {
                      if (!succeeded) return;
                      setManifestUrl("");
                      setAddOpen(false);
                    });
                  },
                  children: t("confirmAdd")
                }
              )
            ] }),
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketModalField", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "dsh-market-manifest", children: t("standardSource") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Input,
                {
                  id: "dsh-market-manifest",
                  value: manifestUrl,
                  disabled: mutationPending,
                  placeholder: t("manifestPlaceholder"),
                  onChange: (event) => setManifestUrl(event.currentTarget.value)
                }
              ),
              mutationError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketError", role: "alert", children: mutationError })
            ] })
          }
        )
      ]
    }
  );
}
function MarketSettingsTab({ initialView, readLocale, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    MarketSurface,
    {
      ...initialView === void 0 ? {} : { initialView },
      readLocale,
      t
    }
  );
}
function DiscoverView(props) {
  const noSources = props.state !== void 0 && !props.state.sources.some((source) => source.enabled);
  if (noSources) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketEmptyIcon", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconGlobeOutline14, { size: 24 }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("emptyTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("emptyBody") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSettingsOutline16, {}), onClick: props.onSources, children: props.t("chooseSources") })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketContent", children: [
    props.metadata !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketIndexMeta", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        props.t("scannedAt"),
        ": ",
        props.metadata.scannedAt
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        props.t("cacheExpiresAt"),
        ": ",
        props.metadata.expiresAt
      ] }),
      props.metadata.providerRevision !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        props.t("providerRevision"),
        ": ",
        props.metadata.providerRevision
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: props.metadata.cacheStatus === "fresh" ? props.t("freshScan") : props.t("cachedScan") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { className: "dshMarketToolbar", onSubmit: (event) => {
      event.preventDefault();
      props.onSearch();
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Input,
        {
          className: "dshMarketSearch",
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSearchOutline16, {}),
          value: props.query,
          disabled: props.mutationPending,
          placeholder: props.t("search"),
          onChange: (event) => props.onQuery(event.currentTarget.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { type: "submit", variant: "primary", disabled: props.mutationPending, icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSearchOutline16, {}), children: props.t("searchAction") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: props.t("refresh"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          type: "button",
          size: "sm",
          variant: "toolbar",
          "aria-label": props.t("refresh"),
          disabled: props.loading || props.loadingMore || props.mutationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutline16, {}),
          onClick: props.onRefresh
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: props.items.length })
    ] }),
    props.categoryOptions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketCategories", role: "group", "aria-label": props.t("categories"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: props.t("categories") }),
      props.categoryOptions.map((category) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Pill,
        {
          active: props.selectedCategories.includes(category),
          "aria-pressed": props.selectedCategories.includes(category),
          disabled: props.mutationPending,
          onClick: () => props.onToggleCategory(category),
          children: category
        },
        category
      ))
    ] }),
    props.partialFailure && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketBanner", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning" }),
      props.t("partialFailure")
    ] }),
    props.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "error", size: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("catalogError") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.error }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutline16, {}), onClick: props.onRefresh, children: props.t("retry") })
    ] }),
    props.error === void 0 && props.loading && props.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 16 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("loading") })
    ] }),
    props.error === void 0 && !props.loading && props.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketEmpty", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("noResults") }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketGrid", children: props.items.map((value) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PluginCard, { value, onClick: () => props.onSelect(value), t: props.t }, `${value.source.sourceRecordId}:${value.item.id}`)) }),
    (props.hasMore || props.loadMoreError !== void 0) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketPagination", children: [
      props.loadMoreError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketPaginationError", role: "status", children: props.loadMoreError }),
      props.hasMore && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          type: "button",
          variant: "outline",
          disabled: props.loading || props.loadingMore || props.mutationPending,
          onClick: props.onLoadMore,
          children: props.loadingMore ? props.t("loadingMore") : props.t("loadMore")
        }
      )
    ] })
  ] });
}
function InstallableView(props) {
  const noSources = props.state !== void 0 && !props.state.sources.some((source) => source.enabled);
  if (noSources) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketEmptyIcon", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconGlobeOutline14, { size: 24 }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("emptyTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("emptyBody") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSettingsOutline16, {}), onClick: props.onSources, children: props.t("chooseSources") })
  ] });
  if (props.unavailable) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 16 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("desktopRequiredTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("desktopUnavailable") })
  ] });
  if (props.loading) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 16 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("scanningInstallable") })
  ] });
  if (!props.loaded && props.error !== void 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "error", size: 14 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("installableError") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutline16, {}), onClick: props.onRetry, children: props.t("retry") })
  ] });
  if (!props.loaded) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 16 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("scanningInstallable") })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketContent", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSectionHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("installable") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("installableBody") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          disabled: props.loading || props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutline16, {}),
          onClick: props.onRefresh,
          children: props.t("rescanInstallable")
        }
      )
    ] }),
    props.metadata !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketIndexMeta", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        props.t("scannedAt"),
        ": ",
        props.metadata.scannedAt
      ] }),
      props.metadata.providerRevision !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        props.t("providerRevision"),
        ": ",
        props.metadata.providerRevision
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: props.metadata.cacheStatus === "fresh" ? props.t("freshScan") : props.t("cachedScan") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { className: "dshMarketToolbar", onSubmit: (event) => {
      event.preventDefault();
      props.onSearch();
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Input,
        {
          className: "dshMarketSearch",
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSearchOutline16, {}),
          value: props.query,
          disabled: props.operationPending,
          placeholder: props.t("search"),
          onChange: (event) => props.onQuery(event.currentTarget.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          type: "submit",
          variant: "primary",
          disabled: props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSearchOutline16, {}),
          children: props.t("searchAction")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: props.totalItems })
    ] }),
    props.categoryOptions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketCategories", role: "group", "aria-label": props.t("categories"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: props.t("categories") }),
      props.categoryOptions.map((category) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Pill,
        {
          active: props.selectedCategories.includes(category),
          "aria-pressed": props.selectedCategories.includes(category),
          disabled: props.operationPending,
          onClick: () => props.onToggleCategory(category),
          children: category
        },
        category
      ))
    ] }),
    props.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketBanner", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "error" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: props.error })
    ] }),
    props.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("noInstallable") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("noInstallableBody") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketGrid", children: props.items.map((value) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      PluginCard,
      {
        value,
        actionLabel: props.t("install"),
        disabled: props.operationPending,
        onClick: () => props.onInstall(value),
        t: props.t
      },
      `${value.source.sourceRecordId}:${value.item.id}`
    )) }),
    props.items.length < props.totalItems && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketPagination", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        type: "button",
        variant: "outline",
        disabled: props.operationPending,
        onClick: props.onLoadMore,
        children: props.t("loadMore")
      }
    ) })
  ] });
}
function InstalledView(props) {
  if (props.unavailable) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 16 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("desktopRequiredTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("desktopUnavailable") })
  ] });
  if (!props.loaded && props.loading) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 16 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("loadingInstallations") })
  ] });
  if (!props.loaded && props.error !== void 0) return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "error", size: 14 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("installationsError") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutline16, {}), onClick: props.onRetry, children: props.t("retry") })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketContent", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSectionHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("installed") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("installedBody") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          disabled: props.loading || props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutline16, {}),
          onClick: props.onRetry,
          children: props.t("refresh")
        }
      )
    ] }),
    props.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketBanner", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "error" }),
      props.error
    ] }),
    props.installations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketEmpty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: props.t("noInstalled") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: props.t("noInstalledBody") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketReceipts", children: props.installations.map((installation, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      InstallationCard,
      {
        installation,
        operationPending: props.operationPending,
        onUninstall: props.onUninstall,
        onUpdate: props.onUpdate,
        onDisable: props.onDisable,
        onEnable: props.onEnable,
        t: props.t
      },
      installation.kind === "managed" ? installation.receipt.receiptId : `${installation.kind}:${installation.packageName}:${index}`
    )) })
  ] });
}
function InstallationCard(props) {
  const { installation } = props;
  const receipt = installation.kind === "managed" ? installation.receipt : void 0;
  const packageName = installation.kind === "managed" ? installation.receipt.packageName : installation.packageName;
  const displayName = receipt?.displayName ?? packageName;
  const ownerLabel = installation.kind === "managed" ? props.t("managedPlugin") : installation.kind === "external" ? props.t("externalPlugin") : props.t("immutablePlugin");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: "dshMarketReceipt", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketReceiptMain", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketReceiptTitle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: installation.status === "disabled" ? "warning" : "done", size: 10 }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: displayName }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: ownerLabel }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: props.t(installation.status === "disabled" ? "disabledPlugin" : "activePlugin") }),
        installation.updateAvailable === true && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: `${props.t("updateAvailable")}: ${installation.latestVersion}` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketReceiptMeta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          packageName,
          receipt === void 0 ? "" : `@${receipt.version}`
        ] }),
        receipt !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          props.t("profile"),
          ": ",
          receipt.profileName
        ] }),
        receipt !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          props.t("installedAt"),
          ": ",
          receipt.installedAt
        ] }),
        installation.status === "disabled" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: props.t("disabledRestartRequired") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketReceiptActions", children: [
      installation.updateAvailable === true && installation.kind === "managed" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "primary",
          size: "sm",
          "aria-label": `${props.t("update")}: ${displayName}`,
          disabled: props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconDownloadOutline16, {}),
          onClick: () => props.onUpdate(installation.receipt),
          children: props.t("update")
        }
      ),
      installation.kind === "managed" && installation.status === "active" && installation.disableBundleId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          "aria-label": `${props.t("disable")}: ${displayName}`,
          disabled: props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPauseOutline16, {}),
          onClick: () => props.onDisable(installation.disableBundleId),
          children: props.t("disable")
        }
      ),
      installation.kind === "managed" && installation.status === "disabled" && installation.enableBundleId !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          "aria-label": `${props.t("enable")}: ${displayName}`,
          disabled: props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlayOutline16, {}),
          onClick: () => props.onEnable(installation.enableBundleId),
          children: props.t("enable")
        }
      ),
      installation.action === "uninstall" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          "aria-label": `${props.t("uninstall")}: ${displayName}`,
          disabled: props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconTrashOutline16, {}),
          onClick: () => props.onUninstall(installation.receipt),
          children: props.t("uninstall")
        }
      ),
      installation.action === "disable" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          "aria-label": `${props.t("disable")}: ${displayName}`,
          disabled: props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPauseOutline16, {}),
          onClick: () => props.onDisable(installation.bundleId),
          children: props.t("disable")
        }
      ),
      installation.action === "enable" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          "aria-label": `${props.t("enable")}: ${displayName}`,
          disabled: props.operationPending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlayOutline16, {}),
          onClick: () => props.onEnable(installation.bundleId),
          children: props.t("enable")
        }
      )
    ] })
  ] });
}
function sourceDisplayLabel(source) {
  const attribution = source.attribution?.name;
  return attribution === void 0 || attribution === source.name ? source.name : `${source.name} \xB7 ${attribution}`;
}
function safeHttpsExternalHref(value) {
  if (value === void 0) return void 0;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443") {
      return void 0;
    }
    return url.href;
  } catch {
    return void 0;
  }
}
function PluginCard({ value, actionLabel, disabled = false, onClick, t }) {
  const publisher = value.item.publisher?.name ?? value.source.name;
  const sourceLabel = sourceDisplayLabel(value.source);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type: "button",
      className: "dshMarketCard",
      "aria-haspopup": "dialog",
      "aria-label": actionLabel === void 0 ? void 0 : `${actionLabel}: ${value.item.displayName}`,
      disabled,
      onClick,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketCardTop", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PluginIcon, { item: value.item }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketCardName", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: value.item.displayName }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: publisher })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dshMarketSummary", children: value.item.summary }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketTags", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives2.Pill, { children: [
            t("source"),
            ": ",
            sourceLabel
          ] }),
          actionLabel !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: actionLabel }),
          value.stale && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: t("stale") }),
          value.item.categories?.slice(0, 2).map((category) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: category }, category))
        ] })
      ]
    }
  );
}
function SourceAttribution({ attribution }) {
  const href = safeHttpsExternalHref(attribution.url);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSourceAttribution", children: [
    href === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: attribution.name }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href, target: "_blank", rel: "noopener noreferrer", children: attribution.name }),
    attribution.notice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: attribution.notice })
  ] });
}
function ItemSourceRow({ source, t }) {
  const label = sourceDisplayLabel(source);
  const href = safeHttpsExternalHref(source.homepage) ?? safeHttpsExternalHref(source.attribution?.url);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketItemSourceRow", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      t("source"),
      ":"
    ] }),
    href === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "a",
      {
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": `${t("source")}: ${label}`,
        children: [
          label,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRightUpOutline16, { size: 12 })
        ]
      }
    )
  ] });
}
function SourcesView({ state, catalog, error, pending, adapterGuideHref, onMutation, onAddStandard, t }) {
  const selectedKeys = new Set(state?.sources.map((source) => source.builtInProviderKey).filter(Boolean));
  const available = state?.builtIns.filter((provider) => !selectedKeys.has(provider.key)) ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketContent", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSectionHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: t("sources") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("sourceNotice") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", disabled: pending, icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutline16, {}), onClick: onAddStandard, children: t("addStandard") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketBanner dshMarketSourceGuide", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconGlobeOutline14, { size: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        t("sourcePartnershipBefore"),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: DSH_DESKTOP_ISSUES_URL, target: "_blank", rel: "noopener noreferrer", children: t("sourcePartnershipContact") }),
        t("sourcePartnershipAfter"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: adapterGuideHref, target: "_blank", rel: "noopener noreferrer", children: t("sourcePartnershipGuide") })
      ] })
    ] }),
    error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketBanner", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "error" }),
      error
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketSources", role: "radiogroup", "aria-label": t("sourceSelection"), children: state?.sources.map((source, index, sources) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      SourceRow,
      {
        source,
        result: catalog?.results.find((result) => result.source.sourceRecordId === source.sourceRecordId),
        pending,
        canMoveUp: index > 0,
        canMoveDown: index < sources.length - 1,
        onMoveUp: () => onMutation({ action: "move", sourceRecordId: source.sourceRecordId, direction: "up" }),
        onMoveDown: () => onMutation({ action: "move", sourceRecordId: source.sourceRecordId, direction: "down" }),
        onSelect: () => {
          if (!source.enabled) onMutation({ action: "select", sourceRecordId: source.sourceRecordId });
        },
        onRemove: () => onMutation({ action: "remove", sourceRecordId: source.sourceRecordId }),
        t
      },
      source.sourceRecordId
    )) }),
    available.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketSources dshMarketAvailableSources", children: available.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      AvailableSource,
      {
        provider,
        pending,
        onAdd: () => onMutation({ action: "add-builtin", key: provider.key }),
        t
      },
      provider.key
    )) })
  ] });
}
function SourceRow({ source, result, pending, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onSelect, onRemove, t }) {
  const endpointHost = (() => {
    try {
      return new URL(source.endpoint).host;
    } catch {
      return source.endpoint;
    }
  })();
  const resultLabel = result === void 0 ? t("notChecked") : result.error !== void 0 && result.snapshot === void 0 ? t("unavailable") : result.stale ? t("lastStale") : t("available");
  const resultState = result === void 0 ? "ongoing" : result.error !== void 0 && result.snapshot === void 0 ? "error" : result.stale ? "warning" : "done";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSource", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("h3", { children: [
        source.name,
        source.partnership && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: t("partner") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: source.description ?? source.endpoint }),
      source.attribution !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SourceAttribution, { attribution: source.attribution }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSourceMeta", children: [
        source.attribution === void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: source.providerId }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: endpointHost }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: source.registrationKind === "built-in" ? t("builtIn") : t("standardAdapter") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: resultState, size: 10 }),
          resultLabel
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSourceActions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("moveUp"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          type: "button",
          variant: "ghost",
          size: "sm",
          "aria-label": t("moveUp"),
          disabled: pending || !canMoveUp,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronUpOutline14, {}),
          onClick: onMoveUp
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("moveDown"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          type: "button",
          variant: "ghost",
          size: "sm",
          "aria-label": t("moveDown"),
          disabled: pending || !canMoveDown,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronDownOutline14, {}),
          onClick: onMoveDown
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "outline",
          size: "sm",
          role: "radio",
          "aria-checked": source.enabled,
          disabled: pending,
          icon: source.enabled ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCheckOutline16, {}) : void 0,
          onClick: onSelect,
          children: source.enabled ? t("selectedSource") : t("selectSource")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("remove"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          type: "button",
          variant: "ghost",
          size: "sm",
          "aria-label": t("remove"),
          disabled: pending,
          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconTrashOutline16, {}),
          onClick: onRemove
        }
      ) })
    ] })
  ] });
}
function AvailableSource({ provider, pending, onAdd, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketSource", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("h3", { children: [
        provider.name,
        provider.partnership && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Pill, { children: t("partner") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: provider.description }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SourceAttribution, { attribution: provider.attribution })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", size: "sm", disabled: pending, icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutline16, {}), onClick: onAdd, children: t("add") })
  ] });
}
function OperationFacts({ operation, showExpiry = true, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dl", { className: "dshMarketOperationFacts", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("plugin") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: operation.displayName })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("package") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: operation.packageName })
    ] }),
    operation.version !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("exactVersion") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: operation.version })
    ] }),
    operation.fromVersion !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("currentVersion") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: operation.fromVersion })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("profile") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: operation.profileName })
    ] }),
    showExpiry && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: t("previewExpires") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: operation.expiresAt })
    ] })
  ] });
}
function OperationConfirmModal({ preview, pending, error, onCancel, onConfirm, t }) {
  const installing = preview.action === "install";
  const uninstalling = preview.action === "uninstall";
  const disabling = preview.action === "disable";
  const enabling = preview.action === "enable";
  const updating = preview.action === "update";
  const title = installing ? t("confirmInstallTitle") : uninstalling ? t("confirmUninstallTitle") : disabling ? t("confirmDisableTitle") : updating ? t("confirmUpdateTitle") : t("confirmEnableTitle");
  const description = installing ? t("confirmInstallBody") : uninstalling ? t("confirmUninstallBody") : disabling ? t("confirmDisableBody") : updating ? t("confirmUpdateBody") : t("confirmEnableBody");
  const confirmLabel = pending ? installing ? t("installing") : uninstalling ? t("uninstalling") : disabling ? t("disabling") : updating ? t("updating") : t("enabling") : installing ? t("confirmInstall") : uninstalling ? t("confirmUninstall") : disabling ? t("confirmDisable") : updating ? t("confirmUpdate") : t("confirmEnable");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_dsh_client_ui_primitives2.Modal,
    {
      open: true,
      className: "dshMarketModal dshMarketConfirmModal",
      contentClassName: "dshMarketModalContent",
      onClose: onCancel,
      closeLabel: t("cancel"),
      title,
      description,
      footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketModalActions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", disabled: pending, onClick: onCancel, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "primary",
            disabled: pending,
            icon: installing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconDownloadOutline16, {}) : uninstalling ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconTrashOutline16, {}) : updating ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconDownloadOutline16, {}) : enabling ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlayOutline16, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPauseOutline16, {}),
            onClick: onConfirm,
            children: confirmLabel
          }
        )
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationReview", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OperationFacts, { operation: preview, t }),
        installing && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("operationWarning") })
        ] }),
        installing && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            t("operationRiskBeforeContact"),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: DSH_DESKTOP_ISSUES_URL, target: "_blank", rel: "noopener noreferrer", children: t("contactUs") }),
            t("operationRiskAfterContact")
          ] })
        ] }),
        disabling && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("disableWarning") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("disableRecoveryWarning") })
          ] })
        ] }),
        enabling && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("enableWarning") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("restartAfterOperation") })
        ] }),
        pending && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationProgress", role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 12 }),
          confirmLabel
        ] }),
        error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketError", role: "alert", children: error })
      ] })
    }
  );
}
function OperationSuccessModal({ operation, canRestart, pending, error, onClose, onRestart, t }) {
  const title = operation.preview.action === "install" ? t("installComplete") : operation.preview.action === "uninstall" ? t("uninstallComplete") : operation.preview.action === "disable" ? t("disableComplete") : operation.preview.action === "update" ? t("updateComplete") : t("enableComplete");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_dsh_client_ui_primitives2.Modal,
    {
      open: true,
      className: "dshMarketModal dshMarketStatusModal",
      contentClassName: "dshMarketModalContent",
      onClose: () => {
        if (!pending) onClose();
      },
      closeLabel: t("close"),
      title,
      description: t("restartRequiredTitle"),
      footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketModalActions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", disabled: pending, onClick: onClose, children: t("restartLater") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "primary",
            disabled: !canRestart || pending,
            icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutline16, {}),
            onClick: onRestart,
            children: pending ? t("restarting") : t("restartNow")
          }
        )
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationReview", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OperationFacts, { operation: operation.preview, showExpiry: false, t }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationSuccess", role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "done", size: 12 }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("restartRequiredBody") })
        ] }),
        error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketError", role: "alert", children: error })
      ] })
    }
  );
}
function ItemActionModal({
  value,
  installation,
  inventoryLoading,
  inventoryError,
  manualInstall,
  preview,
  pending,
  operationError,
  desktopActionError,
  desktopActionPending,
  canOpenTerminal,
  verificationHelpHref,
  onClose,
  onConfirm,
  onOpenTerminal,
  onUninstall,
  onDisable,
  onEnable,
  t
}) {
  const checking = preview === void 0 && pending && operationError === void 0;
  const footer = installation === void 0 && preview !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", disabled: pending, onClick: onClose, children: t("cancel") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        variant: "primary",
        disabled: pending,
        icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconDownloadOutline16, {}),
        onClick: onConfirm,
        children: pending ? t("installing") : t("confirmInstall")
      }
    )
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    value.item.repository !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        variant: "outline",
        icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRightUpOutline16, { size: 12 }),
        onClick: () => window.open(value.item.repository.url, "_blank", "noopener,noreferrer"),
        children: t("repository")
      }
    ),
    installation === void 0 && !inventoryLoading && inventoryError === void 0 && manualInstall !== void 0 && canOpenTerminal && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Button,
      {
        variant: "primary",
        disabled: desktopActionPending,
        onClick: onOpenTerminal,
        children: desktopActionPending ? t("openingTerminal") : t("openTerminal")
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", disabled: desktopActionPending, onClick: onClose, children: t("close") })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    import_dsh_client_ui_primitives2.Modal,
    {
      open: true,
      className: "dshMarketModal dshMarketWideModal",
      contentClassName: "dshMarketModalContent",
      onClose,
      title: preview === void 0 ? value.item.displayName : t("confirmInstallTitle"),
      closeLabel: t("close"),
      ...preview === void 0 ? {} : { description: t("confirmInstallBody") },
      footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketModalActions", children: footer }),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ItemSourceRow, { source: value.source, t }),
        preview !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationReview", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OperationFacts, { operation: preview, t }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("operationWarning") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
              t("operationRiskBeforeContact"),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: DSH_DESKTOP_ISSUES_URL, target: "_blank", rel: "noopener noreferrer", children: t("contactUs") }),
              t("operationRiskAfterContact")
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("restartAfterOperation") })
          ] }),
          pending && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationProgress", role: "status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 12 }),
            t("installing")
          ] }),
          operationError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketError", role: "alert", children: operationError })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketDetails", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketDetailsIntro", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PluginIcon, { item: value.item, large: true }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: value.item.description ?? value.item.summary })
          ] }),
          inventoryLoading && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationProgress", role: "status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 12 }),
            t("loadingInstallations")
          ] }),
          inventoryError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketBanner", role: "alert", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: inventoryError })
          ] }),
          installation !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketReceipts", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            InstallationCard,
            {
              installation,
              operationPending: pending,
              onUninstall,
              onDisable,
              onEnable,
              t
            }
          ) }),
          !inventoryLoading && inventoryError === void 0 && installation === void 0 && checking && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationProgress", role: "status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 12 }),
            t("checkingInstallMethod")
          ] }),
          installation === void 0 && !inventoryLoading && !checking && operationError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketBanner", role: "alert", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: operationError }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("a", { href: verificationHelpHref, target: "_blank", rel: "noopener noreferrer", children: [
              t("verificationDetails"),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRightUpOutline16, { size: 12 })
            ] })
          ] }),
          installation === void 0 && !inventoryLoading && inventoryError === void 0 && !checking && manualInstall !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketManualInstall", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: t("manualInstallTitle") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t("manualInstallBody") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketCommand", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("installCommand") }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: manualInstall.displayCommand })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("manualNotVerified") })
            ] }),
            manualInstall.mutable && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("mutableGithubWarning") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("operationWarning") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dshMarketOperationWarning", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "warning", size: 12 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                t("operationRiskBeforeContact"),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: DSH_DESKTOP_ISSUES_URL, target: "_blank", rel: "noopener noreferrer", children: t("contactUs") }),
                t("operationRiskAfterContact")
              ] })
            ] })
          ] }) : installation === void 0 && !inventoryLoading && inventoryError === void 0 && !checking && operationError === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: t("readOnly") }) : null,
          desktopActionError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dshMarketError", role: "alert", children: desktopActionError })
        ] })
      ] })
    }
  );
}

// src/client/MarketOverlay.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function MarketOverlay({ useStore, actions, readLocale, t, initialView }) {
  const open = useStore((state) => state.open);
  const panel = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    panel.current?.querySelector("button")?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      actions.close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actions, open]);
  if (!open) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dshMarketOverlay", role: "dialog", "aria-modal": "true", "aria-label": t("title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dshMarketOverlayMask", type: "button", "aria-label": t("closeMarket"), onClick: () => actions.close() }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { ref: panel, className: "dshMarketOverlayPanel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { className: "dshMarketOverlayHeader", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h1", { children: t("title") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t("subtitle") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("closeMarket"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Button,
          {
            variant: "ghost",
            size: "sm",
            "aria-label": t("closeMarket"),
            icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconCloseOutline16, {}),
            onClick: () => actions.close()
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dshMarketOverlayBody", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        MarketSurface,
        {
          ...initialView === void 0 ? {} : { initialView },
          readLocale,
          showHeader: false,
          t
        }
      ) })
    ] })
  ] });
}

// src/client/market-view-store.ts
// [dsh-client-runtime-decomposed] 0.1.2-alpha.1 把 dsh-client-runtime 分解，
// defineStore 迁至 @deepseek-ai/dsh-client-store。上游构建产物原 require
// dsh-client-runtime/client（子路径形态在内核模块表按裸包名注册下必 miss，
// #124 形态）。此处改 require "@deepseek-ai/dsh-client-store"：inject 声明
// 保证 store 图行先于本插件物化，defineStore 导出面完整可用。
var import_client = require("@deepseek-ai/dsh-client-store");
function createMarketViewStore() {
  return (0, import_client.defineStore)({
    init: () => ({ open: false }),
    actions: {
      open: (draft) => {
        draft.open = true;
      },
      close: (draft) => {
        draft.open = false;
      }
    }
  });
}

// src/client/locales.ts
var zh = {
  tab: "\u63D2\u4EF6\u5E02\u573A",
  title: "\u793E\u533A\u63D2\u4EF6\u5E02\u573A",
  subtitle: "\u4ECE\u4F60\u9009\u62E9\u7684\u6765\u6E90\u53D1\u73B0 DeepSeek Harness \u63D2\u4EF6",
  close: "\u5173\u95ED",
  closeMarket: "\u5173\u95ED\u63D2\u4EF6\u5E02\u573A",
  discover: "\u53D1\u73B0",
  installable: "\u53EF\u5B89\u88C5",
  installed: "\u5DF2\u5B89\u88C5",
  sources: "\u6765\u6E90",
  sourceSelection: "\u9009\u62E9\u63D2\u4EF6\u6765\u6E90",
  currentSource: "\u5F53\u524D\u6765\u6E90",
  noSourceSelected: "\u672A\u9009\u62E9\u6765\u6E90",
  search: "\u641C\u7D22\u63D2\u4EF6",
  searchAction: "\u641C\u7D22",
  categories: "\u5206\u7C7B",
  refresh: "\u5237\u65B0",
  loading: "\u6B63\u5728\u52A0\u8F7D\u63D2\u4EF6\u76EE\u5F55...",
  emptyTitle: "\u5C1A\u672A\u9009\u62E9\u6765\u6E90",
  emptyBody: "\u4F60\u53EF\u4EE5\u6DFB\u52A0\u591A\u4E2A\u6765\u6E90\uFF0C\u4F46\u6BCF\u6B21\u53EA\u80FD\u4F7F\u7528\u4E00\u4E2A\u3002",
  chooseSources: "\u7BA1\u7406\u6765\u6E90",
  noResults: "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u63D2\u4EF6",
  loadMore: "\u52A0\u8F7D\u66F4\u591A",
  loadingMore: "\u6B63\u5728\u52A0\u8F7D\u66F4\u591A...",
  loadMoreError: "\u65E0\u6CD5\u52A0\u8F7D\u66F4\u591A\uFF0C\u5DF2\u663E\u793A\u7684\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\u3002",
  partialFailure: "\u5F53\u524D\u6765\u6E90\u5237\u65B0\u5931\u8D25\uFF0C\u6B63\u5728\u663E\u793A\u4E0A\u6B21\u6210\u529F\u52A0\u8F7D\u7684\u7ED3\u679C\u3002",
  stale: "\u4E0A\u6B21\u7ED3\u679C",
  source: "\u6765\u6E90",
  repository: "\u6253\u5F00\u6E90\u7801\u4ED3\u5E93",
  details: "\u63D2\u4EF6\u8BE6\u60C5",
  readOnly: "\u6682\u4E0D\u652F\u6301\u5728\u684C\u9762\u7AEF\u81EA\u52A8\u5B89\u88C5\u6B64\u63D2\u4EF6\u3002\u4F60\u4ECD\u53EF\u67E5\u770B\u63D2\u4EF6\u4FE1\u606F\u548C\u6E90\u7801\u4ED3\u5E93\u3002",
  checkingInstallMethod: "\u6B63\u5728\u786E\u8BA4\u53EF\u7528\u7684\u5B89\u88C5\u65B9\u5F0F...",
  manualInstallTitle: "\u624B\u52A8\u5B89\u88C5",
  manualInstallBody: "\u4EE5\u4E0B\u547D\u4EE4\u7531 DSH Desktop \u6839\u636E\u63D2\u4EF6\u4FE1\u606F\u751F\u6210\uFF0C\u53EF\u80FD\u4E0E\u4ED3\u5E93\u4E2D\u7684\u8BF4\u660E\u4E0D\u540C\u3002\u8BF7\u5148\u68C0\u67E5\u6E90\u7801\uFF0C\u518D\u590D\u5236\u5230 DSH \u7EC8\u7AEF\u6267\u884C\u3002",
  installCommand: "\u5B89\u88C5\u547D\u4EE4",
  manualNotVerified: "\u8FD9\u6761\u5C55\u793A\u547D\u4EE4\u6CA1\u6709\u901A\u8FC7\u684C\u9762\u7AEF\u81EA\u52A8\u5B89\u88C5\u6240\u9700\u7684\u5B8C\u6574\u5305\u9A8C\u8BC1\uFF0C\u8BF7\u81EA\u884C\u786E\u8BA4\u63D2\u4EF6\u6765\u6E90\u3001\u5185\u5BB9\u548C\u517C\u5BB9\u6027\u3002",
  mutableGithubWarning: "GitHub \u5B89\u88C5\u6307\u5411\u4ED3\u5E93\u5F53\u524D HEAD\uFF0C\u5185\u5BB9\u53EF\u80FD\u968F\u65F6\u53D8\u5316\uFF0C\u65E0\u6CD5\u9501\u5B9A\u5230\u672C\u6B21\u770B\u5230\u7684\u4EE3\u7801\u3002",
  openTerminal: "\u6253\u5F00 DSH \u7EC8\u7AEF",
  openingTerminal: "\u6B63\u5728\u6253\u5F00\u7EC8\u7AEF...",
  desktopActionUnavailable: "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u8FD9\u4E2A\u684C\u9762\u64CD\u4F5C\u3002",
  terminalError: "\u65E0\u6CD5\u6253\u5F00 DSH \u7EC8\u7AEF\uFF0C\u8BF7\u4ECE\u5E94\u7528\u83DC\u5355\u624B\u52A8\u6253\u5F00\u540E\u518D\u590D\u5236\u547D\u4EE4\u3002",
  restartError: "\u65E0\u6CD5\u8BF7\u6C42\u91CD\u542F DSH Desktop\uFF0C\u8BF7\u7A0D\u540E\u624B\u52A8\u91CD\u542F\u3002",
  installableBody: "\u8FD9\u91CC\u663E\u793A\u4ECE\u5F53\u524D\u6765\u6E90\u5B8C\u6574\u76EE\u5F55\u4E2D\u521D\u6B65\u7B5B\u9009\u51FA\u7684\u53EF\u5B89\u88C5\u63D2\u4EF6\u3002\u9009\u62E9\u63D2\u4EF6\u540E\uFF0CDSH Desktop \u4ECD\u4F1A\u518D\u6B21\u9A8C\u8BC1\u7248\u672C\u3001\u6765\u6E90\u548C\u517C\u5BB9\u6027\u3002",
  installedBody: "\u8FD9\u91CC\u663E\u793A\u5F53\u524D\u914D\u7F6E\u4E2D\u7684\u63D2\u4EF6\u3002\u901A\u8FC7\u63D2\u4EF6\u5E02\u573A\u5B89\u88C5\u7684\u63D2\u4EF6\u53EF\u4EE5\u5378\u8F7D\uFF1B\u53EF\u53D8\u63D2\u4EF6\u53EF\u4EE5\u7981\u7528\uFF0C\u5E76\u5728\u4E4B\u540E\u91CD\u65B0\u542F\u7528\u3002",
  install: "\u5B89\u88C5",
  uninstall: "\u5378\u8F7D",
  disable: "\u7981\u7528",
  enable: "\u542F\u7528",
  managedPlugin: "\u901A\u8FC7\u63D2\u4EF6\u5E02\u573A\u5B89\u88C5",
  externalPlugin: "\u901A\u8FC7\u5176\u4ED6\u65B9\u5F0F\u5B89\u88C5",
  immutablePlugin: "DSH \u6838\u5FC3\u7EC4\u4EF6",
  activePlugin: "\u5DF2\u542F\u7528",
  disabledPlugin: "\u5DF2\u8BBE\u4E3A\u7981\u7528",
  noInstallable: "\u5F53\u524D\u6765\u6E90\u6CA1\u6709\u53EF\u81EA\u52A8\u5B89\u88C5\u7684\u63D2\u4EF6",
  noInstallableBody: "\u5176\u4ED6\u63D2\u4EF6\u4ECD\u53EF\u5728\u201C\u53D1\u73B0\u201D\u9875\u9762\u67E5\u770B\u3002",
  scanningInstallable: "\u6B63\u5728\u68C0\u67E5\u53EF\u5B89\u88C5\u63D2\u4EF6...",
  installableError: "\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\u53EF\u5B89\u88C5\u63D2\u4EF6",
  rescanInstallable: "\u91CD\u65B0\u68C0\u67E5",
  scannedAt: "\u76EE\u5F55\u66F4\u65B0\u4E8E",
  cacheExpiresAt: "\u7F13\u5B58\u6709\u6548\u671F\u81F3",
  providerRevision: "\u6765\u6E90\u7248\u672C",
  freshScan: "\u6700\u65B0\u6570\u636E",
  cachedScan: "\u7F13\u5B58\u6570\u636E",
  noInstalled: "\u5F53\u524D\u914D\u7F6E\u6CA1\u6709\u53EF\u7BA1\u7406\u7684\u63D2\u4EF6",
  noInstalledBody: "\u5F53\u524D\u914D\u7F6E\u4E2D\u6CA1\u6709\u53EF\u663E\u793A\u7684\u63D2\u4EF6\u3002",
  loadingInstallations: "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u914D\u7F6E\u4E2D\u7684\u63D2\u4EF6...",
  desktopRequiredTitle: "\u9700\u8981 DSH Desktop",
  desktopUnavailable: "\u5B89\u88C5\u3001\u5378\u8F7D\u3001\u7981\u7528\u548C\u542F\u7528\u53EA\u5728 DSH Desktop \u4E2D\u53EF\u7528\uFF1B\u4F60\u4ECD\u7136\u53EF\u4EE5\u6D4F\u89C8\u63D2\u4EF6\u76EE\u5F55\u3002",
  installationsError: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u914D\u7F6E\u7684\u63D2\u4EF6\u6E05\u5355",
  previewError: "\u65E0\u6CD5\u9A8C\u8BC1\u8FD9\u4E2A\u63D2\u4EF6\u7684\u7CBE\u786E\u76EE\u6807\uFF0C\u53EF\u80FD\u5E76\u975E\u6807\u51C6\u63D2\u4EF6\u3002",
  verificationDetails: "\u67E5\u770B\u8BE6\u60C5",
  uninstallPreviewError: "\u65E0\u6CD5\u9A8C\u8BC1\u6B64\u63D2\u4EF6\u7684\u5E02\u573A\u5B89\u88C5\u8BB0\u5F55\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  disablePreviewError: "\u65E0\u6CD5\u786E\u8BA4\u8981\u7981\u7528\u7684\u63D2\u4EF6\u52A0\u8F7D\u9879\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  enablePreviewError: "\u65E0\u6CD5\u786E\u8BA4\u8981\u542F\u7528\u7684\u63D2\u4EF6\u52A0\u8F7D\u9879\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  executeError: "\u65E0\u6CD5\u786E\u8BA4\u64CD\u4F5C\u7ED3\u679C\u3002\u8BF7\u5148\u5237\u65B0\u201C\u5DF2\u5B89\u88C5\u201D\u540E\u91CD\u8BD5\uFF0C\u907F\u514D\u91CD\u590D\u64CD\u4F5C\u3002",
  plugin: "\u63D2\u4EF6",
  package: "npm \u5305",
  exactVersion: "\u7CBE\u786E\u7248\u672C",
  profile: "\u5F53\u524D\u914D\u7F6E",
  installedAt: "\u5B89\u88C5\u65F6\u95F4",
  previewExpires: "\u786E\u8BA4\u6709\u6548\u671F\u81F3",
  confirmInstallTitle: "\u786E\u8BA4\u5B89\u88C5\u63D2\u4EF6",
  confirmInstallBody: "\u8BF7\u786E\u8BA4 DSH Desktop \u9A8C\u8BC1\u7684 npm \u5305\u3001\u7248\u672C\u548C\u76EE\u6807\u914D\u7F6E\u3002",
  confirmUninstallTitle: "\u786E\u8BA4\u5378\u8F7D\u63D2\u4EF6",
  confirmUninstallBody: "\u53EA\u4F1A\u5378\u8F7D\u5F53\u524D\u914D\u7F6E\u4E2D\u7531\u63D2\u4EF6\u5E02\u573A\u5B89\u88C5\u5E76\u9A8C\u8BC1\u8FC7\u7684\u8FD9\u4E2A\u63D2\u4EF6\u3002",
  confirmDisableTitle: "\u786E\u8BA4\u7981\u7528\u5916\u90E8\u63D2\u4EF6",
  confirmDisableBody: "DSH Desktop \u5C06\u505C\u6B62\u5728\u5F53\u524D\u914D\u7F6E\u4E2D\u52A0\u8F7D\u8FD9\u4E2A\u63D2\u4EF6\uFF0C\u4F46\u4E0D\u4F1A\u5378\u8F7D\u5BF9\u5E94\u7684 npm \u5305\u3002",
  confirmEnableTitle: "\u786E\u8BA4\u542F\u7528\u63D2\u4EF6",
  confirmEnableBody: "DSH Desktop \u5C06\u6062\u590D\u5728\u5F53\u524D\u914D\u7F6E\u4E2D\u52A0\u8F7D\u8FD9\u4E2A\u63D2\u4EF6\u3002\u5BF9\u5E94\u7684\u4EE3\u7801\u4F1A\u5728\u91CD\u542F\u540E\u8FD0\u884C\u3002",
  confirmInstall: "\u786E\u8BA4\u5B89\u88C5",
  confirmUninstall: "\u786E\u8BA4\u5378\u8F7D",
  confirmDisable: "\u786E\u8BA4\u7981\u7528",
  confirmEnable: "\u786E\u8BA4\u542F\u7528",
  installing: "\u6B63\u5728\u5B89\u88C5...",
  uninstalling: "\u6B63\u5728\u5378\u8F7D...",
  disabling: "\u6B63\u5728\u7981\u7528...",
  enabling: "\u6B63\u5728\u542F\u7528...",
  operationWarning: "\u63D2\u4EF6\u4F1A\u4F5C\u4E3A\u672C\u5730\u4EE3\u7801\uFF0C\u4EE5\u4F60\u7684\u7528\u6237\u6743\u9650\u8FD0\u884C\u3002\u8BF7\u53EA\u5B89\u88C5\u4F60\u4FE1\u4EFB\u7684\u63D2\u4EF6\u3002",
  operationRiskBeforeContact: "\u4EE5\u9519\u8BEF\u65B9\u5F0F\u5B89\u88C5\u63D2\u4EF6\uFF0C\u6216\u8005\u5B89\u88C5\u672A\u7ECF\u9A8C\u8BC1\u7684\u63D2\u4EF6\uFF0C\u53EF\u80FD\u5BFC\u81F4\u8F6F\u4EF6\u5D29\u6E83\u6216\u5F02\u5E38\u3002\u4F60\u53EF\u4EE5",
  contactUs: "\u8054\u7CFB\u6211\u4EEC",
  operationRiskAfterContact: "\uFF0C\u6216\u8005\u8054\u7CFB\u63D2\u4EF6\u5F00\u53D1\u8005\u3002",
  restartAfterOperation: "\u64CD\u4F5C\u5B8C\u6210\u540E\u9700\u8981\u91CD\u542F DSH Desktop\uFF0C\u6539\u52A8\u624D\u4F1A\u751F\u6548\u3002",
  disableWarning: "\u7981\u7528\u4E0D\u4F1A\u5378\u8F7D npm \u5305\uFF0C\u4E5F\u4E0D\u4F1A\u9694\u79BB\u63D2\u4EF6\u4EE3\u7801\u3002",
  disableRecoveryWarning: "\u5982\u679C\u63D2\u4EF6\u5BFC\u81F4 DSH Desktop \u65E0\u6CD5\u8FDB\u5165\u6B64\u9875\u9762\uFF0C\u9700\u8981\u6309\u7167\u6062\u590D\u6587\u6863\u624B\u52A8\u5904\u7406\u3002",
  enableWarning: "\u542F\u7528\u540E\uFF0C\u63D2\u4EF6\u4F1A\u4F5C\u4E3A\u672C\u5730\u4EE3\u7801\uFF0C\u4EE5\u4F60\u7684\u7528\u6237\u6743\u9650\u8FD0\u884C\u3002\u8BF7\u53EA\u542F\u7528\u4F60\u4FE1\u4EFB\u7684\u63D2\u4EF6\u3002",
  disabledRestartRequired: "\u6B64\u63D2\u4EF6\u5F53\u524D\u5DF2\u7981\u7528\uFF0C\u53EF\u4EE5\u91CD\u65B0\u542F\u7528\u3002",
  installComplete: "\u63D2\u4EF6\u5B89\u88C5\u5B8C\u6210",
  uninstallComplete: "\u63D2\u4EF6\u5378\u8F7D\u5B8C\u6210",
  disableComplete: "\u63D2\u4EF6\u5DF2\u8BBE\u4E3A\u7981\u7528",
  enableComplete: "\u63D2\u4EF6\u5DF2\u8BBE\u4E3A\u542F\u7528",
  restartRequiredTitle: "\u9700\u8981\u91CD\u542F DSH Desktop",
  restartRequiredBody: "\u8BF7\u91CD\u542F DSH Desktop\uFF0C\u8BA9\u5F53\u524D\u914D\u7F6E\u52A0\u8F7D\u6700\u65B0\u7684\u63D2\u4EF6\u72B6\u6001\u3002",
  restartLater: "\u7A0D\u540E\u91CD\u542F",
  restartNow: "\u7ACB\u5373\u91CD\u542F",
  restarting: "\u6B63\u5728\u91CD\u542F...",
  done: "\u5B8C\u6210",
  builtIn: "\u5185\u7F6E\u9002\u914D\u5668",
  partner: "\u5408\u4F5C\u63D0\u4F9B\u65B9",
  sourcePartnershipBefore: "\u9664\u4E86\u6DFB\u52A0\u7B26\u5408\u63A5\u5165\u683C\u5F0F\u7684\u81EA\u5B9A\u4E49\u6765\u6E90\uFF0C\u4E5F\u53EF\u4EE5",
  sourcePartnershipContact: "\u8054\u7CFB\u6211\u4EEC",
  sourcePartnershipAfter: "\uFF0C\u7533\u8BF7\u5C06\u4F60\u7684\u63D2\u4EF6\u5E02\u573A\u52A0\u5165\u5185\u7F6E\u5408\u4F5C\u6765\u6E90\u3002",
  sourcePartnershipGuide: "\u67E5\u770B\u6765\u6E90\u63A5\u5165\u6307\u5357",
  selectSource: "\u9009\u62E9\u6B64\u6765\u6E90",
  selectedSource: "\u5F53\u524D\u6765\u6E90",
  add: "\u6DFB\u52A0",
  remove: "\u79FB\u9664\u6765\u6E90",
  moveUp: "\u4E0A\u79FB\u6765\u6E90",
  moveDown: "\u4E0B\u79FB\u6765\u6E90",
  standardSource: "\u6765\u6E90\u6E05\u5355 URL",
  standardAdapter: "\u6807\u51C6\u534F\u8BAE",
  notChecked: "\u5C1A\u672A\u68C0\u67E5",
  available: "\u6700\u8FD1\u68C0\u67E5\u53EF\u7528",
  lastStale: "\u6B63\u5728\u4F7F\u7528\u65E7\u6570\u636E",
  unavailable: "\u6700\u8FD1\u68C0\u67E5\u4E0D\u53EF\u7528",
  manifestPlaceholder: "https://example.com/catalog-source.json",
  addStandard: "\u6DFB\u52A0\u6807\u51C6\u6765\u6E90",
  cancel: "\u53D6\u6D88",
  confirmAdd: "\u6DFB\u52A0\u6765\u6E90",
  sourceNotice: "\u53EF\u4EE5\u6DFB\u52A0\u591A\u4E2A\u6765\u6E90\uFF0C\u4F46\u6BCF\u6B21\u53EA\u4F7F\u7528\u4E00\u4E2A\u3002\u8BF7\u4F7F\u7528\u60A8\u4FE1\u4EFB\u7684\u63D2\u4EF6\u6765\u6E90\u3002",
  sourceError: "\u6765\u6E90\u64CD\u4F5C\u5931\u8D25",
  catalogError: "\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\u63D2\u4EF6\u76EE\u5F55",
  catalogFailureSource: "\u6765\u6E90",
  catalogFailureTimeout: "\u76EE\u5F55\u8BF7\u6C42\u8D85\u65F6\u3002",
  catalogFailureInvalidResponse: "\u6765\u6E90\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u76EE\u5F55\u6570\u636E\u3002",
  catalogFailureUnavailable: "\u5F53\u524D\u65E0\u6CD5\u8FDE\u63A5\u8BE5\u76EE\u5F55\u6765\u6E90\u3002",
  retry: "\u91CD\u8BD5",
  update: "\u66F4\u65B0",
  updating: "\u6B63\u5728\u66F4\u65B0...",
  updateAvailable: "\u6709\u53EF\u7528\u66F4\u65B0",
  currentVersion: "\u5F53\u524D\u7248\u672C",
  updatePreviewError: "\u65E0\u6CD5\u9A8C\u8BC1\u6B64\u63D2\u4EF6\u7684\u66F4\u65B0\u76EE\u6807\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
  confirmUpdateTitle: "\u786E\u8BA4\u66F4\u65B0\u63D2\u4EF6",
  confirmUpdateBody: "\u8BF7\u786E\u8BA4 DSH Desktop \u9A8C\u8BC1\u7684\u66F4\u65B0\u76EE\u6807\u4E0E\u7248\u672C\u3002",
  confirmUpdate: "\u786E\u8BA4\u66F4\u65B0",
  updateComplete: "\u63D2\u4EF6\u66F4\u65B0\u5B8C\u6210",
  updateErrorNoIntegrity: "\u53D1\u5E03\u6E90\u672A\u63D0\u4F9B\u5B8C\u6574\u6027\u6821\u9A8C\u548C\uFF0C\u4E3A\u5B89\u5168\u8D77\u89C1\u62D2\u7EDD\u66F4\u65B0",
  updateErrorIntegrityMismatch: "\u4E0B\u8F7D\u5185\u5BB9\u6821\u9A8C\u5931\u8D25\uFF0C\u5DF2\u4E2D\u6B62",
  updateErrorBadUrl: "\u4E0B\u8F7D\u5730\u5740\u975E\u6CD5\uFF08\u4EC5\u5141\u8BB8 https\uFF09",
  updateErrorArchiveUnsafe: "\u5F52\u6863\u5185\u5BB9\u5305\u542B\u4E0D\u5B89\u5168\u7684\u6761\u76EE\uFF0C\u5DF2\u4E2D\u6B62",
  updateErrorPackageMismatch: "\u4E0B\u8F7D\u5185\u5BB9\u4E0E\u76EE\u6807\u63D2\u4EF6\u4E0D\u5339\u914D\uFF0C\u5DF2\u4E2D\u6B62",
  updateErrorScanBlocked: "\u9759\u6001\u626B\u63CF\u53D1\u73B0\u9AD8\u5371\u5185\u5BB9\u4E14\u672A\u83B7\u786E\u8BA4\uFF0C\u5DF2\u4E2D\u6B62",
  updateErrorRollbackFailed: "\u56DE\u6EDA\u5931\u8D25\uFF0C\u5907\u4EFD\u4FDD\u7559\u5728 .bak \u76EE\u5F55",
  updateErrorDownloadFailed: "\u4E0B\u8F7D\u5931\u8D25"
};
var en = {
  tab: "Plugin Market",
  title: "Community Plugin Market",
  subtitle: "Discover DeepSeek Harness plugins from sources you choose",
  close: "Close",
  closeMarket: "Close Plugin Market",
  discover: "Discover",
  installable: "Installable",
  installed: "Installed",
  sources: "Sources",
  sourceSelection: "Choose plugin source",
  currentSource: "Current source",
  noSourceSelected: "No source selected",
  search: "Search plugins",
  searchAction: "Search",
  categories: "Categories",
  refresh: "Refresh",
  loading: "Loading plugin catalog...",
  emptyTitle: "No source selected",
  emptyBody: "You can add multiple sources, but only one is used at a time.",
  chooseSources: "Manage sources",
  noResults: "No matching plugins",
  loadMore: "Load more",
  loadingMore: "Loading more...",
  loadMoreError: "More results could not be loaded. Results already shown are unaffected.",
  partialFailure: "The current source could not be refreshed. Showing the last successfully loaded results.",
  stale: "Previous results",
  source: "Source",
  repository: "Open source repository",
  details: "Plugin details",
  readOnly: "This plugin cannot currently be installed automatically in Desktop. You can still review its details and source repository.",
  checkingInstallMethod: "Checking available installation methods...",
  manualInstallTitle: "Manual installation",
  manualInstallBody: "DSH Desktop generated this command from the plugin information, so it may differ from the repository instructions. Review the source first, then copy it into DSH Terminal.",
  installCommand: "Install command",
  manualNotVerified: "This display-only command has not passed the complete package verification required for managed installation. Verify the source, contents, and compatibility yourself.",
  mutableGithubWarning: "This GitHub target follows the repository\u2019s current HEAD. Its contents can change and are not pinned to the code shown now.",
  openTerminal: "Open DSH Terminal",
  openingTerminal: "Opening terminal...",
  desktopActionUnavailable: "This desktop action is not available in the current environment.",
  terminalError: "DSH Terminal could not be opened. Open it from the application menu, then copy the command manually.",
  restartError: "DSH Desktop could not be restarted. Restart it manually when convenient.",
  installableBody: "This view shows plugins pre-screened from the current source\u2019s complete catalog. DSH Desktop verifies the version, source, and compatibility again after selection.",
  installedBody: "Plugins in the active profile appear here. Plugins installed by Plugin Market can be uninstalled; mutable plugins can be disabled and enabled again later.",
  install: "Install",
  uninstall: "Uninstall",
  disable: "Disable",
  enable: "Enable",
  managedPlugin: "Installed by Plugin Market",
  externalPlugin: "Installed another way",
  immutablePlugin: "DSH core component",
  activePlugin: "Enabled",
  disabledPlugin: "Set to disabled",
  noInstallable: "No automatically installable plugins in the current source",
  noInstallableBody: "Other plugins remain available under Discover.",
  scanningInstallable: "Checking installable plugins...",
  installableError: "Installable plugins are temporarily unavailable",
  rescanInstallable: "Check again",
  scannedAt: "Catalog updated",
  cacheExpiresAt: "Cache expires",
  providerRevision: "Provider revision",
  freshScan: "Fresh data",
  cachedScan: "Cached data",
  noInstalled: "No manageable plugins in the current profile",
  noInstalledBody: "There are no plugins to show in the active profile.",
  loadingInstallations: "Reading plugins in the active profile...",
  desktopRequiredTitle: "DSH Desktop is required",
  desktopUnavailable: "Install, uninstall, disable, and enable are available only in DSH Desktop. You can still browse the catalog.",
  installationsError: "The plugin inventory for the current profile is temporarily unavailable",
  previewError: "The exact plugin target could not be verified and may not be a standard plugin.",
  verificationDetails: "View details",
  uninstallPreviewError: "This plugin\u2019s Plugin Market install record could not be verified. Refresh and try again.",
  disablePreviewError: "The plugin bundle to disable could not be confirmed. Refresh and try again.",
  enablePreviewError: "The plugin bundle to enable could not be confirmed. Refresh and try again.",
  executeError: "The operation result could not be confirmed. Refresh Installed before trying again to avoid repeating the operation.",
  plugin: "Plugin",
  package: "npm package",
  exactVersion: "Exact version",
  profile: "Current profile",
  installedAt: "Installed at",
  previewExpires: "Confirmation expires",
  confirmInstallTitle: "Confirm plugin installation",
  confirmInstallBody: "Review the npm package, version, and target profile verified by DSH Desktop.",
  confirmUninstallTitle: "Confirm plugin removal",
  confirmUninstallBody: "Only this plugin\u2019s verified Plugin Market installation in the active profile will be removed.",
  confirmDisableTitle: "Confirm external plugin disable",
  confirmDisableBody: "DSH Desktop will stop loading this plugin in the active profile without uninstalling its npm package.",
  confirmEnableTitle: "Confirm plugin enable",
  confirmEnableBody: "DSH Desktop will load this plugin in the active profile again. Its code will run after restart.",
  confirmInstall: "Confirm install",
  confirmUninstall: "Confirm uninstall",
  confirmDisable: "Confirm disable",
  confirmEnable: "Confirm enable",
  installing: "Installing...",
  uninstalling: "Uninstalling...",
  disabling: "Disabling...",
  enabling: "Enabling...",
  operationWarning: "Plugins run as local code with your user permissions. Install only plugins you trust.",
  operationRiskBeforeContact: "Installing a plugin incorrectly, or installing an unverified plugin, may cause crashes or unexpected behavior. You can ",
  contactUs: "contact us",
  operationRiskAfterContact: " or the plugin developer.",
  restartAfterOperation: "Restart DSH Desktop after this operation for the change to take effect.",
  disableWarning: "Disabling does not uninstall the npm package or isolate the plugin\u2019s code.",
  disableRecoveryWarning: "If the plugin prevents DSH Desktop from reaching this page, use the manual recovery steps.",
  enableWarning: "After it is enabled, this plugin runs as local code with your user permissions. Enable only plugins you trust.",
  disabledRestartRequired: "This plugin is currently disabled and can be enabled again.",
  installComplete: "Plugin installed",
  uninstallComplete: "Plugin uninstalled",
  disableComplete: "Plugin set to disabled",
  enableComplete: "Plugin set to enabled",
  restartRequiredTitle: "Restart DSH Desktop",
  restartRequiredBody: "Restart DSH Desktop so the current profile loads its updated plugin state.",
  restartLater: "Restart later",
  restartNow: "Restart now",
  restarting: "Restarting...",
  done: "Done",
  builtIn: "Built-in adapter",
  partner: "Partner provider",
  sourcePartnershipBefore: "Besides adding a compatible custom source, you can ",
  sourcePartnershipContact: "contact us",
  sourcePartnershipAfter: " to apply for inclusion as a built-in partner source.",
  sourcePartnershipGuide: "Read the source integration guide",
  selectSource: "Select this source",
  selectedSource: "Current source",
  add: "Add",
  remove: "Remove source",
  moveUp: "Move source up",
  moveDown: "Move source down",
  standardSource: "Source manifest URL",
  standardAdapter: "Standard protocol",
  notChecked: "Not checked yet",
  available: "Available on last check",
  lastStale: "Using stale data",
  unavailable: "Unavailable on last check",
  manifestPlaceholder: "https://example.com/catalog-source.json",
  addStandard: "Add standard source",
  cancel: "Cancel",
  confirmAdd: "Add source",
  sourceNotice: "You can add multiple sources, but only one is used at a time. Use only plugin sources you trust.",
  sourceError: "Source operation failed",
  catalogError: "The plugin catalog is temporarily unavailable",
  catalogFailureSource: "Source",
  catalogFailureTimeout: "The catalog request timed out.",
  catalogFailureInvalidResponse: "The source returned catalog data that could not be read.",
  catalogFailureUnavailable: "The catalog source could not be reached.",
  retry: "Retry",
  update: "Update",
  updating: "Updating...",
  updateAvailable: "Update available",
  currentVersion: "Current version",
  updatePreviewError: "The update target could not be verified. Refresh and try again.",
  confirmUpdateTitle: "Confirm plugin update",
  confirmUpdateBody: "Confirm the DSH Desktop-verified update target and version.",
  confirmUpdate: "Confirm update",
  updateComplete: "Plugin updated",
  updateErrorNoIntegrity: "The release source did not provide an integrity checksum, so the update was refused for safety.",
  updateErrorIntegrityMismatch: "Downloaded content failed verification and was aborted.",
  updateErrorBadUrl: "The download URL is invalid (only https is allowed).",
  updateErrorArchiveUnsafe: "The archive contains unsafe entries and was aborted.",
  updateErrorPackageMismatch: "The downloaded content does not match the target plugin and was aborted.",
  updateErrorScanBlocked: "Static scanning found high-risk content that was not confirmed; aborted.",
  updateErrorRollbackFailed: "Rollback failed; the backup is kept in the .bak directory.",
  updateErrorDownloadFailed: "Download failed."
};

// src/client/styles.ts
var STYLE_ID = "dsh-community-market/styles";
var css = `
.dshMarketRoot {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 460px;
  color: var(--dsw-alias-label-primary);
}

.dshMarketHeader,
.dshMarketViewBar,
.dshMarketSectionHead,
.dshMarketToolbar,
.dshMarketSourceActions,
.dshMarketOverlayHeader {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dshMarketHeader,
.dshMarketSectionHead,
.dshMarketOverlayHeader {
  align-items: flex-start;
}

.dshMarketHeaderTitle,
.dshMarketSectionHead > div,
.dshMarketOverlayHeader > div {
  min-width: 0;
  flex: 1;
}

.dshMarketHeaderTitle h2,
.dshMarketSectionHead h2,
.dshMarketOverlayHeader h1 {
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}

.dshMarketHeaderTitle p,
.dshMarketSectionHead p,
.dshMarketOverlayHeader p {
  margin: 3px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}

.dshMarketViewBar {
  justify-content: space-between;
}

.dshMarketViewSwitch {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dshMarketCurrentSource a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  text-decoration: none;
}

.dshMarketCurrentSource a:hover {
  text-decoration: underline;
}

.dshMarketMain,
.dshMarketContent {
  min-width: 0;
}

.dshMarketToolbar {
  margin-bottom: 16px;
}

.dshMarketCategories {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: -4px 0 16px;
}

.dshMarketCategories > span:first-child {
  margin-right: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dshMarketSearch {
  min-width: 220px;
  flex: 1;
}

.dshMarketBanner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.dshMarketSourceGuide {
  align-items: flex-start;
}

.dshMarketSourceGuide > span {
  min-width: 0;
}

.dshMarketGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dshMarketCard {
  appearance: none;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 150px;
  padding: 15px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dshMarketCard:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: var(--dsw-shadow-lv1);
}

.dshMarketCard:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

.dshMarketCard:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  box-shadow: none;
}

.dshMarketCardTop {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.dshMarketGlyph,
.dshMarketEmptyIcon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-state-business-primary);
}

.dshMarketGlyph {
  position: relative;
  overflow: hidden;
  width: 34px;
  height: 34px;
}

.dshMarketGlyphLarge {
  width: 56px;
  height: 56px;
  border-radius: 12px;
}

.dshMarketGlyph img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--dsw-alias-bg-layer-3);
}

.dshMarketCardName {
  min-width: 0;
  flex: 1;
}

.dshMarketCardName strong,
.dshMarketCardName span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dshMarketCardName strong {
  font-size: 14px;
  line-height: 20px;
}

.dshMarketCardName span {
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 17px;
}

.dshMarketSummary {
  display: -webkit-box;
  margin: 12px 0;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 19px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.dshMarketTags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: auto;
  overflow: hidden;
}

.dshMarketPagination {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 0 4px;
}

.dshMarketPaginationError {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.dshMarketEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: 24px;
  text-align: center;
}

.dshMarketEmptyIcon {
  width: 48px;
  height: 48px;
  margin-bottom: 14px;
}

.dshMarketEmpty h2 {
  margin: 0 0 6px;
  font-size: 16px;
  line-height: 23px;
}

.dshMarketEmpty p {
  max-width: 430px;
  margin: 0 0 16px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}

.dshMarketSectionHead {
  margin-bottom: 16px;
}

.dshMarketIndexMeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: -6px 0 14px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dshMarketSources {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.dshMarketAvailableSources {
  margin-top: 9px;
}

.dshMarketSource {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 13px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshMarketSource h3 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
}

.dshMarketSource p {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dshMarketSourceAttribution {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 7px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.dshMarketSourceAttribution a {
  color: var(--dsw-alias-label-secondary);
  text-decoration: underline;
  text-decoration-color: var(--dsw-alias-border-l3);
  text-underline-offset: 2px;
}

.dshMarketSourceAttribution a:hover {
  color: var(--dsw-alias-label-primary);
}

.dshMarketSourceMeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 10px;
  margin-top: 7px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.dshMarketSourceMeta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow-wrap: anywhere;
}

.dshMarketSourceActions {
  justify-content: flex-end;
  gap: 7px;
}

.dshMarketReceipts {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.dshMarketReceipt {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
}

.dshMarketReceiptMain {
  min-width: 0;
}

.dshMarketReceiptActions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.dshMarketReceiptTitle,
.dshMarketReceiptMeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.dshMarketReceiptTitle {
  gap: 7px;
}

.dshMarketReceiptTitle h3 {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
}

.dshMarketReceiptMeta {
  gap: 5px 12px;
  margin-top: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dshMarketReceiptMeta span {
  overflow-wrap: anywhere;
}

.dshMarketDetails {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dshMarketItemSourceRow {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  margin-bottom: 14px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  text-align: right;
}

.dshMarketItemSourceRow > :last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.dshMarketItemSourceRow a {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  color: var(--dsw-alias-label-secondary);
  text-decoration: underline;
  text-decoration-color: var(--dsw-alias-border-l3);
  text-underline-offset: 2px;
}

.dshMarketItemSourceRow a:hover {
  color: var(--dsw-alias-label-primary);
}

.dshMarketDetailsIntro {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.dshMarketDetailsIntro > p {
  min-width: 0;
  flex: 1;
}

.dshMarketDetails p {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
  white-space: pre-wrap;
}

.dshMarketDetails > div:last-child {
  padding-top: 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 19px;
}

.dshMarketManualInstall {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dshMarketModal {
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
}

.dshMarketWideModal {
  width: min(800px, calc(100vw - 48px));
}

.dshMarketConfirmModal {
  width: min(600px, calc(100vw - 48px));
}

.dshMarketSourceModal {
  width: min(600px, calc(100vw - 48px));
}

.dshMarketStatusModal {
  width: min(480px, calc(100vw - 48px));
}

.dshMarketModalContent {
  min-height: 0;
  overflow-y: auto;
}

.dshMarketModalActions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.dshMarketManualInstall h3 {
  margin: 0 0 3px;
  font-size: 14px;
  line-height: 20px;
}

.dshMarketManualInstall p {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 19px;
}

.dshMarketCommand {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dshMarketCommand > span {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dshMarketCommand code {
  display: block;
  overflow-x: auto;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 12px;
  line-height: 19px;
  white-space: pre;
}

.dshMarketOperationReview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dshMarketOperationFacts {
  display: grid;
  gap: 8px;
  margin: 0;
}

.dshMarketOperationFacts > div {
  display: grid;
  grid-template-columns: minmax(105px, 0.36fr) minmax(0, 1fr);
  gap: 12px;
}

.dshMarketOperationFacts dt,
.dshMarketOperationFacts dd {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
}

.dshMarketOperationFacts dt {
  color: var(--dsw-alias-label-tertiary);
}

.dshMarketOperationFacts dd {
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}

.dshMarketOperationWarning,
.dshMarketOperationSuccess,
.dshMarketOperationProgress {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 19px;
}

.dshMarketOperationSuccess {
  color: var(--dsw-alias-label-primary);
}

.dshMarketModalField {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dshMarketModalField label {
  font-size: 13px;
  font-weight: 600;
}

.dshMarketError {
  margin-top: 8px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
}

.dshMarketLauncher {
  flex: none;
  box-sizing: border-box;
  width: calc(100% + 4px);
  height: 42px;
  margin: 4px -2px;
  padding: 0 10px 0 8px;
  gap: 8px;
  justify-content: flex-start;
  overflow: hidden;
  border-radius: 12px;
  white-space: nowrap;
}

.dshMarketLauncher[data-wide='false'] {
  width: 36px;
  height: 36px;
  margin: 8px 0 10px;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: 50%;
}

.dshMarketOverlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: auto;
}

.dshMarketOverlayMask {
  position: absolute;
  inset: 0;
  border: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
}

.dshMarketOverlayPanel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(800px, 100%);
  height: min(700px, 100%);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-inverted);
  border-radius: 24px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-shadow-lv3);
}

.dshMarketOverlayHeader {
  flex: none;
  padding: 20px 18px 14px 24px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dshMarketOverlayBody {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 20px 24px 24px;
}

@media (max-width: 680px) {
  .dshMarketOverlay {
    padding: 0;
  }

  .dshMarketOverlayPanel {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }

  .dshMarketHeader,
  .dshMarketViewBar,
  .dshMarketSectionHead,
  .dshMarketToolbar,
  .dshMarketSource,
  .dshMarketSourceActions {
    align-items: stretch;
  }

  .dshMarketHeader,
  .dshMarketViewBar,
  .dshMarketSectionHead,
  .dshMarketToolbar {
    flex-wrap: wrap;
  }

  .dshMarketSearch {
    min-width: 100%;
    order: 2;
  }

  .dshMarketGrid,
  .dshMarketSource,
  .dshMarketReceipt {
    grid-template-columns: 1fr;
  }

  .dshMarketOperationFacts > div {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .dshMarketSourceActions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
`;
function installMarketStyles() {
  const existing = document.querySelector(`style[data-plugin="${STYLE_ID}"]`);
  if (existing !== null) return () => {
  };
  const style = document.createElement("style");
  style.dataset.plugin = STYLE_ID;
  style.textContent = css;
  document.head.append(style);
  return () => {
    style.remove();
  };
}

// src/client/index.ts
var inject = ["slots", "locale"];
var NS = "community-market";
function apply(ctx) {
  const marketView = createMarketViewStore();
  const readLocale = () => ctx.locale.getLocale().active;
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "community-market: dictionaries");
  ctx.effect(() => installMarketStyles(), "community-market: styles");
  ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
    name: "settings.plugins.tab",
    id: "community-market",
    order: 20,
    label: () => ctx.locale.bind(NS)("tab"),
    locale: NS,
    inject: () => ({ readLocale })
  }, MarketSettingsTab));
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "community-market",
    order: 10,
    label: () => ctx.locale.bind(NS)("tab"),
    locale: NS,
    store: marketView
  }, MarketLauncher));
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "community-market",
    order: 10,
    locale: NS,
    store: marketView,
    inject: () => ({ readLocale })
  }, MarketOverlay));
}
return module.exports;
}
});
//# sourceMappingURL=client.js.map

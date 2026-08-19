window.__ModuleLoader__.load({ id: "dsh-skill-manager", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  SkillManagerPanel: () => SkillManagerPanel,
  adaptTypertRemote: () => adaptTypertRemote,
  apply: () => apply,
  ensureSkillManagerStyles: () => ensureSkillManagerStyles,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react = require("react");
var import_react_dom = require("react-dom");

// src/client-descriptors.ts
var PACKAGE_NAME = "dsh-skill-manager";
var SERVICE_NAME = "skillManager";
var jsonCodec = {
  mode: "strict",
  typeSymbol: `${PACKAGE_NAME}/json`,
  schema: {
    parse(value) {
      return value;
    }
  }
};
function descriptor(method) {
  return {
    id: `${PACKAGE_NAME}#${SERVICE_NAME}/${method}`,
    service: SERVICE_NAME,
    namespace: SERVICE_NAME,
    method,
    invocation: { kind: "direct" },
    parameters: [{
      name: "request",
      wire: "request",
      source: "json",
      codec: jsonCodec
    }],
    result: jsonCodec
  };
}
var skillManagerClientDescriptors = [
  descriptor("list"),
  descriptor("create"),
  descriptor("setEnabled"),
  descriptor("getCapabilities"),
  descriptor("searchRepositories"),
  descriptor("browseRepositories"),
  descriptor("inspectRepository"),
  descriptor("installSkill"),
  descriptor("installRepository"),
  descriptor("assessSkillRisk"),
  descriptor("resolveMedia"),
  descriptor("verifyProvenance"),
  descriptor("verifyProvenanceBatch"),
  descriptor("checkUpdates"),
  descriptor("update"),
  descriptor("listBackups"),
  descriptor("rollback"),
  descriptor("delete"),
  descriptor("listTrash"),
  descriptor("restoreTrash"),
  descriptor("discoverExternal"),
  descriptor("importExternal"),
  descriptor("listTargetStates"),
  descriptor("setTargetEnabled")
];

// src/rpc.ts
var RPC_SCHEMA_VERSION = 1;

// src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var STYLE_ATTRIBUTE = "dsh-skill-manager/client";
var inject = ["slots", "remote"];
async function apply(ctx) {
  const disposeRemote = await ctx.remote.$mount({
    package: "dsh-skill-manager",
    descriptors: skillManagerClientDescriptors
  });
  ensureSkillManagerStyles();
  const remote = adaptTypertRemote(ctx.get("remote.skillManager"));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "skill-manager",
    order: 30,
    label: () => "Skill \u7BA1\u7406",
    inject: () => ({ remote })
  }, SkillManagerPanel), "dsh-skill-manager: settings section entry");
  const disposeSidebarIcon = installSkillManagerSidebarIcon();
  return async () => {
    disposeSidebarIcon();
    await disposeRemote();
  };
}
function adaptTypertRemote(remote) {
  const invoke = async (operation) => {
    const result = await operation;
    if (result.ok) return result.value;
    throw new Error(`${result.error.message} (${result.error.code})`);
  };
  return {
    list: (request) => invoke(remote.list(request)),
    create: (request) => invoke(remote.create(request)),
    setEnabled: (request) => invoke(remote.setEnabled(request)),
    getCapabilities: (request) => invoke(remote.getCapabilities(request)),
    searchRepositories: (request) => invoke(remote.searchRepositories(request)),
    browseRepositories: (request) => invoke(remote.browseRepositories(request)),
    inspectRepository: (request) => invoke(remote.inspectRepository(request)),
    installSkill: (request) => invoke(remote.installSkill(request)),
    installRepository: (request) => invoke(remote.installRepository(request)),
    assessSkillRisk: (request) => invoke(remote.assessSkillRisk(request)),
    resolveMedia: (request) => invoke(remote.resolveMedia(request)),
    verifyProvenance: (request) => invoke(remote.verifyProvenance(request)),
    verifyProvenanceBatch: (request) => invoke(remote.verifyProvenanceBatch(request)),
    checkUpdates: (request) => invoke(remote.checkUpdates(request)),
    update: (request) => invoke(remote.update(request)),
    listBackups: (request) => invoke(remote.listBackups(request)),
    rollback: (request) => invoke(remote.rollback(request)),
    delete: (request) => invoke(remote.delete(request)),
    listTrash: (request) => invoke(remote.listTrash(request)),
    restoreTrash: (request) => invoke(remote.restoreTrash(request)),
    discoverExternal: (request) => invoke(remote.discoverExternal(request)),
    importExternal: (request) => invoke(remote.importExternal(request)),
    listTargetStates: (request) => invoke(remote.listTargetStates(request)),
    setTargetEnabled: (request) => invoke(remote.setTargetEnabled(request))
  };
}
function SkillManagerPanel({ remote }) {
  const [skills, setSkills] = (0, import_react.useState)([]);
  const [view, setView] = (0, import_react.useState)("all");
  const [localQuery, setLocalQuery] = (0, import_react.useState)("");
  const [marketQuery, setMarketQuery] = (0, import_react.useState)("");
  const [marketActiveQuery, setMarketActiveQuery] = (0, import_react.useState)(null);
  const [marketCapabilities, setMarketCapabilities] = (0, import_react.useState)(null);
  const [marketHostChecked, setMarketHostChecked] = (0, import_react.useState)(false);
  const [marketRepositories, setMarketRepositories] = (0, import_react.useState)([]);
  const [marketSort, setMarketSort] = (0, import_react.useState)("trend-monthly");
  const [marketCategory, setMarketCategory] = (0, import_react.useState)("all");
  const [marketSearched, setMarketSearched] = (0, import_react.useState)(false);
  const [marketPage, setMarketPage] = (0, import_react.useState)(1);
  const [marketTotal, setMarketTotal] = (0, import_react.useState)(0);
  const [marketHasMore, setMarketHasMore] = (0, import_react.useState)(false);
  const [marketDataUpdatedAt, setMarketDataUpdatedAt] = (0, import_react.useState)(null);
  const [marketSourceState, setMarketSourceState] = (0, import_react.useState)("empty");
  const [marketSourceMessage, setMarketSourceMessage] = (0, import_react.useState)(null);
  const [inspectionRepository, setInspectionRepository] = (0, import_react.useState)(null);
  const [inspection, setInspection] = (0, import_react.useState)(null);
  const [inspectionError, setInspectionError] = (0, import_react.useState)(null);
  const [inspectionAvatarUrl, setInspectionAvatarUrl] = (0, import_react.useState)(null);
  const [inspectionMedia, setInspectionMedia] = (0, import_react.useState)([]);
  const [selectedInspectionMediaId, setSelectedInspectionMediaId] = (0, import_react.useState)(null);
  const [inspectionLoading, setInspectionLoading] = (0, import_react.useState)(false);
  const [selectedSkillPaths, setSelectedSkillPaths] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [riskAssessments, setRiskAssessments] = (0, import_react.useState)(() => /* @__PURE__ */ new Map());
  const [installingSkillPaths, setInstallingSkillPaths] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [installResults, setInstallResults] = (0, import_react.useState)(() => /* @__PURE__ */ new Map());
  const [confirmHighRiskInstall, setConfirmHighRiskInstall] = (0, import_react.useState)(false);
  const [provenanceCheckingNames, setProvenanceCheckingNames] = (0, import_react.useState)(
    () => /* @__PURE__ */ new Set()
  );
  const [provenanceStatuses, setProvenanceStatuses] = (0, import_react.useState)(
    () => /* @__PURE__ */ new Map()
  );
  const [provenanceErrors, setProvenanceErrors] = (0, import_react.useState)(() => /* @__PURE__ */ new Map());
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [marketLoading, setMarketLoading] = (0, import_react.useState)(false);
  const [creating, setCreating] = (0, import_react.useState)(false);
  const [submitting, setSubmitting] = (0, import_react.useState)(false);
  const [busyNames, setBusyNames] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [selectedManagedNames, setSelectedManagedNames] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [bulkManagedAction, setBulkManagedAction] = (0, import_react.useState)(null);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = (0, import_react.useState)(false);
  const [bulkEnabling, setBulkEnabling] = (0, import_react.useState)(false);
  const [checkingUpdateNames, setCheckingUpdateNames] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [updateChecks, setUpdateChecks] = (0, import_react.useState)(
    () => /* @__PURE__ */ new Map()
  );
  const [updatingNames, setUpdatingNames] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [confirmingRiskUpdateName, setConfirmingRiskUpdateName] = (0, import_react.useState)(null);
  const [expandedBackupNames, setExpandedBackupNames] = (0, import_react.useState)(
    () => /* @__PURE__ */ new Set()
  );
  const [backupsByName, setBackupsByName] = (0, import_react.useState)(
    () => /* @__PURE__ */ new Map()
  );
  const [loadingBackupNames, setLoadingBackupNames] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [rollingBackIds, setRollingBackIds] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [confirmingBackupId, setConfirmingBackupId] = (0, import_react.useState)(null);
  const [deletingNames, setDeletingNames] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [confirmingDeleteName, setConfirmingDeleteName] = (0, import_react.useState)(null);
  const [trashedSkills, setTrashedSkills] = (0, import_react.useState)([]);
  const [trashExpanded, setTrashExpanded] = (0, import_react.useState)(false);
  const [trashLoading, setTrashLoading] = (0, import_react.useState)(false);
  const [restoringTrashIds, setRestoringTrashIds] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [maintenance, setMaintenance] = (0, import_react.useState)(() => readMaintenanceSettings());
  const [maintenanceRunning, setMaintenanceRunning] = (0, import_react.useState)(false);
  const [rematchingAll, setRematchingAll] = (0, import_react.useState)(false);
  const [maintenanceStatus, setMaintenanceStatus] = (0, import_react.useState)(null);
  const [externalCandidates, setExternalCandidates] = (0, import_react.useState)([]);
  const [targetStates, setTargetStates] = (0, import_react.useState)([]);
  const [syncScanned, setSyncScanned] = (0, import_react.useState)(false);
  const [syncLoading, setSyncLoading] = (0, import_react.useState)(false);
  const [syncBusyKeys, setSyncBusyKeys] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [syncSource, setSyncSource] = (0, import_react.useState)("all");
  const [selectedExternalKeys, setSelectedExternalKeys] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [error, setError] = (0, import_react.useState)(null);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const marketRequestId = (0, import_react.useRef)(0);
  const inspectionRequestId = (0, import_react.useRef)(0);
  const inspectionMediaRequests = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  const inspectionMediaSelectionTouched = (0, import_react.useRef)(false);
  const panelMounted = (0, import_react.useRef)(true);
  const maintenanceRunActive = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    if (notice === null || !isBulkCompletionNotice(notice)) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => current === notice ? null : current);
    }, BULK_NOTICE_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const loadSkills = (0, import_react.useCallback)(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await remote.list({ schemaVersion: RPC_SCHEMA_VERSION });
      if (response.ok) {
        setSkills(sortSkills(response.data.skills));
        const persistedProvenance = /* @__PURE__ */ new Map();
        for (const skill of response.data.skills) {
          if (skill.source?.kind === "github") persistedProvenance.set(skill.name, "matched");
          else if (skill.provenanceCheck !== void 0) {
            persistedProvenance.set(skill.name, skill.provenanceCheck.status);
          }
        }
        setProvenanceStatuses(persistedProvenance);
        setProvenanceErrors(/* @__PURE__ */ new Map());
        setUpdateChecks(/* @__PURE__ */ new Map());
      } else {
        setError(response.error.message);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setLoading(false);
    }
  }, [remote]);
  (0, import_react.useEffect)(() => {
    void loadSkills();
  }, [loadSkills]);
  const loadTrash = (0, import_react.useCallback)(async () => {
    if (!remote.listTrash) return;
    setTrashLoading(true);
    try {
      const response = await remote.listTrash({ schemaVersion: RPC_SCHEMA_VERSION });
      if (response.ok) setTrashedSkills(response.data.trashed);
      else setError(response.error.message);
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setTrashLoading(false);
    }
  }, [remote]);
  (0, import_react.useEffect)(() => {
    void loadTrash();
  }, [loadTrash]);
  (0, import_react.useEffect)(() => () => {
    panelMounted.current = false;
  }, []);
  const visibleSkills = (0, import_react.useMemo)(() => {
    const candidates = view === "custom" ? skills.filter((skill) => skill.origin === "self" || skill.origin === "local-import") : skills;
    const normalized = localQuery.trim().toLocaleLowerCase();
    if (normalized.length === 0) return candidates;
    return candidates.filter(
      (skill) => skill.name.toLocaleLowerCase().includes(normalized) || skill.description.toLocaleLowerCase().includes(normalized)
    );
  }, [localQuery, skills, view]);
  (0, import_react.useEffect)(() => {
    const visible = new Set(visibleSkills.map((skill) => skill.name));
    setSelectedManagedNames((current) => new Set([...current].filter((name) => visible.has(name))));
  }, [visibleSkills]);
  const visibleExternalCandidates = (0, import_react.useMemo)(() => externalCandidates.filter((candidate) => syncSource === "all" || candidate.target === syncSource), [externalCandidates, syncSource]);
  const visibleMarketRepositories = (0, import_react.useMemo)(() => {
    if (marketCategory === "all") return marketRepositories;
    return marketRepositories.filter((repository) => repository.classification.primaryCategory === marketCategory);
  }, [marketCategory, marketRepositories]);
  const visibleCount = view === "market" ? visibleMarketRepositories.length : visibleSkills.length;
  async function verifySkillProvenance(skill) {
    if (!remote.verifyProvenance) return "unavailable";
    setProvenanceCheckingNames((current) => new Set(current).add(skill.name));
    setProvenanceStatuses((current) => withoutMapKey(current, skill.name));
    setProvenanceErrors((current) => withoutMapKey(current, skill.name));
    try {
      const response = await remote.verifyProvenance({ schemaVersion: RPC_SCHEMA_VERSION, name: skill.name });
      if (!response.ok) {
        setProvenanceStatuses((current) => new Map(current).set(skill.name, "unavailable"));
        setProvenanceErrors((current) => new Map(current).set(skill.name, response.error.message));
        return "unavailable";
      }
      const status = response.data.verification.status;
      setProvenanceStatuses((current) => new Map(current).set(skill.name, status));
      setSkills((current) => upsertSkill(current, response.data.verification.skill));
      return status;
    } catch (error2) {
      if (panelMounted.current) {
        setProvenanceStatuses((current) => new Map(current).set(skill.name, "unavailable"));
        setProvenanceErrors((current) => new Map(current).set(skill.name, remoteErrorMessage(error2)));
      }
      return "unavailable";
    } finally {
      if (panelMounted.current) setProvenanceCheckingNames((current) => withoutValue(current, skill.name));
    }
  }
  async function matchProvenanceCandidates(candidates, onProgress) {
    const summary = {
      matched: 0,
      custom: 0,
      ambiguous: 0,
      ineligible: 0,
      unavailable: 0,
      failures: []
    };
    if (candidates.length === 0) return summary;
    if (remote.verifyProvenanceBatch) {
      let completed2 = 0;
      for (const batch of chunk(candidates, 20)) {
        const names = batch.map((skill) => skill.name);
        setProvenanceCheckingNames((current) => /* @__PURE__ */ new Set([...current, ...names]));
        setProvenanceErrors((current) => withoutMapKeys(current, names));
        try {
          const response = await remote.verifyProvenanceBatch({ schemaVersion: RPC_SCHEMA_VERSION, names });
          const batchFailures = response.ok ? [...response.data.failures ?? []] : names.map((name) => ({ name, code: response.error.code, message: response.error.message }));
          const verifications = response.ok ? response.data.results : [];
          const accountedNames = /* @__PURE__ */ new Set([
            ...verifications.map((verification) => verification.name),
            ...batchFailures.map((failure) => failure.name)
          ]);
          for (const name of names) {
            if (!accountedNames.has(name)) {
              batchFailures.push({
                name,
                code: "PROVENANCE_RESULT_MISSING",
                message: "Host \u672A\u8FD4\u56DE\u8BE5 Skill \u7684\u6765\u6E90\u6838\u9A8C\u7ED3\u679C\u3002"
              });
            }
          }
          setSkills((current) => verifications.reduce(
            (next, verification) => upsertSkill(next, verification.skill),
            current
          ));
          for (const verification of verifications) {
            incrementProvenanceSummary(summary, verification.status);
          }
          setProvenanceStatuses((current) => {
            let next = new Map(current);
            for (const verification of verifications) {
              next.set(verification.name, verification.status);
            }
            next = withStatuses(next, batchFailures.map((failure) => failure.name), "unavailable");
            return next;
          });
          setProvenanceErrors((current) => {
            const next = new Map(current);
            for (const failure of batchFailures) next.set(failure.name, failure.message);
            return next;
          });
          summary.unavailable += batchFailures.length;
          summary.failures.push(...batchFailures);
        } catch (error2) {
          const message = remoteErrorMessage(error2);
          const batchFailures = names.map((name) => ({
            name,
            code: "PROVENANCE_BATCH_UNAVAILABLE",
            message
          }));
          setProvenanceStatuses((current) => withStatuses(current, names, "unavailable"));
          setProvenanceErrors((current) => withMapValues(current, names, message));
          summary.unavailable += names.length;
          summary.failures.push(...batchFailures);
        } finally {
          completed2 += names.length;
          setProvenanceCheckingNames((current) => withoutValues(current, names));
          onProgress?.(completed2, candidates.length);
        }
      }
      return summary;
    }
    let completed = 0;
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < candidates.length) {
        const skill = candidates[nextIndex++];
        if (skill === void 0) return;
        const status = await verifySkillProvenance(skill);
        if (status === "unavailable") {
          summary.unavailable += 1;
          summary.failures.push({
            name: skill.name,
            code: "PROVENANCE_CHECK_FAILED",
            message: "GitHub \u6765\u6E90\u6838\u9A8C\u6682\u65F6\u4E0D\u53EF\u7528"
          });
        } else {
          incrementProvenanceSummary(summary, status);
        }
        completed += 1;
        onProgress?.(completed, candidates.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, () => worker()));
    return summary;
  }
  async function rematchAllProvenance() {
    if (rematchingAll || maintenanceRunning) return;
    const candidates = skills.filter((skill) => skill.source?.kind !== "github");
    if (candidates.length === 0) {
      setMaintenanceStatus("\u6CA1\u6709\u9700\u8981\u91CD\u65B0\u5339\u914D\u7684\u672C\u5730 Skill");
      return;
    }
    setRematchingAll(true);
    setError(null);
    setMaintenanceStatus(`\u6B63\u5728\u91CD\u65B0\u5339\u914D 0 / ${candidates.length}`);
    try {
      const summary = await matchProvenanceCandidates(candidates, (completed, total) => {
        setMaintenanceStatus(`\u6B63\u5728\u91CD\u65B0\u5339\u914D ${completed} / ${total}`);
      });
      setMaintenanceStatus(formatProvenanceSummary(summary));
      if (summary.failures.length > 0) {
        setError(`\u6765\u6E90\u5339\u914D\u90E8\u5206\u5931\u8D25\uFF1A${summary.failures.map((failure) => `${failure.name}\uFF1A${failure.message}`).join("\uFF1B")}`);
      }
    } finally {
      setRematchingAll(false);
    }
  }
  function toggleMaintenanceSetting(key, enabled) {
    setMaintenance((current) => {
      const next = { ...current, [key]: { ...current[key], enabled } };
      writeMaintenanceSettings(next);
      return next;
    });
  }
  async function runAutomatedMaintenance() {
    if (maintenanceRunActive.current) return;
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const shouldCheck = maintenance.autoCheck.enabled && maintenanceDue(maintenance.autoCheck.lastRunAt);
    const shouldUpdate = maintenance.autoUpdate.enabled && maintenanceDue(maintenance.autoUpdate.lastRunAt);
    if (!shouldCheck && !shouldUpdate) return;
    maintenanceRunActive.current = true;
    setMaintenanceRunning(true);
    setMaintenanceStatus("\u81EA\u52A8\u7EF4\u62A4\u6B63\u5728\u540E\u53F0\u8FD0\u884C");
    const next = structuredClone(maintenance);
    const failures = [];
    try {
      let freshChecks = [];
      let freshCheckSucceeded = false;
      if (shouldCheck || shouldUpdate) {
        const response = await remote.checkUpdates({ schemaVersion: RPC_SCHEMA_VERSION });
        if (response.ok) {
          freshChecks = response.data.checks;
          freshCheckSucceeded = true;
          setUpdateChecks(new Map(freshChecks.map((check) => [check.name, check])));
          if (shouldCheck) next.autoCheck.lastRunAt = startedAt;
        } else {
          failures.push(response.error.message);
        }
      }
      if (shouldUpdate && freshCheckSucceeded) {
        for (const check of freshChecks.filter((item) => item.status === "update-available")) {
          try {
            const response = await remote.update({ schemaVersion: RPC_SCHEMA_VERSION, name: check.name });
            if (response.ok) {
              setSkills((current) => upsertSkill(current, response.data.skill));
              setUpdateChecks((current) => setUpdateStatus(current, check.name, "up-to-date"));
            } else failures.push(`${check.name}\uFF1A${response.error.message}`);
          } catch (error2) {
            failures.push(`${check.name}\uFF1A${remoteErrorMessage(error2)}`);
          }
        }
        next.autoUpdate.lastRunAt = startedAt;
      }
      writeMaintenanceSettings(next);
      setMaintenance(next);
      setMaintenanceStatus(failures.length === 0 ? "\u81EA\u52A8\u7EF4\u62A4\u5DF2\u5B8C\u6210" : `\u81EA\u52A8\u7EF4\u62A4\u5B8C\u6210\uFF0C${failures.length} \u9879\u5931\u8D25`);
      if (failures.length > 0) setError(`\u81EA\u52A8\u7EF4\u62A4\u90E8\u5206\u5931\u8D25\uFF1A${failures.join("\uFF1B")}`);
    } catch (error2) {
      setMaintenanceStatus("\u81EA\u52A8\u7EF4\u62A4\u5931\u8D25\uFF0C\u5C06\u5728\u4E0B\u6B21\u8FDB\u5165\u65F6\u91CD\u8BD5");
      setError(remoteErrorMessage(error2));
    } finally {
      maintenanceRunActive.current = false;
      setMaintenanceRunning(false);
    }
  }
  (0, import_react.useEffect)(() => {
    if (loading || skills.length === 0 || maintenanceRunActive.current) return;
    const due = Object.keys(maintenance).some((key) => maintenance[key].enabled && maintenanceDue(maintenance[key].lastRunAt));
    if (due) void runAutomatedMaintenance();
  }, [loading, maintenance, skills]);
  function selectView(next) {
    setView(next);
    setError(null);
    if (next === "market") {
      setCreating(false);
      if (!marketHostChecked) void initializeMarketplace();
      else if (marketCapabilities?.features.marketplaceV2 && marketRepositories.length === 0) {
        void browseRepositories(true);
      }
    }
  }
  async function initializeMarketplace() {
    setMarketLoading(true);
    setError(null);
    try {
      if (!remote.getCapabilities) throw new Error("Missing Marketplace V2 capabilities.");
      const response = await remote.getCapabilities({ schemaVersion: RPC_SCHEMA_VERSION });
      setMarketHostChecked(true);
      if (!response.ok || response.data.capabilities.protocolVersion < 5 || !response.data.capabilities.features.marketplaceV2 || !response.data.capabilities.features.repositoryInspection || !response.data.capabilities.features.githubTrending || !response.data.capabilities.features.skillClassification || !response.data.capabilities.features.updateRiskGate || !response.data.capabilities.features.repositoryBatchAnalysis || !response.data.capabilities.features.repositoryBatchInstall) {
        setMarketCapabilities(response.ok ? response.data.capabilities : null);
        setError("Skill Manager Host \u7248\u672C\u8F83\u65E7\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
        return;
      }
      setMarketCapabilities(response.data.capabilities);
      await browseRepositories(true, "trend-monthly");
    } catch {
      setMarketHostChecked(true);
      setError("Skill Manager Host \u7248\u672C\u8F83\u65E7\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
    } finally {
      setMarketLoading(false);
    }
  }
  async function browseRepositories(reset, forcedSort) {
    if (!remote.browseRepositories) {
      setError("Skill Manager Host \u7248\u672C\u8F83\u65E7\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      return;
    }
    if (marketLoading && marketHostChecked) return;
    const sort = forcedSort ?? marketSort;
    const page = reset ? 1 : marketPage + 1;
    const requestId = ++marketRequestId.current;
    setMarketLoading(true);
    setError(null);
    try {
      const response = await remote.browseRepositories({
        schemaVersion: RPC_SCHEMA_VERSION,
        sort,
        page,
        limit: 20
      });
      if (requestId !== marketRequestId.current) return;
      if (response.ok) {
        setMarketRepositories((current) => reset ? response.data.result.repositories : mergeRepositories(current, response.data.result.repositories));
        setMarketSort(sort);
        setMarketPage(page);
        setMarketSearched(false);
        setMarketActiveQuery(null);
        setMarketTotal(response.data.result.total);
        setMarketHasMore(response.data.result.hasMore);
        setMarketDataUpdatedAt(response.data.result.dataUpdatedAt);
        setMarketSourceState(response.data.result.sourceState);
        setMarketSourceMessage(response.data.result.sourceMessage);
      } else {
        setError(response.error.message);
      }
    } catch (error2) {
      if (requestId === marketRequestId.current) setError(remoteErrorMessage(error2));
    } finally {
      if (requestId === marketRequestId.current) {
        setMarketLoading(false);
      }
    }
  }
  function changeMarketQuery(value) {
    setMarketQuery(value);
    if (value.trim().length === 0 && marketSearched) {
      setMarketRepositories([]);
      setMarketSearched(false);
      setMarketActiveQuery(null);
      setMarketCategory("all");
      setMarketTotal(0);
      setMarketHasMore(false);
      void browseRepositories(true, "trend-monthly");
    }
  }
  async function searchMarketplace(event) {
    event?.preventDefault();
    const query = marketQuery.trim();
    if (query.length < 2) return;
    setMarketCategory("all");
    await searchRepositoryQuery(query, true, "relevance");
  }
  async function searchRepositoryQuery(query, reset, forcedSort) {
    if (query.length < 2 || marketLoading) return;
    const requestId = ++marketRequestId.current;
    setMarketLoading(true);
    setError(null);
    try {
      if (!remote.searchRepositories) throw new Error("Skill Manager Host \u7248\u672C\u8F83\u65E7\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      const response = await remote.searchRepositories({
        schemaVersion: RPC_SCHEMA_VERSION,
        query,
        sort: forcedSort ?? marketSort,
        page: reset ? 1 : marketPage + 1,
        limit: 20
      });
      if (requestId !== marketRequestId.current) return;
      if (response.ok) {
        setMarketRepositories((current) => reset ? response.data.result.repositories : mergeRepositories(current, response.data.result.repositories));
        setMarketSort(response.data.result.sort);
        setMarketSearched(true);
        setMarketActiveQuery(query);
        setMarketPage(response.data.result.page);
        setMarketTotal(response.data.result.total);
        setMarketHasMore(response.data.result.hasMore);
        setMarketDataUpdatedAt(response.data.result.dataUpdatedAt);
        setMarketSourceState(response.data.result.sourceState);
        setMarketSourceMessage(response.data.result.sourceMessage);
      } else {
        setError(response.error.message);
      }
    } catch (error2) {
      if (requestId === marketRequestId.current) setError(remoteErrorMessage(error2));
    } finally {
      if (requestId === marketRequestId.current) setMarketLoading(false);
    }
  }
  async function searchNextRepositories() {
    if (marketActiveQuery !== null) await searchRepositoryQuery(marketActiveQuery, false);
  }
  async function selectMarketCategory(category) {
    setMarketCategory(category);
    setError(null);
    if (category === "all") {
      setMarketActiveQuery(null);
      await browseRepositories(true, marketSort);
      return;
    }
    if (isTrendingSort(marketSort)) {
      setMarketActiveQuery(null);
      setMarketSearched(false);
      return;
    }
    if (category === "general") {
      setMarketActiveQuery(null);
      setMarketSearched(false);
      return;
    }
    await searchRepositoryQuery(MARKET_CATEGORY_QUERIES[category], true, "relevance");
  }
  function openCreate() {
    setView("custom");
    setError(null);
    setCreating((value) => !value);
  }
  async function createSkill(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (name.length === 0 || description.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await remote.create({
        schemaVersion: RPC_SCHEMA_VERSION,
        name,
        description
      });
      if (response.ok) {
        setSkills((current) => upsertSkill(current, response.data.skill));
        setCreating(false);
      } else {
        setError(response.error.message);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setSubmitting(false);
    }
  }
  async function setEnabled(skill, enabled) {
    setBusyNames((current) => new Set(current).add(skill.name));
    setError(null);
    try {
      const response = await remote.setEnabled({
        schemaVersion: RPC_SCHEMA_VERSION,
        name: skill.name,
        enabled
      });
      if (response.ok) {
        setSkills((current) => upsertSkill(current, response.data.skill));
      } else {
        setError(response.error.message);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setBusyNames((current) => {
        const next = new Set(current);
        next.delete(skill.name);
        return next;
      });
    }
  }
  async function enableAllManagedSkills() {
    const disabled = skills.filter((skill) => !skill.enabledTargets.includes("dsh"));
    if (disabled.length === 0 || bulkEnabling) return;
    setBulkEnabling(true);
    setNotice(null);
    setError(null);
    setBusyNames((current) => /* @__PURE__ */ new Set([...current, ...disabled.map((skill) => skill.name)]));
    const failures = [];
    let enabledCount = 0;
    try {
      for (const skill of disabled) {
        try {
          const response = await remote.setEnabled({
            schemaVersion: RPC_SCHEMA_VERSION,
            name: skill.name,
            enabled: true
          });
          if (response.ok) {
            enabledCount += 1;
            setSkills((current) => upsertSkill(current, response.data.skill));
          } else {
            failures.push(`${skill.name}\uFF1A${response.error.message}`);
          }
        } catch (error2) {
          failures.push(`${skill.name}\uFF1A${remoteErrorMessage(error2)}`);
        }
      }
      setNotice(`\u6279\u91CF\u5F00\u542F\u5B8C\u6210\uFF1A\u6210\u529F ${enabledCount} \u9879\uFF0C\u5931\u8D25 ${failures.length} \u9879\u3002`);
      if (failures.length > 0) setError(`\u90E8\u5206\u5F00\u542F\u5931\u8D25\uFF1A${failures.join("\uFF1B")}`);
    } finally {
      const names = new Set(disabled.map((skill) => skill.name));
      setBusyNames((current) => new Set([...current].filter((name) => !names.has(name))));
      setBulkEnabling(false);
    }
  }
  function selectVisibleManagedSkills(selected) {
    setConfirmingBulkDelete(false);
    setSelectedManagedNames(new Set(selected ? visibleSkills.map((skill) => skill.name) : []));
  }
  async function runBulkManagedAction(action) {
    const selected = visibleSkills.filter((skill) => selectedManagedNames.has(skill.name));
    if (selected.length === 0 || bulkManagedAction !== null) return;
    if (action === "delete" && !confirmingBulkDelete) {
      setConfirmingBulkDelete(true);
      return;
    }
    if (action === "delete" && !remote.delete) {
      setError("\u5F53\u524D Host \u4E0D\u652F\u6301\u5220\u9664 Skill\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      return;
    }
    setBulkManagedAction(action);
    setConfirmingBulkDelete(false);
    setBusyNames((current) => /* @__PURE__ */ new Set([...current, ...selected.map((skill) => skill.name)]));
    const failures = [];
    let success = 0;
    try {
      for (const skill of selected) {
        try {
          if (action === "delete") {
            const response2 = await remote.delete({ schemaVersion: RPC_SCHEMA_VERSION, name: skill.name });
            if (!response2.ok) {
              failures.push(`${skill.name}\uFF1A${response2.error.message}`);
              continue;
            }
            success += 1;
            setSkills((current) => current.filter((candidate) => candidate.name !== skill.name));
            setProvenanceStatuses((current) => withoutMapKey(current, skill.name));
            setUpdateChecks((current) => withoutMapKey(current, skill.name));
            continue;
          }
          const response = await remote.setEnabled({
            schemaVersion: RPC_SCHEMA_VERSION,
            name: skill.name,
            enabled: action === "enable"
          });
          if (!response.ok) {
            failures.push(`${skill.name}\uFF1A${response.error.message}`);
            continue;
          }
          success += 1;
          setSkills((current) => upsertSkill(current, response.data.skill));
        } catch (error2) {
          failures.push(`${skill.name}\uFF1A${remoteErrorMessage(error2)}`);
        }
      }
      setSelectedManagedNames(/* @__PURE__ */ new Set());
      setNotice(`\u6279\u91CF${action === "enable" ? "\u5F00\u542F" : action === "disable" ? "\u5173\u95ED" : "\u5220\u9664"}\u5B8C\u6210\uFF1A\u6210\u529F ${success} \u9879\uFF0C\u5931\u8D25 ${failures.length} \u9879\u3002`);
      if (failures.length > 0) setError(`\u90E8\u5206\u64CD\u4F5C\u5931\u8D25\uFF1A${failures.join("\uFF1B")}`);
      if (action === "delete" && success > 0) await loadTrash();
    } finally {
      const names = new Set(selected.map((skill) => skill.name));
      setBusyNames((current) => new Set([...current].filter((name) => !names.has(name))));
      setBulkManagedAction(null);
    }
  }
  function openRepository(repository) {
    const requestId = ++inspectionRequestId.current;
    (0, import_react_dom.flushSync)(() => {
      setInspectionRepository(repository);
      setInspectionLoading(false);
      setInspectionError(null);
      setInspection(null);
      setInspectionAvatarUrl(null);
      setInspectionMedia([]);
      setSelectedInspectionMediaId(null);
      setRiskAssessments(/* @__PURE__ */ new Map());
      setInstallResults(/* @__PURE__ */ new Map());
      setConfirmHighRiskInstall(false);
    });
    inspectionMediaRequests.current.clear();
    inspectionMediaSelectionTouched.current = false;
    void loadCandidateMedia(repository, requestId);
    void inspectRepositoryContent(repository, requestId);
  }
  async function inspectOpenRepository() {
    const repository = inspectionRepository;
    if (repository === null || inspectionLoading) return;
    const requestId = ++inspectionRequestId.current;
    await inspectRepositoryContent(repository, requestId);
  }
  async function inspectRepositoryContent(repository, requestId) {
    setInspectionLoading(true);
    setInspectionError(null);
    try {
      if (!remote.inspectRepository) throw new Error("Skill Manager Host \u7248\u672C\u8F83\u65E7\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      const response = await remote.inspectRepository({
        schemaVersion: RPC_SCHEMA_VERSION,
        repository: { owner: repository.owner, name: repository.name }
      });
      if (requestId !== inspectionRequestId.current) return;
      if (response.ok) {
        const installedPaths = installedRepositorySkillPaths(skills, repository);
        setInspection(response.data.inspection);
        setSelectedSkillPaths(new Set(response.data.inspection.skills.filter((skill) => skill.installable && !installedPaths.has(skill.path)).map((skill) => skill.path)));
        setRiskAssessments(new Map(response.data.assessments.map((item) => [item.skillPath, item.assessment])));
        void loadInspectionMedia(response.data.inspection, requestId);
      } else {
        setInspectionError(response.error.message);
      }
    } catch (error2) {
      if (requestId === inspectionRequestId.current) setInspectionError(remoteErrorMessage(error2));
    } finally {
      if (requestId === inspectionRequestId.current) setInspectionLoading(false);
    }
  }
  function closeRepositoryDialog() {
    inspectionRequestId.current += 1;
    setInspectionRepository(null);
    setInspection(null);
    setInspectionError(null);
    setInspectionLoading(false);
    setInspectionAvatarUrl(null);
    setInspectionMedia([]);
    setSelectedInspectionMediaId(null);
    inspectionMediaRequests.current.clear();
    inspectionMediaSelectionTouched.current = false;
    setSelectedSkillPaths(/* @__PURE__ */ new Set());
    setRiskAssessments(/* @__PURE__ */ new Map());
    setInstallResults(/* @__PURE__ */ new Map());
    setConfirmHighRiskInstall(false);
  }
  async function assessInspectionRisks(target) {
    const assessor = remote.assessSkillRisk;
    if (!assessor) return;
    await Promise.all(target.skills.filter((skill) => skill.installable).map(async (skill) => {
      try {
        const response = await assessor({
          schemaVersion: RPC_SCHEMA_VERSION,
          repository: { owner: target.repository.owner, name: target.repository.name },
          skillPath: skill.path
        });
        const assessment = response.ok ? response.data.assessment : {
          risk: "unknown",
          findings: [],
          scannerVersion: "unavailable"
        };
        setRiskAssessments((current) => new Map(current).set(skill.path, assessment));
      } catch {
        setRiskAssessments((current) => new Map(current).set(skill.path, {
          risk: "unknown",
          findings: [],
          scannerVersion: "unavailable"
        }));
      }
    }));
  }
  function resolveInspectionMedia(source) {
    const resolver = remote.resolveMedia;
    if (!resolver || !marketCapabilities?.features.mediaProxy) return Promise.resolve(null);
    const id = mediaSourceId(source);
    const existing = inspectionMediaRequests.current.get(id);
    if (existing) return existing;
    const request = (async () => {
      try {
        const response = await resolver({ schemaVersion: RPC_SCHEMA_VERSION, source });
        return response.ok ? { id, asset: response.data.asset } : null;
      } catch {
        return null;
      }
    })();
    inspectionMediaRequests.current.set(id, request);
    return request;
  }
  async function loadInspectionMedia(target, requestId) {
    const sources = uniqueMediaSources(target.media).filter((source) => source.type === "repo-blob" || source.type === "github-social-preview").slice(0, MAX_INSPECTION_MEDIA);
    const resolved = (await mapConcurrent(sources, INSPECTION_MEDIA_CONCURRENCY, resolveInspectionMedia)).filter((media) => media !== null);
    if (requestId !== inspectionRequestId.current) return;
    setInspectionMedia((current) => mergeInspectionMedia(resolved, current));
    const preferred = resolved.find((media) => media.asset.source.type === "repo-blob") ?? resolved[0];
    if (preferred && !inspectionMediaSelectionTouched.current) {
      setSelectedInspectionMediaId(preferred.id);
    }
  }
  async function loadCandidateMedia(repository, requestId) {
    if (!remote.resolveMedia || !marketCapabilities?.features.mediaProxy) return;
    const [avatar, cover] = await Promise.all([
      resolveInspectionMedia(repository.ownerAvatar),
      resolveInspectionMedia({ type: "github-social-preview", repo: repository.repoKey })
    ]);
    if (requestId !== inspectionRequestId.current) return;
    if (avatar !== null) setInspectionAvatarUrl(avatar.asset.dataUrl);
    if (cover !== null) {
      setInspectionMedia((current) => mergeInspectionMedia([cover], current));
      setSelectedInspectionMediaId((current) => current ?? cover.id);
    }
  }
  function selectInspectionMedia(id) {
    inspectionMediaSelectionTouched.current = true;
    setSelectedInspectionMediaId(id);
  }
  function removeInspectionMedia(id) {
    setInspectionMedia((current) => current.filter((media) => media.id !== id));
    setSelectedInspectionMediaId((selected) => selected === id ? inspectionMedia.find((media) => media.id !== id)?.id ?? null : selected);
  }
  function toggleSelectedSkill(path, selected) {
    setConfirmHighRiskInstall(false);
    setSelectedSkillPaths((current) => {
      const next = new Set(current);
      if (selected) next.add(path);
      else next.delete(path);
      return next;
    });
  }
  async function installSelectedSkills() {
    if (inspection === null) return;
    if (!remote.installRepository) {
      setInspectionError("Skill Manager Host \u7248\u672C\u8F83\u65E7\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      return;
    }
    const selected = inspection.skills.filter((skill) => selectedSkillPaths.has(skill.path));
    if (selected.length === 0) return;
    const risksReady = selected.every((skill) => {
      const assessment = riskAssessments.get(skill.path);
      return assessment !== void 0 && assessment.risk !== "unknown";
    });
    if (!risksReady) {
      setInspectionError("\u6240\u9009 Skill \u7684\u5185\u5BB9\u98CE\u9669\u68C0\u67E5\u5C1A\u672A\u5B8C\u6210\uFF1B\u8BF7\u7B49\u5F85\u68C0\u67E5\u5B8C\u6210\u6216\u91CD\u8BD5\u4ED3\u5E93\u8BE6\u60C5\u3002");
      return;
    }
    const hasHighRisk = selected.some((skill) => riskAssessments.get(skill.path)?.risk === "high");
    if (hasHighRisk && !confirmHighRiskInstall) {
      setConfirmHighRiskInstall(true);
      return;
    }
    const acknowledgeHighRisk = hasHighRisk && confirmHighRiskInstall;
    setConfirmHighRiskInstall(false);
    setInspectionError(null);
    setInstallingSkillPaths(new Set(selected.map((skill) => skill.path)));
    const failures = [];
    try {
      const response = await remote.installRepository({
        schemaVersion: RPC_SCHEMA_VERSION,
        repository: { owner: inspection.repository.owner, name: inspection.repository.name },
        selection: { mode: "paths", paths: selected.map((skill) => skill.path) },
        ...acknowledgeHighRisk ? { acknowledgeHighRiskPaths: selected.filter((skill) => riskAssessments.get(skill.path)?.risk === "high").map((skill) => skill.path) } : {}
      });
      if (!response.ok) {
        setInspectionError(response.error.message);
        return;
      }
      for (const result of response.data.results) {
        if (result.status === "installed" && result.skill !== void 0) {
          setSkills((current) => upsertSkill(current, result.skill));
          setSelectedSkillPaths((current) => withoutValue(current, result.skillPath));
          setInstallResults((current) => new Map(current).set(result.skillPath, { ok: true, message: "\u5B89\u88C5\u6210\u529F" }));
        } else if (result.status !== "already-installed") {
          const message = result.error?.message ?? (result.status === "needs-confirmation" ? "\u9700\u8981\u786E\u8BA4\u9AD8\u98CE\u9669\u5185\u5BB9" : "\u5B89\u88C5\u5931\u8D25");
          failures.push(`${result.skillPath}\uFF1A${message}`);
          setInstallResults((current) => new Map(current).set(result.skillPath, { ok: false, message }));
        }
      }
    } catch (error2) {
      failures.push(remoteErrorMessage(error2));
    } finally {
      setInstallingSkillPaths(/* @__PURE__ */ new Set());
    }
    if (failures.length > 0) setInspectionError(`\u90E8\u5206\u5B89\u88C5\u5931\u8D25\uFF1A${failures.join("\uFF1B")}`);
  }
  async function installRepositoryAll(repository) {
    if (!remote.installRepository) {
      setError("Skill Manager Host \u7248\u672C\u8F83\u65E7\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      return;
    }
    setError(null);
    setNotice(`\u6B63\u5728\u540E\u53F0\u5B89\u88C5 ${repository.fullName} \u4E2D\u53EF\u5B89\u88C5\u7684 Skill...`);
    try {
      const response = await remote.installRepository({
        schemaVersion: RPC_SCHEMA_VERSION,
        repository: { owner: repository.owner, name: repository.name },
        selection: { mode: "all" }
      });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      const installed = response.data.results.filter((item) => item.status === "installed" && item.skill !== void 0);
      const highRisk = response.data.results.filter((item) => item.status === "needs-confirmation");
      for (const result of installed) setSkills((current) => upsertSkill(current, result.skill));
      setNotice(`${repository.fullName}\uFF1A\u5DF2\u5B89\u88C5 ${installed.length} \u4E2A Skill${highRisk.length > 0 ? `\uFF1B${highRisk.length} \u4E2A\u9AD8\u98CE\u9669\u9879\u7B49\u5F85\u786E\u8BA4` : ""}\u3002`);
      if (highRisk.length > 0) openRepository(repository);
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    }
  }
  async function checkSkillUpdate(skill) {
    setCheckingUpdateNames((current) => new Set(current).add(skill.name));
    setError(null);
    try {
      const response = await remote.checkUpdates({ schemaVersion: RPC_SCHEMA_VERSION, names: [skill.name] });
      if (response.ok) {
        setUpdateChecks((current) => {
          const next = new Map(current);
          for (const check of response.data.checks) next.set(check.name, check);
          return next;
        });
      } else {
        setError(response.error.message);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setCheckingUpdateNames((current) => withoutValue(current, skill.name));
    }
  }
  async function syncAllConfiguredTargets() {
    if (!remote.listTargetStates || !remote.setTargetEnabled) {
      setError("\u5F53\u524D Host \u4E0D\u652F\u6301 Skill \u540C\u6B65");
      return;
    }
    setSyncLoading(true);
    setError(null);
    setNotice(null);
    const failures = [];
    let linked = 0;
    try {
      const response = await remote.listTargetStates({ schemaVersion: RPC_SCHEMA_VERSION });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setTargetStates(response.data.states);
      for (const state of response.data.states.filter((candidate) => candidate.status === "not-linked")) {
        const key = `target:${state.target}:${state.name}`;
        setSyncBusyKeys((current) => new Set(current).add(key));
        try {
          const enabled = await remote.setTargetEnabled({
            schemaVersion: RPC_SCHEMA_VERSION,
            name: state.name,
            target: state.target,
            enabled: true
          });
          if (enabled.ok) {
            linked += 1;
            setSkills((current) => upsertSkill(current, enabled.data.skill));
            setTargetStates((current) => current.map((candidate) => candidate.name === state.name && candidate.target === state.target ? { ...candidate, status: "linked" } : candidate));
          } else failures.push(`${state.name} \u2192 ${targetLabel(state.target)}\uFF1A${enabled.error.message}`);
        } catch (error2) {
          failures.push(`${state.name} \u2192 ${targetLabel(state.target)}\uFF1A${remoteErrorMessage(error2)}`);
        } finally {
          setSyncBusyKeys((current) => withoutValue(current, key));
        }
      }
      const conflicts = response.data.states.filter((state) => state.status === "conflict").length;
      setNotice(`\u540C\u6B65\u5B8C\u6210\uFF1A\u65B0\u589E ${linked} \u4E2A\u94FE\u63A5\uFF0C\u8DF3\u8FC7 ${conflicts} \u4E2A\u51B2\u7A81\u3002`);
      if (failures.length > 0) setError(`\u90E8\u5206\u540C\u6B65\u5931\u8D25\uFF1A${failures.join("\uFF1B")}`);
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setSyncLoading(false);
    }
  }
  async function deleteSkill(skill) {
    if (confirmingDeleteName !== skill.name) {
      setConfirmingDeleteName(skill.name);
      return;
    }
    if (!remote.delete) {
      setError("\u5F53\u524D Host \u4E0D\u652F\u6301\u5220\u9664 Skill\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      return;
    }
    setDeletingNames((current) => new Set(current).add(skill.name));
    setError(null);
    setNotice(null);
    try {
      const response = await remote.delete({ schemaVersion: RPC_SCHEMA_VERSION, name: skill.name });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setSkills((current) => current.filter((candidate) => candidate.name !== skill.name));
      setProvenanceStatuses((current) => withoutMapKey(current, skill.name));
      setUpdateChecks((current) => withoutMapKey(current, skill.name));
      setExpandedBackupNames((current) => withoutValue(current, skill.name));
      setNotice(`\u5DF2\u5220\u9664 ${skill.name}\uFF0C\u5B8C\u6574\u5185\u5BB9\u5DF2\u79FB\u5165\u53EF\u6062\u590D\u5F52\u6863\u3002`);
      await loadTrash();
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setConfirmingDeleteName(null);
      setDeletingNames((current) => withoutValue(current, skill.name));
    }
  }
  async function restoreTrashedSkill(trashed) {
    if (!remote.restoreTrash) {
      setError("\u5F53\u524D Host \u4E0D\u652F\u6301\u6062\u590D Skill\uFF0C\u8BF7\u91CD\u542F DSH Desktop\u3002");
      return;
    }
    setRestoringTrashIds((current) => new Set(current).add(trashed.trashId));
    setError(null);
    try {
      const response = await remote.restoreTrash({
        schemaVersion: RPC_SCHEMA_VERSION,
        name: trashed.name,
        trashId: trashed.trashId
      });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setSkills((current) => upsertSkill(current, response.data.skill));
      setTrashedSkills((current) => current.filter((item) => item.trashId !== trashed.trashId));
      setNotice(`\u5DF2\u6062\u590D ${trashed.name}\uFF0C\u5E76\u6062\u590D\u539F\u5148\u542F\u7528\u7684\u5DE5\u5177\u94FE\u63A5\u3002`);
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setRestoringTrashIds((current) => withoutValue(current, trashed.trashId));
    }
  }
  async function updateSkill(skill, acknowledgeHighRisk = false) {
    setUpdatingNames((current) => new Set(current).add(skill.name));
    setError(null);
    try {
      const response = await remote.update({
        schemaVersion: RPC_SCHEMA_VERSION,
        name: skill.name,
        ...acknowledgeHighRisk ? { acknowledgeHighRisk: true } : {}
      });
      if (response.ok) {
        setSkills((current) => upsertSkill(current, response.data.skill));
        setUpdateChecks((current) => {
          const next = new Map(current);
          const previous = next.get(skill.name);
          if (previous) {
            next.set(skill.name, {
              ...previous,
              status: "up-to-date",
              installed: previous.latest,
              latest: previous.latest
            });
          }
          return next;
        });
        setBackupsByName((current) => prependBackup(current, response.data.backup));
        setConfirmingRiskUpdateName(null);
      } else {
        if (response.error.code === "SKILL_LOCAL_MODIFIED") {
          setUpdateChecks((current) => setUpdateStatus(current, skill.name, "local-modified"));
        }
        if (response.error.code === "SKILL_UPDATE_RISK_CONFIRMATION_REQUIRED") {
          setConfirmingRiskUpdateName(skill.name);
        }
        setError(response.error.message);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setUpdatingNames((current) => withoutValue(current, skill.name));
    }
  }
  async function loadBackups(name) {
    setLoadingBackupNames((current) => new Set(current).add(name));
    setError(null);
    try {
      const response = await remote.listBackups({
        schemaVersion: RPC_SCHEMA_VERSION,
        name
      });
      if (response.ok) {
        setBackupsByName((current) => new Map(current).set(name, response.data.backups));
        return true;
      }
      setError(response.error.message);
      return false;
    } catch (error2) {
      setError(remoteErrorMessage(error2));
      return false;
    } finally {
      setLoadingBackupNames((current) => withoutValue(current, name));
    }
  }
  async function toggleBackups(name) {
    if (expandedBackupNames.has(name)) {
      setExpandedBackupNames((current) => withoutValue(current, name));
      setConfirmingBackupId(null);
      return;
    }
    setExpandedBackupNames((current) => new Set(current).add(name));
    if (!await loadBackups(name)) {
      setExpandedBackupNames((current) => withoutValue(current, name));
    }
  }
  async function rollbackSkill(skill, backup) {
    if (confirmingBackupId !== backup.id) {
      setConfirmingBackupId(backup.id);
      return;
    }
    setRollingBackIds((current) => new Set(current).add(backup.id));
    setError(null);
    try {
      const response = await remote.rollback({
        schemaVersion: RPC_SCHEMA_VERSION,
        name: skill.name,
        backupId: backup.id
      });
      if (response.ok) {
        setSkills((current) => upsertSkill(current, response.data.skill));
        setUpdateChecks((current) => {
          const next = new Map(current);
          next.delete(skill.name);
          return next;
        });
        await loadBackups(skill.name);
      } else {
        if (response.error.code === "SKILL_LOCAL_MODIFIED") {
          setUpdateChecks((current) => setUpdateStatus(current, skill.name, "local-modified"));
        }
        setError(response.error.message);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setConfirmingBackupId(null);
      setRollingBackIds((current) => withoutValue(current, backup.id));
    }
  }
  async function scanExternalSkills() {
    if (!remote.discoverExternal || !remote.listTargetStates) {
      setError("\u5F53\u524D Host \u4E0D\u652F\u6301 Skill \u540C\u6B65");
      return;
    }
    setSyncLoading(true);
    setError(null);
    try {
      const [discovery, states] = await Promise.all([
        remote.discoverExternal({ schemaVersion: RPC_SCHEMA_VERSION }),
        remote.listTargetStates({ schemaVersion: RPC_SCHEMA_VERSION })
      ]);
      if (!discovery.ok) setError(discovery.error.message);
      else if (!states.ok) setError(states.error.message);
      else {
        setExternalCandidates(discovery.data.candidates);
        setSelectedExternalKeys(new Set(discovery.data.candidates.filter((candidate) => !skills.some((skill) => skill.name === candidate.name)).map(externalCandidateKey)));
        setTargetStates(states.data.states);
        setSyncScanned(true);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setSyncLoading(false);
    }
  }
  async function importExternal(candidate) {
    if (!remote.importExternal) return;
    const key = `import:${candidate.target}:${candidate.name}`;
    setSyncBusyKeys((current) => new Set(current).add(key));
    setError(null);
    try {
      const response = await remote.importExternal({ schemaVersion: RPC_SCHEMA_VERSION, target: candidate.target, name: candidate.name });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setSkills((current) => upsertSkill(current, response.data.skill));
      setSelectedExternalKeys((current) => withoutValue(current, externalCandidateKey(candidate)));
      if (remote.listTargetStates) {
        const states = await remote.listTargetStates({ schemaVersion: RPC_SCHEMA_VERSION, names: [response.data.skill.name] });
        if (!states.ok) setError(states.error.message);
        else setTargetStates((current) => [
          ...current.filter((state) => state.name !== response.data.skill.name),
          ...states.data.states
        ]);
      }
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setSyncBusyKeys((current) => withoutValue(current, key));
    }
  }
  function toggleExternalSelection(candidate, selected) {
    const key = externalCandidateKey(candidate);
    setSelectedExternalKeys((current) => {
      const next = new Set(current);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  function selectVisibleExternal(selected) {
    setSelectedExternalKeys((current) => {
      const next = new Set(current);
      for (const candidate of visibleExternalCandidates) {
        const installed = skills.some((skill) => skill.name === candidate.name);
        if (selected && !installed) next.add(externalCandidateKey(candidate));
        else next.delete(externalCandidateKey(candidate));
      }
      return next;
    });
  }
  async function importSelectedExternal() {
    if (!remote.importExternal) return;
    const candidates = uniqueCandidatesByName(visibleExternalCandidates.filter((candidate) => selectedExternalKeys.has(externalCandidateKey(candidate)) && !skills.some((skill) => skill.name === candidate.name)));
    if (candidates.length === 0) return;
    await importExternalBatch(candidates);
  }
  async function importAllVisibleExternal() {
    const candidates = uniqueCandidatesByName(visibleExternalCandidates.filter((candidate) => !skills.some((skill) => skill.name === candidate.name)));
    if (candidates.length === 0) return;
    await importExternalBatch(candidates);
  }
  async function importExternalBatch(candidates) {
    if (!remote.importExternal) return;
    setSyncLoading(true);
    setError(null);
    const imported = [];
    const failures = [];
    for (const candidate of candidates) {
      const key = `import:${externalCandidateKey(candidate)}`;
      setSyncBusyKeys((current) => new Set(current).add(key));
      try {
        const response = await remote.importExternal({
          schemaVersion: RPC_SCHEMA_VERSION,
          target: candidate.target,
          name: candidate.name
        });
        if (response.ok) {
          imported.push(response.data.skill);
          setSkills((current) => upsertSkill(current, response.data.skill));
          setSelectedExternalKeys((current) => withoutValue(current, externalCandidateKey(candidate)));
        } else failures.push(`${candidate.name}\uFF1A${response.error.message}`);
      } catch (error2) {
        failures.push(`${candidate.name}\uFF1A${remoteErrorMessage(error2)}`);
      } finally {
        setSyncBusyKeys((current) => withoutValue(current, key));
      }
    }
    if (imported.length > 0 && remote.listTargetStates) {
      const states = await remote.listTargetStates({
        schemaVersion: RPC_SCHEMA_VERSION,
        names: imported.map((skill) => skill.name)
      });
      if (states.ok) setTargetStates((current) => [
        ...current.filter((state) => !imported.some((skill) => skill.name === state.name)),
        ...states.data.states
      ]);
      else failures.push(`\u540C\u6B65\u72B6\u6001\uFF1A${states.error.message}`);
    }
    if (failures.length > 0) setError(`\u90E8\u5206\u5BFC\u5165\u5931\u8D25\uFF1A${failures.join("\uFF1B")}`);
    setSyncLoading(false);
  }
  async function setExternalEnabled(skill, state, enabled) {
    if (!remote.setTargetEnabled) return;
    const key = `target:${state.target}:${skill.name}`;
    setSyncBusyKeys((current) => new Set(current).add(key));
    setError(null);
    try {
      const response = await remote.setTargetEnabled({ schemaVersion: RPC_SCHEMA_VERSION, name: skill.name, target: state.target, enabled });
      if (response.ok) {
        setSkills((current) => upsertSkill(current, response.data.skill));
        setTargetStates((current) => current.map((candidate) => candidate.name === state.name && candidate.target === state.target ? { ...candidate, status: enabled ? "linked" : "not-linked" } : candidate));
      } else setError(response.error.message);
    } catch (error2) {
      setError(remoteErrorMessage(error2));
    } finally {
      setSyncBusyKeys((current) => withoutValue(current, key));
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsm-panel", "aria-labelledby": "dsm-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-primary-tabs", role: "tablist", "aria-label": "Skill \u529F\u80FD", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "tab", "aria-selected": view !== "market", onClick: () => selectView("all"), children: "Skill \u7BA1\u7406" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "tab", "aria-selected": view === "market", onClick: () => selectView("market"), children: "Skill \u5E02\u573A" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "dsm-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-title-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { id: "dsm-title", children: view === "market" ? marketplaceTitle(marketSearched, marketSort) : "Skill \u7BA1\u7406" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-count", "aria-label": `${visibleCount} \u4E2A Skill`, children: visibleCount })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-toolbar", children: [
        view === "sync" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsm-update-check", type: "button", "aria-label": "\u626B\u63CF\u672C\u673A Skill", disabled: syncLoading, onClick: () => void scanExternalSkills(), children: syncLoading ? "\u626B\u63CF\u4E2D" : "\u626B\u63CF\u672C\u673A Skill" }) : view === "market" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { className: "dsm-market-search", onSubmit: (event) => void searchMarketplace(event), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-search", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-sr-only", children: "\u641C\u7D22 GitHub Skill \u4ED3\u5E93" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "search",
                value: marketQuery,
                onChange: (event) => changeMarketQuery(event.currentTarget.value),
                placeholder: "\u641C\u7D22 GitHub Skill \u4ED3\u5E93"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "dsm-icon-button",
              type: "submit",
              "aria-label": "\u641C\u7D22\u5E02\u573A",
              title: "\u641C\u7D22\u5E02\u573A",
              disabled: marketLoading || marketQuery.trim().length < 2,
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconSearchOutline16, { "aria-hidden": "true" })
            }
          )
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-search", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconSearchOutline16, { "aria-hidden": "true" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-sr-only", children: "\u641C\u7D22 Skill" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "search",
                value: localQuery,
                onChange: (event) => setLocalQuery(event.currentTarget.value),
                placeholder: "\u641C\u7D22\u672C\u673A Skill"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "dsm-update-check",
              type: "button",
              "aria-label": "\u540C\u6B65\u5230\u5176\u4ED6\u5DE5\u5177",
              title: "\u4E3A Codex\u3001Claude Code\u3001Agents \u548C OpenCode \u521B\u5EFA\u7531 Skill Manager \u7BA1\u7406\u7684\u5355 Skill \u94FE\u63A5\uFF1B\u4E0D\u4F1A\u590D\u5236 AGENTS.md \u6216 CLAUDE.md",
              disabled: syncLoading || loading || skills.length === 0,
              onClick: () => void syncAllConfiguredTargets(),
              children: syncLoading ? "\u540C\u6B65\u4E2D" : "\u540C\u6B65\u5230\u5176\u4ED6\u5DE5\u5177"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "dsm-icon-button",
            type: "button",
            "aria-label": view === "market" ? "\u5237\u65B0\u5E02\u573A\u7ED3\u679C" : view === "sync" ? "\u91CD\u65B0\u626B\u63CF\u672C\u673A Skill" : "\u5237\u65B0 Skill",
            title: view === "market" ? "\u5237\u65B0\u5E02\u573A\u7ED3\u679C" : view === "sync" ? "\u91CD\u65B0\u626B\u63CF\u672C\u673A Skill" : "\u5237\u65B0 Skill",
            disabled: view === "market" ? marketLoading || marketSearched && marketActiveQuery === null : view === "sync" ? syncLoading : loading,
            onClick: () => view === "market" ? marketActiveQuery !== null ? void searchRepositoryQuery(marketActiveQuery, true) : void browseRepositories(true) : view === "sync" ? void scanExternalSkills() : void loadSkills(),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRefreshOutline16, { "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "dsm-icon-button dsm-icon-button-primary",
            type: "button",
            "aria-label": "\u65B0\u5EFA Skill",
            title: "\u65B0\u5EFA Skill",
            "aria-expanded": creating,
            onClick: openCreate,
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutline16, { "aria-hidden": "true" })
          }
        )
      ] })
    ] }),
    view !== "market" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-tabs", role: "tablist", "aria-label": "\u672C\u673A Skill \u5206\u7C7B", children: LOCAL_SKILL_VIEWS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": view === item.id,
        onClick: () => selectView(item.id),
        children: item.label
      },
      item.id
    )) }) : null,
    view === "all" || view === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-local-tools", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsm-maintenance", "aria-labelledby": "dsm-maintenance-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-utility-heading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "dsm-maintenance-title", children: "\u81EA\u52A8\u7EF4\u62A4" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: maintenanceRunning ? "\u540E\u53F0\u8FD0\u884C\u4E2D\uFF1B\u6BCF\u9879\u6700\u591A 24 \u5C0F\u65F6\u4E00\u6B21" : maintenanceStatus ?? "\u9ED8\u8BA4\u5173\u95ED\uFF0C\u52FE\u9009\u540E\u8FDB\u5165\u672C\u673A\u7BA1\u7406\u65F6\u540E\u53F0\u8FD0\u884C" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-utility-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "dsm-row-button",
              type: "button",
              "aria-label": "\u4E00\u952E\u5F00\u542F\u5168\u90E8 Skill",
              disabled: loading || bulkEnabling || skills.every((skill) => skill.enabledTargets.includes("dsh")),
              onClick: () => void enableAllManagedSkills(),
              children: bulkEnabling ? "\u5F00\u542F\u4E2D" : "\u4E00\u952E\u5F00\u542F\u5168\u90E8"
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-maintenance-options", children: MAINTENANCE_OPTIONS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: maintenance[option.key].enabled,
              onChange: (event) => toggleMaintenanceSetting(option.key, event.currentTarget.checked)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: option.label }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: option.description })
          ] })
        ] }, option.key)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsm-trash", "aria-labelledby": "dsm-trash-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            className: "dsm-trash-toggle",
            type: "button",
            "aria-expanded": trashExpanded,
            onClick: () => setTrashExpanded((current) => !current),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { id: "dsm-trash-title", children: "\u6700\u8FD1\u5220\u9664" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "\u5B8C\u6574\u5F52\u6863\u4FDD\u7559 30 \u5929\uFF0C\u5230\u671F\u540E\u81EA\u52A8\u6E05\u7406" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: trashLoading ? "\u52A0\u8F7D\u4E2D" : `${trashedSkills.length} \u9879` })
            ]
          }
        ),
        trashExpanded ? trashedSkills.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-trash-empty", children: "\u6700\u8FD1 30 \u5929\u6CA1\u6709\u53EF\u6062\u590D\u7684 Skill\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: trashedSkills.map((trashed) => {
          const restoring = restoringTrashIds.has(trashed.trashId);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: trashed.name }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: trashed.description }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("time", { children: [
                "\u5230\u671F ",
                formatTrashExpiry(trashed.expiresAt)
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: restoring, onClick: () => void restoreTrashedSkill(trashed), children: restoring ? "\u6062\u590D\u4E2D" : "\u6062\u590D" })
          ] }, trashed.trashId);
        }) }) : null
      ] })
    ] }) : null,
    view === "market" && marketCapabilities?.features.marketplaceV2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-controls", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-source-bar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-source-filters", role: "group", "aria-label": "\u5E02\u573A\u6392\u5E8F", children: MARKET_SORT_OPTIONS.map((sort) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "aria-pressed": marketSort === sort.id,
            onClick: () => {
              setMarketSort(sort.id);
              if (isTrendingSort(sort.id)) {
                setMarketQuery("");
                setMarketActiveQuery(null);
                setMarketSearched(false);
                setMarketCategory("all");
                void browseRepositories(true, sort.id);
              } else if (marketActiveQuery !== null) {
                void searchRepositoryQuery(marketActiveQuery, true, sort.id);
              } else {
                void browseRepositories(true, sort.id);
              }
            },
            children: sort.label
          },
          sort.id
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-source-warning", children: "GitHub \u5143\u6570\u636E\u5019\u9009 \xB7 \u5217\u8868\u9636\u6BB5\u4E0D\u8BFB\u53D6 README \u6216 Tree" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-category-bar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-source-filters", role: "group", "aria-label": "GitHub Skill \u5206\u7C7B", children: MARKET_CATEGORY_OPTIONS.map((category) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "aria-pressed": marketCategory === category.id,
            disabled: marketLoading,
            onClick: () => void selectMarketCategory(category.id),
            children: category.label
          },
          category.id
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-source-warning", children: "\u9009\u62E9\u5206\u7C7B\u4F1A\u91CD\u65B0\u641C\u7D22 GitHub \u5019\u9009\uFF0C\u5B89\u88C5\u524D\u4ECD\u4F1A\u9A8C\u8BC1 SKILL.md" })
      ] })
    ] }) : null,
    creating ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { className: "dsm-create", onSubmit: (event) => void createSkill(event), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-field-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Skill \u540D\u79F0" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              name: "name",
              autoComplete: "off",
              pattern: "[a-z0-9]+(?:-[a-z0-9]+)*",
              placeholder: "example-skill",
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u7B80\u8981\u8BF4\u660E" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              name: "description",
              autoComplete: "off",
              placeholder: "\u4E00\u53E5\u8BDD\u8BF4\u660E\u7528\u9014",
              required: true
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-create-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "dsm-icon-button",
            type: "button",
            "aria-label": "\u53D6\u6D88\u65B0\u5EFA",
            title: "\u53D6\u6D88",
            onClick: () => setCreating(false),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutline16, { "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsm-command-button", type: "submit", disabled: submitting, children: submitting ? "\u521B\u5EFA\u4E2D" : "\u521B\u5EFA" })
      ] })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-status", "aria-live": "polite", children: [
      notice ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-notice", role: "status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: notice }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "dsm-notice-dismiss",
            type: "button",
            "aria-label": "\u5173\u95ED\u63D0\u793A",
            title: "\u5173\u95ED",
            onClick: () => setNotice(null),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutline16, { "aria-hidden": "true" })
          }
        )
      ] }) : null,
      error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-error", children: error }) : null
    ] }),
    view === "sync" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-sync", children: !syncScanned ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-empty", children: "\u626B\u63CF\u540E\u53EF\u9009\u62E9\u5BFC\u5165\u6216\u540C\u6B65\uFF0C\u4E0D\u4F1A\u8BFB\u53D6 Skill \u6B63\u6587\u6216\u76F8\u90BB Agent \u6587\u4EF6\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "aria-labelledby": "dsm-external-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-sync-section-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "dsm-external-title", children: "\u4ECE\u5176\u4ED6\u5DE5\u5177\u5BFC\u5165" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u626B\u63CF\u6765\u6E90\u4EC5\u8868\u793A\u53D1\u73B0\u4F4D\u7F6E\uFF1B\u6CA1\u6709\u53EF\u9760\u4E0A\u6E38\u8BC1\u636E\u7684 Skill \u5BFC\u5165\u540E\u5F52\u5165\u201C\u81EA\u8BBE\u201D\u3002" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-bulk-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: syncLoading || importableCandidateCount(visibleExternalCandidates, skills) === 0, onClick: () => void importAllVisibleExternal(), children: "\u4E00\u952E\u5BFC\u5165\u5F53\u524D\u6765\u6E90\u5168\u90E8" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => selectVisibleExternal(true), children: "\u5168\u9009\u5F53\u524D\u6765\u6E90" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => selectVisibleExternal(false), children: "\u53D6\u6D88\u5168\u9009" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsm-bulk-primary", disabled: syncLoading || selectedVisibleCount(visibleExternalCandidates, selectedExternalKeys, skills) === 0, onClick: () => void importSelectedExternal(), children: syncLoading ? "\u5BFC\u5165\u4E2D" : `\u5BFC\u5165\u6240\u9009 (${selectedVisibleCount(visibleExternalCandidates, selectedExternalKeys, skills)})` })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-source-filters dsm-sync-source-filters", role: "group", "aria-label": "\u626B\u63CF\u6765\u6E90", children: EXTERNAL_SOURCE_FILTERS.map((source) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-pressed": syncSource === source.id, onClick: () => setSyncSource(source.id), children: source.label }, source.id)) }),
        visibleExternalCandidates.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-empty", children: "\u5F53\u524D\u6765\u6E90\u672A\u53D1\u73B0\u5916\u90E8 Skill" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-list", "aria-label": "\u5916\u90E8 Skill \u5217\u8868", children: visibleExternalCandidates.map((candidate) => {
          const installed = skills.some((skill) => skill.name === candidate.name);
          const busy = syncBusyKeys.has(`import:${candidate.target}:${candidate.name}`);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: "dsm-row dsm-sync-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsm-select", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", "aria-label": `\u9009\u62E9 ${targetLabel(candidate.target)} \u7684 ${candidate.name}`, checked: !installed && selectedExternalKeys.has(externalCandidateKey(candidate)), disabled: installed || busy || syncLoading, onChange: (event) => toggleExternalSelection(candidate, event.currentTarget.checked) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-copy", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-heading", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: candidate.name }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: targetLabel(candidate.target) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { title: candidate.description, children: candidate.description })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsm-row-button", type: "button", disabled: installed || busy, "aria-label": `\u5BFC\u5165 ${candidate.name}`, onClick: () => void importExternal(candidate), children: installed ? "\u5DF2\u5BFC\u5165" : busy ? "\u5BFC\u5165\u4E2D" : "\u5BFC\u5165" })
          ] }, `${candidate.target}:${candidate.name}`);
        }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "aria-labelledby": "dsm-target-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "dsm-target-title", children: "\u540C\u6B65\u5230\u5176\u4ED6 Agent" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-list", "aria-label": "\u540C\u6B65\u76EE\u6807\u5217\u8868", children: skills.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: "dsm-sync-managed", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-skill-icon", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillFileIcon, {}) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-copy", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: skill.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { title: skill.description, children: skill.description })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-targets", children: targetStates.filter((state) => state.name === skill.name).map((state) => {
            const busy = syncBusyKeys.has(`target:${state.target}:${skill.name}`);
            const disabled = busy || state.status === "conflict" || state.status === "not-configured";
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-target-toggle", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: targetLabel(state.target) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: targetStatusLabel(state) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-switch", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", "aria-label": `\u540C\u6B65 ${skill.name} \u5230 ${targetLabel(state.target)}`, checked: state.status === "linked", disabled, onChange: (event) => void setExternalEnabled(skill, state, event.currentTarget.checked) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-switch-track", "aria-hidden": "true" })
              ] })
            ] }, state.target);
          }) })
        ] }, skill.name)) })
      ] })
    ] }) }) : view === "market" ? !marketHostChecked && marketLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-empty", children: "\u6B63\u5728\u68C0\u67E5 Skill Manager Host \u80FD\u529B..." }) : marketHostChecked && (!marketCapabilities?.features.marketplaceV2 || marketCapabilities.protocolVersion < 5 || !marketCapabilities.features.githubTrending || !marketCapabilities.features.skillClassification || !marketCapabilities.features.repositoryBatchAnalysis || !marketCapabilities.features.repositoryBatchInstall) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillFileIcon, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Skill Manager Host \u7248\u672C\u8F83\u65E7" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u8BF7\u91CD\u542F DSH Desktop\uFF0C\u8BA9 Host \u548C\u5BA2\u6237\u7AEF\u52A0\u8F7D\u540C\u4E00\u7248 Marketplace V2\u3002" })
    ] }) : marketLoading && marketRepositories.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-empty", children: marketSearched ? "\u6B63\u5728\u641C\u7D22\u4ED3\u5E93..." : isTrendingSort(marketSort) ? "\u6B63\u5728\u52A0\u8F7D GitHub \u8FD1\u671F\u70ED\u5EA6..." : marketSort === "latest" ? "\u6B63\u5728\u52A0\u8F7D\u6700\u8FD1\u521B\u5EFA\u7684\u4ED3\u5E93..." : "\u6B63\u5728\u52A0\u8F7D\u5386\u53F2\u70ED\u95E8\u4ED3\u5E93..." }) : marketSourceState === "unavailable" && marketRepositories.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillFileIcon, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "GitHub Trending \u6682\u65F6\u4E0D\u53EF\u7528" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: marketSourceMessage ?? "\u8D8B\u52BF\u7F51\u9875\u672A\u80FD\u52A0\u8F7D\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF1B\u4E0D\u4F1A\u7528\u6700\u8FD1\u66F4\u65B0\u65F6\u95F4\u4EE3\u66FF\u8D8B\u52BF\u3002" })
    ] }) : visibleMarketRepositories.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillFileIcon, {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: marketSearched ? marketCategory === "all" ? "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u4ED3\u5E93" : "\u8BE5\u5206\u7C7B\u6682\u672A\u641C\u5230 Skill \u4ED3\u5E93" : marketCategory === "all" ? "\u5F53\u524D\u699C\u5355\u6CA1\u6709\u53EF\u8BC6\u522B\u7684 Skill \u5019\u9009" : "\u5F53\u524D\u8D8B\u52BF\u699C\u6CA1\u6709\u8BE5\u5206\u7C7B\u5019\u9009" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: marketSearched ? marketCategory === "all" ? "GitHub \u641C\u7D22\u6CA1\u6709\u8FD4\u56DE\u5019\u9009\uFF0C\u53EF\u4EE5\u66F4\u6362\u5173\u952E\u8BCD\u6216\u6392\u5E8F\u540E\u91CD\u8BD5\u3002" : "\u5DF2\u5B8C\u6210\u8BE5\u5206\u7C7B\u7684 GitHub \u8FDC\u7A0B\u641C\u7D22\uFF1B\u53EF\u5207\u6362\u5206\u7C7B\u6216\u7A0D\u540E\u91CD\u8BD5\u3002" : marketSourceMessage ?? "GitHub Trending \u53EA\u5C55\u793A\u5168\u7AD9\u699C\u5355\u4E2D\u51FA\u73B0\u7684 Skill \u5019\u9009\uFF1B\u5B89\u88C5\u524D\u4ECD\u4F1A\u9A8C\u8BC1 SKILL.md\u3002" })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-ranking", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: marketSearched ? "GitHub \u4ED3\u5E93\u641C\u7D22\u7ED3\u679C" : isTrendingSort(marketSort) ? "GitHub \u8FD1\u671F\u70ED\u5EA6 Skill \u5019\u9009" : marketSort === "latest" ? "\u6700\u8FD1 60 \u5929\u521B\u5EFA\u7684 GitHub Skill \u4ED3\u5E93" : marketSort === "popular" ? "\u5386\u53F2\u70ED\u95E8 GitHub Skill \u4ED3\u5E93" : "GitHub \u4ED3\u5E93\u7ED3\u679C" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u672C\u6B21\u663E\u793A ",
          visibleMarketRepositories.length,
          " \xB7 GitHub \u5019\u9009 ",
          marketRepositories.length,
          " / ",
          marketTotal,
          marketDataUpdatedAt ? ` \xB7 ${formatRelativeDate(marketDataUpdatedAt)}` : "",
          marketSourceState === "cached" ? " \xB7 \u7F13\u5B58\u6570\u636E" : ""
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-list", "aria-label": marketSearched ? "\u4ED3\u5E93\u641C\u7D22\u7ED3\u679C" : "GitHub Skill \u4ED3\u5E93\u5217\u8868", children: visibleMarketRepositories.map((repository) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: "dsm-market-row dsm-repository-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            className: "dsm-repository-open",
            type: "button",
            "aria-label": `\u67E5\u770B ${repository.fullName} \u5B89\u88C5\u8BE6\u60C5`,
            onClick: () => void openRepository(repository),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-repository-avatar", "aria-hidden": "true", children: repository.owner.slice(0, 1).toLocaleUpperCase() }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-copy", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-heading", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: repository.fullName }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    repository.ownerType === "Organization" ? "\u7EC4\u7EC7" : "\u53D1\u5E03\u8005",
                    " ",
                    repository.owner
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "dsm-repository-description", title: repository.description ?? void 0, children: [
                  repository.description ?? "\u4ED3\u5E93\u672A\u63D0\u4F9B\u7B80\u4ECB",
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "tooltip", children: repository.description ?? "\u4ED3\u5E93\u672A\u63D0\u4F9B\u7B80\u4ECB" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-tags", "aria-label": `${repository.fullName} Topics`, children: [
                  [...repository.formatTopics, ...repository.categoryTopics].slice(0, 5).map((topic) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: topic }, topic)),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: classificationLabel(repository.classification.primaryCategory) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-meta", children: [
                  repository.stars > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    "\u2605 ",
                    formatMetric(repository.stars)
                  ] }) : null,
                  repository.repositoryId > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    formatMetric(repository.forks),
                    " forks"
                  ] }) : null,
                  repository.repositoryId > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    "\u521B\u5EFA ",
                    formatRelativeDate(repository.createdAt)
                  ] }) : null,
                  repository.trend?.weeklyStars !== null && repository.trend?.weeklyStars !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    "\u672C\u5468 +",
                    formatMetric(repository.trend.weeklyStars)
                  ] }) : null,
                  repository.trend?.monthlyStars !== null && repository.trend?.monthlyStars !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    "\u672C\u6708 +",
                    formatMetric(repository.trend.monthlyStars)
                  ] }) : null,
                  repository.trend ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "GitHub Trending" }) : null,
                  repository.repositoryId > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    "\u9ED8\u8BA4\u5206\u652F ",
                    repository.defaultBranch
                  ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Trending \u6458\u8981\u5143\u6570\u636E" }),
                  repository.discovery.signals.map((signal) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: signal.label }, `${signal.kind}:${signal.label}`))
                ] })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-actions", children: [
          repositoryInstallCount(skills, repository) > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-installed-badge", children: [
            "\u5DF2\u5B89\u88C5 ",
            repositoryInstallCount(skills, repository)
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "dsm-market-install",
              type: "button",
              "aria-label": `\u5B89\u88C5 ${repository.fullName}`,
              onClick: (event) => {
                event.stopPropagation();
                void installRepositoryAll(repository);
              },
              children: "\u5B89\u88C5"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "a",
            {
              className: "dsm-source-link",
              href: repository.url,
              target: "_blank",
              rel: "noreferrer",
              "aria-label": `\u5728 GitHub \u67E5\u770B ${repository.fullName}`,
              title: "\u67E5\u770B\u6765\u6E90",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRightUpOutline14, { "aria-hidden": "true" })
            }
          )
        ] })
      ] }, repository.repoKey)) }),
      marketHasMore ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-market-more", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: marketLoading, onClick: () => void (marketSearched ? searchNextRepositories() : browseRepositories(false)), children: marketLoading ? "\u52A0\u8F7D\u4E2D..." : "\u52A0\u8F7D\u66F4\u591A 20 \u4E2A" }) }) : null
    ] }) : loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-empty", children: "\u6B63\u5728\u52A0\u8F7D..." }) : visibleSkills.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-empty", children: "\u6CA1\u6709\u5339\u914D\u7684 Skill" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-bulk-actions", "aria-label": "\u6279\u91CF\u7BA1\u7406\u5F53\u524D\u7ED3\u679C", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          selectedManagedNames.size,
          " / ",
          visibleSkills.length,
          " \u5DF2\u9009\u62E9"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => selectVisibleManagedSkills(true), children: "\u5168\u9009\u5F53\u524D\u7ED3\u679C" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => selectVisibleManagedSkills(false), children: "\u53D6\u6D88\u5168\u9009" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: selectedManagedNames.size === 0 || bulkManagedAction !== null, onClick: () => void runBulkManagedAction("enable"), children: "\u6279\u91CF\u5F00\u542F" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: selectedManagedNames.size === 0 || bulkManagedAction !== null, onClick: () => void runBulkManagedAction("disable"), children: "\u6279\u91CF\u5173\u95ED" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: confirmingBulkDelete ? "dsm-bulk-primary" : "", type: "button", disabled: selectedManagedNames.size === 0 || bulkManagedAction !== null, onClick: () => void runBulkManagedAction("delete"), children: confirmingBulkDelete ? `\u786E\u8BA4\u5220\u9664 ${selectedManagedNames.size} \u9879` : "\u6279\u91CF\u5220\u9664" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-list", "aria-label": "Skill \u5217\u8868", children: visibleSkills.map((skill) => {
        const enabled = skill.enabledTargets.includes("dsh");
        const check = updateChecks.get(skill.name);
        const supportsUpdates = skill.source?.kind === "github";
        const checkingUpdate = checkingUpdateNames.has(skill.name);
        const updating = updatingNames.has(skill.name);
        const busy = busyNames.has(skill.name) || updating || checkingUpdate;
        const deleting = deletingNames.has(skill.name);
        const confirmingDelete = confirmingDeleteName === skill.name;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { className: "dsm-skill-item", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsm-select", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", "aria-label": `\u9009\u62E9 ${skill.name}`, checked: selectedManagedNames.has(skill.name), disabled: busy, onChange: (event) => {
            setConfirmingBulkDelete(false);
            setSelectedManagedNames((current) => {
              const next = new Set(current);
              if (event.currentTarget.checked) next.add(skill.name);
              else next.delete(skill.name);
              return next;
            });
          } }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-skill-icon", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillFileIcon, {}) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-copy", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-heading", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: skill.name }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: managedSourceTitle(skill), children: managedSourceLabel(skill) }),
              check ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-update-state", "data-status": check.status, children: updateStatusLabel(check.status) }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { title: skill.description, children: skill.description }),
            check?.latestRisk ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-provenance-state", "data-status": check.latestRisk.risk === "high" ? "ambiguous" : "matched", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: `\u66F4\u65B0\u98CE\u9669\uFF1A${riskLabel(check.latestRisk.risk)}${check.latestRisk.findings.length > 0 ? ` \xB7 ${check.latestRisk.findings.length} \u9879\u63D0\u793A` : ""}` }) }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-tags", "aria-label": `${skill.name} \u7C7B\u578B\u6807\u7B7E`, children: contentTags(skill.name, skill.description).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: tag }, tag)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-actions", children: [
            check?.status === "update-available" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                className: `dsm-row-button ${confirmingRiskUpdateName === skill.name ? "dsm-row-button-danger" : "dsm-row-button-accent"}`,
                type: "button",
                "aria-label": `\u66F4\u65B0 ${skill.name}`,
                disabled: busy,
                onClick: () => {
                  const requiresReview = check.latestRisk !== void 0 && (check.latestRisk === null || check.latestRisk.risk === "unknown" || check.latestRisk.risk === "high");
                  if (requiresReview && confirmingRiskUpdateName !== skill.name) {
                    setConfirmingRiskUpdateName(skill.name);
                    setNotice(`${skill.name} \u7684\u66F4\u65B0\u5305\u542B\u9AD8\u6216\u672A\u77E5\u98CE\u9669\uFF0C\u8BF7\u67E5\u770B\u98CE\u9669\u63D0\u793A\u540E\u518D\u6B21\u786E\u8BA4\u3002`);
                    return;
                  }
                  void updateSkill(skill, requiresReview);
                },
                children: updating ? "\u66F4\u65B0\u4E2D" : confirmingRiskUpdateName === skill.name ? "\u786E\u8BA4\u66F4\u65B0" : "\u66F4\u65B0"
              }
            ) : null,
            supportsUpdates && check?.status !== "update-available" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                className: "dsm-row-button",
                type: "button",
                "aria-label": `${check ? "\u91CD\u65B0\u68C0\u67E5" : "\u68C0\u67E5"} ${skill.name} \u66F4\u65B0`,
                disabled: busy,
                onClick: () => void checkSkillUpdate(skill),
                children: checkingUpdate ? "\u68C0\u67E5\u4E2D" : check ? "\u91CD\u65B0\u68C0\u67E5" : "\u68C0\u67E5\u66F4\u65B0"
              }
            ) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                className: `dsm-row-button${confirmingDelete ? " dsm-row-button-danger" : ""}`,
                type: "button",
                "aria-label": `${confirmingDelete ? "\u786E\u8BA4\u5220\u9664" : "\u5220\u9664"} ${skill.name}`,
                disabled: busy || deleting,
                onClick: () => void deleteSkill(skill),
                children: deleting ? "\u5220\u9664\u4E2D" : confirmingDelete ? "\u786E\u8BA4\u5220\u9664" : "\u5220\u9664"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-switch", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-sr-only", children: [
                "\u5728 DSH \u4E2D\u542F\u7528 ",
                skill.name
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: enabled,
                  disabled: busy,
                  onChange: (event) => void setEnabled(skill, event.currentTarget.checked)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-switch-track", "aria-hidden": "true" })
            ] })
          ] })
        ] }) }, skill.name);
      }) })
    ] }),
    inspectionRepository !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      RepositoryInstallDialog,
      {
        repository: inspectionRepository,
        inspection,
        loading: inspectionLoading,
        error: inspectionError,
        avatarUrl: inspectionAvatarUrl,
        media: inspectionMedia,
        selectedMediaId: selectedInspectionMediaId,
        installedSkillPaths: installedRepositorySkillPaths(skills, inspectionRepository),
        selectedSkillPaths,
        riskAssessments,
        installingSkillPaths,
        installResults,
        confirmHighRiskInstall,
        onClose: closeRepositoryDialog,
        onRetry: () => void inspectOpenRepository(),
        onSelectMedia: selectInspectionMedia,
        onMediaError: removeInspectionMedia,
        onToggle: toggleSelectedSkill,
        onSelectAll: (selected) => setSelectedSkillPaths(new Set(selected && inspection !== null ? inspection.skills.filter((skill) => skill.installable && !installedRepositorySkillPaths(skills, inspectionRepository).has(skill.path)).map((skill) => skill.path) : [])),
        onInstall: () => void installSelectedSkills()
      }
    ) : null
  ] });
}
var MAINTENANCE_STORAGE_KEY = "dsh-skill-manager:maintenance:v1";
var MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var BULK_NOTICE_DISMISS_MS = 5e3;
var MAX_INSPECTION_MEDIA = 8;
var INSPECTION_MEDIA_CONCURRENCY = 3;
function mediaSourceId(source) {
  switch (source.type) {
    case "repo-blob":
      return `${source.type}:${source.repo}@${source.commit}:${source.path}`;
    case "github-avatar":
      return `${source.type}:${source.accountId}`;
    case "github-social-preview":
      return `${source.type}:${source.repo}`;
    case "generated":
      return `${source.type}:${source.seed}`;
  }
}
function isBulkCompletionNotice(value) {
  return /^批量(?:开启|关闭|删除)完成：/u.test(value);
}
function uniqueMediaSources(sources) {
  const seen = /* @__PURE__ */ new Set();
  return sources.filter((source) => {
    const id = mediaSourceId(source);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function mergeInspectionMedia(preferred, existing) {
  const merged = /* @__PURE__ */ new Map();
  for (const media of [...preferred, ...existing]) {
    if (!merged.has(media.id)) merged.set(media.id, media);
  }
  return [...merged.values()].slice(0, MAX_INSPECTION_MEDIA);
}
async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await operation(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
var LOCAL_SKILL_VIEWS = [
  { id: "all", label: "\u5168\u90E8" },
  { id: "custom", label: "\u81EA\u8BBE" },
  { id: "sync", label: "\u540C\u6B65" }
];
var MARKET_SORT_OPTIONS = [
  { id: "trend-monthly", label: "\u8FD1\u671F\u70ED\u5EA6\u699C" },
  { id: "popular", label: "\u5386\u53F2\u70ED\u95E8" },
  { id: "latest", label: "\u6700\u65B0" },
  { id: "relevance", label: "\u76F8\u5173\u5EA6" }
];
var MARKET_CATEGORY_OPTIONS = [
  { id: "all", label: "\u5168\u90E8\u5206\u7C7B" },
  { id: "agent", label: "\u667A\u80FD\u4F53\u4E0E\u63D0\u793A" },
  { id: "automation", label: "\u81EA\u52A8\u5316\u4E0E Skill \u5DE5\u5177" },
  { id: "development", label: "\u8F6F\u4EF6\u5F00\u53D1" },
  { id: "data", label: "\u6570\u636E\u4E0E\u6570\u636E\u5E93" },
  { id: "design", label: "\u8BBE\u8BA1\u4E0E\u53EF\u89C6\u5316" },
  { id: "content", label: "\u5185\u5BB9\u4E0E\u5199\u4F5C" },
  { id: "research", label: "\u7814\u7A76\u4E0E\u77E5\u8BC6" },
  { id: "business", label: "\u5546\u4E1A\u4E0E\u4EA7\u54C1" },
  { id: "finance", label: "\u91D1\u878D\u4E0E\u533A\u5757\u94FE" },
  { id: "security", label: "\u5B89\u5168\u4E0E\u5408\u89C4" },
  { id: "creative", label: "\u6E38\u620F\u4E0E\u5A31\u4E50" },
  { id: "life", label: "\u751F\u6D3B\u4E0E\u5065\u5EB7" }
];
var MARKET_CATEGORY_QUERIES = {
  agent: "agent prompt skill",
  automation: "automation skill",
  development: "software developer skill",
  data: "data database skill",
  design: "design visualization skill",
  content: "writing documentation skill",
  research: "research knowledge skill",
  business: "business product skill",
  finance: "finance blockchain skill",
  security: "security compliance skill",
  creative: "game entertainment skill",
  life: "health lifestyle skill"
};
var MAINTENANCE_OPTIONS = [
  { key: "autoCheck", label: "\u81EA\u52A8\u68C0\u67E5\u66F4\u65B0", description: "\u8BFB\u53D6\u5DF2\u5339\u914D Skill \u7684\u6700\u65B0\u56FA\u5B9A\u5FEB\u7167" },
  { key: "autoUpdate", label: "\u81EA\u52A8\u66F4\u65B0", description: "\u4EC5\u81EA\u52A8\u66F4\u65B0\u672A\u672C\u5730\u4FEE\u6539\u4E14\u98CE\u9669\u4E3A\u4F4E\u6216\u4E2D\u7B49\u7684 Skill" }
];
var EXTERNAL_SOURCE_FILTERS = [
  { id: "all", label: "\u5168\u90E8\u4F4D\u7F6E" },
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude Code" },
  { id: "agents", label: "Agents" },
  { id: "opencode", label: "OpenCode" }
];
function ensureSkillManagerStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_ATTRIBUTE}"]`) !== null) return;
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-skill-manager";
  style.dataset.pluginCss = STYLE_ATTRIBUTE;
  style.textContent = CLIENT_CSS;
  document.head.appendChild(style);
}
function upsertSkill(skills, next) {
  return sortSkills([...skills.filter((skill) => skill.name !== next.name), next]);
}
function repositoryInstallCount(skills, repository) {
  return installedRepositorySkillPaths(skills, repository).size;
}
function installedRepositorySkillPaths(skills, repository) {
  const expected = repository.fullName.toLocaleLowerCase();
  return new Set(skills.flatMap((skill) => skill.source?.kind === "github" && (skill.source.repositoryId === repository.repositoryId || skill.source.repository.toLocaleLowerCase() === expected) ? [skill.source.path] : []));
}
function sortSkills(skills) {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
}
function mergeRepositories(current, incoming) {
  const repositories = new Map(current.map((repository) => [repository.repoKey, repository]));
  for (const repository of incoming) {
    if (!repositories.has(repository.repoKey)) repositories.set(repository.repoKey, repository);
  }
  return [...repositories.values()];
}
function installSkillManagerSidebarIcon() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => void 0;
  const replacements = [];
  const applyIcon = () => {
    for (const candidate of document.querySelectorAll("button, [role='button']")) {
      if (candidate.closest(".dsm-panel") || candidate.textContent?.trim() !== "Skill \u7BA1\u7406") continue;
      const original = candidate.querySelector("svg:not([data-dsh-skill-manager-sidebar-icon])");
      if (original === null) continue;
      const replacement = createSidebarFileIcon();
      replacement.setAttribute("class", original.getAttribute("class") ?? "");
      original.replaceWith(replacement);
      replacements.push({ replacement, original });
    }
  };
  applyIcon();
  const observer = new MutationObserver(applyIcon);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    for (const { replacement, original } of replacements) {
      if (replacement.isConnected) replacement.replaceWith(original);
    }
  };
}
function createSidebarFileIcon() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("data-dsh-skill-manager-sidebar-icon", "true");
  svg.setAttribute("viewBox", "0 0 28 32");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.style.setProperty("width", "16px", "important");
  svg.style.setProperty("height", "18px", "important");
  svg.style.setProperty("min-width", "16px", "important");
  svg.style.setProperty("max-width", "16px", "important");
  svg.style.setProperty("min-height", "18px", "important");
  svg.style.setProperty("max-height", "18px", "important");
  svg.style.setProperty("flex", "0 0 16px", "important");
  svg.style.setProperty("display", "block", "important");
  svg.style.setProperty("box-sizing", "border-box", "important");
  svg.style.setProperty("overflow", "hidden", "important");
  svg.style.setProperty("transform", "none", "important");
  const paper = document.createElementNS(namespace, "path");
  paper.setAttribute("d", "M5.5 1.75h10.25L22.5 8.5v21.75h-17z");
  paper.setAttribute("fill", "none");
  paper.setAttribute("stroke", "currentColor");
  paper.setAttribute("stroke-width", "1.8");
  paper.setAttribute("stroke-linejoin", "round");
  const fold = document.createElementNS(namespace, "path");
  fold.setAttribute("d", "M15.75 1.75V8.5h6.75");
  fold.setAttribute("fill", "none");
  fold.setAttribute("stroke", "currentColor");
  fold.setAttribute("stroke-width", "1.8");
  fold.setAttribute("stroke-linejoin", "round");
  svg.append(paper, fold);
  return svg;
}
function originLabel(origin) {
  switch (origin) {
    case "self":
      return "\u81EA\u8BBE";
    case "local-import":
      return "\u81EA\u8BBE";
    case "github":
      return "GitHub";
    case "skills-sh":
      return "skills.sh";
    case "hugging-face":
      return "Hugging Face";
  }
}
function managedSourceLabel(skill) {
  const source = skill.source;
  if (source?.kind === "local-import") {
    return `\u81EA\u8BBE \xB7 \u6765\u81EA ${targetLabel(source.target)}`;
  }
  if (source?.kind === "github") {
    const discoveredBy = source.discoverySources?.filter((candidate) => candidate !== source.catalog).map(sourceLabel) ?? [];
    const primary = sourceLabel(source.catalog);
    return discoveredBy.length === 0 ? primary : `${primary} \xB7 \u7531 ${discoveredBy.join("\u3001")} \u53D1\u73B0`;
  }
  return originLabel(skill.origin);
}
function managedSourceTitle(skill) {
  if (skill.source?.kind !== "github") return managedSourceLabel(skill);
  const method = skill.source.matchMethod === "exact-content" ? "\u5B8C\u6574\u5185\u5BB9\u7CBE\u786E\u5339\u914D" : "\u5B89\u88C5\u65F6\u8BB0\u5F55";
  return `${skill.source.repository}#${skill.source.path} \xB7 ${method}${skill.source.matchedAt ? ` \xB7 ${formatBackupDate(skill.source.matchedAt)}` : ""}`;
}
function sourceLabel(source) {
  switch (source) {
    case "skills-sh":
      return "skills.sh";
    case "github":
      return "GitHub";
    case "hugging-face":
      return "Hugging Face";
  }
}
function targetLabel(target) {
  if (target === "codex") return "Codex";
  if (target === "claude") return "Claude Code";
  if (target === "opencode") return "OpenCode";
  return "Agents";
}
function targetStatusLabel(state) {
  switch (state.status) {
    case "not-configured":
      return `${targetLabel(state.target)} \u672A\u914D\u7F6E`;
    case "not-linked":
      return "\u672A\u540C\u6B65";
    case "linked":
      return "\u5DF2\u540C\u6B65";
    case "conflict":
      return `${targetLabel(state.target)} \u5DF2\u5B58\u5728\u540C\u540D\u76EE\u5F55`;
  }
}
function formatMetric(value) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
function SkillFileIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      className: "dsm-skill-file-icon",
      "data-skill-file-icon": "true",
      viewBox: "0 0 28 32",
      fill: "none",
      focusable: "false",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { className: "dsm-skill-file-paper", d: "M5.5 1.75h10.25L22.5 8.5v21.75h-17z" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { className: "dsm-skill-file-fold", d: "M15.75 1.75V8.5h6.75" })
      ]
    }
  );
}
function RepositoryInstallDialog(props) {
  const skills = props.inspection?.skills ?? [];
  const selectable = skills.filter((skill) => skill.installable && !props.installedSkillPaths.has(skill.path));
  const selectedCount = selectable.filter((skill) => props.selectedSkillPaths.has(skill.path)).length;
  const selectedRisksReady = selectable.filter((skill) => props.selectedSkillPaths.has(skill.path)).every((skill) => {
    const assessment = props.riskAssessments.get(skill.path);
    return assessment !== void 0 && assessment.risk !== "unknown";
  });
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;
  const anyInstalling = props.installingSkillPaths.size > 0;
  const activeMedia = props.media.find((media) => media.id === props.selectedMediaId) ?? props.media[0] ?? null;
  const repository = props.inspection === null ? props.repository : {
    ...props.inspection.repository,
    trend: props.repository.trend
  };
  const dialog = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-modal-backdrop", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsm-install-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "dsm-inspection-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "dsm-dialog-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "dsm-inspection-title", children: repository.fullName }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: props.loading ? "\u9879\u76EE\u4FE1\u606F\u5DF2\u663E\u793A\uFF1B\u5B89\u88C5\u5185\u5BB9\u6B63\u5728\u540E\u53F0\u51C6\u5907\u5E76\u9A8C\u8BC1\u3002" : props.inspection !== null ? "\u4ED3\u5E93\u5185\u5BB9\u4E0E Skill \u7ED3\u6784\u5DF2\u9A8C\u8BC1\uFF0C\u53EF\u4EE5\u9009\u62E9\u5B89\u88C5\u3002" : "\u9879\u76EE\u4FE1\u606F\u5DF2\u663E\u793A\uFF1B\u4ED3\u5E93\u5185\u5BB9\u68C0\u67E5\u5931\u8D25\uFF0C\u53EF\u5728\u5361\u7247\u5185\u91CD\u8BD5\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsm-icon-button", type: "button", "aria-label": "\u5173\u95ED\u5B89\u88C5\u786E\u8BA4", onClick: props.onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutline16, { "aria-hidden": "true" }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-dialog-scroll", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-publisher", children: [
        props.avatarUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { className: "dsm-repository-avatar", src: props.avatarUrl, alt: "" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-repository-avatar", "aria-hidden": "true", children: repository.owner.slice(0, 1).toLocaleUpperCase() }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: repository.owner }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: repository.ownerType === "Organization" ? "GitHub \u7EC4\u7EC7" : "GitHub \u53D1\u5E03\u8005" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-meta", children: [
          repository.stars > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "\u2605 ",
            formatMetric(repository.stars)
          ] }) : null,
          repository.repositoryId > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            formatMetric(repository.forks),
            " forks"
          ] }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-dialog-description", children: repository.description ?? "\u4ED3\u5E93\u672A\u63D0\u4F9B\u7B80\u4ECB" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-tags", "aria-label": `${repository.fullName} \u8BE6\u60C5 Topics`, children: [
        repository.topics.slice(0, 8).map((topic) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: topic }, topic)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: classificationLabel(repository.classification.primaryCategory) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-meta dsm-dialog-repository-meta", children: [
        repository.repositoryId > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u521B\u5EFA ",
          formatRelativeDate(repository.createdAt)
        ] }) : null,
        repository.repositoryId > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u66F4\u65B0 ",
          formatRelativeDate(repository.updatedAt)
        ] }) : null,
        repository.trend?.weeklyStars !== null && repository.trend?.weeklyStars !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u672C\u5468 +",
          formatMetric(repository.trend.weeklyStars)
        ] }) : null,
        repository.trend?.monthlyStars !== null && repository.trend?.monthlyStars !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u672C\u6708 +",
          formatMetric(repository.trend.monthlyStars)
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: repository.url, target: "_blank", rel: "noreferrer", children: "GitHub \u6765\u6E90 \u2197" })
      ] }),
      activeMedia ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-inspection-gallery", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "img",
          {
            className: "dsm-inspection-cover",
            src: activeMedia.asset.dataUrl,
            alt: `${repository.fullName} \u4ED3\u5E93\u9884\u89C8`,
            onError: () => props.onMediaError(activeMedia.id)
          }
        ),
        props.media.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-inspection-thumbnails", role: "group", "aria-label": "\u4ED3\u5E93\u56FE\u7247", children: props.media.map((media, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "aria-label": `\u67E5\u770B\u4ED3\u5E93\u56FE\u7247 ${index + 1}`,
            "aria-pressed": media.id === activeMedia.id,
            onClick: () => props.onSelectMedia(media.id),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: media.asset.dataUrl, alt: "", onError: () => props.onMediaError(media.id) })
          },
          media.id
        )) }) : null
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-dialog-cover-fallback", "aria-label": "\u4ED3\u5E93\u672A\u63D0\u4F9B\u53EF\u7528\u9884\u89C8\u56FE", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillFileIcon, {}) }),
      props.loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-dialog-state", role: "status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-dialog-spinner", "aria-hidden": "true" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u6B63\u5728\u51C6\u5907\u4ED3\u5E93\u5185\u5BB9" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u6B63\u5728\u56FA\u5B9A commit\u3001\u51C6\u5907\u4ED3\u5E93\u5FEB\u7167\u5E76\u9A8C\u8BC1 SKILL.md\uFF1B\u9879\u76EE\u4FE1\u606F\u4ECD\u53EF\u67E5\u770B\u3002" })
      ] }) : props.inspection === null && props.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-dialog-state dsm-dialog-state-error", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u65E0\u6CD5\u68C0\u67E5\u8FD9\u4E2A GitHub \u4ED3\u5E93" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: props.error }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsm-row-button", type: "button", onClick: props.onRetry, children: "\u91CD\u8BD5" })
      ] }) : props.inspection !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        props.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-inspection-warning", children: props.error }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-market-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "\u7ED3\u6784\u5DF2\u9A8C\u8BC1 \xB7 ",
            props.inspection.inspectionCommit.slice(0, 7)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            props.inspection.skills.length,
            " \u4E2A Skill"
          ] })
        ] }),
        props.inspection.warnings.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-inspection-warning", children: props.inspection.warnings.join("\uFF1B") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-inspection-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "checkbox",
                checked: allSelected,
                disabled: selectable.length === 0 || anyInstalling,
                onChange: (event) => props.onSelectAll(event.currentTarget.checked)
              }
            ),
            "\u9009\u62E9\u5168\u90E8\u53EF\u5B89\u88C5 Skill"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            selectedCount,
            " / ",
            selectable.length,
            " \u5DF2\u9009\u62E9"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-inspection-skills", "aria-label": "\u4ED3\u5E93 Skill \u5217\u8868", children: skills.map((skill) => {
          const installed = props.installedSkillPaths.has(skill.path);
          const assessment = props.riskAssessments.get(skill.path);
          const result = props.installResults.get(skill.path);
          const installing = props.installingSkillPaths.has(skill.path);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-inspection-select", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: !installed && props.selectedSkillPaths.has(skill.path),
                  disabled: !skill.installable || installed || installing || anyInstalling,
                  onChange: (event) => props.onToggle(skill.path, event.currentTarget.checked)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillFileIcon, {})
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-copy", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-skill-heading", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: skill.name }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: skill.path }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: installed ? "\u5DF2\u5B89\u88C5" : skill.installable ? "\u7ED3\u6784\u5DF2\u9A8C\u8BC1" : "\u4E0D\u53EF\u5B89\u88C5" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { title: skill.description, children: skill.description }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-tags", "aria-label": `${skill.name} \u5206\u7C7B\u6807\u7B7E`, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: classificationLabel(skill.classification.primaryCategory) }),
                skill.classification.tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: tag }, tag))
              ] }),
              skill.classification.evidence.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { className: "dsm-classification-evidence", children: [
                "\u5206\u7C7B\u4F9D\u636E\uFF1A",
                skill.classification.evidence.map((evidence) => evidence.value).slice(0, 3).join("\u3001")
              ] }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-integrity-risk", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-integrity-ok", children: "\u7ED3\u6784\u8BC1\u636E\uFF1A\u56FA\u5B9A\u68C0\u67E5 commit \xB7 SKILL.md \u5DF2\u89E3\u6790" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5B89\u88C5\u5B8C\u6574\u6027\uFF1AHost \u5B89\u88C5\u65F6\u91CD\u65B0\u89E3\u6790\u5E76\u9A8C\u8BC1\u5B8C\u6574 bundle" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { "data-risk": assessment?.risk ?? "unknown", children: [
                  "\u5185\u5BB9\u98CE\u9669\uFF1A",
                  riskLabel(assessment?.risk ?? "unknown")
                ] })
              ] }),
              assessment && assessment.findings.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-risk-findings", children: assessment.findings.slice(0, 4).map((finding) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
                finding.title,
                " \xB7 ",
                finding.file
              ] }, `${finding.code}:${finding.file}`)) }) : null,
              skill.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: warning }, warning)),
              result ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { "data-result": result.ok ? "success" : "failure", children: result.message }) : null
            ] })
          ] }, skill.skillKey);
        }) }),
        props.inspection.readme ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "dsm-readme", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "\u4ED3\u5E93\u8BF4\u660E README" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: props.inspection.readme.content.slice(0, 12e3) })
        ] }) : null
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "dsm-dialog-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: props.confirmHighRiskInstall ? "\u6240\u9009 Skill \u542B\u9AD8\u98CE\u9669\u63D0\u793A\uFF0C\u8BF7\u518D\u6B21\u786E\u8BA4\u3002" : !selectedRisksReady && selectedCount > 0 ? "\u6B63\u5728\u5B8C\u6210\u5185\u5BB9\u98CE\u9669\u68C0\u67E5\uFF1B\u68C0\u67E5\u5B8C\u6210\u524D\u4E0D\u4F1A\u5199\u5165 Skill \u5E93\u3002" : "\u8FDC\u7A0B Skill \u53EF\u80FD\u5305\u542B\u7B2C\u4E09\u65B9\u811A\u672C\uFF1B\u5B89\u88C5\u4E0D\u4F1A\u6267\u884C\u811A\u672C\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsm-dialog-cancel", type: "button", disabled: anyInstalling, onClick: props.onClose, children: "\u53D6\u6D88" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "dsm-dialog-confirm", type: "button", disabled: props.inspection === null || selectedCount === 0 || anyInstalling || !selectedRisksReady, onClick: props.onInstall, children: anyInstalling ? "\u5B89\u88C5\u4E2D" : !selectedRisksReady && selectedCount > 0 ? "\u98CE\u9669\u68C0\u67E5\u4E2D" : props.confirmHighRiskInstall ? `\u786E\u8BA4\u5B89\u88C5 (${selectedCount})` : `\u5B89\u88C5\u6240\u9009 (${selectedCount})` })
      ] })
    ] })
  ] }) });
  return typeof document === "undefined" ? dialog : (0, import_react_dom.createPortal)(dialog, document.body);
}
function riskLabel(risk) {
  switch (risk) {
    case "low":
      return "\u4F4E";
    case "medium":
      return "\u4E2D";
    case "high":
      return "\u9AD8\uFF0C\u9700\u8981\u4E8C\u6B21\u786E\u8BA4";
    case "unknown":
      return "\u6B63\u5728\u626B\u63CF\u6216\u4E0D\u53EF\u7528";
  }
}
function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function defaultMaintenanceSettings() {
  return {
    autoMatch: { enabled: false, lastRunAt: null },
    autoCheck: { enabled: false, lastRunAt: null },
    autoUpdate: { enabled: false, lastRunAt: null }
  };
}
function readMaintenanceSettings() {
  const defaults = defaultMaintenanceSettings();
  if (typeof window === "undefined") return defaults;
  try {
    const value = JSON.parse(window.localStorage.getItem(MAINTENANCE_STORAGE_KEY) ?? "null");
    if (!isClientRecord(value)) return defaults;
    for (const key of ["autoCheck", "autoUpdate"]) {
      const setting = value[key];
      if (!isClientRecord(setting) || typeof setting.enabled !== "boolean") return defaults;
      const lastRunAt = setting.lastRunAt;
      if (lastRunAt !== null && (typeof lastRunAt !== "string" || Number.isNaN(Date.parse(lastRunAt)))) return defaults;
      defaults[key] = { enabled: setting.enabled, lastRunAt };
    }
    defaults.autoMatch = { enabled: false, lastRunAt: null };
    return defaults;
  } catch {
    return defaults;
  }
}
function writeMaintenanceSettings(settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MAINTENANCE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
  }
}
function maintenanceDue(lastRunAt) {
  return lastRunAt === null || Date.now() - Date.parse(lastRunAt) >= MAINTENANCE_INTERVAL_MS;
}
function isClientRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function formatTrashExpiry(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const days = Math.max(0, Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1e3)));
  return `${formatRelativeDate(value)}\uFF08\u5269\u4F59 ${days} \u5929\uFF09`;
}
function externalCandidateKey(candidate) {
  return `${candidate.target}:${candidate.name}`;
}
function uniqueCandidatesByName(candidates) {
  const unique = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    if (!unique.has(candidate.name)) unique.set(candidate.name, candidate);
  }
  return [...unique.values()];
}
function importableCandidateCount(candidates, skills) {
  return uniqueCandidatesByName(candidates.filter((candidate) => !skills.some((skill) => skill.name === candidate.name))).length;
}
function selectedVisibleCount(candidates, selected, skills) {
  return uniqueCandidatesByName(candidates.filter((candidate) => selected.has(externalCandidateKey(candidate)) && !skills.some((skill) => skill.name === candidate.name))).length;
}
var MARKET_CATEGORY_LABELS = {
  agent: "\u667A\u80FD\u4F53\u4E0E\u63D0\u793A",
  automation: "\u81EA\u52A8\u5316\u4E0E Skill \u5DE5\u5177",
  development: "\u8F6F\u4EF6\u5F00\u53D1",
  data: "\u6570\u636E\u4E0E\u6570\u636E\u5E93",
  design: "\u8BBE\u8BA1\u4E0E\u53EF\u89C6\u5316",
  content: "\u5185\u5BB9\u4E0E\u5199\u4F5C",
  research: "\u7814\u7A76\u4E0E\u77E5\u8BC6",
  business: "\u5546\u4E1A\u4E0E\u4EA7\u54C1",
  finance: "\u91D1\u878D\u4E0E\u533A\u5757\u94FE",
  security: "\u5B89\u5168\u4E0E\u5408\u89C4",
  creative: "\u6E38\u620F\u4E0E\u5A31\u4E50",
  life: "\u751F\u6D3B\u4E0E\u5065\u5EB7",
  general: "\u901A\u7528"
};
function classificationLabel(category) {
  return MARKET_CATEGORY_LABELS[category] ?? "\u901A\u7528";
}
function marketplaceTitle(searched, sort) {
  if (searched) return "GitHub \u641C\u7D22\u7ED3\u679C";
  if (isTrendingSort(sort)) return "GitHub \u8FD1\u671F\u70ED\u5EA6 Skill \u5019\u9009";
  if (sort === "latest") return "\u6700\u8FD1 60 \u5929\u521B\u5EFA\u7684 GitHub Skill \u4ED3\u5E93";
  return "\u5386\u53F2\u70ED\u95E8 GitHub \u4ED3\u5E93";
}
function isTrendingSort(sort) {
  return sort === "trend-weekly" || sort === "trend-monthly";
}
function contentTags(name, description) {
  const text = `${name} ${description}`.toLocaleLowerCase();
  const tags = MARKET_TAG_RULES.filter((rule) => rule.terms.some((term) => matchesMarketTerm(text, term))).map((rule) => rule.label).slice(0, 3);
  return tags.length > 0 ? tags : ["\u901A\u7528"];
}
var MARKET_TAG_RULES = [
  { label: "\u4EE3\u7801", terms: ["code", "coding", "developer", "program", "typescript", "python", "react", "\u4EE3\u7801", "\u5F00\u53D1"] },
  { label: "\u8BBE\u8BA1", terms: ["design", "ui", "ux", "figma", "visual", "\u8BBE\u8BA1", "\u89C6\u89C9"] },
  { label: "\u521B\u4F5C", terms: ["writing", "creative", "content", "story", "\u521B\u4F5C", "\u5199\u4F5C"] },
  { label: "\u5C0F\u8BF4", terms: ["novel", "fiction", "character", "\u5C0F\u8BF4", "\u89D2\u8272"] },
  { label: "\u6E38\u620F", terms: ["game", "gaming", "unity", "unreal", "\u6E38\u620F"] },
  { label: "\u7535\u5546", terms: ["commerce", "ecommerce", "shop", "product listing", "\u7535\u5546", "\u5546\u54C1"] },
  { label: "\u6570\u636E", terms: ["data", "analytics", "spreadsheet", "\u6570\u636E", "\u5206\u6790"] },
  { label: "\u7814\u7A76", terms: ["research", "paper", "academic", "\u7814\u7A76", "\u8BBA\u6587"] }
];
function matchesMarketTerm(text, term) {
  if (/[^\x00-\x7f]/u.test(term)) return text.includes(term);
  return text.split(/[^a-z0-9]+/u).includes(term);
}
function remoteErrorMessage(error) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : "Skill Manager \u6682\u65F6\u4E0D\u53EF\u7528";
}
function updateStatusLabel(status) {
  switch (status) {
    case "unsupported":
      return "\u4E0D\u652F\u6301\u8FDC\u7A0B\u66F4\u65B0";
    case "local-modified":
      return "\u672C\u5730\u5DF2\u4FEE\u6539";
    case "source-moved":
      return "\u6765\u6E90\u8DEF\u5F84\u5DF2\u53D8\u5316";
    case "up-to-date":
      return "\u5DF2\u662F\u6700\u65B0";
    case "update-available":
      return "\u53EF\u66F4\u65B0";
  }
}
function formatBackupDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
function withoutValue(values, value) {
  const next = new Set(values);
  next.delete(value);
  return next;
}
function withoutValues(values, removed) {
  const next = new Set(values);
  for (const value of removed) next.delete(value);
  return next;
}
function withStatuses(values, names, status) {
  const next = new Map(values);
  for (const name of names) next.set(name, status);
  return next;
}
function withoutMapKeys(values, keys) {
  const next = new Map(values);
  for (const key of keys) next.delete(key);
  return next;
}
function withMapValues(values, keys, value) {
  const next = new Map(values);
  for (const key of keys) next.set(key, value);
  return next;
}
function formatProvenanceSummary(summary) {
  return `\u91CD\u5339\u914D\u5B8C\u6210\uFF1A\u5339\u914D ${summary.matched}\uFF0C\u81EA\u8BBE ${summary.custom}\uFF0C\u6B67\u4E49 ${summary.ambiguous}\uFF0C\u672C\u5730\u5DF2\u4FEE\u6539 ${summary.ineligible}\uFF0C\u4E0D\u53EF\u7528 ${summary.unavailable}`;
}
function incrementProvenanceSummary(summary, status) {
  if (status === "no-match") summary.custom += 1;
  else summary[status] += 1;
}
function chunk(values, size) {
  const batches = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}
function withoutMapKey(values, key) {
  const next = new Map(values);
  next.delete(key);
  return next;
}
function setUpdateStatus(checks, name, status) {
  const next = new Map(checks);
  const previous = next.get(name);
  if (previous) next.set(name, { ...previous, status });
  return next;
}
function prependBackup(backupsByName, backup) {
  if (!backupsByName.has(backup.name)) return backupsByName;
  const next = new Map(backupsByName);
  const current = next.get(backup.name) ?? [];
  next.set(backup.name, [backup, ...current.filter((candidate) => candidate.id !== backup.id)]);
  return next;
}
var CLIENT_CSS = `
.dsm-panel,
.dsm-modal-backdrop {
  --dsm-bg-base: var(--dsw-alias-bg-base, #ffffff);
  --dsm-bg-layer-1: var(--dsw-alias-bg-layer-1, #f7f7f7);
  --dsm-bg-layer-2: var(--dsw-alias-bg-layer-2, #efefef);
  --dsm-module: var(--dsw-alias-bg-module-platform, #f1f1f1);
  --dsm-hover: var(--dsw-alias-interactive-bg-hover, #e8e8e8);
  --dsm-border-1: var(--dsw-alias-border-l1, #d4d4d4);
  --dsm-border-2: var(--dsw-alias-border-l2, #e4e4e4);
  --dsm-label-primary: var(--dsw-alias-label-primary, #202020);
  --dsm-label-secondary: var(--dsw-alias-label-secondary, var(--dsw-alias-label-tertiary, #6f6f6f));
  --dsm-label-tertiary: var(--dsw-alias-label-tertiary, #8a8a8a);
  --dsm-accent: var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #247a5c));
  --dsm-accent-label: var(--dsw-alias-label-primary-inverted, #fff);
  --dsm-error: var(--dsw-alias-state-error-primary, #c05c3b);
  --dsm-error-bg: var(--dsw-alias-state-error-secondary, #f8e8e3);
}
.dsm-panel {
  box-sizing: border-box;
  width: min(100%, 780px);
  margin: 0 auto;
  padding: 20px 20px 40px;
  color: var(--dsm-label-primary);
  font: inherit;
}
.dsm-panel * { box-sizing: border-box; }
.dsm-primary-tabs {
  display: inline-flex;
  gap: 18px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--dsm-border-2);
}
.dsm-primary-tabs button {
  position: relative;
  min-height: 34px;
  padding: 0 2px 9px;
  border: 0;
  background: transparent;
  color: var(--dsm-label-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dsm-primary-tabs button[aria-selected="true"] { color: var(--dsm-label-primary); }
.dsm-primary-tabs button[aria-selected="true"]::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--dsm-accent);
}
.dsm-primary-tabs button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--dsm-border-2);
}
.dsm-tabs {
  width: min(100%, 320px);
  display: grid;
  grid-template-columns: repeat(3, minmax(70px, 1fr));
  gap: 2px;
  margin-top: 14px;
  padding: 3px;
  border: 1px solid var(--dsm-border-2);
  border-radius: 6px;
  background: var(--dsm-bg-layer-1);
}
.dsm-tabs button {
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsm-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsm-tabs button[aria-selected="true"] {
  background: var(--dsm-hover);
  color: var(--dsm-label-primary);
}
.dsm-tabs button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }
.dsm-market-controls {
  padding: 8px 0 4px;
  border-bottom: 1px solid var(--dsm-border-2);
}
.dsm-market-source-bar,
.dsm-market-category-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsm-market-source-bar { padding-bottom: 6px; }
.dsm-market-category-bar {
  padding-top: 6px;
  border-top: 1px solid var(--dsm-border-2);
}
.dsm-source-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.dsm-source-filters button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsm-border-1);
  border-radius: 6px;
  background: transparent;
  color: var(--dsm-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsm-source-filters button[aria-pressed="true"] {
  border-color: var(--dsm-accent);
  color: var(--dsm-accent);
  background: var(--dsm-bg-layer-2);
}
.dsm-source-filters button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }
.dsm-source-warning { margin: 0; color: var(--dsm-label-secondary); font-size: 11px; text-align: right; }
.dsm-market-empty {
  min-height: 210px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px;
  text-align: center;
  color: var(--dsm-label-secondary);
}
.dsm-market-empty .dsm-skill-file-icon { width: 32px; height: 37px; }
.dsm-market-ranking {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0 8px; border-bottom: 1px solid var(--dsm-border-2);
}
.dsm-market-ranking strong { color: var(--dsm-label-primary); font-size: 12px; }
.dsm-market-ranking span { color: var(--dsm-label-tertiary); font-size: 11px; }
.dsm-market-more { display: flex; justify-content: center; padding: 16px 0 4px; }
.dsm-market-more button {
  min-height: 30px; padding: 0 12px; border: 1px solid var(--dsm-border-1);
  border-radius: 6px; background: var(--dsm-module); color: var(--dsm-label-secondary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.dsm-market-more button:disabled { cursor: default; opacity: .5; }
.dsm-market-empty strong { color: var(--dsm-label-primary); font-size: 14px; }
.dsm-market-empty p { max-width: 460px; margin: 0; font-size: 12px; line-height: 1.6; }
.dsm-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsm-title-row h2 { margin: 0; font-size: 18px; line-height: 1.3; letter-spacing: 0; }
.dsm-count {
  min-width: 24px;
  height: 20px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dsm-border-1);
  border-radius: 6px;
  color: var(--dsm-label-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.dsm-toolbar { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; min-width: 0; }
.dsm-market-search { min-width: 0; display: flex; align-items: center; gap: 8px; }
.dsm-search {
  width: min(240px, 42vw);
  height: 36px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--dsm-border-1);
  border-radius: 6px;
  background: var(--dsm-module);
  color: var(--dsm-label-secondary);
}
.dsm-search:focus-within { border-color: var(--dsm-accent); outline: 2px solid color-mix(in srgb, var(--dsm-accent) 24%, transparent); }
.dsm-search input {
  width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit;
}
.dsm-search input { color: var(--dsm-label-primary); }
.dsm-search input::placeholder { color: var(--dsm-label-tertiary); }
.dsm-icon-button, .dsm-command-button, .dsm-update-check, .dsm-row-button {
  height: 36px;
  border: 1px solid var(--dsm-border-1);
  border-radius: 6px;
  background: var(--dsm-module);
  color: var(--dsm-label-primary);
  font: inherit;
  cursor: pointer;
}
.dsm-icon-button {
  width: 36px;
  flex: 0 0 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dsm-icon-button-primary { background: var(--dsm-accent); border-color: var(--dsm-accent); color: var(--dsm-accent-label); }
.dsm-command-button { min-width: 72px; padding: 0 14px; background: var(--dsm-accent); border-color: var(--dsm-accent); color: var(--dsm-accent-label); }
.dsm-update-check { min-width: 76px; padding: 0 10px; font-size: 12px; white-space: nowrap; }
.dsm-icon-button:not(.dsm-icon-button-primary):hover:not(:disabled), .dsm-update-check:hover:not(:disabled),
.dsm-row-button:hover:not(:disabled) { background: var(--dsm-hover); }
.dsm-command-button:hover:not(:disabled), .dsm-icon-button-primary:hover:not(:disabled) { filter: brightness(1.08); }
.dsm-icon-button:focus-visible, .dsm-command-button:focus-visible,
.dsm-update-check:focus-visible, .dsm-row-button:focus-visible,
.dsm-create input:focus-visible, .dsm-switch input:focus-visible + .dsm-switch-track {
  outline: 2px solid var(--dsm-accent);
  outline-offset: 2px;
}
.dsm-icon-button:disabled, .dsm-command-button:disabled,
.dsm-update-check:disabled, .dsm-row-button:disabled { cursor: default; opacity: .5; }
.dsm-create {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 14px 0;
  border-bottom: 1px solid var(--dsm-border-2);
}
.dsm-field-grid { display: grid; grid-template-columns: minmax(160px, .65fr) minmax(220px, 1.35fr); gap: 10px; }
.dsm-field-grid label { min-width: 0; display: grid; gap: 5px; color: var(--dsm-label-secondary); font-size: 12px; }
.dsm-field-grid input {
  width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--dsm-border-1);
  border-radius: 6px; background: var(--dsm-module); color: var(--dsm-label-primary); font: inherit;
}
.dsm-create-actions { display: flex; align-items: center; gap: 8px; }
.dsm-status { min-height: 12px; }
.dsm-error {
  margin: 10px 0 0; padding: 9px 10px; border-left: 3px solid var(--dsm-error);
  background: var(--dsm-error-bg); color: var(--dsm-label-primary); font-size: 13px;
}
.dsm-notice {
  margin: 10px 0 0; padding: 6px 6px 6px 10px; border-left: 3px solid var(--dsm-accent);
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--dsm-bg-layer-2); color: var(--dsm-label-primary); font-size: 13px;
}
.dsm-notice span { min-width: 0; }
.dsm-notice-dismiss {
  width: 24px; height: 24px; flex: 0 0 24px; display: inline-grid; place-items: center;
  padding: 0; border: 0; background: transparent; color: var(--dsm-label-secondary); cursor: pointer;
}
.dsm-notice-dismiss:hover { background: var(--dsm-bg-hover); color: var(--dsm-label-primary); }
.dsm-local-tools { border-bottom: 1px solid var(--dsm-border-2); }
.dsm-maintenance, .dsm-trash { padding: 10px 0; }
.dsm-trash { border-top: 1px solid var(--dsm-border-2); }
.dsm-utility-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dsm-utility-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.dsm-utility-heading h3 { margin: 0; color: var(--dsm-label-primary); font-size: 12px; }
.dsm-utility-heading p { margin: 3px 0 0; color: var(--dsm-label-tertiary); font-size: 10px; }
.dsm-maintenance-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.dsm-maintenance-options label {
  min-width: 0; display: grid; grid-template-columns: 15px minmax(0, 1fr); align-items: start; gap: 7px;
  padding: 7px 8px; border: 1px solid var(--dsm-border-2); border-radius: 6px; background: var(--dsm-bg-layer-1); cursor: pointer;
}
.dsm-maintenance-options input { width: 14px; height: 14px; margin: 1px 0 0; accent-color: var(--dsm-accent); }
.dsm-maintenance-options strong, .dsm-maintenance-options small { display: block; }
.dsm-maintenance-options strong { color: var(--dsm-label-primary); font-size: 11px; font-weight: 500; }
.dsm-maintenance-options small { margin-top: 2px; color: var(--dsm-label-tertiary); font-size: 9px; line-height: 1.4; }
.dsm-provenance-error { display: block; min-width: 0; overflow: hidden; color: var(--dsm-error); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.dsm-trash-toggle {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0;
  border: 0; background: transparent; color: var(--dsm-label-secondary); text-align: left; font: inherit; cursor: pointer;
}
.dsm-trash-toggle > span:first-child { min-width: 0; }
.dsm-trash-toggle strong, .dsm-trash-toggle small { display: block; }
.dsm-trash-toggle strong { color: var(--dsm-label-primary); font-size: 12px; }
.dsm-trash-toggle small { margin-top: 3px; color: var(--dsm-label-tertiary); font-size: 10px; }
.dsm-trash-toggle > span:last-child { flex: 0 0 auto; font-size: 11px; }
.dsm-trash-toggle:focus-visible, .dsm-trash button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-trash ul { margin: 8px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--dsm-border-2); }
.dsm-trash li { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--dsm-border-2); }
.dsm-trash li > div { min-width: 0; }
.dsm-trash li strong, .dsm-trash li small, .dsm-trash li time { display: block; }
.dsm-trash li strong { color: var(--dsm-label-primary); font-size: 12px; }
.dsm-trash li small { max-width: 560px; margin-top: 2px; overflow: hidden; color: var(--dsm-label-secondary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.dsm-trash li time { margin-top: 2px; color: var(--dsm-label-tertiary); font-size: 9px; }
.dsm-trash li button { height: 28px; padding: 0 10px; border: 1px solid var(--dsm-accent); border-radius: 6px; background: transparent; color: var(--dsm-accent); font: inherit; font-size: 11px; cursor: pointer; }
.dsm-trash li button:disabled { cursor: default; opacity: .5; }
.dsm-trash-empty { margin: 8px 0 0; color: var(--dsm-label-tertiary); font-size: 11px; }
.dsm-list { margin: 0; padding: 0; list-style: none; }
.dsm-skill-item { border-bottom: 1px solid var(--dsm-border-2); }
.dsm-row {
  min-height: 68px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.dsm-skill-item > .dsm-row {
  grid-template-columns: 28px 28px minmax(0, 1fr) auto;
}
.dsm-skill-item > .dsm-row > .dsm-select { grid-column: 1; }
.dsm-skill-item > .dsm-row > .dsm-skill-icon { grid-column: 2; }
.dsm-skill-item > .dsm-row > .dsm-skill-copy { grid-column: 3; }
.dsm-skill-item > .dsm-row > .dsm-skill-actions { grid-column: 4; }
.dsm-market-row {
  min-height: 82px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid var(--dsm-border-2);
}
.dsm-repository-row { grid-template-columns: minmax(0, 1fr) auto; }
.dsm-repository-open {
  min-width: 0;
  width: 100%;
  align-self: stretch;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 8px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsm-repository-open:hover { background: var(--dsm-hover); }
.dsm-repository-open:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-repository-avatar {
  width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--dsm-border-1); border-radius: 50%; background: var(--dsm-bg-layer-1);
  color: var(--dsm-label-primary); font-size: 13px; font-weight: 600;
}
.dsm-market-actions { display: flex; align-items: center; gap: 6px; }
.dsm-installed-badge {
  display: inline-flex; align-items: center; min-height: 24px; padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--dsm-accent) 45%, transparent); border-radius: 999px;
  color: var(--dsm-accent); font-size: 10px; white-space: nowrap;
}
.dsm-market-install {
  min-width: 82px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--dsm-accent);
  border-radius: 6px;
  background: transparent;
  color: var(--dsm-accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsm-market-install:hover:not(:disabled) {
  background: var(--dsm-hover);
}
.dsm-market-install:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-market-install:disabled { cursor: default; opacity: .56; }
.dsm-repository-description { position: relative; }
.dsm-repository-description [role="tooltip"] {
  position: absolute;
  z-index: 15;
  right: 0;
  bottom: calc(100% + 7px);
  left: 0;
  display: none;
  width: min(430px, 100%);
  padding: 8px 10px;
  border: 1px solid var(--dsm-border-1);
  border-radius: 7px;
  background: var(--dsm-bg-layer-2);
  color: var(--dsm-label-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .24);
  font-size: 11px;
  line-height: 1.5;
  white-space: normal;
}
.dsm-repository-description:hover [role="tooltip"],
.dsm-repository-open:focus-visible .dsm-repository-description [role="tooltip"] { display: block; }
.dsm-modal-backdrop {
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  isolation: isolate;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 20px;
  background: rgba(0, 0, 0, .68);
  backdrop-filter: blur(2px);
  color: var(--dsm-label-primary);
  font: inherit;
}
.dsm-modal-backdrop * { box-sizing: border-box; }
.dsm-install-dialog {
  width: min(720px, calc(100vw - 40px));
  max-height: min(760px, calc(100vh - 40px));
  max-height: min(760px, calc(100dvh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--dsm-border-1);
  border-radius: 20px;
  background: var(--dsm-bg-base);
  color: var(--dsm-label-primary);
  box-shadow: 0 24px 80px rgba(0, 0, 0, .46);
}
.dsm-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 20px 12px;
}
.dsm-dialog-header h3 { margin: 0; color: var(--dsm-label-primary); font-size: 16px; line-height: 1.35; }
.dsm-dialog-header p { margin: 5px 0 0; color: var(--dsm-label-secondary); font-size: 11px; line-height: 1.5; }
.dsm-dialog-header .dsm-icon-button { width: 30px; height: 30px; flex-basis: 30px; border-color: transparent; background: transparent; }
.dsm-dialog-scroll { min-height: 0; overflow: auto; padding: 0 20px; }
.dsm-publisher { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.dsm-publisher strong { display: block; color: var(--dsm-label-primary); font-size: 12px; }
.dsm-publisher > div > span { display: block; margin-top: 2px; color: var(--dsm-label-tertiary); font-size: 10px; }
.dsm-publisher > .dsm-market-meta { justify-content: flex-end; margin: 0; }
.dsm-dialog-description { margin: 12px 0 0; color: var(--dsm-label-secondary); font-size: 12px; line-height: 1.55; }
.dsm-dialog-repository-meta { margin: 8px 0 12px; }
.dsm-dialog-repository-meta a { color: var(--dsm-accent); text-decoration: none; }
.dsm-dialog-repository-meta a:hover { text-decoration: underline; }
.dsm-inspection-gallery { min-width: 0; margin-top: 14px; }
.dsm-inspection-cover {
  width: 100%;
  height: clamp(150px, 25vh, 240px);
  border: 1px solid var(--dsm-border-2);
  border-radius: 10px;
  object-fit: contain;
  background: var(--dsm-bg-layer-1);
}
.dsm-inspection-thumbnails {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 72px;
  gap: 7px;
  margin-top: 8px;
  padding-bottom: 3px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
}
.dsm-inspection-thumbnails button {
  width: 72px;
  height: 50px;
  padding: 2px;
  overflow: hidden;
  border: 1px solid var(--dsm-border-2);
  border-radius: 6px;
  background: var(--dsm-bg-layer-1);
  cursor: pointer;
}
.dsm-inspection-thumbnails button[aria-pressed="true"] { border-color: var(--dsm-accent); }
.dsm-inspection-thumbnails button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }
.dsm-inspection-thumbnails img { width: 100%; height: 100%; display: block; object-fit: cover; }
.dsm-dialog-cover-fallback {
  height: 132px;
  display: grid;
  place-items: center;
  margin-top: 14px;
  border: 1px solid var(--dsm-border-2);
  border-radius: 10px;
  background: var(--dsm-bg-layer-1);
  color: var(--dsm-label-tertiary);
}
.dsm-dialog-cover-fallback .dsm-skill-file-icon { width: 42px; height: 49px; }
.dsm-dialog-state { display: grid; justify-items: center; gap: 7px; padding: 28px 16px; text-align: center; }
.dsm-dialog-state strong { font-size: 13px; }
.dsm-dialog-state p { max-width: 360px; margin: 0; color: var(--dsm-label-secondary); font-size: 11px; line-height: 1.55; }
.dsm-dialog-state-error strong { color: var(--dsm-error); }
.dsm-dialog-spinner { width: 20px; height: 20px; border: 2px solid var(--dsm-border-1); border-top-color: var(--dsm-accent); border-radius: 50%; animation: dsm-spin .8s linear infinite; }
@keyframes dsm-spin { to { transform: rotate(360deg); } }
.dsm-inspection-warning { margin-top: 10px; padding: 8px 10px; border-left: 3px solid var(--dsm-error); background: var(--dsm-error-bg); font-size: 12px; }
.dsm-inspection-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--dsm-border-2); }
.dsm-inspection-actions label { display: flex; align-items: center; gap: 7px; color: var(--dsm-label-secondary); font-size: 12px; }
.dsm-inspection-actions > span { color: var(--dsm-label-tertiary); font-size: 11px; }
.dsm-inspection-actions input, .dsm-inspection-select input { accent-color: var(--dsm-accent); }
.dsm-inspection-skills, .dsm-risk-findings { margin: 0; padding: 0; list-style: none; }
.dsm-inspection-skills > li { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--dsm-border-2); }
.dsm-inspection-select { display: flex; align-items: flex-start; justify-content: space-between; gap: 5px; }
.dsm-inspection-select .dsm-skill-file-icon { width: 22px; height: 26px; }
.dsm-integrity-risk { display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 7px; font-size: 11px; color: var(--dsm-label-secondary); }
.dsm-integrity-ok { color: var(--dsm-accent); }
.dsm-integrity-risk [data-risk="high"] { color: var(--dsm-error); }
.dsm-risk-findings { margin-top: 5px; color: var(--dsm-label-secondary); font-size: 11px; }
.dsm-risk-findings li { padding: 2px 0; }
.dsm-inspection-skills small { display: block; margin-top: 4px; color: var(--dsm-label-secondary); font-size: 11px; }
.dsm-inspection-skills small[data-result="success"] { color: var(--dsm-accent); }
.dsm-inspection-skills small[data-result="failure"] { color: var(--dsm-error); }
.dsm-readme { margin-top: 14px; border: 1px solid var(--dsm-border-2); border-radius: 6px; background: var(--dsm-bg-layer-1); }
.dsm-readme summary { padding: 9px 10px; color: var(--dsm-label-primary); font-size: 12px; cursor: pointer; }
.dsm-readme pre { max-height: 360px; overflow: auto; margin: 0; padding: 12px; border-top: 1px solid var(--dsm-border-2); color: var(--dsm-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.55 ui-monospace, Consolas, monospace; }
.dsm-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--dsm-border-2);
  background: var(--dsm-bg-base);
}
.dsm-dialog-footer p { max-width: 270px; margin: 0; color: var(--dsm-label-secondary); font-size: 10px; line-height: 1.45; }
.dsm-dialog-footer > div { display: flex; gap: 8px; }
.dsm-dialog-cancel, .dsm-dialog-confirm {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--dsm-border-1);
  border-radius: 18px;
  background: transparent;
  color: var(--dsm-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsm-dialog-confirm { border-color: var(--dsm-accent); background: var(--dsm-accent); color: var(--dsm-accent-label); }
.dsm-dialog-cancel:focus-visible, .dsm-dialog-confirm:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-dialog-cancel:disabled, .dsm-dialog-confirm:disabled { cursor: default; opacity: .5; }
.dsm-market-details {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsm-market-details p { min-width: 0; flex: 1 1 auto; }
.dsm-market-details button {
  flex: 0 0 auto;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--dsm-accent);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsm-market-details button:hover:not(:disabled) { text-decoration: underline; }
.dsm-market-details button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-market-details button:disabled { cursor: default; opacity: .56; }
.dsm-market-meta {
  min-width: 0;
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  color: var(--dsm-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsm-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.dsm-tags span {
  padding: 2px 7px;
  border: 1px solid var(--dsm-border-2);
  border-radius: 999px;
  color: var(--dsm-label-secondary);
  background: var(--dsm-bg-layer-1);
  font-size: 10px;
}
.dsm-source-link {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--dsm-label-secondary);
}
.dsm-source-link:hover { background: var(--dsm-hover); color: var(--dsm-label-primary); }
.dsm-source-link:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-skill-icon {
  width: 28px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
  color: var(--dsm-label-secondary);
}
.dsm-skill-icon-market { width: 40px; height: 44px; }
.dsm-skill-icon-market .dsm-skill-file-icon { width: 32px; height: 37px; }
.dsm-skill-file-icon { width: 24px; height: 28px; overflow: visible; }
.dsm-skill-file-paper, .dsm-skill-file-fold {
  stroke-linecap: round;
  stroke-linejoin: round;
}
.dsm-skill-file-paper { fill: var(--dsm-bg-layer-1); stroke: currentColor; stroke-width: 1.4; }
.dsm-skill-file-fold { fill: var(--dsm-bg-layer-2); stroke: currentColor; stroke-width: 1.4; }
.dsm-skill-copy { min-width: 0; }
.dsm-skill-heading { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsm-skill-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; letter-spacing: 0; }
.dsm-skill-heading span { flex: 0 0 auto; color: var(--dsm-label-secondary); font-size: 11px; }
.dsm-update-state {
  min-width: 0;
  padding-left: 8px;
  border-left: 1px solid var(--dsm-border-1);
  white-space: nowrap;
}
.dsm-update-state[data-status="update-available"] { color: var(--dsm-accent); }
.dsm-update-state[data-status="local-modified"] { color: var(--dsm-error); }
.dsm-skill-copy p {
  margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsm-label-secondary); font-size: 12px;
}
.dsm-provenance-state {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 5px;
  color: var(--dsm-label-secondary);
  font-size: 11px;
}
.dsm-provenance-state[data-status="matched"] { color: var(--dsm-accent); }
.dsm-provenance-state[data-status="unavailable"] { color: var(--dsm-error); }
.dsm-provenance-state button {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.dsm-provenance-state button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-skill-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
.dsm-row-button {
  min-width: 48px;
  height: 30px;
  padding: 0 9px;
  font-size: 12px;
}
.dsm-row-button-accent { border-color: var(--dsm-accent); color: var(--dsm-accent); }
.dsm-row-button-danger { border-color: var(--dsm-error); color: var(--dsm-error); }
.dsm-backups {
  margin: -2px 0 0 42px;
  padding: 0 0 10px 12px;
  border-left: 2px solid var(--dsm-accent);
}
.dsm-backups ul { margin: 0; padding: 0; list-style: none; }
.dsm-backups li {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--dsm-border-2);
}
.dsm-backups li:first-child { border-top: 0; }
.dsm-backups li > div { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 5px 10px; }
.dsm-backups strong { font-size: 12px; font-variant-numeric: tabular-nums; }
.dsm-backups span, .dsm-backups time {
  color: var(--dsm-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsm-backup-empty { margin: 0; padding: 10px 0; color: var(--dsm-label-secondary); font-size: 12px; }
.dsm-switch { position: relative; width: 36px; height: 22px; display: block; }
.dsm-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.dsm-switch-track {
  position: absolute; inset: 1px 0; border-radius: 10px;
  background: var(--dsm-module); transition: background-color 160ms ease;
}
.dsm-switch-track::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--dsm-bg-base); border: 1px solid var(--dsm-border-1); box-shadow: 0 1px 3px rgba(0,0,0,.18); transition: transform 160ms ease;
}
.dsm-switch input:checked + .dsm-switch-track { background: var(--dsm-accent); }
.dsm-switch input:checked + .dsm-switch-track::after { transform: translateX(16px); }
.dsm-switch input:disabled + .dsm-switch-track { opacity: .52; }
.dsm-empty { margin: 0; padding: 36px 12px; text-align: center; color: var(--dsm-label-secondary); font-size: 13px; }
.dsm-sync section + section { margin-top: 18px; }
.dsm-sync h3 { margin: 8px 0 4px; color: var(--dsm-label-secondary); font-size: 12px; font-weight: 600; }
.dsm-sync-section-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 8px; }
.dsm-sync-section-header h3 { margin: 0 0 4px; color: var(--dsm-label-primary); font-size: 13px; }
.dsm-sync-section-header p { margin: 0; color: var(--dsm-label-tertiary); font-size: 11px; }
.dsm-bulk-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.dsm-bulk-actions button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--dsm-border-1);
  border-radius: 6px;
  background: var(--dsm-module);
  color: var(--dsm-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsm-bulk-actions .dsm-bulk-primary { border-color: var(--dsm-accent); color: var(--dsm-accent); }
.dsm-bulk-actions button:disabled { cursor: default; opacity: .5; }
.dsm-sync-source-filters { padding: 10px 0 4px; }
.dsm-sync-row { border-bottom: 1px solid var(--dsm-border-2); }
.dsm-select { width: 28px; display: flex; justify-content: center; }
.dsm-select input { width: 15px; height: 15px; accent-color: var(--dsm-accent); }
.dsm-sync-managed { display: grid; grid-template-columns: 28px minmax(0, 1fr) minmax(280px, auto); gap: 10px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--dsm-border-2); }
.dsm-targets { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.dsm-target-toggle { min-width: 106px; display: grid; grid-template-columns: minmax(0, 1fr) 36px; align-items: center; column-gap: 8px; }
.dsm-target-toggle > span:first-child { font-size: 12px; }
.dsm-target-toggle small { grid-column: 1; color: var(--dsm-label-tertiary); font-size: 10px; white-space: nowrap; }
.dsm-target-toggle > .dsm-switch { grid-column: 2; grid-row: 1 / span 2; }
.dsm-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 640px) {
  .dsm-panel { padding-inline: 14px; }
  .dsm-header { align-items: flex-start; flex-direction: column; }
  .dsm-primary-tabs { width: 100%; }
  .dsm-toolbar { width: 100%; }
  .dsm-search { width: auto; flex: 1 1 180px; }
  .dsm-update-check { flex: 0 0 auto; }
  .dsm-market-search { flex: 1 1 auto; }
  .dsm-market-search .dsm-search { min-width: 0; }
  .dsm-tabs { width: 100%; }
  .dsm-maintenance-options { grid-template-columns: 1fr; }
  .dsm-market-source-bar, .dsm-market-category-bar { align-items: flex-start; flex-direction: column; }
  .dsm-source-warning { text-align: left; }
  .dsm-create { grid-template-columns: 1fr; }
  .dsm-field-grid { grid-template-columns: 1fr; }
  .dsm-create-actions { justify-content: flex-end; }
  .dsm-row { grid-template-columns: 28px minmax(0, 1fr); padding: 10px 0; }
  .dsm-skill-item > .dsm-row { grid-template-columns: 28px 28px minmax(0, 1fr) auto; }
  .dsm-skill-item > .dsm-row > .dsm-skill-actions { grid-column: 4; justify-content: flex-end; flex-wrap: wrap; }
  .dsm-sync-row > .dsm-row-button { grid-column: 2; justify-self: start; }
  .dsm-sync-managed { grid-template-columns: 28px minmax(0, 1fr); }
  .dsm-sync-section-header { align-items: flex-start; flex-direction: column; }
  .dsm-bulk-actions { justify-content: flex-start; }
  .dsm-targets { grid-column: 2; justify-content: flex-start; }
  .dsm-backups { margin-left: 38px; }
  .dsm-backups li { align-items: flex-start; flex-direction: column; padding: 9px 0; }
  .dsm-repository-row { grid-template-columns: minmax(0, 1fr); padding: 10px 0; }
  .dsm-repository-open { grid-template-columns: 34px minmax(0, 1fr); }
  .dsm-repository-row .dsm-market-actions { grid-column: 1; justify-content: flex-start; padding-left: 46px; }
  .dsm-inspection-actions { align-items: flex-start; flex-direction: column; }
  .dsm-modal-backdrop { padding: 12px; }
  .dsm-install-dialog { width: min(100%, 480px); max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); border-radius: 16px; }
  .dsm-dialog-header { padding: 16px 16px 10px; }
  .dsm-dialog-scroll { padding: 0 16px; }
  .dsm-publisher { grid-template-columns: 36px minmax(0, 1fr); }
  .dsm-publisher > .dsm-market-meta { grid-column: 2; justify-content: flex-start; }
  .dsm-dialog-footer { align-items: stretch; flex-direction: column; padding: 12px 16px 16px; }
  .dsm-dialog-footer p { max-width: none; }
  .dsm-dialog-footer > div { justify-content: flex-end; }
}
@media (max-width: 520px) {
  .dsm-skill-item > .dsm-row {
    grid-template-columns: 28px 28px minmax(0, 1fr);
    grid-template-areas:
      "select icon copy"
      ". . actions";
    align-items: start;
  }
  .dsm-skill-item > .dsm-row > .dsm-select { grid-area: select; align-self: center; }
  .dsm-skill-item > .dsm-row > .dsm-skill-icon { grid-area: icon; }
  .dsm-skill-item > .dsm-row > .dsm-skill-copy { grid-area: copy; }
  .dsm-skill-item > .dsm-row > .dsm-skill-actions { grid-area: actions; justify-content: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .dsm-switch-track, .dsm-switch-track::after { transition: none; }
  .dsm-dialog-spinner { animation: none; }
}
`;
return module.exports; } });

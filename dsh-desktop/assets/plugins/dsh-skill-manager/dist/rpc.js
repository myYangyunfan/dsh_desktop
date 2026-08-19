import { createRequire as __dsmCreateRequire } from 'node:module'; const require = __dsmCreateRequire(import.meta.url);

// src/rpc.ts
var RPC_SCHEMA_VERSION = 1;
function createSkillManagerRpcHandlers(dependencies) {
  const {
    manager,
    marketplace,
    provenanceMarketplace = marketplace,
    resolver,
    repositoryDiscovery,
    repositoryInspector,
    snapshotResolver,
    riskAssessor,
    mediaResolver,
    buildId = "dsh-skill-manager@0.0.0"
  } = dependencies;
  return {
    list(request) {
      return runRpc(request, async () => ({ skills: await manager.listSkills() }));
    },
    create(request) {
      return runRpc(request, async () => ({
        skill: await manager.createSkill({
          name: request.name,
          description: request.description
        })
      }));
    },
    setEnabled(request) {
      return runRpc(request, async () => ({
        skill: await manager.setTargetEnabled({
          name: request.name,
          target: "dsh",
          enabled: request.enabled
        })
      }));
    },
    getCapabilities(request) {
      return runRpc(request, async () => ({
        capabilities: {
          protocolVersion: 5,
          buildId,
          features: {
            marketplaceV2: repositoryDiscovery !== void 0 && snapshotResolver !== void 0,
            repositoryInspection: repositoryInspector !== void 0,
            mediaProxy: mediaResolver !== void 0,
            indexCatalog: false,
            riskAssessment: riskAssessor !== void 0,
            githubTrending: repositoryDiscovery !== void 0,
            skillClassification: repositoryInspector !== void 0,
            provenanceV2: false,
            updateRiskGate: snapshotResolver !== void 0 && riskAssessor !== void 0,
            repositoryBatchAnalysis: snapshotResolver?.resolveRepositorySnapshots !== void 0,
            repositoryBatchInstall: snapshotResolver?.resolveRepositorySnapshots !== void 0,
            batchProvenance: false,
            skillsShDiscoveryHints: false
          }
        }
      }));
    },
    searchRepositories(request) {
      return runRpc(request, async () => ({
        result: await requireV2(repositoryDiscovery, "Repository discovery").searchRepositories({
          query: request.query,
          ...request.sort === void 0 ? {} : { sort: request.sort },
          ...request.page === void 0 ? {} : { page: request.page },
          ...request.limit === void 0 ? {} : { limit: request.limit }
        })
      }));
    },
    browseRepositories(request) {
      return runRpc(request, async () => ({
        result: await requireV2(repositoryDiscovery, "Repository discovery").browseRepositories({
          ...request.sort === void 0 ? {} : { sort: request.sort },
          ...request.page === void 0 ? {} : { page: request.page },
          ...request.limit === void 0 ? {} : { limit: request.limit }
        })
      }));
    },
    inspectRepository(request) {
      return runRpc(request, async () => await requireV2(repositoryInspector, "Repository inspection").inspectRepository({
        repository: request.repository
      }));
    },
    installSkill(request) {
      return runRpc(request, async () => {
        const resolved = await requireV2(snapshotResolver, "Skill snapshot resolution").resolveSkillSnapshot({
          repository: request.repository,
          skillPath: request.skillPath
        }, { refreshCommit: false });
        const assessment = requireV2(riskAssessor, "Skill risk assessment").assessResolvedSkillRisk(resolved);
        if (assessment.risk === "unknown") {
          throw codedError(
            "SKILL_RISK_UNKNOWN",
            "The final fixed-commit Skill snapshot could not be assessed. Retry before installation."
          );
        }
        if (assessment.risk === "high" && request.acknowledgeHighRisk !== true) {
          throw codedError(
            "SKILL_RISK_CONFIRMATION_REQUIRED",
            "The final fixed-commit Skill snapshot has high-risk findings. Review them and confirm installation again."
          );
        }
        return { skill: await manager.installSkillSnapshot({ resolved }) };
      });
    },
    installRepository(request) {
      return runRpc(request, async () => {
        const resolverPort = requireV2(snapshotResolver, "Skill snapshot resolution");
        if (resolverPort.resolveRepositorySnapshots === void 0) {
          throw codedError("MARKETPLACE_V2_UNAVAILABLE", "Repository batch installation is not configured.");
        }
        const assessor = requireV2(riskAssessor, "Skill risk assessment");
        return await withHardDeadline(async (signal) => {
          const batch = await resolverPort.resolveRepositorySnapshots({
            repository: request.repository,
            ...request.selection.mode === "paths" ? { skillPaths: request.selection.paths } : {}
          }, { signal, refreshCommit: false });
          const installed = await manager.listSkills();
          const acknowledged = new Set(request.acknowledgeHighRiskPaths ?? []);
          const results = [];
          for (const failure2 of batch.failures) {
            results.push({ skillPath: failure2.skillPath, status: "failed", error: { code: failure2.code, message: failure2.message } });
          }
          for (const resolved of batch.snapshots) {
            if (signal.aborted) throw codedError("MARKETPLACE_RESOLUTION_TIMEOUT", "Repository installation exceeded 60000 ms.");
            const existing = installed.find((skill) => skill.source?.kind === "github" && skill.source.repositoryId === resolved.repository.repositoryId && skill.source.path === resolved.skill.path);
            const assessment = assessor.assessResolvedSkillRisk(resolved);
            if (existing !== void 0) {
              results.push({ skillPath: resolved.skill.path, status: "already-installed", skill: existing, assessment });
              continue;
            }
            if (assessment.risk === "unknown") {
              results.push({
                skillPath: resolved.skill.path,
                status: "failed",
                assessment,
                error: { code: "SKILL_RISK_UNKNOWN", message: "The final fixed-commit Skill snapshot could not be assessed. Retry before installation." }
              });
              continue;
            }
            if (assessment.risk === "high" && !acknowledged.has(resolved.skill.path)) {
              results.push({ skillPath: resolved.skill.path, status: "needs-confirmation", assessment });
              continue;
            }
            try {
              const skill = await manager.installSkillSnapshot({ resolved });
              results.push({ skillPath: resolved.skill.path, status: "installed", skill, assessment });
              installed.push(skill);
            } catch (error) {
              const code = isCodedError(error) && error.code === "SKILL_ALREADY_EXISTS" ? "SKILL_NAME_CONFLICT" : isCodedError(error) ? error.code : "INSTALL_FAILED";
              const message = code === "SKILL_NAME_CONFLICT" ? `A different installed Skill already uses the name "${resolved.skill.name}".` : error instanceof Error ? error.message : "Skill installation failed.";
              results.push({ skillPath: resolved.skill.path, status: "failed", assessment, error: { code, message } });
            }
          }
          return { results };
        }, 6e4, "MARKETPLACE_RESOLUTION_TIMEOUT", "Repository installation exceeded 60000 ms.");
      });
    },
    verifyProvenanceBatch(request) {
      return runRpc(request, async () => {
        throw codedError(
          "PROVENANCE_MATCHING_DISABLED",
          "Local-to-GitHub source matching is temporarily disabled to protect the GitHub API allowance."
        );
      });
    },
    assessSkillRisk(request) {
      return runRpc(request, async () => ({
        assessment: await requireV2(riskAssessor, "Skill risk assessment").assessSkillRisk({
          repository: request.repository,
          skillPath: request.skillPath
        })
      }));
    },
    resolveMedia(request) {
      return runRpc(request, async () => ({
        asset: await requireV2(mediaResolver, "Media resolution").resolveMedia(request.source)
      }));
    },
    verifyProvenance(request) {
      return runRpc(request, async () => {
        throw codedError(
          "PROVENANCE_MATCHING_DISABLED",
          "Local-to-GitHub source matching is temporarily disabled to protect the GitHub API allowance."
        );
      });
    },
    checkUpdates(request) {
      return runRpc(request, async () => ({
        checks: await manager.checkUpdates(
          request.names === void 0 ? {} : { names: request.names }
        )
      }));
    },
    update(request) {
      return runRpc(request, async () => manager.updateSkill({
        name: request.name,
        ...request.acknowledgeHighRisk === void 0 ? {} : { acknowledgeHighRisk: request.acknowledgeHighRisk }
      }));
    },
    listBackups(request) {
      return runRpc(request, async () => ({
        backups: await manager.listBackups(
          request.name === void 0 ? {} : { name: request.name }
        )
      }));
    },
    rollback(request) {
      return runRpc(request, async () => manager.rollbackSkill({
        name: request.name,
        backupId: request.backupId
      }));
    },
    delete(request) {
      return runRpc(request, async () => ({ deleted: await manager.deleteSkill({ name: request.name }) }));
    },
    listTrash(request) {
      return runRpc(request, async () => ({ trashed: await manager.listTrash() }));
    },
    restoreTrash(request) {
      return runRpc(request, async () => ({
        skill: await manager.restoreTrash({ name: request.name, trashId: request.trashId })
      }));
    },
    discoverExternal(request) {
      return runRpc(request, async () => ({ candidates: await manager.discoverExternalSkills(request.targets === void 0 ? {} : { targets: request.targets }) }));
    },
    importExternal(request) {
      return runRpc(request, async () => ({ skill: await manager.importSkill({ target: request.target, name: request.name }) }));
    },
    listTargetStates(request) {
      return runRpc(request, async () => ({ states: await manager.listTargetStates({
        ...request.names === void 0 ? {} : { names: request.names },
        ...request.targets === void 0 ? {} : { targets: request.targets }
      }) }));
    },
    setTargetEnabled(request) {
      return runRpc(request, async () => ({ skill: await manager.setTargetEnabled({ name: request.name, target: request.target, enabled: request.enabled }) }));
    }
  };
}
async function runRpc(request, operation) {
  if (request.schemaVersion !== RPC_SCHEMA_VERSION) {
    return failure(
      "UNSUPPORTED_SCHEMA_VERSION",
      `Unsupported RPC schema version "${String(request.schemaVersion)}".`
    );
  }
  try {
    return {
      schemaVersion: RPC_SCHEMA_VERSION,
      ok: true,
      data: await operation()
    };
  } catch (error) {
    if (isCodedError(error)) {
      return failure(error.code, error.message);
    }
    return failure("INTERNAL_ERROR", "Skill Manager operation failed.");
  }
}
function isCodedError(error) {
  return error instanceof Error && typeof error.code === "string";
}
function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}
function requireV2(value, label) {
  if (value !== void 0) return value;
  throw codedError("MARKETPLACE_V2_UNAVAILABLE", `${label} is not configured.`);
}
async function withHardDeadline(operation, timeoutMs, code, message) {
  const controller = new AbortController();
  let rejectDeadline = () => void 0;
  const expiry = new Promise((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectDeadline(codedError(code, message));
  }, timeoutMs);
  try {
    return await Promise.race([operation(controller.signal), expiry]);
  } finally {
    clearTimeout(timer);
  }
}
function failure(code, message) {
  return {
    schemaVersion: RPC_SCHEMA_VERSION,
    ok: false,
    error: { code, message }
  };
}
export {
  RPC_SCHEMA_VERSION,
  createSkillManagerRpcHandlers
};

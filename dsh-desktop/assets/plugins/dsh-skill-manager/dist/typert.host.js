import { createRequire as __dsmCreateRequire } from 'node:module'; const require = __dsmCreateRequire(import.meta.url);

// src/typert.host.ts
import { z } from "zod";

// src/rpc.ts
var RPC_SCHEMA_VERSION = 1;

// src/typert.host.ts
var PACKAGE_NAME = "dsh-skill-manager";
var SERVICE_NAME = "skillManager";
var skillTargetSchema = z.enum(["dsh", "codex", "claude", "agents", "opencode"]);
var skillOriginSchema = z.enum([
  "self",
  "local-import",
  "github",
  "skills-sh",
  "hugging-face"
]);
var localImportSourceSchema = z.object({
  kind: z.literal("local-import"),
  name: z.string(),
  target: z.enum(["codex", "claude", "agents", "opencode"])
}).strict();
var githubSourceSchema = z.object({
  kind: z.literal("github"),
  repository: z.string(),
  path: z.string(),
  commitSha: z.string(),
  blobSha: z.string(),
  bundleHash: z.string(),
  manifestFiles: z.array(z.string()).optional(),
  catalog: z.enum(["skills-sh", "github", "hugging-face"]),
  url: z.string(),
  repositoryId: z.number().int().positive().optional(),
  nodeId: z.string().optional(),
  matchMethod: z.enum(["install", "exact-content"]).optional(),
  matchedAt: z.string().optional(),
  identityFingerprint: z.object({
    version: z.literal("dsm-skill-fingerprint-v1"),
    hash: z.string().regex(/^[a-f0-9]{64}$/iu)
  }).strict().optional(),
  discoverySources: z.array(z.enum(["skills-sh", "github", "hugging-face"])).optional()
}).strict();
var managedSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  origin: skillOriginSchema,
  enabledTargets: z.array(skillTargetSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentHash: z.string(),
  source: z.union([localImportSourceSchema, githubSourceSchema]).optional(),
  provenanceCheck: z.object({
    status: z.enum(["no-match", "custom", "ambiguous", "ineligible"]),
    checkedAt: z.string()
  }).strict().optional()
}).strict();
var failureSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).strict()
}).strict();
var versionedRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION)
}).strict();
var createRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  description: z.string()
}).strict();
var setEnabledRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  enabled: z.boolean()
}).strict();
var repositorySortSchema = z.enum(["popular", "latest", "trend-weekly", "trend-monthly", "relevance"]);
var repositoryIdentitySchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/u),
  name: z.string().regex(/^[A-Za-z0-9_.-]+$/u)
}).strict();
var getCapabilitiesRequestSchema = versionedRequestSchema;
var searchRepositoriesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  query: z.string().min(2).max(256),
  sort: repositorySortSchema.optional(),
  page: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();
var browseRepositoriesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  sort: repositorySortSchema.optional(),
  page: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();
var inspectRepositoryRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  repository: repositoryIdentitySchema
}).strict();
var skillIntentSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  repository: repositoryIdentitySchema,
  skillPath: z.string().min(1).max(512).refine((path) => path === "." || !path.startsWith("/") && !path.includes("\\") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), "Unsafe Skill path"),
  acknowledgeHighRisk: z.boolean().optional()
}).strict();
var safeSkillPathSchema = z.string().min(1).max(512).refine((path) => path === "." || !path.startsWith("/") && !path.includes("\\") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), "Unsafe Skill path");
var installRepositoryRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  repository: repositoryIdentitySchema,
  selection: z.union([
    z.object({ mode: z.literal("all") }).strict(),
    z.object({ mode: z.literal("paths"), paths: z.array(safeSkillPathSchema).min(1).max(512) }).strict()
  ]),
  acknowledgeHighRiskPaths: z.array(safeSkillPathSchema).max(512).optional()
}).strict();
var mediaSourceSchema = z.union([
  z.object({ type: z.literal("repo-blob"), repo: z.string(), commit: z.string(), path: z.string() }).strict(),
  z.object({ type: z.literal("github-avatar"), owner: z.string(), accountId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("github-social-preview"), repo: z.string() }).strict(),
  z.object({ type: z.literal("generated"), seed: z.string() }).strict()
]);
var discoverySignalSchema = z.object({
  source: z.enum(["skills-sh", "github", "hugging-face", "index"]),
  kind: z.enum(["format-topic", "metadata", "registry", "index", "ordinary-search"]),
  label: z.string()
}).strict();
var classificationEvidenceSchema = z.object({
  source: z.enum(["skill-frontmatter", "skills-manifest", "github-topic", "name", "description", "readme"]),
  value: z.string()
}).strict();
var skillClassificationSchema = z.object({
  primaryCategory: z.enum(["agent", "automation", "development", "data", "design", "content", "research", "business", "finance", "security", "creative", "life", "general"]),
  tags: z.array(z.string()).max(3),
  evidence: z.array(classificationEvidenceSchema),
  confidence: z.enum(["explicit", "topic", "keyword", "none"])
}).strict();
var repositoryTrendSchema = z.object({
  weeklyStars: z.number().int().nonnegative().nullable(),
  monthlyStars: z.number().int().nonnegative().nullable(),
  observedAt: z.string(),
  source: z.literal("github-trending-html"),
  stale: z.boolean()
}).strict();
var repositoryCandidateSchema = z.object({
  repositoryId: z.number().int().nonnegative(),
  nodeId: z.string(),
  repoKey: z.string(),
  host: z.literal("github"),
  owner: z.string(),
  ownerId: z.number().int().nonnegative(),
  ownerType: z.enum(["User", "Organization", "Bot"]),
  ownerAvatar: mediaSourceSchema,
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  url: z.string().url(),
  defaultBranch: z.string(),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  pushedAt: z.string(),
  topics: z.array(z.string()),
  formatTopics: z.array(z.string()),
  categoryTopics: z.array(z.string()),
  archived: z.boolean(),
  license: z.string().nullable(),
  knownSkillCount: z.number().int().nonnegative().nullable(),
  classification: skillClassificationSchema,
  trend: repositoryTrendSchema.nullable(),
  cover: mediaSourceSchema,
  discovery: z.object({
    signals: z.array(discoverySignalSchema),
    discoveredAt: z.string()
  }).strict()
}).strict();
var repositoryQueryResultSchema = z.object({
  source: z.literal("github"),
  query: z.string().nullable(),
  sort: repositorySortSchema,
  page: z.number().int().min(1),
  returnedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  incomplete: z.boolean(),
  dataUpdatedAt: z.string(),
  sourceState: z.enum(["live", "cached", "unavailable", "empty"]),
  sourceMessage: z.string().nullable(),
  repositories: z.array(repositoryCandidateSchema)
}).strict();
var marketplacePartyV2Schema = z.object({ name: z.string(), url: z.string().nullable() }).strict();
var skillDescriptorSchema = z.object({
  skillKey: z.string(),
  repositoryId: z.number().int().nonnegative(),
  path: z.string(),
  name: z.string(),
  description: z.string(),
  classification: skillClassificationSchema,
  author: marketplacePartyV2Schema.nullable(),
  structureStatus: z.enum(["invalid", "parsed", "structure-verified"]),
  validatedAtCommit: z.string().regex(/^[a-f0-9]{40}$/iu),
  skillDocumentBlobSha: z.string().regex(/^[a-f0-9]{40}$/iu),
  manifestFiles: z.array(z.string()),
  installable: z.boolean(),
  warnings: z.array(z.string())
}).strict();
var repositoryInspectionSchema = z.object({
  repository: repositoryCandidateSchema,
  inspectionCommit: z.string().regex(/^[a-f0-9]{40}$/iu),
  inspectedAt: z.string(),
  status: z.enum(["inspected", "structure-verified"]),
  readme: z.object({
    path: z.string(),
    title: z.string().nullable(),
    content: z.string(),
    blobSha: z.string().regex(/^[a-f0-9]{40}$/iu)
  }).strict().nullable(),
  manifestPaths: z.array(z.string()),
  declaredSkillPaths: z.array(z.string()),
  skills: z.array(skillDescriptorSchema),
  media: z.array(mediaSourceSchema),
  warnings: z.array(z.string())
}).strict();
var riskAssessmentSchema = z.object({
  risk: z.enum(["unknown", "low", "medium", "high"]),
  findings: z.array(z.object({
    code: z.string(),
    severity: z.enum(["info", "warning", "high"]),
    title: z.string(),
    detail: z.string(),
    file: z.string()
  }).strict()),
  scannerVersion: z.string()
}).strict();
var repositoryInspectionResultSchema = z.object({
  inspection: repositoryInspectionSchema,
  assessments: z.array(z.object({
    skillPath: z.string(),
    assessment: riskAssessmentSchema
  }).strict())
}).strict();
var repositoryInstallResultSchema = z.object({
  skillPath: z.string(),
  status: z.enum(["installed", "already-installed", "needs-confirmation", "failed"]),
  skill: managedSkillSchema.optional(),
  assessment: riskAssessmentSchema.optional(),
  error: z.object({ code: z.string(), message: z.string() }).strict().optional()
}).strict();
var mediaAssetSchema = z.object({
  source: mediaSourceSchema,
  dataUrl: z.string().startsWith("data:image/"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096)
}).strict();
var resolveMediaRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  source: mediaSourceSchema
}).strict();
var capabilitiesSchema = z.object({
  protocolVersion: z.number().int().min(1),
  buildId: z.string(),
  features: z.object({
    marketplaceV2: z.boolean(),
    repositoryInspection: z.boolean(),
    mediaProxy: z.boolean(),
    indexCatalog: z.boolean(),
    riskAssessment: z.boolean(),
    githubTrending: z.boolean(),
    skillClassification: z.boolean(),
    provenanceV2: z.boolean(),
    updateRiskGate: z.boolean(),
    repositoryBatchAnalysis: z.boolean(),
    repositoryBatchInstall: z.boolean(),
    batchProvenance: z.boolean(),
    skillsShDiscoveryHints: z.boolean()
  }).strict()
}).strict();
var searchMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  query: z.string(),
  limit: z.number().int().optional()
}).strict();
var browseMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  offset: z.number().int().min(0).max(1e5).optional(),
  limit: z.number().int().min(1).max(200).optional()
}).strict();
var marketplacePartySchema = z.object({
  name: z.string(),
  url: z.string().nullable()
}).strict();
var marketplaceEntrySchema = z.object({
  id: z.string(),
  source: z.enum(["skills-sh", "github", "hugging-face"]),
  catalogs: z.array(z.enum(["skills-sh", "github", "hugging-face"])),
  name: z.string(),
  description: z.string().nullable(),
  publisher: marketplacePartySchema.nullable(),
  author: marketplacePartySchema.nullable(),
  repository: z.object({
    host: z.literal("github"),
    owner: z.string(),
    name: z.string(),
    path: z.string().nullable(),
    url: z.string()
  }).strict(),
  skillUrl: z.string(),
  install: z.object({
    kind: z.literal("github"),
    repository: z.string(),
    skill: z.string(),
    path: z.string().nullable()
  }).strict(),
  metrics: z.object({
    installs: z.object({
      value: z.number().int().nonnegative(),
      source: z.literal("skills.sh")
    }).strict().nullable(),
    stars: z.object({
      value: z.number().int().nonnegative(),
      source: z.literal("github"),
      scope: z.literal("repository")
    }).strict().nullable(),
    downloads: z.number().int().nonnegative().nullable()
  }).strict(),
  cover: z.object({
    kind: z.literal("generated"),
    seed: z.string()
  }).strict()
}).strict();
var resolveMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  entry: marketplaceEntrySchema
}).strict();
var installMarketplaceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  entry: marketplaceEntrySchema
}).strict();
var verifyProvenanceRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string()
}).strict();
var checkUpdatesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  names: z.array(z.string()).optional()
}).strict();
var updateSkillRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  acknowledgeHighRisk: z.boolean().optional()
}).strict();
var listBackupsRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string().optional()
}).strict();
var rollbackSkillRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  backupId: z.uuid()
}).strict();
var deleteSkillRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string()
}).strict();
var restoreTrashRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  trashId: z.uuid()
}).strict();
var externalTargetSchema = z.enum(["codex", "claude", "agents", "opencode"]);
var discoverExternalRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  targets: z.array(externalTargetSchema).optional()
}).strict();
var importExternalRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  target: externalTargetSchema,
  name: z.string()
}).strict();
var listTargetStatesRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  names: z.array(z.string()).optional(),
  targets: z.array(externalTargetSchema).optional()
}).strict();
var setTargetEnabledRequestSchema = z.object({
  schemaVersion: z.literal(RPC_SCHEMA_VERSION),
  name: z.string(),
  target: externalTargetSchema,
  enabled: z.boolean()
}).strict();
var resolvedMarketplaceEntrySchema = marketplaceEntrySchema.extend({
  description: z.string(),
  repository: z.object({
    host: z.literal("github"),
    id: z.number().int().nonnegative(),
    nodeId: z.string(),
    owner: z.string(),
    name: z.string(),
    path: z.string(),
    url: z.string()
  }).strict(),
  install: z.object({
    kind: z.literal("github"),
    repository: z.string(),
    skill: z.string(),
    path: z.string()
  }).strict(),
  snapshot: z.object({
    commitSha: z.string(),
    blobSha: z.string(),
    fetchedAt: z.string(),
    manifestFiles: z.array(z.string()).optional()
  }).strict()
}).strict();
var marketplaceSearchResultSchema = z.object({
  source: z.enum(["skills-sh", "github", "hugging-face", "composite"]),
  query: z.string(),
  returnedCount: z.number().int().nonnegative(),
  entries: z.array(marketplaceEntrySchema),
  sources: z.array(z.object({
    source: z.enum(["skills-sh", "github", "hugging-face"]),
    status: z.enum(["available", "unavailable"]),
    returnedCount: z.number().int().nonnegative(),
    error: z.object({
      code: z.string(),
      message: z.string()
    }).strict().nullable()
  }).strict())
}).strict();
var marketplaceBrowseResultSchema = z.object({
  source: z.literal("skills-sh"),
  ranking: z.literal("all-time-installs"),
  offset: z.number().int().nonnegative(),
  returnedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  entries: z.array(marketplaceEntrySchema)
}).strict();
var snapshotSchema = z.object({
  commitSha: z.string().regex(/^[a-f0-9]{40}$/iu),
  blobSha: z.string().regex(/^[a-f0-9]{40}$/iu),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/iu)
}).strict();
var updateCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["unsupported", "local-modified", "source-moved", "up-to-date", "update-available"]),
  installed: snapshotSchema.nullable(),
  latest: snapshotSchema.nullable(),
  latestRisk: riskAssessmentSchema.nullable(),
  checkedAt: z.string()
}).strict();
var backupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.string(),
  reason: z.enum(["update", "rollback"]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  snapshot: snapshotSchema.nullable()
}).strict();
var mutationResultSchema = z.object({
  skill: managedSkillSchema,
  backup: backupSchema
}).strict();
var trashedSkillSchema = z.object({
  name: z.string(),
  trashId: z.uuid(),
  description: z.string(),
  origin: skillOriginSchema,
  enabledTargets: z.array(skillTargetSchema),
  deletedAt: z.string(),
  expiresAt: z.string()
}).strict();
var provenanceVerificationSchema = z.object({
  name: z.string(),
  status: z.enum(["matched", "custom", "ambiguous", "ineligible"]),
  skill: managedSkillSchema
}).strict();
var provenanceBatchFailureSchema = z.object({
  name: z.string(),
  code: z.string(),
  message: z.string()
}).strict();
var externalCandidateSchema = z.object({
  name: z.string(),
  description: z.string(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  target: externalTargetSchema
}).strict();
var targetStateSchema = z.object({
  name: z.string(),
  target: externalTargetSchema,
  status: z.enum(["not-configured", "not-linked", "linked", "conflict"])
}).strict();
function successSchema(data) {
  return z.object({
    schemaVersion: z.literal(RPC_SCHEMA_VERSION),
    ok: z.literal(true),
    data
  }).strict();
}
function descriptor(method, request, result) {
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
      codec: {
        mode: "strict",
        typeSymbol: `${PACKAGE_NAME}#${method}#request`,
        schema: request
      }
    }],
    result: {
      mode: "strict",
      typeSymbol: `${PACKAGE_NAME}#${method}#result`,
      schema: result
    }
  };
}
var skillManagerDescriptors = [
  descriptor(
    "list",
    versionedRequestSchema,
    z.union([
      successSchema(z.object({ skills: z.array(managedSkillSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "create",
    createRequestSchema,
    z.union([
      successSchema(z.object({ skill: managedSkillSchema }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "setEnabled",
    setEnabledRequestSchema,
    z.union([
      successSchema(z.object({ skill: managedSkillSchema }).strict()),
      failureSchema
    ])
  ),
  descriptor("getCapabilities", getCapabilitiesRequestSchema, z.union([
    successSchema(z.object({ capabilities: capabilitiesSchema }).strict()),
    failureSchema
  ])),
  descriptor("searchRepositories", searchRepositoriesRequestSchema, z.union([
    successSchema(z.object({ result: repositoryQueryResultSchema }).strict()),
    failureSchema
  ])),
  descriptor("browseRepositories", browseRepositoriesRequestSchema, z.union([
    successSchema(z.object({ result: repositoryQueryResultSchema }).strict()),
    failureSchema
  ])),
  descriptor("inspectRepository", inspectRepositoryRequestSchema, z.union([
    successSchema(repositoryInspectionResultSchema),
    failureSchema
  ])),
  descriptor("installSkill", skillIntentSchema, z.union([
    successSchema(z.object({ skill: managedSkillSchema }).strict()),
    failureSchema
  ])),
  descriptor("installRepository", installRepositoryRequestSchema, z.union([
    successSchema(z.object({ results: z.array(repositoryInstallResultSchema) }).strict()),
    failureSchema
  ])),
  descriptor("assessSkillRisk", skillIntentSchema, z.union([
    successSchema(z.object({ assessment: riskAssessmentSchema }).strict()),
    failureSchema
  ])),
  descriptor("resolveMedia", resolveMediaRequestSchema, z.union([
    successSchema(z.object({ asset: mediaAssetSchema }).strict()),
    failureSchema
  ])),
  descriptor(
    "verifyProvenance",
    verifyProvenanceRequestSchema,
    z.union([
      successSchema(z.object({ verification: provenanceVerificationSchema }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "verifyProvenanceBatch",
    z.object({ schemaVersion: z.literal(RPC_SCHEMA_VERSION), names: z.array(z.string()).min(1).max(20) }).strict(),
    z.union([
      successSchema(z.object({
        results: z.array(provenanceVerificationSchema),
        failures: z.array(provenanceBatchFailureSchema).optional()
      }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "checkUpdates",
    checkUpdatesRequestSchema,
    z.union([
      successSchema(z.object({ checks: z.array(updateCheckSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "update",
    updateSkillRequestSchema,
    z.union([successSchema(mutationResultSchema), failureSchema])
  ),
  descriptor(
    "listBackups",
    listBackupsRequestSchema,
    z.union([
      successSchema(z.object({ backups: z.array(backupSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "rollback",
    rollbackSkillRequestSchema,
    z.union([successSchema(mutationResultSchema), failureSchema])
  ),
  descriptor(
    "delete",
    deleteSkillRequestSchema,
    z.union([successSchema(z.object({
      deleted: z.object({
        name: z.string(),
        trashId: z.uuid(),
        deletedAt: z.string()
      }).strict()
    }).strict()), failureSchema])
  ),
  descriptor(
    "listTrash",
    versionedRequestSchema,
    z.union([
      successSchema(z.object({ trashed: z.array(trashedSkillSchema) }).strict()),
      failureSchema
    ])
  ),
  descriptor(
    "restoreTrash",
    restoreTrashRequestSchema,
    z.union([successSchema(z.object({ skill: managedSkillSchema }).strict()), failureSchema])
  ),
  descriptor(
    "discoverExternal",
    discoverExternalRequestSchema,
    z.union([successSchema(z.object({ candidates: z.array(externalCandidateSchema) }).strict()), failureSchema])
  ),
  descriptor(
    "importExternal",
    importExternalRequestSchema,
    z.union([successSchema(z.object({ skill: managedSkillSchema }).strict()), failureSchema])
  ),
  descriptor(
    "listTargetStates",
    listTargetStatesRequestSchema,
    z.union([successSchema(z.object({ states: z.array(targetStateSchema) }).strict()), failureSchema])
  ),
  descriptor(
    "setTargetEnabled",
    setTargetEnabledRequestSchema,
    z.union([successSchema(z.object({ skill: managedSkillSchema }).strict()), failureSchema])
  )
];
var TYPERT = {
  package: PACKAGE_NAME,
  face: "host",
  schemas: [],
  invocations: skillManagerDescriptors,
  model: {
    services: [],
    events: [],
    objects: []
  }
};
export {
  TYPERT,
  skillManagerDescriptors
};

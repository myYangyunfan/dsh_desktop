/**
 * dsh-context v0.82.1
 * A DeepSeek Harness plugin for context insight and management, with context dashboard and context command, for understanding how the context is made of, and how it evolves.
 * @author bowenliang123
 * @license Apache-2.0
 * @homepage https://github.com/bowenliang123/dsh-context
 * @built 2026-11-06T09:28:50+00:00
 * @commit b53e60444cd0
 * @commit-date 2026-11-06T17:25:54+08:00
 */

import { z } from "zod";
import "@deepseek-ai/dsh-session";
import z$1 from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
interface ToolStart {
  start: number;
  day: string;
  name?: string;
}
interface ActivityState {
  days: Record<string, ActivityDay>;
  model?: string;
  provider?: string;
  stepStart?: number;
  lastTurn?: number;
  toolStarts?: Record<string, ToolStart | undefined>;
  skillCalls?: string[];
}
interface StoredHeaderTool {
  name: string;
  tokens: number;
  description?: string;
  plugin?: string;
  schema?: unknown;
}
interface StoredHeaderRecord {
  seq: number;
  time: number;
  system?: string;
  systemTokens?: number;
  tools: StoredHeaderTool[];
}
interface HeadersState {
  headers: StoredHeaderRecord[];
}
interface CommandStateRecord extends CommandRecord {
  call?: string;
}
interface TimelineState {
  surface: SurfaceNode[];
  sums: Record<Category, number>;
  assistantReasoning: number;
  assistantAnswerTokens: number;
  assistantCallTokens: number;
  systemTokens: number;
  systems?: SystemPromptNode[];
  toolsTokens: number;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  lastModel?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  requests: SlimRequestRecord[];
  turnRuns?: number;
  events: ContextEventRecord[];
  archived: SurfaceNode[];
  cost?: SessionCostUsage;
  generatedReasoning?: number;
  generatedAnswerTokens?: number;
  generatedCallTokens?: number;
  humanInputs?: number;
  answers?: number;
  lastUser?: string;
  archiveFloor?: number;
  detailRev?: number;
  timing?: TimingTotals;
  stepStart?: {
    time: number;
    firstToken?: number;
  };
  stepWaits?: {
    start: number;
    end: number;
  }[];
  stepApprovals?: Record<string, number>;
  stepRequestSeq?: number;
  stepBeats?: number[];
  stepBeatsFull?: boolean;
  spans: TimingSpan[];
  stepSpans?: TimingSpan[];
  callNames: Record<string, {
    name: string;
    start: number;
    argsRaw?: string;
  }>;
  pendingShadowedSeqs?: number[];
  pendingShadowEventSeq?: number;
  fileOps: FileOpRecord[];
  fileOpsFloor?: number;
  commands: CommandStateRecord[];
  commandsFloor?: number;
  commandStats?: CommandStats;
  pendingCodeCmds?: Record<string, CommandStateRecord[]>;
  pendingCodeOps?: Record<string, FileOpRecord[]>;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    contextTimeline: ContextTimeline;
    contextHeaders: ContextHeaders;
    contextActivity: ContextActivity;
  }
  interface SessionProjectionStateMap {
    contextTimeline: TimelineState;
    contextHeaders: HeadersState;
    contextActivity: ActivityState;
  }
}
type Category = 'user' | 'inject' | 'skill' | 'assistant' | 'tool';
interface SystemPromptNode {
  seq: number;
  time: number;
  tokens: number;
}
interface TimelineCounts {
  turns: number;
  steps: number;
  injects: number;
  compactions: number;
  prunes: number;
  skills?: number;
}
interface TimelineLast {
  seq: number;
  total: number;
  prompt?: number;
}
interface ActivityTally {
  n: number;
  last: number;
}
interface ActivityDay {
  tokens: number;
  requests: number;
  cost?: SessionCostUsage;
  turns?: number;
  toolCalls?: number;
  toolsMs?: number;
  wallMs?: number;
  skills?: Record<string, ActivityTally>;
  tools?: Record<string, ActivityTally>;
  cmds?: Record<string, ActivityTally>;
}
interface ContextActivity {
  days: Record<string, ActivityDay>;
}
interface SkillInfo {
  name: string;
  description: string;
  path?: string;
  source?: string;
}
type DefaultGranularity = 'step' | 'turn';
type DefaultTrendMode = 'total' | 'delta';
type DefaultDeltaBase = 'step' | 'turn';
type DefaultFileSort = 'count' | 'lines' | 'latest' | 'path' | 'name';
type DefaultToolSort = 'size' | 'count' | 'name';
type DefaultPlacement = 'all' | 'tab' | 'sidebar' | 'hide';
type InsightsEntry = 'show' | 'hide';
type DefaultDurationCurve = 'show' | 'hide';
type OverviewAutoSteps = 'off' | '100' | '200' | '300';
type DefaultOverviewRange = 'today' | '7d' | '30d' | 'all';
type FleetTab = 'show' | 'hide';
interface PluginSettings {
  defaultPlacement: DefaultPlacement;
  defaultGranularity: DefaultGranularity;
  defaultTrendMode: DefaultTrendMode;
  defaultDeltaBase: DefaultDeltaBase;
  defaultToolSort: DefaultToolSort;
  defaultFileSort: DefaultFileSort;
  insightsEntry: InsightsEntry;
  defaultDurationCurve: DefaultDurationCurve;
  overviewAutoSteps: OverviewAutoSteps;
  defaultOverviewRange: DefaultOverviewRange;
  fleetTab: FleetTab;
  promptPrefix: string;
  promptSuffix: string;
}
interface Snapshot {
  ok: boolean;
  unsupported?: {
    current: string;
    minimum: string;
  };
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  current: {
    system: number;
    tools: number;
    user: number;
    inject: number;
    skill: number;
    assistant: number;
    assistantReasoning?: number;
    assistantAnswerTokens?: number;
    assistantCallTokens?: number;
    tool: number;
    total: number;
  };
  images?: number;
  generatedReasoning?: number;
  generatedAnswerTokens?: number;
  generatedCallTokens?: number;
  toolCalls?: number;
  humanInputs?: number;
  answers?: number;
  lastUser?: string;
  counts?: TimelineCounts;
  last?: TimelineLast;
  detailRev?: number;
  requests: RequestRecord[];
  events: ContextEventRecord[];
  cost?: SessionCostUsage;
  timing?: TimingTotals;
  systems?: SystemPromptNode[];
  nodes: SurfaceNode[];
  droppedNodes: number;
  archive: SurfaceNode[];
  surfaceFloor?: number;
  archiveFloor?: number;
  fileOps?: FileOpRecord[];
  fileOpsFloor?: number;
  commands?: CommandRecord[];
  commandsFloor?: number;
  commandStats?: CommandStats;
  spans?: TimingSpan[];
}
interface ContextTimelineDetail {
  rev: number;
  head?: ContextTimeline;
  requests: RequestRecord[];
  events: ContextEventRecord[];
  nodes: SurfaceNode[];
  droppedNodes: number;
  archive: SurfaceNode[];
  surfaceFloor?: number;
  archiveFloor?: number;
  fileOps?: FileOpRecord[];
  fileOpsFloor?: number;
  commands?: CommandRecord[];
  commandsFloor?: number;
  commandStats?: CommandStats;
  spans?: TimingSpan[];
}
type CommandStatus = 'running' | 'completed' | 'failed' | 'killed';
interface CommandRecord {
  seq: number;
  resultSeq?: number;
  time: number;
  tool: string;
  cmd?: string;
  cmdTruncated?: true;
  description?: string;
  cwd?: string;
  timeoutMs?: number;
  background?: true;
  sandbox?: string;
  codeMode?: true;
  parent?: number;
  turn?: number;
  step?: number;
  start: number;
  end?: number;
  status: CommandStatus;
  exit?: number;
  exitInferred?: true;
  signal?: string;
  timedOut?: true;
  stopped?: true;
  denied?: true;
  err: boolean;
  outChars?: number;
  outTruncated?: true;
  stderr?: true;
  derived?: true;
  gone?: number;
}
interface CommandStats {
  runs: number;
  failed: number;
  ms: number;
  bg: number;
}
interface FileOpRecord {
  seq: number;
  path: string;
  kind: 'read' | 'write' | 'search';
  tool: string;
  time?: number;
  err: boolean;
  added: number;
  removed: number;
  detail?: string;
  hits?: number;
  read?: {
    start: number;
    count: number;
  } | {
    count: number;
    est: true;
  };
  parent?: number;
  program?: string;
  pattern?: true;
  gone?: number;
}
type ContextTimeline = Snapshot;
interface TimingSpan {
  kind: 'ttft' | 'reasoning' | 'text' | 'toolarg' | 'tools' | 'other';
  start: number;
  end: number;
}
interface CostBucketTotals {
  uncached: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}
interface ToolTimingTotals {
  calls: number;
  ms: number;
}
interface TimingTotals {
  wallMs: number;
  ttftMs: number;
  genMs: number;
  reasoningMs?: number;
  reasoningBlocks?: number;
  textMs?: number;
  textBlocks?: number;
  toolArgMs?: number;
  toolArgBlocks?: number;
  speedTokens?: number;
  speedMs?: number;
  calls: number;
  toolsMs: number;
  toolBusyMs?: number;
  idleMs?: number;
  toolCalls: number;
  tools: Record<string, ToolTimingTotals>;
}
interface CostModelUsage {
  peak?: CostBucketTotals;
  off?: CostBucketTotals;
}
interface SessionCostUsage {
  [provider: string]: {
    [model: string]: CostModelUsage;
  };
}
interface SurfaceNode {
  seq: number;
  time?: number;
  cat: Category;
  tokens: number;
  reasoning?: number;
  answerTokens?: number;
  callTokens?: number;
  imgs?: number;
  gone?: number;
  form?: string;
  name?: string;
  text?: string;
  tool?: string;
  err?: boolean;
  skill?: string;
  calls?: string[];
}
interface SlimRequestRecord {
  turn?: number;
  step?: number;
  time: number;
  seq: number;
  total: number;
  prompt?: number;
  activeMs?: number;
}
interface RequestRecord extends SlimRequestRecord {
  system: number;
  tools: number;
  user: number;
  inject: number;
  assistant: number;
  tool: number;
  skill?: number;
  cacheRead?: number;
  output?: number;
  stepCount?: number;
  net?: number;
}
interface ContextEventRecord {
  seq: number;
  time: number;
  kind: 'compaction' | 'prune' | 'inject' | 'model' | 'mode';
  form?: string;
  tokens?: number;
  count?: number;
  sub?: string;
  name?: string;
  detail?: string;
  from?: string;
  to?: string;
  fromTurn?: number;
  fromStep?: number;
  turn?: number;
  step?: number;
}
interface HeaderTool {
  name: string;
  tokens: number;
  plugin?: string;
}
interface HeaderRecord {
  seq: number;
  time: number;
  systemTokens?: number;
  tools: HeaderTool[];
}
interface ContextHeaders {
  headers: HeaderRecord[];
}
interface PlatformBalanceEntry {
  currency: string;
  total: number;
  granted: number;
  toppedUp: number;
}
interface PlatformBalance {
  isAvailable: boolean;
  balances: PlatformBalanceEntry[];
}
declare const DEFAULT_BOUNDS: {
  maxRequestSteps: number;
  maxKeptTurns: number;
  maxEvents: number;
  maxNodes: number;
  maxArchiveNodes: number;
  maxFileOps: number;
  maxCommands: number;
  maxCommandChars: number;
};
type FoldBounds = typeof DEFAULT_BOUNDS & {
  headOnly?: boolean;
};
export type Config = Partial<FoldBounds> & Partial<PluginSettings>;
export declare const Config: z$1<Schemastery.ObjectS<NoInfer<{
  maxRequestSteps: z$1<number, number, "defined">;
  maxKeptTurns: z$1<number, number, "defined">;
  maxEvents: z$1<number, number, "defined">;
  maxNodes: z$1<number, number, "defined">;
  maxArchiveNodes: z$1<number, number, "defined">;
  maxFileOps: z$1<number, number, "defined">;
  maxCommands: z$1<number, number, "defined">;
  maxCommandChars: z$1<number, number, "defined">;
  defaultPlacement: z$1<"all" | "hide" | "sidebar" | "tab", "all" | "hide" | "sidebar" | "tab", "defined">;
  defaultGranularity: z$1<"step" | "turn", "step" | "turn", "defined">;
  defaultTrendMode: z$1<"delta" | "total", "delta" | "total", "defined">;
  defaultDeltaBase: z$1<"step" | "turn", "step" | "turn", "defined">;
  defaultToolSort: z$1<"count" | "name" | "size", "count" | "name" | "size", "defined">;
  defaultFileSort: z$1<"count" | "latest" | "lines" | "name" | "path", "count" | "latest" | "lines" | "name" | "path", "defined">;
  insightsEntry: z$1<"hide" | "show", "hide" | "show", "defined">;
  defaultDurationCurve: z$1<"hide" | "show", "hide" | "show", "defined">;
  overviewAutoSteps: z$1<"100" | "200" | "300" | "off", "100" | "200" | "300" | "off", "defined">;
  defaultOverviewRange: z$1<"30d" | "7d" | "all" | "today", "30d" | "7d" | "all" | "today", "defined">;
  fleetTab: z$1<"hide" | "show", "hide" | "show", "defined">;
  promptPrefix: z$1<string, string, "defined">;
  promptSuffix: z$1<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
  maxRequestSteps: z$1<number, number, "defined">;
  maxKeptTurns: z$1<number, number, "defined">;
  maxEvents: z$1<number, number, "defined">;
  maxNodes: z$1<number, number, "defined">;
  maxArchiveNodes: z$1<number, number, "defined">;
  maxFileOps: z$1<number, number, "defined">;
  maxCommands: z$1<number, number, "defined">;
  maxCommandChars: z$1<number, number, "defined">;
  defaultPlacement: z$1<"all" | "hide" | "sidebar" | "tab", "all" | "hide" | "sidebar" | "tab", "defined">;
  defaultGranularity: z$1<"step" | "turn", "step" | "turn", "defined">;
  defaultTrendMode: z$1<"delta" | "total", "delta" | "total", "defined">;
  defaultDeltaBase: z$1<"step" | "turn", "step" | "turn", "defined">;
  defaultToolSort: z$1<"count" | "name" | "size", "count" | "name" | "size", "defined">;
  defaultFileSort: z$1<"count" | "latest" | "lines" | "name" | "path", "count" | "latest" | "lines" | "name" | "path", "defined">;
  insightsEntry: z$1<"hide" | "show", "hide" | "show", "defined">;
  defaultDurationCurve: z$1<"hide" | "show", "hide" | "show", "defined">;
  overviewAutoSteps: z$1<"100" | "200" | "300" | "off", "100" | "200" | "300" | "off", "defined">;
  defaultOverviewRange: z$1<"30d" | "7d" | "all" | "today", "30d" | "7d" | "all" | "today", "defined">;
  fleetTab: z$1<"hide" | "show", "hide" | "show", "defined">;
  promptPrefix: z$1<string, string, "defined">;
  promptSuffix: z$1<string, string, "defined">;
}>>, "plain">;
export declare const name = "dsh-context";
export declare const inject: string[];
export declare function apply(ctx: Context, config: Config): void;
export type { ActivityDay, ActivityState, Category, ContextActivity, ContextEventRecord, ContextHeaders, ContextTimeline, ContextTimelineDetail, HeaderRecord, HeaderTool, HeadersState, PlatformBalance, PlatformBalanceEntry, RequestRecord, SkillInfo, Snapshot, SurfaceNode, TimelineCounts, TimelineLast, TimelineState };
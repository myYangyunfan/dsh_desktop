// src/index.ts
import {
  CompactionEngine,
  ManualCompactionError
} from "@deepseek-ai/dsh-compaction";

// node_modules/acp-kernel/dist/chunk-6TAK7DSI.js
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
function defaultCountTokens(text) {
  if (!text) return 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjk?.length ?? 0;
  return cjkCount + Math.ceil((text.length - cjkCount) / 4);
}
function thinkingTokenValue(thinking) {
  return typeof thinking === "number" && Number.isFinite(thinking) && thinking > 0 ? thinking : 0;
}
function countMessageTokens(message, countTokens = defaultCountTokens) {
  return countTokens(message.text ?? "") + thinkingTokenValue(message.thinkingTokens);
}
var COMPRESS_PHILOSOPHY = `Compression Philosophy:
- All compression serves the primary task, but be frugal.
- Context capacity is precious. Save context by compressing consumed outputs, not by avoiding tools.
- Compress by need, not by percentage.
- Work from summaries, not raw tool outputs. All listed ranges (user prompts, tool outputs, code, logs, exploration, intermediate steps) should be compressed to summary format \u2014 the ONLY exceptions are protected content, content the current step is actively using, or critical content you cannot reconstruct.`;
var HOW_TO_COMPRESS_RULES = `HOW TO COMPRESS

When you call \`compress\`, the summary you write becomes the only record of the replaced conversation. Make it self-contained and complete: every user request, experiment purpose, and work task in the range must be accurately captured. A later reader (or you, after decompressing) should be able to continue the task WITHOUT needing the original. The summary records the PAST as of this block's creation: label recorded task state as history ("TASK AS OF THIS BLOCK: ...") \u2014 never as a live instruction, so a later reader treats it as settled context, not something to re-execute. Write plain text with real unicode characters; never copy \\uXXXX escape sequences or JSON-escaped fragments out of tool output.

KEEP VERBATIM \u2014 never paraphrase or abbreviate these:
- Full file paths with line numbers, directory prefix on every mention (\`lib/hooks.ts:347\`, \`src/index.ts:12-18\`, \`gatenet_v3/model.py:45\`). Never abbreviate to a bare filename (\`hooks.ts\`, \`model.py\`) \u2014 they are ambiguous and cannot be grepped or decompressed-to later.
- Function, class, and type signatures (exact names, params, return types) AND critical code lines that encode logic \u2014 the line that IS the finding, not just the function name (e.g. \`kv_keys += define_gate * a_key[i](emb)\` is more useful than "see model_kvnet.py").
- Error messages and stack traces (exact text \u2014 you need the literal string to grep for it later).
- Key details from reports and analyses \u2014 not just the conclusion. Keep the comparison numbers and the mechanism, not "X is worse" alone (write "1.76\xD7 PPL gap because KV store is static", not "KVNet underperforms").
- Decisions and their rationale ("chose X over Y because Z" \u2014 the "because" is load-bearing; without it the decision looks arbitrary).
- Constraints discovered ("must support Node 22", "no new dependencies", "AGENTS.md forbids \`as any\`").
- Exact values: versions, config keys, thresholds, magic numbers.
- User intent \u2014 quote short user messages verbatim ONLY WITH their message ref, e.g. \`User said (m00132): "ship it tonight"\`. Without a verifiable ref, paraphrase (\`user previously asked (paraphrased): ...\`) \u2014 this is the one exception to the verbatim rule above; never present a reconstructed or half-remembered phrase as a verbatim quote. When the message is too long to quote, preserve intent with extra care: do not change scope, constraints, priorities, acceptance criteria, or requested outcomes. Quotes are historical records, never current directives. Losing these changes the task itself.
- The user's overall goal and any changes to it \u2014 the big-picture objective plus how it evolved during the compressed range. Each summary must reflect the goal as it stood at the end of the range, including pivots (e.g., "initially: fix bug X \u2192 pivoted to: refactor module Y after discovering root cause"). Losing the goal or its evolution makes all subsequent work appear unmotivated.
- Purpose behind each significant action \u2014 preserve not just what was done but why: the hypothesis behind each experiment, the question behind each exploration, the task goal behind each work action. Without purpose, the summary reads as disconnected technical steps with no through-line.
- Open questions and unresolved TODOs \u2014 losing these changes what work appears to remain.
- Message refs of key anchors (\`m00420\`, \`m00510\u2013m00520\`) \u2014 they let you or a later reader jump back via decompress to the exact original.

DROP \u2014 extract the signal, discard the vessel:
- Verbose logs (build/test/\`npm\` output) once you have captured the error line or the result.
- Duplicate file reads once the needed content is recorded.
- Consumed exploration \u2014 search hits, agent return values, successful tool outputs \u2014 once you have extracted the facts you need (same rule as dead-ends, but nothing went wrong; the content is simply spent).
- Dead-end exploration \u2014 but PRESERVE the lesson in one line: "tried X, failed because Y".
- Back-and-forth discussion and self-corrections once the final position is captured (keep the outcome, drop the journey to it).
- Repeated status checks (\`git status\`, \`ls\`) once state is known.

For each significant item you DROP (scripts, reports, large analyses, long tool outputs), add a one-line CONTENT description of what it covers \u2014 not where it lives. Bad: "probe script at /path/probe_kvnet.py". Good: "probe_kvnet.py: tests n-gram baseline, generation quality, long-range dependency, position sensitivity, op pipeline, QUERY attention." This lets a later decompress target the right block by relevance, not by guessing locations.

PRIORITY \u2014 when the summary must be compact, preserve in this order:
1. User's overall goal, goal evolution, intent, and hard constraints (losing these changes the task).
2. Decisions and rationale.
3. Exact technical artifacts: paths, signatures, errors, values.
4. Conclusions and key findings.
5. Lessons learned: what failed and why.

Write dense, scannable bullets \u2014 not narrative prose. If the range spans distinct concerns (request \u2192 findings \u2192 decision), group bullets under short thematic headers so a reader can scan to the part they need. Every line must earn its place. Do not mimic the style of existing summaries in context; follow these rules.`;
var TIER2_DISTILL_RULES = `TIER 2 COMPRESSION \u2014 DISTILLATION

You are compressing historical summaries (not raw conversation). These summaries have already captured the details. Your job is to DISTILL them: extract only what matters for future work, discard the process.

KEEP \u2014 these are the only things that survive distillation:
- Decisions and their rationale ("chose X over Y because Z" \u2014 the "because" is load-bearing).
- Final outcomes: version numbers shipped, PR numbers merged/closed, bugs fixed or deferred.
- Key lessons: what failed and why ("tried X, failed because Y"). These prevent repeating mistakes.
- Critical constraints discovered ("must support Node 22", "AGENTS.md forbids as any").
- Design decisions with architectural impact ("chose compress-as-anchor over synthetic messages because prefix cache").
- User quotes and task state only as attributed history: keep the source ref with any user quote; never carry a tier-1 "CURRENT TASK" claim forward as a live directive \u2014 relabel it "TASK AS OF THIS BLOCK".
- Whether content is OBSOLETE or SUPERSEDED \u2014 mark with one line: "[SUPERSEDED by PR #NNN]" or "[OBSOLETE: deleted in vX.Y.Z]". Do NOT keep the obsolete content's details \u2014 just the marker and reason.
- Function/class/type names and module paths that are the SUBJECT of the work \u2014 e.g., "fixed filterCompressedRanges in prune.ts", "added SessionStateRegistry in state.ts". Not exact line numbers or full signatures \u2014 just enough to LOCATE the code without searching.
- Exploration findings: if a block was exploratory with no decision, keep the CONCLUSION in one line ("explored X, not viable because Y"). Do not keep the exploration process.

DROP \u2014 these were useful during the work but are no longer needed:
- Exact line numbers, diffs, verbose function signatures, full code listings.
- Build/deploy process details, test execution steps.
- Review process details (who reviewed, what rounds, test counts).
- Verbose logs, command output, intermediate debugging steps.

FORMAT:
- Start each distilled block with a source header line:
  \`Source: bN+bM+... (XK\u2192YK tok, Zx). [original topic]\`
  Example: \`Source: b5+b7 (56K+44K\u2192268 tok, 375x). [Tool-result recap + publish]\`
- 3-5 bullet points per source block, each a self-contained fact.
- Dense, scannable \u2014 no narrative prose.
- Start with the outcome, not the process: "v1.13.0 shipped (7 PRs bundled)" not "implemented 7 PRs then reviewed then merged".
- Cross-block synthesis: if multiple source blocks cover the same topic (same PR, same feature, same bug), MERGE them into a single group of bullets. Do not repeat the same fact from different blocks \u2014 keep it once under the most relevant source header.

SIZE TARGET: 50-150 tokens per source block (excluding the header). If you can't fit it in 150 tokens, you're keeping too much process. If a block has nothing worth keeping (pure noise), output just the header followed by "[no actionable content]."`;
var TIER3_CONDENSE_RULES = `TIER 3 COMPRESSION \u2014 ULTRA-CONDENSATION

You are compressing distilled summaries (Tier 2) into ultra-condensed facts (Tier 3). The distilled summaries already contain only decisions and outcomes. Your job is to reduce them to bare factual references.

PRIORITY \u2014 when a source block has more facts than the size target allows, keep in this order:
1. Shipped outcomes (versions released, PRs merged) \u2014 these are permanent record.
2. Open work (PRs/issues still pending) \u2014 these may need follow-up.
3. Key decisions with architectural impact ("chose X over Y because Z").
4. Critical constraints ("must support Node 22").
Drop everything else. Tier 3 is a lookup index, not a knowledge base.

FORMAT:
- Start with a source header line:
  \`Source: bN+bM+... (XK\u2192YK tok, Zx). [original topic]\`
- Output 1-3 facts per source block. Each fact is a single line: subject + outcome.
- No explanations, no rationale, no process \u2014 just the fact.
- Format: "[PR/Issue/Version] \u2014 [outcome in \u22648 words]"
- Merge related facts from different source blocks if they concern the same topic.

EXAMPLES:
- "v1.13.0 shipped \u2014 quality gate + GC fix (7 PRs)"
- "PR #196 merged \u2014 preserve-first-user (supersedes #169)"
- "Bug 1214 fixed \u2014 compress consumed all user messages"
- "Chose compress-as-anchor \u2014 prefix cache benefit over synthetic injection"
- "Constraint: AGENTS.md forbids as any \u2014 never suppress types"

DROP:
- Multi-sentence context. If a fact needs >1 sentence, it's too detailed for Tier 3.
- Lessons learned ("tried X, failed because Y") \u2014 drop UNLESS the failure is likely to recur and the block is <30 days old.
- Design rationale details \u2014 keep the decision, drop the "because" unless it's a critical constraint.
- Anything marked [OBSOLETE] or [SUPERSEDED] \u2014 drop entirely, note "[N blocks obsolete]" in the summary.

SIZE TARGET: 30-60 tokens per source block (including header). For a batch of N source blocks, total output \u2248 N \xD7 40 tokens. If a source block has only one trivial fact, output just the header + one line.`;
var defaultPrompts = Object.freeze({
  compressPhilosophy: COMPRESS_PHILOSOPHY,
  howToCompressRules: HOW_TO_COMPRESS_RULES,
  tier2DistillRules: TIER2_DISTILL_RULES,
  tier3CondenseRules: TIER3_CONDENSE_RULES
});
function efficiencyNote(prompts) {
  return `This is an efficiency nudge to compress early and keep context lean \u2014 not an overflow warning. A separate, stronger alert will appear if the context is actually full.

${prompts.compressPhilosophy}`;
}
function emergencyHeader(prompts) {
  return `\u26A0\uFE0F Context limit reached \u2014 compress now. Prioritize consumed tool outputs.

${prompts.compressPhilosophy}`;
}
function formatK(n) {
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}
function formatBreakdown(bd) {
  if (!bd) return "";
  const parts = [];
  if (bd.system > 0) parts.push(`${formatK(bd.system)} system`);
  if (bd.tool > 0) parts.push(`${formatK(bd.tool)} tool`);
  if (bd.summaries > 0) parts.push(`${formatK(bd.summaries)} summaries`);
  if (bd.code > 0) parts.push(`${formatK(bd.code)} code`);
  if (bd.text > 0) parts.push(`${formatK(bd.text)} text`);
  const growth = bd.growth > 0 ? `
+${formatK(bd.growth)} since last nudge` : "";
  return `Context breakdown: ${parts.join(" | ")}${growth}`;
}
function formatTierTargetBlocks(blocks) {
  if (blocks.length === 0) {
    return "Target blocks: (none \u2014 no tier blocks found)";
  }
  const lines = blocks.map((b) => {
    const summaryTokens = Math.ceil((b.summary ?? "").length / 4);
    const topic = b.topic ? `  "${b.topic}"` : "";
    return `  ${b.blockId}  ${b.effectiveMessageIds.length} msgs  ${formatK(b.compressedTokens)}\u2192${formatK(summaryTokens)}${topic}`;
  });
  return `Target ${blocks[0].tier === 1 ? "tier-1" : "tier-2"} blocks to distill (${blocks.length}):
${lines.join("\n")}`;
}
function formatRanges(compressible, protectedRanges) {
  if (compressible.length === 0 && protectedRanges.length === 0) {
    return "[No specific ranges detected \u2014 compress any consumed content.]";
  }
  const refNum = (ref) => {
    const m = ref.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };
  const entries = [];
  for (const r of compressible) {
    entries.push({
      startRef: r.startRef,
      endRef: r.endRef,
      startNum: refNum(r.startRef),
      endNum: refNum(r.endRef),
      count: r.count,
      tokens: r.tokens,
      toolPct: r.toolPct,
      textPct: r.textPct,
      compressibleTokens: r.tokens,
      compressibleCount: r.count,
      protectedTokens: 0,
      protectedCount: 0,
      protectedTools: [],
      dangerous: r.dangerous ?? false
    });
  }
  for (const r of protectedRanges) {
    entries.push({
      startRef: r.startRef,
      endRef: r.endRef,
      startNum: refNum(r.startRef),
      endNum: refNum(r.endRef),
      count: r.count,
      tokens: r.tokens,
      toolPct: 0,
      textPct: 0,
      compressibleTokens: 0,
      compressibleCount: 0,
      protectedTokens: r.tokens,
      protectedCount: r.count,
      protectedTools: [...r.tools],
      dangerous: false
    });
  }
  entries.sort((a, b) => a.startNum - b.startNum);
  const merged = [];
  for (const e of entries) {
    const last = merged[merged.length - 1];
    if (last && e.startNum <= last.endNum + 1) {
      last.endRef = e.endRef;
      last.endNum = Math.max(last.endNum, e.endNum);
      last.count += e.count;
      last.tokens += e.tokens;
      last.compressibleTokens += e.compressibleTokens;
      last.compressibleCount += e.compressibleCount;
      last.protectedTokens += e.protectedTokens;
      last.protectedCount += e.protectedCount;
      if (e.dangerous) last.dangerous = true;
      for (const t of e.protectedTools) {
        if (!last.protectedTools.includes(t)) last.protectedTools.push(t);
      }
    } else {
      merged.push({ ...e });
    }
  }
  const lines = merged.map((e) => {
    const suffix = e.dangerous && e.compressibleTokens > 0 ? "  \u26A0\uFE0F NOT recommended unless you are certain." : "";
    if (e.protectedTokens > 0 && e.compressibleTokens === 0) {
      return `  ${e.startRef}\u2013${e.endRef}  ${e.count} msgs  ${formatK(e.tokens)} [PROTECTED: ${e.protectedTools.join(", ")} \u2014 not compressible]${suffix}`;
    }
    if (e.protectedTokens > 0 && e.compressibleTokens > 0) {
      return `  ${e.startRef}\u2013${e.endRef}  ${e.count} msgs  ${formatK(e.tokens)} [${formatK(e.compressibleTokens)} compressible | ${formatK(e.protectedTokens)} protected: ${e.protectedTools.join(", ")}]${suffix}`;
    }
    return `  ${e.startRef}\u2013${e.endRef}  ${e.count} msgs  ${formatK(e.tokens)} [tool ${e.toolPct}% | text ${e.textPct}%]${suffix}`;
  });
  return `Compressible ranges (${merged.length}, oldest first):
${lines.join("\n")}`;
}
function renderNudgeText(decision, prompts = defaultPrompts) {
  const breakdownStr = formatBreakdown(decision.contextBreakdown);
  const rangesStr = formatRanges(decision.compressibleRanges, decision.protectedRanges ?? []);
  const isEmergency = !!decision.breakdown?.emergencyOverride || !!decision.breakdown?.overLimit;
  if (decision.tier !== null && decision.tier >= 2) {
    const isT2 = decision.tier === 2;
    const targets = decision.tierTargetBlocks ?? [];
    const blockList = formatTierTargetBlocks(targets);
    const startId = targets[0]?.blockId ?? "b1";
    const endId = targets[targets.length - 1]?.blockId ?? "b5";
    const voice = isEmergency ? "emergency" : "gentle";
    const triggerLine = isEmergency ? `[EMERGENCY \u2014 TIER ${decision.tier} ${isT2 ? "DISTILLATION" : "CONDENSATION"}] Context limit reached \u2014 distill NOW into a denser summary to reclaim tokens.` : `[TIER ${decision.tier} ${isT2 ? "DISTILLATION" : "CONDENSATION"} TRIGGER]`;
    return {
      voice,
      text: [
        efficiencyNote(prompts),
        "",
        breakdownStr,
        "",
        triggerLine,
        isT2 ? `Your tier-1 compression summaries have accumulated. Distill them into a single denser tier-2 summary. Use block IDs as boundaries (startId and endId as bN). Any raw (uncompressed) messages sitting between the boundary blocks are absorbed into the tier-2 block as well \u2014 apply HOW TO COMPRESS to those raw messages and the TIER 2 distillation rules to the existing summaries, so the whole span is covered and nothing is lost.` : `Your tier-2 compression summaries have accumulated. Condense them further into a tier-3 ultra-condensed summary. Use block IDs as boundaries (startId and endId as bN). Any raw (uncompressed) messages sitting between the boundary blocks are absorbed into the tier-3 block as well \u2014 apply HOW TO COMPRESS to those raw messages and the TIER 3 condensation rules to the existing summaries, so the whole span is covered and nothing is lost.`,
        blockList,
        `Example: compress({ content: [{ startId: "${startId}", endId: "${endId}", summary: "..." }] })`,
        "",
        prompts.howToCompressRules,
        "",
        isT2 ? prompts.tier2DistillRules : prompts.tier3CondenseRules
      ].join("\n")
    };
  }
  if (isEmergency) {
    return {
      voice: "emergency",
      text: [
        emergencyHeader(prompts),
        "",
        breakdownStr,
        "",
        prompts.howToCompressRules,
        "",
        `{ "topic": "...", "content": [{ "startId": "<ID>", "endId": "<ID>", "summary": "..." }] }`,
        "Only use IDs from visible messages above. Compress older work first.",
        "",
        rangesStr
      ].join("\n")
    };
  }
  return {
    voice: "gentle",
    text: [
      efficiencyNote(prompts),
      "",
      breakdownStr,
      "",
      prompts.howToCompressRules,
      "",
      rangesStr,
      "",
      `\u{1F4A1} Compress all ranges in one call (pass multiple content entries: \`content: [{...}, {...}]\`).`
    ].join("\n")
  };
}

// node_modules/acp-kernel/dist/chunk-UX4LINT7.js
function createInitialState() {
  return {
    blocks: [],
    messageRefs: { byRaw: {}, byRef: {} },
    tokenSnapshot: {},
    nudge: {
      lastPerMessageNudgeTokens: 0,
      lastNudgeShownTokens: 0,
      baselineTokens: 0,
      anchors: {},
      lastShownByTier: {}
    },
    stats: { tokensCompressed: 0, compressionCount: 0, absorbedTokens: 0 },
    absorbed: [],
    nextBlockId: 1,
    nextRunId: 1
  };
}
function allocateBlockId(state) {
  const id = state.nextBlockId;
  state.nextBlockId = Math.max(1, id) + 1;
  return `b${id}`;
}
function allocateRunId(state) {
  const id = state.nextRunId;
  state.nextRunId = Math.max(1, id) + 1;
  return `r${id}`;
}
function blockById(state, blockId) {
  return state.blocks.find((block) => block.blockId === blockId);
}
function activeBlocks(state) {
  return state.blocks.filter((block) => block.active);
}
function coveredMessageIds(state) {
  const covered = /* @__PURE__ */ new Set();
  for (const block of state.blocks) {
    if (!block.active) continue;
    for (const id of block.effectiveMessageIds) covered.add(id);
  }
  return covered;
}
function advanceSurvival(state, promotionThreshold) {
  for (const block of state.blocks) {
    if (!block.active) continue;
    block.survivedCount += 1;
    if (block.survivedCount >= promotionThreshold) {
      block.generation = "old";
    }
  }
}

// node_modules/acp-kernel/dist/index.js
var REF_WIDTH = 5;
var MIN_INDEX = 1;
var MAX_INDEX = 99999;
var REF_PATTERN = /^m0*(\d{1,5})$/;
var BLOCKED_REF = "BLOCKED";
function indexToRef(index) {
  if (!Number.isInteger(index) || index < MIN_INDEX || index > MAX_INDEX) {
    throw new RangeError(
      `ref index out of bounds: ${index} (allowed ${MIN_INDEX}-${MAX_INDEX})`
    );
  }
  return `m${String(index).padStart(REF_WIDTH, "0")}`;
}
function refToIndex(ref) {
  const match = REF_PATTERN.exec(ref.trim().toLowerCase());
  if (!match) return null;
  const index = Number(match[1]);
  if (index < MIN_INDEX || index > MAX_INDEX) return null;
  return index;
}
function refForRaw(map, rawId) {
  return map.byRaw[rawId] ?? null;
}
function assignRefs(messages, options) {
  const map = {
    byRaw: { ...options.existing.byRaw },
    byRef: { ...options.existing.byRef }
  };
  let cursor = Number.isInteger(options.nextIndex) && options.nextIndex >= MIN_INDEX ? options.nextIndex : MIN_INDEX;
  let newlyAssigned = 0;
  for (const message of messages) {
    if (!message.id || options.shouldSkip?.(message)) continue;
    if (map.byRaw[message.id]) continue;
    if (options.isProtected?.(message)) {
      map.byRaw[message.id] = BLOCKED_REF;
      continue;
    }
    const ref = allocateFreeRef(map, cursor);
    cursor = ref.index + 1;
    map.byRaw[message.id] = ref.text;
    map.byRef[ref.text] = message.id;
    newlyAssigned++;
  }
  return { map, nextIndex: cursor, newlyAssigned };
}
function allocateFreeRef(map, start) {
  let candidate = Math.max(start, MIN_INDEX);
  while (candidate <= MAX_INDEX) {
    const text = indexToRef(candidate);
    if (!map.byRef[text]) {
      return { text, index: candidate };
    }
    candidate++;
  }
  throw new Error(
    `ref capacity exhausted: cannot allocate beyond ${indexToRef(MAX_INDEX)}`
  );
}
function highestUsedIndex(map) {
  let highest = 0;
  for (const ref of Object.values(map.byRaw)) {
    const index = ref === BLOCKED_REF ? null : refToIndex(ref);
    if (index !== null && index > highest) highest = index;
  }
  return highest;
}
var SUMMARY_HEADER = "[Compressed conversation section]";
var SUMMARY_ID_PREFIX = "acp_summary_";
function summaryMessageId(blockId) {
  return `${SUMMARY_ID_PREFIX}${blockId}`;
}
function isSummaryMessageId(id) {
  return id.startsWith(SUMMARY_ID_PREFIX);
}
function isRenderedSummaryMessage(message) {
  return isSummaryMessageId(message.id) && message.role === "system" && message.contentType === "text";
}
function prune(messages, state, options = {}) {
  const covered = coveredMessageIds(state);
  if (covered.size === 0) return [...messages];
  const inject = options.injectSummaries ?? true;
  const firstUserIndex = messages.findIndex(
    (message) => message.role === "user"
  );
  const indexById = /* @__PURE__ */ new Map();
  const summaryIndexById = /* @__PURE__ */ new Map();
  messages.forEach((message, index) => {
    indexById.set(message.id, index);
    if (isRenderedSummaryMessage(message))
      summaryIndexById.set(message.id, index);
  });
  const anchors = inject ? collectSummaryAnchors(state, indexById, summaryIndexById) : [];
  return stripOrphanedReasoning(
    stripOrphanedToolResults(
      stripOrphanedToolCalls(
        rebuildMessages(messages, covered, firstUserIndex, anchors)
      )
    )
  );
}
function collectSummaryAnchors(state, indexById, summaryIndexById) {
  const anchors = [];
  for (const block of activeBlocks(state)) {
    const existingIndex = summaryIndexById.get(summaryMessageId(block.blockId));
    if (existingIndex !== void 0) {
      anchors.push({
        blockId: block.blockId,
        summary: block.summary,
        topic: block.topic,
        insertAt: existingIndex
      });
      continue;
    }
    let earliest = null;
    for (const id of block.effectiveMessageIds) {
      const index = indexById.get(id);
      if (index !== void 0 && (earliest === null || index < earliest)) {
        earliest = index;
      }
    }
    anchors.push({
      blockId: block.blockId,
      summary: block.summary,
      topic: block.topic,
      insertAt: earliest ?? 0
    });
  }
  anchors.sort((left, right) => left.insertAt - right.insertAt);
  return anchors;
}
function rebuildMessages(messages, covered, firstUserIndex, anchors) {
  const result = [];
  const pending = [...anchors];
  const anchoredSummaryIds = new Set(
    anchors.map((anchor) => summaryMessageId(anchor.blockId))
  );
  for (let index = 0; index < messages.length; index++) {
    while (pending.length > 0 && pending[0].insertAt === index) {
      result.push(renderSummary(pending.shift()));
    }
    if (index === firstUserIndex && firstUserIndex >= 0) {
      result.push(messages[index]);
      continue;
    }
    if (covered.has(messages[index].id)) continue;
    if (isRenderedSummaryMessage(messages[index]) && anchoredSummaryIds.has(messages[index].id))
      continue;
    result.push(messages[index]);
  }
  while (pending.length > 0) {
    result.push(renderSummary(pending.shift()));
  }
  return result;
}
function renderSummary(anchor) {
  const body = anchor.summary.trim();
  const topicLine = anchor.topic ? `${SUMMARY_HEADER} \u2014 ${anchor.topic}` : SUMMARY_HEADER;
  const text = body.length === 0 ? topicLine : `${topicLine}
${body}`;
  return {
    id: summaryMessageId(anchor.blockId),
    role: "system",
    contentType: "text",
    text
  };
}
function stripOrphanedToolResults(messages) {
  const knownCallIds = /* @__PURE__ */ new Set();
  for (const m of messages) {
    if (m.contentType === "tool-call" && m.toolCallId) {
      knownCallIds.add(m.toolCallId);
    }
  }
  return messages.filter(
    (m) => m.contentType !== "tool-result" || !m.toolCallId || knownCallIds.has(m.toolCallId)
  );
}
function stripOrphanedToolCalls(messages) {
  const knownResultIds = /* @__PURE__ */ new Set();
  for (const m of messages) {
    if (m.contentType === "tool-result" && m.toolCallId) {
      knownResultIds.add(m.toolCallId);
    }
  }
  return messages.filter(
    (m) => m.contentType !== "tool-call" || !m.toolCallId || m.toolName === "compress" || knownResultIds.has(m.toolCallId)
  );
}
function stripOrphanedReasoning(messages) {
  const drop = /* @__PURE__ */ new Set();
  for (let i = 0; i < messages.length; i++) {
    if (drop.has(i)) continue;
    if (messages[i].contentType !== "reasoning") continue;
    let j = i;
    while (j + 1 < messages.length && messages[j + 1].contentType === "reasoning") {
      j++;
    }
    const companion = messages[j + 1];
    const hasCompanion = companion !== void 0 && companion.role === "assistant" && (companion.contentType === "text" || companion.contentType === "tool-call");
    if (!hasCompanion) {
      for (let k = i; k <= j; k++) drop.add(k);
    }
  }
  if (drop.size === 0) return messages;
  return messages.filter((_, i) => !drop.has(i));
}
function syncBlocks(messages, state) {
  const presentIds = new Set(messages.map((message) => message.id));
  const deactivated = [];
  const result = {
    blocks: state.blocks.map((block) => ({
      ...block,
      directMessageIds: [...block.directMessageIds],
      effectiveMessageIds: [...block.effectiveMessageIds],
      directBlockIds: [...block.directBlockIds]
    })),
    messageRefs: {
      byRaw: { ...state.messageRefs.byRaw },
      byRef: { ...state.messageRefs.byRef }
    },
    // Snapshot is keyed by ref with primitive values — shallow copy suffices.
    tokenSnapshot: { ...state.tokenSnapshot ?? {} },
    nudge: { ...state.nudge, anchors: { ...state.nudge.anchors } },
    stats: { ...state.stats },
    absorbed: (state.absorbed ?? []).map((record) => ({ ...record })),
    nextBlockId: state.nextBlockId,
    nextRunId: state.nextRunId
  };
  const liveRefs = new Set(
    messages.map((m) => result.messageRefs.byRaw[m.id]).filter((r) => typeof r === "string")
  );
  if (Object.keys(result.tokenSnapshot).length !== liveRefs.size) {
    const pruned = {};
    for (const [ref, n] of Object.entries(result.tokenSnapshot)) {
      if (liveRefs.has(ref)) pruned[ref] = n;
    }
    result.tokenSnapshot = pruned;
  }
  const consumedBlockIds = /* @__PURE__ */ new Set();
  for (const block of result.blocks) {
    for (const consumedId of block.directBlockIds) {
      consumedBlockIds.add(consumedId);
    }
  }
  for (const block of result.blocks) {
    if (consumedBlockIds.has(block.blockId)) {
      block.active = false;
      continue;
    }
    if (block.expanded) {
      block.active = false;
      continue;
    }
    block.active = true;
    const stillPresent = block.effectiveMessageIds.some((id) => presentIds.has(id)) || presentIds.has(summaryMessageId(block.blockId));
    if (!stillPresent) {
      block.active = false;
      deactivated.push(block.blockId);
    }
  }
  return { state: result, deactivated };
}
function defaultConfig(modelContextLimit, overrides = {}) {
  const base = {
    tiers: { enabled: true, tier2Trigger: 5, tier3Trigger: 10 },
    nudge: {
      maxContextLimitPct: 0.75,
      minContextLimitPct: 0.45,
      frequency: 5,
      iterationThreshold: 15,
      force: "soft",
      growthRatio: 0.05,
      growthFloor: 5e4,
      growthCap: 5e4,
      minGrowthFloor: 2e4,
      minGrowthRatio: 0.45,
      emergencyThresholdPct: 0.95,
      tier2GrowthMultiplier: 1.5
    },
    promotionThreshold: 5,
    truncate: { threshold: 0.95 },
    compress: {
      minCompressRange: 5e3,
      maxSummaryLength: 2e4,
      minSummaryLength: 50
    },
    protectedTools: [],
    preserveRecentMessages: 5,
    preserveRecentTokens: 5e3,
    modelContextLimit,
    absorb: {
      enabled: false,
      toolName: "absorb",
      minToolTokens: 1e3,
      contextThresholdPct: 0,
      excludeTools: []
    }
  };
  return {
    ...base,
    ...overrides,
    tiers: { ...base.tiers, ...overrides.tiers },
    nudge: { ...base.nudge, ...overrides.nudge },
    truncate: { ...base.truncate, ...overrides.truncate },
    compress: { ...base.compress, ...overrides.compress },
    absorb: overrides.absorb ? { ...base.absorb, ...overrides.absorb } : base.absorb
  };
}
function validateConfig(config) {
  const errors = [];
  if (!Number.isFinite(config.modelContextLimit) || config.modelContextLimit <= 0) {
    errors.push("modelContextLimit must be a positive number");
  }
  if (config.nudge.minContextLimitPct > config.nudge.maxContextLimitPct) {
    errors.push(
      "nudge.minContextLimitPct must not exceed nudge.maxContextLimitPct"
    );
  }
  if (config.nudge.maxContextLimitPct > config.nudge.emergencyThresholdPct) {
    errors.push(
      "nudge.maxContextLimitPct must not exceed nudge.emergencyThresholdPct"
    );
  }
  if (config.nudge.minPressureBenefitTokens !== void 0 && (!Number.isFinite(config.nudge.minPressureBenefitTokens) || config.nudge.minPressureBenefitTokens < 0)) {
    errors.push("nudge.minPressureBenefitTokens must be finite and >= 0");
  }
  if (config.promotionThreshold < 1) {
    errors.push("promotionThreshold must be >= 1");
  }
  if (config.truncate.threshold <= 0 || config.truncate.threshold > 1) {
    errors.push("truncate.threshold must be in (0, 1]");
  }
  for (const tier of [config.tiers.tier2Trigger, config.tiers.tier3Trigger]) {
    if (tier < 1) errors.push("tier triggers must be >= 1");
  }
  if (config.tiers.tier3Trigger <= config.tiers.tier2Trigger) {
    errors.push("tiers.tier3Trigger must be greater than tiers.tier2Trigger");
  }
  if (config.absorb) {
    if (config.absorb.enabled && !config.absorb.toolName) {
      errors.push("absorb.toolName must be a non-empty string when enabled");
    }
    if (!Number.isFinite(config.absorb.minToolTokens) || config.absorb.minToolTokens < 0) {
      errors.push("absorb.minToolTokens must be >= 0");
    }
    if (config.absorb.contextThresholdPct < 0 || config.absorb.contextThresholdPct > 1) {
      errors.push("absorb.contextThresholdPct must be in [0, 1]");
    }
  }
  return errors;
}
var MESSAGE_REF_PATTERN = /^m0*(\d{1,5})$/;
var BLOCK_REF_PATTERN = /^b(\d{1,9})$/;
function parseBoundary(ref) {
  const normalized = ref.trim().toLowerCase();
  const messageMatch = MESSAGE_REF_PATTERN.exec(normalized);
  if (messageMatch) {
    const numericId = Number(messageMatch[1]);
    if (numericId >= 1 && numericId <= 99999) {
      return { kind: "message", numericId, raw: normalized };
    }
  }
  const blockMatch = BLOCK_REF_PATTERN.exec(normalized);
  if (blockMatch) {
    const numericId = Number(blockMatch[1]);
    if (numericId >= 1) return { kind: "block", numericId, raw: normalized };
  }
  return null;
}
var BoundaryNotFoundError = class extends Error {
  code = "BOUNDARY_NOT_FOUND";
  kind;
  endpoint;
  constructor(kind, endpoint, message) {
    super(message);
    this.name = "BoundaryNotFoundError";
    this.code = "BOUNDARY_NOT_FOUND";
    this.kind = kind;
    this.endpoint = endpoint;
  }
};
function resolveBoundaries(input) {
  const start = parseBoundary(input.startRef);
  const end = parseBoundary(input.endRef);
  if (!start || !end) {
    throw new Error(
      `Invalid boundary ref(s): startId="${input.startRef}", endId="${input.endRef}". Use mNNNNN or bN.`
    );
  }
  const indexByMessageId = /* @__PURE__ */ new Map();
  input.messages.forEach(
    (message, index) => indexByMessageId.set(message.id, index)
  );
  let snappedBoundaries = [];
  const startAnchor = resolveAnchorIndex(
    start,
    input.state,
    indexByMessageId,
    "start"
  );
  if (startAnchor.snapped) snappedBoundaries.push(startAnchor.snapped);
  const endAnchor = resolveAnchorIndex(
    end,
    input.state,
    indexByMessageId,
    "end"
  );
  if (endAnchor.snapped) snappedBoundaries.push(endAnchor.snapped);
  let startIndex = startAnchor.index;
  let endIndex = endAnchor.index;
  if (startIndex > endIndex) {
    [startIndex, endIndex] = [endIndex, startIndex];
  }
  const messageIds = [];
  for (let index = startIndex; index <= endIndex; index++) {
    const message = input.messages[index];
    if (message && !isRenderedSummaryMessage(message))
      messageIds.push(message.id);
  }
  const boundaryKind = start.kind === "block" || end.kind === "block" ? "block" : "message";
  const nestedBlockIds = [];
  const nestedSeen = /* @__PURE__ */ new Set();
  for (const block of activeBlocks(input.state)) {
    if (blockVisibleInRange(block, indexByMessageId, startIndex, endIndex)) {
      if (!nestedSeen.has(block.blockId)) {
        nestedSeen.add(block.blockId);
        nestedBlockIds.push(block.blockId);
      }
    }
  }
  const protectedGaps = [];
  return {
    startIndex,
    endIndex,
    messageIds,
    nestedBlockIds,
    boundaryKind,
    protectedGaps,
    snappedBoundaries
  };
}
function resolveAnchorIndex(boundary, state, indexByMessageId, endpoint) {
  const label = endpoint === "start" ? "startId" : "endId";
  if (boundary.kind === "message") {
    const rawId = state.messageRefs.byRef[boundary.raw] ?? state.messageRefs.byRef[formatPaddedRef(boundary.numericId)];
    if (!rawId) {
      throw new BoundaryNotFoundError(
        "unknown",
        endpoint,
        `${label}="${boundary.raw}" does not exist in this session (typo or wrong session) \u2014 run acp_status for current refs.`
      );
    }
    const index = indexByMessageId.get(rawId);
    if (index !== void 0) {
      return { index, snapped: null };
    }
    const owner2 = activeOwnerAnchor(state, [rawId], indexByMessageId);
    if (owner2 !== null) {
      return {
        index: owner2,
        snapped: `${label}="${boundary.raw}" refers to a message already compressed into an active block \u2014 anchored to the active block covering it instead.`
      };
    }
    throw new BoundaryNotFoundError(
      "consumed",
      endpoint,
      `${label}="${boundary.raw}" not found in visible context (likely consumed by an existing block).`
    );
  }
  const block = blockById(state, `b${boundary.numericId}`);
  if (!block) {
    throw new BoundaryNotFoundError(
      "unknown",
      endpoint,
      `${label}="b${boundary.numericId}" does not exist in this session (typo or wrong session) \u2014 run acp_status for current refs.`
    );
  }
  if (block.active) {
    const anchor = visibleBlockAnchor(block, indexByMessageId);
    if (anchor !== null) {
      return { index: anchor, snapped: null };
    }
  }
  const owner = activeOwnerAnchor(
    state,
    block.effectiveMessageIds,
    indexByMessageId
  );
  if (owner !== null) {
    return {
      index: owner,
      snapped: `${label}="b${boundary.numericId}" was consumed by a higher-tier block \u2014 anchored to the active block covering its content instead.`
    };
  }
  if (!block.active) {
    throw new BoundaryNotFoundError(
      "consumed",
      endpoint,
      `${label}="b${boundary.numericId}" not found in visible context (block distilled/consumed by a higher-tier block).`
    );
  }
  throw new BoundaryNotFoundError(
    "consumed",
    endpoint,
    `${label}="b${boundary.numericId}" is an active block but none of its content (raw messages or rendered summary) is visible in the current context \u2014 run acp_status to verify.`
  );
}
function activeOwnerAnchor(state, ownedIds, indexByMessageId) {
  if (ownedIds.length === 0) return null;
  const owned = new Set(ownedIds);
  let best = null;
  for (const block of state.blocks) {
    if (!block.active) continue;
    const inherited = inheritedContentIds(state, block);
    let ownsInherited = false;
    for (const id of owned) {
      if (inherited.has(id)) {
        ownsInherited = true;
        break;
      }
    }
    if (!ownsInherited) continue;
    const anchor = visibleBlockAnchor(block, indexByMessageId);
    if (anchor === null) continue;
    if (best === null || anchor < best) {
      best = anchor;
    }
  }
  return best;
}
function inheritedContentIds(state, block) {
  const ids = /* @__PURE__ */ new Set();
  for (const childId of block.directBlockIds) {
    const child = blockById(state, childId);
    if (!child) continue;
    for (const id of child.effectiveMessageIds) ids.add(id);
  }
  return ids;
}
function formatPaddedRef(index) {
  return `m${String(index).padStart(5, "0")}`;
}
function visibleBlockAnchor(block, indexByMessageId) {
  const summaryIndex = indexByMessageId.get(summaryMessageId(block.blockId));
  if (summaryIndex !== void 0) return summaryIndex;
  return earliestIndexOfIds(block.effectiveMessageIds, indexByMessageId);
}
function blockVisibleInRange(block, indexByMessageId, startIndex, endIndex) {
  const summaryIndex = indexByMessageId.get(summaryMessageId(block.blockId));
  if (summaryIndex !== void 0 && summaryIndex >= startIndex && summaryIndex <= endIndex) {
    return true;
  }
  const rawIndex = earliestIndexOfIds(
    block.effectiveMessageIds,
    indexByMessageId
  );
  return rawIndex !== null && rawIndex >= startIndex && rawIndex <= endIndex;
}
function earliestIndexOfIds(ids, indexByMessageId) {
  let earliest = null;
  for (const id of ids) {
    const index = indexByMessageId.get(id);
    if (index !== void 0 && (earliest === null || index < earliest)) {
      earliest = index;
    }
  }
  return earliest;
}
var TRUNCATION_MARKER = "[truncated for context space]";
var DEFAULTS = {
  minOutputTokens: 1e3,
  keepPrefixChars: 2e3,
  keepSuffixChars: 2e3,
  protectRecentMessages: 3
};
function truncateLargeToolOutputs(messages, tokenCount, config, countTokens, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (config.modelContextLimit <= 0) return { messages, truncatedCount: 0, savedTokens: 0 };
  const threshold = config.truncate.threshold * config.modelContextLimit;
  if (tokenCount < threshold) return { messages, truncatedCount: 0, savedTokens: 0 };
  const protectedIndex = messages.length - opts.protectRecentMessages;
  const candidates = [];
  for (let index = 0; index < messages.length; index++) {
    if (index >= protectedIndex) break;
    const message = messages[index];
    if (message.contentType !== "tool-result") continue;
    const text = message.text ?? "";
    if (text.length === 0 || text.includes(TRUNCATION_MARKER)) continue;
    const tokens = countTokens(text);
    if (tokens < opts.minOutputTokens) continue;
    candidates.push({ index, tokens });
  }
  if (candidates.length === 0) return { messages, truncatedCount: 0, savedTokens: 0 };
  candidates.sort((left, right) => right.tokens - left.tokens);
  const targetTokens = threshold * 0.9;
  let savedTokens = 0;
  const edits = /* @__PURE__ */ new Map();
  let truncatedCount = 0;
  for (const candidate of candidates) {
    if (tokenCount - savedTokens <= targetTokens) break;
    const original = messages[candidate.index].text ?? "";
    if (original.length <= opts.keepPrefixChars + opts.keepSuffixChars) continue;
    const prefix = original.slice(0, opts.keepPrefixChars);
    const suffix = original.slice(-opts.keepSuffixChars);
    const replacement = prefix + `

...${TRUNCATION_MARKER} \u2014 original ~${candidate.tokens} tokens]...

` + suffix;
    edits.set(candidate.index, replacement);
    savedTokens += candidate.tokens - countTokens(replacement);
    truncatedCount++;
  }
  if (truncatedCount === 0) return { messages, truncatedCount: 0, savedTokens: 0 };
  const updated = messages.map(
    (message, index) => edits.has(index) ? { ...message, text: edits.get(index) } : message
  );
  return { messages: updated, truncatedCount, savedTokens };
}
var KEEP_LAST_ORPHANED = 2;
function rangeKey(startRef, endRef) {
  return `${startRef}::${endRef}`;
}
function parseCallText(text) {
  const raw = text ?? "";
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed;
  let content = null;
  let contentWasString = false;
  if (Array.isArray(obj.content)) {
    content = obj.content;
  } else if (typeof obj.content === "string") {
    contentWasString = true;
    try {
      const inner = JSON.parse(obj.content);
      if (Array.isArray(inner)) content = inner;
    } catch {
      content = null;
    }
  }
  if (!content || content.length === 0) return null;
  return { prefix: raw.slice(0, start), obj, content, contentWasString };
}
function rewriteCompressText(text, liveKeys) {
  const parsed = parseCallText(text);
  if (!parsed) return null;
  const { prefix, obj, content, contentWasString } = parsed;
  const kept = content.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry;
    const s = typeof e.startId === "string" ? e.startId : typeof e.messageId === "string" ? e.messageId : "";
    const end = typeof e.endId === "string" ? e.endId : typeof e.messageId === "string" ? e.messageId : "";
    return liveKeys.has(rangeKey(s, end));
  });
  if (kept.length === 0) return null;
  return prefix + serializeCompacted(obj, kept, contentWasString).text;
}
var SUMMARY_STUB_CHARS = 200;
function compactEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const e = entry;
  if (typeof e.summary !== "string" || e.summary.length <= SUMMARY_STUB_CHARS) return entry;
  return { ...e, summary: `${e.summary.slice(0, SUMMARY_STUB_CHARS - 1)}\u2026` };
}
function serializeCompacted(obj, content, contentWasString) {
  let changed = false;
  const compacted = content.map((entry) => {
    const out = compactEntry(entry);
    if (out !== entry) changed = true;
    return out;
  });
  const outContent = contentWasString ? JSON.stringify(compacted) : compacted;
  return { text: JSON.stringify({ ...obj, content: outContent }), changed };
}
function compactCompressText(text) {
  const parsed = parseCallText(text);
  if (!parsed) return null;
  const { prefix, obj, content, contentWasString } = parsed;
  const { text: out, changed } = serializeCompacted(obj, content, contentWasString);
  return changed ? prefix + out : null;
}
function hideConsumedCompressCalls(state, messages) {
  const allBlockCallIds = /* @__PURE__ */ new Set();
  const activeCallIds = /* @__PURE__ */ new Set();
  const liveRangeKeysByCallId = /* @__PURE__ */ new Map();
  const legacyLiveByCallId = /* @__PURE__ */ new Set();
  for (const block of state.blocks) {
    if (!block.compressCallId) continue;
    allBlockCallIds.add(block.compressCallId);
    if (!block.active) continue;
    activeCallIds.add(block.compressCallId);
    if (block.startRef === void 0 || block.endRef === void 0) {
      legacyLiveByCallId.add(block.compressCallId);
      continue;
    }
    let keys = liveRangeKeysByCallId.get(block.compressCallId);
    if (!keys) {
      keys = /* @__PURE__ */ new Set();
      liveRangeKeysByCallId.set(block.compressCallId, keys);
    }
    keys.add(rangeKey(block.startRef, block.endRef));
  }
  const lastOrphanedCallIds = [];
  for (let i = messages.length - 1; i >= 0 && lastOrphanedCallIds.length < KEEP_LAST_ORPHANED; i--) {
    const message = messages[i];
    if (message.toolName !== "compress" || message.contentType !== "tool-call") continue;
    const callId = message.toolCallId;
    if (callId && !allBlockCallIds.has(callId)) {
      lastOrphanedCallIds.push(callId);
    }
  }
  const keepCallIds = /* @__PURE__ */ new Set([...activeCallIds, ...lastOrphanedCallIds]);
  const hiddenCallIds = /* @__PURE__ */ new Set();
  for (const message of messages) {
    if (message.toolName === "compress" && message.contentType === "tool-call" && (!message.toolCallId || !keepCallIds.has(message.toolCallId))) {
      if (message.toolCallId) hiddenCallIds.add(message.toolCallId);
    }
  }
  let hidden = 0;
  const result = [];
  for (const message of messages) {
    if (message.toolName === "compress" && message.contentType === "tool-call" && (!message.toolCallId || !keepCallIds.has(message.toolCallId))) {
      hidden++;
      continue;
    }
    if (message.contentType === "tool-result" && message.toolCallId && hiddenCallIds.has(message.toolCallId)) {
      hidden++;
      continue;
    }
    if (message.toolName === "compress" && message.contentType === "tool-call" && message.toolCallId && keepCallIds.has(message.toolCallId)) {
      const liveKeys = liveRangeKeysByCallId.get(message.toolCallId);
      if (liveKeys && liveKeys.size > 0 && !legacyLiveByCallId.has(message.toolCallId)) {
        const rewritten = rewriteCompressText(message.text, liveKeys);
        if (rewritten !== null) {
          result.push({ ...message, text: rewritten });
          continue;
        }
      }
      const compacted = compactCompressText(message.text);
      if (compacted !== null) {
        result.push({ ...message, text: compacted });
        continue;
      }
    }
    result.push(message);
  }
  return { messages: result, hidden };
}
var COMPRESS_TOOL_NAME = "compress";
var DECOMPRESS_TOOL_NAME = "decompress";
var SEARCH_CONTEXT_TOOL_NAME = "search_context";
var ACP_STATUS_TOOL_NAME = "acp_status";
var ABSORB_TOOL_NAME = "absorb";
var COMPRESS_TOOL = {
  name: COMPRESS_TOOL_NAME,
  description: "Replace a contiguous range of older conversation with a detailed summary you write. Use when content is genuinely consumed. Batch form: content=[{startId,endId,summary,topic?}]. REQUIRED \u2014 compress without content is invalid.",
  input_schema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "Optional short title for the compressed range"
      },
      content: {
        type: "array",
        description: "One or more ranges to compress into separate summary blocks",
        items: {
          type: "object",
          properties: {
            topic: { type: "string" },
            startId: {
              type: "string",
              description: "mNNNNN ref at the start of the range"
            },
            endId: {
              type: "string",
              description: "mNNNNN ref at the end of the range"
            },
            summary: {
              type: "string",
              description: "Self-contained summary replacing the range"
            }
          },
          required: ["startId", "endId", "summary"]
        }
      }
    },
    required: ["content"]
  }
};
var COMPRESS_TOOL_OPENAI = {
  type: "function",
  function: {
    name: COMPRESS_TOOL_NAME,
    description: COMPRESS_TOOL.description,
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Optional short title for the compressed range"
        },
        content: {
          type: "array",
          description: "One or more ranges to compress into separate summary blocks. REQUIRED \u2014 compress without content is invalid.",
          items: {
            type: "object",
            properties: {
              topic: { type: "string" },
              startId: {
                type: "string",
                description: "mNNNNN ref at the start of the range"
              },
              endId: {
                type: "string",
                description: "mNNNNN ref at the end of the range"
              },
              summary: {
                type: "string",
                description: "Self-contained summary replacing the range"
              }
            },
            required: ["startId", "endId", "summary"]
          }
        }
      },
      required: ["content"]
    }
  }
};
var DECOMPRESS_TOOL_OPENAI = {
  type: "function",
  function: {
    name: DECOMPRESS_TOOL_NAME,
    description: "Restores previously compressed content. Use when you need exact details lost in compression. By default restores one tier up. Use full:true for all the way to original messages. Use toFile to write to file instead of inflating context.",
    parameters: {
      type: "object",
      properties: {
        blockId: {
          type: "string",
          description: "Block ID to decompress (e.g. b5)"
        },
        toFile: {
          type: "string",
          description: "Optional: write content to file instead of context"
        },
        full: {
          type: "boolean",
          description: "Restore all the way to original messages"
        }
      },
      required: ["blockId"]
    }
  }
};
var SEARCH_CONTEXT_TOOL_OPENAI = {
  type: "function",
  function: {
    name: SEARCH_CONTEXT_TOOL_NAME,
    description: "Search through compressed block summaries by keyword. Use BEFORE decompressing to find the right block.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)" }
      },
      required: ["query"]
    }
  }
};
var ACP_STATUS_TOOL_OPENAI = {
  type: "function",
  function: {
    name: ACP_STATUS_TOOL_NAME,
    description: "Show context usage and compressible ranges. No args = overview. Use to find what to compress next.",
    parameters: {
      type: "object",
      properties: {}
    }
  }
};
var DECOMPRESS_TOOL = {
  name: DECOMPRESS_TOOL_NAME,
  description: DECOMPRESS_TOOL_OPENAI.function.description,
  input_schema: DECOMPRESS_TOOL_OPENAI.function.parameters
};
var SEARCH_CONTEXT_TOOL = {
  name: SEARCH_CONTEXT_TOOL_NAME,
  description: SEARCH_CONTEXT_TOOL_OPENAI.function.description,
  input_schema: SEARCH_CONTEXT_TOOL_OPENAI.function.parameters
};
var ACP_STATUS_TOOL = {
  name: ACP_STATUS_TOOL_NAME,
  description: ACP_STATUS_TOOL_OPENAI.function.description,
  input_schema: ACP_STATUS_TOOL_OPENAI.function.parameters
};
var COMPRESS_TOOL_RESPONSES = {
  type: "function",
  name: COMPRESS_TOOL_NAME,
  description: COMPRESS_TOOL.description,
  parameters: COMPRESS_TOOL_OPENAI.function.parameters
};
var DECOMPRESS_TOOL_RESPONSES = {
  type: "function",
  name: DECOMPRESS_TOOL_OPENAI.function.name,
  description: DECOMPRESS_TOOL_OPENAI.function.description,
  parameters: DECOMPRESS_TOOL_OPENAI.function.parameters
};
var SEARCH_CONTEXT_TOOL_RESPONSES = {
  type: "function",
  name: SEARCH_CONTEXT_TOOL_OPENAI.function.name,
  description: SEARCH_CONTEXT_TOOL_OPENAI.function.description,
  parameters: SEARCH_CONTEXT_TOOL_OPENAI.function.parameters
};
var ACP_STATUS_TOOL_RESPONSES = {
  type: "function",
  name: ACP_STATUS_TOOL_OPENAI.function.name,
  description: ACP_STATUS_TOOL_OPENAI.function.description,
  parameters: ACP_STATUS_TOOL_OPENAI.function.parameters
};
var ACP_TOOL_NAMES = /* @__PURE__ */ new Set([
  COMPRESS_TOOL_NAME,
  DECOMPRESS_TOOL_NAME,
  SEARCH_CONTEXT_TOOL_NAME,
  ACP_STATUS_TOOL_NAME
]);
var ALWAYS_PROTECTED_TOOLS = ["compress"];
var NEVER_PRESERVE_RECENT_TOOLS = [
  "decompress",
  "search_context",
  "read",
  "bash"
];
function isNeverPreserveRecent(msg) {
  if (msg.contentType !== "tool-call" && msg.contentType !== "tool-result") {
    return false;
  }
  if (!msg.toolName) return false;
  return NEVER_PRESERVE_RECENT_TOOLS.includes(msg.toolName);
}
function matchToolPattern(toolName, pattern) {
  if (pattern.endsWith("*")) {
    return toolName.startsWith(pattern.slice(0, -1));
  }
  return toolName === pattern;
}
function isMessageProtected(msg, config) {
  if (msg.contentType !== "tool-call" && msg.contentType !== "tool-result" || !msg.toolName) {
    return false;
  }
  if (ALWAYS_PROTECTED_TOOLS.includes(msg.toolName)) {
    return true;
  }
  for (const pattern of config.protectedTools) {
    if (matchToolPattern(msg.toolName, pattern)) return true;
  }
  if (config.isToolProtected?.(msg.toolName, msg.text)) return true;
  return false;
}
function collectProtectedToolCallIds(messages, config) {
  const ids = /* @__PURE__ */ new Set();
  for (const m of messages) {
    if (m.contentType === "tool-call" && m.toolCallId && isMessageProtected(m, config)) {
      ids.add(m.toolCallId);
    }
  }
  return ids;
}
function isMessageProtectedWithPairing(msg, config, protectedCallIds) {
  if (isMessageProtected(msg, config)) return true;
  if (msg.contentType === "tool-result" && msg.toolCallId && protectedCallIds.has(msg.toolCallId)) {
    return true;
  }
  return false;
}
var ABSORB_PROMPT_MARKER = "[ACP absorb]";
var DEFAULT_ABSORB_CONFIG = {
  enabled: false,
  toolName: ABSORB_TOOL_NAME,
  minToolTokens: 1e3,
  contextThresholdPct: 0,
  excludeTools: []
};
function resolveAbsorbConfig(config) {
  return { ...DEFAULT_ABSORB_CONFIG, ...config.absorb ?? {} };
}
function formatTokenCount(tokens) {
  if (tokens < 1e3) return String(tokens);
  if (tokens < 1e4) return (tokens / 1e3).toFixed(1) + "K";
  return Math.round(tokens / 1e3) + "K";
}
function buildAbsorbPrompt(ref, tokens, toolName = ABSORB_TOOL_NAME) {
  return `${ABSORB_PROMPT_MARKER} This tool result (~${formatTokenCount(tokens)} tokens) will be REMOVED from context. Your IMMEDIATE next action: call ${toolName}({ ref: "${ref}", summary: "..." }) \u2014 summary = distilled essentials only (outcome, key values, exact paths:lines, error text verbatim, decisions). Afterwards work from your summary; do NOT re-run this tool. If the result contains nothing you need, call ${toolName} with summary "(nothing needed)".`;
}
function isAcpOrConfiguredTool(toolName, cfg) {
  if (!toolName) return false;
  if (toolName === cfg.toolName) return true;
  return ACP_TOOL_NAMES.has(toolName);
}
function isAbsorbCandidate(msg, config) {
  if (msg.contentType !== "tool-result" || !msg.toolCallId) return false;
  const cfg = resolveAbsorbConfig(config);
  if (isAcpOrConfiguredTool(msg.toolName, cfg)) return false;
  if (isMessageProtected(msg, config)) return false;
  for (const pattern of cfg.excludeTools) {
    if (msg.toolName && matchToolPattern(msg.toolName, pattern)) return false;
  }
  return true;
}
function hideAbsorbedMessages(messages, state) {
  const records = state.absorbed ?? [];
  if (records.length === 0) return messages;
  const hidden = /* @__PURE__ */ new Set();
  for (const record of records) {
    if (record.callMessageId) hidden.add(record.callMessageId);
    if (record.resultMessageId) hidden.add(record.resultMessageId);
  }
  return messages.filter((msg) => !hidden.has(msg.id));
}
function appendAbsorbPrompts(messages, state, config, tokenCount, countTokens) {
  const cfg = resolveAbsorbConfig(config);
  if (!cfg.enabled) return { messages, promptedCount: 0 };
  const limit = config.modelContextLimit;
  if (cfg.contextThresholdPct > 0 && limit > 0 && tokenCount < cfg.contextThresholdPct * limit) {
    return { messages, promptedCount: 0 };
  }
  const absorbedIds = /* @__PURE__ */ new Set();
  for (const record of state.absorbed ?? []) {
    if (record.resultMessageId) absorbedIds.add(record.resultMessageId);
  }
  let promptedCount = 0;
  const out = messages.map((msg) => {
    if (!isAbsorbCandidate(msg, config)) return msg;
    if (absorbedIds.has(msg.id)) return msg;
    const text = msg.text ?? "";
    if (text.includes(ABSORB_PROMPT_MARKER)) return msg;
    const tokens = countTokens(text);
    if (tokens < cfg.minToolTokens) return msg;
    const ref = refForRaw(state.messageRefs, msg.id);
    if (!ref || ref === BLOCKED_REF) return msg;
    promptedCount++;
    return {
      ...msg,
      text: text + "\n\n" + buildAbsorbPrompt(ref, tokens, cfg.toolName)
    };
  });
  return { messages: out, promptedCount };
}
var registry = /* @__PURE__ */ new Map();
function listMessageFilters() {
  return [...registry.values()];
}
function applyMessageFilters(messages, config) {
  if (!config?.enabled) {
    return { messages, partsFiltered: 0, partsDropped: 0, partsModified: 0 };
  }
  const active = listMessageFilters().filter(
    (filter) => config.filters?.[filter.name]?.enabled !== false
  );
  if (active.length === 0) {
    return { messages, partsFiltered: 0, partsDropped: 0, partsModified: 0 };
  }
  let working = messages.map((message) => ({ ...message }));
  const tally = { partsFiltered: 0, partsDropped: 0, partsModified: 0 };
  const total = working.length;
  const immediate = active.filter((filter) => !filter.keepLastOnly);
  for (let index = 0; index < working.length; index++) {
    const message = working[index];
    const text = message.text ?? "";
    if (text.length === 0) continue;
    let current = text;
    const baseCtx = {
      text: current,
      role: message.role,
      messageIndex: index,
      totalMessages: total,
      toolName: message.toolName
    };
    for (const filter of immediate) {
      let decision;
      try {
        decision = filter.filter(baseCtx);
      } catch {
        continue;
      }
      if (decision.action === "keep") continue;
      tally.partsFiltered++;
      if (decision.action === "drop") {
        current = "";
        tally.partsDropped++;
      } else if (decision.action === "modify" && decision.text !== void 0) {
        current = decision.text;
        tally.partsModified++;
      }
      baseCtx.text = current;
    }
    if (current !== text) working[index] = { ...message, text: current };
  }
  const keepLast = active.filter((filter) => filter.keepLastOnly);
  for (const filter of keepLast) {
    let foundLast = false;
    for (let index = working.length - 1; index >= 0; index--) {
      const message = working[index];
      const text = message.text ?? "";
      if (text.length === 0) continue;
      const ctx = {
        text,
        role: message.role,
        messageIndex: index,
        totalMessages: total,
        toolName: message.toolName
      };
      let decision;
      try {
        decision = filter.filter(ctx);
      } catch {
        continue;
      }
      if (decision.action !== "drop" && decision.action !== "modify") continue;
      if (foundLast) {
        tally.partsFiltered++;
        tally.partsDropped++;
        working[index] = { ...message, text: "" };
      } else {
        foundLast = true;
        if (decision.action === "modify" && decision.text !== void 0) {
          tally.partsFiltered++;
          tally.partsModified++;
          working[index] = { ...message, text: decision.text };
        }
      }
    }
  }
  return { messages: working, ...tally };
}
function formatTokens(tokens) {
  if (tokens < 1e3) return String(tokens);
  if (tokens < 1e4) return (tokens / 1e3).toFixed(1) + "K";
  return Math.round(tokens / 1e3) + "K";
}
function classifyType(message) {
  if (message.contentType === "tool-call" || message.contentType === "tool-result") {
    return message.toolName || "tool";
  }
  return message.contentType;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var LT = "<";
var GT = ">";
var TAG_OPEN = LT + "acp ";
var TAG_CLOSE = LT + "/acp" + GT;
function acpTag(ref, tokens, type) {
  return TAG_OPEN + 'tokens="' + formatTokens(tokens) + '" type="' + type + '"' + GT + ref + TAG_CLOSE;
}
function renderMessage(message, map, countTokens, strategy, snapshot = null) {
  const ref = refForRaw(map, message.id);
  if (!ref || ref === BLOCKED_REF) return message;
  if (strategy === "none") return message;
  if (strategy === "text-only" && message.contentType !== "text") {
    return message;
  }
  const ownTagRe = new RegExp(
    "^" + escapeRegex(TAG_OPEN) + "[^>]*" + GT + escapeRegex(ref) + escapeRegex(TAG_CLOSE) + "\\n?"
  );
  const cleanText = (message.text || "").replace(ownTagRe, "");
  const textTokens = snapshot ? snapshot[ref] ?? (snapshot[ref] = countTokens(cleanText)) : countTokens(cleanText);
  const tokens = textTokens + thinkingTokenValue(message.thinkingTokens);
  const type = classifyType(message);
  const prefix = acpTag(ref, tokens, type) + "\n";
  if (!cleanText) return { ...message, text: prefix };
  return { ...message, text: prefix + cleanText };
}
function renderWithSnapshot(messages, state, countTokens = (text) => Math.ceil(text.length / 4), strategy = "all") {
  const map = state.messageRefs;
  const snapshot = { ...state.tokenSnapshot ?? {} };
  const rendered = messages.map(
    (message) => renderMessage(message, map, countTokens, strategy, snapshot)
  );
  return { messages: rendered, tokenSnapshot: snapshot };
}
function createRenderRefsNode(strategy) {
  return {
    name: "render-refs",
    run(io, ctx) {
      const { messages, tokenSnapshot } = renderWithSnapshot(
        io.messages,
        io.state,
        ctx.countTokens,
        strategy
      );
      const prev = io.state.tokenSnapshot;
      const changed = !prev || Object.keys(tokenSnapshot).length !== Object.keys(prev).length;
      return changed ? { ...io, messages, state: { ...io.state, tokenSnapshot } } : { ...io, messages };
    }
  };
}
var renderRefsNode = createRenderRefsNode("all");
function adjustBoundariesForToolPairs(startIndex, endIndex, messages, maxScan = 20) {
  const callIdsInRange = /* @__PURE__ */ new Set();
  for (let i = startIndex; i <= endIndex; i++) {
    const msg = messages[i];
    if (!msg || !msg.toolCallId) continue;
    if (msg.toolName === "compress") continue;
    callIdsInRange.add(msg.toolCallId);
  }
  if (callIdsInRange.size === 0) {
    return { startIndex, endIndex };
  }
  let newEndIndex = endIndex;
  for (let i = endIndex + 1; i < messages.length && i <= endIndex + maxScan; i++) {
    const msg = messages[i];
    if (!msg) break;
    if (msg.toolCallId && callIdsInRange.has(msg.toolCallId)) {
      newEndIndex = i;
    } else if (newEndIndex > endIndex) {
      break;
    }
  }
  let newStartIndex = startIndex;
  for (let i = startIndex - 1; i >= 0 && i >= startIndex - maxScan; i--) {
    const msg = messages[i];
    if (!msg) break;
    if (msg.toolCallId && callIdsInRange.has(msg.toolCallId)) {
      newStartIndex = i;
    } else if (newStartIndex < startIndex) {
      break;
    }
  }
  return { startIndex: newStartIndex, endIndex: newEndIndex };
}
function adjustBoundariesForReasoningPairs(startIndex, endIndex, messages) {
  if (startIndex > endIndex) {
    return { startIndex, endIndex };
  }
  let newStartIndex = startIndex;
  let newEndIndex = endIndex;
  for (let i = startIndex; i <= endIndex && i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.contentType === "reasoning") {
      let j = i;
      while (j + 1 < messages.length && messages[j + 1].contentType === "reasoning") {
        j++;
      }
      const companion = messages[j + 1];
      if (companion !== void 0 && companion.role === "assistant" && (companion.contentType === "text" || companion.contentType === "tool-call")) {
        let e = j + 1;
        while (e + 1 < messages.length && messages[e + 1].role === "assistant" && (messages[e + 1].contentType === "text" || messages[e + 1].contentType === "tool-call")) {
          e++;
        }
        if (e > newEndIndex) newEndIndex = e;
      }
    }
    if (msg.role === "assistant" && (msg.contentType === "text" || msg.contentType === "tool-call")) {
      let k = i - 1;
      while (k >= 0 && messages[k].contentType === "reasoning") {
        k--;
      }
      const runStart = k + 1;
      if (runStart < i && runStart >= 0 && messages[runStart].contentType === "reasoning" && runStart < newStartIndex) {
        newStartIndex = runStart;
      }
    }
  }
  return { startIndex: newStartIndex, endIndex: newEndIndex };
}
function isAssistantAct(msg) {
  return msg.role === "assistant" && (msg.contentType === "text" || msg.contentType === "tool-call");
}
function computeTurnGroups(messages) {
  const resultIdByCallId = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (msg.contentType === "tool-result" && typeof msg.toolCallId === "string" && msg.id) {
      if (!resultIdByCallId.has(msg.toolCallId))
        resultIdByCallId.set(msg.toolCallId, msg.id);
    }
  }
  const grouped = /* @__PURE__ */ new Set();
  const groups = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.id || grouped.has(msg.id)) continue;
    if (!(msg.contentType === "reasoning" || isAssistantAct(msg))) continue;
    let reasoningStart = i;
    if (msg.contentType === "reasoning") {
      while (reasoningStart > 0 && messages[reasoningStart - 1].contentType === "reasoning") {
        reasoningStart--;
      }
    } else {
      let s = i;
      while (s > 0 && isAssistantAct(messages[s - 1])) s--;
      reasoningStart = s;
      while (reasoningStart > 0 && messages[reasoningStart - 1].contentType === "reasoning") {
        reasoningStart--;
      }
    }
    const burstStart = (() => {
      let s = reasoningStart;
      while (s < messages.length && messages[s].contentType === "reasoning")
        s++;
      return s;
    })();
    if (burstStart >= messages.length || !isAssistantAct(messages[burstStart])) {
      continue;
    }
    let burstEnd = burstStart;
    while (burstEnd + 1 < messages.length && isAssistantAct(messages[burstEnd + 1])) {
      burstEnd++;
    }
    const members = /* @__PURE__ */ new Set();
    for (let k = reasoningStart; k <= burstEnd; k++) {
      const m = messages[k];
      if (!m.id) continue;
      members.add(m.id);
      if (m.role === "assistant" && m.contentType === "tool-call" && typeof m.toolCallId === "string") {
        const rid = resultIdByCallId.get(m.toolCallId);
        if (rid) members.add(rid);
      }
    }
    for (const id of members) grouped.add(id);
    groups.push([...members]);
  }
  return groups;
}
function estimateTextTokens(text) {
  return Math.ceil(text.length / 4);
}
function isToolMessage(message) {
  return message.contentType === "tool-call" || message.contentType === "tool-result";
}
function isSyntheticOrPruned(message, state) {
  if (message.text?.startsWith("[Compressed conversation section]")) return true;
  for (const block of state.blocks) {
    if (block.active && block.effectiveMessageIds.includes(message.id)) return true;
  }
  return false;
}
function computeProtectedRefs(messages, state, config, countTokens = estimateTextTokens) {
  const preserveN = config.preserveRecentMessages;
  const preserveTokens = config.preserveRecentTokens;
  const result = /* @__PURE__ */ new Set();
  const visible = [];
  for (const msg of messages) {
    if (isSyntheticOrPruned(msg, state)) continue;
    if (isNeverPreserveRecent(msg)) continue;
    const ref = state.messageRefs.byRaw[msg.id];
    if (!ref || ref === "BLOCKED") continue;
    visible.push({ ref, tokens: countMessageTokens(msg, countTokens) });
  }
  if (preserveN > 0) {
    for (const m of visible.slice(-preserveN)) {
      result.add(m.ref);
    }
  }
  if (preserveTokens > 0) {
    let tokenAccum = 0;
    for (let i = visible.length - 1; i >= 0 && tokenAccum < preserveTokens; i--) {
      result.add(visible[i].ref);
      tokenAccum += visible[i].tokens;
    }
  }
  if (preserveN > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "user" || isSyntheticOrPruned(msg, state)) continue;
      const ref = state.messageRefs.byRaw[msg.id];
      if (ref && ref !== "BLOCKED") result.add(ref);
      break;
    }
  }
  return result;
}
function buildCompressibleRanges(messages, state, config, protectedZoneRefs, countTokens = estimateTextTokens) {
  const compressibleMsgs = [];
  const protectedMsgs = [];
  const protectedCallIds = collectProtectedToolCallIds(messages, config);
  let skipSinceCompressible = false;
  let skipSinceProtected = false;
  for (const msg of messages) {
    const ref = state.messageRefs.byRaw[msg.id];
    if (!ref || ref === "BLOCKED") continue;
    if (isSyntheticOrPruned(msg, state)) {
      skipSinceCompressible = true;
      skipSinceProtected = true;
      continue;
    }
    if (isMessageProtectedWithPairing(msg, config, protectedCallIds)) {
      protectedMsgs.push({
        ref,
        gapBefore: skipSinceProtected,
        tokens: countMessageTokens(msg, countTokens),
        tools: msg.toolName ? [msg.toolName] : []
      });
      skipSinceProtected = false;
      skipSinceCompressible = true;
      continue;
    }
    if (protectedZoneRefs?.has(ref)) {
      skipSinceCompressible = true;
      skipSinceProtected = true;
      continue;
    }
    compressibleMsgs.push({
      ref,
      gapBefore: skipSinceCompressible,
      tokens: countMessageTokens(msg, countTokens),
      chars: (msg.text ?? "").length,
      isTool: isToolMessage(msg),
      isUser: msg.role === "user"
    });
    skipSinceCompressible = false;
    skipSinceProtected = true;
  }
  const compressible = [];
  let cur = null;
  for (const info of compressibleMsgs) {
    if (cur && (info.isUser && cur.count >= 3 || info.gapBefore)) {
      compressible.push(cur);
      cur = null;
    }
    if (!cur) {
      cur = {
        startRef: info.ref,
        endRef: info.ref,
        count: 1,
        tokens: info.tokens,
        chars: info.chars,
        toolPct: info.isTool ? 100 : 0,
        textPct: info.isTool ? 0 : 100
      };
    } else {
      cur.endRef = info.ref;
      cur.count++;
      cur.tokens += info.tokens;
      cur.chars = (cur.chars ?? 0) + info.chars;
      if (info.isTool) {
        cur.toolPct = Math.round((cur.toolPct * (cur.count - 1) + 100) / cur.count);
      } else {
        cur.toolPct = Math.round(cur.toolPct * (cur.count - 1) / cur.count);
      }
      cur.textPct = 100 - cur.toolPct;
    }
  }
  if (cur) compressible.push(cur);
  const protectedRanges = [];
  let pcur = null;
  for (const info of protectedMsgs) {
    if (pcur && info.gapBefore) {
      protectedRanges.push(pcur);
      pcur = null;
    }
    if (!pcur) {
      pcur = {
        startRef: info.ref,
        endRef: info.ref,
        count: 1,
        tokens: info.tokens,
        tools: [...info.tools]
      };
    } else {
      pcur.endRef = info.ref;
      pcur.count++;
      pcur.tokens += info.tokens;
      for (const t of info.tools) {
        if (!pcur.tools.includes(t)) pcur.tools.push(t);
      }
    }
  }
  if (pcur) protectedRanges.push(pcur);
  return {
    compressible: compressible.filter((g) => g.tokens > 0),
    protected: protectedRanges
  };
}
function mergeBatch(batch) {
  const first = batch[0];
  const last = batch[batch.length - 1];
  const count = batch.reduce((s, r) => s + r.count, 0);
  const tokens = batch.reduce((s, r) => s + r.tokens, 0);
  const chars = batch.reduce((s, r) => s + rangeChars(r), 0);
  const toolPct = Math.round(
    batch.reduce((s, r) => s + r.toolPct * r.count, 0) / count
  );
  const merged = {
    startRef: first.startRef,
    endRef: last.endRef,
    count,
    tokens,
    chars,
    toolPct,
    textPct: 100 - toolPct
  };
  if (batch.some((r) => r.dangerous === true)) {
    merged.dangerous = true;
  }
  return merged;
}
function rangeChars(r) {
  return r.chars ?? r.tokens * 4;
}
function mergeRangesToThreshold(ranges, minChars) {
  if (minChars <= 0 || ranges.length === 0) return ranges;
  const result = [];
  let batch = [];
  let batchChars = 0;
  for (const r of ranges) {
    batch.push(r);
    batchChars += rangeChars(r);
    if (batchChars >= minChars) {
      result.push(mergeBatch(batch));
      batch = [];
      batchChars = 0;
    }
  }
  if (batch.length > 0) {
    result.push(mergeBatch(batch));
  }
  return result;
}
function runPipeline(nodes, initial, ctx) {
  let io = initial;
  for (const node of nodes) {
    if (node.enabled && !node.enabled(io, ctx)) continue;
    io = node.run(io, ctx);
  }
  return io;
}
function rangeError(spec, message) {
  return `range ${spec.startRef}..${spec.endRef}: ${message}`;
}
function numericBlockId(id) {
  const parsed = /^b(\d+)$/.exec(id);
  return parsed ? Number(parsed[1]) : 0;
}
function refGateDiagnostics(state, requestedRanges, unknownCount) {
  const highest = highestUsedIndex(state.messageRefs);
  const highestRef = highest > 0 ? indexToRef(highest) : "none";
  return `[diagnostics: session highest ref=${highestRef}, unknown ranges in request=${unknownCount}/${requestedRanges}, session history=${state.stats.compressionCount} compression(s), ${state.blocks.length} block(s)]`;
}
function danglingMessageRefs(state, messages, spec) {
  const visible = new Set(messages.map((m) => m.id));
  const dangling = [];
  for (const ref of [spec.startRef, spec.endRef]) {
    const parsed = parseBoundary(ref);
    if (!parsed || parsed.kind !== "message") continue;
    const rawId = state.messageRefs.byRef[parsed.raw] ?? state.messageRefs.byRef[indexToRef(parsed.numericId)];
    if (!rawId || visible.has(rawId)) continue;
    const covered = state.blocks.some(
      (block) => block.active && block.effectiveMessageIds.includes(rawId)
    );
    if (!covered) dangling.push(parsed.raw);
  }
  return dangling;
}
function createCore(ports = {}) {
  const countTokens = ports.countTokens ?? defaultCountTokens;
  function applyCompression(input) {
    const state = cloneState(input.state);
    const runId = allocateRunId(state);
    let blocksCreated = 0;
    let tokensCompressed = 0;
    const errors = [];
    const warnings = [];
    const protectedMessageIds = input.protectedMessageIds ?? computeProtectedRefs(
      input.messages,
      input.state,
      input.config,
      countTokens
    );
    const preExistingCoverage = collectCoverage(state);
    const classifications = /* @__PURE__ */ new Map();
    const classificationErrors = [];
    const consumedRanges = [];
    for (const spec of input.ranges) {
      try {
        const resolved = resolveBoundaries({
          startRef: spec.startRef,
          endRef: spec.endRef,
          messages: input.messages,
          state
        });
        classifications.set(spec, { status: "ok", resolved });
      } catch (error) {
        if (error instanceof BoundaryNotFoundError) {
          classifications.set(
            spec,
            error.kind === "unknown" ? { status: "unknown", error } : { status: "consumed", error }
          );
          if (error.kind === "consumed") {
            consumedRanges.push(spec);
          } else {
            classificationErrors.push(rangeError(spec, error.message));
          }
        } else {
          classifications.set(spec, {
            status: "invalid",
            error: error instanceof Error ? error : new Error(String(error))
          });
          classificationErrors.push(
            rangeError(
              spec,
              error instanceof Error ? error.message : String(error)
            )
          );
        }
      }
    }
    let resolvableCount = 0;
    let unknownCount = 0;
    for (const resolution of classifications.values()) {
      if (resolution.status === "ok") resolvableCount++;
      else if (resolution.status === "unknown") unknownCount++;
    }
    const rangeSpans = [];
    for (const [spec, resolution] of classifications) {
      if (resolution.status !== "ok") continue;
      rangeSpans.push({
        spec,
        start: resolution.resolved.startIndex,
        end: resolution.resolved.endIndex
      });
    }
    const sortedRanges = [...rangeSpans].sort((a, b) => a.start - b.start);
    const skipSpecs = /* @__PURE__ */ new Set();
    let acceptedMaxIndex = -1;
    for (const entry of sortedRanges) {
      if (entry.start <= acceptedMaxIndex) {
        skipSpecs.add(entry.spec);
        warnings.push(
          `Skipped range (${entry.spec.startRef}..${entry.spec.endRef}) \u2014 overlaps an earlier range in the batch; the earlier range takes precedence. Keep ranges disjoint.`
        );
        continue;
      }
      if (entry.end > acceptedMaxIndex) acceptedMaxIndex = entry.end;
    }
    if (input.config.compress.minCompressRange > 0 && input.ranges.length > 0) {
      let totalRangeChars = 0;
      let hasBlockBoundaryRange = false;
      let countedRanges = 0;
      for (const [spec, resolution] of classifications) {
        if (resolution.status !== "ok" || skipSpecs.has(spec)) continue;
        if (resolution.resolved.boundaryKind === "block") {
          hasBlockBoundaryRange = true;
          continue;
        }
        countedRanges++;
        for (const id of resolution.resolved.messageIds) {
          const msg = input.messages.find((m) => m.id === id);
          totalRangeChars += msg?.text?.length ?? 0;
        }
      }
      if (!hasBlockBoundaryRange && totalRangeChars < input.config.compress.minCompressRange) {
        const live = activeBlocks(state).map((b) => b.blockId).sort((x, y) => numericBlockId(x) - numericBlockId(y));
        const liveHint = live.length > 0 ? ` Current active blocks span ${live[0]}..${live[live.length - 1]} \u2014 retry with startId/endId set to active block IDs in that span.` : "";
        const diagnostics = refGateDiagnostics(
          state,
          input.ranges.length,
          unknownCount
        );
        const danglingRefs = consumedRanges.flatMap(
          (spec) => danglingMessageRefs(state, input.messages, spec)
        );
        const gateMessage = resolvableCount === 0 && consumedRanges.length === 0 && unknownCount > 0 ? `None of the ${input.ranges.length} requested range(s) resolved \u2014 every ref is unknown to this session. Refs are per-session snapshots, assigned once when a message is first rendered; no compress reassigns them, so unknown refs cannot come from an earlier compress in this session. They come from a different generation: a previous session instance (switching model or upstream mid-conversation starts a fresh session whose refs restart at m00001), the generation before a native-compaction rebase (which also resets refs to m00001), or a typo. ${diagnostics} Run acp_status, then call the compress tool again using only the refs it reports.` : consumedRanges.length > 0 ? danglingRefs.length > 0 ? `Requested range(s) cannot be anchored (e.g. ${consumedRanges[0].startRef}..${consumedRanges[0].endRef}) \u2014 the refs exist in this session's ref map, but the messages they point to are no longer in the visible context and no active block covers them: the message content changed (or the message was filtered out of the view) and now carries a new ref, leaving your old refs dangling. ${diagnostics} Run acp_status, then call the compress tool again using only the refs it reports.` : `Requested range(s) already compressed (e.g. ${consumedRanges[0].startRef}..${consumedRanges[0].endRef}) \u2014 those refs no longer point to directly compressible content: the range is covered by active block(s) or the block ref(s) are stale (distilled or consumed). ${diagnostics} Run acp_status, then call the compress tool again using only the CURRENT compressible ranges it reports.${liveHint}` : `Total compressible content too small (${totalRangeChars} chars across ${countedRanges} range(s), min ${input.config.compress.minCompressRange}). Combine more messages into your range(s) to meet the threshold.`;
        return {
          state: input.state,
          result: {
            blocksCreated: 0,
            tokensCompressed: 0,
            errors: [gateMessage, ...classificationErrors],
            warnings: []
          }
        };
      }
    }
    for (const spec of input.ranges) {
      if (skipSpecs.has(spec)) continue;
      const resolution = classifications.get(spec);
      if (resolution === void 0) continue;
      if (resolution.status === "consumed") {
        warnings.push(
          `Skipped range (${spec.startRef}..${spec.endRef}) \u2014 already compressed (messages consumed by existing block(s)); nothing to compress.`
        );
        continue;
      }
      if (resolution.status === "unknown" || resolution.status === "invalid") {
        errors.push(rangeError(spec, resolution.error.message));
        continue;
      }
      warnings.push(...resolution.resolved.snappedBoundaries);
      try {
        const outcome = applySingleRange({
          spec,
          messages: input.messages,
          state,
          runId,
          config: input.config,
          protectedMessageIds,
          countTokens,
          preExistingCoverage
        });
        blocksCreated++;
        tokensCompressed += outcome.tokens;
        warnings.push(...outcome.warnings);
      } catch (error) {
        errors.push(
          rangeError(
            spec,
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    }
    state.stats.compressionCount += blocksCreated;
    state.stats.tokensCompressed += tokensCompressed;
    if (blocksCreated > 0) {
      state.nudge.lastPerMessageNudgeTokens = 0;
      state.nudge.lastNudgeShownTokens = 0;
      state.nudge.lastShownByTier = {};
    }
    return {
      state,
      result: { blocksCreated, tokensCompressed, errors, warnings }
    };
  }
  function processTurn(input) {
    const configErrors = validateConfig(input.config);
    if (configErrors.length > 0) {
      console.warn(
        `[acp-kernel] Config validation warnings: ${configErrors.join("; ")}. Thresholds may not fire correctly.`
      );
    }
    const ctx = {
      config: input.config,
      tokenCount: input.tokenCount,
      countTokens
    };
    const initial = {
      messages: input.messages,
      state: input.state,
      effects: {}
    };
    const strategy = input.renderTags ?? "all";
    const nodes = buildNodes(strategy);
    const result = runPipeline(nodes, initial, ctx);
    return {
      messages: result.messages,
      state: result.state,
      nudge: result.effects.nudge
    };
  }
  function decompress(blockId, state) {
    return blockById(state, blockId);
  }
  function search(query, state) {
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
    if (terms.length === 0) return [];
    const scored = activeBlocks(state).map((block) => ({ block, score: scoreRelevance(block, terms) })).filter((entry) => entry.score > 0.1).sort((left, right) => right.score - left.score);
    return scored.map((entry) => entry.block);
  }
  function status(state, tokenCount, config) {
    const active = activeBlocks(state);
    const usage = config.modelContextLimit > 0 ? tokenCount / config.modelContextLimit : 0;
    return {
      contextUsage: usage,
      tokenCount,
      modelContextLimit: config.modelContextLimit,
      activeBlocks: active.length,
      totalBlocks: state.blocks.length,
      tokensCompressed: state.stats.tokensCompressed,
      breakdown: { active: active.length, total: state.blocks.length }
    };
  }
  function defaultNodes() {
    return buildNodes("all");
  }
  function buildNodes(strategy) {
    const base = [
      assignRefsNode,
      syncBlocksNode,
      pruneNode,
      absorbHideNode,
      absorbPromptNode,
      filterNode,
      hideCompressCallsNode,
      recommendNode,
      nudgeNode,
      emergencyTruncateNode
    ];
    if (strategy === "none") return base;
    return [...base, createRenderRefsNode(strategy)];
  }
  return {
    processTurn,
    applyCompression,
    defaultNodes,
    decompress,
    search,
    status
  };
}
var assignRefsNode = {
  name: "assign-refs",
  run(io, ctx) {
    const hasProtection = ctx.config.protectedTools.length > 0 || !!ctx.config.isToolProtected;
    const protectedFn = hasProtection ? (m) => isMessageProtected(m, ctx.config) : void 0;
    const refResult = assignRefs(io.messages, {
      existing: io.state.messageRefs,
      nextIndex: highestUsedIndex(io.state.messageRefs) + 1,
      isProtected: protectedFn
    });
    return { ...io, state: { ...io.state, messageRefs: refResult.map } };
  }
};
var syncBlocksNode = {
  name: "sync-blocks",
  run(io, ctx) {
    const synced = syncBlocks(io.messages, io.state);
    advanceSurvival(synced.state, ctx.config.promotionThreshold);
    return { ...io, state: synced.state };
  }
};
var pruneNode = {
  name: "prune",
  run(io) {
    return { ...io, messages: prune(io.messages, io.state) };
  }
};
var absorbHideNode = {
  name: "absorb-hide",
  enabled: (io) => (io.state.absorbed?.length ?? 0) > 0,
  run(io) {
    return { ...io, messages: hideAbsorbedMessages(io.messages, io.state) };
  }
};
var absorbPromptNode = {
  name: "absorb-prompt",
  enabled: (_io, ctx) => ctx.config.absorb?.enabled === true,
  run(io, ctx) {
    const applied = appendAbsorbPrompts(
      io.messages,
      io.state,
      ctx.config,
      ctx.tokenCount,
      ctx.countTokens
    );
    return {
      ...io,
      messages: applied.messages,
      effects: { ...io.effects, absorbPromptedCount: applied.promptedCount }
    };
  }
};
var filterNode = {
  name: "filter",
  enabled: (_io, ctx) => !!ctx.config.messageFilters?.enabled && listMessageFilters().length > 0,
  run(io, ctx) {
    const applied = applyMessageFilters(io.messages, ctx.config.messageFilters);
    return { ...io, messages: applied.messages };
  }
};
var hideCompressCallsNode = {
  name: "hide-compress-calls",
  run(io) {
    const hidden = hideConsumedCompressCalls(io.state, io.messages);
    return { ...io, messages: hidden.messages };
  }
};
var recommendNode = {
  name: "recommend",
  run(io, ctx) {
    const protectedRefs = computeProtectedRefs(
      io.messages,
      io.state,
      ctx.config,
      ctx.countTokens
    );
    const contextRanges = buildCompressibleRanges(
      io.messages,
      io.state,
      ctx.config,
      protectedRefs,
      ctx.countTokens
    );
    const nothingToCompress = contextRanges.compressible.length === 0;
    const recommendation = {
      contextRanges,
      recommendedRanges: mergeRangesToThreshold(
        contextRanges.compressible,
        ctx.config.compress.minCompressRange
      ),
      nothingToCompress
    };
    return { ...io, effects: { ...io.effects, recommendation } };
  }
};
var nudgeNode = {
  name: "nudge-inject",
  run(io, ctx) {
    const nudge = decideNudge({
      tokenCount: ctx.tokenCount,
      config: ctx.config,
      state: io.state,
      messages: io.messages,
      recommendation: io.effects.recommendation,
      countTokens: ctx.countTokens
    });
    const baseline = io.state.nudge.lastPerMessageNudgeTokens;
    const nudgeGrowthTokens = resolveAdaptiveGrowth(
      ctx.config.modelContextLimit,
      ctx.config.nudge
    );
    let stamped = { ...io.state.nudge };
    if (baseline > 0 && ctx.tokenCount < baseline - nudgeGrowthTokens) {
      stamped.lastPerMessageNudgeTokens = ctx.tokenCount;
      stamped.lastNudgeShownTokens = 0;
      stamped.lastShownByTier = {};
    }
    if (stamped.lastPerMessageNudgeTokens === 0) {
      stamped.lastPerMessageNudgeTokens = ctx.tokenCount;
    }
    if (nudge.shouldInject) {
      stamped.lastNudgeShownTokens = ctx.tokenCount;
      if (nudge.tier !== null) {
        stamped.lastShownByTier = {
          ...stamped.lastShownByTier,
          [nudge.tier]: ctx.tokenCount
        };
      }
    }
    return {
      ...io,
      state: { ...io.state, nudge: stamped },
      effects: { ...io.effects, nudge }
    };
  }
};
var emergencyTruncateNode = {
  name: "emergency-truncate",
  run(io, ctx) {
    const usage = ctx.config.modelContextLimit > 0 ? ctx.tokenCount / ctx.config.modelContextLimit : 0;
    if (usage < ctx.config.truncate.threshold) return io;
    const trunc = truncateLargeToolOutputs(
      io.messages,
      ctx.tokenCount,
      ctx.config,
      ctx.countTokens,
      { protectRecentMessages: ctx.config.preserveRecentMessages }
    );
    return {
      ...io,
      messages: trunc.messages,
      effects: { ...io.effects, truncatedCount: trunc.truncatedCount }
    };
  }
};
function applySingleRange(input) {
  const warnings = [];
  const resolved = resolveBoundaries({
    startRef: input.spec.startRef,
    endRef: input.spec.endRef,
    messages: input.messages,
    state: input.state
  });
  const rangeMessageIds = applyPairBoundaryAdjustments(
    resolved,
    input.messages
  ).filter((id) => !isSummaryMessageId(id));
  if (rangeMessageIds.length > resolved.messageIds.length) {
    const indexByMessageId = /* @__PURE__ */ new Map();
    input.messages.forEach((m, i) => indexByMessageId.set(m.id, i));
    const adjustedStart = rangeMessageIds.length > 0 ? indexByMessageId.get(rangeMessageIds[0]) ?? resolved.startIndex : resolved.startIndex;
    const adjustedEnd = rangeMessageIds.length > 0 ? indexByMessageId.get(rangeMessageIds[rangeMessageIds.length - 1]) ?? resolved.endIndex : resolved.endIndex;
    const nestedSeen = new Set(resolved.nestedBlockIds);
    for (const block2 of activeBlocks(input.state)) {
      if (nestedSeen.has(block2.blockId)) continue;
      if (blockVisibleInRange(block2, indexByMessageId, adjustedStart, adjustedEnd)) {
        nestedSeen.add(block2.blockId);
        resolved.nestedBlockIds.push(block2.blockId);
      }
    }
  }
  const isBlockBoundary = resolved.boundaryKind === "block";
  const targetTier = resolveTargetTier(
    input.state,
    resolved.nestedBlockIds,
    isBlockBoundary
  );
  const outputTier = isBlockBoundary ? Math.min(3, targetTier + 1) : 1;
  const consumedBlockIds = resolved.nestedBlockIds.filter((id) => {
    const block2 = blockById(input.state, id);
    return block2?.active && block2.tier === targetTier;
  });
  const effectiveMessageIds = new Set(rangeMessageIds);
  for (const consumedId of consumedBlockIds) {
    const consumed = blockById(input.state, consumedId);
    if (consumed) {
      for (const id of consumed.effectiveMessageIds)
        effectiveMessageIds.add(id);
    }
  }
  const directMessageIds = [...effectiveMessageIds].filter(
    (id) => !input.preExistingCoverage.has(id)
  );
  let filteredIds = filterProtectedToolMessages(
    directMessageIds,
    input.messages,
    input.config
  );
  if (filteredIds.length < directMessageIds.length) {
    const kept = new Set(filteredIds);
    for (const id of directMessageIds) {
      if (!kept.has(id)) effectiveMessageIds.delete(id);
    }
  }
  const protectedRefs = input.protectedMessageIds;
  const hitProtectedRaw = protectedRefs ? filteredIds.filter((id) => {
    const ref = input.state.messageRefs.byRaw[id];
    return ref !== void 0 && protectedRefs.has(ref);
  }) : [];
  if (hitProtectedRaw.length > 0) {
    const protectedSet = new Set(hitProtectedRaw);
    filteredIds = filteredIds.filter((id) => !protectedSet.has(id));
    for (const id of hitProtectedRaw) effectiveMessageIds.delete(id);
    const hitRefs = hitProtectedRaw.map((id) => input.state.messageRefs.byRaw[id]).filter((v) => typeof v === "string");
    if (filteredIds.length === 0 && consumedBlockIds.length === 0) {
      const recentN = input.config.preserveRecentMessages;
      throw new Error(
        `Range is entirely within the protected zone (the last ${recentN} messages and/or the most recent user message): ${hitRefs.join(
          ", "
        )}. Adjust startId/endId to older messages.`
      );
    }
    warnings.push(
      `Excluded ${hitProtectedRaw.length} protected message(s) ${hitRefs.join(
        ", "
      )} from compression range (recent/last-user zone).`
    );
  }
  {
    const reasoningIds = /* @__PURE__ */ new Set();
    const callIds = /* @__PURE__ */ new Set();
    for (const m of input.messages) {
      if (!m.id) continue;
      if (m.contentType === "reasoning") reasoningIds.add(m.id);
      if (m.role === "assistant" && m.contentType === "tool-call") callIds.add(m.id);
    }
    const withdrawIds = /* @__PURE__ */ new Set();
    let splitTurnCount = 0;
    for (const group of computeTurnGroups(input.messages)) {
      const foldHasReasoning = group.some(
        (id) => effectiveMessageIds.has(id) && reasoningIds.has(id)
      );
      if (!foldHasReasoning) continue;
      const keptHasCall = group.some(
        (id) => !effectiveMessageIds.has(id) && callIds.has(id)
      );
      if (!keptHasCall) continue;
      splitTurnCount++;
      for (const id of group) withdrawIds.add(id);
    }
    if (withdrawIds.size > 0) {
      for (const id of withdrawIds) effectiveMessageIds.delete(id);
      const beforeWithdraw = filteredIds.length;
      filteredIds = filteredIds.filter((id) => !withdrawIds.has(id));
      if (filteredIds.length === 0 && consumedBlockIds.length === 0) {
        throw new Error(
          `Range would split ${splitTurnCount} turn(s) at the protected-zone boundary: a visible tool-call must keep its reasoning run (strict-echo providers reject a rebuilt request that lost it). Shrink the range to end before the turn starts, or wait until the whole turn ages out of the protected zone.`
        );
      }
      warnings.push(
        `Withdrawn ${beforeWithdraw - filteredIds.length} message(s) from compression range to keep ${splitTurnCount} turn(s) intact (visible tool-call would lose its reasoning run).`
      );
    }
  }
  if (!isBlockBoundary && filteredIds.length === 0 && consumedBlockIds.length > 0) {
    const first = consumedBlockIds[0];
    const last = consumedBlockIds[consumedBlockIds.length - 1];
    throw new Error(
      `Range ${input.spec.startRef}..${input.spec.endRef} contains no new compressible messages \u2014 every message in it is already covered by active block(s) ${consumedBlockIds.join(
        ", "
      )}. Nothing was compressed. To rewrite or merge those blocks, reference them by block ID (${first}..${last}); otherwise run acp_status and compress a range it reports as compressible.`
    );
  }
  validateCompressionRange(input, filteredIds, consumedBlockIds.length);
  let compressedTokens = 0;
  for (const id of filteredIds) {
    const message = input.messages.find((entry) => entry.id === id);
    compressedTokens += message ? countMessageTokens(message, input.countTokens) : 0;
  }
  for (const consumedId of consumedBlockIds) {
    const consumed = blockById(input.state, consumedId);
    if (consumed) {
      compressedTokens += input.countTokens(consumed.summary);
    }
  }
  const blockId = allocateBlockId(input.state);
  const block = {
    blockId,
    runId: input.runId,
    tier: outputTier,
    topic: input.spec.topic,
    summary: input.spec.summary,
    directMessageIds: filteredIds,
    effectiveMessageIds: [...effectiveMessageIds],
    directBlockIds: [...consumedBlockIds],
    compressedTokens,
    createdAt: Date.now(),
    survivedCount: 0,
    generation: "young",
    active: true,
    compressCallId: input.spec.compressCallId,
    startRef: input.spec.startRef,
    endRef: input.spec.endRef
  };
  input.state.blocks.push(block);
  for (const consumedId of consumedBlockIds) {
    const consumed = blockById(input.state, consumedId);
    if (consumed) consumed.active = false;
  }
  return { tokens: compressedTokens, warnings };
}
function applyPairBoundaryAdjustments(resolved, messages) {
  if (resolved.boundaryKind === "block") {
    return resolved.messageIds;
  }
  let startIndex = resolved.startIndex;
  let endIndex = resolved.endIndex;
  for (let pass = 0; pass < 2; pass++) {
    const reasoningAdjusted = adjustBoundariesForReasoningPairs(
      startIndex,
      endIndex,
      messages
    );
    const toolAdjusted = adjustBoundariesForToolPairs(
      reasoningAdjusted.startIndex,
      reasoningAdjusted.endIndex,
      messages
    );
    const changed = toolAdjusted.startIndex !== startIndex || toolAdjusted.endIndex !== endIndex;
    startIndex = toolAdjusted.startIndex;
    endIndex = toolAdjusted.endIndex;
    if (!changed) break;
  }
  if (startIndex === resolved.startIndex && endIndex === resolved.endIndex) {
    return resolved.messageIds;
  }
  const ids = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const msg = messages[i];
    if (msg) ids.push(msg.id);
  }
  return ids;
}
function validateCompressionRange(input, directMessageIds, consumedBlockCount) {
  const cfg = input.config.compress;
  const summary = input.spec.summary?.trim() ?? "";
  if (summary.length === 0) {
    throw new Error(
      "Summary is empty \u2014 provide a meaningful summary of the compressed range."
    );
  }
  if (cfg.minSummaryLength > 0 && summary.length < cfg.minSummaryLength) {
    throw new Error(
      `Summary too short (${summary.length} chars, min ${cfg.minSummaryLength}). The summary must capture the compressed range's key information.`
    );
  }
  const effectiveMax = input.spec.summaryMaxChars ?? cfg.maxSummaryLength;
  if (effectiveMax > 0 && summary.length > effectiveMax) {
    throw new Error(
      `Summary too long (${summary.length} chars, max ${effectiveMax}). Strip noise \u2014 keep critical paths, decisions, errors, and code references. Or pass summaryMaxChars to increase the limit \u2014 don't lose critical info just to fit.`
    );
  }
  if (directMessageIds.length === 0 && consumedBlockCount === 0) {
    throw new Error(
      "Range contains no compressible messages \u2014 all are already covered by active blocks or protected."
    );
  }
}
function filterProtectedToolMessages(directMessageIds, messages, config) {
  const protectedCallIds = /* @__PURE__ */ new Set();
  const removedIds = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    if (isMessageProtected(msg, config) && msg.toolCallId) {
      protectedCallIds.add(msg.toolCallId);
    }
  }
  for (const id of directMessageIds) {
    const msg = messages.find((m) => m.id === id);
    if (!msg) continue;
    if (isMessageProtected(msg, config)) {
      removedIds.add(id);
      if (msg.toolCallId) protectedCallIds.add(msg.toolCallId);
    }
  }
  for (const id of directMessageIds) {
    if (removedIds.has(id)) continue;
    const msg = messages.find((m) => m.id === id);
    if (!msg) continue;
    if (msg.contentType === "tool-result" && msg.toolCallId && protectedCallIds.has(msg.toolCallId)) {
      removedIds.add(id);
    }
  }
  return directMessageIds.filter((id) => !removedIds.has(id));
}
function resolveTargetTier(state, nestedBlockIds, isBlockBoundary) {
  if (!isBlockBoundary) return 1;
  if (nestedBlockIds.length === 0) return 1;
  let minTier = 3;
  for (const id of nestedBlockIds) {
    const block = blockById(state, id);
    if (block && block.tier < minTier) minTier = block.tier;
  }
  return minTier;
}
function collectCoverage(state) {
  const coverage = /* @__PURE__ */ new Set();
  for (const block of activeBlocks(state)) {
    for (const id of block.effectiveMessageIds) coverage.add(id);
  }
  return coverage;
}
function resolveAdaptiveGrowth(modelContextLimit, nudge) {
  if (!modelContextLimit || modelContextLimit <= 0) return nudge.growthFloor;
  return Math.min(
    nudge.growthCap,
    Math.max(
      nudge.growthFloor,
      Math.round(modelContextLimit * nudge.growthRatio)
    )
  );
}
function resolveMinPressureBenefit(modelContextLimit, nudge) {
  return nudge.minPressureBenefitTokens ?? Math.max(5e3, Math.round(modelContextLimit * 0.01));
}
function pendingByTier(state, recommendation, countTokens, minCompressRange) {
  const out = {};
  const merged = recommendation?.recommendedRanges ?? [];
  const effective = minCompressRange > 0 ? merged.filter((r) => (r.chars ?? r.tokens * 4) >= minCompressRange) : merged;
  out[1] = {
    pending: effective.reduce((s, r) => s + r.tokens, 0),
    targetBlocks: []
  };
  const active = activeBlocks(state);
  const t1 = active.filter((b) => b.tier === 1);
  const t2 = active.filter((b) => b.tier === 2);
  out[2] = {
    pending: t1.reduce((s, b) => s + countTokens(b.summary), 0),
    targetBlocks: t1
  };
  out[3] = {
    pending: t2.reduce((s, b) => s + countTokens(b.summary), 0),
    targetBlocks: t2
  };
  return out;
}
function decideNudge(input) {
  const { config, state, tokenCount, recommendation, countTokens } = input;
  const limit = config.modelContextLimit;
  const usage = limit > 0 ? tokenCount / limit : 0;
  const nudgeGrowthTokens = resolveAdaptiveGrowth(limit, config.nudge);
  const minPressureBenefit = resolveMinPressureBenefit(limit, config.nudge);
  const overLimit = usage >= config.nudge.maxContextLimitPct;
  const emergencyOverride = usage >= config.nudge.emergencyThresholdPct;
  const pressure = overLimit || emergencyOverride;
  const baseline = state.nudge.lastPerMessageNudgeTokens;
  const hadPendingNudge = state.nudge.lastNudgeShownTokens > 0;
  const hasPendingNudge = hadPendingNudge;
  const effectiveThreshold = hasPendingNudge ? Math.floor(nudgeGrowthTokens / 2) : nudgeGrowthTokens;
  const growthReference = state.nudge.lastNudgeShownTokens > 0 ? state.nudge.lastNudgeShownTokens : baseline > 0 ? baseline : tokenCount;
  const growthFloor = Math.max(
    config.nudge.minGrowthFloor,
    config.nudge.minGrowthRatio * nudgeGrowthTokens
  );
  const growthSinceReference = tokenCount - growthReference;
  const rec = recommendation;
  const tiers = pendingByTier(
    state,
    rec,
    countTokens,
    config.compress.minCompressRange
  );
  const tier2Threshold = Math.round(
    nudgeGrowthTokens * (config.nudge.tier2GrowthMultiplier ?? 1.5)
  );
  let injectedTier = null;
  let injectedReason = "";
  let bestPending = 0;
  const t1Eff = tiers[1]?.pending ?? 0;
  const t2Pen = tiers[2]?.pending ?? 0;
  const t3Pen = tiers[3]?.pending ?? 0;
  const firstSightMassReady = state.nudge.lastNudgeShownTokens === 0 && baseline === 0 && usage >= config.nudge.minContextLimitPct && Math.max(t1Eff, t2Pen, t3Pen) >= nudgeGrowthTokens;
  const growthReady = firstSightMassReady || growthSinceReference >= growthFloor;
  const t2Count = tiers[2]?.targetBlocks.length ?? 0;
  const t3Count = tiers[3]?.targetBlocks.length ?? 0;
  const tierCountUsageFloor = config.nudge.minContextLimitPct;
  const t2CountReady = t2Count >= config.tiers.tier2Trigger && usage >= tierCountUsageFloor;
  const t3CountReady = t3Count >= config.tiers.tier3Trigger && usage >= tierCountUsageFloor;
  if (pressure) {
    const candidates = [1];
    if (config.tiers.enabled) {
      candidates.push(2, 3);
    }
    let best = null;
    for (const t of candidates) {
      const p = tiers[t]?.pending ?? 0;
      if (p > bestPending) {
        bestPending = p;
        best = t;
      }
    }
    if (best !== null && bestPending >= minPressureBenefit) {
      injectedTier = best;
      const label = emergencyOverride ? "EMERGENCY" : "OVER-LIMIT";
      injectedReason = best === 1 ? `${label} T1: max effective pending ${bestPending}, usage ${Math.round(usage * 100)}%` : `${label} T${best} distill: max pending ${bestPending} (T1 effective ${t1Eff}, T2 ${t2Pen}, T3 ${t3Pen}), usage ${Math.round(usage * 100)}%`;
    }
  } else if (growthReady) {
    if (t1Eff >= nudgeGrowthTokens) {
      injectedTier = 1;
      injectedReason = `T1 effective ${t1Eff} >= ${nudgeGrowthTokens}, growth ${growthSinceReference}, usage ${Math.round(usage * 100)}%`;
    } else if (config.tiers.enabled && (t2CountReady || t2Pen >= tier2Threshold && t2Pen > t1Eff)) {
      const lastShown = state.nudge.lastShownByTier[2] ?? 0;
      const cadenceMet = lastShown === 0 || tokenCount - lastShown >= growthFloor;
      if (cadenceMet) {
        injectedTier = 2;
        injectedReason = t2CountReady ? `T2 distill ready: ${t2Count} tier-1 blocks >= tier2Trigger ${config.tiers.tier2Trigger} (${t2Pen} tokens), usage ${Math.round(usage * 100)}%` : `T2 distill ready: ${tiers[2].targetBlocks.length} tier-1 blocks (${t2Pen} tokens) >= ${tier2Threshold} (1.5x) and > T1 effective ${t1Eff}, usage ${Math.round(usage * 100)}%`;
      }
    } else if (config.tiers.enabled && (t3CountReady || t3Pen >= tier2Threshold && t3Pen > t2Pen && t3Pen > t1Eff)) {
      const lastShown = state.nudge.lastShownByTier[3] ?? 0;
      const cadenceMet = lastShown === 0 || tokenCount - lastShown >= growthFloor;
      if (cadenceMet) {
        injectedTier = 3;
        injectedReason = t3CountReady ? `T3 condense ready: ${t3Count} tier-2 blocks >= tier3Trigger ${config.tiers.tier3Trigger} (${t3Pen} tokens), usage ${Math.round(usage * 100)}%` : `T3 condense ready: ${tiers[3].targetBlocks.length} tier-2 blocks (${t3Pen} tokens) >= ${tier2Threshold} (1.5x) and > T2 ${t2Pen} and > T1 effective ${t1Eff}, usage ${Math.round(usage * 100)}%`;
      }
    }
  }
  const shouldInject = injectedTier !== null;
  if (shouldInject && firstSightMassReady) {
    injectedReason += " [first-sight mass]";
  }
  let reason;
  if (injectedTier !== null) {
    reason = injectedReason;
  } else if (pressure) {
    const label = emergencyOverride ? "EMERGENCY" : "OVER-LIMIT";
    reason = bestPending === 0 ? `${label}: usage ${Math.round(usage * 100)}% but no tier has effective compressible content (T1 effective ${t1Eff}, T2 ${t2Pen}, T3 ${t3Pen}) \u2014 nudge suppressed to avoid offering ranges below minCompressRange` : `${label}: usage ${Math.round(usage * 100)}% but max pending ${bestPending} < min benefit ${minPressureBenefit} tokens (T1 effective ${t1Eff}, T2 ${t2Pen}, T3 ${t3Pen}) \u2014 suppressed: rewriting below the benefit floor reclaims almost nothing while usage stays high; truncate.threshold remains the safety valve`;
  } else {
    const tiersList = [1, 2, 3];
    const eligible = tiersList.filter((t) => config.tiers.enabled || t === 1);
    const countReadyUngated = (t) => t === 2 ? t2Count >= config.tiers.tier2Trigger : t === 3 ? t3Count >= config.tiers.tier3Trigger : false;
    const countReady = (t) => countReadyUngated(t) && usage >= tierCountUsageFloor;
    const ready = eligible.filter((t) => (tiers[t]?.pending ?? 0) >= nudgeGrowthTokens).map((t) => `T${t} ${tiers[t].pending}`);
    const readyCount = eligible.filter(
      (t) => (tiers[t]?.pending ?? 0) < nudgeGrowthTokens && countReadyUngated(t)
    ).map(
      (t) => `T${t} ${t === 2 ? t2Count : t3Count} blocks (count${usage >= tierCountUsageFloor ? "" : ", usage-gated"})`
    );
    const readyAll = [...ready, ...readyCount];
    const readyHint = readyAll.length > 0 ? `, ready: ${readyAll.join(", ")}` : "";
    const blocked = eligible.filter(
      (t) => ((tiers[t]?.pending ?? 0) >= nudgeGrowthTokens || countReady(t)) && (state.nudge.lastShownByTier[t] ?? 0) > 0 && tokenCount - (state.nudge.lastShownByTier[t] ?? 0) < growthFloor
    ).map((t) => `T${t} (cadence)`);
    const blockedHint = blocked.length > 0 ? `, blocked: ${blocked.join(", ")}` : "";
    const maxPending = Math.max(
      0,
      ...Object.values(tiers).map((t) => t.pending)
    );
    const pendingShort = maxPending < nudgeGrowthTokens;
    const growthShort = growthSinceReference < growthFloor;
    const parts = [];
    if (pendingShort)
      parts.push(
        `max compressible ${maxPending} < threshold ${nudgeGrowthTokens}`
      );
    if (growthShort)
      parts.push(`growth ${growthSinceReference} < floor ${growthFloor}`);
    if (parts.length === 0)
      parts.push(
        `max compressible ${maxPending}, growth ${growthSinceReference}`
      );
    reason = `${parts.join("; ")}${readyHint}${blockedHint}`;
  }
  const ctxBreakdown = computeContextBreakdown(
    input.messages,
    tokenCount,
    growthSinceReference,
    countTokens
  );
  return {
    shouldInject,
    reason,
    compressibleRanges: rec?.recommendedRanges ?? [],
    protectedRanges: rec?.contextRanges.protected ?? [],
    tierTargetBlocks: injectedTier ? tiers[injectedTier].targetBlocks : [],
    contextUsage: usage,
    tier: injectedTier,
    breakdown: {
      usage,
      growth: growthSinceReference,
      growthReference,
      effectiveThreshold,
      nudgeGrowthTokens,
      growthFloor,
      hasPendingNudge: hasPendingNudge ? 1 : 0,
      overLimit: overLimit ? 1 : 0,
      emergencyOverride: emergencyOverride ? 1 : 0,
      minPressureBenefit,
      pendingT1: tiers[1].pending,
      pendingT2: tiers[2].pending,
      pendingT3: tiers[3].pending
    },
    contextBreakdown: ctxBreakdown
  };
}
function computeContextBreakdown(messages, total, growth, countTokens) {
  const count = countTokens ?? ((t) => Math.ceil(t.length / 4));
  let system = 0, tool = 0, summaries = 0, code = 0, text = 0;
  for (const msg of messages) {
    const tokens = countMessageTokens(msg, count);
    if (msg.text?.startsWith("[Compressed conversation section]")) {
      summaries += tokens;
    } else if (msg.contentType === "tool-call" || msg.contentType === "tool-result") {
      tool += tokens;
    } else if (msg.role === "system") {
      system += tokens;
    } else if (msg.text?.includes("```")) {
      code += tokens;
    } else {
      text += tokens;
    }
  }
  return { system, tool, summaries, code, text, total, growth };
}
function cloneState(state) {
  return {
    blocks: state.blocks.map((block) => ({
      ...block,
      directMessageIds: [...block.directMessageIds],
      effectiveMessageIds: [...block.effectiveMessageIds],
      directBlockIds: [...block.directBlockIds]
    })),
    messageRefs: {
      byRaw: { ...state.messageRefs.byRaw },
      byRef: { ...state.messageRefs.byRef }
    },
    tokenSnapshot: { ...state.tokenSnapshot ?? {} },
    nudge: { ...state.nudge, anchors: { ...state.nudge.anchors } },
    stats: { ...state.stats },
    absorbed: (state.absorbed ?? []).map((record) => ({ ...record })),
    nextBlockId: state.nextBlockId,
    nextRunId: state.nextRunId
  };
}
function scoreRelevance(block, terms) {
  const topic = (block.topic ?? "").toLowerCase();
  const summary = block.summary.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const topicHits = countOccurrences(topic, term);
    if (topicHits > 0) score += Math.min(topicHits * 0.15, 0.45);
    const summaryHits = countOccurrences(summary, term);
    if (summaryHits > 0) score += Math.min(summaryHits * 0.04, 0.2);
  }
  return Math.min(score, 1);
}
function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0;
  let count = 0;
  let position = 0;
  while ((position = haystack.indexOf(needle, position)) !== -1) {
    count++;
    position += needle.length;
  }
  return count;
}
function formatTokens2(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);
}
function pct(n, total) {
  if (n <= 0 || total <= 0) return 0;
  return Math.round(n / total * 100);
}
function numericPart2(blockId) {
  const match = /^b(\d+)$/.exec(blockId);
  return match && match[1] !== void 0 ? Number(match[1]) : 0;
}
function summaryTokensOf(block, countTokens) {
  return countTokens(block.summary);
}
function effectiveCompressedTokens(block, _state, _countTokens) {
  return block.compressedTokens;
}
function tierLabel(block) {
  return `T${block.tier}`;
}
function tierBreakdown(blocks, countTokens) {
  const tierTokens = {};
  for (const block of blocks) {
    tierTokens[block.tier] = (tierTokens[block.tier] ?? 0) + summaryTokensOf(block, countTokens);
  }
  const tiers = Object.keys(tierTokens).map(Number);
  if (tiers.length <= 1) return null;
  const parts = [];
  for (const tier of [1, 2, 3]) {
    if (tierTokens[tier]) parts.push(`T${tier}: ${formatTokens2(tierTokens[tier])}`);
  }
  return parts.join(" | ");
}
function collectVisible(messages, state, countTokens) {
  const coveredIds = /* @__PURE__ */ new Set();
  for (const block of state.blocks) {
    if (!block.active) continue;
    for (const id of block.effectiveMessageIds) coveredIds.add(id);
  }
  let summaryTokens = 0;
  for (const block of state.blocks) {
    if (block.active) summaryTokens += summaryTokensOf(block, countTokens);
  }
  const visible = [];
  const toolCallNames = /* @__PURE__ */ new Map();
  for (const message of messages) {
    if (message.contentType === "tool-call" && message.toolCallId && message.toolName) {
      toolCallNames.set(message.toolCallId, message.toolName);
    }
  }
  messages.forEach((message, index) => {
    if (coveredIds.has(message.id)) return;
    const ref = refForRaw(state.messageRefs, message.id);
    if (!ref) return;
    const tokens = countMessageTokens(message, countTokens);
    const tool = isToolMessage(message) ? message.toolName ?? (message.toolCallId ? toolCallNames.get(message.toolCallId) : void 0) ?? "tool" : "text";
    if (tokens > 0) visible.push({ ref, tokens, tool, index });
  });
  return { visible, summaryTokens };
}
function buildStatusReport(state, messages, countTokens, options = {}) {
  const scope = options.scope;
  const view = options.view ?? "ranges";
  const toolFilter = options.tool;
  const sort = options.sort ?? "size";
  const limit = options.limit ?? 30;
  const activeBlocks2 = state.blocks.filter((b) => b.active).sort((a, b) => numericPart2(a.blockId) - numericPart2(b.blockId));
  if (scope === "compressed") {
    return renderCompressedDrilldown(activeBlocks2, state, sort, limit, countTokens);
  }
  const { visible, summaryTokens } = collectVisible(messages, state, countTokens);
  if (scope === "uncompressed") {
    if (view === "messages") {
      return renderMessageDrilldown(visible, toolFilter, sort, limit);
    }
    return renderUncompressedRanges(visible);
  }
  return renderOverview(visible, summaryTokens, activeBlocks2, state, countTokens, limit);
}
function renderOverview(visible, summaryTokens, blocks, state, countTokens, limit) {
  const lines = [];
  const toolTypeMap = /* @__PURE__ */ new Map();
  for (const message of visible) {
    toolTypeMap.set(message.tool, (toolTypeMap.get(message.tool) ?? 0) + message.tokens);
  }
  const topTool = [...toolTypeMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const totalTool = visible.filter((m) => m.tool !== "text").reduce((sum, m) => sum + m.tokens, 0);
  const totalText = visible.filter((m) => m.tool === "text").reduce((sum, m) => sum + m.tokens, 0);
  const total = summaryTokens + totalTool + totalText;
  lines.push("CONTEXT BREAKDOWN");
  lines.push(
    `  ${formatTokens2(totalTool)} tool (${pct(totalTool, total)}%) | ${formatTokens2(totalText)} text (${pct(totalText, total)}%) | ${formatTokens2(summaryTokens)} summaries (${pct(summaryTokens, total)}%)`
  );
  const topTypes = [...toolTypeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topTypes.length > 0) {
    lines.push(`  Top tools: ${topTypes.map(([t, n]) => `${t} (${pct(n, total)}%)`).join(", ")}`);
  }
  lines.push("");
  if (blocks.length === 0) {
    lines.push("COMPRESSED BLOCKS");
    lines.push("  No compressed blocks.");
  } else {
    const totalSummary = blocks.reduce((s, b) => s + summaryTokensOf(b, countTokens), 0);
    const totalEffective = blocks.reduce(
      (s, b) => s + effectiveCompressedTokens(b, state, countTokens),
      0
    );
    lines.push(
      `COMPRESSED BLOCKS \u2014 ${blocks.length} active (${formatTokens2(totalSummary)} summary, ${formatTokens2(totalEffective)} original)`
    );
    const breakdown = tierBreakdown(blocks, countTokens);
    if (breakdown) lines.push(`  Tier usage: ${breakdown}`);
    lines.push("");
    const sorted = [...blocks].sort(
      (a, b) => effectiveCompressedTokens(b, state, countTokens) - effectiveCompressedTokens(a, state, countTokens) || b.createdAt - a.createdAt
    );
    for (const block of sorted.slice(0, limit)) {
      const topic = block.topic ?? "(no topic)";
      const eff = effectiveCompressedTokens(block, state, countTokens);
      lines.push(
        `  ${block.blockId} (${tierLabel(block)})  ${formatTokens2(eff)}\u2192${formatTokens2(summaryTokensOf(block, countTokens))}  ${block.effectiveMessageIds.length} msgs  "${topic}"`
      );
    }
  }
  lines.push("");
  lines.push(
    `Tip: buildStatusReport({scope:"uncompressed", view:"messages", tool:"${topTool ?? "bash"}"}) for per-message listing`
  );
  return lines.join("\n");
}
function renderUncompressedRanges(visible) {
  const lines = [];
  const totalTokens = visible.reduce((s, m) => s + m.tokens, 0);
  lines.push(`UNCOMPRESSED \u2014 ${formatTokens2(totalTokens)} | ${visible.length} visible messages`);
  lines.push("");
  if (visible.length === 0) {
    lines.push("  (no uncompressed messages)");
    return lines.join("\n");
  }
  const refNum = (ref) => {
    const m = ref.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };
  const dominantTool = (toolTokens) => {
    let best = "text";
    let bestN = -1;
    for (const [tool, n] of toolTokens) {
      if (n > bestN) {
        best = tool;
        bestN = n;
      }
    }
    return best;
  };
  const merged = [];
  for (const m of visible) {
    const num = refNum(m.ref);
    const last = merged[merged.length - 1];
    if (last && num === last.startNum + last.count) {
      last.endRef = m.ref;
      last.count += 1;
      last.tokens += m.tokens;
      last.toolTokens.set(m.tool, (last.toolTokens.get(m.tool) ?? 0) + m.tokens);
    } else {
      const toolTokens = /* @__PURE__ */ new Map([[m.tool, m.tokens]]);
      merged.push({ startRef: m.ref, endRef: m.ref, startNum: num, count: 1, tokens: m.tokens, toolTokens });
    }
  }
  for (const r of merged.slice(0, 30)) {
    const range = r.count === 1 ? r.startRef : `${r.startRef}\u2013${r.endRef}`;
    lines.push(`  ${range}  (${r.count} msgs, ${formatTokens2(r.tokens)}${r.count > 1 ? ` (${Math.round(r.tokens / r.count)}/msg)` : ""}) ${dominantTool(r.toolTokens)}`);
  }
  if (merged.length > 30) {
    lines.push(`  ... and ${merged.length - 30} more ranges`);
  }
  return lines.join("\n");
}
function renderMessageDrilldown(visible, toolFilter, sort, limit) {
  let filtered = visible;
  if (toolFilter) filtered = filtered.filter((m) => m.tool === toolFilter);
  if (sort === "time") filtered.sort((a, b) => a.index - b.index);
  else if (sort === "tool") filtered.sort((a, b) => a.tool.localeCompare(b.tool) || b.tokens - a.tokens);
  else filtered.sort((a, b) => b.tokens - a.tokens);
  const totalTokens = filtered.reduce((s, m) => s + m.tokens, 0);
  const allTokens = visible.reduce((s, m) => s + m.tokens, 0);
  const header = toolFilter ? `UNCOMPRESSED \u2014 ${toolFilter}: ${formatTokens2(totalTokens)} | ${filtered.length} msgs | ${pct(totalTokens, allTokens)}% of visible` : `UNCOMPRESSED \u2014 ${formatTokens2(totalTokens)} | ${filtered.length} msgs`;
  const lines = [header, `Sorted by ${sort}`, ""];
  const shown = filtered.slice(0, limit);
  for (const message of shown) {
    lines.push(`  ${message.ref} (${formatTokens2(message.tokens)}) ${message.tool}`);
  }
  if (filtered.length > shown.length) {
    lines.push("");
    lines.push(`${shown.length} of ${filtered.length} shown.`);
  }
  return lines.join("\n");
}
function renderCompressedDrilldown(blocks, state, sort, limit, countTokens) {
  let sorted = [...blocks];
  if (sort === "time") sorted.sort((a, b) => a.createdAt - b.createdAt);
  else if (sort === "age") sorted.sort((a, b) => b.survivedCount - a.survivedCount);
  else
    sorted.sort(
      (a, b) => effectiveCompressedTokens(b, state, countTokens) - effectiveCompressedTokens(a, state, countTokens) || b.createdAt - a.createdAt
    );
  const totalSummary = sorted.reduce((s, b) => s + summaryTokensOf(b, countTokens), 0);
  const totalEffective = sorted.reduce(
    (s, b) => s + effectiveCompressedTokens(b, state, countTokens),
    0
  );
  const lines = [
    `COMPRESSED \u2014 ${sorted.length} blocks | ${formatTokens2(totalEffective)} original \u2192 ${formatTokens2(totalSummary)} summary`
  ];
  const breakdown = tierBreakdown(sorted, countTokens);
  if (breakdown) lines.push(`Tier usage: ${breakdown}`);
  lines.push("");
  const shown = sorted.slice(0, limit);
  for (const block of shown) {
    const nested = block.directBlockIds.length > 0 ? ` nested=[${block.directBlockIds.join(",")}]` : "";
    const topic = block.topic ?? "(no topic)";
    const eff = effectiveCompressedTokens(block, state, countTokens);
    lines.push(
      `  ${block.blockId} (${tierLabel(block)})  ${formatTokens2(eff)}\u2192${formatTokens2(summaryTokensOf(block, countTokens))}  ${block.effectiveMessageIds.length} msgs  age=${block.survivedCount} ${block.generation}${nested}`
    );
    lines.push(`    "${topic}"`);
  }
  if (sorted.length > shown.length) {
    lines.push("");
    lines.push(`${shown.length} of ${sorted.length} shown.`);
  }
  return lines.join("\n");
}
function stem(word) {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) w = w.slice(0, -2);
  else if (w.endsWith("ches") || w.endsWith("shes")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("ation") && w.length > 6) w = w.slice(0, -3);
  else if (w.endsWith("tion") && w.length > 5) w = w.slice(0, -4) + "t";
  else if (w.endsWith("ion") && w.length > 4) w = w.slice(0, -3);
  if (w.endsWith("ment") && w.length > 6) w = w.slice(0, -4);
  if (w.endsWith("ness") && w.length > 6) w = w.slice(0, -4);
  if (w.endsWith("ly") && w.length > 4) w = w.slice(0, -2);
  return w;
}
var CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
var LATIN_WORD = /[a-z][a-z0-9_]*[a-z0-9]|[a-z0-9]/g;
var cjkSegmenter = new Intl.Segmenter("zh", { granularity: "word" });
function cjkRunTokens(segs) {
  const words = segs.filter((w) => w.length >= 2);
  if (words.length > 0) return words;
  const run = segs.join("");
  const out = [];
  for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  for (const ch of run) out.push(ch);
  return out;
}
function tokenize(text, opts = {}) {
  const lower = text.toLowerCase();
  const tokens = [];
  const latin = lower.match(LATIN_WORD) ?? [];
  for (let w of latin) {
    if (w.length >= 2) {
      if (opts.stem) w = stem(w);
      tokens.push(w);
    }
  }
  if (!CJK.test(lower)) return tokens;
  const runSegs = [];
  let cur = null;
  for (const s of cjkSegmenter.segment(lower)) {
    const t = s.segment;
    if (t.length === 0) continue;
    if (CJK.test(t)) {
      (cur ??= []).push(t);
    } else if (cur) {
      runSegs.push(cur);
      cur = null;
    }
  }
  if (cur) runSegs.push(cur);
  for (const segs of runSegs) {
    tokens.push(...cjkRunTokens(segs));
  }
  return tokens;
}
function charBigrams(text) {
  const grams = [];
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    if (pair.trim().length === pair.length) grams.push(pair);
  }
  return grams;
}
function tfMap(text, stem2) {
  const m = /* @__PURE__ */ new Map();
  for (const t of tokenize(text, { stem: stem2 })) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
var DEFAULT_CAP_CHARS = 8 * 1024 * 1024;
var capChars = DEFAULT_CAP_CHARS;
var cache = /* @__PURE__ */ new Map();
var cachedChars = 0;
function build(text) {
  const tf = tfMap(text, true);
  let len = 0;
  for (const v of tf.values()) len += v;
  const lower = text.toLowerCase();
  return { tf, len, lower, grams: new Set(charBigrams(lower)) };
}
function docFeatures(text) {
  const hit = cache.get(text);
  if (hit) return hit;
  const f = build(text);
  if (text.length > 0 && text.length <= capChars) {
    while (cachedChars + text.length > capChars && cache.size > 0) {
      const k = cache.keys().next().value;
      cachedChars -= k.length;
      cache.delete(k);
    }
    cache.set(text, f);
    cachedChars += text.length;
  }
  return f;
}
function setDocCacheCap(chars) {
  capChars = Math.max(1, chars);
  while (cachedChars > capChars && cache.size > 0) {
    const k = cache.keys().next().value;
    cachedChars -= k.length;
    cache.delete(k);
  }
}
var substringAlgorithm = {
  name: "substring",
  description: "Exact substring counting (original baseline). Predictable, no normalization.",
  score(docs, query) {
    const terms = query.toLowerCase().trim().split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) return docs.map((d) => ({ ref: d.ref, score: 0 }));
    return docs.map((d) => {
      const haystack = docFeatures(d.text).lower;
      let score = 0;
      for (const term of terms) score += countOccurrences2(haystack, term);
      return { ref: d.ref, score };
    });
  }
};
function countOccurrences2(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}
var bm25Algorithm = {
  name: "bm25",
  description: "BM25 with stemming + CJK bigram tokenization. IR-standard relevance ranking.",
  score(docs, query) {
    const N = docs.length;
    const k1 = 1.2;
    const b = 0.75;
    const parsed = docs.map((d) => {
      const f = docFeatures(d.text);
      return { id: d.ref, tf: f.tf, len: f.len };
    });
    const avgdl = parsed.reduce((s, d) => s + d.len, 0) / (N || 1);
    const qTerms = tokenize(query, { stem: true });
    if (qTerms.length === 0) return docs.map((d) => ({ ref: d.ref, score: 0 }));
    const idf = /* @__PURE__ */ new Map();
    for (const t of new Set(qTerms)) {
      let df = 0;
      for (const d of parsed) if (d.tf.has(t)) df++;
      idf.set(t, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
    }
    return parsed.map((d) => {
      let score = 0;
      for (const t of qTerms) {
        const f = d.tf.get(t) ?? 0;
        if (f === 0) continue;
        const idfT = idf.get(t) ?? 0;
        score += idfT * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / (avgdl || 1)));
      }
      return { ref: d.id, score };
    });
  }
};
var fuzzyAlgorithm = {
  name: "fuzzy",
  description: "Character bigram overlap. Typo-tolerant, script-agnostic, high recall.",
  score(docs, query) {
    const qTokens = query.toLowerCase().split(/[\s,]+/).filter((t) => t.length >= 4 || t.length >= 2 && CJK.test(t));
    if (qTokens.length === 0) return docs.map((d) => ({ ref: d.ref, score: 0 }));
    const qGrams = /* @__PURE__ */ new Set();
    for (const t of qTokens) for (const g of charBigrams(t)) qGrams.add(g);
    if (qGrams.size === 0) return docs.map((d) => ({ ref: d.ref, score: 0 }));
    return docs.map((d) => {
      const docGrams = docFeatures(d.text).grams;
      let hits = 0;
      for (const g of qGrams) if (docGrams.has(g)) hits++;
      return { ref: d.ref, score: hits / qGrams.size };
    });
  }
};
var W_BM25 = 0.7;
var W_FUZZY = 0.3;
var hybridAlgorithm = {
  name: "hybrid",
  description: "Weighted BM25(stem) + fuzzy n-gram. Default \u2014 best precision + recall.",
  score(docs, query) {
    const bm = bm25Algorithm.score(docs, query);
    const fz = fuzzyAlgorithm.score(docs, query);
    const maxBm = Math.max(...bm.map((r) => r.score), 1e-9);
    const maxFz = Math.max(...fz.map((r) => r.score), 1e-9);
    const bmMap = new Map(bm.map((r) => [r.ref, r.score / maxBm]));
    const fzMap = new Map(fz.map((r) => [r.ref, r.score / maxFz]));
    return docs.map((d) => ({
      ref: d.ref,
      score: W_BM25 * (bmMap.get(d.ref) ?? 0) + W_FUZZY * (fzMap.get(d.ref) ?? 0)
    }));
  }
};
var registry2 = /* @__PURE__ */ new Map();
function registerSearchAlgorithm(algo) {
  registry2.set(algo.name, algo);
}
function getSearchAlgorithm(name) {
  return registry2.get(name);
}
registerSearchAlgorithm(substringAlgorithm);
registerSearchAlgorithm(bm25Algorithm);
registerSearchAlgorithm(fuzzyAlgorithm);
registerSearchAlgorithm(hybridAlgorithm);
var DEFAULT_ROLE_WEIGHTS = {
  user: 1.5,
  assistant: 1,
  tool: 0.6,
  block: 1
};
var DEFAULT_ALGORITHM = "hybrid";
function applyRoleWeight(scored, docs, rw) {
  if (docs.length === 0) return scored;
  const docByRef = new Map(docs.map((d) => [d.ref, d]));
  return scored.map((s) => {
    const doc = docByRef.get(s.ref);
    if (!doc) return s;
    const w = doc.kind === "message" ? doc.role === "user" ? rw.user : doc.role === "assistant" ? rw.assistant : rw.tool : rw.block;
    return { ref: s.ref, score: s.score * w };
  });
}
function runSearch(docs, query, options) {
  const limit = options.limit ?? 10;
  const previewLength = options.previewLength ?? 200;
  const minScore = options.minScore ?? 0.01;
  const algoName = options.algorithm ?? DEFAULT_ALGORITHM;
  const rw = { ...DEFAULT_ROLE_WEIGHTS, ...options.roleWeights };
  const algo = getSearchAlgorithm(algoName);
  if (!algo) return [];
  if (docs.length === 0) return [];
  const scoredOrPromise = algo.score(docs, query);
  const buildResults = (weighted) => {
    const byRef = new Map(docs.map((d) => [d.ref, d]));
    return weighted.map((s) => {
      const doc = byRef.get(s.ref);
      if (!doc) return null;
      return {
        kind: doc.kind,
        ref: doc.ref,
        blockId: doc.blockId,
        tier: doc.tier ?? 1,
        score: s.score,
        title: doc.title,
        preview: makePreview(doc.text, query, previewLength),
        role: doc.role,
        tokens: doc.tokens
      };
    }).filter((r) => r !== null && r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
  };
  if (scoredOrPromise instanceof Promise) {
    return scoredOrPromise.then((raw) => buildResults(applyRoleWeight(raw, docs, rw)));
  }
  return buildResults(applyRoleWeight(scoredOrPromise, docs, rw));
}
function searchBlocks(docs, query, options = {}) {
  const result = runSearch(docs, query, options);
  if (result instanceof Promise) {
    throw new Error(
      `searchBlocks: algorithm "${options.algorithm ?? DEFAULT_ALGORITHM}" is async (e.g. semantic). Use searchBlocksAsync() instead.`
    );
  }
  return result;
}
function makePreview(text, query, len) {
  if (!text) return "";
  const terms = query.toLowerCase().trim().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return text.slice(0, len);
  const lower = text.toLowerCase();
  let hitIdx = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      hitIdx = idx;
      break;
    }
  }
  if (hitIdx < 0) return text.slice(0, len);
  const half = Math.max(0, Math.floor(len / 2) - 10);
  const start = Math.max(0, hitIdx - half);
  const end = Math.min(text.length, start + len);
  const prefix = start > 0 ? "\u2026" : "";
  const suffix = end < text.length ? "\u2026" : "";
  return prefix + text.slice(start, end).trim() + suffix;
}

// src/index.ts
import { CONTEXT_WINDOW_EXCEEDED_CODE } from "@deepseek-ai/dsh-llm";

// src/lru.ts
var DEFAULT_SESSION_CACHE_LIMIT = 512;
var LruMap = class extends Map {
  maxEntries;
  constructor(maxEntries) {
    super();
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
  }
  get(key) {
    if (!super.has(key)) return void 0;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    super.delete(key);
    super.set(key, value);
    while (this.size > this.maxEntries) {
      const oldest = this.keys().next().value;
      if (oldest === void 0) break;
      super.delete(oldest);
    }
    return this;
  }
};

// src/region.ts
import { randomUUID } from "crypto";
import { CompactionId, compactCheckpointSource, toolPairingBalancedAfter, toolPairingBalancedBefore } from "@deepseek-ai/dsh-compaction";
import { createUserMessage } from "@deepseek-ai/dsh-llm";

// src/session-events.ts
function sessionEventsOf(session) {
  const snapshot = session.snapshotEvents?.();
  if (snapshot !== void 0) return snapshot;
  return session.events;
}
function eventAtOf(session, seq) {
  const eventAt = session.eventAt;
  if (typeof eventAt === "function") return eventAt.call(session, seq);
  return sessionEventsOf(session)?.[seq];
}

// src/messages.ts
function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const b = block;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    } else if (b.type === "image" || b.type === "file") {
      const placeholder = attachmentPlaceholder(b.type, b.attachment);
      if (placeholder !== null) parts.push(placeholder);
    } else if (Array.isArray(b.content)) {
      parts.push(extractText(b.content));
    }
  }
  return parts.join("\n");
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function attachmentPlaceholder(type, attachment) {
  if (attachment === null || typeof attachment !== "object") return null;
  const a = attachment;
  const name = typeof a.name === "string" && a.name.length > 0 ? a.name : void 0;
  const size = typeof a.bytes === "number" && Number.isFinite(a.bytes) ? ` ${formatBytes(a.bytes)}` : "";
  if (type === "file") return `[file ${name ?? "attachment"}${size}]`;
  const mediaType = typeof a.mediaType === "string" && a.mediaType.length > 0 ? a.mediaType : "image";
  const dimensions = typeof a.width === "number" && typeof a.height === "number" ? ` ${a.width}x${a.height}` : "";
  return `[image ${mediaType}${name ? ` ${name}` : ""}${dimensions}${size}]`;
}
function toolCallsOf(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b.type === "tool-call");
}
function stringifyArgs(args) {
  if (!args) return "";
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}
function toolCallIdOfResultEvent(event) {
  if (event.type !== "tool/result") return null;
  const message = event.data.message;
  const block = Array.isArray(message?.content) ? message.content.find((candidate) => candidate?.type === "tool-result") : void 0;
  const id = block?.toolCallId ?? message?.source?.callId;
  return typeof id === "string" ? id : null;
}
function buildToolCallIndex(events) {
  const index = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event.type !== "assistant/message") continue;
    const content = event.data.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const candidate = block;
      if (candidate !== null && typeof candidate === "object" && candidate.type === "tool-call" && typeof candidate.id === "string") {
        index.set(candidate.id, typeof candidate.name === "string" ? candidate.name : "");
      }
    }
  }
  return index;
}
var SUMMARY_FRAME_PREFIX = "[Model-written summary \u2014 not user words; re-verify any obligations before relying on them]";
function withSummaryFramePrefix(text) {
  if (text.startsWith(SUMMARY_FRAME_PREFIX)) return text;
  if (isEngineWrittenSummary(text)) return text;
  return `${SUMMARY_FRAME_PREFIX}
${text}`;
}
var ENGINE_SUMMARY_LEAD = "[engine-written summary \u2014 context-overflow emergency compaction";
function isEngineWrittenSummary(text) {
  return text.startsWith(ENGINE_SUMMARY_LEAD);
}
function overflowMarkerSummary(hiddenCount) {
  return `${ENGINE_SUMMARY_LEAD}: ${hiddenCount} surface message(s) hidden because the provider rejected the request as exceeding the context window. The originals are intact in the session log \u2014 use search_context or decompress (see acp_status) to read them, or re-run the compress tool over this range to write a proper summary.]`;
}
function projectEvent(event, toolNames) {
  switch (event.type) {
    case "user/message": {
      const raw = extractText(event.data.content);
      const text = isCheckpointNode(event) ? withSummaryFramePrefix(raw) : raw;
      return text.length > 0 ? [{ id: String(event.seq), role: "user", contentType: "text", text }] : [];
    }
    case "assistant/message": {
      const content = event.data.message?.content;
      const calls = toolCallsOf(content);
      const text = extractText(content);
      if (calls.length === 0) {
        return text.trim().length > 0 ? [{ id: String(event.seq), role: "assistant", contentType: "text", text }] : [];
      }
      if (calls.length === 1) {
        const call = calls[0];
        const argStr = stringifyArgs(call.arguments);
        const body = argStr && text ? `${text}
${argStr}` : argStr || text;
        return [{
          id: String(event.seq),
          role: "assistant",
          contentType: "tool-call",
          toolName: call.name ?? "",
          toolCallId: call.id ?? "",
          text: body
        }];
      }
      return calls.map((call) => ({
        id: `${event.seq}#${call.id ?? ""}`,
        role: "assistant",
        contentType: "tool-call",
        toolName: call.name ?? "",
        toolCallId: call.id ?? "",
        text: stringifyArgs(call.arguments) || text
      }));
    }
    case "tool/result": {
      const message = event.data.message;
      const text = extractText(message?.content);
      if (text.length === 0) return [];
      const key = toolCallIdOfResultEvent(event);
      return [{
        id: String(event.seq),
        role: "tool",
        contentType: "tool-result",
        toolName: toolNames?.get(key ?? "") ?? "",
        toolCallId: message?.toolCallId ?? key ?? "",
        text
      }];
    }
    default:
      return [];
  }
}
function eventsToCoreMessages(events, toolNames) {
  const index = toolNames ?? buildToolCallIndex(events);
  const out = [];
  for (const event of events) out.push(...projectEvent(event, index));
  return out;
}
function surfaceEventsOf(session) {
  return session.surface.nodes.map((seq) => eventAtOf(session, seq)).filter((event) => event !== void 0);
}
function allLogMessages(session) {
  return eventsToCoreMessages(sessionEventsOf(session));
}
function extractEventText(event) {
  switch (event.type) {
    case "user/message":
      return extractText(event.data.content);
    case "assistant/message":
      return extractText(event.data.message?.content);
    case "tool/result":
      return extractText(event.data.message?.content);
    default:
      return "";
  }
}
function countAttachmentBlocks(content) {
  const counts = { images: 0, files: 0 };
  countAttachments(content, counts);
  return counts;
}
function countAttachments(content, counts) {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const b = block;
    if (b.type === "image") counts.images += 1;
    else if (b.type === "file") counts.files += 1;
    else if (Array.isArray(b.content)) countAttachments(b.content, counts);
  }
}
function attachmentsOfEvent(event) {
  return countAttachmentBlocks(contentBlocksOfEvent(event));
}
function mediaBlocksOfEvent(event) {
  const blocks = [];
  collectMediaBlocks(contentBlocksOfEvent(event), blocks);
  return blocks;
}
function collectMediaBlocks(content, out) {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const b = block;
    if (b.type === "image" || b.type === "file") out.push(block);
    else if (Array.isArray(b.content)) collectMediaBlocks(b.content, out);
  }
}
function contentBlocksOfEvent(event) {
  switch (event.type) {
    case "user/message":
      return event.data.content;
    case "assistant/message":
    case "tool/result":
      return event.data.message?.content;
    default:
      return void 0;
  }
}
function isCheckpointNode(event) {
  if (event.type !== "user/message") return false;
  const source = event.data.source;
  return source?.plugin === "compact" || source?.kind === "compact-checkpoint";
}
function checkpointCompactionIdOf(event) {
  if (!isCheckpointNode(event)) return null;
  const source = event.data.source;
  return typeof source?.compactionId === "string" ? source.compactionId : null;
}
var METADATA_PLUGINS = /* @__PURE__ */ new Set([
  "acp-nudge",
  // nudge echo (src/nudge.ts)
  "billion-context-dsh"
  // compress-pair replacement stub (src/region.ts)
]);
var REAL_CONTENT_PLUGINS = /* @__PURE__ */ new Set([
  "@deepseek-ai/dsh-system-prompt",
  "user-approval",
  "tools-ptc"
]);
var REAL_CONTENT_KINDS = /* @__PURE__ */ new Set([
  "runtime-context",
  // dynamic-context snapshot (was '@deepseek-ai/dsh-system-prompt')
  "ptc-mode"
  // deferred tool context (was 'tools-ptc' / 'tools-code-mode')
]);
var AUDITED_RELAY_KINDS = /* @__PURE__ */ new Set([
  "subagent-report",
  "subagent-settled"
]);
var HOST_INSTRUCTION_KINDS = /* @__PURE__ */ new Set([
  "agent-instructions",
  // AGENTS.md injection (hook shape: {kind:'agent-instructions', form:'instructions'})
  "skill-catalog",
  // skill catalog (form:'catalog')
  // Host compaction summary row (DSH >= 0.1.7; was plugin 'dsh-compaction-basic').
  // That legacy name was never whitelisted, so its rows were barriers already —
  // the renamed spelling keeps exactly that treatment instead of silently
  // becoming foldable content (issue #169).
  "compact-basic"
]);
function sourcePluginOf(source) {
  if (source === void 0 || typeof source !== "object") return void 0;
  const kind = source.kind;
  if (kind === "plugin") {
    return typeof source.plugin === "string" && source.plugin.length > 0 ? source.plugin : void 0;
  }
  if (typeof kind === "string" && kind.startsWith("plugin:")) {
    const name = kind.slice("plugin:".length);
    return name.length > 0 ? name : void 0;
  }
  return void 0;
}
function isAgentInstructionsRow(event) {
  if (event.type !== "user/message") return false;
  const source = event.data.source;
  if (!source) return false;
  return source.kind === "agent-instructions" || sourcePluginOf(source) === "agent-instructions";
}
function classifySurfaceEvent(event) {
  if (isCheckpointNode(event)) return "checkpoint";
  if (event.type !== "user/message") return "real";
  const source = event.data.source;
  if (!source) return "real";
  const kind = source.kind;
  if (kind === "user") return "real";
  const plugin = sourcePluginOf(source);
  if (kind === "plugin" || plugin !== void 0) {
    if (plugin !== void 0 && METADATA_PLUGINS.has(plugin)) return "metadata";
    if (plugin !== void 0 && REAL_CONTENT_PLUGINS.has(plugin)) return "real";
    return "instruction";
  }
  if (typeof kind !== "string") return "real";
  if (HOST_INSTRUCTION_KINDS.has(kind)) return "instruction";
  if (REAL_CONTENT_KINDS.has(kind) || AUDITED_RELAY_KINDS.has(kind)) return "real";
  return "instruction";
}
function isRealUserTurn(event) {
  if (event.type !== "user/message") return false;
  if (classifySurfaceEvent(event) !== "real") return false;
  const source = event.data.source;
  const plugin = sourcePluginOf(source);
  if (plugin !== void 0 && REAL_CONTENT_PLUGINS.has(plugin)) return false;
  const kind = source?.kind;
  if (typeof kind === "string" && REAL_CONTENT_KINDS.has(kind)) return false;
  return kind !== "subagent-report" && kind !== "subagent-settled";
}

// src/host-tokens.ts
import { deriveEventMessage } from "@deepseek-ai/dsh-session";
var CHARS_PER_TOKEN = 4;
var BLOCK_OVERHEAD = 4;
var ROLE_OVERHEAD = 4;
function blockType(block) {
  if (typeof block !== "object" || block === null) return void 0;
  const type = block.type;
  return typeof type === "string" ? type : void 0;
}
function estimateHostContent(blocks) {
  if (typeof blocks === "string") {
    let tokens2 = 0;
    for (const char of blocks) {
      tokens2 += BLOCK_OVERHEAD + Math.ceil(JSON.stringify(char).length / CHARS_PER_TOKEN);
    }
    return tokens2;
  }
  let tokens = 0;
  for (const block of blocks) {
    switch (blockType(block)) {
      case "text":
      case "reasoning": {
        tokens += Math.ceil(block.text.length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
        break;
      }
      case "tool-call": {
        const call = block;
        tokens += Math.ceil(call.name.length / CHARS_PER_TOKEN) + Math.ceil(call.arguments.length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
        break;
      }
      case "tool-result": {
        tokens += estimateHostContent(block.content) + BLOCK_OVERHEAD;
        break;
      }
      default:
        tokens += BLOCK_OVERHEAD + Math.ceil(JSON.stringify(block).length / CHARS_PER_TOKEN);
    }
  }
  return tokens;
}
function estimateHostMessage(message) {
  return estimateHostContent(message.content) + ROLE_OVERHEAD;
}
function hostPriceEvent(event) {
  const message = deriveEventMessage(event);
  return message === null ? 0 : estimateHostMessage(message);
}
function shadowedHostTokens(session, seqs) {
  let total = 0;
  for (const seq of seqs) {
    const event = eventAtOf(session, seq);
    if (event !== void 0) total += hostPriceEvent(event);
  }
  return total;
}
function hostMediaStructuralPrice(blocks) {
  if (!Array.isArray(blocks)) return 0;
  let tokens = 0;
  for (const block of blocks) {
    if (block === null || typeof block !== "object") continue;
    const b = block;
    if (b.type === "image" || b.type === "file") {
      tokens += BLOCK_OVERHEAD + Math.ceil(JSON.stringify(block).length / CHARS_PER_TOKEN);
    } else if (Array.isArray(b.content)) {
      tokens += hostMediaStructuralPrice(b.content);
    }
  }
  return tokens;
}
function mediaPriceViaMeter(session, ctx) {
  const prices = /* @__PURE__ */ new Map();
  try {
    const meter = ctx?.get?.("tokenMeter");
    if (meter?.measure === void 0) return prices;
    for (const node of meter.measure(session).nodes) {
      const heuristic = node.heuristicTokens ?? node.tokens;
      const routed = node.tokens - heuristic;
      if (routed > 0) prices.set(node.seq, routed);
    }
  } catch {
  }
  return prices;
}
function shadowedTokensViaMeter(session, seqs, ctx) {
  try {
    const meter = ctx?.get?.("tokenMeter");
    if (meter?.measure !== void 0) {
      const bySeq = new Map(meter.measure(session).nodes.map((node) => [node.seq, node.heuristicTokens ?? node.tokens]));
      let total = 0;
      let missing = false;
      for (const seq of seqs) {
        const tokens = bySeq.get(seq);
        if (tokens === void 0) {
          missing = true;
          break;
        }
        total += tokens;
      }
      if (!missing) return total;
    }
  } catch {
  }
  return shadowedHostTokens(session, seqs);
}

// src/block-ledger.ts
var ACP_BLOCK_LEDGER_MARKER = "$dshAcpBlockLedger";
var ACP_BLOCK_LEDGER_VERSION = 1;
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function encodeAcpBlockLedger(payload) {
  const obj = { [ACP_BLOCK_LEDGER_MARKER]: ACP_BLOCK_LEDGER_VERSION };
  if (payload.tier !== void 0) obj.tier = payload.tier;
  if (payload.kernelBlockId !== void 0) obj.kernelBlockId = payload.kernelBlockId;
  if (payload.topic !== void 0) obj.topic = payload.topic;
  if (payload.parentBlockIds !== void 0 && payload.parentBlockIds.length > 0) {
    obj.parentBlockIds = [...payload.parentBlockIds];
  }
  if (payload.directMessageIds !== void 0) obj.directMessageIds = [...payload.directMessageIds];
  if (payload.effectiveMessageIds !== void 0) obj.effectiveMessageIds = [...payload.effectiveMessageIds];
  if (payload.verifiedReadings !== void 0 && payload.verifiedReadings.length > 0) {
    obj.verifiedReadings = [...payload.verifiedReadings];
  }
  return [{ type: "text", text: JSON.stringify(obj) }];
}
function decodeAcpBlockLedger(rawOutput) {
  try {
    if (!Array.isArray(rawOutput)) return {};
    for (const block of rawOutput) {
      if (block === null || typeof block !== "object") continue;
      const candidate = block;
      if (candidate.type !== "text" || typeof candidate.text !== "string") continue;
      let parsed;
      try {
        parsed = JSON.parse(candidate.text);
      } catch {
        continue;
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const record = parsed;
      if (record[ACP_BLOCK_LEDGER_MARKER] !== ACP_BLOCK_LEDGER_VERSION) continue;
      const result = {};
      if (record.tier === 1 || record.tier === 2 || record.tier === 3) result.tier = record.tier;
      if (typeof record.kernelBlockId === "string") result.kernelBlockId = record.kernelBlockId;
      if (typeof record.topic === "string") result.topic = record.topic;
      if (isStringArray(record.parentBlockIds)) result.parentBlockIds = [...record.parentBlockIds];
      if (isStringArray(record.directMessageIds)) result.directMessageIds = [...record.directMessageIds];
      if (isStringArray(record.effectiveMessageIds)) result.effectiveMessageIds = [...record.effectiveMessageIds];
      if (isStringArray(record.verifiedReadings)) result.verifiedReadings = [...record.verifiedReadings];
      return result;
    }
    return {};
  } catch {
    return {};
  }
}

// src/region.ts
function findOpenTurn(events) {
  let open = null;
  for (const event of events) {
    if (event.type === "turn/start") open = event.data.turn;
    else if (event.type === "turn/end" && event.data.turn === open) open = null;
  }
  return open;
}
function assertNoActiveCompaction(events) {
  let active = false;
  for (const event of events) {
    if (event.type === "compaction/start") active = true;
    else if (event.type === "compaction/end") active = false;
  }
  if (active) {
    console.warn("billion-context-dsh: clearing stale compaction flag \u2014 found a compaction/start with no matching compaction/end");
  }
}
function anchorsRangeEdge(session, seq) {
  const event = eventAtOf(session, seq);
  if (event === void 0) return false;
  if (isSystemNode(event)) return false;
  switch (event.type) {
    case "user/message":
      return extractEventText(event).trim().length > 0;
    case "assistant/message": {
      const content = event.data.message?.content;
      return toolCallsOf(content).length > 0 || extractText(content).trim().length > 0;
    }
    case "tool/result":
      return true;
    default:
      return false;
  }
}
var AlreadyCompressedRangeError = class extends Error {
  constructor(start, end, coveringBlockIds) {
    super(
      `billion-context-dsh: seq ${start}..${end} already compressed \u2014 no live content remains in that span`
    );
    this.start = start;
    this.end = end;
    this.coveringBlockIds = coveringBlockIds;
    this.name = "AlreadyCompressedRangeError";
  }
  start;
  end;
  coveringBlockIds;
};
function recoverStaleRange(session, start, end) {
  if (eventAtOf(session, start) === void 0 || eventAtOf(session, end) === void 0) {
    const failedEdge = eventAtOf(session, start) === void 0 ? start : end;
    return { kind: "unresolvable", failedEdge };
  }
  const liveInside = session.surface.nodes.filter((seq) => seq >= start && seq <= end).sort((a, b) => a - b);
  const plain = liveInside.filter((seq) => {
    const event = eventAtOf(session, seq);
    return !isCheckpointNode(event) && !isSystemNode(event);
  });
  if (plain.length === 0) {
    const coveringBlockIds = rebuildBlockLedger(sessionEventsOf(session)).filter((entry) => entry.shadowedSeqs.some((seq) => seq >= start && seq <= end)).map((entry) => entry.blockId);
    return { kind: "already-compressed", coveringBlockIds };
  }
  return { kind: "ok", start: plain[0], end: plain[plain.length - 1] };
}
function resolveSurfaceRange(session, start, end) {
  const nodes = session.surface.nodes;
  if (start > end) {
    throw new Error(`billion-context-dsh: reversed range ${start}..${end}`);
  }
  let requestedStartIdx = nodes.indexOf(start);
  let requestedEndIdx = nodes.indexOf(end);
  let recovered = false;
  if (requestedStartIdx < 0 || requestedEndIdx < 0) {
    const stale = recoverStaleRange(session, start, end);
    if (stale.kind === "unresolvable") {
      throw new Error(
        `billion-context-dsh: seq ${start}..${end} not in the current surface \u2014 edge seq ${stale.failedEdge} is not in this session's log. Surface seqs are sparse message nodes (only user/message, assistant/message, tool/result events); consult acp_status for the current surface range`
      );
    }
    if (stale.kind === "already-compressed") {
      throw new AlreadyCompressedRangeError(start, end, stale.coveringBlockIds);
    }
    start = stale.start;
    end = stale.end;
    recovered = true;
    requestedStartIdx = nodes.indexOf(start);
    requestedEndIdx = nodes.indexOf(end);
    if (requestedStartIdx < 0 || requestedEndIdx < 0) {
      throw new Error(
        `billion-context-dsh: seq ${start}..${end} not in the current surface \u2014 consult acp_status for the current surface range`
      );
    }
  }
  if (requestedStartIdx > requestedEndIdx) {
    throw new Error(`billion-context-dsh: reversed range ${start}..${end}`);
  }
  if (start > end) {
    throw new Error(`billion-context-dsh: reversed range ${start}..${end}`);
  }
  const cleanBefore = (index) => {
    const node = nodes[index];
    const event = eventAtOf(session, node);
    if (event === void 0 || isSystemNode(event)) return false;
    if (!toolPairingBalancedBefore(session, node)) return false;
    return anchorsRangeEdge(session, node);
  };
  const cleanAfter = (index) => {
    const node = nodes[index];
    const event = eventAtOf(session, node);
    if (event === void 0 || isSystemNode(event)) return false;
    if (!toolPairingBalancedAfter(session, node)) return false;
    return anchorsRangeEdge(session, node);
  };
  let startIdx = requestedStartIdx;
  let endIdx = requestedEndIdx;
  while (startIdx <= endIdx && !cleanBefore(startIdx)) {
    startIdx += 1;
  }
  while (endIdx >= startIdx && !cleanAfter(endIdx)) {
    endIdx -= 1;
  }
  if (startIdx <= endIdx && nodes[startIdx] <= nodes[endIdx]) {
    return recovered ? { start: nodes[startIdx], end: nodes[endIdx], recovered: true } : { start: nodes[startIdx], end: nodes[endIdx] };
  }
  if (recovered) {
    throw new Error(
      `billion-context-dsh: no tool-pairing-balanced live remainder around seq ${start}..${end} \u2014 narrow the range or consult acp_status for the current surface`
    );
  }
  startIdx = requestedStartIdx;
  endIdx = requestedEndIdx;
  while (startIdx > 0 && !cleanBefore(startIdx)) {
    startIdx -= 1;
  }
  while (endIdx < nodes.length - 1 && !cleanAfter(endIdx)) {
    endIdx += 1;
  }
  if (cleanBefore(startIdx) && cleanAfter(endIdx) && nodes[startIdx] <= nodes[endIdx]) {
    return { start: nodes[startIdx], end: nodes[endIdx] };
  }
  throw new Error(
    `billion-context-dsh: no tool-pairing-balanced range around seq ${start}..${end} \u2014 narrow the range or consult acp_status for the current surface`
  );
}
function shadowedSeqsOf(session, start, end) {
  const nodes = session.surface.nodes;
  const startIdx = nodes.indexOf(start);
  const endIdx = nodes.indexOf(end);
  return nodes.slice(startIdx, endIdx + 1);
}
function readCompactionSummary(event) {
  return event.data;
}
function prefixSummaryBlocks(blocks) {
  let done = false;
  return blocks.map((block) => {
    if (done || block.type !== "text") return block;
    done = true;
    const textBlock = block;
    return { ...textBlock, text: withSummaryFramePrefix(textBlock.text) };
  });
}
function runCompactionTransaction(session, input) {
  assertNoActiveCompaction(sessionEventsOf(session));
  const turn = findOpenTurn(sessionEventsOf(session));
  const compactionId = CompactionId(randomUUID());
  const seqs = [];
  if (input.start > input.end) {
    throw new Error(`billion-context-dsh: reversed range ${input.start}..${input.end}`);
  }
  if (eventAtOf(session, input.start) === void 0 || eventAtOf(session, input.end) === void 0) {
    const failedEdge = eventAtOf(session, input.start) === void 0 ? input.start : input.end;
    throw new Error(
      `billion-context-dsh: seq ${input.start}..${input.end} not in the current surface \u2014 edge seq ${failedEdge} is not in this session's log. Surface seqs are sparse message nodes (only user/message, assistant/message, tool/result events); consult acp_status for the current surface range`
    );
  }
  try {
    seqs.push(session.append("compaction/start", { compactionId, turn }).seq);
    const ledgerPayload = {
      tier: input.tier ?? 1,
      ...input.kernelBlockId === void 0 ? {} : { kernelBlockId: input.kernelBlockId },
      ...input.topic === void 0 ? {} : { topic: input.topic },
      ...input.parentBlockIds === void 0 || input.parentBlockIds.length === 0 ? {} : { parentBlockIds: [...input.parentBlockIds] },
      ...input.directMessageIds === void 0 ? {} : { directMessageIds: [...input.directMessageIds] },
      ...input.effectiveMessageIds === void 0 ? {} : { effectiveMessageIds: [...input.effectiveMessageIds] },
      ...input.verifiedReadings === void 0 || input.verifiedReadings.length === 0 ? {} : { verifiedReadings: [...input.verifiedReadings] }
    };
    const framedSummary = prefixSummaryBlocks(input.summary);
    seqs.push(session.append("compaction/summary", {
      compactionId,
      summary: framedSummary,
      shadowedRange: { start: input.start, end: input.end },
      shadowedSeqs: [...input.shadowedSeqs],
      shadowedTokenCount: input.shadowedTokenCount,
      provider: input.provider,
      model: input.model,
      rawOutput: encodeAcpBlockLedger(ledgerPayload)
    }).seq);
    const message = createUserMessage({
      content: framedSummary,
      source: compactCheckpointSource(compactionId)
    });
    seqs.push(session.append("user/message", message, {
      surfaceOp: { op: "replace", startSeq: input.start, endSeq: input.end },
      sourceEventSeqs: [...input.shadowedSeqs]
    }).seq);
    seqs.push(session.append("compaction/end", { compactionId, turn }).seq);
  } catch (error) {
    try {
      session.append("compaction/end", { compactionId, turn });
    } catch (compensateError) {
      console.warn("billion-context-dsh: failed to write a compensating compaction/end", compensateError);
    }
    throw error;
  }
  return { compactionId, seqs };
}
function summarySeqIndex(events) {
  const index = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event.type !== "user/message") continue;
    const compactionId = checkpointCompactionIdOf(event);
    if (compactionId !== null && !index.has(compactionId)) index.set(compactionId, event.seq);
  }
  return index;
}
var blockLedgerCache = /* @__PURE__ */ new WeakMap();
function rebuildBlockLedger(events) {
  const cached = blockLedgerCache.get(events);
  if (cached !== void 0 && cached.len === events.length) return cached.ledger;
  const summarySeqs = summarySeqIndex(events);
  const ledger = [];
  for (const event of events) {
    if (event.type !== "compaction/summary") continue;
    const data = readCompactionSummary(event);
    let shadowedTokenCount = data.shadowedTokenCount;
    if (shadowedTokenCount === 0) {
      shadowedTokenCount = 0;
      for (const seq of data.shadowedSeqs) {
        const original = events[seq];
        if (original !== void 0) shadowedTokenCount += defaultCountTokens(extractEventText(original));
      }
    }
    const embedded = decodeAcpBlockLedger(data.rawOutput);
    const tier = embedded.tier ?? (data.tier === 2 || data.tier === 3 ? data.tier : 1);
    const parentBlockIds = embedded.parentBlockIds ? [...embedded.parentBlockIds] : Array.isArray(data.parentBlockIds) ? [...data.parentBlockIds] : [];
    const directMessageIds = embedded.directMessageIds ? [...embedded.directMessageIds] : Array.isArray(data.directMessageIds) ? [...data.directMessageIds] : void 0;
    const effectiveMessageIds = embedded.effectiveMessageIds ? [...embedded.effectiveMessageIds] : Array.isArray(data.effectiveMessageIds) ? [...data.effectiveMessageIds] : void 0;
    const topic = embedded.topic ?? (typeof data.topic === "string" ? data.topic : void 0);
    const kernelBlockId = embedded.kernelBlockId ?? (typeof data.kernelBlockId === "string" ? data.kernelBlockId : void 0);
    const verifiedReadings = embedded.verifiedReadings ? [...embedded.verifiedReadings] : Array.isArray(data.verifiedReadings) ? [...data.verifiedReadings] : void 0;
    const summarySeq = summarySeqs.get(data.compactionId) ?? null;
    ledger.push({
      blockId: data.compactionId,
      summary: extractText(data.summary),
      ...topic === void 0 ? {} : { topic },
      shadowedSeqs: [...data.shadowedSeqs],
      shadowedTokenCount,
      start: data.shadowedRange.start,
      end: data.shadowedRange.end,
      tier,
      parentBlockIds,
      ...kernelBlockId === void 0 ? {} : { kernelBlockId },
      ...summarySeq === null ? {} : { summarySeq },
      ...directMessageIds === void 0 ? {} : { directMessageIds },
      ...effectiveMessageIds === void 0 ? {} : { effectiveMessageIds },
      ...verifiedReadings === void 0 ? {} : { verifiedReadings },
      createdAt: event.time
    });
  }
  blockLedgerCache.set(events, { len: events.length, ledger });
  return ledger;
}
function isToolEvent(event) {
  if (event.type === "tool/result") return true;
  if (event.type !== "assistant/message") return false;
  const content = event.data.message?.content;
  return Array.isArray(content) && content.some((block) => block?.type === "tool-call");
}
function isSystemNode(event) {
  return event.type === "system/message";
}
function toolCallIdsOfEvent(event) {
  if (event.type !== "assistant/message") return [];
  const content = event.data.message?.content;
  if (!Array.isArray(content)) return [];
  const ids = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const b = block;
    if (b.type === "tool-call" && typeof b.id === "string") ids.push(b.id);
  }
  return ids;
}
var PRUNE_NOTE = "(removed by context management)";
function hideSurfaceSeqs(session, seqs, text, priceEvent = hostPriceEvent) {
  if (seqs.length === 0) return;
  const start = seqs[0];
  const end = seqs[seqs.length - 1];
  let shadowedTokenCount = 0;
  for (const seq of seqs) {
    const event = eventAtOf(session, seq);
    if (event !== void 0) shadowedTokenCount += priceEvent(event);
  }
  session.append("compaction/prune", {
    shadowedRange: { start, end },
    shadowedSeqs: [...seqs],
    shadowedTokenCount
  });
  const body = text !== void 0 && text.trim().length > 0 ? text : PRUNE_NOTE;
  session.append("user/message", createUserMessage({
    content: [{ type: "text", text: body }],
    // V4 producer kind (issue #163): DSH ≥0.1.7's V4 admission rejects the
    // legacy wrapper `{ kind: 'plugin', plugin: … }`; `plugin:<name>` is what
    // the host's own V3→V4 migration emits and is accepted by 0.1.5 too.
    source: { kind: "plugin:billion-context-dsh" }
  }), {
    surfaceOp: { op: "replace", startSeq: start, endSeq: end },
    sourceEventSeqs: [...seqs]
  });
}
function hideCompressToolPair(session, callId, resultSeq) {
  let callSeq = null;
  const events = sessionEventsOf(session);
  for (const event of events) {
    if (event.type !== "assistant/message") continue;
    if (toolCallIdsOfEvent(event).includes(callId)) {
      callSeq = event.seq;
      break;
    }
  }
  if (callSeq === null) return false;
  const callNodeIds = toolCallIdsOfEvent(events[callSeq]);
  if (callNodeIds.length !== 1 || callNodeIds[0] !== callId) return false;
  let resolvedResultSeq = resultSeq ?? null;
  if (resolvedResultSeq === null) {
    for (const event of events) {
      if (event.type === "tool/result" && toolCallIdOfResultEvent(event) === callId) {
        resolvedResultSeq = event.seq;
        break;
      }
    }
  }
  if (resolvedResultSeq === null) return false;
  const nodes = session.surface.nodes;
  const startIdx = nodes.indexOf(callSeq);
  const endIdx = nodes.indexOf(resolvedResultSeq);
  if (startIdx < 0 || endIdx < 0 || endIdx - startIdx !== 1) return false;
  const resultEvent = events[resolvedResultSeq];
  const resultText = resultEvent === void 0 ? "" : extractEventText(resultEvent);
  hideSurfaceSeqs(session, [callSeq, resolvedResultSeq], resultText);
  return true;
}
function stripOrphanedSurfaceToolMessages(session, inFlightCallIds = /* @__PURE__ */ new Set()) {
  const nodes = session.surface.nodes;
  const callIdsBySeq = /* @__PURE__ */ new Map();
  const open = /* @__PURE__ */ new Map();
  const orphanResultSeqs = [];
  const brokenResults = /* @__PURE__ */ new Map();
  for (let index = 0; index < nodes.length; index += 1) {
    const seq = nodes[index];
    const event = eventAtOf(session, seq);
    if (event === void 0) continue;
    if (event.type === "assistant/message") {
      const ids = toolCallIdsOfEvent(event);
      if (ids.length === 0) continue;
      callIdsBySeq.set(seq, ids);
      for (const id of ids) {
        if (!open.has(id)) open.set(id, { seq, index });
      }
    } else if (event.type === "tool/result") {
      const id = toolCallIdOfResultEvent(event);
      if (id === null) continue;
      const call = open.get(id);
      if (call === void 0) {
        orphanResultSeqs.push(seq);
        continue;
      }
      const callNodeIds = callIdsBySeq.get(call.seq);
      let adjacent = false;
      if (callNodeIds !== void 0) {
        adjacent = true;
        for (let mid = call.index + 1; mid < index; mid += 1) {
          const midEvent = eventAtOf(session, nodes[mid]);
          if (midEvent === void 0 || midEvent.type !== "tool/result") {
            adjacent = false;
            break;
          }
          const midId = toolCallIdOfResultEvent(midEvent);
          if (midId === null || !callNodeIds.includes(midId)) {
            adjacent = false;
            break;
          }
        }
      }
      open.delete(id);
      if (!adjacent) brokenResults.set(seq, call.seq);
    }
  }
  const brokenIdsByCallSeq = /* @__PURE__ */ new Map();
  for (const [resultSeq, callSeq] of brokenResults) {
    const id = toolCallIdOfResultEvent(eventAtOf(session, resultSeq));
    if (id !== null) {
      const list = brokenIdsByCallSeq.get(callSeq) ?? [];
      list.push(id);
      brokenIdsByCallSeq.set(callSeq, list);
    }
  }
  const hiddenSet = new Set(orphanResultSeqs);
  for (const resultSeq of brokenResults.keys()) hiddenSet.add(resultSeq);
  for (const [callSeq, ids] of callIdsBySeq) {
    const brokenIds = brokenIdsByCallSeq.get(callSeq);
    const allUnpaired = !ids.some((candidate) => inFlightCallIds.has(candidate)) && ids.every((candidate) => open.has(candidate) || brokenIds?.includes(candidate) === true);
    if (allUnpaired) hiddenSet.add(callSeq);
  }
  const hidden = [...hiddenSet].sort((a, b) => a - b);
  let count = 0;
  for (const seq of hidden) {
    if (eventAtOf(session, seq) === void 0) continue;
    hideSurfaceSeqs(session, [seq]);
    count += 1;
  }
  return count;
}
function openToolCallIds(session) {
  const open = /* @__PURE__ */ new Set();
  for (const seq of session.surface.nodes) {
    const event = eventAtOf(session, seq);
    if (event === void 0) continue;
    if (event.type === "assistant/message") {
      for (const id of toolCallIdsOfEvent(event)) open.add(id);
    } else if (event.type === "tool/result") {
      const id = toolCallIdOfResultEvent(event);
      if (id !== null) open.delete(id);
    }
  }
  return open;
}
function deferCompressPairHide(session, callId, resultSeq, onError) {
  queueMicrotask(() => {
    try {
      hideCompressToolPair(session, callId, resultSeq);
    } catch (error) {
      onError?.(error);
    }
  });
}
function newestInstructionSeqsOf(session) {
  const newest = /* @__PURE__ */ new Map();
  const events = sessionEventsOf(session);
  for (let seq = 0; seq < events.length; seq += 1) {
    const event = events[seq];
    if (event === void 0 || !isAgentInstructionsRow(event)) continue;
    const source = event.data.source;
    const changes = Array.isArray(source?.changes) ? source.changes : [];
    const scopes = changes.map((change) => typeof change?.scope === "string" ? change.scope : "").filter((scope) => scope.length > 0);
    if (scopes.length === 0) {
      continue;
    }
    for (const scope of scopes) newest.set(scope, seq);
  }
  return new Set(newest.values());
}
function guardedSurfaceSeqsOf(session) {
  const guarded = /* @__PURE__ */ new Set();
  const newestInstructions = newestInstructionSeqsOf(session);
  for (const seq of session.surface.nodes) {
    const event = eventAtOf(session, seq);
    if (event === void 0) continue;
    if (isAgentInstructionsRow(event) && newestInstructions.has(seq)) guarded.add(seq);
  }
  return guarded;
}
function seqOfKernelRef(refs, ref) {
  const id = refs.byRef[ref];
  if (id === void 0) return null;
  const seq = Number(String(id).split("#")[0]);
  return Number.isInteger(seq) ? seq : null;
}
function protectedSurfaceSeqs(session, preserve) {
  const nodes = session.surface.nodes;
  const protectedSeqs = /* @__PURE__ */ new Set();
  if (preserve > 0) {
    for (const seq of nodes.slice(-preserve)) protectedSeqs.add(seq);
  }
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const event = eventAtOf(session, nodes[index]);
    if (event !== void 0 && isRealUserTurn(event)) {
      protectedSeqs.add(nodes[index]);
      break;
    }
  }
  for (const seq of newestInstructionSeqsOf(session)) protectedSeqs.add(seq);
  return protectedSeqs;
}
function compressibleSegmentsOf(session, fromIndex, toIndex, protectedSeqs, mediaPriceOf) {
  const nodes = session.surface.nodes;
  const segments = [];
  let current = null;
  const flush = () => {
    if (current !== null) segments.push(current);
    current = null;
  };
  for (let index = fromIndex; index <= toIndex; index += 1) {
    const seq = nodes[index];
    if (seq === void 0) continue;
    const event = eventAtOf(session, seq);
    if (event === void 0 || protectedSeqs.has(seq) || isCheckpointNode(event) || isSystemNode(event) || classifySurfaceEvent(event) === "instruction") {
      flush();
      continue;
    }
    const attachments = attachmentsOfEvent(event);
    const mediaPrice = attachments.images + attachments.files > 0 ? (mediaPriceOf?.(seq) ?? 0) + hostMediaStructuralPrice(mediaBlocksOfEvent(event)) : 0;
    const tokens = defaultCountTokens(extractEventText(event)) + mediaPrice;
    const isTool = isToolEvent(event);
    if (current === null) {
      current = {
        start: seq,
        end: seq,
        count: 1,
        tokens,
        toolCount: isTool ? 1 : 0,
        images: attachments.images,
        files: attachments.files
      };
    } else {
      current.start = Math.min(current.start, seq);
      current.end = Math.max(current.end, seq);
      current.count += 1;
      current.tokens += tokens;
      current.toolCount += isTool ? 1 : 0;
      current.images += attachments.images;
      current.files += attachments.files;
    }
  }
  flush();
  return segments;
}
function buildCompressibleSeqRanges(session, kernelView, opts = {}) {
  stripOrphanedSurfaceToolMessages(session);
  const nodes = session.surface.nodes;
  const indexOfSeq = /* @__PURE__ */ new Map();
  for (let index = 0; index < nodes.length; index += 1) indexOfSeq.set(nodes[index], index);
  const protectedSeqs = protectedSurfaceSeqs(session, opts.preserveRecent ?? 5);
  const out = [];
  for (const range of kernelView.ranges) {
    const startSeq = seqOfKernelRef(kernelView.refs, range.startRef);
    const endSeq = seqOfKernelRef(kernelView.refs, range.endRef);
    const from = startSeq === null ? void 0 : indexOfSeq.get(startSeq);
    const to = endSeq === null ? void 0 : indexOfSeq.get(endSeq);
    if (from === void 0 || to === void 0) continue;
    const segments = compressibleSegmentsOf(
      session,
      Math.min(from, to),
      Math.max(from, to),
      protectedSeqs,
      opts.mediaPriceOf
    );
    for (const segment of segments) {
      try {
        const { start, end } = resolveSurfaceRange(session, segment.start, segment.end);
        out.push({
          start,
          end,
          count: segment.count,
          tokens: segment.tokens,
          toolPct: segment.count > 0 ? Math.round(segment.toolCount / segment.count * 100) : 0,
          images: segment.images,
          files: segment.files
        });
      } catch {
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
function surfaceSummary(session) {
  const nodes = session.surface.nodes;
  if (nodes.length === 0) return "empty";
  let first = nodes[0];
  let last = nodes[0];
  for (const seq of nodes) {
    if (seq < first) first = seq;
    if (seq > last) last = seq;
  }
  return `${nodes.length} nodes, seqs ${first}..${last}`;
}
function blockRegistry(session) {
  const ledger = rebuildBlockLedger(sessionEventsOf(session));
  const kernelIdOf = /* @__PURE__ */ new Map();
  const raw = [];
  let next = 1;
  for (const entry of ledger) {
    let kernelBlockId;
    if (entry.kernelBlockId !== void 0 && /^b\d+$/.test(entry.kernelBlockId)) {
      kernelBlockId = entry.kernelBlockId;
      const num = Number(kernelBlockId.slice(1));
      if (Number.isInteger(num)) next = Math.max(next, num + 1);
    } else {
      kernelBlockId = `b${next}`;
      next += 1;
    }
    kernelIdOf.set(entry.blockId, kernelBlockId);
    raw.push({
      blockId: entry.blockId,
      kernelBlockId,
      tier: entry.tier,
      summarySeq: entry.summarySeq ?? null,
      active: true,
      parentBlockIds: [...entry.parentBlockIds]
    });
  }
  const consumed = /* @__PURE__ */ new Set();
  for (const entry of raw) {
    for (const parent of entry.parentBlockIds) consumed.add(parent);
  }
  return raw.map((entry) => ({
    ...entry,
    active: !consumed.has(entry.blockId)
  }));
}
function blockRefForSummarySeq(session, seq) {
  const event = eventAtOf(session, seq);
  if (event === void 0) return null;
  const compactionId = checkpointCompactionIdOf(event);
  if (compactionId === null) return null;
  const entry = blockRegistry(session).find((r) => r.blockId === compactionId);
  if (entry === void 0) return null;
  return entry.kernelBlockId;
}
function compactionIdsOfKernelBlocks(session, kernelBlockIds) {
  if (kernelBlockIds.length === 0) return [];
  const byKernel = new Map(blockRegistry(session).map((r) => [r.kernelBlockId, r.blockId]));
  return kernelBlockIds.map((id) => byKernel.get(id)).filter((id) => id !== void 0);
}
function blockIdOfKernelRef(session, kernelRef) {
  if (!/^b\d+$/.test(kernelRef)) return null;
  const entry = blockRegistry(session).find((r) => r.kernelBlockId === kernelRef);
  return entry?.blockId ?? null;
}
function summarySeqOfKernelBlock(session, kernelBlockId) {
  const entry = blockRegistry(session).find((r) => r.kernelBlockId === kernelBlockId);
  return entry?.active ? entry.summarySeq : null;
}
function checkpointBlockIdOf(events, seq) {
  const event = events[seq];
  if (event === void 0) return null;
  return checkpointCompactionIdOf(event);
}
function expandShadowedSeqs(session, blockId) {
  const ledger = rebuildBlockLedger(sessionEventsOf(session));
  const byId = new Map(ledger.map((entry) => [entry.blockId, entry]));
  const root = byId.get(blockId);
  if (root === void 0) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const visit = (entry) => {
    if (seen.has(entry.blockId)) return;
    seen.add(entry.blockId);
    for (const seq of entry.shadowedSeqs) {
      const childId = checkpointBlockIdOf(sessionEventsOf(session), seq);
      const child = childId === null ? void 0 : byId.get(childId);
      if (child !== void 0) visit(child);
      else out.push(seq);
    }
  };
  visit(root);
  return out;
}
var DEFAULT_DECOMPRESS_PAGE = 100;
var DEFAULT_DECOMPRESS_PAGE_CHARS = 7e3;
function sliceDecompressPage(expanded, offset, limit, charBudget, renderLen) {
  const offN = typeof offset === "number" ? offset : Number(offset);
  const safeOffset = Number.isFinite(offN) && offN > 0 ? Math.floor(offN) : 0;
  const limN = typeof limit === "number" ? limit : Number(limit);
  const safeLimit = Number.isFinite(limN) && limN >= 1 ? Math.min(Math.floor(limN), DEFAULT_DECOMPRESS_PAGE) : DEFAULT_DECOMPRESS_PAGE;
  const start = Math.min(safeOffset, expanded.length);
  const endCap = Math.min(start + safeLimit, expanded.length);
  let end = start;
  let acc = 0;
  for (let i = start; i < endCap; i += 1) {
    const seq = expanded[i];
    const len = renderLen(seq);
    if (i > start && acc + len > charBudget) break;
    acc += len;
    end = i + 1;
  }
  return { offset: safeOffset, limit: safeLimit, total: expanded.length, seqs: expanded.slice(start, end), exhausted: end >= expanded.length };
}

// src/state.ts
function rebuildKernelBlocks(events) {
  const ledger = rebuildBlockLedger(events);
  if (ledger.length === 0) return [];
  const kernelIdOf = /* @__PURE__ */ new Map();
  const parentKernelIds = /* @__PURE__ */ new Map();
  let next = 1;
  for (const entry of ledger) {
    let kernelBlockId;
    if (entry.kernelBlockId !== void 0 && /^b\d+$/.test(entry.kernelBlockId)) {
      kernelBlockId = entry.kernelBlockId;
      const num = Number(kernelBlockId.slice(1));
      if (Number.isInteger(num)) next = Math.max(next, num + 1);
    } else {
      kernelBlockId = `b${next}`;
      next += 1;
    }
    kernelIdOf.set(entry.blockId, kernelBlockId);
    parentKernelIds.set(
      entry.blockId,
      entry.parentBlockIds.map((parent) => kernelIdOf.get(parent)).filter((id) => id !== void 0)
    );
  }
  const consumed = /* @__PURE__ */ new Set();
  for (const entry of ledger) {
    for (const parent of entry.parentBlockIds) consumed.add(parent);
  }
  const blocks = [];
  for (const entry of ledger) {
    const blockId = kernelIdOf.get(entry.blockId);
    const direct = entry.directMessageIds ?? [...entry.shadowedSeqs.map(String)];
    const effective = entry.effectiveMessageIds ?? (entry.tier > 1 ? entry.summarySeq === void 0 ? [...entry.shadowedSeqs.map(String)] : [String(entry.summarySeq)] : [...entry.shadowedSeqs.map(String)]);
    blocks.push({
      blockId,
      runId: `r${blocks.length + 1}`,
      tier: entry.tier,
      summary: entry.summary,
      ...entry.topic === void 0 ? {} : { topic: entry.topic },
      directMessageIds: [...direct],
      effectiveMessageIds: [...effective],
      directBlockIds: parentKernelIds.get(entry.blockId) ?? [],
      compressedTokens: entry.shadowedTokenCount,
      createdAt: entry.createdAt,
      survivedCount: 0,
      generation: "young",
      active: !consumed.has(entry.blockId)
    });
  }
  return blocks;
}
function nextBlockIdAfter(events) {
  const blocks = rebuildKernelBlocks(events);
  let max = 0;
  for (const block of blocks) {
    const num = Number(block.blockId.slice(1));
    if (Number.isInteger(num)) max = Math.max(max, num);
  }
  return max + 1;
}
function nextRunIdAfter(blocks) {
  let max = 0;
  for (const block of blocks) {
    const num = Number(block.runId.slice(1));
    if (Number.isInteger(num)) max = Math.max(max, num);
  }
  return max + 1;
}
var AcpStateStore = class {
  /**
   * Live kernel states, capped by an LRU policy (issue #113): once the cap is
   * reached the coldest session's state is dropped, and its next access
   * rehydrates through stateFor's log-rebuild path below. Rehydration is
   * deterministic — bN ids are recorded in the durable event or synthesised
   * in ledger order, and run ids continue after the rehydrated max — so block
   * identity survives eviction exactly as it survives a restart. Kernel
   * fields that reset on eviction (tokenSnapshot, nudge cadence, stats
   * counters) all self-heal on the session's next turn.
   */
  states;
  constructor(limit = DEFAULT_SESSION_CACHE_LIMIT) {
    this.states = new LruMap(limit);
  }
  /** Kernel state for one session, initialised on first access. */
  stateFor(session) {
    const id = session.id;
    const existing = this.states.get(id);
    if (existing !== void 0) return existing;
    const state = createInitialState();
    const events = sessionEventsOf(session);
    if (events.some((event) => event.type === "compaction/summary")) {
      state.blocks = rebuildKernelBlocks(events);
      state.nextBlockId = nextBlockIdAfter(events);
      state.nextRunId = nextRunIdAfter(state.blocks);
    }
    this.states.set(id, state);
    return state;
  }
  set(session, state) {
    this.states.set(session.id, state);
  }
  delete(session) {
    this.states.delete(session.id);
  }
};

// src/tools.ts
import { defineTool, ToolArgsError } from "@deepseek-ai/dsh-tools";

// src/config.ts
function kernelConfigFor(input) {
  const nudgePatch = {};
  if (input.nudgeMinContextLimitPct !== void 0) nudgePatch.minContextLimitPct = input.nudgeMinContextLimitPct;
  if (input.nudgeMaxContextLimitPct !== void 0) nudgePatch.maxContextLimitPct = input.nudgeMaxContextLimitPct;
  if (input.nudgeEmergencyThresholdPct !== void 0) nudgePatch.emergencyThresholdPct = input.nudgeEmergencyThresholdPct;
  const overrides = { ...input.coreOverrides };
  if (Object.keys(nudgePatch).length > 0 || input.coreOverrides?.nudge) {
    overrides.nudge = {
      ...defaultConfig(input.modelContextLimit).nudge,
      ...nudgePatch,
      ...input.coreOverrides?.nudge
    };
  }
  return defaultConfig(input.modelContextLimit, overrides);
}

// src/nudge.ts
import { createUserMessage as createUserMessage2 } from "@deepseek-ai/dsh-llm";

// src/prompts.ts
var NUDGE_ALLOWED = {
  normal: /* @__PURE__ */ new Set(["pct", "philosophy"]),
  emergency: /* @__PURE__ */ new Set(["pct", "philosophy"]),
  guidance: /* @__PURE__ */ new Set(),
  tier: /* @__PURE__ */ new Set(["tier", "count", "prevTier", "tokens", "seqs", "firstSeq", "lastSeq"]),
  breakdown: /* @__PURE__ */ new Set(["system", "tool", "summaries", "code", "text"]),
  growth: /* @__PURE__ */ new Set(["growth"]),
  tip: /* @__PURE__ */ new Set()
};
var RANGE_TABLE_ALLOWED = {
  header: /* @__PURE__ */ new Set(["surface"]),
  title: /* @__PURE__ */ new Set(["count"]),
  line: /* @__PURE__ */ new Set(["start", "end", "count", "tokens", "toolPct", "textPct", "media"]),
  footer: /* @__PURE__ */ new Set()
};
var TOOLS_ALLOWED = {
  compress: /* @__PURE__ */ new Set(),
  decompress: /* @__PURE__ */ new Set(),
  searchContext: /* @__PURE__ */ new Set(),
  acpStatus: /* @__PURE__ */ new Set()
};
var SYSTEM_ALLOWED = /* @__PURE__ */ new Set(["philosophy", "howToCompressRules", "tier2DistillRules", "tier3CondenseRules"]);
function validateTemplate(template, allowed, path) {
  const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let match;
  while ((match = re.exec(template)) !== null) {
    const name = match[1];
    if (!allowed.has(name)) {
      throw new Error(
        `${path} contains unknown placeholder {${name}} \u2014 allowed: ${[...allowed].join(", ") || "(none)"}`
      );
    }
  }
  return template;
}
function renderTemplate(template, vars) {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
    const value = vars[name];
    if (value === void 0) {
      throw new Error(
        `renderTemplate: missing value for placeholder {${name}} in template "${template.slice(0, 60)}\u2026"`
      );
    }
    return String(value);
  });
}
function mergeGroup(defaults, override, allowed, path) {
  if (override == null) return defaults;
  const out = {};
  for (const key of Object.keys(defaults)) {
    const value = override[key];
    out[key] = value === null || value === void 0 ? defaults[key] : validateTemplate(value, allowed[key], `${path}.${String(key)}`);
  }
  return out;
}
function resolvePrompts2(input) {
  if (input === void 0) return DEFAULT_RESOLVED;
  return {
    nudge: mergeGroup(DEFAULT_PROMPTS.nudge, input.nudge, NUDGE_ALLOWED, "prompts.nudge"),
    rangeTable: mergeGroup(DEFAULT_PROMPTS.rangeTable, input.rangeTable, RANGE_TABLE_ALLOWED, "prompts.rangeTable"),
    tools: mergeGroup(DEFAULT_PROMPTS.tools, input.tools, TOOLS_ALLOWED, "prompts.tools"),
    systemPromptTemplate: input.systemPrompt === null || input.systemPrompt === void 0 ? DEFAULT_PROMPTS.systemPromptTemplate : validateTemplate(input.systemPrompt, SYSTEM_ALLOWED, "prompts.systemPrompt")
  };
}
function renderSystemPrompt(prompts) {
  return renderTemplate(prompts.systemPromptTemplate, {
    philosophy: COMPRESS_PHILOSOPHY,
    howToCompressRules: HOW_TO_COMPRESS_RULES,
    tier2DistillRules: TIER2_DISTILL_RULES,
    tier3CondenseRules: TIER3_CONDENSE_RULES
  });
}
var DEFAULT_PROMPTS = {
  nudge: {
    // 与 kernel nudge-text.ts EFFICIENCY_NOTE 逐字对齐——不含 "Context usage is at X%"
    // 陈述(usage 只通过 breakdown 传达);{pct} 仍可用作自定义占位符。
    // B6（2026-09-08）：正文 ≤300 B——philosophy 段移出 nudge（已住系统提示与工具描述），
    // 每拍复读同一份 6 KB 文本=重复计费。
    normal: "Efficiency nudge: compress consumed ranges early to keep context lean \u2014 not an overflow warning. A stronger alert appears only if the context is actually full.",
    emergency: "\u26A0\uFE0F Context limit reached \u2014 compress now. Prioritize consumed tool outputs.",
    guidance: HOW_TO_COMPRESS_RULES,
    tier: "Tier {tier}: {count} tier-{prevTier} block(s) distillable ({tokens} tokens) \u2014 distill them by compressing their checkpoint seq(s) [seqs {seqs}] as one range: compress({ content: [{ startSeq: {firstSeq}, endSeq: {lastSeq}, summary }] }).",
    breakdown: "Context breakdown: {system}K system | {tool}K tool | {summaries}K summaries | {code}K code | {text}K text",
    growth: "+{growth}K since last nudge",
    tip: "\u{1F4A1} Compress all ranges in one call (pass multiple content entries: `content: [{...}, {...}]`)."
  },
  rangeTable: {
    header: "Surface: {surface}",
    title: "Compressible ranges ({count}, oldest first; exact surface seqs \u2014 usable as-is):",
    line: "  - seq {start}..{end} \u2014 {count} messages, ~{tokens} tokens [tool {toolPct}% | text {textPct}%]{media}",
    footer: "Compress with: compress({ content: [{ startSeq, endSeq, summary }] }) \u2014 content is an array: batch multiple unrelated segments in one call, each entry its own block. Keep ranges disjoint.\nSnapshot taken at nudge time: the seqs go stale once the surface moves (a later compress shadows them), so re-run acp_status for fresh refs before compressing.\nBefore you compress any row above, confirm it is truly consumed \u2014 if a span still holds live task state (where you are in the task / open TODOs, paths already ruled out, artifacts already done and where they live), carry that state into your summary or keep the span live. Compressing an in-progress span without carrying its state forces a full re-run afterward."
  },
  tools: {
    compress: 'Replace older conversation ranges with dense summaries you write. Each message seq is a surface reference. Single range: compress({ content: [{ startSeq, endSeq, summary }] }). Batch multiple unrelated ranges in one call (each content entry becomes its own block); keep ranges disjoint. Never compress content the current step is actively using. Compress boundaries are SURFACE SEQS (acp_status Surface: row, latest nudge table) \u2014 NOT the block refs (bN, e.g. b1) that acp_status COMPRESSED BLOCKS shows, which are for decompress only. Drilldown mN refs (e.g. m00306) are ALSO accepted as startSeq/endSeq \u2014 they are auto-mapped to the live surface seq; an unknown mN (never assigned on the current surface) fails with guidance. Seq refs must come from the CURRENT surface (acp_status or the latest nudge): a span whose edges were shadowed by an earlier compress is auto-remapped to its still-live content, a fully compressed span is reported as already compressed, and invented/other-session seqs fail with guidance. Good compression moments: stage or subtask completion whose details you have fully consumed and will not re-check, strategy switches, intermediate milestones, and wrapping up failed exploration \u2014 when the details are consumed and no longer critical for the task ahead. Before compressing, ask: will I need to re-verify any detail from this range in this task? If yes, keep it live. When you write a summary, turn dead-end exploration into a conclusion (what was tried, why it failed, the next step) \u2014 not a blow-by-blow; and keep the summary the ONLY record: self-contained, so a later reader (or you, after decompress) can continue without the original. Optional verifiedReadings: string[] per content entry records acceptance readings that are already green (e.g. "t0-fastpath 8/8") \u2014 stored structurally on the compaction event so later steps need not re-run them.',
    decompress: "Recover the original content of a compressed block by its blockId \u2014 the kernel block ref `bN` shown by acp_status (e.g. b1), or a compaction id from search_context (read-only; does not unshadow the range). Large blocks are paged so each page stays under the host tool-result trim budget (up to 100 messages per call): pass offset/limit to walk them and follow the continue hint in the result.",
    searchContext: "Search inside compressed blocks (summaries and original content) for information the model no longer sees in context. When a summary lacks a detail you need (exact values, error strings, decisions, verbatim code), SEARCH the compressed blocks FIRST \u2014 never guess or reconstruct from memory: search_context(query) locates the right block, then decompress only that block to recover the original.",
    acpStatus: 'Context status: overview of the current context \u2014 CONTEXT BREAKDOWN (tool/text/summaries token shares of the visible total), COMPRESSED BLOCKS ledger, and the nudge decision. No args = overview. Percentages are shares of the visible content, not the context window. Note: the block refs in COMPRESSED BLOCKS (bN, e.g. b1) are for decompress; compress uses the Surface: seq range, not bN. Drilldown: pass scope:"compressed" for a per-block list, or scope:"uncompressed" with view:"messages" (every visible message) / view:"ranges" (merged ranges); tool filters to one tool name, sort reorders (size/time/tool; age for compressed), limit caps rows (default 30). Drilldown row refs are kernel ids (mN) \u2014 feed them straight to compress as startSeq/endSeq (auto-mapped to the live surface seq); bN is for decompress, Surface: seqs also work in compress.'
  },
  systemPromptTemplate: `Active Context Pruning \u2014 model-driven context management

YOU decide whether and when to compress context. The nudge is an efficiency notification: when you see one, consider which ranges you have genuinely consumed and could summarise to keep working context lean.

{philosophy}

WHEN TO COMPRESS:
- A sub-agent or delegated task has returned a large result that you have already extracted the key facts from.
- Verbose command output (build/test logs, git diff, directory listings) where you have already used the information you need.
- Exploration that led nowhere.
- Repeated reads of the same file or repeated status checks once the decision is recorded.
- Resolved discussion threads where a decision has been captured in summary or in code.
- Intermediate steps of a completed multi-step task, once the final result is recorded.
- A task phase has ended \u2014 bug hunt complete, root cause found, exploration done, research sprint wrapped.

WHEN NOT TO COMPRESS:
- Content the current step is actively reading or reasoning about.
- Important user messages \u2014 preserve their exact intent, constraints, and acceptance criteria.
- Protected tool outputs \u2014 hard-excluded from compression ranges, survive intact in visible context.
- Content you will still need to cite verbatim \u2014 in review/audit/verification tasks, keep source reads un-compressed until the final report is written. If you compressed it and now need the exact detail, decompress costs a full round-trip; prefer delaying the compress.

{howToCompressRules}

Compression tools (refs are SURFACE SEQS, not ids):
- compress: replace one or more seq ranges, each with your own dense summary. Single range: compress({ content: [{ startSeq, endSeq, summary }] }). Batch multiple unrelated segments in one call (each entry becomes its own block): compress({ content: [{ startSeq: 1, endSeq: 5, summary: '...' }, { startSeq: 12, endSeq: 18, summary: '...' }] }). Keep ranges disjoint \u2014 overlapping entries in one batch are skipped. Edges are auto-balanced to tool-call/result boundaries; a trailing #callId fragment in a seq is ignored. Seq refs must be on the current surface: seqs from older nudges or earlier compresses go stale as the surface moves, so a stale span is auto-remapped to its still-live remainder (the result reports the adjusted span), a fully compressed span is reported as already compressed, and invented/other-session seqs fail with guidance. The block refs (bN, e.g. b1) in acp_status COMPRESSED BLOCKS are for decompress, NOT compress boundaries.
- decompress: recover a compressed block's original content, read-only. decompress({ blockId }) \u2014 accept the bN ref shown by acp_status (e.g. b1) or a compaction id. Large blocks page (each page sized to stay under the host tool-result trim budget, up to 100 messages): pass offset/limit and follow the continue hint in the result.
- search_context: when a summary lacks the details you need (exact values, error strings, decisions, verbatim code), SEARCH the compressed blocks FIRST \u2014 never guess or reconstruct from memory; search_context(query) locates the right block, decompress only that block.
- acp_status: current context usage and the live compressible-range list. Run it right before compressing \u2014 the only seqs that never go stale are the ones you just read. Drilldown (scope/view/tool/sort/limit) lists per-message or per-block sizes; drilldown rows are kernel ids (mN) \u2014 compress accepts them directly (auto-mapped to the live surface seq).

Tiered compression: each compressed block appears on the surface as one summary node. Compressing that node again DISTILLS the block (tier 2): the parent summary folds into your new summary and the original messages are freed. Distilling a tier-2 block yields tier 3. Distill when a summary itself is consumed \u2014 decompress on the tier-2 block recovers the full originals.

{tier2DistillRules}

{tier3CondenseRules}

When you write a summary, it becomes the ONLY record of that range: keep file paths, signatures, exact values, decisions, and error strings verbatim so a later reader (or you, after decompress) can continue without the original. A mid-task compression must also hand off STATE, not just facts: where you are in the task and what remains (open TODOs), which approaches you already ruled out (dead ends), and which intermediate artifacts are already done and where they live \u2014 so the next step continues instead of re-running work you already did. Never reuse historical seqs \u2014 the surface moves as messages land and compress; verify with acp_status.`
};
var DEFAULT_RESOLVED = DEFAULT_PROMPTS;

// src/nudge.ts
var GUIDANCE_BLOCKS = [COMPRESS_PHILOSOPHY, HOW_TO_COMPRESS_RULES, TIER2_DISTILL_RULES, TIER3_CONDENSE_RULES];
function stripNudgeGuidance(text) {
  let out = text;
  for (const block of GUIDANCE_BLOCKS) out = out.split(block).join("");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
function resolveTokenCount(agent, coreMessages) {
  const projections = agent.ctx?.get?.("sessionProjections");
  const projected = projections?.snapshot?.(agent.session)?.values?.contextPressure?.projectedTokens;
  if (typeof projected === "number" && projected > 0) return projected;
  const meter = agent.ctx?.get?.("tokenMeter");
  const surface = meter?.measure?.(agent.session)?.surfaceTokens;
  if (typeof surface === "number" && surface > 0) return surface;
  return coreMessages.reduce((sum, message) => sum + defaultCountTokens(message.text ?? ""), 0);
}
function kernelRangeViewOf(nudge, state) {
  return { ranges: nudge.compressibleRanges ?? [], refs: state.messageRefs };
}
function mediaSuffixOf(range) {
  if (range.images === 0 && range.files === 0) return "";
  const parts = [];
  if (range.images > 0) parts.push(`+${range.images} image${range.images === 1 ? "" : "s"}`);
  if (range.files > 0) parts.push(`+${range.files} file${range.files === 1 ? "" : "s"}`);
  return ` [${parts.join(" | ")}]`;
}
function meterMediaPriceResolver(agent, session) {
  let prices = null;
  return (seq) => {
    if (prices === null) prices = mediaPriceViaMeter(session, agent.ctx);
    return prices.get(seq) ?? 0;
  };
}
function rangeTable(session, kernelView, prompts = DEFAULT_RESOLVED, mediaPriceOf) {
  const ranges = buildCompressibleSeqRanges(
    session,
    kernelView,
    mediaPriceOf === void 0 ? {} : { mediaPriceOf }
  ).slice(0, 6);
  if (ranges.length === 0) return "";
  const lines = ranges.map(
    (range) => renderTemplate(prompts.rangeTable.line, {
      start: range.start,
      end: range.end,
      count: range.count,
      tokens: range.tokens,
      toolPct: range.toolPct,
      textPct: 100 - range.toolPct,
      media: mediaSuffixOf(range)
    })
  );
  return [
    // 前导空串元素产生 nudge 中范围表前的唯一空行(§4:parts 层不再加分隔)。
    "",
    renderTemplate(prompts.rangeTable.header, { surface: surfaceSummary(session) }),
    renderTemplate(prompts.rangeTable.title, { count: ranges.length }),
    ...lines,
    prompts.rangeTable.footer
  ].join("\n");
}
function measuredTokenCount(agent, coreMessages) {
  return resolveTokenCount(agent, coreMessages);
}
function computeSurfaceBreakdown(state, messages, total, growth) {
  let system = 0;
  let tool = 0;
  let code = 0;
  let text = 0;
  for (const message of messages) {
    const tokens = defaultCountTokens(message.text ?? "");
    if (message.contentType === "tool-call" || message.contentType === "tool-result") {
      tool += tokens;
    } else if (message.role === "system") {
      system += tokens;
    } else if ((message.text ?? "").includes("```")) {
      code += tokens;
    } else {
      text += tokens;
    }
  }
  let summaries = 0;
  for (const block of state.blocks) {
    if (block.active) summaries += defaultCountTokens(block.summary);
  }
  return { system, tool, summaries, code, text, total, growth };
}
var EMERGENCY_NUDGE_MAX_PER_TURN = 3;
function buildNudge(agent, env, lastNudgeTurn, emergencyNudges, onEmergencyCapHit) {
  const session = agent.session;
  const state = env.store.stateFor(session);
  const coreMessages = allLogMessages(session);
  const surfaceEvents = surfaceEventsOf(session);
  const surfaceMessages = eventsToCoreMessages(surfaceEvents);
  const tokenCount = measuredTokenCount(agent, surfaceMessages);
  const config = kernelConfigFor(env);
  const turn = env.kernel.processTurn({ messages: coreMessages, state, config, tokenCount });
  env.store.set(session, turn.state);
  const nudge = turn.nudge;
  if (nudge === void 0 || !nudge.shouldInject) return null;
  const mediaPriceOf = meterMediaPriceResolver(agent, session);
  const statusMessages = eventsToCoreMessages(
    surfaceEvents.filter((event) => isCheckpointNode(event) === false)
  );
  nudge.contextBreakdown = computeSurfaceBreakdown(turn.state, statusMessages, tokenCount, nudge.contextBreakdown?.growth ?? 0);
  const emergency = nudge.breakdown?.emergencyOverride === 1;
  const turnNumber = findOpenTurn(sessionEventsOf(session)) ?? 0;
  if (!emergency) {
    if (lastNudgeTurn.get(session.id) === turnNumber) return null;
    lastNudgeTurn.set(session.id, turnNumber);
  } else {
    const record = emergencyNudges.get(session.id);
    if (record !== void 0 && record.turn === turnNumber) {
      if (record.count >= EMERGENCY_NUDGE_MAX_PER_TURN) {
        onEmergencyCapHit?.();
        return null;
      }
      record.count += 1;
    } else {
      emergencyNudges.set(session.id, { turn: turnNumber, count: 1 });
    }
  }
  const text = buildNudgeText(
    nudge,
    emergency,
    session,
    kernelRangeViewOf(nudge, turn.state),
    env.prompts,
    mediaPriceOf
  );
  const message = createUserMessage2({
    content: [{ type: "text", text }],
    // V4 producer kind (issue #163): DSH ≥0.1.7's V4 admission rejects the
    // legacy wrapper shape `{ kind: 'plugin', plugin: … }` outright (a wedged
    // batch fails the NEXT turn with "format v4 message requires a
    // producer-owned source kind"). `plugin:<name>` is exactly what the host's
    // own V3→V4 migration emits for unregistered plugins, and DSH 0.1.5
    // sessions accept it too (probe-verified), so no version gate is needed.
    source: { kind: "plugin:acp-nudge" }
  });
  return { message, emergency };
}
function buildNudgeText(nudge, emergency, session, kernelView, prompts = DEFAULT_RESOLVED, mediaPriceOf) {
  if (prompts.nudge !== DEFAULT_RESOLVED.nudge) {
    return renderNudgeFromTemplates(nudge, emergency, session, kernelView, prompts, mediaPriceOf);
  }
  const rendered = renderNudgeText(nudge);
  return adaptKernelNudgeToSeq(rendered.text, nudge, session, kernelView, prompts, mediaPriceOf);
}
function adaptKernelNudgeToSeq(text, nudge, session, kernelView, prompts, mediaPriceOf) {
  let out = stripNudgeGuidance(text);
  if ((nudge.tier === 2 || nudge.tier === 3) && (nudge.tierTargetBlocks?.length ?? 0) > 0) {
    out = replaceTierTrigger(out, nudge, session, prompts);
  } else if (out.includes('"startId"')) {
    out = replaceEmergencyExample(out);
  }
  const seqTable = rangeTable(session, kernelView, prompts, mediaPriceOf);
  if (seqTable !== "") out = replaceRangesStr(out, seqTable);
  return out;
}
function replaceRangesStr(text, seqTable) {
  const match = text.match(/\n\n(?:Compressible ranges \(|\[No specific ranges detected)/);
  if (!match) return text;
  const start = match.index;
  const rest = text.slice(start + 2);
  const next = rest.match(/\n\n/);
  const end = next !== null ? start + 2 + next.index : text.length;
  const before = text.slice(0, start);
  const after = text.slice(end);
  return before + "\n" + seqTable + after;
}
function replaceTierTrigger(text, nudge, session, prompts) {
  const start = text.search(/\n\n(?:\[TIER \d|\[EMERGENCY — TIER \d)/);
  if (start === -1) return text;
  const rest = text.slice(start + 2);
  const next = rest.match(/\n\nHOW TO COMPRESS/);
  const end = next !== null ? start + 2 + next.index : text.length;
  const targets = nudge.tierTargetBlocks;
  const summarySeqs = targets.map((block) => summarySeqOfKernelBlock(session, block.blockId)).filter((seq) => seq != null).sort((a, b) => a - b);
  const pending = nudge.tier === 2 ? nudge.breakdown?.pendingT2 : nudge.breakdown?.pendingT3;
  const tokens = typeof pending === "number" ? pending : 0;
  const tierValue = nudge.tier === null ? 2 : nudge.tier;
  const tierLine = renderTemplate(prompts.nudge.tier, {
    tier: tierValue,
    count: targets.length,
    prevTier: tierValue - 1,
    tokens,
    seqs: summarySeqs.join(", "),
    firstSeq: summarySeqs[0] ?? "n/a",
    lastSeq: summarySeqs[summarySeqs.length - 1] ?? "n/a"
  });
  return text.slice(0, start) + "\n\n" + tierLine + text.slice(end);
}
function replaceEmergencyExample(text) {
  const start = text.search(/\n\n\{ "topic":/);
  if (start === -1) return text;
  const rest = text.slice(start + 2);
  const next = rest.match(/\n\nCompressible ranges |\n\n\[No specific/);
  const end = next !== null ? start + 2 + next.index : text.length;
  return text.slice(0, start) + "\n\ncompress({ content: [{ startSeq, endSeq, summary }] }) \u2014 use the seqs from the range table above." + text.slice(end);
}
function renderNudgeFromTemplates(nudge, emergency, session, kernelView, prompts, mediaPriceOf) {
  const pct2 = Math.round(Math.min(nudge.contextUsage, 1) * 100);
  const frame = renderTemplate(
    emergency ? prompts.nudge.emergency : prompts.nudge.normal,
    { pct: pct2, philosophy: COMPRESS_PHILOSOPHY }
  );
  const parts = [frame];
  if (nudge.contextBreakdown) {
    const bd = nudge.contextBreakdown;
    const breakdown = renderTemplate(prompts.nudge.breakdown, {
      system: Math.round(bd.system / 1e3),
      tool: Math.round(bd.tool / 1e3),
      summaries: Math.round(bd.summaries / 1e3),
      code: Math.round(bd.code / 1e3),
      text: Math.round(bd.text / 1e3)
    });
    if (breakdown !== "") parts.push("", breakdown);
    if (bd.growth > 0) {
      const growth = renderTemplate(prompts.nudge.growth, { growth: Math.round(bd.growth / 1e3) });
      if (growth !== "") parts.push(growth);
    }
  }
  if (prompts.nudge.guidance !== "") parts.push("", prompts.nudge.guidance);
  if ((nudge.tier === 2 || nudge.tier === 3) && (nudge.tierTargetBlocks?.length ?? 0) > 0) {
    const targets = nudge.tierTargetBlocks;
    const summarySeqs = targets.map((block) => summarySeqOfKernelBlock(session, block.blockId)).filter((seq) => seq != null).sort((a, b) => a - b);
    const pending = nudge.tier === 2 ? nudge.breakdown?.pendingT2 : nudge.breakdown?.pendingT3;
    const tokens = typeof pending === "number" ? pending : 0;
    const tierLine = renderTemplate(prompts.nudge.tier, {
      tier: nudge.tier,
      count: targets.length,
      prevTier: nudge.tier - 1,
      tokens,
      seqs: summarySeqs.join(", "),
      firstSeq: summarySeqs[0] ?? "n/a",
      lastSeq: summarySeqs[summarySeqs.length - 1] ?? "n/a"
    });
    if (tierLine !== "") parts.push(tierLine);
    const tierRules = nudge.tier === 2 ? TIER2_DISTILL_RULES : TIER3_CONDENSE_RULES;
    parts.push("", tierRules);
  } else {
    parts.push(rangeTable(session, kernelView, prompts, mediaPriceOf));
  }
  if (prompts.nudge.tip !== "") parts.push("", prompts.nudge.tip);
  return stripNudgeGuidance(parts.join("\n"));
}

// src/window.ts
var DEFAULT_CONTEXT_WINDOW = 128e3;
function windowSourceLabel(window) {
  if (window.source === "explicit") return "configured";
  if (window.source === "projection") {
    return `session projection current route (auto-refreshes on model switch)`;
  }
  if (window.source === "auto") {
    return `auto-detected from ${window.provider ?? "?"}/${window.model ?? "?"}`;
  }
  if (window.probeFailed === true) return "default (auto-detection failed \u2014 see /acp-prune config)";
  return "default (auto-detection unavailable)";
}
function projectedContextWindow(agent) {
  const projections = agent.ctx?.get?.("sessionProjections");
  const window = projections?.snapshot?.(agent.session)?.values?.contextPressure?.contextWindow;
  if (typeof window === "number" && Number.isInteger(window) && window > 0) return window;
  return null;
}
function liveRoute(agent) {
  let rc;
  try {
    rc = agent.session.requestContext();
  } catch {
    return null;
  }
  if (rc === void 0 || rc === null) return null;
  const { provider, model } = rc;
  if (typeof provider !== "string" || provider === "") return null;
  if (typeof model !== "string" || model === "") return null;
  return { provider, model };
}
function routeFor(agent) {
  const live = liveRoute(agent);
  return {
    provider: live?.provider ?? agent.options.provider ?? "",
    model: live?.model ?? agent.options.model ?? ""
  };
}
async function probeModelWindow(agent, provider, model) {
  const llm = agent.ctx?.get?.("llm");
  if (llm?.resolveModelInfo === void 0) return { contextWindow: null, outputReservation: null };
  try {
    const info = await llm.resolveModelInfo(provider, model);
    const window = info?.context?.contextWindow;
    const cap = info?.defaultMaxTokens;
    return {
      contextWindow: typeof window === "number" && Number.isInteger(window) && window > 0 ? window : null,
      outputReservation: typeof cap === "number" && Number.isInteger(cap) && cap > 0 ? cap : null
    };
  } catch {
    return { contextWindow: null, outputReservation: null };
  }
}
async function detectContextWindow(agent, provider, model) {
  return (await probeModelWindow(agent, provider, model)).contextWindow;
}

// src/tools.ts
function textOutput() {
  return {
    schema: {
      type: "object",
      properties: { text: { type: "string" } },
      additionalProperties: false
    },
    render: (_args, value) => [{ type: "text", text: value.text }]
  };
}
function requireAgent(exec) {
  if (exec.agent === void 0) {
    throw new Error("billion-context-dsh: tool requires an agent execution context");
  }
  return exec.agent;
}
async function resolveEffectiveWindow(env, agent) {
  return env.windowFor === void 0 ? { limit: env.modelContextLimit, source: "explicit" } : await env.windowFor(agent);
}
var compressParameters = {
  // Tolerated wrapped-arguments form: some models emit
  // `{ "arguments": "{\"content\": [...]}" }` (double-nested) or
  // `{ "arguments": { "content": [...] } }` instead of the unwrapped
  // `{ "content": [...] }`. The old DSH validator surfaced this as
  // `invalid arguments: "arguments" must be an object` and the model retried
  // forever. `arguments` is accepted as an optional JSON node so the wrapped
  // shape passes schema validation; `handleCompress` unwraps it and falls back
  // to a clear runtime error when neither form carries content. `content` is
  // intentionally NOT `required: true` — a required property would reject the
  // wrapped shape before `handleCompress` can see it. The tool description
  // still tells the model content is mandatory.
  //
  // The items fields are the opposite case: startSeq/endSeq/summary MUST be
  // `required: true`. Without that, a model call that omits `summary` (only
  // startSeq/endSeq/topic present) passed schema validation and failed late
  // inside the kernel with "Summary is empty" — and live sessions showed the
  // model retrying the identical broken call in a loop. With the fields
  // required, the same call is rejected at the schema gate with
  // `missing required property "content[0].summary"`, which tells the model
  // exactly which field to add (same pattern as decompress's required
  // blockId / search_context's required query).
  arguments: { type: "json", description: "Tolerated wrapped-arguments form (model-generated); unwrapped in handleCompress. Prefer passing content directly." },
  topic: { type: "string", description: "Fallback topic for entries without their own." },
  content: {
    type: "array",
    description: "One or more ranges to compress, each with startSeq/endSeq boundaries (surface seqs) and a dense summary. Required \u2014 pass it directly, not wrapped in an arguments key.",
    items: {
      type: "object",
      properties: {
        startSeq: {
          required: true,
          oneOf: [
            { type: "integer", description: "First surface seq of the range." },
            { type: "string", description: "Seq as text; a trailing #callId fragment is ignored." }
          ]
        },
        endSeq: {
          required: true,
          oneOf: [
            { type: "integer", description: "Inclusive last surface seq of the range." },
            { type: "string", description: "Seq as text; a trailing #callId fragment is ignored." }
          ]
        },
        summary: { type: "string", required: true, description: "Complete technical summary replacing the range; keep paths, decisions, values verbatim. Minimum 50 characters." },
        topic: { type: "string", description: "Short label (3-5 words) for this range." },
        // B3 (2026-09-08 governance plan): the handler and region.ts have
        // accepted verifiedReadings since the plan landed, but the declared
        // parameter schema did not list it — `additionalProperties: false`
        // then rejected every live call that carried it
        // (`invalid arguments: "content[0].verifiedReadings" is not a declared
        // property`), so the structured-loss-stopping field was unreachable
        // from the model's tool interface. Declared here; additionalProperties
        // stays false so unknown fields are still rejected.
        verifiedReadings: {
          type: "array",
          items: { type: "string" },
          description: 'Optional: acceptance readings that are already green before this compression (e.g. "t0-fastpath 8/8", "closedloop 414/414"). Stored structurally on the compaction/summary event and recovered by verifiedReadingsOf, so later steps need not re-run the checks.'
        }
      },
      additionalProperties: false
    }
  }
};
function parseSeq(value) {
  const text = String(value).split("#")[0].trim();
  const seq = Number(text);
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error(`billion-context-dsh: invalid seq "${String(value)}" \u2014 use a surface seq like 295`);
  }
  return seq;
}
var MN_RE = /^m0*(\d{1,5})(?:#.*)?$/i;
function mnRefIndex(value) {
  const match = MN_RE.exec(value.trim());
  if (match === null) return null;
  const index = Number(match[1]);
  return index >= 1 && index <= 99999 ? index : null;
}
function parseBoundary2(value, byRef) {
  const text = String(value);
  const index = mnRefIndex(text);
  if (index === null) return parseSeq(value);
  const ref = `m${String(index).padStart(5, "0")}`;
  const raw = byRef[ref];
  if (raw === void 0) {
    throw new Error(
      `billion-context-dsh: mN "${text}" not found on the current surface \u2014 re-run acp_status for fresh refs (the surface may have moved)`
    );
  }
  const seq = Number(String(raw).split("#")[0]);
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error(
      `billion-context-dsh: mN "${text}" maps to a non-seq id "${raw}" \u2014 re-run acp_status`
    );
  }
  return seq;
}
function unwrapCompressArgs(args) {
  if (args.content !== void 0) return args;
  if (args.arguments === void 0) return null;
  let inner = args.arguments;
  if (typeof inner === "string") {
    try {
      inner = JSON.parse(inner);
    } catch {
      return null;
    }
  }
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return null;
  const content = inner.content;
  if (content === void 0) return null;
  return { ...args, content };
}
function unwrapEnvelope(args) {
  const envelope = args.arguments;
  if (envelope === void 0) return args;
  let inner = envelope;
  if (typeof inner === "string") {
    try {
      inner = JSON.parse(inner);
    } catch {
      return args;
    }
  }
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return args;
  return { ...args, ...inner };
}
function validateContentItems(content) {
  const violations = [];
  content.forEach((item, index) => {
    const path = `content[${index}]`;
    if (item.startSeq === void 0) violations.push(`missing required property "${path}.startSeq"`);
    if (item.endSeq === void 0) violations.push(`missing required property "${path}.endSeq"`);
    if (typeof item.summary !== "string" || item.summary.trim().length === 0) {
      violations.push(`missing required property "${path}.summary"`);
    }
  });
  if (violations.length > 0) throw new ToolArgsError(violations);
}
function guardedRowsInSpan(guarded, shadowed) {
  const inSpan = new Set(shadowed);
  return [...guarded].filter((seq) => inSpan.has(seq)).sort((a, b) => a - b);
}
function protectedRowRejectionNote(start, end, hits, shadowed) {
  const preview = hits.slice(0, 4).join(", ");
  const more = hits.length > 4 ? ` +${hits.length - 4} more` : "";
  const first = shadowed.indexOf(hits[0]);
  const last = shadowed.indexOf(hits[hits.length - 1]);
  const before = first > 0 ? shadowed.slice(0, first) : [];
  const after = last >= 0 && last < shadowed.length - 1 ? shadowed.slice(last + 1) : [];
  const slices = [before, after].filter((slice) => slice.length > 0).map((slice) => `${slice[0]}..${slice[slice.length - 1]}`);
  const recovery = slices.length === 0 ? "no part of this span is compressible while those rows are current \u2014 pick an OLDER span instead (acp_status lists the live ranges)" : `the compressible part of this span is seq ${slices.join(" and ")} \u2014 submit them as separate content entries (or two compress calls), each with its own summary`;
  return `  seqs ${start}..${end} rejected \u2014 the span covers ${hits.length} CURRENT injected instruction row(s) (seq ${preview}${more}); the host re-injects the newest AGENTS.md copy the moment it leaves the surface, so compressing it reclaims nothing \u2014 ${recovery} (older/stale copies of the same file are fine to compress)`;
}
function edgeRefForSeq(session, byRaw, seq, role, oppositeSeq) {
  const nodes = session.surface.nodes;
  let index = -1;
  let oppositeIndex = -1;
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i] === seq) index = i;
    if (nodes[i] === oppositeSeq) oppositeIndex = i;
  }
  if (index < 0 || oppositeIndex < 0) return void 0;
  const direct = anchorRefForNode(session, byRaw, seq, role);
  if (direct !== void 0) return direct;
  const step = role === "start" ? 1 : -1;
  for (let i = index + step; i !== oppositeIndex + step; i += step) {
    const ref = anchorRefForNode(session, byRaw, nodes[i], role);
    if (ref !== void 0) return ref;
  }
  return void 0;
}
function anchorRefForNode(session, byRaw, seq, role) {
  const direct = byRaw[String(seq)];
  if (direct !== void 0) return direct;
  const event = eventAtOf(session, seq);
  if (event?.type !== "assistant/message") return void 0;
  const content = event.data.message?.content;
  const ids = toolCallsOf(content).map((call) => call.id ?? "");
  if (ids.length < 2) return void 0;
  const ordered = role === "start" ? ids : [...ids].reverse();
  for (const id of ordered) {
    const ref = byRaw[`${seq}#${id}`];
    if (ref !== void 0) return ref;
  }
  return void 0;
}
async function handleCompress(env, args, exec) {
  const agent = requireAgent(exec);
  const session = agent.session;
  stripOrphanedSurfaceToolMessages(session, openToolCallIds(session));
  const state = env.store.stateFor(session);
  const coreMessages = allLogMessages(session);
  const surfaceMessages = eventsToCoreMessages(surfaceEventsOf(session));
  const tokenCount = resolveTokenCount(agent, surfaceMessages);
  const window = await resolveEffectiveWindow(env, agent);
  const config = kernelConfigFor({ ...env, modelContextLimit: window.limit });
  const turn = env.kernel.processTurn({ messages: coreMessages, state, config, tokenCount });
  env.store.set(session, turn.state);
  const byRaw = turn.state.messageRefs.byRaw;
  const byRef = turn.state.messageRefs.byRef;
  const unwrapped = unwrapCompressArgs(args);
  if (unwrapped === null) {
    return {
      text: "compress: missing content \u2014 pass the content array directly: compress({ content: [{ startSeq, endSeq, summary }] })"
    };
  }
  args = unwrapped;
  validateContentItems(args.content);
  const ranges = [];
  const alreadyCompressedNotes = [];
  const rejectedNotes = [];
  const guardedSeqs = guardedSurfaceSeqsOf(session);
  for (const range of args.content) {
    const startSeq = parseBoundary2(range.startSeq, byRef);
    const endSeq = parseBoundary2(range.endSeq, byRef);
    let resolved;
    try {
      resolved = resolveSurfaceRange(session, startSeq, endSeq);
    } catch (error) {
      if (error instanceof AlreadyCompressedRangeError) {
        const covering = error.coveringBlockIds;
        const blockNote = covering.length === 0 ? "" : ` (block ${covering[0].slice(0, 8)}${covering.length > 1 ? ` +${covering.length - 1} more` : ""})`;
        alreadyCompressedNotes.push(
          `  seqs ${error.start}..${error.end} already compressed${blockNote} \u2014 nothing to reclaim; decompress to recover the originals`
        );
        continue;
      }
      throw error;
    }
    const shadowedSpan = shadowedSeqsOf(session, resolved.start, resolved.end);
    const instructionHits = guardedRowsInSpan(guardedSeqs, shadowedSpan);
    if (instructionHits.length > 0) {
      rejectedNotes.push(protectedRowRejectionNote(resolved.start, resolved.end, instructionHits, shadowedSpan));
      continue;
    }
    const startBlockRef = blockRefForSummarySeq(session, resolved.start);
    const endBlockRef = blockRefForSummarySeq(session, resolved.end);
    const startRef = startBlockRef ?? edgeRefForSeq(session, byRaw, resolved.start, "start", resolved.end);
    const endRef = endBlockRef ?? edgeRefForSeq(session, byRaw, resolved.end, "end", resolved.start);
    if (startRef === void 0 || endRef === void 0) {
      throw new Error(
        `billion-context-dsh: seq ${resolved.start}..${resolved.end} has no assigned ref \u2014 the range must be on the current surface (run acp_status for the live seq list)`
      );
    }
    ranges.push({
      ...resolved,
      startSeq,
      endSeq,
      startRef,
      endRef,
      // B3：把该段声明的已绿验收读数带上（缺位=不写键）
      ...Array.isArray(range.verifiedReadings) && range.verifiedReadings.length > 0 ? { verifiedReadings: range.verifiedReadings.map(String) } : {},
      summary: range.summary,
      ...(range.topic ?? args.topic) === void 0 ? {} : { topic: range.topic ?? args.topic }
    });
  }
  if (ranges.length === 0) {
    const text = ["Compressed 0 block(s), ~0 tokens reclaimed.", ...alreadyCompressedNotes, ...rejectedNotes];
    if (alreadyCompressedNotes.length > 0) {
      text.push("  (all requested ranges were already compressed \u2014 decompress a block to recover its originals)");
    } else if (rejectedNotes.length > 0) {
      text.push("  (nothing compressed \u2014 every range covered a current injected instruction row; see the rejections above)");
    }
    return { text: text.join("\n") };
  }
  const applied = env.kernel.applyCompression({
    ranges: ranges.map(({ startRef, endRef, summary, topic }) => ({ startRef, endRef, summary, topic })),
    messages: coreMessages,
    state: turn.state,
    config
    // Deliberately NOT overriding protectedMessageIds: with the full log the
    // kernel's recent/last-user protection is computed over the same
    // non-block-covered messages as the visible feed, so default behavior is
    // preserved. Any 'Excluded N protected message(s)' warning is surfaced.
  });
  if (applied.result.errors.length > 0 && applied.result.blocksCreated === 0) {
    return { text: `compress failed: ${applied.result.errors.join("; ")}` };
  }
  env.store.set(session, applied.state);
  if (applied.result.blocksCreated > 0) {
    env.compressCallIdsToHide?.add(exec.callId);
  }
  const previousIds = new Set(turn.state.blocks.map((block) => block.blockId));
  const newBlocks = applied.state.blocks.filter((block) => !previousIds.has(block.blockId));
  const blockByRangeKey = new Map(newBlocks.map((block) => [`${block.startRef}::${block.endRef}`, block]));
  const warningByRangeKey = /* @__PURE__ */ new Map();
  const freeWarnings = [];
  for (const warning of applied.result.warnings) {
    const match = /^Skipped range \((.+?)\.\.(.+?)\)/.exec(warning);
    if (match !== null) {
      const key = `${match[1]}::${match[2]}`;
      const list = warningByRangeKey.get(key) ?? [];
      list.push(warning);
      warningByRangeKey.set(key, list);
    } else {
      freeWarnings.push(warning);
    }
  }
  const lines = [];
  let skippedRanges = 0;
  for (const range of ranges) {
    const key = `${range.startRef}::${range.endRef}`;
    const block = blockByRangeKey.get(key);
    if (block === void 0) {
      skippedRanges += 1;
      const warnings = warningByRangeKey.get(key) ?? [];
      for (const warning of warnings) lines.push(`  ${warning}`);
      continue;
    }
    const { start, end } = range;
    const shadowed = shadowedSeqsOf(session, start, end);
    const shadowedTokens = shadowedTokensViaMeter(session, shadowed, agent.ctx);
    const tier = block.tier === 2 || block.tier === 3 ? block.tier : 1;
    const parentBlockIds = compactionIdsOfKernelBlocks(session, block.directBlockIds);
    const { provider, model } = routeFor(agent);
    const { compactionId } = runCompactionTransaction(session, {
      start,
      end,
      shadowedSeqs: shadowed,
      summary: [{ type: "text", text: range.summary }],
      shadowedTokenCount: shadowedTokens,
      provider,
      model,
      tier,
      kernelBlockId: block.blockId,
      ...range.topic === void 0 ? {} : { topic: range.topic },
      ...parentBlockIds.length === 0 ? {} : { parentBlockIds },
      // Record the kernel block's raw coverage so a restarted engine
      // rehydrates the SAME effective messages (a tier-2 block's coverage is
      // its parents' originals, not the checkpoint node).
      directMessageIds: block.directMessageIds,
      effectiveMessageIds: block.effectiveMessageIds,
      // B3：已绿验收读数随压缩块落盘（缺位=不写键）
      ...range.verifiedReadings === void 0 ? {} : { verifiedReadings: range.verifiedReadings }
    });
    const adjusted = start !== range.startSeq || end !== range.endSeq;
    const tierLabel2 = `, tier ${tier}`;
    const readingsLabel = range.verifiedReadings !== void 0 && range.verifiedReadings.length > 0 ? `, verified: ${range.verifiedReadings.join("; ")}` : "";
    const note = range.recovered === true ? ` (seqs ${range.startSeq}..${range.endSeq} were already shadowed \u2014 compressed the live remainder ${start}..${end})` : adjusted ? ` (adjusted from ${range.startSeq}..${range.endSeq} to balanced edges)` : "";
    lines.push(
      `  block ${compactionId.slice(0, 8)}: seqs ${start}..${end}, ${shadowed.length} messages shadowed${tierLabel2}${readingsLabel}${note}`
    );
  }
  const summaryLine = `Compressed ${applied.result.blocksCreated} block(s), ~${applied.result.tokensCompressed} tokens reclaimed.`;
  const totalSkipped = skippedRanges + alreadyCompressedNotes.length + rejectedNotes.length;
  const failedLines = applied.result.errors.map((error) => `  ${error}`);
  const warningLines = [
    ...freeWarnings.map((warning) => `  ${warning}`),
    ...failedLines,
    ...alreadyCompressedNotes,
    ...rejectedNotes,
    ...lines
  ];
  const footer = totalSkipped > 0 ? `  (${totalSkipped} range(s) skipped or failed \u2014 see above)` : "";
  return { text: `${summaryLine}
${[...warningLines, footer].filter((line) => line !== "").join("\n")}` };
}
var decompressParameters = {
  blockId: { type: "string", required: true, description: "Block id: the kernel block ref `bN` shown by acp_status (e.g. b1), or a compaction id / prefix from search_context." },
  offset: { type: "integer", description: "Start position in the block's message list (default 0). Blocks are paged by size \u2014 each page stays under the host tool-result trim budget (up to 100 messages) \u2014 so follow the continue hint in the result to walk the rest." },
  limit: { type: "integer", description: "Messages per page (default 100; values above 100 are capped to 100). Pages are also bounded by a character budget, so long messages return fewer than this per call." }
};
function resolveBlockId(session, arg) {
  const byKernelRef = blockIdOfKernelRef(session, arg);
  if (byKernelRef !== null) return byKernelRef;
  const ledger = rebuildBlockLedger(sessionEventsOf(session));
  const byPrefix = ledger.find((entry) => entry.blockId.startsWith(arg));
  return byPrefix?.blockId ?? null;
}
function handleDecompress(_env, rawArgs, exec) {
  const args = unwrapEnvelope(rawArgs);
  const session = requireAgent(exec).session;
  const blockId = resolveBlockId(session, args.blockId);
  if (blockId === null) {
    return { text: `decompress: block "${args.blockId}" not found (see acp_status for the block list)` };
  }
  const ledger = rebuildBlockLedger(sessionEventsOf(session));
  const block = ledger.find((entry) => entry.blockId === blockId);
  if (block === void 0) {
    return { text: `decompress: block "${args.blockId}" not found (see acp_status for the block list)` };
  }
  const expanded = expandShadowedSeqs(session, block.blockId);
  const page = sliceDecompressPage(
    expanded,
    args.offset ?? 0,
    args.limit ?? DEFAULT_DECOMPRESS_PAGE,
    DEFAULT_DECOMPRESS_PAGE_CHARS,
    (seq) => {
      const event = eventAtOf(session, seq);
      const text = event === void 0 ? "" : extractEventText(event);
      return text.length === 0 ? 0 : `[seq ${seq}] ${text}`.length;
    }
  );
  if (page.total === 0 || page.seqs.length === 0) {
    const where = page.total === 0 ? "" : ` has ${page.total} messages; offset ${page.offset} is past the end \u2014 use an offset below ${page.total}, or omit it`;
    return { text: page.total === 0 ? `Block ${block.blockId} \u2014 ${block.summary}

(no recoverable content)` : `decompress: block ${block.blockId}${where}` };
  }
  const parts = [];
  for (const seq of page.seqs) {
    const event = eventAtOf(session, seq);
    const text = event === void 0 ? "" : extractEventText(event);
    if (text.length > 0) parts.push(`[seq ${seq}] ${text}`);
  }
  const tierNote = block.tier > 1 ? ` (tier ${block.tier}, distills ${block.parentBlockIds.length} block(s))` : "";
  const lines = [];
  lines.push(`[messages ${page.offset + 1}..${page.offset + page.seqs.length} of ${page.total}]`);
  if (!page.exhausted) lines.push(`More available \u2014 continue with decompress({ blockId: "${block.blockId}", offset: ${page.offset + page.seqs.length} })`);
  return {
    text: `Block ${block.blockId} \u2014 ${block.summary}${tierNote}

${lines.join("\n")}

${parts.join("\n\n") || "(no text content on this page)"}`
  };
}
var searchParameters = {
  query: { type: "string", required: true, description: "Search terms to find inside compressed blocks." },
  limit: { type: "integer", description: "Maximum results (default 5)." }
};
function roleOfEvent(event) {
  switch (event.type) {
    case "user/message":
      return "user";
    case "assistant/message":
      return "assistant";
    case "tool/result":
      return "tool";
    default:
      return null;
  }
}
var searchDocsCache = /* @__PURE__ */ new WeakMap();
function buildSearchDocs(session) {
  const events = sessionEventsOf(session);
  const cached = searchDocsCache.get(events);
  if (cached !== void 0) return cached;
  const ledger = rebuildBlockLedger(events);
  const docs = [];
  const claimed = /* @__PURE__ */ new Set();
  for (const block of ledger) {
    docs.push({
      kind: "block",
      ref: block.blockId,
      text: block.summary,
      title: block.summary.slice(0, 60) || block.blockId,
      blockId: block.blockId,
      tier: block.tier,
      tokens: defaultCountTokens(block.summary)
    });
    for (const seq of expandShadowedSeqs(session, block.blockId)) {
      if (claimed.has(seq)) continue;
      claimed.add(seq);
      const event = eventAtOf(session, seq);
      if (event === void 0) continue;
      const role = roleOfEvent(event);
      const text = extractEventText(event);
      if (role === null || text.length === 0) continue;
      docs.push({
        kind: "message",
        ref: `seq ${seq}`,
        text,
        title: `${role}: ${text.slice(0, 60)}`,
        role,
        blockId: block.blockId,
        tier: block.tier,
        tokens: defaultCountTokens(text)
      });
    }
  }
  searchDocsCache.set(events, docs);
  return docs;
}
function handleSearch(_env, rawArgs, exec) {
  const args = unwrapEnvelope(rawArgs);
  const session = requireAgent(exec).session;
  if (args.query.trim() === "") return { text: "search_context: empty query (no matches)" };
  const docs = buildSearchDocs(session);
  const results = searchBlocks(docs, args.query, { limit: args.limit ?? 5, previewLength: 160 });
  if (results.length === 0) return { text: `search_context: no matches for "${args.query}"` };
  const lines = results.map((r) => {
    const kind = r.kind === "block" ? `block ${r.ref}` : `message ${r.ref} (${r.role ?? "?"}, in block ${r.blockId ?? "?"})`;
    return `  - ${kind} (score ${r.score.toFixed(2)}): ${r.preview}`;
  });
  return {
    text: `Matches for "${args.query}":
${lines.join("\n")}

Decompress with: decompress({ blockId })`
  };
}
var statusParameters = {
  scope: {
    type: "string",
    enum: ["compressed", "uncompressed"],
    description: 'Drilldown scope: "compressed" lists compressed blocks, "uncompressed" lists visible messages. Omit for the overview.'
  },
  view: {
    type: "string",
    enum: ["ranges", "messages"],
    description: 'Drilldown view under scope:"uncompressed": "ranges" merges visible messages into ranges (default), "messages" lists every message.'
  },
  tool: {
    type: "string",
    description: 'Filter drilldown rows to one tool name (scope:"uncompressed" + view:"messages" only).'
  },
  sort: {
    type: "string",
    enum: ["size", "time", "tool", "age"],
    description: 'Row order: size (default, most tokens first), time, tool; "age" applies to compressed blocks.'
  },
  limit: {
    type: "integer",
    description: "Cap on rows or blocks shown (default 30)."
  }
};
async function handleStatus(env, rawArgs, exec) {
  const args = unwrapEnvelope(rawArgs);
  const agent = requireAgent(exec);
  const session = agent.session;
  const state = env.store.stateFor(session);
  const surface = surfaceEventsOf(session);
  const toolNames = buildToolCallIndex(surface);
  const coreMessages = allLogMessages(session);
  const surfaceMessages = eventsToCoreMessages(surface, toolNames);
  const tokenCount = resolveTokenCount(agent, surfaceMessages);
  const window = await resolveEffectiveWindow(env, agent);
  const config = kernelConfigFor({ ...env, modelContextLimit: window.limit });
  const turn = env.kernel.processTurn({ messages: coreMessages, state, config, tokenCount });
  const statusMessages = eventsToCoreMessages(
    surface.filter((event) => isCheckpointNode(event) === false),
    toolNames
  );
  const report = buildStatusReport(turn.state, statusMessages, defaultCountTokens, args);
  const lines = [report];
  if (args.scope === void 0) {
    const nudge = turn.nudge;
    if (nudge !== void 0) {
      lines.push("", `Nudge: ${nudge.shouldInject ? "ACTIVE" : "idle"} \u2014 ${nudge.reason}`);
    }
    const checkpointRows = blockRegistry(session).filter((entry) => entry.active && entry.summarySeq !== null).map((entry) => `${entry.kernelBlockId} \u2192 seq ${entry.summarySeq}`);
    if (checkpointRows.length > 0) {
      lines.push("", `Checkpoint seqs (active blocks \u2014 compress a checkpoint seq to distill it): ${checkpointRows.join(", ")}`);
    }
    const mediaOnSurface = surface.some((event) => {
      const counts = attachmentsOfEvent(event);
      return counts.images + counts.files > 0;
    });
    if (mediaOnSurface) {
      lines.push(
        "",
        "Note: the pressure line is provider-anchored (images/files priced by the live route); the breakdown above is a text-only estimate. They can differ on media-heavy sessions."
      );
    }
  }
  lines.push("", `Surface: ${surfaceSummary(session)}`);
  if (args.scope === "uncompressed") {
    lines.push("", "Note: drilldown rows are kernel refs (mN) \u2014 feed them straight to compress (auto-mapped to the live surface seq); an unknown mN fails with guidance.");
  }
  return { text: lines.join("\n") };
}
function makeTools(env) {
  const prompts = env.prompts ?? DEFAULT_RESOLVED;
  return [
    defineTool({
      name: "compress",
      description: prompts.tools.compress,
      parameters: compressParameters,
      output: textOutput(),
      async execute(args, exec) {
        return handleCompress(env, args, exec);
      }
    }),
    defineTool({
      name: "decompress",
      description: prompts.tools.decompress,
      parameters: decompressParameters,
      output: textOutput(),
      execute(args, exec) {
        return Promise.resolve(handleDecompress(env, args, exec));
      }
    }),
    defineTool({
      name: "search_context",
      description: prompts.tools.searchContext,
      parameters: searchParameters,
      output: textOutput(),
      execute(args, exec) {
        return Promise.resolve(handleSearch(env, args, exec));
      }
    }),
    defineTool({
      name: "acp_status",
      description: prompts.tools.acpStatus,
      parameters: statusParameters,
      output: textOutput(),
      execute(args, exec) {
        return handleStatus(env, args, exec);
      }
    })
  ];
}

// src/commands.ts
import { SettingsConflictError } from "@deepseek-ai/dsh-settings";

// src/settings.ts
import z from "@deepseek-ai/schemastery";
var ACP_SETTINGS_NAMESPACE = "compaction-acp";
var SETTINGS_KEYS = [
  "modelContextLimit",
  "autoModelContextLimit",
  "nudgeMinContextLimitPct",
  "nudgeMaxContextLimitPct",
  "nudgeEmergencyThresholdPct",
  "autoNudge"
];
var SETTING_DEFAULTS = {
  autoModelContextLimit: true,
  nudgeMaxContextLimitPct: 0.7,
  nudgeEmergencyThresholdPct: 0.85,
  autoNudge: true
};
function filterSettingsEntry(entry) {
  return {
    ...entry.modelContextLimit !== void 0 ? { modelContextLimit: entry.modelContextLimit } : {},
    ...entry.autoModelContextLimit !== void 0 ? { autoModelContextLimit: entry.autoModelContextLimit } : {},
    ...entry.nudgeMinContextLimitPct !== void 0 ? { nudgeMinContextLimitPct: entry.nudgeMinContextLimitPct } : {},
    ...entry.nudgeMaxContextLimitPct !== void 0 ? { nudgeMaxContextLimitPct: entry.nudgeMaxContextLimitPct } : {},
    ...entry.nudgeEmergencyThresholdPct !== void 0 ? { nudgeEmergencyThresholdPct: entry.nudgeEmergencyThresholdPct } : {},
    ...entry.autoNudge !== void 0 ? { autoNudge: entry.autoNudge } : {}
  };
}
function resolveAcpSettings(input) {
  return {
    modelContextLimit: input.modelContextLimit,
    autoModelContextLimit: input.autoModelContextLimit ?? SETTING_DEFAULTS.autoModelContextLimit,
    nudgeMinContextLimitPct: input.nudgeMinContextLimitPct,
    nudgeMaxContextLimitPct: input.nudgeMaxContextLimitPct ?? SETTING_DEFAULTS.nudgeMaxContextLimitPct,
    nudgeEmergencyThresholdPct: input.nudgeEmergencyThresholdPct ?? SETTING_DEFAULTS.nudgeEmergencyThresholdPct,
    autoNudge: input.autoNudge ?? SETTING_DEFAULTS.autoNudge
  };
}
var AcpSettingsSchema = z.object({
  modelContextLimit: z.number().step(1).min(1),
  autoModelContextLimit: z.boolean().default(SETTING_DEFAULTS.autoModelContextLimit),
  nudgeMinContextLimitPct: z.number().min(0).max(1),
  nudgeMaxContextLimitPct: z.number().min(0).max(1).default(SETTING_DEFAULTS.nudgeMaxContextLimitPct),
  nudgeEmergencyThresholdPct: z.number().min(0).max(1).default(SETTING_DEFAULTS.nudgeEmergencyThresholdPct),
  autoNudge: z.boolean().default(SETTING_DEFAULTS.autoNudge)
});
function describeSettingsChange(prev, next) {
  const warnings = [];
  if (next.nudgeMinContextLimitPct !== void 0 && next.nudgeMinContextLimitPct >= next.nudgeMaxContextLimitPct) {
    warnings.push(
      `nudgeMinContextLimitPct (${next.nudgeMinContextLimitPct}) >= nudgeMaxContextLimitPct (${next.nudgeMaxContextLimitPct}) \u2014 the lower bound never engages`
    );
  }
  if (next.nudgeMaxContextLimitPct >= next.nudgeEmergencyThresholdPct) {
    warnings.push(
      `nudgeMaxContextLimitPct (${next.nudgeMaxContextLimitPct}) >= nudgeEmergencyThresholdPct (${next.nudgeEmergencyThresholdPct}) \u2014 the emergency tier loses its headroom`
    );
  }
  return {
    clearWindowCache: prev.modelContextLimit !== next.modelContextLimit || prev.autoModelContextLimit !== next.autoModelContextLimit,
    clearNudgeDedup: prev.autoNudge === false && next.autoNudge === true,
    warnings
  };
}
function parseSettingValue(raw) {
  const text = raw.trim();
  if (text === "true") return { ok: true, value: true };
  if (text === "false") return { ok: true, value: false };
  const num = Number(text);
  if (text !== "" && Number.isFinite(num)) return { ok: true, value: num };
  if (text === "null") return { ok: true, value: null };
  return {
    ok: false,
    reason: `"${text}" is not a valid value \u2014 use a number (0.65), true/false, or null to reset the key`
  };
}
function requireService(getService) {
  const service = getService();
  if (service === void 0) {
    throw new Error("runtime settings are not available in this process");
  }
  return service;
}
function makeSettingsCommandSurface(getService, getSnapshot) {
  return {
    get available() {
      return getService() !== void 0;
    },
    snapshot: getSnapshot,
    describe() {
      const service = getService();
      if (service === void 0) return void 0;
      return service.describe().find((descriptor) => String(descriptor.ns) === ACP_SETTINGS_NAMESPACE);
    },
    async update(patch) {
      await requireService(getService).update(ACP_SETTINGS_NAMESPACE, patch);
    },
    async replaceSection(section) {
      await requireService(getService).replace(ACP_SETTINGS_NAMESPACE, section);
    }
  };
}

// src/presets.ts
var PRESET_NAMES = [
  "preserve",
  "relaxed",
  "balanced",
  "efficient",
  "aggressive"
];
var PRESETS = {
  preserve: {
    label: "keep context as long as possible \u2014 nudge only close to the limit",
    nudgeMinContextLimitPct: 0.55,
    nudgeMaxContextLimitPct: 0.78,
    nudgeEmergencyThresholdPct: 0.93
  },
  relaxed: {
    label: "light-touch compression \u2014 nudges a little earlier than preserve",
    nudgeMinContextLimitPct: 0.5,
    nudgeMaxContextLimitPct: 0.75,
    nudgeEmergencyThresholdPct: 0.9
  },
  balanced: {
    // == the current out-of-the-box engine defaults (kernel min 0.45, engine
    // max 0.70, engine emergency 0.85): choosing this changes nothing vs today.
    label: "default balance \u2014 the same thresholds the plugin ships with",
    nudgeMinContextLimitPct: 0.45,
    nudgeMaxContextLimitPct: 0.7,
    nudgeEmergencyThresholdPct: 0.85
  },
  efficient: {
    label: "trim more often \u2014 favors low token usage over keeping full history",
    nudgeMinContextLimitPct: 0.4,
    nudgeMaxContextLimitPct: 0.6,
    nudgeEmergencyThresholdPct: 0.78
  },
  aggressive: {
    label: "lean context \u2014 compresses early and frequently",
    nudgeMinContextLimitPct: 0.3,
    nudgeMaxContextLimitPct: 0.5,
    nudgeEmergencyThresholdPct: 0.7
  }
};
function isPresetName(value) {
  return typeof value === "string" && PRESET_NAMES.includes(value);
}
function resolvePreset(name) {
  if (!isPresetName(name)) {
    throw new Error(`unknown preset "${name}" \u2014 valid presets: ${PRESET_NAMES.join(", ")}`);
  }
  return PRESETS[name];
}

// src/commands.ts
async function statusText(env, agent) {
  const session = agent.session;
  const ledger = rebuildBlockLedger(sessionEventsOf(session));
  const totalTokens = ledger.reduce((sum, block) => sum + block.shadowedTokenCount, 0);
  const coreMessages = allLogMessages(session);
  const surfaceMessages = eventsToCoreMessages(surfaceEventsOf(session));
  const estimated = resolveTokenCount(agent, surfaceMessages);
  const window = await resolveEffectiveWindow(env, agent);
  const limit = window.limit;
  const windowLine = window.rawLimit !== void 0 && window.outputReserved !== void 0 ? `  context window: ${limit} (raw ${window.rawLimit} \u2212 ${window.outputReserved} output reservation; ${windowSourceLabel(window)})` : `  context window: ${limit} (${windowSourceLabel(window)})`;
  const lines = [
    `ACP status \u2014 session ${session.id}`,
    `  blocks: ${ledger.length}`,
    `  tokens compressed: ${totalTokens}`,
    `  estimated context: ${estimated} / ${limit} (${Math.round(estimated / limit * 100)}%)`,
    windowLine
  ];
  if (env.preset !== void 0) {
    const ov = env.coreOverrides?.nudge;
    const pct2 = (value) => `${Math.round((value ?? 0) * 100)}%`;
    lines.push(
      `  preset: ${env.preset} (${PRESETS[env.preset].label}) [min ${pct2(ov?.minContextLimitPct ?? env.nudgeMinContextLimitPct)} \xB7 max ${pct2(ov?.maxContextLimitPct ?? env.nudgeMaxContextLimitPct)} \xB7 emergency ${pct2(ov?.emergencyThresholdPct ?? env.nudgeEmergencyThresholdPct)}]`
    );
  }
  if (window.probeFailed === true) {
    lines.push(`  \u26A0 window auto-detection failed \u2014 using the ${limit} fallback (change modelContextLimit or autoModelContextLimit via /acp-prune config \u2014 or restart \u2014 to re-probe)`);
  }
  const state = structuredClone(env.store.stateFor(session));
  const config = kernelConfigFor({ ...env, modelContextLimit: limit });
  const turn = env.kernel.processTurn({ messages: coreMessages, state, config, tokenCount: estimated });
  const nudge = turn.nudge;
  if (nudge !== void 0) {
    const label = nudge.shouldInject ? nudge.tier !== null ? `ACTIVE [T${nudge.tier}]` : "ACTIVE" : "idle";
    lines.push(`  nudge: ${label} \u2014 ${nudge.reason}`);
    if (!nudge.shouldInject) {
      const maxPct = config.nudge.maxContextLimitPct;
      const toNudge = Math.max(0, Math.round(maxPct * limit - estimated));
      lines.push(`  next nudge: ~${toNudge.toLocaleString()} tokens to go (usage ${Math.round(nudge.contextUsage * 100)}% \u2192 ${Math.round(maxPct * 100)}% line)`);
    }
  }
  for (const block of ledger) {
    const tier = block.tier > 1 ? ` [T${block.tier}]` : "";
    lines.push(`  - ${block.blockId.slice(0, 8)}${tier}: seqs ${block.start}..${block.end} \u2014 ${block.summary.slice(0, 80)}`);
  }
  return lines.join("\n");
}
function compressText(env, agent, args) {
  if (args.length < 3) {
    return "/acp-prune compress <startSeq> <endSeq> <summary...>";
  }
  const startSeq = Number(args[0]);
  const endSeq = Number(args[1]);
  const summary = args.slice(2).join(" ");
  if (!Number.isInteger(startSeq) || !Number.isInteger(endSeq)) {
    return "/acp-prune compress: startSeq and endSeq must be integers";
  }
  const session = agent.session;
  const { start, end } = resolveSurfaceRange(session, startSeq, endSeq);
  if (blockRefForSummarySeq(session, start) !== null || blockRefForSummarySeq(session, end) !== null) {
    return "/acp-prune compress: the range touches a compressed block summary node \u2014 distill it with the compress tool (seq-based batch), not /acp-prune compress";
  }
  const shadowed = shadowedSeqsOf(session, start, end);
  const instructionHits = guardedRowsInSpan(guardedSurfaceSeqsOf(session), shadowed);
  if (instructionHits.length > 0) {
    return protectedRowRejectionNote(start, end, instructionHits, shadowed);
  }
  const shadowedTokens = shadowedTokensViaMeter(session, shadowed, agent.ctx);
  const { provider, model } = routeFor(agent);
  const { compactionId } = runCompactionTransaction(session, {
    start,
    end,
    shadowedSeqs: shadowed,
    summary: [{ type: "text", text: summary }],
    shadowedTokenCount: shadowedTokens,
    provider,
    model
  });
  return `Compressed seqs ${start}..${end} (${shadowed.length} messages) as block ${compactionId.slice(0, 8)}`;
}
var DECOMPRESS_USAGE = "/acp-prune decompress <blockId> [offset] [limit]";
function decompressText(_env, agent, args) {
  if (args.length < 1) return DECOMPRESS_USAGE;
  const offset = args[1] === void 0 ? 0 : Number(args[1]);
  if (!Number.isInteger(offset) || offset < 0) return `${DECOMPRESS_USAGE} \u2014 offset must be a non-negative integer`;
  const limit = args[2] === void 0 ? DEFAULT_DECOMPRESS_PAGE : Number(args[2]);
  if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_DECOMPRESS_PAGE) return `${DECOMPRESS_USAGE} \u2014 limit must be an integer between 1 and ${DEFAULT_DECOMPRESS_PAGE}`;
  const session = agent.session;
  const blockId = blockIdOfKernelRef(session, args[0]);
  const ledger = rebuildBlockLedger(sessionEventsOf(session));
  const block = blockId === null ? ledger.find((entry) => entry.blockId.startsWith(args[0])) : ledger.find((entry) => entry.blockId === blockId);
  if (block === void 0) return `block "${args[0]}" not found (see /acp-prune status)`;
  const expanded = expandShadowedSeqs(session, block.blockId);
  const page = sliceDecompressPage(
    expanded,
    offset,
    limit,
    DEFAULT_DECOMPRESS_PAGE_CHARS,
    (seq) => extractEventText(eventAtOf(session, seq)).length
  );
  if (page.seqs.length === 0) {
    if (page.total === 0) return `Block ${block.blockId} \u2014 ${block.summary}

(no recoverable content)`;
    return `block ${block.blockId} has ${page.total} messages; offset ${offset} is past the end \u2014 use an offset below ${page.total}`;
  }
  const parts = page.seqs.map((seq) => extractEventText(eventAtOf(session, seq))).filter((text) => text.length > 0);
  const lines = [
    `Block ${block.blockId} \u2014 ${block.summary}`,
    `[messages ${page.offset + 1}..${page.offset + page.seqs.length} of ${page.total}]`
  ];
  if (!page.exhausted) lines.push(`Continue with: /acp-prune decompress ${block.blockId.slice(0, 8)} ${page.offset + page.seqs.length}`);
  lines.push("", parts.join("\n\n") || "(no recoverable content)");
  return lines.join("\n");
}
function acpCommand(env) {
  return {
    name: "acp-prune",
    description: "Active Context Pruning \u2014 model-driven context compression. Usage: /acp-prune status | /acp-prune compress <startSeq> <endSeq> <summary> | /acp-prune decompress <blockId> [offset] [limit] | /acp-prune config [list|set <key> <value>|reset <key>|all]",
    handler: async (invocation) => {
      const raw = invocation.rawInput.trim();
      if (raw === "" || raw === "status") {
        return { kind: "success", text: await statusText(env, invocation.agent) };
      }
      if (raw === "config" || raw.startsWith("config ")) {
        return { kind: "success", text: await configText(env, raw.slice("config".length).trim()) };
      }
      if (raw.startsWith("compress")) {
        return { kind: "success", text: compressText(env, invocation.agent, raw.slice("compress".length).trim().split(/\s+/)) };
      }
      if (raw.startsWith("decompress")) {
        return { kind: "success", text: decompressText(env, invocation.agent, raw.slice("decompress".length).trim().split(/\s+/)) };
      }
      return { kind: "error", text: `unknown /acp-prune subcommand "${raw.split(/\s+/)[0]}" \u2014 use status | compress | decompress | config` };
    }
  };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSettingsKey(key) {
  return SETTINGS_KEYS.includes(key);
}
function settingsWriteFailure(error) {
  if (error instanceof SettingsConflictError) {
    return "conflict: another writer changed this setting at the same time \u2014 run /acp-prune config again";
  }
  return `rejected: ${String(error)}`;
}
function formatSettingsValue(key, value) {
  if (value === void 0) {
    if (key === "modelContextLimit") return "auto";
    if (key === "nudgeMinContextLimitPct") return "0.45 (kernel)";
    return "\u2014";
  }
  return String(value);
}
function configListText(surface) {
  if (surface === void 0) return "runtime settings are not wired in this engine build";
  const snapshot = surface.snapshot();
  const descriptor = surface.describe();
  const lines = [
    'ACP runtime settings \u2014 namespace "compaction-acp"',
    "  key                         value        source"
  ];
  for (const key of SETTINGS_KEYS) {
    const userSection = isRecord(descriptor?.user) ? descriptor.user : {};
    const baseSection = isRecord(descriptor?.base) ? descriptor.base : {};
    const source = key in userSection ? "user" : key in baseSection ? "base" : "default";
    lines.push(`  ${key.padEnd(27)} ${formatSettingsValue(key, snapshot[key]).padEnd(12)} ${source}`);
  }
  lines.push("", "  changes apply to running sessions immediately (no restart)");
  lines.push("  coreOverrides (composition layer) merge LAST and beat these values on same-name keys");
  lines.push("  /acp-prune config reset <key> returns the key to the composition row / engine default");
  return lines.join("\n");
}
async function configSetText(surface, key, rawValue) {
  if (!isSettingsKey(key)) {
    return `unknown key "${key}" \u2014 keys: ${SETTINGS_KEYS.join(", ")}`;
  }
  if (surface === void 0) return "runtime settings are not wired in this engine build";
  if (!surface.available) {
    return "no settings provider in this process \u2014 edit the compaction-acp row in cordis.patch.yml instead (a restart applies it)";
  }
  const parsed = parseSettingValue(rawValue);
  if (!parsed.ok) return parsed.reason;
  if (parsed.value === null) {
    return configResetText(surface, key);
  }
  if ((key === "autoNudge" || key === "autoModelContextLimit") && typeof parsed.value !== "boolean") {
    return `${key} takes true or false (got "${String(parsed.value)}")`;
  }
  const patch = key === "autoNudge" || key === "autoModelContextLimit" ? { [key]: parsed.value } : { [key]: parsed.value };
  try {
    await surface.update(patch);
  } catch (error) {
    return settingsWriteFailure(error);
  }
  const windowNote = key === "modelContextLimit" || key === "autoModelContextLimit" ? "\n  window cache cleared \u2014 the next step re-resolves the context window" : "";
  return `\u2713 ${key} = ${String(parsed.value)} \u2014 applied to running sessions${windowNote}`;
}
async function configResetText(surface, target) {
  if (surface === void 0) return "runtime settings are not wired in this engine build";
  if (!surface.available) {
    return "no settings provider in this process \u2014 edit the compaction-acp row in cordis.patch.yml instead (a restart applies it)";
  }
  if (target === "all") {
    try {
      await surface.replaceSection({});
    } catch (error) {
      return settingsWriteFailure(error);
    }
    return "\u2713 all runtime settings reset \u2014 values now come from the composition row / engine defaults";
  }
  if (!isSettingsKey(target)) {
    return `unknown key "${target}" \u2014 keys: ${SETTINGS_KEYS.join(", ")}`;
  }
  const descriptor = surface.describe();
  const userSection = isRecord(descriptor?.user) ? { ...descriptor.user } : {};
  delete userSection[target];
  try {
    await surface.replaceSection(userSection);
  } catch (error) {
    return settingsWriteFailure(error);
  }
  const baseSection = isRecord(descriptor?.base) ? descriptor.base : {};
  const baseValue = baseSection[target];
  return `\u2713 ${target} reset \u2014 it now reads ${baseValue === void 0 ? "the engine default" : `the composition value ${String(baseValue)}`}`;
}
async function configText(env, rest) {
  const surface = env.settingsCommand;
  const args = rest.split(/\s+/).filter((part) => part.length > 0);
  const verb = args[0] ?? "list";
  if (verb === "list") return configListText(surface);
  if (verb === "set") {
    if (args.length < 3) return "usage: /acp-prune config set <key> <value> (e.g. /acp-prune config set nudgeMaxContextLimitPct 0.72)";
    return configSetText(surface, args[1], args.slice(2).join(" "));
  }
  if (verb === "reset") {
    return configResetText(surface, args[1] ?? "all");
  }
  return `unknown /acp-prune config verb "${verb}" \u2014 use list | set <key> <value> | reset <key>|all`;
}

// src/system-prompt.ts
var ACP_SYSTEM_PROMPT = renderSystemPrompt(DEFAULT_PROMPTS);
var ACP_SYSTEM_PROMPT_ORDER = 150;

// src/index.ts
var DEFAULT_CONFIG = {
  autoModelContextLimit: true,
  autoTools: true,
  autoCommand: true,
  autoNudge: true,
  // Same default as the host's compaction-basic policy: one owned retry per
  // unrelieved overflow, then the original error is preserved.
  maxOverflowRetries: 1,
  // Nudge thresholds: engine defaults 0.70/0.85 — deliberately below the
  // kernel/billion-context-pi 0.75/0.95. 0.95 leaves no room to act before
  // the API rejects, and the host's compaction-basic line (thresholdRatio
  // 0.80) shadows it in standard/code/cordis modes; 0.70 keeps the forced
  // over-limit nudge ahead of that 80% line. Explicit values always win
  // against these defaults — `coreOverrides` merges last and beats them on
  // same-name keys.
  nudgeMaxContextLimitPct: 0.7,
  nudgeEmergencyThresholdPct: 0.85
};
function resolveAcpConfig(config = {}) {
  const resolved = resolvePresetThresholds({ ...DEFAULT_CONFIG, ...config }, config);
  assertNudgeThresholdOrder(resolved);
  const maxOverflowRetries = resolved.maxOverflowRetries ?? 1;
  if (!Number.isInteger(maxOverflowRetries) || maxOverflowRetries < 0) {
    throw new Error(`maxOverflowRetries must be a non-negative integer (got ${maxOverflowRetries})`);
  }
  return { ...resolved, maxOverflowRetries };
}
function resolvePresetThresholds(base, config) {
  if (base.preset === void 0) return base;
  const preset = resolvePreset(base.preset);
  return {
    ...base,
    nudgeMinContextLimitPct: config.nudgeMinContextLimitPct ?? preset.nudgeMinContextLimitPct,
    nudgeMaxContextLimitPct: config.nudgeMaxContextLimitPct ?? preset.nudgeMaxContextLimitPct,
    nudgeEmergencyThresholdPct: config.nudgeEmergencyThresholdPct ?? preset.nudgeEmergencyThresholdPct
  };
}
function presetFilledSettingsEntry(config) {
  const entry = filterSettingsEntry(config);
  if (config.preset === void 0) return entry;
  const preset = resolvePreset(config.preset);
  return {
    ...entry,
    nudgeMinContextLimitPct: config.nudgeMinContextLimitPct ?? preset.nudgeMinContextLimitPct,
    nudgeMaxContextLimitPct: config.nudgeMaxContextLimitPct ?? preset.nudgeMaxContextLimitPct,
    nudgeEmergencyThresholdPct: config.nudgeEmergencyThresholdPct ?? preset.nudgeEmergencyThresholdPct
  };
}
function assertNudgeThresholdOrder(config) {
  const { nudgeMinContextLimitPct: min, nudgeMaxContextLimitPct: max, nudgeEmergencyThresholdPct: emergency } = config;
  const describe = `min ${min ?? "kernel default"} / max ${max ?? "kernel default"} / emergency ${emergency ?? "kernel default"}`;
  if (min !== void 0 && max !== void 0 && min > max) {
    throw new Error(`nudge thresholds are inverted (${describe}) \u2014 nudgeMinContextLimitPct must be <= nudgeMaxContextLimitPct`);
  }
  if (max !== void 0 && emergency !== void 0 && max > emergency) {
    throw new Error(`nudge thresholds are inverted (${describe}) \u2014 nudgeMaxContextLimitPct must be <= nudgeEmergencyThresholdPct`);
  }
  if (min !== void 0 && emergency !== void 0 && min > emergency) {
    throw new Error(`nudge thresholds are inverted (${describe}) \u2014 nudgeMinContextLimitPct must be <= nudgeEmergencyThresholdPct`);
  }
}
var AcpCompactionEngine = class extends CompactionEngine {
  /** The framework-agnostic ACP compression core, reused verbatim. */
  kernel;
  /** Per-session kernel state. */
  store;
  /** Resolved engine configuration. */
  config;
  /** Resolved prompt templates (validated at construction — fail-fast on template typos). */
  prompts;
  /**
   * The environment wired into tools / command / nudge. Exposed so tests (and
   * introspection) can assert the forwarding actually happened: the config
   * chain user config → this.config → env → kernelConfigFor is all OPTIONAL
   * fields, so a dropped forwarding line fails typecheck silently and would
   * revive lost-config bugs with every unit test green.
   */
  env;
  lastNudgeTurn = new LruMap(DEFAULT_SESSION_CACHE_LIMIT);
  /** Per-session emergency-nudge injection budget for the current user turn (issue #108). */
  emergencyNudges = /* @__PURE__ */ new Map();
  /** Successful compress call ids awaiting their tool/result so the pair can be hidden. */
  compressCallIdsToHide = /* @__PURE__ */ new Set();
  /** Per provider/model route the resolved window (probe failures cached too). */
  windowCache = /* @__PURE__ */ new Map();
  /** Live settings snapshot thunk (composition → user settings layer); swapped when the settings provider attaches (SettingsProvider.installSection). */
  readSettingsSource = () => resolveAcpSettings({});
  /** The settings service, captured lazily for /acp-prune config (undefined in provider-less processes). */
  settingsService;
  /** /acp-prune config read/write surface. */
  settingsCommand;
  /** Per route the adapter's per-request output cap (the output reservation); null = undisclosed. */
  outputReservationCache = /* @__PURE__ */ new Map();
  /** Per-agent context-overflow recovery budget (mirrors the host's `overflowRetries`). */
  overflowRetries = /* @__PURE__ */ new Map();
  /** Per-session overflow agents, so session progress can reset the recovery budget. */
  overflowSessions = /* @__PURE__ */ new Map();
  constructor(ctx, config = {}) {
    super(ctx);
    this.config = resolveAcpConfig(config);
    this.prompts = resolvePrompts2(config.prompts);
    const ports = this.config.countTokens !== void 0 ? { countTokens: this.config.countTokens } : {};
    this.kernel = createCore(ports);
    setDocCacheCap(128 * 1024 * 1024);
    this.store = new AcpStateStore();
    const compositionEntry = presetFilledSettingsEntry(config);
    let current = resolveAcpSettings(compositionEntry);
    this.readSettingsSource = () => current;
    const engine = this;
    const applySettings = () => {
      const next = this.readSettingsSource();
      const prev = current;
      current = next;
      try {
        engine.onSettingsChanged(prev, next);
      } catch (error) {
        this.ctx.logger.warn(`billion-context-dsh: applying settings change failed: ${String(error)}`);
      }
    };
    this.settingsCommand = makeSettingsCommandSurface(() => this.settingsService, () => current);
    if (this.config.settingsEnabled !== false) {
      ctx.inject(["settings"], (settingsCtx) => {
        if (typeof settingsCtx.settings?.installSection !== "function") {
          this.ctx.logger.warn(
            "billion-context-dsh: host settings service has no installSection (removed in dsh-settings >= 0.1.7) \u2014 the compaction-acp settings section is not registered; the six knobs keep their composition values and /acp-prune config reports the section unavailable"
          );
          return void 0;
        }
        settingsCtx.settings.installSection(ctx, ACP_SETTINGS_NAMESPACE, AcpSettingsSchema, compositionEntry, {
          // The seam's source type follows the entry it registered, so `source`
          // is a partial view of the settings; re-resolve it into a
          // fully-defaulted snapshot so every reader sees the same shape the
          // composition path produced.
          setSource: (source) => {
            this.readSettingsSource = () => resolveAcpSettings(source());
          },
          onChange: applySettings
        });
        this.settingsService = settingsCtx.settings;
        return () => {
          this.settingsService = void 0;
          this.readSettingsSource = () => current;
        };
      });
    }
    const env = {
      kernel: this.kernel,
      store: this.store,
      // The settings-exposed knobs read LIVE from the settings source, so a
      // settings.yaml edit (or /acp-prune config set) hot-applies to every
      // subsequent call — consumers never see stale numbers. (ToolEnvironment
      // fields are readonly properties; getters satisfy them.)
      get modelContextLimit() {
        return engine.readSettingsSource().modelContextLimit ?? DEFAULT_CONTEXT_WINDOW;
      },
      get nudgeMinContextLimitPct() {
        return engine.readSettingsSource().nudgeMinContextLimitPct;
      },
      get nudgeMaxContextLimitPct() {
        return engine.readSettingsSource().nudgeMaxContextLimitPct;
      },
      get nudgeEmergencyThresholdPct() {
        return engine.readSettingsSource().nudgeEmergencyThresholdPct;
      },
      coreOverrides: this.config.coreOverrides,
      // Display-only: which named preset produced the thresholds above (if any),
      // so /acp-prune status can name it. The resolved pct values above are what the
      // kernel actually reads — this field never feeds kernelConfigFor.
      preset: this.config.preset,
      windowFor: (agent) => this.windowFor(agent),
      prompts: this.prompts,
      compressCallIdsToHide: this.compressCallIdsToHide,
      settingsCommand: this.settingsCommand
    };
    this.env = env;
    const tools = ctx.get("tools");
    if (tools !== void 0) {
      for (const tool of makeTools(env)) tools.register(tool);
    } else {
      let done = false;
      const registerTools = () => {
        if (done) return;
        const registry3 = ctx.get("tools");
        if (registry3 === void 0) return;
        done = true;
        for (const tool of makeTools(env)) registry3.register(tool);
      };
      ctx.on("internal/service", (name) => {
        if (name === "tools") registerTools();
      });
    }
    const commands = ctx.get("commands");
    if (commands !== void 0) {
      commands.register(acpCommand(env));
    } else {
      let done = false;
      const registerCommand = () => {
        if (done) return;
        const registry3 = ctx.get("commands");
        if (registry3 === void 0) return;
        done = true;
        registry3.register(acpCommand(env));
      };
      ctx.on("internal/service", (name) => {
        if (name === "commands") registerCommand();
      });
    }
    ctx.on("session/event", (session, event) => {
      if (event.type === "assistant/message") {
        const overflowAgent = this.overflowSessions.get(session);
        if (overflowAgent !== void 0) {
          this.overflowRetries.delete(overflowAgent);
          this.overflowSessions.delete(session);
        }
      }
      if (event.type !== "tool/result") return;
      const message = event.data.message;
      const block = message.content[0];
      const callId = block?.toolCallId ?? message.source.callId;
      if (typeof callId !== "string" || !this.compressCallIdsToHide.has(callId)) return;
      this.compressCallIdsToHide.delete(callId);
      deferCompressPairHide(session, callId, event.seq, (error) => {
        ctx.logger.warn(`billion-context-dsh: hide compress call/result pair failed: ${String(error)}`);
      });
    });
    ctx.on("agent/pre-step", async (payload, next) => {
      stripOrphanedSurfaceToolMessages(payload.agent.session);
      if (!engine.readSettingsSource().autoNudge) return next();
      const decision = await next();
      if (decision.kind === "reject") return decision;
      const window = await this.windowFor(payload.agent);
      const outcome = buildNudge(
        payload.agent,
        { ...env, modelContextLimit: window.limit },
        this.lastNudgeTurn,
        this.emergencyNudges,
        () => {
          ctx.logger.warn(
            `billion-context-dsh: emergency nudge suppressed \u2014 per-turn budget of ${EMERGENCY_NUDGE_MAX_PER_TURN} spent (session ${payload.agent.session.id}); pressure is still above the emergency threshold`
          );
        }
      );
      if (outcome === null) return decision;
      return { kind: "enter", messages: [...decision.messages, outcome.message] };
    });
    ctx.on("agent/status", ({ agent, status }) => {
      if (status !== "idle") return;
      this.overflowRetries.delete(agent);
      this.overflowSessions.delete(agent.session);
    });
    ctx.on("agent/request-error", async ({ agent, failure, signal }, next) => {
      if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE || signal.aborted) return next();
      this.overflowSessions.set(agent.session, agent);
      const retries = this.overflowRetries.get(agent) ?? 0;
      const max = this.config.maxOverflowRetries ?? 1;
      if (retries >= max) {
        this.ctx.logger.warn(
          `billion-context-dsh: context-overflow recovery budget spent (${max} retries) for session ${agent.session.id}; preserving the original request error`
        );
        return next();
      }
      const generation = agent.session.surface.replaceGeneration;
      let result;
      try {
        result = await this.compactForOverflow(agent, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!signal.aborted && agent.session.surface.replaceGeneration > generation) {
          this.ctx.logger.warn(
            `billion-context-dsh: context-overflow compaction failed after durable surface progress: ${message}; retrying from the replacement surface`
          );
          this.overflowRetries.set(agent, retries + 1);
          return { kind: "retry" };
        }
        this.ctx.logger.warn(
          `billion-context-dsh: context-overflow compaction failed: ${message}; ${signal.aborted ? "cancellation prevents retry" : "preserving the original request error"}`
        );
        return next();
      }
      if (signal.aborted || agent.session.surface.replaceGeneration <= generation) return next();
      if (result !== null) {
        this.ctx.logger.info(
          `compaction (context overflow recovery): shadowed ${result.shadowedSeqs.length} surface nodes (seqs ${result.start}-${result.end}, ~${result.shadowedTokenCount} tokens)`
        );
      }
      this.overflowRetries.set(agent, retries + 1);
      return { kind: "retry" };
    });
    const systemPrompt = ctx.get("systemPrompt");
    if (systemPrompt !== void 0) {
      systemPrompt.section({
        name: "billion-context-dsh",
        order: ACP_SYSTEM_PROMPT_ORDER,
        text: renderSystemPrompt(this.prompts)
      });
    } else {
      let done = false;
      const registerSystemPrompt = () => {
        if (done) return;
        const registry3 = ctx.get("systemPrompt");
        if (registry3 === void 0) return;
        done = true;
        registry3.section({
          name: "billion-context-dsh",
          order: ACP_SYSTEM_PROMPT_ORDER,
          text: renderSystemPrompt(this.prompts)
        });
      };
      ctx.on("internal/service", (name) => {
        if (name === "systemPrompt") registerSystemPrompt();
      });
    }
  }
  /**
   * Resolve the effective context window for an agent. An explicitly
   * configured `modelContextLimit` always wins (no probe). Otherwise the live
   * session projection (`contextPressure.contextWindow`) is preferred when it
   * discloses one — it tracks the session's CURRENT route, so a mid-session
   * model switch repairs itself without a restart or config (see
   * projectedContextWindow). Falls back to probing the model's real window
   * via `agent.ctx.llm.resolveModelInfo` (cached per provider/model route,
   * probe failures cached too) and finally to DEFAULT_CONTEXT_WINDOW when
   * auto-detection is disabled or unavailable. On the auto-detected paths the
   * adapter's per-request output cap is then SUBTRACTED from the window
   * (applyReservation): every downstream usage computation must run against
   * the SUSTAINABLE input budget (window minus output reservation), not the
   * raw window — a 96K window with a 16K cap carries at most 80K of input,
   * so the raw denominator understates usage by cap/window (≈17% there, and
   * far worse on short-window models). An explicit limit keeps the operator's
   * exact value (they own the denominator); a failed probe keeps the raw
   * fallback.
   */
  async windowFor(agent) {
    const live = this.readSettingsSource();
    if (live.modelContextLimit !== void 0) {
      return { limit: live.modelContextLimit, source: "explicit" };
    }
    const { provider, model } = routeFor(agent);
    const key = `${provider}\0${model}`;
    if (live.autoModelContextLimit) {
      const projected = projectedContextWindow(agent);
      if (projected !== null) {
        const cap2 = await this.outputCapFor(agent, provider, model);
        return this.applyReservation({ limit: projected, source: "projection", provider, model }, cap2);
      }
    }
    const cached = this.windowCache.get(key);
    if (cached !== void 0) return cached;
    let window;
    let cap = null;
    if (!live.autoModelContextLimit) {
      window = { limit: DEFAULT_CONTEXT_WINDOW, source: "default", provider, model };
    } else {
      const probe = await probeModelWindow(agent, provider, model);
      cap = probe.outputReservation;
      if (probe.contextWindow === null) {
        this.ctx.logger.warn(
          `billion-context-dsh: context-window auto-detection failed for ${provider}/${model} \u2014 using the ${DEFAULT_CONTEXT_WINDOW} fallback (change modelContextLimit or autoModelContextLimit via /acp-prune config \u2014 or restart \u2014 to re-probe)`
        );
        window = { limit: DEFAULT_CONTEXT_WINDOW, source: "default", provider, model, probeFailed: true };
        cap = null;
      } else {
        window = { limit: probe.contextWindow, source: "auto", provider, model };
      }
    }
    window = this.applyReservation(window, cap);
    this.windowCache.set(key, window);
    return window;
  }
  /**
   * Diff handler for runtime settings changes: drop the window cache when a
   * window-related key changed (probe FAILURES are cached too — clearing is
   * what lets the next pre-step re-probe after a fix), clear the per-turn
   * nudge dedup when nudges come back on, and warn on order anomalies
   * (accepted, never rejected — rejecting a write cannot fix an externally
   * edited settings.yaml, and an invalid stored section would fail the next
   * boot loud anyway).
   */
  onSettingsChanged(prev, next) {
    const effect = describeSettingsChange(prev, next);
    for (const warning of effect.warnings) {
      this.ctx.logger.warn(`billion-context-dsh: ${warning}`);
    }
    if (effect.clearWindowCache) this.windowCache.clear();
    if (effect.clearNudgeDedup) this.lastNudgeTurn.clear();
  }
  /**
   * The adapter's per-request output cap for a route, from one
   * probeModelWindow call (a local catalog lookup — no request is sent),
   * cached per route like the window itself.
   */
  async outputCapFor(agent, provider, model) {
    if (provider === "" || model === "") return null;
    const key = `${provider}\0${model}`;
    const known = this.outputReservationCache.get(key);
    if (known !== void 0) return known;
    const cap = (await probeModelWindow(agent, provider, model)).outputReservation;
    this.outputReservationCache.set(key, cap);
    return cap;
  }
  /**
   * Subtract the output reservation from a resolved window: `limit` becomes
   * the SUSTAINABLE input budget (`rawLimit - outputReserved`) that every
   * downstream usage computation (nudge tiers, truncate, growth) measures
   * against. No-op when the cap is unknown or not smaller than the window
   * (degenerate config) — the raw-window behavior is preserved.
   */
  applyReservation(window, cap) {
    if (cap === null || cap >= window.limit) return window;
    return { ...window, rawLimit: window.limit, outputReserved: cap, limit: window.limit - cap };
  }
  /**
   * Best-effort emergency compaction for one provider-confirmed context
   * overflow: pick the largest eligible (guarded, tool-pairing-balanced)
   * surface range and land the normal durable transaction with a fixed
   * engine-written marker summary. No LLM call — the provider just rejected
   * the request for being too large, so there is no model turn available to
   * write a summary; the originals stay in the append-only log, so
   * search_context still indexes them, decompress restores them, and the
   * model can re-run the compress tool over the marker later to write a real
   * summary. Returns null when nothing eligible exists (nothing to reclaim).
   */
  async compactForOverflow(agent, signal) {
    signal.throwIfAborted();
    const session = agent.session;
    const state = this.store.stateFor(session);
    const coreMessages = allLogMessages(session);
    const surfaceMessages = eventsToCoreMessages(surfaceEventsOf(session));
    const tokenCount = resolveTokenCount(agent, surfaceMessages);
    const window = await this.windowFor(agent);
    const config = kernelConfigFor({ ...this.env, modelContextLimit: window.limit });
    const turn = this.kernel.processTurn({ messages: coreMessages, state, config, tokenCount, renderTags: "none" });
    this.store.set(session, turn.state);
    const byRaw = turn.state.messageRefs.byRaw;
    let firstSeq;
    let lastSeq;
    for (const seq of session.surface.nodes) {
      if (byRaw[String(seq)] === void 0) continue;
      firstSeq ??= seq;
      lastSeq = seq;
    }
    if (firstSeq === void 0 || lastSeq === void 0) return null;
    const view = {
      ranges: [{ startRef: byRaw[String(firstSeq)], endRef: byRaw[String(lastSeq)] }],
      refs: { byRef: turn.state.messageRefs.byRef }
    };
    const ranges = buildCompressibleSeqRanges(session, view, {
      preserveRecent: 5,
      mediaPriceOf: meterMediaPriceResolver(agent, session)
    });
    if (ranges.length === 0) return null;
    const best = ranges.reduce((largest, range) => range.tokens > largest.tokens ? range : largest);
    const startRef = byRaw[String(best.start)];
    const endRef = byRaw[String(best.end)];
    if (startRef === void 0 || endRef === void 0) return null;
    const summary = overflowMarkerSummary(best.count);
    const applied = this.kernel.applyCompression({
      ranges: [{ startRef, endRef, summary, topic: "context-overflow recovery" }],
      messages: coreMessages,
      state: turn.state,
      config
    });
    if (applied.result.blocksCreated === 0) return null;
    this.store.set(session, applied.state);
    const previousIds = new Set(turn.state.blocks.map((block) => block.blockId));
    const created = applied.state.blocks.find((block) => !previousIds.has(block.blockId));
    if (created === void 0) return null;
    const shadowed = shadowedSeqsOf(session, best.start, best.end);
    if (shadowed.length === 0) return null;
    const shadowedTokenCount = shadowedTokensViaMeter(session, shadowed, agent.ctx);
    const { provider, model } = routeFor(agent);
    runCompactionTransaction(session, {
      start: best.start,
      end: best.end,
      shadowedSeqs: shadowed,
      summary: [{ type: "text", text: summary }],
      shadowedTokenCount,
      provider,
      model,
      topic: "context-overflow recovery",
      kernelBlockId: created.blockId,
      directMessageIds: created.directMessageIds,
      effectiveMessageIds: created.effectiveMessageIds
    });
    return { start: best.start, end: best.end, shadowedSeqs: shadowed, shadowedTokenCount };
  }
  /** ACP is model-driven: automatic pressure policy never summarizes by itself. */
  async compactIfNeeded(_agent, _trigger, signal) {
    signal.throwIfAborted();
    return null;
  }
  /** Explicit idle-session compaction: ACP leaves the decision to the model. */
  async compactNow(_agent, signal) {
    signal.throwIfAborted();
    return null;
  }
  /**
   * The model-driven path lands through the `compress` tool, which runs the
   * full durable transaction directly. This seam method rejects with guidance:
   * automatic summarization is exactly what ACP replaces.
   */
  async compactRegion(_start, _end, _agent, signal) {
    signal?.throwIfAborted();
    throw new ManualCompactionError(
      "summary",
      "billion-context-dsh is model-driven: use the compress tool instead of automatic summarization"
    );
  }
};
var index_default = AcpCompactionEngine;
export {
  ACP_SETTINGS_NAMESPACE,
  ACP_SYSTEM_PROMPT,
  ACP_SYSTEM_PROMPT_ORDER,
  AcpCompactionEngine,
  AcpSettingsSchema,
  AcpStateStore,
  AlreadyCompressedRangeError,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_PROMPTS,
  DEFAULT_RESOLVED,
  EMERGENCY_NUDGE_MAX_PER_TURN,
  PRESETS,
  PRESET_NAMES,
  SETTINGS_KEYS,
  SETTING_DEFAULTS,
  acpCommand,
  assertNoActiveCompaction,
  blockRefForSummarySeq,
  blockRegistry,
  buildNudge,
  compactionIdsOfKernelBlocks,
  index_default as default,
  describeSettingsChange,
  detectContextWindow,
  eventsToCoreMessages,
  expandShadowedSeqs,
  extractEventText,
  filterSettingsEntry,
  findOpenTurn,
  hideCompressToolPair,
  isPresetName,
  kernelConfigFor,
  makeSettingsCommandSurface,
  makeTools,
  parseSettingValue,
  projectEvent,
  projectedContextWindow,
  rebuildBlockLedger,
  renderSystemPrompt,
  renderTemplate,
  resolveAcpConfig,
  resolveAcpSettings,
  resolvePreset,
  resolvePrompts2 as resolvePrompts,
  resolveSurfaceRange,
  resolveTokenCount,
  runCompactionTransaction,
  shadowedSeqsOf,
  stripOrphanedSurfaceToolMessages,
  summarySeqOfKernelBlock,
  surfaceEventsOf,
  windowSourceLabel
};
//# sourceMappingURL=index.js.map
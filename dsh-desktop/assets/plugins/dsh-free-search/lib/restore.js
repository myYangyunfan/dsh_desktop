// #159: clean up the provider ids this plugin wrote into the profile patch.
//
// The runtime takeover persists `searchProvider: ddg` / `fetchProvider:
// fs-quality-fetch` into `profiles/<name>/cordis.patch.yml` through
// `settings.mutate("web", ...)`. That row outlives the plugin: after a disable
// or an uninstall the ids are still there while the providers are gone, and
// every `web_search` / `web_fetch` fails with WEB_PROVIDER_CONFIGURED_MISSING.
//
// This module does the cleanup without loading the plugin, so it works exactly
// in the state where nothing else can run. It edits the file as text instead of
// round-tripping YAML, so comments, ordering and quoting survive.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Provider ids this plugin registers; a patch value equal to one of these is residue. */
export const OWNED_PROVIDER_IDS = {
  searchProvider: ["ddg"],
  fetchProvider: ["fs-quality-fetch"],
};

/** The web row this plugin writes into. */
const WEB_ROW_ID = "web";

export function dshHomeDir(env = process.env) {
  return env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
}

/** profile directory names under `<home>/profiles`, or an empty list. */
export function listProfiles(home = dshHomeDir()) {
  const dir = path.join(home, "profiles");
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, dir: path.join(dir, entry.name) }))
      .filter((entry) => fs.existsSync(path.join(entry.dir, "cordis.patch.yml")));
  } catch {
    return [];
  }
}

const unquote = (raw) => {
  const text = String(raw ?? "").trim();
  const m = /^(['"])([\s\S]*)\1$/.exec(text);
  return m ? m[2] : text;
};

const indentOf = (line) => {
  const match = /^[ \t]*/.exec(line);
  return match === null ? 0 : match[0].length;
};

/**
 * Split a patch document into blocks that each start at a top-level `- ` line.
 * Everything before the first entry is kept as a prologue.
 */
export function splitEntries(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let prologue = [];
  let current = null;
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (current !== null) blocks.push(current);
      current = [line];
    } else if (current === null) {
      prologue.push(line);
    } else {
      current.push(line);
    }
  }
  if (current !== null) blocks.push(current);
  return { prologue, blocks, eol };
}

/** The entry id of a block, from its leading `- id: <id>` line. */
export function blockId(block) {
  const lead = block[0] ?? "";
  const m = /^- (?:id|name):\s*(.*)$/.exec(lead);
  if (!m) return null;
  return unquote(m[1]);
}

/** True when this block targets the web row (`- id: web`, or a named web entry). */
export function isWebEntry(block) {
  const lead = block[0] ?? "";
  if (/^- id:\s*["']?web["']?\s*$/.test(lead)) return true;
  return block.some((line) => /^\s*name:\s*["']?@deepseek-ai\/dsh-web["']?\s*$/.test(line));
}

/**
 * Remove residue from one web block. Returns { lines, removed, changed }.
 * Only values that match the ids this plugin owns are removed; anything the
 * user chose explicitly is left untouched.
 */
export function cleanWebEntry(block) {
  const removed = [];
  let kept = [];

  for (const line of block) {
    let drop = false;
    const key = /^\s*(searchProvider|fetchProvider):\s*(.*)$/.exec(line);
    if (key && OWNED_PROVIDER_IDS[key[1].includes("search") ? "searchProvider" : "fetchProvider"].includes(unquote(key[2]))) {
      removed.push({ key: key[1], value: unquote(key[2]) });
      drop = true;
    }
    if (!drop) kept.push(line);
  }

  // An empty `config:` would parse as null and break the loader, so drop it too.
  kept = kept.filter((line, index) => {
    if (!/^\s*config:\s*$/.test(line)) return true;
    const next = kept.slice(index + 1).find((candidate) => candidate.trim() !== "");
    if (next === undefined) return false;
    return indentOf(next) > indentOf(line);
  });

  return { lines: kept, removed, changed: removed.length > 0 };
}

/** An entry that only restates the row (id + name) carries nothing; drop it. */
export function isRedundantEntry(block) {
  const meaningful = block.filter((line) => {
    const text = line.trim();
    if (text === "" || text.startsWith("#")) return false;
    // Both the leading `- id: …` and the indented `name: …` only identify the row.
    if (/^-?\s*(?:id|name):/.test(text)) return false;
    return true;
  });
  return meaningful.length === 0;
}

/**
 * Clean one patch document. Returns { text, changed, removed, dropped }.
 */
export function cleanPatchText(text) {
  const { prologue, blocks, eol } = splitEntries(text);
  let changed = false;
  let removed = [];
  let dropped = [];
  const keptBlocks = [];

  for (const block of blocks) {
    if (isWebEntry(block)) {
      const result = cleanWebEntry(block);
      if (result.changed) {
        changed = true;
        removed = removed.concat(result.removed);
        if (isRedundantEntry(result.lines)) {
          dropped.push(blockId(block) ?? "web");
          continue;
        }
        keptBlocks.push(result.lines);
        continue;
      }
    }
    keptBlocks.push(block);
  }

  const lines = [...prologue, ...keptBlocks.flat()];
  const body = lines.join(eol);
  // Preserve the original trailing newline shape.
  const tail = text.endsWith("\n") ? eol : "";
  const trimmed = body.replace(/\r?\n+$/, "");
  return { text: trimmed + tail, changed, removed, dropped, eol };
}

/**
 * Clean every profile patch under the home. Returns one result per profile.
 */
export function cleanProfiles({ home = dshHomeDir(), profile, dryRun = false } = {}) {
  const profiles = listProfiles(home).filter((entry) => profile === undefined || entry.name === profile);
  const results = [];
  for (const entry of profiles) {
    const file = path.join(entry.dir, "cordis.patch.yml");
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (error) {
      results.push({ profile: entry.name, file, ok: false, error: String(error?.message ?? error) });
      continue;
    }
    const cleaned = cleanPatchText(text);
    if (!cleaned.changed) {
      results.push({ profile: entry.name, file, ok: true, changed: false, removed: [], dropped: [] });
      continue;
    }
    if (!dryRun) {
      try {
        fs.writeFileSync(`${file}.bak-before-free-search-restore`, text);
        fs.writeFileSync(file, cleaned.text);
      } catch (error) {
        results.push({ profile: entry.name, file, ok: false, error: String(error?.message ?? error) });
        continue;
      }
    }
    results.push({
      profile: entry.name,
      file,
      ok: true,
      changed: true,
      removed: cleaned.removed,
      dropped: cleaned.dropped,
    });
  }
  return results;
}

/** Human-readable summary lines for the CLI. */
export function describeResults(results) {
  const lines = [];
  if (results.length === 0) {
    lines.push("no profile with a cordis.patch.yml was found");
    return lines;
  }
  for (const result of results) {
    if (!result.ok) {
      lines.push(`${result.profile}: FAILED (${result.error})`);
      continue;
    }
    if (!result.changed) {
      lines.push(`${result.profile}: nothing to clean`);
      continue;
    }
    const parts = result.removed.map((entry) => `${entry.key}: ${entry.value}`);
    lines.push(`${result.profile}: removed ${parts.join(", ")}`);
    if (result.dropped.length > 0) {
      lines.push(`${result.profile}: dropped the now-empty row ${result.dropped.map((id) => `"${id}"`).join(", ")}`);
    }
  }
  return lines;
}

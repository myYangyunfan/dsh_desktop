#!/usr/bin/env node
// #159: restore the web provider fields this plugin wrote into the profile patch.
//
// Runs without loading the plugin, so it also works after the plugin was
// disabled or uninstalled - the exact state the residue is stuck in.
//
//   npx dsh-free-search restore
//   npx dsh-free-search restore --profile web --dry-run
import { cleanProfiles, describeResults, dshHomeDir } from "../lib/restore.js";

const args = process.argv.slice(2);

// Flags are parsed first: an unknown or bare invocation must never fall through
// to a real write. Anything short of an explicit `restore` prints usage and exits.
const HELP_FLAGS = new Set(["--help", "-h", "help", "--usage"]);
if (args.length === 0 || args.some((arg) => HELP_FLAGS.has(arg))) {
  printUsage();
  process.exit(args.length === 0 ? 2 : 0);
}

const command = args[0];
if (command !== "restore") {
  console.error(`unknown command "${command}"`);
  printUsage();
  process.exit(2);
}

const profileIndex = args.indexOf("--profile");
const profile = profileIndex >= 0 ? args[profileIndex + 1] : undefined;
if (profileIndex >= 0 && (profile === undefined || profile.startsWith("-"))) {
  console.error("--profile needs a profile name");
  process.exit(2);
}

const homeIndex = args.indexOf("--home");
const home = homeIndex >= 0 ? args[homeIndex + 1] : dshHomeDir();
if (homeIndex >= 0 && (home === undefined || home.startsWith("-"))) {
  console.error("--home needs a directory");
  process.exit(2);
}

// An unknown flag is a typo, not consent to overwrite a profile patch.
const KNOWN_FLAGS = new Set(["restore", "--profile", "--home", "--dry-run"]);
const valueFlags = new Set(["--profile", "--home"]);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (KNOWN_FLAGS.has(arg)) {
    if (valueFlags.has(arg)) i += 1;
    continue;
  }
  console.error(`unknown argument "${arg}"`);
  printUsage();
  process.exit(2);
}

const dryRun = args.includes("--dry-run");

const results = cleanProfiles({ home, profile, dryRun });
for (const line of describeResults(results)) console.log(line);
if (results.some((result) => result.ok && result.changed) && !dryRun) {
  console.log("\nbackups were written next to each patch as *.bak-before-free-search-restore");
  console.log("restart dsh so the web service rebuilds with the restored providers");
}
if (dryRun && results.some((result) => result.ok && result.changed)) {
  console.log("\n(dry run: nothing was written)");
}
process.exit(results.every((result) => result.ok) ? 0 : 1);

function printUsage() {
  console.log(`Usage:
  dsh-free-search restore [--profile <name>] [--home <dir>] [--dry-run]

Removes the "searchProvider: ddg" / "fetchProvider: fs-quality-fetch" values
this plugin wrote into a profile's cordis.patch.yml. Values you set yourself are
left untouched, and a patch line surviving only because of them is dropped.

  --profile <name>   clean one profile under <home>/profiles
  --home <dir>       DSH home (defaults to $DSH_HOME or ~/.dsh)
  --dry-run          report what would change without writing

Nothing is written unless the word "restore" is the first argument.`);
}

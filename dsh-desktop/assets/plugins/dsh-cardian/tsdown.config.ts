// tsdown config for the cardian client bundle (browser half).
//
// Faithful reproduction of deepseek-harness's `clientBundle` preset
// (packages/client/tsdown.client.ts), which is NOT published. The critical
// contract, captured verbatim from that preset:
//
//   banner: `window.__ModuleLoader__.load({ id: <id>, factory: (require) => {`
//   footer: 'return module.exports; } });'
//
// i.e. the artifact is a closure factory registered into the loader's module
// table, and externals resolve through the injected `require`.
import { defineConfig } from 'tsdown'

const CLIENT_ID = 'dsh-cardian'

// Module-table rows the browser loader resolves at runtime. These MUST stay
// external (never bundled) — bundling React would create a second React
// instance and break hooks; bundling the dsh client packages would break their
// shared singleton state / SlotMap declaration merging.
const MODULE_TABLE = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-locale/client',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-layout/client',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-sidebar/client',
]

const isExternal = (specifier: string) => MODULE_TABLE.includes(specifier)

export default defineConfig([
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: isExternal,
      alwaysBundle: (specifier) => !isExternal(specifier),
    },
    // Force `lib/client.js` (not `.cjs`), matching the loader's expected path.
    outExtensions: () => ({ js: '.js' }),
    // The loader contract (dsh-client-modules/lib/client.js:252) invokes the
    // factory as `registered(this.makeRequire(edges))` — ONE argument — and uses
    // the return value as `record.exports`. Bare `exports`/`module` identifiers
    // do NOT exist in that scope. The `intro` shim declares them inside the
    // factory BEFORE the CJS code runs; the footer returns `module.exports`.
    // This is the exact shape the harness's own bundles use (see
    // dsh-community-market/lib/client.js, dsh-super-injector/lib/client.js).
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
  // Host half (Node): src/index.js (+ core/, tools) bundled into lib/index.js
  // so the desktop sync (PLUGIN_FILES/SYNC_SUBDIRS) only needs lib/ at runtime
  // and the plugin stays isomorphic with the other bundled companions
  // (dsh-openclaw-bridge / dsh-hub: main -> lib/index.js). Externals:
  // @deepseek-ai/dsh-typert-protocol resolves at runtime from the kernel
  // install root (same chain as dsh-hub); node: builtins stay builtin; zod is
  // bundled (self-contained, no zod in the profile node_modules).
  {
    entry: { index: 'src/index.js' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier) => specifier === '@deepseek-ai/dsh-typert-protocol',
    },
    outExtensions: () => ({ js: '.js' }),
    outputOptions: {
      entryFileNames: 'index.js',
      codeSplitting: false,
    },
  },
])

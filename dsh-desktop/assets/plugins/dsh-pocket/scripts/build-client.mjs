// dsh-pocket 网页客户端打包：client/index.jsx → client/client.js
//
// 为什么在 scripts/ 而不是 client/：这是构建期工具（依赖 devDependency esbuild），
// 而 files 里整个 client/ 都会随 tarball 发布。留在 client/ 下会把一个跑不起来的
// 构建脚本装进官方 profile（纯死重），并且让静态审计把 esbuild 当成页内 bundle 的
// 裸依赖——client/ 目录下的文件会被判成浏览器模块系统的加载对象，esbuild 在那儿
// 永远解析不了。挪出 client/ 后发布物里只剩运行期真正需要的 client.js / api.js。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(packageRoot, 'client');
const outputPath = resolve(sourceDir, 'client.js');
const loaderId = process.env.DSH_POCKET_CLIENT_ID ?? 'dsh-pocket';

const result = await build({
  entryPoints: [resolve(sourceDir, 'index.jsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome100'],
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  write: false,
  minify: process.env.NODE_ENV === 'production',
  legalComments: 'none',
});

const bundled = result.outputFiles?.[0]?.text;
if (!bundled) throw new Error('esbuild did not produce a client bundle');

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(loaderId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // The DSH client module system provides react as a module, never as a
    // global. esbuild keeps react external (see the build config above) and
    // its classic JSX transform emits bare React.createElement calls for the
    // mobile components (which import only named hooks, not React itself), so
    // the bundle must bind React itself - otherwise every mobile component
    // crashes at render time with "ReferenceError: React is not defined".
    var React = require("react");
${bundled}
    return module.exports;
  }
});
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, wrapped, 'utf8');
console.log(`Wrote ${outputPath}`);

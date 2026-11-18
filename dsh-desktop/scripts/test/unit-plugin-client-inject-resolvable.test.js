// 回归锁：内置件声明/生成的「客户端注入模块 id」必须能在随包内核闭包里解析。
//
// 事故形态一（2026-11-18 同名事故的旁支，同一天扫出）：`dsh-super-injector` 的**脚手架模板**
// 给新建插件生成的 `package.json` 写着
//   dsh.client.inject = ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-slots']
// 而 `@deepseek-ai/dsh-client-runtime` 在 0.2.2-rc.2 已被上游整块删掉（随包内核 node_modules
// 里查无此包）。注入 id 解析不到 → 客户端半边永久 pending → 用户新建的面板永远不出现，
// 而构建、host 半边、boot 全绿。这与「工具箱把内核运行时包当成竞争面板」是同一类：
// **拿一个已经不成立的包名当判据**，坏形只在界面上显形。
//
// 判据（两层，都只看**可解析性**，不猜语义）：
//   ① 已发布形态：`assets/plugins/<dir>/package.json` 的 `dsh.client.inject` 里每条 **scoped**
//      id（以 `@` 开头）必须能在 `node_modules/` 里找到同名包（子路径 `/client` 先剥掉）。
//      不以 `@` 开头的是客户端**服务名**（如 easyrewrite 的 `slots`/`sessions`），不按包解析。
//   ② 生成形态：插件源码里的 `client: { inject: [...] }` 模板数组（脚手架即此形）同一条判据。
//
// 反例口径：**不做全文禁令**——`dsh-better-sidebar/lib/client.js` 里就以注释形式记录过
// 「`@deepseek-ai/dsh-client-runtime` 上游已删」，那也是有用的史料。禁令只针对上面两条
// **会被运行时消费的注入表**。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // dsh-desktop/
const PLUGINS = join(ROOT, 'assets', 'plugins');
const NM = join(ROOT, 'node_modules');
const SCOPE_DIR = join(NM, '@deepseek-ai');

const hasClosure = existsSync(SCOPE_DIR);

/** scoped 包 id → 目录（`@scope/name/sub` 只取前两段），能在 node_modules 里找到即算可解析。 */
function resolvable(id) {
  const parts = String(id).split('/');
  const pkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return existsSync(join(NM, pkg));
}

/** 注入 id 里只有以 `@` 开头的才是包 id；其余是客户端服务名。 */
const isPackageId = (id) => typeof id === 'string' && id.startsWith('@');

function pluginDirs() {
  return readdirSync(PLUGINS).filter((d) => {
    try {
      return statSync(join(PLUGINS, d)).isDirectory();
    } catch {
      return false;
    }
  });
}

test('每个内置件 package.json 的 scoped client inject id 都能在随包内核闭包里解析', { skip: !hasClosure && '未安装 node_modules' }, () => {
  const bad = [];
  for (const dir of pluginDirs()) {
    const file = join(PLUGINS, dir, 'package.json');
    if (!existsSync(file)) continue;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      bad.push(`${dir}/package.json 解析失败：${e.message}`);
      continue;
    }
    const inject = pkg?.dsh?.client?.inject;
    if (!Array.isArray(inject)) continue;
    for (const id of inject.filter(isPackageId)) {
      if (!resolvable(id)) bad.push(`${dir} → ${id}`);
    }
  }
  assert.deepEqual(bad, [], `这些注入 id 在 pin 闭包里查无此包（客户端半边会永久 pending）：\n${bad.join('\n')}`);
});

test('插件源码里 `client: { inject: [...] }` 模板数组同样必须可解析（脚手架事故原形）', { skip: !hasClosure && '未安装 node_modules' }, () => {
  const bad = [];
  for (const dir of pluginDirs()) {
    const libDir = join(PLUGINS, dir, 'lib');
    if (!existsSync(libDir)) continue;
    for (const name of readdirSync(libDir)) {
      if (!name.endsWith('.js')) continue;
      const text = readFileSync(join(libDir, name), 'utf8');
      for (const m of text.matchAll(/client:\s*\{\s*inject:\s*\[([^\]]*)\]/g)) {
        for (const lit of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
          if (!isPackageId(lit[1])) continue;
          if (!resolvable(lit[1])) bad.push(`${dir}/lib/${name} → ${lit[1]}`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], `模板里生成了 pin 闭包中不存在的注入 id：\n${bad.join('\n')}`);
});

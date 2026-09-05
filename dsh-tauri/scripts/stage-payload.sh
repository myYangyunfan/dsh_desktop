#!/usr/bin/env bash
# stage-payload.sh —— 打包前置：暂存运行时 payload 到 package-payload/dsh-desktop/
# ==========================================================================
# Tauri 安装包的内核资源（supervisor 的 app_dir）。从 dsh-desktop/ 源头按
# 「Electron extraResources + 生产依赖」口径组装，排除三类大件：
#   1. dist/            —— 旧构建产物（>2GB，与运行时无关）
#   2. node_modules 的 devDependencies（electron / electron-builder /
#      electron-winstaller）——Electron 运行时与打包器，Tauri 版不需要
#   3. vendor/node/node —— unix node 二进制（115MB，win-x64 包只带 node.exe）
#
# 产出布局（resources 映射 → <安装根>/resources/dsh-desktop/，
# 与 lib.rs find_repo_root 的 exe-walk resources/ 子布局回退一致）：
#   dsh-desktop/{package.json, 根级 *.js（boot 链脚本）, scripts/, assets/,
#                vendor/node/node.exe, vendor/npm/, node_modules/<生产依赖>}
#
# 用法：bash dsh-tauri/scripts/stage-payload.sh   （在仓库任意位置均可）
# 幂等：重复执行全量镜像（robocopy /MIR），改动后重跑即可。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO_ROOT/dsh-desktop"
DST="$REPO_ROOT/dsh-tauri/package-payload/dsh-desktop"

# 跨平台目录镜像：Windows 用 robocopy（原子/mtime 保真），Linux/macOS
# 用 rm -rf + cp -a（CI 环境；robocopy 不存在时自动回退）。
mirror_dir() {
  local src="$1" dst="$2"
  if command -v robocopy >/dev/null 2>&1; then
    # robocopy 退出码 0-7 全是成功（1=有复制…）——set -e 会把 1-7 当失败
    # 直接杀脚本（v0.5.1 实测：node_modules 有变更即 rc=3 全链夭折且无输出），
    # 必须用 || 接住再判定；额外参数（如 //XD 排除）原样转发。
    local rc=0
    robocopy "$src" "$dst" //MIR //R:2 //W:1 "${@:3}" > /dev/null || rc=$?
    [ "$rc" -lt 8 ] || { echo "[stage] robocopy 失败($rc): $src" >&2; return 1; }
  else
    rm -rf "$dst"
    mkdir -p "$(dirname "$dst")"
    cp -a "$src" "$dst"
  fi
}

echo "[stage] 源: $SRC"
echo "[stage] 目标: $DST"

# 前置校验：缺任何一项，装出来的包必然起不来（fail-fast 优于装完才发现）。
# Windows（含 Git Bash/MINGW/MSYS）用 node.exe，其余用 node
# 注：NODE_BIN 必须在 DEBUG 输出前定义——set -u 下引用未定义变量直接
# 退出（CI 五平台全灭的根因：DEBUG 行先于定义被引入）。
NODE_BIN="node"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows*) NODE_BIN="node.exe" ;;
esac

echo "[stage] DEBUG: uname=$(uname -s) NODE_BIN=$NODE_BIN"
echo "[stage] DEBUG: node exists: $(ls -la "$SRC/vendor/node/$NODE_BIN" 2>&1)"
echo "[stage] DEBUG: bin.js exists: $(ls "$SRC/node_modules/@deepseek-ai/dsh/lib/bin.js" 2>&1)"
echo "[stage] DEBUG: package.json exists: $(ls "$SRC/package.json" 2>&1)"
echo "[stage] DEBUG: assets/plugins exists: $(ls -d "$SRC/assets/plugins" 2>&1)"
echo "[stage] DEBUG: node_modules count: $(ls "$SRC/node_modules" 2>/dev/null | wc -l)"

for f in package.json "vendor/node/$NODE_BIN" \
         node_modules/@deepseek-ai/dsh/lib/bin.js \
         scripts/lib/companion-profile.js assets/plugins; do
  if [ ! -e "$SRC/$f" ]; then
    echo "[stage] 缺少运行时必需件: dsh-desktop/$f —— 先在 dsh-desktop/ npm install" >&2
    exit 1
  fi
done

mkdir -p "$DST/vendor/node" "$DST/node_modules"

# robocopy 退出码 0-7 全部是成功（1=有复制 2=有额外 3=1+2 …），≥8 才是失败。
# 注：Git Bash 下 flag 需写 //MIR 形式（MSYS 会把 /MIR 当路径转换）。
rc() { mirror_dir "$1" "$2"; }

# ---- 根文件：全部根级 *.js + package.json（历史对齐 electron-builder files
#      白名单形态，Electron 壳退役后仅剩 boot 链脚本；scripts/ 等经
#      require('../../profile-manifest') 直引根级脚本——缺一件 boot 链即断，
#      实测曾漏 profile-manifest.js 导致安装包首启全灭）。package-lock.json
#      不带（payload 不做 npm install）。----
# 根文件只拷 *.js + package.json（非全目录镜像）
  for f in "$SRC"/*.js "$SRC"/package.json; do
    [ -f "$f" ] && cp -f "$f" "$DST/"
  done

# ---- scripts / assets：全量镜像 ----
# assets 下混着两类 node_modules，必须区别对待（v0.6.2 本地构建踩坑定案）：
#   • 正件：dsh-hub（731 个跟踪文件）/ graph-memory（1177）/ billion-context-dsh
#     （165）的 node_modules 是 git 跟踪进来的，插件运行期直接 require 它们，
#     剔掉就是装完即挂（“全量 /XD node_modules”的错法，CI 口径也会被打穿）。
#   • 残留：插件目录里本机跑过 pnpm/npm install 留下的 node_modules（gitignored，
#     实测本晚 dsh-better-sidebar pnpm install 出 433MB）。pnpm 的 .pnpm 内容存储被
#     robocopy 跟 junction 展开成真实路径后，NSIS 的 File 指令在 >260 字符处
#     “failed opening file”直接中断建包（abort 于 installer.nsi:15383）。
# 手法：//XD .pnpm 先把唯一会撑爆路径的形态挡在复制之外（全仓无任何被跟踪的
# .pnpm 路径，三个正件树内也无），再按「git 有无跟踪」逐个剔除本地安装残留——
# 判据自描述，新增正件插件无需改脚本；非 git 工作树（如发布 tarball 构建）
# 整体跳过，宁留不误删。/XD 同时挡住 /MIR 删除，故 .pnpm 残留另需一行显式清理。
mirror_dir "$SRC/scripts" "$DST/scripts"
mirror_dir "$SRC/assets" "$DST/assets" //XD .pnpm
find "$DST/assets" -type d -name .pnpm -prune -exec rm -rf {} + 2>/dev/null || true
if [ -n "$(git -C "$REPO_ROOT" rev-parse --is-inside-work-tree 2>/dev/null)" ]; then
  for d in "$DST/assets/plugins"/*/; do
    [ -d "$d/node_modules" ] || continue
    name="$(basename "$d")"
    if [ -z "$(git -C "$REPO_ROOT" ls-files -- "dsh-desktop/assets/plugins/$name/node_modules" | head -1)" ]; then
      echo "[stage] 剔除 gitignored 插件依赖树（本机安装残留）: $name/node_modules"
      rm -rf "$d/node_modules"
    fi
  done
fi

# ---- vendor：node 二进制（$NODE_BIN——win 为 node.exe，unix 为 node）+ npm 全量（插件安装/更新链用到）----
# PD1 对账修复：历史 staging 残留会把另一平台的 node 二进制留在 DST（本机
# win 包曾混入 115MB 的 unix node，110MB vs 官方 72MB 的最大单项）——每次
# 显式清掉非本平台那份（与 CI 便携版 rm -f vendor/node/node 同口径）。
if [ "$NODE_BIN" = node.exe ]; then
  rm -f "$DST/vendor/node/node"
else
  rm -f "$DST/vendor/node/node.exe"
fi
cp -f "$SRC/vendor/node/$NODE_BIN" "$DST/vendor/node/$NODE_BIN"
mirror_dir "$SRC/vendor/npm" "$DST/vendor/npm"

# ---- vendor/dsh-kernel：内核离线 tarball（compat-pin 运行期校验器据此核对内核
#      版本，缺版本混装防线）。此目录必须与源全量同步——历史遗漏该步导致 payload
#      残留上一版内核 tarball，内核升级后 validate-pin 以「版本混装」FAIL（boot
#      期同名校验器亦会 fail-closed 拒启）。全量 /MIR 镜像以清除陈旧版本。----
mirror_dir "$SRC/vendor/dsh-kernel" "$DST/vendor/dsh-kernel"

# ---- node_modules：生产依赖全量（排除面与 CI「Stage payload (CI simplified)」
#      逐项对齐——PD1 对账：本地只排 devDeps 三件，比 CI 少排了 @electron 与
#      darwin/wasm 原生模块，win 包混入 ~28MB 死重。robocopy /XD 按目录名
#      （basename）匹配，scoped 目录用末段名即可命中；electron-to-chromium
#      等兄弟名不受影响）----
mirror_dir "$SRC/node_modules" "$DST/node_modules" \
   //XD electron electron-builder electron-winstaller @electron \
   sharp-darwin-arm64 sharp-libvips-darwin-arm64 sharp-wasm32 koffi-darwin-arm64 \
   codex-win32-x64 claude-agent-sdk-win32-x64
# robocopy /XD 语义陷阱：排除目录同时被挡在「复制」与「/MIR 删除」之外——
# 此前 staging 残留在 DST 的 darwin/wasm 二进制（PD1：~27MB 死重）不会被
# /MIR 清掉，必须显式删除（与 CI staging 的 rm -rf 行逐项同口径）。
# Codex/Claude 原生二进制（codex-win32-x64 ~374MB、claude-agent-sdk-win32-x64
# ~323MB）：内核子代理适配器仅在【真正拉起子代理进程】时才解析这些 optional
# 平台二进制；import 阶段只读 JS 侧 metapackage（@openai/codex 的 package.json /
# @anthropic-ai/claude-agent-sdk 的 sdk.mjs 惰性解析）。仅排除这两个原生包，
# 保留 metapackage 以免断 import 图。
rm -rf "$DST/node_modules/electron" "$DST/node_modules/electron-builder" \
       "$DST/node_modules/electron-winstaller" "$DST/node_modules/@electron" \
       "$DST/node_modules/@img/sharp-darwin-arm64" "$DST/node_modules/@img/sharp-libvips-darwin-arm64" \
       "$DST/node_modules/@img/sharp-wasm32" "$DST/node_modules/@koromix/koffi-darwin-arm64" \
       "$DST/node_modules/@openai/codex-win32-x64" "$DST/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64"

# ---- rc7 客户端包 vendor（历史层：内核侧 fallback farm 兜底）----
# PD1 对账修复：来源不再依赖本机 0.4.1 构建产物 dist/win-unpacked 的整棵
# node_modules（残留闭包会把 ~98 个非必需包 + darwin/wasm 二进制混进 win 包
# ——本地 110MB vs 官方 72MB 的主因之一，且依赖「这台机器恰好打过 0.4.1」
# 这一巧合）。改为与 CI「Download rc7 client packages」同源同版本：
#   1) RC7 源目录（= build-client-compat.mjs 硬编码读取的路径）按 8 包闭包
#      全集「缺哪补哪」——本机已有 0.4.1 残留时零下载、字节不变；新 clone
#      从 npm registry 拉（registry.npmjs.org / npmmirror 均已收录）。
#   2) vendor 只补这 8 个包（CI 同口径），不再全量镜像残留闭包。
# 闭包全集：6 个 rc.7 客户端包 + build-client-compat.mjs 闭包 BFS 必需的
# use-sync-external-store@1.2.0（web-react 依赖）、@deepseek-ai/schemastery
# @3.18.1（schema-form 依赖）及其传递依赖 @standard-schema/spec@1.1.0 与
# @deepseek-ai/cosmokit@1.8.2——v0.5.2 官方包正是缺闭包依赖导致 compat 静默失败。
VENDOR_SRC="$REPO_ROOT/dsh-desktop/dist/win-unpacked/resources/app/node_modules"
RC7_PKGS=(
  "@deepseek-ai/dsh-client-web-react@0.1.0-rc.7"
  "@deepseek-ai/dsh-client-schema-form@0.1.0-rc.7"
  "@deepseek-ai/dsh-client-ui-primitives@0.1.0-rc.7"
  "@deepseek-ai/dsh-client-ui-slots@0.1.0-rc.7"
  "@deepseek-ai/dsh-client-ui-attachment@0.1.0-rc.7"
  "@deepseek-ai/dsh-client-ui-renderer@0.1.0-rc.7"
  "use-sync-external-store@1.2.0"
  "@deepseek-ai/schemastery@3.18.1"
  "@standard-schema/spec@1.1.0"
  "@deepseek-ai/cosmokit@1.8.2"
)
mkdir -p "$VENDOR_SRC"
rc7_fail=0
for spec in "${RC7_PKGS[@]}"; do
  name="${spec%@*}"
  if [ ! -d "$VENDOR_SRC/$name" ]; then
    echo "[stage] rc7 源缺 $name —— npm pack $spec ..."
    # fetch 超时收紧（默认可达数分钟，registry 不可达时拖死全流程）；主
    # registry 失败回落 npmmirror（国内网络环境实测可达，CI 无此问题）。
    tgz="$(cd "$VENDOR_SRC" && npm pack "$spec" --fetch-timeout=20000 --fetch-retries=1 2>/dev/null | tail -1)" || true
    if [ ! -f "$VENDOR_SRC/$tgz" ]; then
      echo "[stage] npm pack 主 registry 失败: $spec —— 回落 registry.npmmirror.com"
      tgz="$(cd "$VENDOR_SRC" && npm pack "$spec" --registry=https://registry.npmmirror.com --fetch-timeout=20000 --fetch-retries=1 2>/dev/null | tail -1)" || true
    fi
    if [ ! -f "$VENDOR_SRC/$tgz" ]; then
      echo "[stage] WARN: npm pack 失败: $spec（两个 registry 均不可达？）" >&2
      rc7_fail=1
      continue
    fi
    tmp=$(mktemp -d)
    tar -xzf "$VENDOR_SRC/$tgz" -C "$tmp"
    mkdir -p "$VENDOR_SRC/$name"
    cp -r "$tmp/package/." "$VENDOR_SRC/$name/"
    rm -rf "$tmp" "$VENDOR_SRC/$tgz"
  fi
done
vendored=0
for spec in "${RC7_PKGS[@]}"; do
  name="${spec%@*}"
  if [ -d "$VENDOR_SRC/$name" ] && [ ! -d "$DST/node_modules/$name" ]; then
    # robocopy 成功码为 1-7（≠0），set -e 下裸调会被误杀——同 rc() 护栏。
    set +e
    mirror_dir "$VENDOR_SRC/$name" "$DST/node_modules/$name"
    rcv=$?
    set -e
    [ $rcv -lt 8 ] || { echo "[stage] vendor 失败($rcv): $name" >&2; exit 1; }
    vendored=$((vendored+1))
  fi
done
echo "[stage] vendor rc7 客户端闭包：补 $vendored 个缺失包（10 包 CI 同口径；内核侧 fallback farm 兜底）"
if [ "$rc7_fail" -ne 0 ]; then
  echo "[stage] WARN: rc7 npm 源不完整——compat 门禁（下方）将拦截缺件包" >&2
fi

# ---- 页面端 client-compat（「missed the module table」的真修复）----
# 必须在 node_modules //MIR 之后：compat 会向 payload 的 dsh-web-frontend
# dist 注入 index.html <script> 与 assets/client-compat.js，先跑会被镜像冲掉。
# PD1 门禁：构建器失败可以只告警，但产物不允许缺——v0.5.2 官方包正是 compat
# 闭包缺包被 WARN 静默吞掉而缺 client-compat.js 出厂（插件端 missed the
# module table 常态化）。缺件即 fail-fast，拒绝再打病包。
node "$REPO_ROOT/dsh-tauri/scripts/build-client-compat.mjs" 2>&1 || echo "[stage] WARN: client-compat 构建报错（见上）——以下门禁校验产物在位性"
COMPAT_OUT="$DST/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/client-compat.js"
if [ ! -f "$COMPAT_OUT" ]; then
  echo "[stage] FATAL: $COMPAT_OUT 缺失——client-compat 闭包失败（rc7 源缺包？），拒绝打包" >&2
  exit 1
fi
echo "[stage] OK: client-compat.js 在位 ($(wc -c < "$COMPAT_OUT" | tr -d ' ') bytes)"

# ---- 补丁收口门禁（2026-09-05 实错拦截）----
# payload 的 node_modules 是 dev 树的镜像：dev 树一旦落后于 patch-registry，
# 已声明的修复就静默不进安装包（实测：0.6.2 payload 缺 4 枚 file 补丁 +
# session-load-graceful v2，而全套测试当时全绿——它只核接线结构，不看磁盘字节）。
# 更坑的是运行期也补不回来：升级补丁的 transform 代码本身就在没带上的那份里。
# 判据与 dev 树单测共用 dsh-desktop/scripts/lib/patch-closure，不留两套口径。
if ! node "$REPO_ROOT/dsh-desktop/scripts/verify-payload-patches.js" "$DST"; then
  echo "[stage] FATAL: payload 补丁未收口——拒绝打包；按上方 LAG 清单回 dev 树跑" \
       "node scripts/patch-deps.js 后重跑 stage" >&2
  exit 1
fi

echo "[stage] 完成。体积统计："
du -sm "$DST" "$DST/node_modules" "$DST/vendor" "$DST/assets" 2>/dev/null

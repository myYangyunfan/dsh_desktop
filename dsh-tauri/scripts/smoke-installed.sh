#!/usr/bin/env bash
# smoke-installed.sh —— 安装布局冒烟（不跑真安装器，不碰真实用户数据）
# ==========================================================================
# 为什么不跑 NSIS 安装器：installerHooks 的 PREINSTALL 会检测并【静默卸载】
# 本机真实 Electron 版 DSH Desktop（保数据但卸应用）——冒烟阶段绝不允许。
# 改为手工拼出与安装器完全一致的目录布局，再以重定向环境运行：
#
#   $SMOKE/
#     dsh-tauri-app.exe           ← release 产物（bin 名；exe-walk 不看名）
#     resources/dsh-desktop/      ← package-payload（内核）
#     resources/sidecar/  ui/     ← 同 resources 映射
#
# ⚠ 与真安装器有一处**故意保留**的差异：NSIS 的 resources 用
#   `File /a "/oname=<映射名>"` 直落 `$INSTDIR`（扁平，实测 D:\app\DSH Desktop\
#   dsh-desktop\），而这里放在 resources/ 下。别「对齐」成扁平——扁平布局会让
#   dsh_cli.rs 的 install_root()（= exe 目录）命中，ensure_dsh_cli_shim 于是真的
#   写 dsh.cmd 并把安装根**追加进用户 PATH（HKCU\Environment）**：冒烟不该动
#   注册表。现形态下该自检以「内核/node 不在位（…\dsh-desktop\…）」告警跳过，
#   既不影响 boot，也把 PATH 副作用隔在冒烟之外（真机的 shim 由安装器布局负责）。
#
# 环境隔离：DSH_HOME / DSH_TAURI_USERDATA 指向 $SMOKE 下临时目录
# （Rust 与 Node 两侧同口径，见 shell-core paths.rs 生产覆盖通道）。
#
# 判定（避免本机正式版 node.exe 污染）：启动前后 LISTENING 端口 PID 差集
# ≥2（preview-server + 内核）且隔离 profile 建立；杀壳后差集端口归零
# （Job Object 收割验证）。
# **插件加载断言**（用户实测「插件全灭+侧边栏消失」曾是冒烟盲区）：内核
# stderr 经 supervisor 转发到 app.log（"[supervisor] web| …"），出现
# "Failed to load plugins" / "missed the module table" 即 FAIL。
# **真实 profile 模式**：REAL_PROFILE=1 时先把本机真实 ~/.dsh 镜像到隔离
# home 再跑——复现用户实装数据形态（旧 profile/旧插件副本），仍是零接触。
# 用法：bash dsh-tauri/scripts/smoke-installed.sh [REAL_PROFILE=1]
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# 本机 gnu 线的产物在仓库外的 CARGO_TARGET_DIR 且三元组不同，硬编码 msvc 路径
# 会「缺 release exe」直接退出——留 TARGET_DIR 覆盖通道（与 SMOKE_DIR 同风格），
# 默认仍是 CI 的 msvc 布局。
TARGET_DIR="${TARGET_DIR:-$REPO_ROOT/dsh-tauri/src-tauri/target/x86_64-pc-windows-msvc/release}"
EXE="$TARGET_DIR/dsh-tauri-app.exe"
SMOKE="${SMOKE_DIR:-/tmp/dsh-tauri-smoke}"

listening_pids() { netstat -ano 2>/dev/null | grep -i LISTENING | awk '{print $NF}' | sort -u; }

[ -f "$EXE" ] || { echo "[smoke] 缺 release exe: $EXE"; exit 1; }

echo "[smoke] 布局组装: $SMOKE"
rm -rf "$SMOKE"; mkdir -p "$SMOKE/resources" "$SMOKE/home" "$SMOKE/ud"
cp -f "$EXE" "$SMOKE/"
# gnu 工具链的 exe 动态导入 WebView2Loader.dll（安装布局中由安装器旁路在 exe
# 同目录，见 installer.nsi 的 File /oname=WebView2Loader.dll；msvc 静态链接无
# 此依赖）。只复制 exe 会让冒烟壳启动即死——且 MSYS 报错会把缺失文件名误报成
# 一个无关的 api-ms-* 系统 DLL，排查时先查这里。
cp -f "$TARGET_DIR"/*.dll "$SMOKE/" 2>/dev/null || true
for pair in "package-payload/dsh-desktop:dsh-desktop" "sidecar:sidecar" "ui:ui"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  robocopy "$REPO_ROOT/dsh-tauri/$src" "$SMOKE/resources/$dst" //MIR //R:1 //W:1 > /dev/null
  rc=$?; [ $rc -lt 8 ] || { echo "[smoke] robocopy 失败($rc): $src"; exit 1; }
done

# ---- 内置插件随包断言（v1.0.0 内置线）----
# 安装包必须带插件源：payload 的门禁在 stage 阶段跑过，这里核**安装布局**这一份
# （robocopy //MIR 组布局与真实安装包同源），防止「stage 通过、装出来是空的」。
src_n=$( (find "$REPO_ROOT/dsh-desktop/assets/plugins" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true) | wc -l | tr -d ' ')
ship_n=$( (find "$SMOKE/resources/dsh-desktop/assets/plugins" -mindepth 1 -maxdepth 1 -type d 2>/dev/null || true) | wc -l | tr -d ' ')
if [ "$ship_n" != "$src_n" ] || [ "$ship_n" = "0" ]; then
  echo "[smoke] ✗ 安装布局里的内置插件不完整：仓库源 ${src_n} 个 / 包内 ${ship_n} 个"
  exit 1
fi
echo "[smoke] ✓ 内置插件随包：${ship_n} 个插件源在安装布局内"

# ---- 出厂补丁在位断言 ----
# 动机：“补丁只存在于 dev 树、安装树自带旧 scripts 因而 never 生效”这类失效
# （实测“某些多模态模型仍说收不到图片”的真成因），在装完之后才暴露代价极高。
# payload 是最终交付物：脚本缺件即硬失败（boot 链无补丁可应用）；产物是否已预打
# 只做情报——CI 从干净 vendor 构建时 node_modules 是 pristine，boot 链首启才落盘，
# 把它当失败会误拦健康包。
assert_shipped_patch() {
  id="$1"; script="$2"; target="$3"; marker="$4"
  if [ ! -f "$SMOKE/resources/dsh-desktop/$script" ]; then
    echo "[smoke] ✗ 补丁脚本未随包出厂: $id（缺 $script）——安装后 boot 链不会应用它"
    exit 1
  fi
  if grep -qF "$marker" "$SMOKE/resources/dsh-desktop/node_modules/$target" 2>/dev/null; then
    echo "[smoke] ✓ 补丁 $id 在位：脚本 + 产物已预打"
  else
    echo "[smoke] ✓ 补丁 $id 在位：脚本已随包，产物由 boot 链首启落盘"
  fi
}
assert_shipped_patch model-image-input \
  "scripts/lib/patch-model-image-input.js" \
  "@deepseek-ai/dsh-client-ui-settings-models/lib/client.js" \
  "model image-input checkbox"

PRE_PIDS=$(listening_pids)

# 真实 profile 模式：镜像本机 ~/.dsh（只读源 → 隔离 home；写发生在副本上）。
if [ "${REAL_PROFILE:-0}" = "1" ]; then
  echo "[smoke] REAL_PROFILE=1：镜像真实 ~/.dsh → 隔离 home（写零接触）"
  # 镜像经 PowerShell 调 robocopy：Git Bash 直调对个别 junction 目标有
  # 编码伪影（实测同参数 bash rc=9 / powershell rc=1）。撞上用户实例写入
  # 时重试一次。
  SRC_W=$(cygpath -w "$USERPROFILE/.dsh"); DST_W=$(cygpath -w "$SMOKE/home")
  run_mirror() {
    powershell -Command "robocopy '$SRC_W' '$DST_W' /MIR /R:2 /W:2 /NP /NFL /NDL" > /dev/null 2>&1
    return $?
  }
  run_mirror; rc=$?
  if [ $rc -ge 8 ]; then
    echo "[smoke] 镜像首次失败($rc)，重试一次"
    sleep 2
    run_mirror; rc=$?
  fi
  [ $rc -lt 8 ] || { echo "[smoke] 真实 home 镜像失败($rc)"; exit 1; }
  # home fallback farm 的 junction 指向用户旧安装——全量重指到冒烟 payload
  # （模拟真实机上 healProfilesModuleFallback 对新安装的自动重指）。只重指
  # 部分曾致 koffi/sharp 等原生包解析到旧安装而产生伪失败。
  # SMOKE_KEEP_FARM=1：跳过重指（用户保真态——复现 farm 相关差异）。
  if [ "${SMOKE_KEEP_FARM:-0}" != "1" ]; then
  FARM="$SMOKE/home/profiles/node_modules"
  PLNM="$SMOKE/resources/dsh-desktop/node_modules"
  repointed=0
  for d in "$PLNM"/@*/*/; do
    [ -d "$d" ] || continue
    scope="$(basename "$(dirname "$d")")"; name="$(basename "$d")"; rel="$scope/$name"
    if [ -e "$FARM/$rel" ]; then rm -rf "$FARM/$rel"; robocopy "$d" "$FARM/$rel" //MIR //R:1 //W:1 > /dev/null; repointed=$((repointed+1)); fi
  done
  for d in "$PLNM"/*/; do
    name="$(basename "$d")"; [ "$name" = "@deepseek-ai" ] && continue
    case "$name" in .bin|*.json) continue ;; esac
    if [ -e "$FARM/$name" ]; then rm -rf "$FARM/$name"; robocopy "$d" "$FARM/$name" //MIR //R:1 //W:1 > /dev/null; repointed=$((repointed+1)); fi
  done
  # 原生模块兜底（T1 实测：farm 缺 koffi/sharp/@img/node-pty 时
  # attachment/subprocess/sandbox 条目隔离失败——补进 farm 使命中
  # 「健康机器」形态；真实机上这是内核 farm-heal 的覆盖面问题，双线同症）。
  for nat in koffi sharp @img node-pty; do
    src="$PLNM/$nat"
    [ -d "$src" ] || continue
    if [ "$nat" = "@img" ]; then
      mkdir -p "$FARM/@img"
      for sub in "$src"/*/; do
        [ -d "$sub" ] || continue
        rm -rf "$FARM/@img/$(basename "$sub")"
        robocopy "$sub" "$FARM/@img/$(basename "$sub")" //MIR //R:1 //W:1 > /dev/null
        repointed=$((repointed+1))
      done
    else
      rm -rf "$FARM/$nat"
      robocopy "$src" "$FARM/$nat" //MIR //R:1 //W:1 > /dev/null
      repointed=$((repointed+1))
    fi
  done
  echo "[smoke] 前端/原生包 fallback 已重指 $repointed 项到冒烟 payload"
  else
    echo "[smoke] SMOKE_KEEP_FARM=1：farm 保持用户原样（保真态）"
  fi
fi
# 页面级证据通道常开：DIAG 探针把 console.error/error/rejection 回传
# app.log（[diag-title] 行）——「missed the module table」类页面错误的
# 唯一可靠断言来源（内核 stderr 是假阴性）。
export DSH_TAURI_DIAG=1

# 单实例守卫前置检查：已运行的 DSH Desktop 会让冒烟壳让位（tauri_plugin_single_instance
# → supervisor 零日志、boot 永不就绪、冒烟误 FAIL），且收尾 //IM 强杀会误杀用户实例
# （T4 已知风险）。两败俱伤，直接拒绝执行。
if tasklist //FI "IMAGENAME eq dsh-tauri-app.exe" 2>/dev/null | grep -q dsh-tauri-app.exe; then
  echo "[smoke] === ABORT：检测到已运行的 DSH Desktop 实例 ==="
  echo "[smoke] 单实例守卫会让冒烟壳让位（boot 永不就绪），收尾强杀也会误杀用户实例。"
  echo "[smoke] 请完全退出 DSH Desktop（托盘退出）后重跑本脚本。"
  exit 1
fi

echo "[smoke] 启动（DSH_HOME/DSH_TAURI_USERDATA 全隔离），日志 → $SMOKE/app.log"
DSH_HOME="$(cygpath -w "$SMOKE/home")" \
DSH_TAURI_USERDATA="$(cygpath -w "$SMOKE/ud")" \
  "$(cygpath -w "$SMOKE/dsh-tauri-app.exe")" > "$SMOKE/app.log" 2>&1 &
SHELL_PID=$!
# $! 是 Git Bash(MSYS) 内部 PID，taskkill 不认；/proc/<pid>/winpid 才是
# Windows PID（T1 实测：不转换则收尾 //PID 必失败，退化为 //IM 全杀）。
WINPID=$(cat "/proc/$SHELL_PID/winpid" 2>/dev/null || echo "$SHELL_PID")
echo "$WINPID" > "$SMOKE/shell.pid"

ok=""
for i in $(seq 1 36); do
  sleep 5
  NEW=$(listening_pids | comm -13 <(echo "$PRE_PIDS") - | grep -c . )
  # 建档判据用 profiles/web/package.json（profile 根的 bundles 清单，纯净线与插件线都会写）。
  # 曾用 cordis.patch.yml——那是「随包插件声明 dsh.bundle.patch」才生成的文件，
  # v1.0.0 纯净线 payload 不含内置插件（stage 有门禁），该文件恒不存在 → 冒烟恒红。
  if tasklist //FI "IMAGENAME eq dsh-tauri-app.exe" 2>/dev/null | grep -q dsh-tauri-app.exe \
     && [ "${NEW:-0}" -ge 2 ] \
     && [ -f "$SMOKE/home/profiles/web/package.json" ]; then
    ok=1; echo "[smoke] ✓ 第 $((i*5))s：新增监听者=${NEW}（preview+内核）+ 隔离 profile 建立"; break
  fi
done

echo "[smoke] --- 隔离 home 树 ---"; find "$SMOKE/home" -maxdepth 3 | head -8
echo "[smoke] --- 隔离 userData 树 ---"; find "$SMOKE/ud" -maxdepth 2 | head -8
echo "[smoke] --- app.log 尾部 ---"; tail -6 "$SMOKE/app.log" 2>/dev/null

# 插件加载断言：内核转发行里出现任一致命串即 FAIL（曾经的冒烟盲区）。
if grep -q "Failed to load plugins\|missed the module table\|invalid plugin\|entry crashed\|slot entry\|did not activate\|failed to mount" "$SMOKE/app.log" 2>/dev/null; then
  echo "[smoke] ✗ 检出插件加载失败："
  grep -m 4 "Failed to load plugins\|missed the module table\|web|" "$SMOKE/app.log" | head -6
  taskkill //IM "dsh-tauri-app.exe" //F //T > /dev/null 2>&1
  echo "[smoke] === FAIL（插件加载错误）==="
  exit 1
fi
echo "[smoke] ✓ 插件加载零致命错误"

# ---- 内置线端到端断言：包里的插件源真的被 boot 镜像进了 profile ----
# 「装进去了」不等于「开箱可用」：sync 步在开机时把 payload 的 assets/plugins 镜像进
# <DSH_HOME>/profiles/<name>/node_modules/，这一步没跑通用户看到的还是空插件页。
# 只判「有没有」不判条数——装机首启的镜像量与 keep-newer 判定有关，钉死数字会变成假红。
plugged=0
for i in 1 2 3 4 5 6; do
  n=$( (find "$SMOKE/home/profiles/web/node_modules" -mindepth 2 -maxdepth 2 -name package.json 2>/dev/null || true) | wc -l | tr -d ' ')
  if [ "${n:-0}" -ge 5 ]; then plugged=1; echo "[smoke] ✓ 内置插件已镜像进 profile（node_modules 内 ${n} 个包）"; break; fi
  sleep 5
done
if [ "$plugged" != "1" ]; then
  echo "[smoke] ✗ boot 未把包内插件镜像进 profile（node_modules 里不足 5 个包）——内置线端到端断了"
  find "$SMOKE/home/profiles/web/node_modules" -maxdepth 2 2>/dev/null | head -6
  taskkill //IM "dsh-tauri-app.exe" //F //T > /dev/null 2>&1
  exit 1
fi

# ---- 深检：page-error 全量溯源 + 内核端点抽检 + 轻压测（内核存活时进行） ----
echo "[smoke] --- page-error 全量（溯源 failed-to-fetch 类） ---"
grep "\[page-error" "$SMOKE/app.log" 2>/dev/null | sort | uniq -c | head -8
PE_N=$(grep -c "\[page-error" "$SMOKE/app.log" 2>/dev/null || echo 0)
echo "  page-error 总数：${PE_N}"
KPORT=$(grep -o "dsh web: http://127.0.0.1:[0-9]*" "$SMOKE/app.log" | grep -o '[0-9]*$' | head -1)
if [ -n "$KPORT" ] && curl -s -o /dev/null -m 2 "http://127.0.0.1:$KPORT/"; then
  echo "[smoke] --- 内核端点抽检（port=$KPORT） ---"
  for ep in "/" "/ds-offpeak/state"; do
    printf "  GET %-18s → " "$ep"
    curl -s -o /dev/null -m 3 -w "%{http_code} %{time_total}s
" "http://127.0.0.1:$KPORT$ep"
  done
  echo "[smoke] --- 轻压测（20 并发 GET /） ---"
  # 只等这 20 个 curl：裸 wait 会连 line 116 的 app 本体（永不退出）一起等，
  # 成功路径必卡死（T1 实测 PASS 不可达）。
  stress_pids=""
  for i in $(seq 1 20); do curl -s -o /dev/null -m 5 -w "%{http_code}
" "http://127.0.0.1:$KPORT/" & stress_pids="$stress_pids $!"; done > "$SMOKE/stress.txt"
  wait $stress_pids
  echo "  200 应答：$(grep -c '^200$' "$SMOKE/stress.txt")/20"
else
  echo "[smoke] （内核端口未就绪或已收尾，跳过端点抽检）"
fi

echo "[smoke] 收尾：杀壳（Job Object 预期同步收割内核树）"
# T4 反馈：优先按记录 PID 杀（//IM 全杀同名进程会误伤共享机上的用户实例）。
if [ -f "$SMOKE/shell.pid" ]; then
  taskkill //PID "$(cat "$SMOKE/shell.pid")" //T //F > /dev/null 2>&1
fi
taskkill //IM "dsh-tauri-app.exe" //F //T > /dev/null 2>&1
sleep 3
# 残留判定收紧到「本应用家属进程」：裸 PID 差集在真实用户机上会被窗口期内
# 新开的浏览器/后台服务端口污染（实测 bilibili/wps 等随机命中 → 冒烟误报
# FAIL）。只有 dsh-tauri-app.exe / node.exe 持有的新增监听才算泄漏。
RESIDUAL=$(listening_pids | comm -13 <(echo "$PRE_PIDS") - | while read -r p; do
  [ -n "$p" ] || continue
  img=$(tasklist //FI "PID eq $p" //FO CSV //NH 2>/dev/null | cut -d',' -f1 | tr -d '"')
  case "$img" in
    dsh-tauri-app.exe|node.exe) echo "$p($img)";;
  esac
done)
NEW_AFTER=$(echo "$RESIDUAL" | grep -c . )
echo "[smoke] 杀壳后应用家属进程监听残留: ${NEW_AFTER}（预期 0）${RESIDUAL:+  ← $RESIDUAL}"

if [ -n "$ok" ] && [ "${NEW_AFTER:-1}" -eq 0 ]; then
  echo "[smoke] === PASS ==="
else
  echo "[smoke] === FAIL（boot=$ok 应用残留监听=${NEW_AFTER:-?}）==="
  exit 1
fi

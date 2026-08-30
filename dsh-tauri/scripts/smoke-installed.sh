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
TARGET_DIR="$REPO_ROOT/dsh-tauri/src-tauri/target/x86_64-pc-windows-msvc/release"
EXE="$TARGET_DIR/dsh-tauri-app.exe"
SMOKE="${SMOKE_DIR:-/tmp/dsh-tauri-smoke}"

listening_pids() { netstat -ano 2>/dev/null | grep -i LISTENING | awk '{print $NF}' | sort -u; }

[ -f "$EXE" ] || { echo "[smoke] 缺 release exe: $EXE"; exit 1; }

echo "[smoke] 布局组装: $SMOKE"
rm -rf "$SMOKE"; mkdir -p "$SMOKE/resources" "$SMOKE/home" "$SMOKE/ud"
cp -f "$EXE" "$SMOKE/"
for pair in "package-payload/dsh-desktop:dsh-desktop" "sidecar:sidecar" "ui:ui"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  robocopy "$REPO_ROOT/dsh-tauri/$src" "$SMOKE/resources/$dst" //MIR //R:1 //W:1 > /dev/null
  rc=$?; [ $rc -lt 8 ] || { echo "[smoke] robocopy 失败($rc): $src"; exit 1; }
done

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
  if tasklist //FI "IMAGENAME eq dsh-tauri-app.exe" 2>/dev/null | grep -q dsh-tauri-app.exe \
     && [ "${NEW:-0}" -ge 2 ] \
     && [ -f "$SMOKE/home/profiles/web/cordis.patch.yml" ]; then
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

//! ACP 托管族（桌面内托管 Agent Client Protocol 服务，供 Zed/Cursor 等外部
//! ACP 客户端驱动 DSH agent）。
//!
//! ACP server = `node bin.js --profile acp`（内核 bundle/acp-app，stdio
//! JSON-RPC；数据目录 $DSH_HOME/profiles/acp，与桌面 web 实例同 home、不同
//! profile）。协议本质是**外部客户端 spawn server 拿 stdio**，桌面无法代持
//! 长驻连接——「托管」因此落在两件事：
//! ①自检：桌面代跑一次 initialize 握手（spawn → 写请求 → 等响应 → 收割），
//!   验证 node/bin.js/物料/路径健康；首跑顺带完成 acp profile 物料初始化；
//! ②导出：生成外部客户端（Zed）的 agent_servers 配置片段（绝对路径）。
//! 入口在托盘菜单（壳层 100% 控制；内核 web UI 不可改）。本模块保持纯逻辑
//! （不触通知/剪贴板/资源管理器），副作用由 lib.rs 托盘分支完成。

use std::io::{Read, Write};
use std::process::Stdio;
use std::time::Duration;

use crate::supervisor::Supervisor;

use super::common::NoWindow;

/// initialize 握手超时：内核冷启动 + profile 物料初始化（首跑写
/// profiles/acp）在慢盘/杀软扫描下可到数秒，15s 覆盖 p99 不至于久等。
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);

/// ACP server spawn 构造（自检专用）：净化环境（env_clear + 白名单，防
/// NODE_OPTIONS 泄漏——spawn_kernel 同款）+ 监管标识 + 三管道 + 抑制终端窗。
fn acp_command(sv: &Supervisor) -> std::process::Command {
    let mut cmd = kernel_process::sanitized_node_command(&sv.node_exe);
    cmd.arg(&sv.bin_js).arg("--profile").arg("acp");
    // 监管标识（spawn_kernel 语义：桌面监管的内核进程可被识别）。
    cmd.env("DSH_DESKTOP_SUPERVISED", "1").env("NO_COLOR", "1");
    // cwd 对齐 spawn_kernel：内核按 cwd/安装根解析 home（portable 布局一致）。
    cmd.current_dir(&sv.app_dir);
    // initialize 握手要写 stdin 读 stdout；stderr 收集供失败死因。
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    // GUI 进程起 console 子进程必须抑制终端窗（common::NoWindow，sidecar 同口径）。
    cmd.creation_flags_no_window();
    cmd
}

/// initialize 响应判定（纯函数，可单测）：合法 JSON-RPC 响应行必带
/// `jsonrpc`/`id`/`result` 三要素——只认三要素齐全，防把内核 banner 日志
/// （可能含 id 字样的路径/时间戳）误判成握手成功。
fn initialize_response_found(chunk: &str) -> bool {
    chunk.contains("\"jsonrpc\"") && chunk.contains("\"id\":1") && chunk.contains("\"result\"")
}

/// 从累计输出提取一句人读摘要（纯函数）：找 initialize 响应行，截前 200
/// 字符（protocolVersion/serverInfo 等；超长兜底防 UI 通知被撑爆）。
fn summarize_initialize(chunk: &str) -> Option<String> {
    chunk
        .lines()
        .find(|l| l.contains("\"id\":1") && l.contains("\"result\""))
        .map(|l| {
            let t = l.trim();
            if t.chars().count() <= 200 {
                t.to_string()
            } else {
                let cut: String = t.chars().take(200).collect();
                format!("{cut}…")
            }
        })
}

/// ACP 自检：spawn `--profile acp`，写 initialize 请求，等 JSON-RPC 响应，
/// 收割进程。Ok(摘要) = 物料/路径/协议链全通；Err(死因) = 附 stderr 尾部。
pub fn run_selftest(sv: &Supervisor) -> Result<String, String> {
    let mut child = acp_command(sv)
        .spawn()
        .map_err(|e| format!("ACP server spawn 失败（node: {} cli: {}）: {e}", sv.node_exe.display(), sv.bin_js.display()))?;
    // Agent Client Protocol：JSON-RPC over stdio，行帧。写完**不关 stdin**——
    // EOF 对 server 的语义是退出，握手期必须保持管道。
    let req = concat!(
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","#,
        r#""params":{"protocolVersion":1,"clientCapabilities":{}}}"#,
        "\n",
    );
    if let Some(mut stdin) = child.stdin.take() {
        if let Err(e) = stdin.write_all(req.as_bytes()) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("写入 initialize 请求失败: {e}"));
        }
    }
    // stdout 读线程：管道无读超时，超时控制放主线程 recv_timeout。
    let mut stdout = child.stdout.take().ok_or_else(|| "ACP server stdout 不可读".to_string())?;
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        let mut acc = String::new();
        let mut buf = [0u8; 4096];
        loop {
            match stdout.read(&mut buf) {
                Ok(0) => {
                    let _ = tx.send(Err("ACP server 提前退出（stdout EOF），未收到 initialize 响应".into()));
                    break;
                }
                Ok(n) => {
                    acc.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if initialize_response_found(&acc) {
                        let summary = summarize_initialize(&acc).unwrap_or_else(|| "initialize 握手成功".into());
                        let _ = tx.send(Ok(summary));
                        break;
                    }
                    if acc.len() > 256 * 1024 {
                        let _ = tx.send(Err("输出超长且未见 initialize 响应（可能不是 ACP server 形态）".into()));
                        break;
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(format!("读 ACP server stdout 失败: {e}")));
                    break;
                }
            }
        }
    });
    // stderr 收集线程：kill 后管道关闭 read_to_end 自然返回；失败时当死因。
    let stderr = child.stderr.take();
    let err_thread = stderr.map(|mut s| {
        std::thread::spawn(move || {
            let mut acc = Vec::new();
            let _ = s.read_to_end(&mut acc);
            acc
        })
    });
    let outcome = rx
        .recv_timeout(HANDSHAKE_TIMEOUT)
        .unwrap_or_else(|_| Err(format!("{}s 内未收到 initialize 响应", HANDSHAKE_TIMEOUT.as_secs())));
    // 收割：initialize 阶段 server 尚无子树，kill 足够；wait 防僵尸。
    let _ = child.kill();
    let _ = child.wait();
    let stderr_tail = err_thread
        .and_then(|t| t.join().ok())
        .map(|b| {
            let s = String::from_utf8_lossy(&b).into_owned();
            // 尾部 400 字符足够定位死因（V8 fatal/模块缺失总在末尾），防通知撑爆。
            let cnt = s.chars().count();
            if cnt <= 400 { s } else { s.chars().skip(cnt - 400).collect() }
        })
        .unwrap_or_default();
    outcome.map_err(|e| {
        if stderr_tail.trim().is_empty() {
            e
        } else {
            format!("{e}；stderr 尾部: {stderr_tail}")
        }
    })
}

/// 生成 Zed agent_servers 配置片段（JSONC——Zed 设置支持注释）。路径按
/// JSON 字符串规则转义反斜杠（Windows 绝对路径原样可用）。
pub fn zed_config_snippet(sv: &Supervisor) -> String {
    let node = sv.node_exe.to_string_lossy().replace('\\', "\\\\");
    let bin = sv.bin_js.to_string_lossy().replace('\\', "\\\\");
    format!(
        concat!(
            "// Zed settings.json 片段（agent_servers）——合并进 Zed 设置后重启 Zed。\n",
            "// 数据目录：$DSH_HOME/profiles/acp（与桌面 web 实例同 home、不同 profile，\n",
            "// 首次连接由内核自动初始化物料）。\n",
            "{{\n",
            "  \"agent_servers\": {{\n",
            "    \"DSH (ACP)\": {{\n",
            "      \"command\": \"{node}\",\n",
            "      \"args\": [\"{bin}\", \"--profile\", \"acp\"]\n",
            "    }}\n",
            "  }}\n",
            "}}\n",
        ),
        node = node,
        bin = bin,
    )
}

/// 导出配置片段到日志目录（Shell 层托盘分支随后打开该目录）。
pub fn export_zed_config(sv: &Supervisor) -> Result<std::path::PathBuf, String> {
    let dir = shell_core::DshPaths::resolve().logs;
    std::fs::create_dir_all(&dir).map_err(|e| format!("建日志目录失败（{}）: {e}", dir.display()))?;
    let out = dir.join("acp-zed-config.json");
    std::fs::write(&out, zed_config_snippet(sv)).map_err(|e| format!("写配置片段失败（{}）: {e}", out.display()))?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 响应判定只认 JSON-RPC 三要素齐全：真 initialize 响应命中；内核
    /// banner/日志行与我们的请求回显不命中（误判会把坏物料当健康）。
    #[test]
    fn initialize_response_found_requires_jsonrpc_trio() {
        assert!(initialize_response_found(r#"{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}"#));
        assert!(!initialize_response_found("dsh web: http://127.0.0.1:7388 id:1 ok"));
        assert!(!initialize_response_found(r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#));
        assert!(!initialize_response_found(""));
    }

    /// 摘要取响应行并封顶 200 字符；无响应行时 None（调用方兜底文案）。
    #[test]
    fn summarize_initialize_picks_response_line_and_caps() {
        let got = summarize_initialize("banner\n{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"protocolVersion\":1,\"agentCapabilities\":{}}}\n").unwrap();
        assert!(got.starts_with('{'), "应取响应行: {got}");
        let long = summarize_initialize(&format!("{{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":\"{}\"}}", "x".repeat(500))).unwrap();
        assert_eq!(long.chars().count(), 201, "200 字符 + 省略号");
        assert_eq!(summarize_initialize("no response"), None);
    }

    /// 片段形态：agent_servers 键 + 绝对路径（JSON 转义双反斜杠）+
    /// --profile acp 参数三件套。
    #[test]
    fn zed_config_snippet_embeds_paths_and_profile() {
        let sv = test_supervisor();
        let s = zed_config_snippet(&sv);
        assert!(s.contains("\"agent_servers\""), "缺 agent_servers: {s}");
        assert!(s.contains("\"DSH (ACP)\""), "缺命名条目: {s}");
        // 期望值动态构造（机器无关）：解析到的 node/bin.js 绝对路径必须以
        // JSON 转义形态（反斜杠翻倍）出现在片段里。
        let node = sv.node_exe.to_string_lossy().replace('\\', "\\\\");
        assert!(s.contains(&node), "node 路径须 JSON 转义出现: {s}");
        let bin = sv.bin_js.to_string_lossy().replace('\\', "\\\\");
        assert!(s.contains(&bin), "bin.js 路径须 JSON 转义出现: {s}");
        assert!(s.contains("\"--profile\", \"acp\""), "缺 profile 参数: {s}");
    }

    /// spawn 形态锚点：净化构造 + --profile acp + 监管标识 + 三管道 +
    /// CREATE_NO_WINDOW（托盘自检通道与 sidecar/内核 spawn 同纪律）。
    #[test]
    fn acp_command_shape() {
        let sv = test_supervisor();
        let cmd = acp_command(&sv);
        let dbg = format!("{cmd:?}");
        assert!(dbg.contains("--profile") && dbg.contains("acp"), "缺 --profile acp: {dbg}");
        assert!(dbg.contains("bin.js"), "缺内核入口: {dbg}");
        // env/stdio 标志不出现在 Command Debug 输出里，形态断言走源码锚点。
        let src = include_str!("acp.rs").replace("\r\n", "\n");
        let seg = src.split("fn acp_command").nth(1).and_then(|s| s.split("\n}").next()).expect("acp_command 段");
        assert!(seg.contains("sanitized_node_command"), "必须经净化构造: {seg}");
        assert!(seg.contains("DSH_DESKTOP_SUPERVISED"), "缺监管标识: {seg}");
        assert!(seg.contains("creation_flags_no_window"), "必须抑制终端窗: {seg}");
        assert!(seg.contains("Stdio::piped()"), "三管道必须就位: {seg}");
    }

    /// 测试替身：Supervisor 字段全 pub 但手工构造字段过多，走真构造器——
    /// Supervisor::new 接**安装根**（dsh-desktop 的父目录，repo_root 同语义；
    /// CI 无依赖环境时整个测试模块用 assert 早退跳过）。
    fn test_supervisor() -> Supervisor {
        let mut dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        for _ in 0..4 {
            if dir.join("dsh-desktop").exists() {
                break;
            }
            dir = dir.parent().unwrap().to_path_buf();
        }
        assert!(dir.join("dsh-desktop").exists(), "仓库检出不含 dsh-desktop，无法构造替身");
        Supervisor::new(&dir)
    }
}

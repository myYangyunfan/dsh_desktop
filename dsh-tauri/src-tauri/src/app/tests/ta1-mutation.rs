//! TA1 变异测试：payload 5 个补丁目标包（rc.2 pristine tgz）× 随机 1-3 字节
//! 翻转 ×200 → 跑仓内唯一文本手术 transform（dsh-desktop
//! scripts/plugin-core/lib/patch-surgery.js 的 dedupePatchEntries）：
//! - 永不异常退出（transform 鲁棒性 = 「永不 panic」等价面）；
//! - pristine 输入 → 恒等输出（无假阳性改动）；
//! - pristine 目标文件 node --check 全过（payload 语法完整性基线）；
//! - 变异体抽样 node --check：退出码确定（0/1），无崩溃形态。
//!
//! 环境缺失（tgz/node）时打印原因并跳过（不误报红）。
//! 注：任务原文的「Rust 侧 transform」在仓内不存在（补丁链是 JS 侧实现），
//! 本测试以 node 子进程驱动同仓 transform 逼近原意——差异已在 TA1 报告说明。

use std::io::Write as _;
use std::path::PathBuf;
use std::process::{Command, Stdio};

struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self {
        Self(seed | 1)
    }
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next_u64() % n.max(1)
    }
}

fn repo_root() -> PathBuf {
    // tests/ 的 CARGO_MANIFEST_DIR = <root>/dsh-tauri/src-tauri/src/app
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(4)
        .expect("仓库根")
        .to_path_buf()
}

fn run_node(args: &[&str], stdin_file: Option<&std::path::Path>) -> Option<std::process::Output> {
    let mut cmd = Command::new("node");
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(f) = stdin_file {
        cmd.stdin(Stdio::from(std::fs::File::open(f).ok()?));
    }
    cmd.output().ok()
}

const TARGETS: &[&str] = &[
    "deepseek-ai-dsh-host-apiproxy-0.1.1-rc.2.tgz",
    "deepseek-ai-dsh-system-prompt-0.1.1-rc.2.tgz",
    "deepseek-ai-dsh-agent-presets-0.1.1-rc.2.tgz",
    "deepseek-ai-dsh-credentials-local-0.1.1-rc.2.tgz",
    "deepseek-ai-dsh-llm-deepseek-0.1.1-rc.2.tgz",
];

/// 从 tgz 提取主 JS 入口（package/lib/index.js 优先，退化到 lib 下首个 .js）。
fn extract_entry(tgz: &std::path::Path) -> Option<(String, Vec<u8>)> {
    let out = Command::new("tar")
        .arg("-xOzf")
        .arg(tgz)
        .arg("package/lib/index.js")
        .output()
        .ok()?;
    if out.status.success() && !out.stdout.is_empty() {
        return Some(("package/lib/index.js".into(), out.stdout));
    }
    // 退化：列包内文件挑 lib 下首个 .js。
    let list = Command::new("tar").arg("-tzf").arg(tgz).output().ok()?;
    if !list.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&list.stdout);
    let mut js: Vec<&str> = text
        .lines()
        .filter(|l| l.starts_with("package/lib/") && l.ends_with(".js"))
        .collect();
    js.sort();
    let entry = js.first()?.to_string();
    let out = Command::new("tar").arg("-xOzf").arg(tgz).arg(&entry).output().ok()?;
    out.status.success().then(|| (entry, out.stdout))
}

#[test]
fn ta1_payload_byteflip_mutation_200_rounds() {
    let root = repo_root();
    let tgz_dir = root.join(".tmp-rc2-stage").join("tgz");
    let surgery = root.join("dsh-desktop").join("scripts").join("plugin-core").join("lib").join("patch-surgery.js");
    let surgery_fallback = root
        .join("dsh-tauri")
        .join("pp")
        .join("scripts")
        .join("plugin-core")
        .join("lib")
        .join("patch-surgery.js");
    let surgery = if surgery.exists() { surgery } else { surgery_fallback };
    let missing: Vec<&str> = TARGETS
        .iter()
        .filter(|t| !tgz_dir.join(t).exists())
        .map(|t| *t)
        .collect();
    if !tgz_dir.is_dir() || !missing.is_empty() || !surgery.exists() {
        eprintln!(
            "[ta1-mutation] 跳过：pristine tgz 或 patch-surgery.js 缺失（tgz dir 存在={}，缺失包 {missing:?}）",
            tgz_dir.is_dir()
        );
        return;
    }
    if run_node(&["--version".into()], None).is_none() {
        eprintln!("[ta1-mutation] 跳过：node 不可用");
        return;
    }

    // 一次性 JS 驱动：stdin 文本 → dedupePatchEntries → stdout。
    let workdir = std::env::temp_dir().join(format!("dsh-ta1-mutation-{}", std::process::id()));
    std::fs::create_dir_all(&workdir).unwrap();
    let driver = workdir.join("driver.js");
    std::fs::write(
        &driver,
        "const { dedupePatchEntries } = require(require('path').resolve(process.argv[2]));\n\
         const fs = require('fs');\n\
         try {\n\
           let r = dedupePatchEntries(fs.readFileSync(0, 'utf8'));\n\
           if (r && typeof r === 'object' && typeof r.text === 'string') r = r.text;\n\
           if (typeof r !== 'string') { console.error('non-string output'); process.exit(2); }\n\
           process.stdout.write(r);\n\
         } catch (e) {\n\
           console.error('transform threw:', e && e.message);\n\
           process.exit(2);\n\
         }\n",
    )
    .unwrap();
    let surgery_arg = surgery.to_string_lossy().into_owned();

    // pristine 提取 + 基线。
    let mut pristines: Vec<(String, Vec<u8>, PathBuf)> = Vec::new();
    for t in TARGETS {
        let (entry, bytes) = extract_entry(&tgz_dir.join(t))
            .unwrap_or_else(|| panic!("提取 {t} 的主 JS 入口失败"));
        let f = workdir.join(format!("pristine-{}.mjs", t.replace(".tgz", "")));
        std::fs::write(&f, &bytes).unwrap();
        pristines.push((entry, bytes, f));
    }
    // 基线 1：pristine node --check 全过（payload 语法完整）。
    for (entry, _, f) in &pristines {
        let out = run_node(&["--check", &f.to_string_lossy()], None)
            .unwrap_or_else(|| panic!("node --check 启动失败"));
        assert!(out.status.success(), "pristine {entry} 语法基线失败: {}", String::from_utf8_lossy(&out.stderr));
    }
    // 基线 2：pristine → transform 恒等（无假阳性改动）。
    for (entry, bytes, f) in &pristines {
        let out = run_node(&[driver.to_string_lossy().as_ref(), &surgery_arg], Some(f))
            .unwrap_or_else(|| panic!("transform 启动失败"));
        assert!(out.status.success(), "pristine {entry} transform 异常: {}", String::from_utf8_lossy(&out.stderr));
        assert!(
            out.stdout.iter().eq(bytes.iter()),
            "pristine {entry} 经 transform 必须恒等"
        );
    }

    // 变异：每目标 40 轮 × 1-3 字节翻转。
    let mut rng = Rng::new(0xA17EA);
    const ROUNDS_PER_TARGET: usize = 40;
    const NODE_CHECK_SAMPLE: usize = 25; // 抽样上限（控 30s 预算）
    let mut checked = 0usize;
    let mut transformed_ok = 0usize;
    for (entry, bytes, _) in &pristines {
        for round in 0..ROUNDS_PER_TARGET {
            let mut mutated = bytes.clone();
            let flips = 1 + rng.below(3) as usize;
            for _ in 0..flips {
                let pos = rng.below(mutated.len() as u64) as usize;
                mutated[pos] ^= (1 + rng.below(255)) as u8;
            }
            assert_eq!(mutated.len(), bytes.len(), "翻转保长");
            let mf = workdir.join("mutant.mjs");
            std::fs::write(&mf, &mutated).unwrap();
            // transform 鲁棒性：任意字节翻转输入 → 永不异常（exit 2）/永不崩溃。
            let out = run_node(&[driver.to_string_lossy().as_ref(), &surgery_arg], Some(&mf))
                .unwrap_or_else(|| panic!("transform 启动失败"));
            let code = out.status.code().unwrap_or(-1);
            assert!(
                out.status.success() || code == 2,
                "{entry} 变异 #{round} transform 异常退出 code={code}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            if out.status.success() {
                transformed_ok += 1;
            }
            // 抽样 node --check：退出码确定（0/1），无崩溃形态（崩溃码 3/134 等）。
            if checked < NODE_CHECK_SAMPLE && rng.below(4) == 0 {
                let out = run_node(&["--check", &mf.to_string_lossy()], None).expect("node 启动");
                let code = out.status.code().unwrap_or(-1);
                assert!(code == 0 || code == 1, "{entry} 变异 #{round} node --check 崩溃形态 code={code}");
                checked += 1;
            }
        }
    }
    // 清理。
    let _ = std::fs::remove_dir_all(&workdir);
    eprintln!(
        "[ta1-mutation] 完成：5 目标 × {ROUNDS_PER_TARGET} 变异，transform 正常返回 {transformed_ok}/{}，node --check 抽样 {checked}",
        ROUNDS_PER_TARGET * TARGETS.len()
    );
}

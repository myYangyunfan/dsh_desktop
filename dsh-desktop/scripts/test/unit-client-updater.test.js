'use strict';

// client-updater.js 纯函数单元测试（node --test，无需网络与 Electron）。
// 用法：node --test scripts/test/unit-client-updater.test.js
// 覆盖：资产选择（便携版 / 安装版 / Gitee 分片排序 / x64 与 arm64 架构）、
//       仓库配置回退、更新脚本模板纯 ASCII、便携版替换重试与只读降级分支、
//       NSIS 安装失败保留安装包供重试。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  selectAsset,
  resolveRepos,
  DEFAULT_REPOS,
  buildPortableCmd,
  buildNsisPs1,
  buildNsisCmd,
  buildMacSh,
  platformKind,
  currentArch,
  cleanupPendingPackage,
  concatFiles,
  resolveHttpProxy,
  hashAssetOf,
  findHashEntry,
  verifyHashAgainstSumFile,
  sha256OfFile,
} = require('../../client-updater');

function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

const ASCII = /^[\x00-\x7F]*$/;

test('selectAsset: 便携版选择 win-portable-x64 资产', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', 'C:\\tools\\dsh-desktop', () => {
    const release = {
      version: '0.4.0',
      assets: [
        { name: 'DSH-Desktop-0.4.0-win-portable-x64.exe', url: 'https://example/p', size: 1 },
        { name: 'DSH-Desktop-0.4.0-win-setup-x64.exe', url: 'https://example/s', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.4.0-win-portable-x64.exe');
    assert.strictEqual(sel.parts.length, 1);
  });
});

test('selectAsset: 旧命名（无 win- 前缀）仍兼容，不破坏已发布版本的更新', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', 'C:\\tools\\dsh-desktop', () => {
    const release = {
      version: '0.3.9',
      assets: [
        { name: 'DSH-Desktop-0.3.9-portable-x64.exe', url: 'https://example/p', size: 1 },
        { name: 'DSH-Desktop-Setup-0.3.9-x64.exe', url: 'https://example/s', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.3.9-portable-x64.exe');
  });
});

test('selectAsset: 安装版选择 win-setup 资产（大小写不敏感）', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', undefined, () => {
    const release = {
      version: '0.4.0',
      assets: [
        { name: 'DSH-Desktop-0.4.0-win-portable-x64.exe', url: 'https://example/p', size: 1 },
        { name: 'DSH-Desktop-0.4.0-win-SETUP-x64.exe', url: 'https://example/s', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.4.0-win-SETUP-x64.exe');
  });
});

test('selectAsset: Gitee 分片按 part 序号排序并拼接为完整文件名', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', 'C:\\tools\\dsh-desktop', () => {
    const release = {
      version: '0.4.1',
      assets: [
        { name: 'DSH-Desktop-0.4.1-win-portable-x64.exe.part2', url: 'https://example/p2', size: 2 },
        { name: 'DSH-Desktop-0.4.1-win-portable-x64.exe.part1', url: 'https://example/p1', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.4.1-win-portable-x64.exe');
    assert.deepStrictEqual(sel.parts.map((p) => p.name), [
      'DSH-Desktop-0.4.1-win-portable-x64.exe.part1',
      'DSH-Desktop-0.4.1-win-portable-x64.exe.part2',
    ]);
  });
});

test('selectAsset: 分片缺中间序号（part1+part3）→ 拒绝，不拼坏包', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', 'C:\\tools\\dsh-desktop', () => {
    const release = {
      version: '0.4.1',
      assets: [
        { name: 'DSH-Desktop-0.4.1-win-portable-x64.exe.part1', url: 'https://example/p1', size: 1 },
        { name: 'DSH-Desktop-0.4.1-win-portable-x64.exe.part3', url: 'https://example/p3', size: 3 },
      ],
    };
    assert.throws(() => selectAsset(release), /未找到匹配的安装包资产/);
  });
});

test('selectAsset: 分片从 part2 开始（缺 part1）→ 拒绝', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', 'C:\\tools\\dsh-desktop', () => {
    const release = {
      version: '0.4.1',
      assets: [
        { name: 'DSH-Desktop-0.4.1-win-portable-x64.exe.part2', url: 'https://example/p2', size: 2 },
        { name: 'DSH-Desktop-0.4.1-win-portable-x64.exe.part3', url: 'https://example/p3', size: 3 },
      ],
    };
    assert.throws(() => selectAsset(release), /未找到匹配的安装包资产/);
  });
});

test('selectAsset: Gitee v0.3.9 旧命名分片（安装版）仍可排序拼接', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', undefined, () => {
    const release = {
      version: '0.3.9',
      assets: [
        { name: 'DSH-Desktop-Setup-0.3.9-x64.exe.part2', url: 'https://example/s2', size: 2 },
        { name: 'DSH-Desktop-Setup-0.3.9-x64.exe.part1', url: 'https://example/s1', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-Setup-0.3.9-x64.exe');
    assert.deepStrictEqual(sel.parts.map((p) => p.name), [
      'DSH-Desktop-Setup-0.3.9-x64.exe.part1',
      'DSH-Desktop-Setup-0.3.9-x64.exe.part2',
    ]);
  });
});

test('selectAsset: Gitee v0.3.9 旧命名分片（便携版）仍可排序拼接', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', 'C:\tools\dsh-desktop', () => {
    const release = {
      version: '0.3.9',
      assets: [
        { name: 'DSH-Desktop-0.3.9-portable-x64.exe.part2', url: 'https://example/p2', size: 2 },
        { name: 'DSH-Desktop-0.3.9-portable-x64.exe.part1', url: 'https://example/p1', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.3.9-portable-x64.exe');
    assert.deepStrictEqual(sel.parts.map((p) => p.name), [
      'DSH-Desktop-0.3.9-portable-x64.exe.part1',
      'DSH-Desktop-0.3.9-portable-x64.exe.part2',
    ]);
  });
});

test('selectAsset: arm64 机器选择 win-portable-arm64 资产', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', 'C:\\tools\\dsh-desktop', () => {
    withEnv('DSH_DESKTOP_ARCH', 'arm64', () => {
      const release = {
        version: '0.3.9',
        assets: [
          { name: 'DSH-Desktop-0.3.9-win-portable-x64.exe', url: 'https://example/px64', size: 1 },
          { name: 'DSH-Desktop-0.3.9-win-portable-arm64.exe', url: 'https://example/parm64', size: 1 },
          { name: 'DSH-Desktop-0.3.9-win-setup-x64.exe', url: 'https://example/sx64', size: 1 },
          { name: 'DSH-Desktop-0.3.9-win-setup-arm64.exe', url: 'https://example/sarm64', size: 1 },
        ],
      };
      const sel = selectAsset(release);
      assert.strictEqual(sel.name, 'DSH-Desktop-0.3.9-win-portable-arm64.exe');
      assert.strictEqual(sel.parts.length, 1);
    });
  });
});

test('selectAsset: arm64 安装版选择 win-setup-arm64（大小写不敏感）', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', undefined, () => {
    withEnv('DSH_DESKTOP_ARCH', 'arm64', () => {
      const release = {
        version: '0.3.9',
        assets: [
          { name: 'DSH-Desktop-0.3.9-win-portable-arm64.exe', url: 'https://example/p', size: 1 },
          { name: 'DSH-Desktop-0.3.9-win-SETUP-ARM64.exe', url: 'https://example/s', size: 1 },
        ],
      };
      const sel = selectAsset(release);
      assert.strictEqual(sel.name, 'DSH-Desktop-0.3.9-win-SETUP-ARM64.exe');
    });
  });
});

test('selectAsset: arm64 分片资产按 part 序号排序', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', undefined, () => {
    withEnv('DSH_DESKTOP_ARCH', 'arm64', () => {
      const release = {
        version: '0.3.9',
        assets: [
          { name: 'DSH-Desktop-0.3.9-win-setup-arm64.exe.part2', url: 'https://example/s2', size: 2 },
          { name: 'DSH-Desktop-0.3.9-win-setup-arm64.exe.part1', url: 'https://example/s1', size: 1 },
        ],
      };
      const sel = selectAsset(release);
      assert.strictEqual(sel.name, 'DSH-Desktop-0.3.9-win-setup-arm64.exe');
      assert.deepStrictEqual(sel.parts.map((p) => p.name), [
        'DSH-Desktop-0.3.9-win-setup-arm64.exe.part1',
        'DSH-Desktop-0.3.9-win-setup-arm64.exe.part2',
      ]);
    });
  });
});

test('selectAsset: x64 机器不误选 arm64 资产（回归）', () => {
  withEnv('PORTABLE_EXECUTABLE_DIR', undefined, () => {
    withEnv('DSH_DESKTOP_ARCH', 'x64', () => {
      const release = {
        version: '0.3.9',
        assets: [
          { name: 'DSH-Desktop-0.3.9-win-portable-arm64.exe', url: 'https://example/p', size: 1 },
          { name: 'DSH-Desktop-0.3.9-win-setup-arm64.exe', url: 'https://example/s', size: 1 },
        ],
      };
      assert.throws(() => selectAsset(release), /未找到匹配的安装包资产/);
    });
  });
});

test('currentArch: 默认跟随 process.arch，DSH_DESKTOP_ARCH 可强制指定', () => {
  withEnv('DSH_DESKTOP_ARCH', undefined, () => {
    assert.strictEqual(currentArch(), process.arch === 'arm64' ? 'arm64' : 'x64');
  });
  withEnv('DSH_DESKTOP_ARCH', 'arm64', () => {
    assert.strictEqual(currentArch(), 'arm64');
  });
  withEnv('DSH_DESKTOP_ARCH', 'bad-value', () => {
    assert.strictEqual(currentArch(), process.arch === 'arm64' ? 'arm64' : 'x64');
  });
});

test('resolveRepos: 非法配置回退默认仓库，合法配置原样保留', () => {
  assert.deepStrictEqual(resolveRepos(null), DEFAULT_REPOS);
  assert.deepStrictEqual(resolveRepos({ github: 'bad/slug with space', gitee: '' }), DEFAULT_REPOS);
  assert.deepStrictEqual(resolveRepos({ github: 'owner/repo', gitee: 'gitee-owner/gitee-repo' }), {
    github: 'owner/repo',
    gitee: 'gitee-owner/gitee-repo',
  });
});

test('buildPortableCmd: 纯 ASCII，含替换重试与只读目录降级分支', () => {
  const cmd = buildPortableCmd();
  assert.ok(ASCII.test(cmd), '便携版更新脚本必须是纯 ASCII');
  assert.ok(cmd.includes(':retry_replace'), '替换失败需要重试标签');
  assert.ok(cmd.includes('if %rtry% lss 12'), '替换失败需要有限次重试');
  assert.ok(cmd.includes('.dsh-write-test'), '需要目录写入探针');
  assert.ok(cmd.includes('copy /y NUL "%OLD%.dsh-write-test"'), '探针必须用 copy NUL 以获取可靠 errorlevel');
  assert.ok(cmd.includes('(goto) 2>nul & del "%~f0"'), '脚本自删必须退出码 0');
  assert.ok(!cmd.includes('del "%~f0" >nul 2>&1'), '不得残留旧式自删写法');
  assert.ok(cmd.includes(':replace_failed'), '需要替换失败分支');
  assert.ok(cmd.includes('launching new build directly'), '只读目录需降级为直接启动新 exe');
  assert.ok(cmd.includes(':restore_old'), '可写目录失败需还原当前版本');
  assert.ok(cmd.includes('copy /y "%OLD%" "%OLD%.bak"'), '替换前必须备份当前版本');
});

test('buildNsisPs1: 纯 ASCII，安装成功才删除安装包，失败保留供重试', () => {
  const ps1 = buildNsisPs1();
  assert.ok(ASCII.test(ps1), 'NSIS 更新脚本必须是纯 ASCII');
  assert.ok(ps1.includes('installer package kept for retry'), '失败时保留安装包');
  assert.ok(ps1.includes('$setupSucceeded = ($sp.ExitCode -eq 0)'), '取消/失败（非零退出码）不得视为成功');
  assert.ok(ps1.includes('if ($setupSucceeded -and $launched)'), '删除安装包必须受成功条件保护');
  assert.ok(
    ps1.indexOf('if ($setupSucceeded -and $launched)') < ps1.indexOf('Remove-Item -LiteralPath $Setup'),
    'Remove-Item 必须位于成功条件分支内'
  );
  assert.ok(ps1.includes('apply-update done'));
});

test('buildNsisCmd: 经 cmd 包装器调用 powershell 并透传全部参数', () => {
  const cmd = buildNsisCmd();
  assert.ok(ASCII.test(cmd), 'cmd 包装器必须是纯 ASCII');
  assert.ok(cmd.includes('powershell.exe'), '需要 powershell 路径兜底');
  assert.ok(cmd.includes('-ExecutionPolicy Bypass'), '需要绕过执行策略');
  assert.ok(cmd.includes('-File "%PS1%"'), '需要按变量调用 .ps1');
  assert.ok(cmd.includes('-LogFile "%LOGF%"'), '需要透传日志参数');
});

test('selectAsset: macOS 优先选 zip（免挂载自更新），dmg 兜底', () => {
  withEnv('DSH_DESKTOP_PLATFORM', 'macos', () => {
    const release = {
      version: '0.4.0',
      assets: [
        { name: 'DSH-Desktop-0.4.0-macos-x64.zip', url: 'https://example/z', size: 1 },
        { name: 'DSH-Desktop-0.4.0-macos-x64.dmg', url: 'https://example/d', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.4.0-macos-x64.zip');
    assert.strictEqual(sel.parts.length, 1);
  });
  withEnv('DSH_DESKTOP_PLATFORM', 'macos', () => {
    const release = {
      version: '0.4.0',
      assets: [{ name: 'DSH-Desktop-0.4.0-macos-x64.dmg', url: 'https://example/d', size: 1 }],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.4.0-macos-x64.dmg');
  });
});

test('selectAsset: macOS arm64 选 arm64 资产，x64 强制下不误选 arm64', () => {
  withEnv('DSH_DESKTOP_PLATFORM', 'macos', () => {
    withEnv('DSH_DESKTOP_ARCH', 'arm64', () => {
      const release = {
        version: '0.4.0',
        assets: [
          { name: 'DSH-Desktop-0.4.0-macos-x64.zip', url: 'https://example/zx', size: 1 },
          { name: 'DSH-Desktop-0.4.0-macos-arm64.zip', url: 'https://example/za', size: 1 },
        ],
      };
      const sel = selectAsset(release);
      assert.strictEqual(sel.name, 'DSH-Desktop-0.4.0-macos-arm64.zip');
    });
  });
  withEnv('DSH_DESKTOP_PLATFORM', 'macos', () => {
    withEnv('DSH_DESKTOP_ARCH', 'x64', () => {
      const release = {
        version: '0.4.0',
        assets: [{ name: 'DSH-Desktop-0.4.0-macos-arm64.zip', url: 'https://example/za', size: 1 }],
      };
      assert.throws(() => selectAsset(release), /未找到匹配的安装包资产/);
    });
  });
});

test('selectAsset: macOS 大包走 Gitee 分片（.partN 排序拼接）', () => {
  withEnv('DSH_DESKTOP_PLATFORM', 'macos', () => {
    withEnv('DSH_DESKTOP_ARCH', 'arm64', () => {
      const release = {
      version: '0.4.1',
      assets: [
        { name: 'DSH-Desktop-0.4.1-macos-arm64.zip.part2', url: 'https://example/p2', size: 2 },
        { name: 'DSH-Desktop-0.4.1-macos-arm64.zip.part1', url: 'https://example/p1', size: 1 },
      ],
    };
    const sel = selectAsset(release);
    assert.strictEqual(sel.name, 'DSH-Desktop-0.4.1-macos-arm64.zip');
    assert.deepStrictEqual(sel.parts.map((p) => p.name), [
      'DSH-Desktop-0.4.1-macos-arm64.zip.part1',
      'DSH-Desktop-0.4.1-macos-arm64.zip.part2',
    ]);
      });
  });
});

test('platformKind: 真实平台判定，DSH_DESKTOP_PLATFORM 可强制指定', () => {
  withEnv('DSH_DESKTOP_PLATFORM', undefined, () => {
    const want = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'win' : null;
    assert.strictEqual(platformKind(), want);
  });
  withEnv('DSH_DESKTOP_PLATFORM', 'macos', () => assert.strictEqual(platformKind(), 'macos'));
  withEnv('DSH_DESKTOP_PLATFORM', 'win', () => assert.strictEqual(platformKind(), 'win'));
  withEnv('DSH_DESKTOP_PLATFORM', 'bogus', () => {
    const want = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'win' : null;
    assert.strictEqual(platformKind(), want);
  });
});

test('buildMacSh: 纯 ASCII，含解压/备份/还原/解除隔离/重启分支', () => {
  const sh = buildMacSh('/data/updates/apply-update.log');
  assert.ok(ASCII.test(sh), 'macOS 更新脚本必须是纯 ASCII');
  assert.ok(sh.includes('ditto -x -k'), 'zip 用 ditto 免挂载解压');
  assert.ok(sh.includes('hdiutil attach'), 'dmg 走 hdiutil 挂载');
  assert.ok(sh.includes('xattr -dr com.apple.quarantine'), '未签名构建需解除 quarantine 才能自动启动');
  assert.ok(sh.includes('pgrep -f'), '等待旧进程退出');
  assert.ok(sh.includes('DSH Desktop.bak'), '替换前备份旧版');
  assert.ok(sh.includes('restoring backup'), '替换失败还原旧版');
  assert.ok(sh.includes('open "$APP"'), '完成后用 open 重启应用');
  assert.ok(sh.includes('apply-update done'));
});

test('cleanupPendingPackage: 删除安装包及其 .part 分片残留', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cleanup-'));
  try {
    const pkg = path.join(dir, 'DSH-Desktop-0.4.0-win-setup-x64.exe');
    fs.writeFileSync(pkg, 'fake installer');
    fs.writeFileSync(pkg + '.part1', 'part1');
    fs.writeFileSync(path.join(dir, 'unrelated-file.bin'), 'keep me');
    cleanupPendingPackage({ path: pkg });
    assert.ok(!fs.existsSync(pkg), '安装包本体应被删除');
    assert.ok(!fs.existsSync(pkg + '.part1'), '残留分片应被删除');
    assert.ok(fs.existsSync(path.join(dir, 'unrelated-file.bin')), '无关文件不得被误删');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanupPendingPackage: 文件已不存在时静默成功（幂等）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cleanup2-'));
  try {
    const pkg = path.join(dir, 'DSH-Desktop-0.4.0-win-portable-x64.exe');
    assert.doesNotThrow(() => cleanupPendingPackage({ path: pkg }));
    assert.doesNotThrow(() => cleanupPendingPackage(null));
    assert.doesNotThrow(() => cleanupPendingPackage({}));
    cleanupPendingPackage({});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('concatFiles: 正常合并多个分片并清理源', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-concat-'));
  try {
    const a = path.join(dir, 'a.part1');
    const b = path.join(dir, 'b.part2');
    const dest = path.join(dir, 'out.bin');
    fs.writeFileSync(a, 'AAA');
    fs.writeFileSync(b, 'BBB');
    await concatFiles([a, b], dest);
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'AAABBB', '分片应按序拼接');
    assert.ok(!fs.existsSync(a) && !fs.existsSync(b), '源分片应被清理');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('concatFiles: 目标不可写时以 rejection 收敛，不产生未捕获异常且清理半截目标（issue #70）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-concat2-'));
  try {
    const a = path.join(dir, 'a.part1');
    const dest = path.join(dir, 'out.bin');
    fs.writeFileSync(a, 'AAAA');
    // 目标为目录 → 写入失败（EISDIR）。历史上写流无 error 监听器会以未捕获
    // 异常崩掉主进程；修复后应作为 rejection 抛给调用方。
    fs.mkdirSync(dest);
    let uncaught = 0;
    const onUncaught = () => { uncaught += 1; };
    process.on('uncaughtException', onUncaught);
    try {
      await assert.rejects(
        concatFiles([a], dest),
        undefined,
        '目标不可写时应以 rejection 失败而不是未捕获异常'
      );
    } finally {
      process.removeListener('uncaughtException', onUncaught);
    }
    assert.strictEqual(uncaught, 0, '不得触发 uncaughtException');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveHttpProxy: 解析 HTTPS_PROXY / 分号分隔多代理 / 无代理（issue #84 国内网络）', () => {
  withEnv('HTTPS_PROXY', 'http://127.0.0.1:10090', () => {
    assert.deepStrictEqual(resolveHttpProxy(), { href: 'http://127.0.0.1:10090/' });
  });
  withEnv('HTTPS_PROXY', 'http://a:8080, http://b:8081', () => {
    assert.deepStrictEqual(resolveHttpProxy(), { href: 'http://a:8080/' }, '取第一个可用代理');
  });
  // 无代理 → null（Windows 上环境变量大小写不敏感，勿与 HTTPS_PROXY 叠测）
  withEnv('HTTPS_PROXY', undefined, () => {
    assert.strictEqual(resolveHttpProxy(), null);
  });
});

// --- F-1 SHA256SUMS 完整性校验（fail-closed）---

test('hashAssetOf: 从资产列表挑出校验和清单（大小写/命名变体）', () => {
  const release = { assets: [
    { name: 'DSH-Desktop-0.3.11-win-setup-x64.exe' },
    { name: 'SHA256SUMS' },
    { name: 'SHA256SUMS.sig' },
  ] };
  assert.strictEqual(hashAssetOf(release).name, 'SHA256SUMS');
  const lower = { assets: [{ name: 'dsh.zip' }, { name: 'sha256sums' }] };
  assert.strictEqual(hashAssetOf(lower).name, 'sha256sums');
  const dot = { assets: [{ name: 'DSH-Desktop-0.3.11.zip' }, { name: 'DSH-Desktop-0.3.11.zip.sha256' }] };
  assert.strictEqual(hashAssetOf(dot).name, 'DSH-Desktop-0.3.11.zip.sha256');
  assert.strictEqual(hashAssetOf({ assets: [{ name: 'DSH-Desktop-0.3.11.zip' }] }), null, '无校验和清单 → null');
  assert.strictEqual(hashAssetOf({}), null, '无 assets → null');
});

test('findHashEntry: 解析 hex+文件名（兼容 * 标记与 CRLF），缺条目 null', () => {
  const h = 'ab'.repeat(32);
  const text = [
    '00'.repeat(32) + '  othera.exe',
    h + '  DSH-Desktop-0.3.11-win-setup-x64.exe',
    '11'.repeat(32) + '  mac.dmg',
  ].join('\r\n');
  assert.strictEqual(findHashEntry(text, 'DSH-Desktop-0.3.11-win-setup-x64.exe'), h);
  assert.strictEqual(findHashEntry(text, 'other.exe'), null, '缺条目 → null');
  assert.strictEqual(findHashEntry('', 'x.exe'), null);
  // 二进制标记 *：`<hex> *name` 同样可解析
  assert.strictEqual(findHashEntry('aa'.repeat(32) + ' *bin.zip', 'bin.zip'), 'aa'.repeat(32));
  // 损坏行跳过
  assert.strictEqual(findHashEntry('not-a-hash foo\n' + h + '  ok.exe', 'ok.exe'), h);
});

test('verifyHashAgainstSumFile: 命中/不匹配/缺条目三态', () => {
  const h = 'AB'.repeat(32); // 大写输入→小写归一
  const sum = h + '  pkg.exe';
  assert.deepStrictEqual(verifyHashAgainstSumFile(sum, 'pkg.exe', 'ab'.repeat(32)), { ok: true, expected: 'ab'.repeat(32) });
  const bad = verifyHashAgainstSumFile(sum, 'pkg.exe', 'ff'.repeat(32));
  assert.strictEqual(bad.ok, false);
  assert.ok(/校验和不匹配/.test(bad.reason));
  const missing = verifyHashAgainstSumFile(sum, 'other.exe', 'ab'.repeat(32));
  assert.strictEqual(missing.ok, false);
  assert.ok(/缺少/.test(missing.reason));
});

test('sha256OfFile: 流式计算与 crypto 直接计算一致', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-hash-'));
  try {
    const f = path.join(dir, 'pkg.bin');
    fs.writeFileSync(f, Buffer.from('F-1 smoke payload '.repeat(1024), 'utf8'));
    const expected = require('node:crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    assert.strictEqual(await sha256OfFile(f), expected);
    await assert.rejects(sha256OfFile(path.join(dir, 'nope.bin')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

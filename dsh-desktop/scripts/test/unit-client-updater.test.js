'use strict';

// client-updater.js 纯函数单元测试（node --test，无需网络与 Electron）。
// 用法：node --test scripts/test/unit-client-updater.test.js
// 覆盖：资产选择（便携版 / 安装版 / Gitee 分片排序 / x64 与 arm64 架构）、
//       仓库配置回退、更新脚本模板纯 ASCII、便携版替换重试与只读降级分支、
//       NSIS 安装失败保留安装包供重试。

const test = require('node:test');
const assert = require('node:assert');
const {
  selectAsset,
  resolveRepos,
  DEFAULT_REPOS,
  buildPortableCmd,
  buildNsisPs1,
  buildNsisCmd,
  currentArch,
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

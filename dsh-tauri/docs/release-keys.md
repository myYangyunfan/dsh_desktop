# 发版密钥与更新链（tauri-plugin-updater / minisign）

> D2 决策落地（docs/migration-roadmap.md）：Tauri 版客户端自动更新必须走
> **minisign 签名链**，替代 Electron 版「无哈希/无签名校验」的自研下载
> （review 结论见 roadmap §D2）。

## 1. 密钥对生成（一次性，离线机器）

```bash
cargo install tauri-cli --version "^2"
cargo tauri signer generate -w dsh-updater.key
# → dsh-updater.key（私钥，绝不入库/不进 CI 明文）
# → dsh-updater.key.pub（公钥，写入构建配置）
```

- 私钥口令与文件只存在发版负责人处（密码管理器 + 离线备份）；
- 公钥是公开信息，随客户端分发。

## 2. 构建期配置

`dsh-tauri/src-tauri/src/app/tauri.conf.json` 发布前补：

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<dsh-updater.key.pub 内容>",
      "endpoints": [
        "https://github.com/myYangyunfan/dsh_desktop/releases/latest/download/latest.json"
      ]
    }
  }
}
```

- `latest.json` 由 CI 在发 tag 时生成（version/pubnotes/platforms/签名）；
- `platforms.<target>.signature` = 对应安装包的 minisign 签名（`--sign` 产物）。

## 3. CI 发版流程（GitHub Actions）

0. **payload 前置**（内核资源暂存，安装包内 `<安装根>/resources/dsh-desktop/`）：

   ```bash
   bash dsh-tauri/scripts/stage-payload.sh
   # 从 dsh-desktop/ 按「Electron extraResources + 生产依赖」口径组装到
   # dsh-tauri/pp/（排除 dist/、devDeps electron 三件、
   # unix node 二进制；约 500MB）。缺内核必需件时 fail-fast。
   # 目录名 pp 是 2026-11-12 为缩 makensis 源路径前缀而定（原 package-payload/dsh-desktop，
   # 前缀 94 → 69 字符），安装态布局不变，仍映射到 <安装根>/resources/dsh-desktop/。
   ```

1. tag → build：

   ```bash
   # tauri-cli 经 npx（免 cargo install 长编译）；cargo 需在 PATH
   npx --yes @tauri-apps/cli build \
     --config src-tauri/src/app/tauri.conf.json \
     --target x86_64-pc-windows-msvc
   # 产物：src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe
   # （targets=["nsis"]；installMode=currentUser + installerHooks 保数据升级链）
   ```
2. `cargo tauri signer sign` 各平台产物 → `.sig`；
3. 组装 `latest.json`（含 x86_64-pc-windows-msvc 条目）→ Release 上传产物+签名+manifest；
4. Gitee 镜像：同步产物；updater 单 endpoint 以 GitHub 为主源
   （回落策略见 roadmap §D2——不为此引入复杂度）。

## 4. 运行时行为（已实装）

- `menu_action("check-client-update")`：updater.check()；未配置 endpoints 时
  返回 `E_UPDATER_CONFIG` 引导信息（**绝不静默降级为无签名更新**）；
- `menu_action("install-client-update")`：download_and_install()；
  签名验证失败 → `E_UPDATER_SIGNATURE`（error-codes.md §5），不落盘不执行。

## 5. 私钥泄漏应急

吊销 = 换新密钥对 + 发一个用旧密钥签的「停用公告版本」（若旧链仍可用），
之后的版本用新公钥；客户端更新到新公钥版本后旧链自然失效。

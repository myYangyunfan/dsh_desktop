# DeepSeek Harness Remote

Continue DeepSeek Harness sessions and experimental Codex, Cursor, and Antigravity workspaces from another device over an end-to-end encrypted connection.

[GitHub](https://github.com/liguobao/ds-harness-remote) · [Full guide](https://github.com/liguobao/ds-harness-remote/blob/main/README.md) · [中文说明](https://github.com/liguobao/ds-harness-remote/blob/main/README.zh.md) · [Remote Web](https://dsh.r2049.cn/app) · [Android](https://github.com/liguobao/ds-harness-remote/releases/latest)

`ds-harness-remote` is the Remote Host and workspace plugin for DeepSeek Harness. Harness keeps running on your work computer with its existing workspaces, tools, and permission controls; Remote gives authorized devices another window into that environment.

> Install the npm package through Desktop Plugin management or `dsh plugin`. Both manage the selected Harness profile and its bundle configuration.

## Install

### DSH Desktop

In DeepSeek Harness Desktop, open **Extensions / Plugin management**, choose installation
from **npm**, and enter:

```text
ds-harness-remote@0.5.19
```

Restart Desktop after installation. Its official `dsh` launcher can also install the package:

```sh
dsh plugin --profile desktop add -w ds-harness-remote@0.5.19
```

Use Desktop's official launcher to manage its reserved `desktop` profile.

### Existing DSH installation

Add the current package version to the `web` profile, then restart Harness:

```sh
dsh plugin --profile web add -w ds-harness-remote@0.5.19
```

### dsh-TUI Host

Remote can also run as a Host in a terminal-only [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) profile:

```sh
dsh plugin --profile dsh-tui add -w ds-harness-remote@0.5.19
```

After starting dsh-TUI, manage Remote with `/remote`, `/remote login`, `/remote status`, and `/remote logout`.

## Highlights

- Continue active Harness sessions and review progress from another computer, the web, or Android.
- Send text and image prompts, answer questions, and handle permission requests.
- Open workspaces on another authorized computer without replacing the native Harness interface.
- Use the official workspace file tree and bounded read-only previews on supported Harness versions.
- Use an optional Host-local terminal and authorized loopback development-service previews.
- Open Host Codex projects in the existing Remote UI through the optional experimental Codex domain.
- Access Cursor and Antigravity workspaces through the optional experimental ACP gateway, with client-side projections kept in memory.
- Reach the Host without opening a public listening port or configuring router port forwarding.

## Compatibility

The development baseline is DeepSeek Harness `dsh-v0.2.1-rc.1`, retaining the official Typert Remote / Session V3 carrier from `0.2.0` RC. Earlier Typert carrier support remains capability-based.

`0.5.19` removes Harness `0.1.1-rc.2` ApiProxy support from the Host and bundled Remote client. ApiProxy-only Hosts and missing capability discovery are rejected. CodeX/ACP Desktop projection also uses Typert only.

The same package feature-detects the older settings registry and the `0.1.7-rc.1` and `0.2.0-rc.2` Volatile settings entry. Remote Web/Desktop and Android normalize released sessions that still report the retired `code` agent preset to `ptc`. The Host reads the running Harness version from the CLI entrypoint, or from the 0.2.0 Desktop shell's `@deepseek-ai/dsh-desktop-host` entrypoint when the Harness CLI package is only a sibling of that entrypoint inside `app.asar`.

## Self-hosted Server

This repository includes a minimal, single-account self-hosted Relay Server in [`apps/server`](https://github.com/liguobao/ds-harness-remote/tree/main/apps/server). Configure `DSH_SERVER_ACCOUNT` and `DSH_SERVER_PASSWORD`, then point the Host and clients at the same server URL. It provides account login, device credentials, encrypted Control/Noise forwarding, Relay, and a device-status page. It does not provide the complete multi-account Server, Remote Web session UI, or WebRTC/TURN deployment.

## Security boundary

- Session traffic is encrypted on the Client and decrypted only by the selected Host using `Noise_IK_25519_ChaChaPoly_SHA256`.
- Account membership and the Host's locally pinned device identity must both authorize a connection.
- The Host creates outbound connections only; it does not listen on a public port.
- Remote does not expose general tool RPC, remote desktop, or file-mutation APIs.
- Interactive terminals are enabled by default and can be disabled in the Host-local Remote settings; they run as the Host user independently of Agent approvals.

## Documentation

- [Complete guide](https://github.com/liguobao/ds-harness-remote#readme)
- [dsh-TUI Remote guide](https://github.com/liguobao/ds-harness-remote/blob/main/docs/dsh-tui.md)
- [Codex Remote technical notes](https://github.com/liguobao/ds-harness-remote/blob/main/docs/codex-remote.md)
- [Agent workspace integration guide](https://github.com/liguobao/ds-harness-remote/blob/main/docs/acp-integration.md)
- [End-to-end encryption](https://github.com/liguobao/ds-harness-remote/blob/main/docs/end-to-end-encryption.md)
- [Network and transport](https://github.com/liguobao/ds-harness-remote/blob/main/docs/network.md)
- [Protocol reference](https://github.com/liguobao/ds-harness-remote/blob/main/docs/protocol.md)
- [Changelog](https://github.com/liguobao/ds-harness-remote/blob/main/docs/CHANGELOG.md)

This is an independent community project and is not an official DeepSeek product. Licensed under the [MIT License](./LICENSE).

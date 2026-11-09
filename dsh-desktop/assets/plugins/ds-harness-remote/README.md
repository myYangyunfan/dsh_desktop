# DeepSeek Harness Remote

Continue DeepSeek Harness sessions and experimental Codex, Cursor, and Antigravity workspaces from another device over an end-to-end encrypted connection.

[GitHub](https://github.com/liguobao/ds-harness-remote) · [Full guide](https://github.com/liguobao/ds-harness-remote/blob/main/README.md) · [中文说明](https://github.com/liguobao/ds-harness-remote/blob/main/README.zh.md) · [Remote Web](https://dsh.r2049.cn/app) · [Android](https://github.com/liguobao/ds-harness-remote/releases/latest)

`ds-harness-remote` is the Remote Host and workspace plugin for DeepSeek Harness. Harness keeps running on your work computer with its existing workspaces, tools, and permission controls; Remote gives authorized devices another window into that environment.

> Install the npm package through Desktop Plugin management or `dsh plugin`. Both manage the selected Harness profile and its bundle configuration.

## Remote Agent tools

After signing in through the local Desktop/web-profile Remote panel, ask a native Harness Agent to list online Remote machines and the workspaces on a selected machine. The plugin registers `remote_list_hosts` (no arguments) and `remote_list_workspaces` (`hostId` from the first tool) when the official `tools` service is available.

Discovery reuses Remote account authorization, pinned Host identities and encrypted transport. Each workspace query owns a temporary connection and leaves the UI selection unchanged. Results identify the backend (`harness`, `codex`, or an available ACP backend); failed backend catalogs appear in `unavailable`. Host names, workspace paths and explicitly requested session history become part of the calling Agent's tool context and normal Harness tool history; credentials are not returned.

For native Harness workspaces (`backend: "harness"`), the same Agent can use:

| Tool | Purpose |
| --- | --- |
| `remote_list_sessions` | List root sessions in an existing workspace; live catalog pagination. |
| `remote_read_session` | Read bounded native history, with an older-page cursor and explicit truncation. |
| `remote_create_session` | Create an empty session in the selected workspace. |
| `remote_send_message` | Queue a text task or follow-up under existing Host permissions. |
| `remote_wait_sessions` | Observe up to eight sessions, for up to 60 seconds; zero requests snapshots. |
| `remote_interrupt_session` | Request interruption of the current execution; does not undo edits or delete queued messages. |
| `remote_upload_file` | Upload a local file to a Harness workspace root (1 GiB on LAN/direct P2P; otherwise 20 MiB), without overwriting existing files. |
| `remote_download_file` | Download a workspace-relative file to this plugin machine’s Downloads directory (50 MiB maximum). |
| `remote_get_operation` | Read an operation receipt without executing the operation again. |

Session tools require explicit `hostId`, `backend` and `workspaceId`; existing-session operations also require `sessionId`. Create/send/interrupt require a unique `operationId` (16–128 letters, digits, underscores or hyphens). The same key and parameters return the same in-memory receipt; changing parameters under that key is rejected. An `accepted` send receipt means queued, not completed. After an `unknown` result, inspect the receipt and remote session instead of retrying with a new key. Receipts are lost on Remote reset, leaving Remote, logout or restart; `not_found` is not proof that an earlier operation did not execute.

For example, ask: “On the Linux Host, create a Harness session in my project, run its tests, and report the result here.” The Agent discovers the target, creates and messages a session, then waits and reads its history. An `idle` status does not prove the task objective succeeded. Pending approval/question detection is limited to retained history; use the native UI to handle those requests. Waiting never approves or interrupts work automatically.

CodeX/ACP currently support workspace discovery only through these tools. This entry does not register an external MCP server. Terminal-only profiles are not a supported Host surface in this release; dsh-TUI integration is planned for a later version.

## Install

### DSH Desktop

In DeepSeek Harness Desktop, open **Extensions / Plugin management**, choose installation
from **npm**, and enter:

```text
ds-harness-remote@0.6.4
```

Restart Desktop after installation. Its official `dsh` launcher can also install the package:

```sh
dsh plugin --profile desktop add -w ds-harness-remote@0.6.4
```

Use Desktop's official launcher to manage its reserved `desktop` profile.

### Existing DSH installation

Add the current package version to the `web` profile, then restart Harness:

```sh
dsh plugin --profile web add -w ds-harness-remote@0.6.4
```

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

The development baseline is DeepSeek Harness `dsh-v0.2.2-rc.1`, retaining the official Typert Remote / Session V3 carrier from `0.2.1-rc.5` and `0.2.0` RC. Earlier Typert carrier support remains capability-based.

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
- [Codex Remote technical notes](https://github.com/liguobao/ds-harness-remote/blob/main/docs/codex-remote.md)
- [Agent workspace integration guide](https://github.com/liguobao/ds-harness-remote/blob/main/docs/acp-integration.md)
- [End-to-end encryption](https://github.com/liguobao/ds-harness-remote/blob/main/docs/end-to-end-encryption.md)
- [Network and transport](https://github.com/liguobao/ds-harness-remote/blob/main/docs/network.md)
- [Protocol reference](https://github.com/liguobao/ds-harness-remote/blob/main/docs/protocol.md)
- [Changelog](https://github.com/liguobao/ds-harness-remote/blob/main/docs/CHANGELOG.md)

This is an independent community project and is not an official DeepSeek product. Licensed under the [MIT License](./LICENSE).

Downloads require a Harness workspace and session. Files are saved privately in a fresh `Downloads/dsh-remote-*` directory without overwriting existing files. The tool returns only the local path and byte count. It verifies version, size and chunk offsets and removes partial files on failure/cancellation. Host file limits still apply. For a browser connected to Harness, this downloads onto the machine running the plugin, not directly onto the browser device.

`remote_upload_file` requires an absolute `localPath` on the plugin machine, the Harness host/workspace/session identifiers, and an `operationId`. Optional `name` sets the remote filename. Upload only files the user authorizes sending to that Host. The existing connection-scoped uploader publishes in the session workspace root, renaming collisions. The tool returns the remote filename, path and byte count; it does not send the file to the Agent as prompt text. For uncertain commit delivery, inspect the receipt and workspace rather than retrying with a new operation key.

Upload size follows the actual encrypted transport: LAN and direct P2P allow up to 1 GiB (1,073,741,824 bytes); TURN, Relay and unknown paths retain 20 MiB. Both the client and updated Host enforce the limit throughout transfer. Falling back to relay stops an oversized upload and removes uncommitted data. Older Hosts may retain 20 MiB. The upload tool deadline is one hour; chunks remain bounded at 64 KiB.

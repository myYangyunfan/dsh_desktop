# DS Harness Remote

[公式サイト](https://dsh.r2049.cn/) · [Web クライアント](https://dsh.r2049.cn/app) · [iOS ベータ](https://github.com/liguobao/ds-harness-remote/issues/20) · [Android ダウンロード](https://github.com/liguobao/ds-harness-remote/releases/latest)

**P2P ネットワークで直接接続**し、別のパソコン、ブラウザー、スマートフォンから、作業用パソコン上の DeepSeek Harness を引き続き使えます。ワークスペース、セッション、ツール、プロジェクト設定は元のパソコンに保持されます。

## 主な機能

- Harness のワークスペースとセッションを開き、メッセージ送信、モデル切り替え、タスク中断、承認操作ができます。
- 設定済みの CodeX、Claude Code、Pi、OpenCode などのワークスペースに接続できます。
- ワークスペースのファイル閲覧、プレビュー、有効化済みのリモートターミナルを利用できます。
- **P2P 直接接続を優先**：端末間で直接データを転送し、接続後のセッションデータは中継サーバーを経由しません。ホストのパブリック IP や公開ポートは不要です。
- **通信は常にエンドツーエンド暗号化**：直接接続できない場合は TURN または Relay に自動で切り替えます。中継サーバーはセッションの内容を復号できません。

## 使い始めるには

1. 作業用パソコンにプラグインをインストールして有効化し、サイドバーの **Remote** からログインします。
2. 別のパソコンの Remote、[ブラウザー](https://dsh.r2049.cn/app)、[iOS アプリ（ベータ）](https://github.com/liguobao/ds-harness-remote/issues/20)、[Android アプリ](https://github.com/liguobao/ds-harness-remote/releases/latest)、または [DSH Go](https://github.com/ccch1mneyyy/dsh-go) で同じアカウントにログインします。
3. オンラインのホストとワークスペースを選択します。作業用パソコンは起動し、インターネットに接続したままにしてください。

[DSH Go](https://github.com/ccch1mneyyy/dsh-go) はサードパーティー製の DeepSeek Harness Android クライアントです。スマートフォン上で DSH を実行するほか、本プラグイン経由でパソコン上の DSH にリモート接続できます。

[詳しい使い方](https://github.com/liguobao/ds-harness-remote/blob/main/README.ja.md) · [セルフホスティング](https://github.com/liguobao/ds-harness-remote/blob/main/apps/server/README.md) · [問題を報告](https://github.com/liguobao/ds-harness-remote/issues)

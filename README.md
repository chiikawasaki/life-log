# life-log

日々の努力を記録し、知識・体力・コミュ力・芸術・生活力・副業の成長を見える化する、自分専用のWebアプリです。
白とピンクのシンプルな画面で、勉強時間や読んだ本などを記録できます。

## 開発

Node.js 24推奨（22.12以上）。

```sh
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
```

`VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を実行環境に設定してください。既にクラウド環境に設定されていれば追加作業は不要です。
ローカルでは `.env.example` を参考に、Git管理対象外の `.env.local` を使用できます。
管理用キー・DBパスワードを `VITE_` 変数やフロントエンドに含めないでください。

Supabaseのテーブルと所有者設定は [セットアップ手順](docs/SUPABASE_SETUP.md) を参照してください。接続情報だけではログイン後の機能は利用できません。

## 検証

```sh
npm run build
npm test
npm run format:check
npx playwright install chromium
npm run test:e2e
```

クラウド環境の既存Chromiumを使う場合は、ブラウザの追加インストールに代えて以下で実行できます。

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

ブラウザテストはテスト用APIを使います。DBテストはPGliteのPostgreSQLでマイグレーション・RLS・所有者制限を検証します。どちらも実際のSupabaseでの同期確認を代替しません。

## 主な使い方

1. 所有者のメールとパスワードでログイン。
2. 「行動ルール」で例として「勉強・知識・120分・1ポイント」を追加。
3. ホームで取り組んだ時間・分をまとめて入力。
4. 同じルールの時間は日をまたいで累積し、120分ごとに知識と経験値が＋1。
5. 全ステータスの経験値が15増えるたびにレベルアップ。

記録の訂正・削除は履歴から行えます。ルール変更時は新しい版を作成し、過去のポイントを維持します。変更前の端数は新しい版には持ち越しません。
別端末の変更は画面に戻るか「最新に更新」で取得します。オフライン記録には対応していません。

[要件](REQUIREMENTS.md) / [設計](docs/DESIGN.md) / [タスク](docs/TASKS.md) / [検証とレビュー](docs/VALIDATION.md)

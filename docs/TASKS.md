# 実装タスク

GitHubに6件のIssueを登録済み。番号01〜06はローカル管理ID。

| ID  | 優先度 | GitHub Issue                                                                      | 状態                                       |
| --- | ------ | --------------------------------------------------------------------------------- | ------------------------------------------ |
| 01  | P0     | [開発基盤と検証コマンド](https://github.com/chiikawasaki/life-log/issues/1)       | 実装済み・PRレビュー待ち                   |
| 02  | P0     | [SupabaseのDB・認証・RLS](https://github.com/chiikawasaki/life-log/issues/2)      | 実DB・所有者設定済み／画面ログイン確認待ち |
| 03  | P0     | [行動ルールと努力記録](https://github.com/chiikawasaki/life-log/issues/3)         | 実装済み・PRレビュー待ち                   |
| 04  | P0     | [ステータスと総合経験値の表示](https://github.com/chiikawasaki/life-log/issues/4) | 実装済み・PRレビュー待ち                   |
| 05  | P1     | [履歴訂正と振り返り](https://github.com/chiikawasaki/life-log/issues/5)           | 実装済み・PRレビュー待ち                   |
| 06  | P0     | [結合検証・コードレビュー・PR](https://github.com/chiikawasaki/life-log/issues/6) | 実装済み・PRレビュー待ち                   |

## 実施順と依存

01 → 02 → 03 → 04 → 05 → 06。基盤は仕様確定前でも着手可能。
Supabaseプロジェクト・公開キーは設定済み。DBマイグレーションは適用済み。所有者登録・実DBロールでのCRUD確認も完了。02と06は画面ログインと端末間同期の検証が残る。レベル計算は15経験値ごと、端数は持ち越す。

## Gitの初期化

要件書・設計書・タスク一覧をmainの初期コミットに含める。以後の実装は別ブランチで行い、mainへのPull Requestを作成する。
実装ブランチはfeat/effort-tracking-mvp。実装・ローカルテスト・セルフレビュー済み。実サービスの検証が残るためDraft PRとして提出する。環境の再公開やアプリのデプロイは行っていない。

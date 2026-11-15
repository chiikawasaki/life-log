# 実装タスク

GitHubに6件のIssueを登録済み。番号01〜06はローカル管理ID。

| ID | 優先度 | GitHub Issue | 状態 |
|---|---|---|---|
| 01 | P0 | [開発基盤と検証コマンド](https://github.com/chiikawasaki/life-log/issues/1) | 未着手 |
| 02 | P0 | [SupabaseのDB・認証・RLS](https://github.com/chiikawasaki/life-log/issues/2) | 未着手 |
| 03 | P0 | [行動ルールと努力記録](https://github.com/chiikawasaki/life-log/issues/3) | 未着手 |
| 04 | P0 | [ステータスと総合経験値の表示](https://github.com/chiikawasaki/life-log/issues/4) | 未着手 |
| 05 | P1 | [履歴訂正と振り返り](https://github.com/chiikawasaki/life-log/issues/5) | 未着手 |
| 06 | P0 | [結合検証・コードレビュー・PR](https://github.com/chiikawasaki/life-log/issues/6) | 未着手 |

## 実施順と依存
01 → 02 → 03 → 04 → 05 → 06。基盤は仕様確定前でも着手可能。
02の接続検証にはSupabaseプロジェクトが必要。レベル計算は15経験値ごとで確定。03の端数持ち越しは推奨案として提案中。

## Gitの初期化
要件書・設計書・タスク一覧をmainの初期コミットに含める。以後の実装は別ブランチで行い、mainへのPull Requestを作成する。
実装・テスト・PR作成はまだ未実施。環境の再公開やデプロイは行っていない。

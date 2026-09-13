# fixtures — 検証用のテストデータ

**ここに置かれている企業はすべて架空です。実在の企業・団体・人物とは一切関係ありません。**

KOBOの取材フォーム・原稿生成・事実検証の安全装置を検証するための設定資料です。
実案件のデータは `../projects/`（Git管理外）に置きます。ここには置かないこと。

## mock-matsubara — 検証用の架空企業

| ファイル | 用途 |
|---|---|
| `profile.md` | **社長役の設定資料。** モック取材で演じるときに読む。仕込んだ罠6つの一覧つき |
| `interview-record.md` | **取材記録（入力用）。** これを見ながらフォームに入力を練習できる |
| `project.completed.json` | 第1回モック取材の完成形。入力し終わったあとの答え合わせ用 |

`project.completed.json` を案件として直接使いたい場合：

```bash
mkdir -p projects/matsubara-seiki
cp fixtures/mock-matsubara/project.completed.json projects/matsubara-seiki/project.json
```

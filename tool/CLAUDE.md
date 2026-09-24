# KOBO のコードを触るときの約束

**このフォルダのファイルを触ると自動で読まれる。** 全担当に共通の約束はいちばん上の `CLAUDE.md`。
どこを誰が受け持つかは下の表。担当の外のファイルを直すときは、報告でそう書く。
**ファイルを足したら、この表にも足す**（`npm run test:skills` が、どの担当にも載っていないファイルを見つける）。

| 担当 | 主なファイル |
|---|---|
| KOBO（`/kobo`） | `server.mjs`・`public/`・`lib/forms/`・`lib/form-definition.ts`・`lib/schema.ts`・`lib/sanitize.ts`・`lib/completion.ts`・`lib/verify.ts`・`lib/webtext-*.ts`・`lib/generate/`・`lib/internal-language.ts`・`lib/env.mjs`・`webtext.mjs`・`generate.mjs`・`gaps.mjs`・`check-api.mjs`・`import-photos.mjs`・`make-demo.mjs` |
| WEB制作（`/web`） | `site-template/`・`lib/design/`・`lib/theme.ts`・`lib/png-tone.ts`・`lib/browser.mjs`・`build-site.mjs`・`preview-site.mjs`・`variants.mjs`・`preview-variants.mjs`・`visual-brief.mjs`・`brief.mjs`・`qa-*.mjs`・`dns-snapshot.mjs`・`check-inquiry.mjs` |
| 共通 | `lib/node-builtin.d.ts`・`package.json`・`*.test.mjs`（検査はその対象の担当が直す） |

## 動かし方

- Node.js 22.18 以降。`lib/*.ts` は型ストリッピングで直接読む（**ビルド手順は無い**）。
- 取材の入力画面（`npm start`）は**依存パッケージなしで動く**こと（工場のネットは不安定）。
- 変えたら `npm run typecheck` と `npm test` を通してから commit する。新しい検査は `package.json` の `test` の鎖に足す。

## 書き写さない（D-197）

- 見た目の選択肢は `lib/theme.ts`、案件データの形は `lib/schema.ts` が単一の正。**別の場所に同じ一覧を書かない。**
- CSSとTSで同じ数字を持つしかないときは、**書き出したものと突き合わせて、ずれたら落ちる検査**を添える。

## 検査の約束

- 赤いときは、実装より先に**測り方**を疑う。緑のときも、**直したものを一度戻して赤くなるか**を確かめる（D-472で、緑のまま崩れを見逃す検査を書いていた）。
- ブラウザで測る検査は `lib/browser.mjs` の `launchChromium()` を使う。**開発環境のパスを直書きしない**（D-393）。
  playwright が無ければ「**未確認**」と出して、合格に数えない。
- 検査用の案件は `projects/_<名前>-test` に作り、最後に消す。**お客様の案件を検査で書き換えない**（書き換えるなら戻す）。
- 書き出したHTML/CSSは圧縮で書き換わる（`::before`→`:before`、`[a="b"]`→`[a=b]`、`alt=""`→`alt`、`min-width:761px`→`width>=761px`）。
- 属性の並びに頼った正規表現を書かない（`<dd data-role="lead">` のように閉じ `>` まで決め打ちすると、属性が1つ増えただけで落ちる）。

## お客様の情報とキー

- `projects/*` と `.env` は Git に入らない。**`git add -f` で足さない。** 検証は `fixtures/` の架空データで行う。
- **APIキーが無い場合は、コードを変更して回避しない。APIキーが無いことを明記して止める。**

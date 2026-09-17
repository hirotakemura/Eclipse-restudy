# 実物の生成ビジュアルを、この環境へ渡す置き場所

`projects/` は git 管理外なので、実物の絵はこちらに届きません。
**見た目の確認（CLAUDE.md の約束）を実物で行うには、絵そのものが要ります。**

## 渡し方

お手元（Mac）で、`tool/projects/matsubara-seiki/generated/` の4枚をここにコピーして push してください。

```
cp projects/matsubara-seiki/generated/*.png _incoming/
git add _incoming && git commit -m "実物の生成ビジュアル4枚を渡す" && git push
```

期待するファイル名（注文書の `visualId` と一致していること）

| 用途 | ファイル名 | 置き場所 | 比 |
| --- | --- | --- | --- |
| firstView | `03869ceb-firstView.<拡張子>` | index / hero | 21:9 |
| strength | `03869ceb-strength.<拡張子>` | index / technique | 16:9 |
| company | `03869ceb-company.<拡張子>` | company / history | 16:9 |
| peak | `03869ceb-peak.<拡張子>` | index / declined | 16:9 |

## 確認が終わったら

**この置き場所に絵を残さない。** 確認が済んだら消して push してください
（お客様の絵を git の履歴に残さないため）。

## 代わりに、キャプチャを送っていただいても構いません

その場合は PC 1280px / SP 390px で、hero・strength・peak・company の8枚。
**こちらで代用画像を作って判定することはしません**（CLAUDE.md・D-403）。

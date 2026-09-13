# AI版 Design Brief — 実装計画（実装前の報告）

作成: 2026-09-13 ／ **コードはまだ書いていません。** ご指示どおり、接続点の報告です。

---

## 0. いちばん重要な設計上の制約

> **Astro のビルド中に AI を呼ばない。**

いまの構成では、`site-template/src/pages/index.astro` がビルド時に
`analyze()` と `composeTop()` を**その場で同期実行**しています。
ここに API 呼び出しを差し込むと、

- **ネットワークが無いと書き出せなくなる**（工場のWi-Fiで動かなくなる）
- 書き出すたびに課金される
- 同じデータから毎回違うサイトが建つ（再現性が消える）

したがって：

```
AI が動くのは「生成のとき」だけ。**書き出しは、保存された Brief を読むだけ。**
```

Brief は `project.json` の `designBrief` に保存します。
**Cloudflare Pages の静的生成も、オフラインでの書き出しも、そのまま維持されます。**

---

## 1. 新しく作るファイル

| ファイル | 役割 |
|---|---|
| `tool/lib/design/brief-rules.ts` | **規則版の Brief を作る。**（いまは `playbook.ts` の中で暗黙に決まっているものを、Brief という形で明示的に出す） |
| `tool/lib/design/brief-ai.ts` | **AIに優先順位だけを判断させる。** 出力は enum のみ。API呼び出しはここだけ |
| `tool/lib/design/brief-prompt.ts` | AIへの指示文と、渡す候補の組み立て |
| `tool/brief.mjs` | `npm run brief -- <案件ID> [--ai] [--keep]` の入口 |
| `tool/brief.test.mjs` | 試験（検査が効くか・フォールバックするか・規則版と比較できるか） |

## 2. 変更する既存ファイル

| ファイル | 変更 |
|---|---|
| `tool/lib/schema.ts` | `Project` に `designBrief?: DesignBrief` を足す（**型は `brief.ts` から import。書き写さない**・D-197） |
| `tool/lib/design/brief.ts` | `secondaryStrength` を型と検査に追加。`emphasis` の語彙を整理（後述） |
| `tool/lib/design/analysis.ts` | `secondaryStrength` を足す（2位の候補。根拠があるときだけ） |
| `tool/lib/design/sections.ts` | `composeTop` / `composePage` の `opts` に `brief?: DesignBrief` を足す |
| `tool/site-template/src/lib/site.ts` | `project.designBrief` を読み出して公開（**読むだけ。作らない**） |
| `tool/site-template/src/pages/index.astro` ほか | `composeTop(..., { brief })` を渡す |
| `tool/build-site.mjs` | Brief があれば使う。`sourceProjectHash` が合わなければ**警告を出す** |
| `tool/generate.mjs` | 原稿生成の前に Brief を作る（`--keep-brief` で固定） |
| `tool/qa-companies.mjs` | **規則版とAI版を並べて比較**できるようにする |

**触らないもの**：取材フォーム／`project.json` の取材項目／`verify.ts`／`internal-language.ts`／
未確認フロー／人によるレビュー／Astro の静的生成／Cloudflare Pages／既存のHTML・CSS。

---

## 3. 接続点（どこで規則版とつながるか）

```
project.json
   ↓
analyze(project)                     lib/design/analysis.ts（既存・変更は secondary の追加のみ）
   ↓
ruleBrief(project, analysis)         lib/design/brief-rules.ts（新設）
   │  規則版の候補。**ここまでは今と同じ判断**
   ↓
【--ai のときだけ】
aiBrief(project, analysis, ruleBrief) lib/design/brief-ai.ts（新設）
   │  AIは「候補の優先順位」だけを返す。enum のみ
   ↓
validateBrief(brief, materialsOf)     lib/design/brief.ts（既存・そのまま使う）
   │  1.形 → 2.語彙 → 3.可否 → 4.材料
   │  **1つでも落ちたら ruleBrief に落とす**
   ↓
project.json の designBrief に保存（sourceProjectHash つき）
   ↓
── ここから先はネットワーク不要 ──
   ↓
composeTop(project, analysis, { brief })   lib/design/sections.ts（既存・opts に追加）
   ↓
Present.astro → Astro → Cloudflare Pages
```

### `composeTop` の中でどうつながるか

いまの `repress()`（表現を差し替える関数）に、**Brief を優先する1段**を足すだけです。

```ts
// いま
const { presentation } = choosePresentation(content, analysis, materials, { isLead, avoid });

// あと
const fromBrief = brief?.priority.find((b) => b.content === content);
const { presentation } = fromBrief && canPresent(...) && hasMaterial(...)
  ? { presentation: fromBrief.presentation, why: "Briefの判断" }
  : choosePresentation(content, analysis, materials, { isLead, avoid });  // ← 規則版がそのまま残る
```

**可否表と材料の確認は、Brief 経由でも必ず通ります。**
`validateBrief` で一度通したものを、**描く直前にもう一度確認**します
（AIの判断を4段検査より先に信頼しない、というご指示を、2重にして守ります）。

---

## 4. AIに渡すもの・返させるもの

### 渡すもの

1. **`analyze()` の結果**（事実の見立て。点数と根拠つき）
2. **各内容の材料**（`materialsOf` の結果。件数・長さ・短い値の有無…）
3. **選べる候補の一覧**（可否表と材料を通した結果＝**選択肢そのもの**）
4. 規則版の Brief（比較のたたき台）

**`project.json` 全体は渡しません。** 渡すと「本文を書く」余地が生まれます。
渡すのは**判断に必要な事実だけ**です。

### 返させるもの（これだけ）

```json
{
  "primaryStrength": "difficulty",
  "secondaryStrength": "speed",
  "priority": [
    { "content": "declined", "presentation": "quote",   "emphasis": "lead" },
    { "content": "cases",    "presentation": "process", "emphasis": "normal" }
  ]
}
```

**理由の文章は書かせません**（ご指示）。
`why` は規則版が機械的に作るものだけを残します。

> **ご指示の例にあった `"emphasis": "support"` について。**
> いまの語彙は `lead / normal / quiet` の3段です（既存のCSSと検査がこの3つで動いています）。
> **`support` は `normal` と同じ意味**と読みましたので、語彙は3段のまま使います。
> 4段にしたほうがよければ、そう仰ってください。

### AIに使うモデルと費用

- モデル：`claude-opus-5`（原稿生成と同じ・D-019）
- **1案件につき1回**。出力は enum だけなので短い
- 前にお答えしたとおり、**増分は「1ページ分」程度**
- `output_config: { effort: "low" }` を使う予定です。**選択肢の中から選ぶ作業**なので、
  原稿生成（`high`）ほどの思考は要りません。費用も下がります

---

## 5. 「させてはいけないこと」を、どう機械で止めるか

| ご指示 | 止め方 |
|---|---|
| 新しい presentation を発明する | 2段目（語彙）で落ちる |
| enum 以外を出す | 1段目（形）＋2段目（語彙）で落ちる |
| `project.json` にない情報を補う | **そもそも本文を返させない。** 返すのはenumだけ |
| 数字を推測する | 同上。数値を返す欄が無い |
| 強みを推測で作る | `primaryStrength` は候補の中からしか選べない。候補は**根拠のあるものだけ**（D-205） |
| 存在しない引用を作る | 引用文を返す欄が無い。`quote` は材料（鍵括弧つきの発言）が無ければ4段目で落ちる |
| 材料のない表現を選ぶ | 4段目（材料）で落ちる |
| HTML/CSS を直接生成する | 返す型に該当する欄が無い |
| 可否表を無視する | 3段目（可否）で落ちる |
| **情報を削って差を作る** | **`priority` に無い内容も、規則版が出す。** Briefは「順番と見せ方」だけを変え、**内容の取捨には使わない**（D-204） |

最後の1行が重要です。**Brief に「出さない」という指示は書けない設計**にします。

---

## 6. 規則版とAI版を比較できる状態にする

`designBrief` に、**どちらで決まったか**を残します。

```json
"designBrief": {
  "source": "ai",              // "rules" | "ai" | "ai-fallback"
  "sourceProjectHash": "1a2b3c4d",
  "agreedWithRules": false,    // 規則版と同じ判断だったか
  "problems": [],              // 4段検査で落ちた内容（fallback のとき）
  ...
}
```

`npm run qa:companies -- --compare` で、3社について

```
A 精度    規則版 conditions:spec     AI版 conditions:spec      → 同じ
B 難加工  規則版 declined:quote      AI版 cases:process        → 違う
C 短納期  規則版 conditions:comparison AI版 同じ               → 同じ
```

のように並べて出します。

> **AIが規則版と同じ判断をしても失敗としません**（ご指示）。
> むしろ「規則で十分なところでAIが余計なことをしない」ことを確かめます。

### 実案件では、AI判断を必須にしません

- 既定は **規則版**
- `npm run generate -- <ID> --ai-brief` を付けたときだけAIが動く
- どちらで決まったかは `designBrief.source` に残り、書き出しのときに表示されます

---

## 7. 検査（既存に足すもの）

| 足す試験 | 見るもの |
|---|---|
| 形が壊れた出力 | 1段目で落ち、規則版に落ちるか |
| 語彙にない値 | 2段目で落ちるか |
| 可否表にない組み合わせ | 3段目で落ちるか |
| 材料のない表現 | 4段目で落ちるか |
| **内容を減らした Brief** | **規則版が出す内容が消えていないか**（D-204） |
| API が落ちた・鍵が無い | **例外で止まらず、規則版で最後まで書き出せるか** |
| 同じ入力 | `sourceProjectHash` が一致し、作り直しが要らないか |

**APIを叩かずに試験します**（`prompt.test.mjs` と同じやり方）。
AIの応答は作り物を食わせて、**検査とフォールバックが効くか**だけを見ます。

---

## 8. 作業の順序

1. `secondaryStrength` を `analyze()` と `brief.ts` に足す
2. `brief-rules.ts`（規則版の Brief）— **出力は変わらない**。いまの判断を Brief の形にするだけ
3. `composeTop` / `composePage` が Brief を受け取れるようにする — **Brief が無ければ今のまま**
4. `brief.mjs`（保存・`--keep`・ハッシュ照合）
5. `brief-ai.ts`（AI呼び出し）＋ 検査とフォールバック
6. `qa:companies -- --compare` で3社を比較
7. 画面を見る

**1〜4は出力が変わりません。** 変わるのは5からです。

---

## 9. 実装前に、1点だけ確認させてください

**`emphasis` の語彙**（第4章）です。
ご指示の例では `"emphasis": "support"` でしたが、いまの語彙は `lead / normal / quiet` の3段で、
CSS と検査がこの3つで動いています。

- **案1（推奨）**：3段のまま。`support` は `normal` と同じものとして扱う
- 案2：4段にする（`lead / support / normal / quiet`）。CSS と検査も広げる

案1で進めてよろしければ、このまま実装に入ります。

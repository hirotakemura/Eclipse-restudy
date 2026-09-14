# AI版 Design Brief — 実装報告

2026-09-14 ／ ご指示の10項目に沿ってご報告します。
**結論から申し上げると、実案件へのAI導入はまだ勧めません。** 理由は10項に書きました。

---

## 1. 変更したファイル

### 新しく作ったもの

| ファイル | 役割 |
|---|---|
| `tool/lib/design/brief-rules.ts` | **規則版の Brief。** いま暗黙に決まっているものを、Briefという一枚の形にして見えるようにするだけ |
| `tool/lib/design/brief-prompt.ts` | AIに渡すものの組み立て |
| `tool/lib/design/brief-ai.ts` | **AIを呼ぶ唯一の場所。** 検査とフォールバック |
| `tool/brief.mjs` | `npm run brief -- <ID> [--ai] [--adopt] [--keep]` |
| `tool/brief.test.mjs` | 試験55件 |

### 変えたもの

| ファイル | 変更 |
|---|---|
| `lib/design/analysis.ts` | `secondaryStrength` を追加。**強みの語彙表をここに一本化**（下記9・D-222） |
| `lib/design/brief.ts` | 語彙表の重複を削除、`secondaryStrength`・来歴の型・`projectHashOf()` を追加 |
| `lib/design/sections.ts` | `composeTop/composePage` が Brief を受け取る。**同じ内容を同じ形で2度出さない**（D-219）、**表の帯は表のまま**（D-220）、`decidedBy`／`ruleChoice`／`traceOf()` |
| `lib/design/materials.ts`・`system/compat.ts` | 表の可否を**全行数**で判定する `rows`（D-221） |
| `lib/schema.ts` | `designBrief?: StoredBrief`（型は `brief.ts` から import） |
| `build-site.mjs` | Brief を読む・印の照合・**誰が何を決めたかの表示**。構成も落としたデータから作る（D-213の徹底） |
| `generate.mjs` | `--ai-brief` / `--keep-brief` |
| `qa-companies.mjs` | `--compare` / `--ai` |
| `site-template/src/lib/site.ts`・4つの `.astro`・`Band.astro` | Brief を読んで渡す・`data-decided-by` を出す |

**触っていないもの**：取材フォーム、`project.json` の取材項目、`verify.ts`、`internal-language.ts`、
未確認フロー、人によるレビュー、Astroの静的生成、Cloudflare Pages、CSS。

---

## 2. AIと規則版の接続点

```
project.json
   ↓
analyze()                        事実の見立て（LLMなし）
   ↓
ruleBrief()                      規則版の判断
   ↓ ── --ai のときだけ ──
aiBrief()                        AIは「順番・表現・強さ」だけを返す
   ↓
1段（AIの返答の形）→ validateBrief の4段（形→語彙→可否→材料）
   ↓  1つでも落ちたら規則版に戻す。**止めない**
project.json の designBrief に保存
   ↓ ── ここから先はネットワーク不要 ──
composeTop(..., { brief })       描く直前に、可否表と材料をもう一度確認
   ↓
Astro → HTML（data-decided-by つき）
```

接続点は `sections.ts` の `repress()` の1箇所だけです。

```ts
const want = brief?.blocks.find((b) => b.content === sec.content && !avoid.includes(b.presentation));
const ok = want && canPresent(...) && hasMaterial(want.presentation, m);
const presentation = ok ? want.presentation : rules.presentation;  // ← 規則版がそのまま残る
```

**Brief を渡さなければ、いままでとまったく同じ道を通ります。**

---

## 3. AIの権限範囲

| 許可 | 実装 |
|---|---|
| `primaryStrength` の優先順位判断 | 候補は9個の語彙のみ |
| `secondaryStrength` の判断 | 同上 |
| 順序（`blocks` の並び） | 配列の順序 |
| 既存 presentation の選択 | **可否表と材料を通した一覧の中からのみ**（選べないものは最初から見せない） |
| `emphasis` の選択 | `lead / normal / quiet` の3段のみ（D-218） |

| 不許可 | 止まる場所 |
|---|---|
| 新しい presentation・enum の発明 | 2段（語彙） |
| HTML/CSS の生成 | 1段（返してよい項目は3つだけ。それ以外のキーがあれば落ちる） |
| `project.json` にない情報の追加・数字の推測・引用文の生成 | **返す欄が無い**（文字列を返す欄が1つも無い） |
| 強みの推測 | 2段。根拠が無ければ `unknown` |
| 材料のない presentation の選択 | 4段、**さらに描く直前にもう一度** |
| 可否表を無視した選択 | 3段、**さらに描く直前にもう一度** |
| 必要情報の削除 | 1段（規則版が出す内容が1つでも欠けていたら、その判断を丸ごと捨てる） |
| 出所を偽る | 1段（`source` はAIが書ける欄ではない。こちらが付ける） |

**Brief に「出さない」という指示は書けない設計**にしてあります。
`blocks` から消しても、帯は規則版が出します（D-204）。試験で確認済みです。

---

## 4. 4段検査とフォールバックの動作

実際の動作（作り物のAI応答・APIは叩いていません）：

```
  AIの判断は検査で落ちました（1件）。規則版で続けます
    material　blocks[1]　「spec」に必要な材料が「cases」にありません
出所：ai-fallback
```

- **どこで落ちても生成は止まりません。** 鍵が無い・通信断・429・壊れたJSON、すべて規則版に落ちて最後まで書き出します
- 落ちた理由は `designBrief.problems` に残り、`npm run build:site` のたびに表示されます
- 検査は**2重**です。保存時に1回、**描く直前にもう1回**（ご指示「AIの判断を4段検査より先に信頼しない」）

---

## 5. rules / ai / ai-fallback の最終結果

`designBrief.source` に残り、**帯ごとに `data-decided-by` としてHTMLにも出ます。**

| 出所 | 意味 |
|---|---|
| `rules` | AIを使っていない、または**AIの判断が規則版と同じ**だった |
| `ai` | AIの判断が検査を通り、**実際に画面が変わった** |
| `ai-fallback` | AIの判断が落ちた／AIを呼べなかった。規則版で書き出した |

規則版と同じ判断だった帯に `ai` の印を付けない設計にしています。
付けると「AIが何を変えたのか」が読めなくなるためです（D-217）。

---

## 6. precision / difficulty / speed の比較結果

### 規則版だけ（AIなし・いまの実案件の既定）

```
A 精度      figure   conditions:spec  cases:process  materials:chips  equipment:cardGrid  technique:prose
B 難加工    spec     declined:quote   cases:process  materials:chips  technique:process   executive:prose
C 短納期    spec     conditions:comparison  cases:process  equipment:cardGrid  materials:chips  technique:process
```

情報の見せ方の重なり **平均0.37／まったく同じ 0/3通り**（AI導入前と同じ。悪化していません）

### 作り物のAI応答を通した場合（B社）

```
規則版　declined:quote  cases:process  conditions:spec  materials:chips  technique:process …

AIが「事例は引用で、技術は箇条書きで」と判断
  → 検査4段 通過 → 採用

実際のHTML
  declined    quote        [rules]
  cases       quote        [ai]      ← 変わった
  materials   chips        [rules]
  technique   list         [ai]      ← 変わった
  executive   prose        [rules]
```

同じB社で、AIが**材料の無い表現**（事例を仕様表で）を選んだ場合：

```
  material　blocks[1]　「spec」に必要な材料が「cases」にありません
  → ai-fallback。HTMLは規則版のまま1バイトも変わらず
```

**APIキーが無いため、本物のAIには一度も投げていません。** 実際の判断の質は未検証です（10項）。

---

## 7. 既存テストの件数

| 試験 | 件数 |
|---|---|
| 事実検証 | 15 |
| 社内語の検出 | 18 |
| デザイン構成 | 25 |
| 情報表現・可否表・4段検査 | 31 |
| 原稿プロンプト | 21 |
| **AI版Brief（新規）** | **55** |
| 配色のコントラスト | 84 |
| **合計** | **249**（改修前194／+55） |

すべて通っています。

---

## 8. AIを使っていないときに、HTMLが変わっていないこと

3社×全ページを、改修前のコードと1バイトずつ突き合わせました。

**属性 `data-decided-by` を除くと、差分は5箇所だけです。**
その5箇所はすべて、**画面を見て見つけた不具合の修正**です。

| ページ | 変わったもの |
|---|---|
| A・B・C 対応可能範囲 | 「仕様」の帯が、上の帯と同じ形だったのを**表に戻した**（D-219・D-220） |
| A・C 設備 | 「保有設備一覧」の帯が、上と同じ札の格子だったのを**別の形にした**（D-219） |

トップページ・強み・事例・会社概要・お問い合わせ・採用・代表挨拶は、**属性以外まったく同じ**です。

> **報告しておくべきこと。**
> この5箇所は、ご指示の「既存機能を壊さない」に照らすと**出力を変えています。**
> ただし直した中身は、**「対応できる条件」と「仕様」が同じ4項目を同じ大きな数字で二度出していた**
> という状態で、3社とも同じでした。D-214で見せ方を強みに寄せたときに私が入れた退行です。
> **数値の検査（重なり0.37）は全部通っていました。** 画面を見なければ見つかりませんでした（D-192）。

---

## 9. AIを使った場合に、実際に何が変わったか

上の6項のとおりで、**帯の形が変わり、変わった帯だけに `ai` の印が付きます。**
情報は1つも減りません。

あわせて、実装中に**AIとは関係のない不具合を3件**見つけて直しました。

| | 内容 |
|---|---|
| D-219 | 同じ内容が同じ形で2度出ていた（3社とも・対応可能範囲と設備） |
| D-221 | **8台のうち型番が2台しか分からない案件で、保有設備一覧の表が消えて総台数の数字になる**。設備一覧は980,000円商品の中核で、型番そのものが検索されます |
| D-222 | 強みの語彙表を2箇所に書き写していたため中身がずれ、**`speed` を返しても「語彙にありません」で落ちる検査**になっていた。D-197とまったく同じ間違い |

---

## 10. 次に進むべきか、まだAIを入れるべきではないか

### **まだ実案件に入れるべきではない、と考えます。**

理由は3つです。

**① 本物のAIに一度も投げていません。**
いまの環境にAPIキーがなく、**検査とフォールバックと画面への反映だけを、作り物の応答で確かめた**段階です。
ご指示の評価項目のうち「1. AIが規則版より妥当な優先順位を選べるか」だけが未検証です。
2〜6（不適切な判断が止まるか／安全に戻るか／情報を削らずに主役だけ変えられるか／
規則で足りるところで余計な変更をしないか／最終HTMLへ反映されるか）は確かめました。

**② 規則版だけで、会社ごとの差はすでに出ています。**
重なり0.37／まったく同じ0件。**AIを入れなくても成立している**状態です。
ここにAIを入れる理由は「より妥当な優先順位」しかなく、それが①で未検証です。

**③ 今回いちばん効いたのは、AIではなく画面を見たことでした。**
直した3件（D-219・D-221・D-222）は、いずれも数値の検査を通り抜けていました。
**AIを足すより先に、こちらの目で見る回数を増やすほうが、いまは効きます。**

### 次にやるべきと考えていること

1. **鍵を用意して、3社にAI版を1回ずつ投げる**（費用は1案件あたり1回・出力は語彙のIDだけなので数円規模）
2. その結果を、規則版と並べて**社長（私）とアドバイザーの目で見る**
3. **AIの判断が規則版より妥当だと3案件で言えたときだけ**、AI版を既定にするかを議論する
4. 言えなければ、**AI版は作ったまま使わない。** それで損はありません（既定は規則版のままなので）

**実案件（松原精機）には、いまのところAI版を使いません。**
`npm run generate -- matsubara-seiki` は、いままでどおり規則版で動きます。

---

## 使い方

```bash
npm run brief -- <案件ID>              # 規則版で判断を作って採用する（既定）
npm run brief -- <案件ID> --ai         # AI版を**提案として**作る。採用はしない（D-256）
npm run brief -- <案件ID> --adopt      # 画面を見たうえで、提案を採用する
npm run brief -- <案件ID> --ai --adopt # AI版を作って、その場で採用する（検証用）
npm run brief -- <案件ID> --keep       # 案件データが変わっていなければ作り直さない

npm run generate -- <案件ID>            # 原稿生成（既定は規則版）
npm run generate -- <案件ID> --ai-brief # AI版の判断で原稿を生成

npm run qa:companies -- --compare       # 3社を並べて比較
npm run qa:companies -- --compare --ai  # 本物のAIを呼んで比較
npm run build:site -- <案件ID>          # 書き出し（**AIは呼ばれません**）
```

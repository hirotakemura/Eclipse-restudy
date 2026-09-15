# Visual Asset Strategy / Asset Direction の設計

作成 2026-09-15　／　**この段階ではコードを変更していません。**
承認：アドバイザー（2026-09-15・原則6項目の追加を含む）

---

## 0. 目的と、目的でないこと

### Asset層の目的

> **そのVisual Compositionを成立させるために、どの素材が必要かを判断すること。**

### 目的でないこと

> **画像を増やしてページを豪華にすること。**

この2行が、以下すべての判断のもとになる。迷ったらここに戻る。

---

## 0-1. 設計原則（アドバイザー指示・2026-09-15）

**この6項目は、実装のどの段階でも曲げない。**

### ① `source: "none"` は失敗ではない

素材を置かないことは、**正当な完成形の選択肢**である。
「素材が決まらなかった」ではなく「素材は要らないと決めた」を表す値として扱う。

### ② 写真が無くても、library や graphic で代替する義務はない

Typography・余白・面・Graphic だけで成立するなら `none` を選ぶ。
**穴を埋めるために素材を探しにいかない。**

### ③ library は「空白を埋めるための素材」ではない

使ってよいのは、
**「このVisual Compositionにおいて、外部素材があることで品質が明確に向上する」**
と言える場合だけ。言えないなら `none`。

### ④ 顧客写真があっても、必ず使う義務はない

その写真が **Visual Peak または Evidence として有効な場合**にだけ使う。
預かった枚数を消化しない。

### ⑤ 「素材を置いた数」「画像枚数」を品質指標にしない

評価するのは次の2つ。

- **写真が無くても、完成形として成立しているか**
- **写真を使った場合、その写真が意味を持っているか**

### ⑥ デザイン品質は、Asset単独では上がらない

```
Information Architecture × Visual Composition × Typography × Asset × Whitespace
```

の組み合わせで評価する。**Asset だけで品質を上げようとしない。**

---

## 0-2. Library の採用手順（自動採用の禁止）

**「libraryに素材がある」→「使う」という判断を禁止する。**

必ずこの順序を通す。

```
Visual Composition        画面の構成が先に決まる
      ↓
Asset Requirement         その構成に何が要るかを決める（要らないなら none で終わり）
      ↓
Library Candidate         要件に合う候補を探す（0件でよい）
      ↓
採用可否                  「これがあることで品質が明確に上がるか」を判定する
```

3段目で候補が見つかったことは、4段目の理由にならない。
**「あったから使った」は、原則③に反する。**

---

## 1. 現状（実測・2026-09-15）

### 1-1. すでに「Asset層の半分」は存在する。うち2つは死んでいる

| 軸 | 語彙 | 画面に届いているか |
|---|---|---|
| `surface`（面） | 7語 | ○ `data-surface` で出力・CSSで描画 |
| `motif`（地紋） | 5語＋none | ○ `data-motif` で出力・CSSで描画 |
| `media`（写真の扱い） | 6語 | **✗ 死んでいる** |
| `brief.motif`（AI Briefの地紋） | 5語＋none | **✗ 死んでいる** |

**`media`**：`Section` の必須フィールドで、AI Briefの検査語彙にも入っているが、
`site-template/` 側の参照が **0件**（`Band.astro` が受け取っていない）。
さらに生成される値は2つだけで、`sections.ts:303` が
`写真なし→none ／ galleryの帯→full ／ それ以外→none` としか書いていないため、
**`inline` `side` `frame` `mono` の4語は一度も生成されない。**

**`brief.motif`**：`brief.motif` を読んでいる箇所が **0件**。
画面に出る地紋は `decorate()` が `pickMotif(d.motifs, a)` で決めている。

つまり**どちらも、計算して・検査して・捨てている。**

### 1-2. 背景・Graphic の実測（9ページ分）

| 案件 | 帯 | 地紋つき | 出た面 | img（0枚→あり） |
|---|---|---|---|---|
| 製造業A 精度 | 26 | 6 | rule / plain / soft / grid | 0 → 10 |
| 製造業B 難加工 | 28 | 7 | rule / plain / soft / grid | 0 → 10 |
| 製造業C 短納期 | 26 | 6 | rule / plain / soft / grid | 0 → 10 |
| 汎用A サービス | 14 | **0** | plain / paper | 0 → 6 |
| 汎用B ブランド | 14 | **0** | plain / paper | 0 → 6 |
| 汎用C 人・店舗 | 16 | **0** | soft / paper / plain | 0 → 6 |

**汎用3社の画面に、地紋が1本もない。**

原因は分析側ではない（汎用3社とも `a.motifs` は2〜3個計算されている）。**型の側**である。

- 汎用6型のうち地紋を持つのは `modern`(grid) と `classic`(grain) の2つだけ。
  検証に使っている3社は editorial / luxury / human で、いずれも `motifs: ["none"]`
- 地紋の語彙5つのうち4つ（寸法線・方眼・工程線・断面）が**図面のたとえ**で、
  汎用に使えるのは実質 `grain` の1つ

**「汎用も同等の品質」は、いまの語彙では構造的に達成できない。**

また `accent`（白抜き）と `dark`（暗い地）は、**検証6社の画面に1本も出ていない。**
コードの不具合ではなく、検証fixtureが industrial / product / modern / dynamic の型を
使っていないため。**いちばん強い2つの面が、一度も目視確認されていない。**

### 1-3. 写真の扱いの穴

**① `hasRealPhotos` は案件全体で1つの真偽値**（`analysis.ts:157`）。
「代表者写真はあるが加工事例写真が無い」を区別できない。
`photoOf(カテゴリ)` は `analyze` の内部に1箇所あるだけで（設備の点数計算のみ）、外に出ていない。

**② 写真は聞き取りフォームの項目として存在しない。**
`form-definition.ts` に `photos` という**型**は定義されているが、その型のフィールドは **0件**。
だから `npm run gaps` は写真の質問を1件も出さない（「写真」で0ヒット）。
**それでいて公開判定は仮画像で止まる。**
止める基準はあるのに、何をもらえばよいかを出す仕組みが無い。

**③ 画像の最適化がゼロ。**
`import-photos.mjs` はコピーするだけ、`build-site.mjs` もコピーするだけ。
`<img>` に `width/height` も `srcset` も無い。`.heic` を取り込み対象にしているが、
ブラウザで表示できない。

**④ 分類が製造業語彙。**
外観／代表者／工場・設備／加工事例／働く人／ロゴ／その他。
汎用の「店舗」「施工」「サービス」「商品」が無い。

### 1-4. 写真が無いときに失われるもの

| 失うもの | 内訳 |
|---|---|
| 最初の画面 | 6種のうち `photo` の1種 |
| 組み方 | `fullbleed`（`a.hasRealPhotos` が条件） |
| 表現 | `fullWidth` |
| 山 | 6種のうち `image` の1種 |

**写真0枚でも山は4種類作れる**（number / statement / process / spec）。
実測でも、写真0枚のfixtureで測った10ページ中8ページに山があった。
**ここは設計どおり効いている。**

---

## 2. 責務分担

```
analyze()          会社の見立て          会社の性格。ページでは変わらない
    ↓
Design Brief       何を強く見せるか      主役・2番手・帯の順・強さ
（AI Brief）                             ※AIが触ってよいのはここだけ
    ↓
composeTop/Page    何を・どう見せるか    content × presentation（可否表・材料）
    ↓
composeVisual      画面のリズム          山・余白・組み方・文字の段
    ↓
composeAssets      何の素材が要るか      出所 × 意図 × 役割 × 主題　←新設
    ↓
Astro              描く
```

### AI Brief と矛盾させないための、ただ1つの約束

**`composeAssets` は `brief` を引数に取らない。**

```ts
composeAssets(sections: VisualSection[], project: Project, a: Analysis, opts: { direction?: string }): AssetSection[]
```

引数に無ければ、AI Brief がこの先どう確定しても Asset 層は影響を受けない。
**境界を言葉で定義するのではなく、依存を書かないことで守る。**

### Asset層を composeVisual の直後に置く理由

1. **素材の必要性は帯1本では決まらない。**
   「ここに写真が要る」は、山がどこか・余白をどこで取るかが決まって初めて言える。
   ページ全体を見ている関数は `composeVisual` だけである。
2. **Brief の下に置くと、帯の順番が確定する前に素材を決めることになる。**
   `repress` が形を入れ替えるので、素材だけ先に決めると
   見出しと中身がずれた D-302 と同じ事故が起きる。
3. **AI Brief に依存させない**（D-266 で「当面使わない」と決めている）。

### いま層をまたいでいるフィールド

| Brief のフィールド | 本来の層 | 画面に届いているか | 扱い |
|---|---|---|---|
| `primaryStrength` / `secondaryStrength` | Brief | ○ | そのまま |
| `blocks[].emphasis` / `blocks` の順序 | Brief | ○ | そのまま |
| `blocks[].presentation` | 構成 | ○ | D-259で情報量の検査を追加済み。将来の整理候補 |
| `blocks[].surface` / `layout` | Visual Composition | ○ | 将来の整理候補 |
| `motif` | **Asset** | **✗** | **廃止予定** |
| `hero.media` / `blocks[].media` | **Asset** | **✗** | **廃止予定** |

---

## 3. データ構造

```ts
// lib/design/system/asset.ts ── 語彙

/** どこから来た素材か。**権利と証拠性はここで決まる** */
export type AssetSource = "none" | "graphic" | "customer" | "library" | "generated";

/** 何のために置くか。**証拠か、雰囲気か。** ここが混ざると生成画像が実績写真になる */
export type AssetIntent = "evidence" | "atmosphere";

/** 画面の中での働き。**`Visual.peak` とは別物**（§4） */
export type AssetRole = "lead" | "support" | "background" | "decoration";

/** 何が写っている／描かれているべきか */
export type AssetSubject =
  | "workpiece" | "facility" | "exterior" | "person" | "workplace" | "product"  // 実写の主題
  | "texture" | "grid" | "dimension" | "geometry" | "light";                    // 描く主題

export interface Asset {
  source: AssetSource;
  intent: AssetIntent;
  role: AssetRole;
  subject: AssetSubject;
  /** 実写が要るのに無い。**人に知らせる。代替で埋めない**（原則②） */
  wanted?: { category: PhotoCategory; why: string; priority: "high" | "medium" | "low" };
}

/**
 * 意図ごとに使ってよい出所。**証拠はお客様のものだけ。**
 * `evidence` に `none` を入れているのが要点で、
 * **顧客写真が無いときの正解は「置かない＋依頼する」であって、代替素材ではない。**
 */
export const ALLOWED: Record<AssetIntent, AssetSource[]> = {
  evidence:   ["customer", "none"],
  atmosphere: ["graphic", "library", "generated", "none"],
};
```

`intent` は**帯の `content` から機械的に決まる。** AIも人も選ばない。

```ts
const EVIDENTIAL: ContentId[] = ["cases", "equipment", "photos", "profile", "executive", "recruit"];
// 上記以外（declined / praise / technique / materials / conditions / history / offerings / draft / inquiry）は atmosphere
```

帯へのぶら下げ方は `Visual` と同じ形にする。

```ts
export type AssetSection = VisualSection & { asset: Asset };
```

### 採らなかった構造と、その理由

| 案 | 採らない理由 |
|---|---|
| `sections: [{ sectionId, ... }]` | `Section` は id を持たず `content × presentation` で識別している。id を新設すると**同じものに名前が2つ**になり、D-197（CSSに数字を書き写して語彙とずれた）の再発になる |
| `assetType: "customer-photo \| library \| ..."` | **出所（誰のものか）と種類（何が写るか）が混ざる。** 権利と証拠性は出所で決まり、見た目は主題で決まるので、分けないと必ず混線する |
| `visualStyle` | 見た目は `direction` と `surface` がすでに決めている。**同じことを2箇所で決めない** |
| `required` を独立フィールドに | `wanted` の有無がそのまま「要るのに無い」を表す。無いなら要らない、が自明になる |

---

## 4. Visual Peak と Evidence の関係

**2つは直交する。**

| `Visual.peak` | 山を作る手段 | 典型的な Asset | `intent` |
|---|---|---|---|
| `number` | 大きな数値（Typography） | `none` | — |
| `statement` | 一言（Typography） | `none` ／ `graphic`（背景） | atmosphere |
| `process` | 工程の流れ | `graphic`（工程線） | atmosphere |
| `spec` | 表を壁に | `graphic`（方眼・罫） | atmosphere |
| `image` | 写真を全幅 | **`customer` 必須** | **evidence** |
| `none` | — | 任意 | — |

- **山は素材を要らない。** 6種のうち5種は写真なしで立つ（実装済み・`needsPhoto: true` は `image` だけ）
- **証拠は素材を要る。** ただし証拠になる場所は山とは限らない。加工事例ページの写真は山でなくても証拠である
- **山かつ証拠**なのは `image` の山だけ

「±0.005mm」「最短翌日」「他社で断られた案件を実現」は、**情報そのものが山になる。**
写真を必須条件にしない。

> **設計上の注意**
> `AssetRole` に `peak` という名前を使わない（`lead` とする）。
> `Visual.peak` と名前が衝突すること自体が、この2つを混同させる原因になる。

---

## 5. `source` を降りる順番

```
1. customer    そのカテゴリの実写がある。かつ、山または証拠として有効（原則④）
2. graphic     CSS / SVG
3. none        素材を置かない ＝ Typography と余白で持たせる
4. library     §0-2 の4段を通り、「明確に品質が上がる」と言えるときだけ（原則③）
5. generated   **当面、返す経路を実装しない**
```

**`none` を3番目に置いている。** 「素材が無いから何か貼る」を仕組みで防ぐため。
`source: "none"` は失敗ではない（原則①）。

**`generated` を返す関数を書かない。**
型には入れる（ライブラリのmetadataと揃えるため）が、`composeAssets` から到達できる経路を作らない。
「AIに生成させない」を守るいちばん確実な方法は、禁止ではなく**経路を持たないこと**である。

---

## 6. Manufacturing / General の Asset Language

**新しい辞書を作らない。** `Direction` がすでに `surfaces` / `layouts` / `heroes` / `motifs` を
持っているので、そこに `assets: AssetSubject[]` を1本足す。

### Manufacturing

| 型 | 主題 |
|---|---|
| 標準 | `none` 中心 |
| 精密加工 | dimension / grid / workpiece |
| 老舗・職人 | texture / person / workplace |
| 設計・技術 | grid / dimension / facility |
| 量産・設備 | facility / grid / light |
| 製品・開発 | product / light / texture |

### General ── ここに手当てが要る

| 型 | 主題 | 足りないもの |
|---|---|---|
| 読み物 | texture / light | 紙・光の地紋 |
| 静か・上質 | texture / light | 同上 |
| モダン | grid / geometry | `geometry` |
| 人・温度 | person / workplace / light | `light` |
| 力強い | geometry / light | 両方 |
| 落ち着き | texture | `grain` で足りる |

足す地紋の候補は `softLight`（光のグラデーション）と `geometry`（幾何）の2つ。
**すべてCSSで描き、画像を足さない。**

**業種別テンプレートにはしない。** ここにあるのは雰囲気であって業種ではない。
同じ型を選んでも、会社の材料・強み・写真が違えば出来上がりは変わる。

---

## 7. AIが決める部分 / 規則が決める部分

**Asset層では、AIは何も決めない。**

| 決めるもの | 誰が | 根拠 |
|---|---|---|
| `intent`（証拠か雰囲気か） | 規則 | 帯の `content` から機械的に |
| `source`（出所） | 規則 | §5 の段階を順に降りる |
| `subject`（主題） | 規則 | `content` × `direction.assets` の交差 |
| `role` | 規則 | `Visual.peak` と `emphasis` から |
| `wanted` | 規則 | 証拠が要るのに実写が無いとき |

理由：

1. **AI Brief は当面使わない**（D-266）。使わないものに新しい判断を載せると、Asset層も動かない
2. **AIに判断させる余地が、実はほとんど残らない。**
   `intent` は content から、`subject` は型から、`source` は段階から決まる。
   残るのは「この帯に素材を置くべきか」だけで、それは `Visual.peak` と `emphasis` が
   すでに答えている

将来 AI に渡すとしたら `assetHints`（「この会社は設備写真より加工品写真のほうが効く」という
**優先度の入れ替え**）だけ。ただし **AI Brief が確定してから**判断する。いま設計に入れない。

---

## 8. 写真0枚 / 少数 / 十分

| | 目指す状態 |
|---|---|
| **A 写真0枚** | **Graphic と Typography による完成形。** 写真を待っている穴が1つも無い |
| **B 1〜2枚** | その写真が**山または証拠として有効な場合に**使われる。骨格は A のまま |
| **C 十分** | 証拠の要る場所が実写で埋まる。骨格は A のまま、写真の層だけが厚くなる |

**「写真が無いことが分からない」を基準にしない。**
A は A として完成形であり、B・C はその上に積む。

### 「未完成感が無い」を数で定義する

言葉のままでは検査にならない。すでに持っている道具で測れる形にする。

| 測るもの | 基準 | 道具 |
|---|---|---|
| 見出しだけで中身が空の帯 | **0本** | D-302で導入済み |
| 余白が中身より大きい帯 | **0本** | D-299の実測手法 |
| 仮画像 | **0枚** | 公開判定 |
| 山 | **1つ**（A では number/statement/process/spec のいずれか） | `qa:visual` |
| graphic が効いている帯 | **1本以上**（A で0本なら「ただの白いページ」） | 新規 |
| 文字の段 | 3段以上 | `qa:visual` |
| ページ重量 | A が B・C より軽い | 新規 |

さらに **A→B→C で骨格が変わらないこと**を突き合わせる
（`qa:visual` に既にある照合をそのまま3通りに広げる）。

**枚数と素材数は指標にしない**（原則⑤）。数えるのは「意味を持っているか」である。

### 検証に使う会社

製造業3型（精密・難加工・短納期）と汎用3型。
ただし**汎用は editorial / luxury / human を1つ入れ替える。**
現在の3社はいずれも `motifs: ["none"]` の型で、`accent` と `dark` の面が
検証6社の画面に1本も出ていないため、modern か dynamic を必ず入れる。

---

## 9. `media` / `brief.motif` の廃止タイミング

**設計上は廃止。コードはまだ触らない。**（アドバイザー指示・2026-09-15）

| いつ | 何をするか |
|---|---|
| いま | この文書に「廃止予定」と記録するだけ |
| 第1〜5段階 | `media` / `brief.motif` はそのまま残す。`composeAssets` は**読まない・書かない** |
| **AI Brief 確定後** | schema・AI Brief・検査語彙・`Section` から**一度に**外す |

安全である根拠：**両方とも画面に届いていないので、Asset層と二重に効くことがない。**
「同じものを2箇所が決めていて、画面がどちらかに転ぶ」という事故（D-292・D-295の形）は、
片方が死んでいる限り起きない。

**ただし1つだけ守る。** 第1段階のコードで `media` を参照も更新もしないこと。
いま触ると、後で外すときの影響範囲が広がる。

---

## 10. 実装順序

| 段階 | 内容 | 出力の変化 | 検証 |
|---|---|---|---|
| **0** | この文書（＋意思決定ログ） | なし | — |
| **1** | 語彙 `asset.ts` ＋ `composeAssets` ＋ `data-asset-*` の出力のみ。**描画は変えない** | **なし** | `qa:companies` が「1文字も違わない」と出ること |
| **2** | `graphic` を実装（汎用の地紋2つを含む） | **写真0枚の画面がここで初めて変わる** | A/B/C ＋ 画面 |
| **3** | `wanted` → `gaps` に「写真」の章 | 人への出力 | 実案件で出力を読む |
| **4** | Visual QA に A/B/C と「未完成感」の数 | 検査のみ | — |
| **5** | Asset Library（素材とmetadata・管理画面なし） | 素材ありの画面 | A/B/C |
| **—** | `generated` | やらない | — |
| **—** | `media` / `brief.motif` の削除 | **AI Brief 確定後** | 依存を一度に確認 |

**第1段階は「HTMLが1文字も変わらない」ことを機械で証明できる。**
9ページを足したとき（D-301）も `qa:companies` が「全ページ基準とまったく同じ」と出たので、
同じ手が使える。

**第3段階を第5段階より前に置いている。**
いま公開判定は仮画像で止まるのに、`npm run gaps` は写真の質問を1件も出していない（実測0件）。
素材ライブラリを作るより、**お客様に何の写真を頼めばよいかを出せるようにするほうが、先に効く。**

---

## 11. Asset Library の分類（第5段階）

管理画面は作らない。**分類と権利の欄だけ**を先に決める。

```ts
interface LibraryAsset {
  file: string;
  subject: AssetSubject;
  plan: "manufacturing" | "general" | "both";
  directions: string[];        // 合う型。**Design Direction から自動で候補に挙げるため**
  mood: "katai" | "futsu" | "yawaraka";
  tone: "light" | "dark";
  aspectRatio: string;
  /** 権利。**1枚でも metadata 無しで入れたら、後から遡れない** */
  license: { source: string; commercial: boolean; clientDelivery: boolean; reuse: boolean; note?: string };
}
```

`directions` を持たせるのは候補を挙げるためであって、**採用を決めるためではない**（§0-2）。
`mood` / `tone` は既存の `theme.mood` と面の明暗にそのまま突き合わせる。

**権利の欄は最初から必須にする。** 法務機能は作らないが、欄が無い状態で素材を入れ始めると、
後から1枚ずつ調べ直すことになる。

---

## 12. リスク

**① 語彙の組み合わせ爆発。**
いま content 15 × presentation 12 × surface 7 × layout 5 × peak 6 × density 4 × motif 6。
ここに source 5 × subject 11 を掛けると、検証できない数になる。
→ **Assetは帯ごとに1つだけ。** かつ `subject` は `content` × `direction.assets` から
機械的に決める（自由度を持たせない）。実質増えるのは `source` の5通りだけにする。

**② 「写真が無い＝生成画像」に流れる。**
→ `ALLOWED` の表と、`generated` を返す経路を書かないことで止める。

**③ ページが重くなる。**
いま画像最適化はゼロ。ライブラリ素材を入れると、**写真0枚の会社のページが今より重くなる。**
CSS/SVG優先はここでも効く。Visual QA にページ重量（KB）を足す。

**④ 「良くなった」ことを測れない。**
いまの `qa:visual` は帯の語彙しか数えないので、素材を足しても数字が動かない。
**数字が動かないまま「豪華になった」と言うのは、この案件で何度も間違えてきた形である**（D-192）。
A/B/C の3パターン比較を、第2段階より先に用意する。

**⑤ 権利。** §11のとおり、metadata を後付けにしない。

**⑥ 原則が形骸化する。**
`source: "none"` は、実装上いちばん「手を抜いたように見える」値である。
検査が「素材のある帯の数」を数え始めた瞬間に、原則①⑤は死ぬ。
→ **Visual QA に「素材数」の行を作らない。**

---

## 13. この設計で守られること

| ご指示 | どう守るか |
|---|---|
| AIに画像を生成させない | `generated` を返す経路を実装しない |
| 生成画像を実績写真にしない | `ALLOWED` の表（`evidence` は `customer` と `none` だけ） |
| 写真0枚でも品質を落とさない | `none` を3番目に置く。A を完成形として定義し、7つの数で測る |
| 「写真の代わりに何でも生成」を禁止 | 同上＋`wanted` で人に知らせる |
| 業種別テンプレートを作らない | 主題は `Direction`（雰囲気）に持たせる。業種の辞書を作らない |
| 製造業だけ高級にしない | 汎用に地紋2つを足す。検証に modern / dynamic を入れる |
| AI Brief に依存させすぎない | `composeAssets` が `brief` を引数に取らない |
| Astro build 中にAIを呼ばない | Asset層にAIの判断が1つも無い |
| 画像を増やして豪華にしない | §0-1 の原則6項目。QAに「素材数」の行を作らない |

---

## 付記：第1段階の実装（2026-09-15・D-307〜309）

**計算して持ち、data属性で出すところまで。描画は1つも変えていない。**

### 足したもの

| ファイル | 内容 |
|---|---|
| `lib/design/system/asset.ts`（新） | 語彙・可否表（`ALLOWED`）・`EVIDENTIAL`・`SUBJECT_OF` |
| `lib/design/assets.ts`（新） | `composeAssets()` ／ `wantedPhotos()` |
| `asset.test.mjs`（新） | 32件 |
| `direction.ts` | 型ごとに `assets` を1本足した（既存の値は未変更） |
| `Band.astro` | `data-asset-source / -intent / -role / -subject / -wanted` を出すだけ |
| 帯を組む9ページ | `composeVisual(...)` を `composeAssets(...)` で包んだ |

### 変えていないもの（機械で確認）

`visual.ts` `sections.ts` `analysis.ts` `brief.ts` `brief-rules.ts` `playbook.ts` `materials.ts`
`theme.ts` `schema.ts` `motif.ts` `surface.ts` `typography.ts` `motion.ts` `media.ts`
`peak.ts` `density.ts` `layout.ts` `content.ts` `compat.ts`
`site.css` `Present.astro` `Gallery.astro` `Figure.astro` `site.ts` ── **すべて無傷**

### 証明

| 見るもの | 結果 |
|---|---|
| `npm test` | 586 → **618／全通過** |
| `npm run typecheck` / `astro build` | 通過・13ページ書き出し |
| `npm run qa:companies` | 12ページとも「**帯は同じですが、中身が変わっています**」＝帯の記録は不変 |
| **HTMLの差分** | 書き出した48枚から `data-asset-*` だけを取り除くと、**変更前と1バイトも違わない（48/48）** |
| **画面の差分** | 6社 × 10ページ × PC/スマホ ＝ **90枚が画素まで完全一致** |
| `qa:visual` / `qa:directions` | 既存の数値がすべて同じ |

### 実案件に通した結果（松原精機・第1回取材まで）

| 置き場所 | 「実写が要るのに無い」と判定された帯 |
|---|---|
| 加工事例 | 15本 |
| 工場・設備 | 3本 |
| 代表者 | 3本 |
| 外観 | 2本 |
| 働く人 | 2本 |

**これが第3段階（写真の依頼）の入力になる。**
いまは `npm run gaps` が写真の質問を1件も出していないので、ここが埋まれば
「この会社は何の写真をもらえば、いちばんサイトの品質が上がるか」を出せる。

### 第1段階で意図的にやらなかったこと（D-308）

`source: "graphic"` を返すのは、**いま実際に地紋が描かれている帯だけ**にしてある。
「ここにも地紋が要る」という判断は、**描き方を足してから**（第2段階）。
先に立てると「記録にはあるが、画面には無い」という状態になり、
それは D-295（謳っている動きが1つも動いていなかった）と同じ形の嘘になる。

**証拠の側（`wanted`）は第1段階から本物の判断をしている。**
実写があるかどうかは、いま確かめられるから。

---

## 付記：第2段階の実装（2026-09-15・D-310〜312）

**淡い光（softLight）と幾何の線（geometry）の2つだけ。** 描画が変わるのはここから。

### 変更対象ファイル

| ファイル | 内容 |
|---|---|
| `lib/design/assets.ts` | `decorate()` を追加。すでに描かれている地紋の呼び名も直した（D-308の続き） |
| `site-template/src/styles/site.css` | 装飾2種の描き方／スマホでの位置／印刷では消す／**章の区切りの縞の修正（D-310）** |
| `asset.test.mjs` | 13件追加（計45件） |
| `qa-assets.mjs`・`qa-assets-shot.mjs`（新） | 型だけを変えて並べ、画面を撮る |
| `package.json` | `npm run qa:assets` |

**新しい語彙は1つも足していない。** `light` と `geometry` は第1段階で作った `AssetSubject` に
既にあり、CSSは `data-asset-subject` に反応するだけである。
レイアウト・カード・モーション・外部ライブラリ・library・generated は**いずれも足していない。**

### softLight / geometry の適用条件

```
1. 雰囲気の帯であること（証拠の帯には置かない）
2. 型（方向性）が light / geometry を持っていること
3. **汎用プランであること**（第2段階の範囲・下記）
4. その帯に地紋が無いこと（二重に描かない）
5. 面が plain か soft であること
   ただし geometry だけは白抜きの地（accent / dark）にも置ける（線を白に倒してある）
6. 置く場所は「山 → 主役 → それ以外」の順で探す
7. **1ページに light 1本・geometry 1本まで。2つ目は1つ目から2本以上離す**
```

**7が要点である。** 二度使うと効かなくなる（白抜きの帯を1ページ1回に絞った D-230 と同じ理屈）。
**6は画面を見て直した**——最初は山だけを見ていたため、山の帯に地紋がある型（モダン）で
**1本も置かれなかった。**

**3（汎用に限る）は設計上の原則ではなく、第2段階の範囲**である。
製造業には寸法線・方眼・工程線・断面・素材の目が既にあり、汎用にはほぼ何も無い——
それが docs/31 §1-2 の実測だった。画面を見たうえで広げるかを決める。

### 適用された帯の一覧（写真0枚・同じ会社データ・型だけを変えて）

```
型               トップ    強み     対応範囲   事例一覧   会社概要   問い合わせ
製造 標準          ・/5     ・/4     ・/3     ・/3     ・/3     ・/3
製造 精密加工        ・/5     ・/4     ・/3     ・/3     ・/3     ・/3
製造 老舗・職人       ・/5     ・/4     ・/3     ・/3     ・/3     ・/3
汎用 モダン         G/5     G/2      ×      ・/2     ・/2     G/3
汎用 力強い         GL/5    L/2      ×      ・/2     ・/2     L/3
汎用 落ち着き        ・/5     ・/2      ×      ・/2     ・/2     ・/3

L=淡い光  G=幾何の線  ・=装飾なし（＝完成形）  ×=そのページは作られない  斜線の右は帯の本数
```

- **製造業3型は0本**（範囲外）。画素まで一致で確認
- **落ち着き・信頼も0本。** この型の主題は `texture`＝紙の地で、**すでに満たされている**
- 会社概要は全型で0本。**あの2帯はどちらも証拠**（外観写真・会社概要表）だから
- 汎用3社の実測：6ページ中 **装飾3〜4本**

### 評価（ご指示の9点）

| 見るところ | 結果 |
|---|---|
| 写真なしでも未完成に見えないか | ○ 「落ち着き・信頼」は装飾0本でも成立（紙の地・明朝・余白） |
| 既存の情報が読みやすいか | ○ **むしろ改善**。読めなかった帯が読めるようになった（D-310） |
| 視覚的なリズムが生まれたか | ○ 汎用の山の帯に、面＋装飾の重なりができた |
| 余白が意図的に見えるか | ○ 淡い光が右上から落ちることで、余白が「空き」ではなく「間」に見える |
| 型ごとの差が明確になったか | ○ モダン＝線、力強い＝線＋光、落ち着き＝紙。**3型とも違う顔** |
| 背景装飾がコンテンツより目立っていないか | ○ ただし**スマホで1件失敗していた**（D-312・直した） |
| 同じ装飾の繰り返しになっていないか | ○ 上表のとおり、ページごとに有無と種類が変わる |
| スマホで邪魔にならないか | **✗ → ○**（D-312）。弧が本文を横切っていたので右下の隅へ回した |
| none の帯との切り替えが自然か | ○ 装飾は山か主役の帯にしか付かないので、付く場所に理由がある |

### 採用しなかった装飾案と、その理由

| 案 | 採らなかった理由 |
|---|---|
| 地紋の語彙（`MotifId`）に `softLight` / `geometry` を足す | **新しい語彙を増やさない**（ご指示）。第1段階の `AssetSubject` に既にある語で足りた |
| 全帯にうっすら光を敷く | **装飾の数は品質ではない**（原則⑤）。どのページも同じ顔になる |
| 幾何の線でコンテンツを囲う（枠・カード） | ご指示で禁止。囲うと「装飾」ではなく「構造」になり、情報階層が変わる |
| 装飾をふわっと出す動き | 第2段階の範囲外（ご指示）。`prefers-reduced-motion` の扱いも増える |
| 写真のない帯を素材ライブラリで埋める | 原則②③。第5段階まで `library` は実装しない |
| スマホで幾何の線を消す | 型ごとの差が消える。**位置を変えるほうが、消すより情報が減らない** |
| `color-mix()` で色を作る | このCSSは色を1つも足さない方針。配色が持つ `--accent-soft` で足りた |

### 検査の結果

| 見るもの | 結果 |
|---|---|
| `npm test` | 618 → **631／全通過** |
| `npm run typecheck` / `astro build` | 通過・13ページ書き出し |
| コントラスト（実測・ブラウザ） | 1.08 → **16.45／15.92**（D-310） |
| `npm run qa:companies` | 12ページとも「帯は同じ・中身だけ違う」→ 基準を更新 |
| `npm run qa:visual` / `qa:directions` | 既存の数値がすべて同じ |
| 画面（製造業3社・写真0枚・PC/スマホ） | **30/30 画素まで完全一致**（範囲外だと機械で確認） |
| 画面（汎用3社） | 20枚が変化＝装飾が入ったページ（トップ・強み・問い合わせ・会社概要） |

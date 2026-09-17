# 第9段階 設計案 — Motion Language（会社ごとの意味を持った動き）

**コードは1行も書いていない。** 現在の実装を調べ、設計だけを置く。

---

## 0. 結論から

**新しい動き（`@keyframes`）は増やさなくてよい。** 足りないのは語彙ではなく、**選び方**である。

| | いまの状態 |
| --- | --- |
| 動きの種類 | **3つ実装済み**（現れる／線が伸びる／覆いが外れる）。謳い文句と実装は一致している（D-240） |
| 強さの語彙 | **3段階ある**（`none` / `subtle` / `standard`・`motion.ts`） |
| 誰が決めているか | **型（direction）だけ。** `site-template/src/lib/theme.ts:30` に `getDirection(theme.direction).motion` とあり、**会社データを1バイトも見ていない** |
| 会社ごとの違い | **無い。** 同じ型を選んだ会社は、動きも完全に同じ |

したがって Motion Language の仕事は、**「どの要素に、どの既存の動きを当てるか」を会社データから決める層**を足すことである。動きの種類を増やすことではない。

---

## 1. 現在のmotion実装

### 1-1. すでに存在するもの

**`@keyframes`（3つ・`site.css:1186-1201`）**

| 名前 | 何が起きるか | いま当たっている対象 |
| --- | --- | --- |
| `kobo-rise` | 透明度 .35 → 1、10px 下から上へ | 帯／数字（`.figures dd`）／並んだもの（`.cards .machines .points .chips .process .gallery .offer-list` の子）／山の帯 |
| `kobo-grow` | 縦に `scaleY(0) → 1` | 工程モチーフの線（`.band[data-motif="process"] > .inner > .band-body::before`） |
| `kobo-reveal` | `clip-path` の覆いが外れる＋`scale(1.02) → 1` | 写真（`.gallery / .hero-photo / .photo` の `img`） |

**時間（`site.css:46-48`）** — `--m-fast: .18s`（操作に応える）／`--m-rise: .5s`（現れる）／`--m-peak: .7s`（山・写真）。**数値はこの3つだけ**で、他の箇所はすべてここを参照している。

**引き金** — `animation-timeline: view()`＋`animation-range: entry 0% entry N%`。**JavaScript は1行も使っていない。** 並びの遅れ（stagger）も `nth-child` で `animation-range` を変えているだけで、時間ではなくスクロール位置で決まる。

**`prefers-reduced-motion`** — 動きはすべて `@media (prefers-reduced-motion: no-preference)` の**中だけ**に書いてある。素の HTML は最初から見えている。`@supports (animation-timeline: view())` でも囲ってあり、**非対応ブラウザでは何も起きない**（囲わないと開いた瞬間に全帯が一斉に1回動く）。

**印刷** — `@media print` で `opacity: 1 !important; animation: none !important; transform: none !important`。

**既存の JavaScript** — サイト側は **2箇所だけ**。`InquiryForm.astro`（問い合わせフォーム）と `Base.astro`（メニューの開閉）。**アニメーション用の JS は存在しない。**

### 1-2. 動きを決めている data-* 属性

| 属性 | どこに付くか | 動きに使われているか |
| --- | --- | --- |
| `data-motion` | `<html>` に1つ（`none` / `subtle` / `standard`） | **使われている。動きの唯一の入口** |
| `data-motif` | 帯 | `process` のときだけ線が伸びる |
| `data-peak` | 帯 | 山の帯だけ長く現れる |
| `data-surface` / `data-width` / `data-density` / `data-layout` / `data-role` / `data-content` / `data-presentation` / `data-asset-*` | 帯 | **動きには使われていない**（見た目のみ） |

### 1-3. まだ存在しないもの

- **会社データから動きを決める層**（いまは型だけ）
- **要素ごとの動きの指定**（`data-motion` は `<html>` に1つだけ）
- **IntersectionObserver / JavaScript による制御**
- `trace` / `assemble` / `flow` / `shift` に当たる動き

---

## 2. Motion Languageの目的

**動きは装飾ではなく、会社の特徴を「時間の変化」として出すもの。**

ただし KOBO のサイトは製造業・企業サイトで、読み手は調達担当者と設計者である。**動きそのものを見せない。**「意味が伝わる瞬間」を補助するだけにする。

目指すのは**ページ全体のリズム**である。

```
静（会社概要・設備一覧・条件表）
 ↓
動（山の帯・工程・生成ビジュアル）
 ↓
静（事例・問い合わせ）
```

**「どこを動かさないか」を決めることが、この設計の主目的である。**

---

## 3. Motion Vocabulary

### 3-1. 採る語彙（4つ・**新規の `@keyframes` は 0**）

| 語彙 | 中身 | 実装 | 意味 |
| --- | --- | --- | --- |
| `none` | 動かさない | — | **既定として正しい選択肢** |
| `rise` | 静かに現れる | **既存** `kobo-rise` | そこに情報があることを知らせるだけ |
| `draw` | 線が伸びる | **既存** `kobo-grow` | 順序・工程・つながり |
| `reveal` | 覆いが外れる | **既存** `kobo-reveal` | 「物that現れる」——面・写真・生成ビジュアル |

### 3-2. 見送る語彙と理由

| 候補 | 判断 | 理由 |
| --- | --- | --- |
| `trace`（なぞる） | **見送り** | `draw` と実質同じ。`stroke-dashoffset` を足すことになるが、**SVG の線画を持っていない**ので当たる対象が無い |
| `assemble`（組み上がる） | **見送り。既存と重複** | 「並んだものが少しずつ遅れて現れる」は**すでに実装済み**（`nth-child` で `animation-range` をずらす）。新しい名前を付けると二重管理になる |
| `flow`（流れる） | **見送り** | 常時ループは禁止。スクロールに紐づく一方向の変化にすると `rise` と区別がつかない |
| `shift`（ずれる） | **見送り** | 位置を動かすので、**layout shift の原則と衝突しやすい** |

**語彙を4つに抑える。** 増やすなら、その動きが**当たる対象が実在すること**を先に確かめる。

---

## 4. Motion Axis（動きの軸）

会社の特徴を**時間のどの性質**で表すか。**新しい語彙は作らず、既存の勝ち筋（15分類）から引く。**

| 軸 | 時間の性質 | 主に当たる勝ち筋 |
| --- | --- | --- |
| `settle`（静まる） | 一度だけ、静かに定位置に収まる | `precision` `record` `history` `craft` |
| `sequence`（順に） | 段階的に。一度に完成しない | `difficulty` `engineering` `equipment` |
| `arrive`（届く） | 短く、続けて、間を置かない | `speed` `offering` |
| `emerge`（現れる） | 面や物が、覆いの下から出る | `range` `voice` `person` `reason` |
| `none` | 動かさない | `price` `unknown` |

**軸 → 語彙の固定対応表は作らない**（ご指示）。軸は「どの対象を動かすか」と「どの強さにするか」を決める材料であって、動きの名前を1対1で決めるものではない。

---

## 5. Intensity（強さ）

**既存の `MotionId` をそのまま使う。新しい語彙を作らない。**

| | 動く対象 | 判断の材料 |
| --- | --- | --- |
| `none` | 何も動かさない | 型が `classic`／お客様が動きを嫌う／勝ち筋が `price` `unknown` |
| `subtle` | 帯が現れるだけ | 既定 |
| `standard` | 帯＋並んだもの＋工程の線＋写真＋山 | 型が `standard` を持つ、かつ会社側にも動かす理由がある |

**時間の値（`--m-fast` / `--m-rise` / `--m-peak`）は増やさない。** 3つで足りている。

---

## 6. Trigger（引き金）

**現時点で JavaScript は要らない。**

| 引き金 | 実装 | 使う場面 |
| --- | --- | --- |
| スクロールで入ってきたとき | **既存** `animation-timeline: view()` | すべての「現れる」動き |
| 操作したとき | **既存** `transition`（`--m-fast`） | hover / focus |
| 読み込み直後 | **使わない** | 開いた瞬間に一斉に動くのは、動きを見せていることになる |

**IntersectionObserver は、`animation-timeline` が使えないブラウザへの代替としてのみ検討する。** いまは非対応環境では**何も起きない**のが正しい設計（D-240）なので、**当面は入れない。**

---

## 7. Target Role（何を動かすか）

**すべてに動きを付けない。「動かさない」を既定にする。**

| 対象 | 語彙 | 付けるか | 理由 |
| --- | --- | --- | --- |
| 帯（section） | `rise` | **既存のまま** | 情報があることを知らせる。これ以上は要らない |
| 山（visual peak） | `rise`（長め） | **既存のまま** | そのページで最も見てほしい場所 |
| 並んだもの（カード・札・工程） | `rise`（遅れて） | **既存のまま** | 並びが読み取れる |
| 工程モチーフの線 | `draw` | **既存のまま** | 順序に意味がある |
| 写真 | `reveal` | **既存のまま** | 物that現れる |
| **生成ビジュアル** | `reveal` | **★新しく足す候補** | いま**動きが1つも当たっていない。** 4枚とも静止している |
| 数字（`.figures dd`） | `rise` | **既存のまま** | 数え上げは入れない（D-240・D-181） |
| ナビゲーション | — | **付けない** | 操作の応答（`--m-fast`）で足りている |
| CTA | — | **付けない** | 押す場所は動かさない |
| 本文・見出し | — | **付けない** | 読むものを動かさない |

**足す候補は「生成ビジュアル」の1つだけ。** ほかはすべて既存で足りている。

---

## 8. Directionとの関係（15方向）

`direction.ts` に**すでに `motion` フィールドがある**。現状と、会社データを見るようにした場合の考え方を並べる。

### 製造業（6方向）

| 方向 | いまの `motion` | 似合う軸 | 動かす／動かさない |
| --- | --- | --- | --- |
| `standard` 標準 | `subtle` | `settle` | 帯だけ。**据え置き** |
| `technical` 精密加工 | `standard` | `settle` | 寸法・数字が静かに定位置に収まる。**帯＋数字＋山** |
| `craft` 老舗・職人 | `subtle` | `settle` | ゆっくり。**素材の面が現れる程度**。並びの遅れは入れない |
| `engineering` 設計・技術 | `standard` | `sequence` | **工程の線が伸びる**のが主役。`draw` が最も効く方向 |
| `industrial` 量産・設備 | `subtle` | `sequence` | 繰り返しを見せたいが、**ループは禁止**。並びの遅れで足りる |
| `product` 製品・開発 | `standard` | `emerge` | 面・写真が現れる。**`reveal` が主役** |

### 汎用（9方向・コードに実在するものだけ）

| 方向 | いまの `motion` | 似合う軸 | 動かす／動かさない |
| --- | --- | --- | --- |
| `gstandard` 標準 | `subtle` | `settle` | 帯だけ |
| `seikatsu` 生活サービス | `subtle` | `emerge` | 写真が現れる |
| `shop` 店舗・サービス | `subtle` | `arrive` | 取り扱いの札が順に |
| `editorial` 読み物 | `subtle` | `settle` | **読むものを動かさない**。帯だけ |
| `luxury` 静か・上質 | `subtle` | `settle` | いちばん控えめ。**山も長くしない** |
| `modern` モダン | `standard` | `sequence` | 格子・構造 |
| `human` 人・温度 | `subtle` | `emerge` | 人の写真が現れる |
| `dynamic` 力強い | `standard` | `arrive` | 短く続けて。**それでも飛び込みは禁止** |
| `classic` 落ち着き・信頼 | `none` | `none` | **動かさない。据え置き** |

**この表で新しい方向は1つも足していない。**

---

## 9. Visual Languageとの関係

### 9-1. いまの流れ

```
project.json → analyze() → primaryStrength ─┬→ LANGUAGE_OF → Visual Language
                                             └→（動きには届いていない）
theme.direction → getDirection().motion ────→ data-motion
```

**見立てと動きが、まったくつながっていない。**

### 9-2. 提案する流れ（ご指示の「shared semantic signals」）

```
project.json
   ↓  analyze()
Company Analysis（primaryStrength / strands / hasRealPhotos）
   ↓  companySignals()      ← ★すでに `generated-brief.ts` に実装済み
共有の合図（form / problem / act / time / scale）
   ├→ Visual Language（何を描くか）      ← 既存
   └→ Motion Language（何を動かすか）    ← 新規
```

**`companySignals()` を共有の合図として使う。** 新しい抽出層は作らない。これは既存関数で、会社の本文から形・課題・行為・時間・尺度を拾っている。

### 9-3. 既存Architectureへの影響

| 変更 | 影響範囲 | 判断 |
| --- | --- | --- |
| `companySignals()` を `generated-brief.ts` から**共有の場所へ移す** | 生成ビジュアルの注文書が同じ結果を返すことの確認が要る | **移す価値はあるが、今回は必須ではない。** import するだけでも動く |
| `direction.motion` を**既定値**に格下げし、会社データで上書き可能にする | `theme.ts:30` の1行と、15方向すべての見え方 | **大きい。** 実装時に、15方向×全ページで「動きが変わっていないこと」を測る必要がある |
| 帯ごとの `data-motion-*` 属性を足す | `Band.astro` と呼び出し6箇所 | 中。**本当に必要か、生成ビジュアル1つのために足す価値があるかを先に判断する** |

---

## 10. reduced-motion

**既存の作りをそのまま守る。変更しない。**

1. 動きは `@media (prefers-reduced-motion: no-preference)` の**中だけ**に書く
2. **初期状態を `opacity: 0` にしない。** 素の HTML は最初から見えている
3. **動きによって初めて情報が出る設計は禁止**
4. `focus-visible` は動きの設定に関係なく維持する
5. `@media print` で動きを止め、本文を残す
6. `@supports (animation-timeline: view())` で囲う。非対応環境では**何も起きない**

**検査**：`design.test.mjs` が `prefers-reduced-motion` ブロックを全部走査し、`opacity: 0` の焼き込みを見ている（第8段階⑤で、最初のブロックしか見ていなかったのを直した）。Motion Language を足すときも**同じ検査に通す**。

---

## 11. Deterministic build

1. **乱数・時刻を使わない。** 同じ `project.json` ＋ 同じ Design Brief なら、同じ Motion Language になる
2. **ビルド中に AI / API を呼ばない。** 判断は `npm run generate` / `npm run brief` の時点で済ませ、`project.json` に保存する（生成ビジュアルと同じ）
3. **検査で固定する**：同じ入力で2回計算して完全一致すること（`generated.test.mjs` に同じ形の検査がある）
4. `projectHashOf` に Motion Language を**数えさせない**（D-369 と同じ罠。保存した瞬間に印が変わる）

---

## 12. AIの権限

**AI が選べるのは、有限の語彙からの選択だけ。**

| AI が選んでよい | AI が触れない |
| --- | --- |
| motion vocabulary（`none` / `rise` / `draw` / `reveal`） | **CSS** |
| intensity（`none` / `subtle` / `standard`） | **JavaScript** |
| axis（`settle` / `sequence` / `arrive` / `emerge` / `none`） | **HTML** |
| target role（既存の対象一覧から） | **任意の数値**（duration / delay / easing / distance） |
| — | **新しい `@keyframes`** |

**登録の時点で弾く**（`assertLibrary` / `assertGenerated` と同じ思想）。語彙外の値、語彙外の対象、数値の直接指定は、読み込みで落とす。

---

## 13. 禁止事項

- layout shift（位置が動いて他がずれる）
- 大きな移動・画面外からの飛び込み
- 常時ループ
- パララックス
- 数え上げ（count-up）— **我々が出す値は「±0.005mm」「標準7日」のような文字列で、数として数え上げられない**（D-240・D-181）
- hover zoom
- 大きな影の変化
- 文字が流れる演出
- 過剰なページ遷移
- **動きによって初めて情報が表示される設計**
- GSAP などの大型ライブラリ

---

## 14. 将来の実装方針

### 責務の分け方

| | 担当 |
| --- | --- |
| **Motion Language（TypeScript）** | 会社データから「何を、どの強さで動かすか」を決める。**有限の語彙だけ** |
| **CSS** | 「どう動くか」。`@keyframes` と `animation-*`。**既存3つから増やさない** |
| **JavaScript** | 「いつ動かすか」。**現時点では不要**（`animation-timeline: view()` で足りている） |
| **Astro** | 決まった値を `data-*` 属性として出すだけ |

### 段階

| | 内容 | 規模 |
| --- | --- | --- |
| **①** | **生成ビジュアルに `reveal` を当てる**（いま動きが1つも無い）。既存の `kobo-reveal` を使う | **小** |
| ② | `direction.motion` を既定値にし、`analyze()` の結果で上書きできるようにする | 中 |
| ③ | 帯ごとの `data-motion-*`（本当に要るか、①②のあとで判断） | 中 |
| ④ | `companySignals()` を共有の場所へ移す | 小 |

**①だけ先に入れて、実画面で確かめるのが妥当。** ②以降は、①を見てから決める。

---

## 15. 未決事項

1. **①（生成ビジュアルに `reveal`）を入れるか。** 生成ビジュアルは `::before` の背景なので、`clip-path` の覆いが自然に見えるかは**実画面で確かめないと分からない**（CLAUDE.md の約束）
2. **`direction.motion` を上書き可能にするか。** 15方向の見え方が変わるので、**変える価値があるかの判断が先**
3. **帯ごとの動きが要るか。** `data-motion` が `<html>` に1つで足りているなら、足さないのが正しい
4. **`companySignals()` の置き場所。** いまは生成ビジュアル専用ファイルの中にある
5. **非対応ブラウザへの代替を入れるか。** いまは「何も起きない」。IntersectionObserver を足すかどうか
6. **`industrial`（量産・設備）の「繰り返し」をどう出すか。** ループは禁止なので、並びの遅れ以上のことができるか未定

---

## 参照

- `tool/lib/design/system/motion.ts` — 強さの語彙（3段階）
- `tool/site-template/src/styles/site.css:1083-1165` — 動きの実装すべて
- `tool/site-template/src/styles/site.css:1186-1201` — `@keyframes` 3つ
- `tool/lib/design/direction.ts` — 15方向と `motion` フィールド
- `tool/site-template/src/lib/theme.ts:30` — **いま動きを決めている唯一の行**
- `tool/lib/design/generated-brief.ts` — `companySignals()`（共有の合図の候補）
- `docs/35-装飾とモーションの設計.md` — 第8段階の設計（この文書の前提）

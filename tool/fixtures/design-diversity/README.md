# Visual QA 専用の架空データ

> **ここにあるのは Visual QA 専用の架空データです。実案件には使用しません。**
> 実在する企業とは一切関係がありません。

## 目的

**「同じ Design Direction でも、強みによって情報表現が変わる」**ことを確かめるためだけの材料です（D-209）。

文章の品質は見ません。**見るのは、同じ型を選んでも presentation が変わるかどうか**です。

## 3社

| | 強み | 入っている材料 |
|---|---|---|
| `a-precision` | **精度** | 具体的な公差の値、測定の根拠 |
| `b-difficulty` | **難加工** | 他社で断られた案件、課題→対応→結果 |
| `c-speed` | **短納期** | 標準納期と最短納期、それを実現する工程・設備 |

**3社とも同じ型（精密加工）にしてあります。** 型を揃えて、強みだけを変えるためです。

## 使い方

```
npm run qa:companies
```

`projects/qc-*` に3社を書き出し、**同じ型でも presentation が変わること**を測ります。
中身を目で見るときは `npm run preview:site -- qc-a-precision` のように開きます。

## 期待する結果

```
A（精度）    → largeNumber / spec
B（難加工）  → process / quote
C（短納期）  → comparison / process
```

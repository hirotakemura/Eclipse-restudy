# 仮のサンプル画像（松原精機）

**実写ではありません。** レイアウトの確認用に生成した差し替え前提の画像です。
画像の中にも「仮の画像／差し替え前提」と描いてあります。

案件フォルダに取り込むには、`tool` で：

```
npm run import:photos -- matsubara-seiki fixtures/mock-matsubara/photos
npm run build:site    -- matsubara-seiki
npm run preview:site  -- matsubara-seiki
```

`photos.json` に置き場所（外観・代表者・工場・設備・加工事例…）が書いてあるので、
**振り分け済みの状態で入ります。** KOBOの画面で選び直す必要はありません。

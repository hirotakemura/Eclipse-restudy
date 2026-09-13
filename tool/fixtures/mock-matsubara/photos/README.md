# 仮のサンプル画像（松原精機）

**実写ではありません。** レイアウトの確認用に生成した差し替え前提の画像です。
画像の中にも「仮の画像／差し替え前提」と描いてあります。

案件フォルダに取り込むには、KOBOを起動した状態で：

```
cd tool/fixtures/mock-matsubara/photos
for f in *.svg; do
  curl -s -X POST --data-binary "@$f" \
    "http://localhost:5173/api/projects/matsubara-seiki/photos?name=$f"
done
```

そのあとKOBOの「制作条件」→「お預かりした写真」で置き場所を選びます。
`project.completed.json` には、振り分け済みの状態が入っています。

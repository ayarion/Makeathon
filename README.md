# 折りGO

Figma Makeで調整した折り紙・起床体験のReact + Viteアプリ。2026年10月28日の編集元からコードと画像・タイトル画面を取り込んでいます。

## 起動

```sh
pnpm install
pnpm dev
```

http://127.0.0.1:5173/ を開きます。

1. 初回は、明るく表示された入力欄やボタンに沿って手紙を書きます。
2. チュートリアルで最初に作る折り紙は鶴です。
3. アラーム画面の「実際のアラーム画面を体験する」を押します。
4. PCではスマホ用QRを表示します。スマホではアラーム体験へ進み、「つかまえる」からカメラを使用します。

Safariではカメラを許可して「ここで決定」で開始します。10秒の追いかけっこ後に鶴をタップすると捕獲できます。残り時間バー・印刷マーカー・床認識は不要です。詳細は [docs/safari-marker.md](docs/safari-marker.md) を参照してください。

カメラなしの体験ボタンはありません。カメラを使えない場合は許可・接続を確認して再試行します。タスクと捕獲の記録はブラウザ内に保存します。

チュートリアルの再表示は `/?tutorial=1#write`、スマホの体験入口は `/?experience=1#alarm` です。スマホのカメラにはHTTPSで配信されたページが必要です。

## QRと公開先

QRのリンク先は https://manual-trend-29876845.figma.site/?experience=1#alarm です。GitHubへの反映とFigmaの公開更新は別の操作です。公開サイトに最新版を反映するにはFigma側でも公開更新してください。

## 確認

```sh
pnpm build
pnpm exec tsc --noEmit
node --test tests/marker-proximity.test.mjs
```

Figmaのプレビューではチュートリアル、鶴の作成・保存、PCのQR表示、スマホ幅のホーム表示を確認しています。スマホ実機のカメラ・歩行判定は未検証です。iOSアプリ化の要件は [docs/ios-requirements.md](docs/ios-requirements.md) にあります。

Figma専用の実行環境設定と、古いコードが入った `public/origo.zip` は取り込んでいません。リポジトリの通常のVite設定で起動できます。

# てこみンサイダーゲーム — 引き継ぎメモ

新しいセッションのClaude/Codex はまずこのファイルを読むこと。会話履歴は引き継がれないので、ここに「何を・なぜ」を残す。

## これは何
- オンライン版「インサイダーゲーム」（ボードゲームのデジタル化）。飲み会など対面で、各自スマホから同じ部屋に入って遊ぶ協力＋推理ゲーム。
- お題当ては**口頭**（マスターが「お題的中」ボタンで確定）。アプリは進行・同期・役職配布・採点を担う。
- ターゲットは身内。完全クローズド前提。

## 場所・実行・デプロイ
- プロジェクト正本: GitHub `cococoike/tekomi-insider`。ローカル作業コピーは `G:\マイドライブ\nakimushi-works\games\tekomi-insider`（Google Drive。**node_modules / dist は Drive に置かない**。開発時は別フォルダへ clone して作業し、ソースだけ Drive に戻す運用でもOK）
- Node は Drive 外の作業コピーで動かす（例: `scratchpad/build` へコピー → `npm ci` → `npm run build` / `npm run dev:mock`）。**Drive 上で `npm install` しない**
- 開発: `npm run dev`（http://localhost:5173/ ）/ ビルド: `npm run build`
- 動作確認（Firebase なし）: `npm run dev:mock`（http://localhost:5199/ ）。`src/lib/db.mock.js` のメモリDBに差し替わる。ブラウザのコンソールで `window.__db.loadRoom('main')` / `window.__db.saveRoom('main', data)` を使うと偽プレイヤーや票を注入して1台で全画面を確認できる
- 本番: **Vercel** が GitHub `cococoike/tekomi-insider` の main push で自動デプロイ。URL = https://tekomi-insider.vercel.app
- 反映手順: 変更 → `git add` → `git commit` → `git push origin main`（→Vercelが自動ビルド）

## 技術スタック
- Vite + React（SPA・クライアントのみ）
- Firebase Realtime Database でリアルタイム同期。全DBアクセスは `src/lib/db.js` に集約（`subscribeRoom`/`saveRoom`/`setRoomField`/`loadRoom`/`loadLeaderboard`/`saveLeaderboard`）
- `.env` に `VITE_FIREBASE_*`（gitには上げない。Vercelには環境変数設定済み）
- Firebaseルールは `rooms/` と `leaderboard/` のみ read/write 許可。新しい保存先を足すならルール側も要更新
- `vite.config.js` に `server.fs.strict:false`（フォルダ名の "~" 対策。消さない）

## 構成
- `src/App.jsx` … ホーム／チュートリアル／通算成績／**共通ロビー**（ゲーム切替・設定）／インサイダー本体（役職配布・質問・投票・採点）
- `src/Guide.jsx` … ビジュアル説明書「あそびかた」（タブ5枚：はじめに／インサイダー／ウルフ／ジャマー／オプション）。役職は `OwlDoc` の `pal` で色替えしたてこみん＋絵文字バッジで見せる。ホームとロビーの「📖 あそびかた」から開く（旧テキスト送りの `TUTORIAL` は廃止）
- `src/ui.jsx` … 共通UI（CSS文字列・てこみんSVG `OwlDoc`・`Shell`/`Bubble`/`Header`/`ModeCard`/`ScoreRows`）と小道具（`enc/dec`・`computeFlair`・`topVote`）
- `src/games/WordWolf.jsx` … ワードウルフ（設定パネル `WolfSettings`・本体 `WolfGame`・`startWolfRound`）
- `src/games/WordJammer.jsx` … ワードジャマー（`JammerSettings`・`JammerGame`・`startJammerRound`）
- `src/lib/db.js` … Firebase 抽象（`db.mock.js` はテスト用の差し替え先）
- `src/lib/scoring.js` … 通算成績への反映 `applyLeaderboard` と部屋内スコア加算 `addScores`（全ゲーム共通）
- `src/lib/words.js` … お題リスト（通常6カテゴリ＋アダルト専用 `ADULT_LIST` 約200語）、魔術カード `MAGIC_CARDS`、ワードウルフのペア `WOLF_PAIRS`/`WOLF_PAIRS_ADULT`、ジャマー質問 `JAMMER_QUESTIONS`/`_ADULT`
- `src/lib/sound.js` … WebAudio 合成の効果音（音声ファイル不要）

## ゲーム切替（2026-09 追加）
- 部屋は1つのまま、`room.game` = `insider` / `wordwolf` / `jammer` を部屋主がロビーで切り替える。メンバー・部屋内スコア・通算成績は引き継ぐ
- App の購読処理は `game !== "insider"` のとき画面 `sub` に飛ばし、各モジュールが `room.phase` を見て描く（インサイダーは従来どおり screen 遷移）
- 各モジュールは `startXxxRound(room)` / `resetXxxRound(room)` の純関数を export し、App の開始／次ラウンドから呼ぶ

### マジカル（インサイダーのオプション `magic`）
- 『マジカルインサイダー』（オインクゲームズ 2026-10 発売）風。マスター＝**魔術師**、それ以外＝村人チーム（インサイダー1人＋村人）。村人はお題を知らないが**インサイダーが誰かは知る**。村人チーム全員に**魔術カード**（しゃべり方の縛り、`room.magicCards[playerId]`）を配る
- お題的中後は**魔術師だけが**インサイダーを指名（`votes[masterId]`）。当てたら魔術師 +3、外したら村人チーム全員 +2。時間切れは魔術師 +2／村人チーム −1
- 平和村・フォロワーとは排他（ON にすると相手側が OFF になる）
- ※製品版の細かい採点は公式ルール未確認。現状はこのアプリ独自の配点

### ワードウルフ（`room.wolf`）
- ペアを引いて多数派/少数派をランダム入替。ウルフは 7人以上で2人、それ未満は1人。話し合い 3/4/5分（部屋主が時計＝`timeLeft` を毎秒配信）＋1分延長
- 投票は全員。最後に投票した端末が開票（`tally`）。最多票が単独でウルフなら `wolfguess` フェーズ→ウルフが多数派のお題を入力→**市民のだれかが正解/不正解を判定**（文字列比較はしない）
- 得点: 市民勝ち 市民 +1／ウルフ逃げ切り +2／逆転 +3。アダルトONで `WOLF_PAIRS_ADULT` のみになる

### ワードジャマー（`room.jam`）
- 役は `round` ベースでじゅんぐり: ダスモン = players[(round-1)%n]、ジャマー = その次、残り全員がワカルン。3人以上
- step: `answer`（ダスモンが本当の答え入力）→ `fake`（ジャマーが嘘2つ）→ `pick`（3択をシャッフル `order`、ワカルンが選ぶ）→ result。最後に選んだ端末が採点。部屋主は「今ある回答で締め切る」で強制終了
- 得点: 正解ワカルン +難易度pt(1〜3)／不正解1人につきジャマー +1／ワカルンの半数以上正解でダスモン +1（製品版の配点は未確認・独自）
- 答えは `enc` で難読化して保存（他端末の DevTools から丸見えにならない程度）

## 仕様の要点（＝設計判断）
- **入室**: ルームコード廃止。全員ひとつの部屋 `rooms/main`。名前を入れて「はじめる」。
- **同名＝同一アカウント**: 端末IDは localStorage `tekomi_uid` で永続。同名で入ると既存プレイヤーを引き継ぐ（重複させない）。
- **開閉ゲート**: 普段は閉。**主催者キー `HOST_KEY = "tekomi"`**（App.jsx内）を入れた人＝主催者。主催者だけが オープン/クローズ・部屋リセット・ゲーム設定・強制進行 を操作できる。状態は `rooms/__gate__`。
- **マスターは毎ラウンド交代**（ランダム/じゅんぐり/固定。部屋主が設定）。マスターがお題を引いてスタート。マスターはお題を知り YES/NO で答える役。
- **役職**: マスター / インサイダー / コモン / フォロワー（フォロワーは6人以上で発動・お題は知らないがインサイダーが誰かは知る・運命共同体）。
- **オプション（独立トグル・部屋主が設定）**: マジカル（上記）/ 平和村（10%でインサイダー不在）/ アダルト（お題がきわどく・ワードウルフ／ジャマーにも効く）/ フォロワー。※**カオスは廃止した**（お題当て構造と噛み合わず破綻するため）。
- **制限時間**: 5/7/9分から選択＋1分延長。**残り時間は `startTime`＋`duration` から各端末が自分で計算**（延長は `duration` を伸ばす）。ワードウルフは終了時刻 `wolfEndAt` から計算。以前はマスター／部屋主の端末だけが毎秒配信していたため、その端末がスリープすると全員の時計が止まった
- **投票**: お題的中後、マスター含む全員が投票（誰がインサイダーか）。全員揃うと自動開票。電波不良対策で**主催者は強制開票・強制進行ボタン**で各フェーズを飛ばせる。
- **採点**:
  - お題＆犯人当て（コモン勝利）: コモン・マスター ともに +2
  - インサイダー逃げ切り（お題判明・犯人外し）: インサイダー +3（フォロワー +2）
  - 時間切れ: マスター0 / コモン −1 / インサイダー・フォロワー −2
  - 平和村・村勝利（全員が「インサイダーなし」に投票）: 全員 +1
- **通算成績**: `leaderboard/` に名前単位で永続。順位フレア = 累計1位👑 / ビリ💩（同点は全員）。マスター記号は🎤。リセットボタンあり。

## 見た目
- 配色: 黒×金（墨#0E0F13系 / 金#D4AF37 / 朱#E53935 / 白#F2F2F2）。N64マリオパーティ調の極太3Dボタン＋ドットフォント DotGothic16。
- ナレーター「**てこみん**」= `OwlDoc`（App.jsx）の**SVGドット絵**（画像ファイルではない・透過・表情5種・ファミコン風ホップ＋まばたき）。語尾「〜てこ」。
- タイトルロゴ `Logo` = ドット文字組み（てこみの / INSIDER / ─ GAME ─）。画像不要。
- `public/tekomin/` のPNGや `public/logo.png` は**今は未使用**（SVGで描画）。`public/icons.svg` はViteテンプレの残骸（未使用）。favicon はV’デフォルトのまま。

## 未了・アイデア
- 別ゲーム「**ito（イト）**」を同じ基盤で作る構想あり。決定済み: 定番モード（数字を小さい順に出す・ライフ制）から / 配色は紺×シルバー / ナレーターはてこみん色替え / タイトル「てこみのito」/ 置き場は `iCloudDrive\ito`（Obsidian外）。※前回スキャフォルドを作りかけたが**削除済み**。ゼロから。Firebaseは同一プロジェクトを `rooms/ito_*` 等で名前空間分離すればルール変更不要。
- 本番の `HOST_KEY` は "tekomi" で推測されやすい。気になるなら変更（App.jsx）。
- favicon・ロゴ画像の差し替えは任意。

## 同時操作のルール（守らないと票が消える）
- 投票・質問・回答・ジャマーの選択は **`setRoomField` で自分の枝だけ書く**（`votes/<id>` / `qa/<i>` / `jam/picks/<id>`）。`saveRoom` で部屋まるごと書くと、自分の古いスナップショットで他人の操作を上書きして消してしまう
- **採点は1台だけが行う**（`scorerOf()` = 部屋主、居なければ先頭のプレイヤー）。採点役が寝ている場合は `TAKEOVER_MS`(4秒) 後に他の端末が肩代わりする。全端末で採点すると `applyLeaderboard` の「読んで足して書き戻す」が重なって通算成績が二重加算になる
- 開票・採点は「最後に押した人の端末」ではなく、票が揃ったことを検知して走らせる（押した人の電波が切れても止まらない）

## 落とし穴（本番でだけ出る）
- **Firebase は値が `null` のキーを保存しない**。`{ ans: null }` で書いた質問は読み戻すと `ans` が `undefined` になるので、`=== null` の厳密比較は本番で外れる（mock DB では `null` が保たれるため再現しない）。同様に `{}` や `[]` も保存されず undefined で返る。既存コードは `|| {}` / `|| []` で受けている
- 端末間の同期が絡む修正は、mock だけでなく**本番URLを複数タブ（別 `tekomi_uid`）で開いて**確認する。投票・採点まで進めると `leaderboard/` に混ざるので、確認は採点前で止める

## 注意
- iCloud × `node_modules` は相性が悪い（同期で重い/削除をブロックされる）。移動や削除で詰まったら iCloud の同期一時停止を検討。
- 大きな変更前にビルド（`npm run build`）を通すこと。

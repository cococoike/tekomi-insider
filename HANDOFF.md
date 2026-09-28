# てこみンサイダーゲーム — 引き継ぎメモ

新しいセッションのClaude/Codex はまずこのファイルを読むこと。会話履歴は引き継がれないので、ここに「何を・なぜ」を残す。
見た目の決まりは [DESIGN.md](DESIGN.md)、事業主向けの入口は [README.md](README.md)。

## これは何
- オンライン版「インサイダーゲーム」＋「ワードウルフ」＋「ワードジャマー」。飲み会など対面で、各自スマホから同じ部屋に入って遊ぶ。
- お題当て・話し合いは**口頭**。アプリは進行・同期・役職配布・時間・採点を担う。
- ターゲットは身内。完全クローズド前提。

## 場所・実行・デプロイ
- 正本: GitHub `cococoike/tekomi-insider`。ローカル作業コピーは `G:\マイドライブ\nakimushi-works\games\tekomi-insider`（Google Drive）
- **node_modules / dist / shots は Drive に置かない**。Node は Drive 外の作業コピーで動かす（例: scratchpad に clone → `npm ci`）。Drive 上で `npm install` しない
  - 事業主が手元で試すときは `手元で遊んでみる.bat`（`%LOCALAPPDATA%\tekomi-insider-work` にコピーして `npm run dev:mock`）
- 本番: **Vercel** が GitHub main への push で自動デプロイ。URL = https://tekomi-insider.vercel.app
- 反映手順: 変更 → テスト（下）→ `git commit` → `git push origin main`。**push は本番公開なので、事業主の OK をもらってから**

### 確認コマンド（変えたら全部通す）
| コマンド | 中身 |
|---|---|
| `npm test` | Node 標準のテスト（`tests/*.test.js`）。ルール・採点・入室・画面の決め方・Firebase のくせ・同時操作・お題リスト・アイコンの形 |
| `npm run e2e` | Chrome を見えないまま起動し、**タブ4枚＝4人**で3ゲームを1周（同時入室・リロード復帰・二重採点なし・外す・締め切り中の復帰など20項目） |
| `npm run shots` | 全52画面を 390×844 の2倍で撮って `shots/index.html` に並べる。**撮ったら1枚ずつ目で見る** |
| `npm run build` / `npm run lint` | ビルドと lint（エラー0を保つ） |
- 追加インストールは不要（Node 22+ の組み込み WebSocket と、PC の Chrome / Edge を使う。`scripts/lib/cdp.mjs`）
- `npm run dev:mock`（http://localhost:5199/ ）: Firebase の代わりに偽の DB（`src/lib/db.mock.js`）。**同じブラウザのタブ同士で部屋を共有**、名前はタブごと（sessionStorage）。`?gallery` で全画面の見本、`?shot=<場面ID>` で1画面（場面は `src/dev/scenes.js`）
  - 中身は SharedWorker（`mockWorker.js`＋`mockServer.js`）が「サーバー役」として持ち、IndexedDB に保存する（全タブを閉じても残る）。書き込みは1つずつ、トランザクションは版番号つき＝本物と同じ動き
  - localStorage 共有ではタブ間の読み書きがずれて二重採点が起きた（偽の DB だけの不具合）ので、この形にした。モジュール型の SharedWorker は起動できないブラウザがあるため、`vite.config.js` が3ファイルを素のスクリプトにつないで `/__mock-worker.js` で配る（dev:mock のときだけ）
- 偽の DB は本番の Firebase と同じ「保存のくせ」を再現する（`src/lib/fbnorm.js`）：null・空の値は消える／undefined や `. # $ / [ ]` を含むキーはエラー／添字キーは配列に戻る。**手元で動けば本番でも動く**ようにするため

## 技術スタック
- Vite + React（SPA・クライアントのみ）。Firebase Realtime Database でリアルタイム同期
- 全DBアクセスは `src/lib/db.js`：`subscribeRoom` / `saveRoom` / `setRoomField` / `updateRoom` / `loadRoom` / `transactRoom` / `loadLeaderboard` / `saveLeaderboard` / `transactLeaderboard`
- `.env` に `VITE_FIREBASE_*`（gitには上げない。Vercelには環境変数設定済み）
- Firebaseルールは `rooms/` と `leaderboard/` のみ read/write 許可。新しい保存先を足すならルール側も要更新
- `vite.config.js` の `server.fs.strict:false` と `MOCK_DB` の差し替え設定は消さない

## 構成
- `src/App.jsx` … ホーム／通算成績／**共通ロビー**／インサイダー本体（役職配り・質問・投票・結果）
- `src/games/WordWolf.jsx`・`WordJammer.jsx` … 各ゲームのロビー設定と本体
- `src/Guide.jsx` … あそびかた（タブ5枚）
- `src/ui.jsx` … 共通部品と CSS（`Shell` `Header` `Panel` `PlayerRows` `Tile` `OptRow` `Seg` `Secret` `TimerBar` `HostMenu` `Fold` `OwlDoc` `RoleChar` …）
- `src/icons.jsx` ＋ `src/lib/iconArt.js` … ドット絵アイコン（12×12、絵文字の代わり）
- `src/lib/rules.js` … **ルールの正本**（純粋な関数）：採点 `scoreInsider/scoreWolf/scoreJammer`、入室 `applyJoin`、退室 `applyLeave`、開始 `startInsider`、ロビーへ `toLobby`、画面 `screenFor`、役職 `roleOf` など
- `src/lib/rounds.js` … ウルフ・ジャマーのラウンド開始 / `src/lib/scoring.js` … 採点の保存 `finalizeRound`
- `src/lib/util.js` … 小道具（`enc/dec`・`sanitizeName`・`topVote`・`addToBoard` …）/ `src/lib/roles.js` … 役職とゲームの見た目
- `src/lib/words.js` … お題（通常6カテゴリ＋アダルト専用）・魔術カード・ウルフのペア・ジャマーの質問
- `src/lib/device.js` … 端末の記憶（uid・名前・主催者キー・音）/ `src/lib/hooks.js` … 画面スリープ防止・時計・音の切替
- `src/dev/` … 撮影モード（本番のビルドには入らない）

## 同時操作のルール（守らないと人や票が消える）
- **部屋まるごと `saveRoom` で書かない**（古いスナップショットで他人の変更を消す）。使ってよいのは部屋のリセットだけ
- 自分の枝だけ書く：`setRoomField`（`votes/<id>` / `qa/<i>/ans` / `jam/picks/<id>`）、設定の変更は `updateRoom`（変える項目だけ）
- 読んで決める操作は `transactRoom`（入室・退室・ゲーム開始・次のラウンド・延長・質問の追加・お題的中）。**fn は何度か呼ばれることがあるので中で副作用を起こさない**
- **採点は `finalizeRound` だけ**（トランザクションで「未採点なら結果へ」を1回だけ通す。通算成績も `transactLeaderboard`）。採点役（部屋主）がすぐ、他の端末は `TAKEOVER_MS`(4秒) 後に肩代わりを試みるが、二重には入らない
- 開票・採点は「最後に押した人の端末」ではなく、票が揃ったことを検知して走らせる

## 画面の決め方
- 画面は**部屋の進行（phase）から1つに決める**（`screenFor`）。以前は「今の画面→次の画面」の組み合わせだったため、投票中にリロードするとロビーに取り残された
- あそびかた・通算成績を見ている間も部屋は裏で更新し、閉じたら追いつく
- この端末が部屋にいるなら、ホームに「つづきから」。ゲーム中なら開いた瞬間に自動で戻る。**締め切り中でも部屋にいる人は戻れる**（締め切りは新しい人だけを止める）

## 仕様の要点（＝設計判断）
- **入室**: ルームコード廃止。全員ひとつの部屋 `rooms/main`。名前はスマホが覚える
- **同名＝同一アカウント**: 端末IDは `tekomi_uid`。同名で入ると既存プレイヤーを引き継ぐ。同じ端末が別の名前で入り直したら名前を付け替える（同じ人が2人に増えない）
- **名前の記号**: `. # $ / [ ]` は全角に置き換える（得点表のキーに使うので、そのままだと採点の保存が失敗する）
- **開閉ゲート**: 普段は閉。主催者キー `HOST_KEY = "tekomi"`（App.jsx内）を入れた人＝主催者。状態は `rooms/__gate__`
- **部屋主**: 帰った人をロビーで外せる（「帰った人を外す」→ ×）。自分でロビーから「ホーム」を押すと部屋から抜ける（同じ名前で入り直せば点数はそのまま）
- **主催者メニュー（たたんである）**: 強制開票・強制で投票へ・時間切れ・**ラウンド中止（点数なし）**・部屋リセット。通算成績のリセットも主催者だけ
- **マスターは毎ラウンド交代**（ランダム/じゅんぐり/固定）
- **役職**: マスター / インサイダー / コモン / フォロワー（6人以上）。マジカル時は 魔術師 / インサイダー / 村人
- **オプション**: マジカル / 平和村（10%でインサイダー不在）/ アダルト / フォロワー。マジカルは平和村・フォロワーと排他
- **秘密の表示**: ゲーム中、役とお題は押しているあいだだけ見える（`Secret`）。マスターが引いたお題も同じ
- **制限時間**: 5/7/9分＋1分延長。残り時間は `startTime`＋`duration` から各端末が計算（ウルフは終了時刻 `wolfEndAt`）。カウント音とブザーは時計役（マスター／ウルフは部屋主）だけ
- **投票**: 名前をえらんで「決定」の2段階（押し間違い防止）。全員揃うと自動開票。同票はインサイダー（ウルフ）の逃げ切り
- **採点**（`rules.js` とテストが正本。結果画面には「このラウンドの点」`lastDelta` も出る）
  - インサイダー: コモン勝利 コモン・マスター +2 ／ 逃げ切り インサイダー +3・フォロワー +2 ／ 時間切れ マスター0・コモン −1・インサイダーとフォロワー −2
  - 平和村: **いちばん多い票が「いない」なら**全員 +1（全員一致でなくてよい。昔からこの判定で、あそびかたの文を実装に合わせた）。外した・時間切れは全員0
  - マジカル: 魔術師が見破る +3 ／ 外す 村人チーム全員 +2 ／ 時間切れ 魔術師 +2・村人 −1（製品版の配点は未確認・独自）
  - ウルフ: 市民勝ち +1 ／ 逃げ切り +2 ／ 逆転 +3。判定は市民がボタンで（文字列比較はしない）
  - ジャマー: 正解ワカルン +難易度(1〜3) ／ だまされた1人につきジャマー +1 ／ 半数以上正解でダスモン +1（独自）
- **通算成績**: `leaderboard/` に名前単位。1位に王冠・ビリにうんち（ドット絵）

## 落とし穴（本番でだけ出る → 偽の DB で再現済み）
- Firebase は値が `null` のキーを保存しない。`{ ans: null }` は読み戻すと `ans` が無い → `isUnanswered()` で判定。`{}` や `[]` も消えるので `|| {}` / `|| []` で受ける
- `undefined` を書くとエラー。部屋の値を消したいときは `null` を書く
- 端末間の同期が絡む修正は `npm run e2e` で確かめる（本番URLで試すと通算成績が汚れる）

## 未了・アイデア
- 別ゲーム「**ito（イト）**」構想あり（定番モード・紺×シルバー・てこみん色替え・タイトル「てこみのito」）。同じ基盤（ロビーのゲーム切替に足す）で作れる
- 本番の `HOST_KEY` は "tekomi" で推測されやすい。気になるなら変更（App.jsx）
- `public/tekomin/` の PNG は未使用（てこみんは SVG）。`public/icons.svg` は Vite テンプレの残骸

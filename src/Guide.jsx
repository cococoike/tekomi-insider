// ビジュアル説明書「あそびかた」。初見の人がここだけ見れば遊べるように、
// 役職は“色ちがいのてこみん”＋バッジ、流れは番号ステップ、得点はチップで見せる。
import { useState } from "react";
import { OwlDoc, Bubble, Header, Shell } from "./ui";

// 役職ごとのてこみん（W=体と帽子の色 / G=星と服の縁）
const CHARS = {
  master:   { pal: { W: "#F4F1EA", G: "#D4AF37" }, expr: "happy",      badge: "🎤" },
  insider:  { pal: { W: "#E88a86", G: "#8c1512" }, expr: "suspicious", badge: "🕵️" },
  common:   { pal: { W: "#cfd6e4", G: "#5b6b8a" }, expr: "thinking",   badge: "❓" },
  follower: { pal: { W: "#c7a2e8", G: "#5c2a8a" }, expr: "normal",     badge: "🥷" },
  wizard:   { pal: { W: "#9fc0ff", G: "#20408a" }, expr: "happy",      badge: "🧙" },
  villager: { pal: { W: "#F4F1EA", G: "#5b8def" }, expr: "normal",     badge: "🏠" },
  wolf:     { pal: { W: "#9aa6bd", G: "#2b3648" }, expr: "suspicious", badge: "🐺" },
  citizen:  { pal: { W: "#F4F1EA", G: "#7aa2f7" }, expr: "normal",     badge: "👥" },
  dasmon:   { pal: { W: "#a8dcc0", G: "#1f6b46" }, expr: "happy",      badge: "✍️" },
  jammer:   { pal: { W: "#f0c98a", G: "#8a5a10" }, expr: "suspicious", badge: "🃏" },
  wakarun:  { pal: { W: "#F4F1EA", G: "#3cb371" }, expr: "thinking",   badge: "🔍" },
};

const Char = ({ who, size = 48 }) => {
  const c = CHARS[who];
  return (
    <div className="gd-avatar">
      <OwlDoc size={size} bob expr={c.expr} pal={c.pal} />
      <span className="gd-badge">{c.badge}</span>
    </div>
  );
};

const CharCard = ({ who, name, color = "#111", desc }) => (
  <div className="gd-card">
    <Char who={who} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="gd-name" style={{ color }}>{name}</div>
      <div className="gd-desc">{desc}</div>
    </div>
  </div>
);

const Steps = ({ items }) => (
  <div>
    {items.map((it, i) => (
      <div className="gd-step" key={i}>
        <div className="gd-num">{i + 1}</div>
        <div>
          <div className="gd-step-t">{it.t}</div>
          {it.d && <div className="gd-step-d">{it.d}</div>}
        </div>
      </div>
    ))}
  </div>
);

const Pts = ({ rows }) => (
  <div>
    {rows.map((r, i) => (
      <div className="gd-pt" key={i}>
        <span style={{ fontSize: 17, filter: "drop-shadow(1px 1px 0 #000)" }}>{r.e}</span>
        <div className="gd-pt-t">{r.t}</div>
        <span className={`gd-chip ${r.k === "-" ? "gd-minus" : r.k === "0" ? "gd-zero" : "gd-plus"}`}>{r.p}</span>
      </div>
    ))}
  </div>
);

const Panel = ({ head, children }) => (
  <div className="mp-panel">
    <div className="mp-panel-head">{head}</div>
    <div className="gd-grid">{children}</div>
  </div>
);

const TABS = [
  { k: "start",   label: "はじめに" },
  { k: "insider", label: "🕵️ インサイダー" },
  { k: "wolf",    label: "🐺 ウルフ" },
  { k: "jammer",  label: "📝 ジャマー" },
  { k: "opts",    label: "🪄 オプション" },
];

export default function Guide({ onClose, onTab }) {
  const [tab, setTab] = useState("start");
  const go = (k) => { setTab(k); onTab?.(k); };

  return (
    <Shell>
      <Header sub="あそびかた" onBack={onClose} />
      <div className="mp-h">★ てこみんの あそびかた ★</div>

      <div className="gd-tabs">
        {TABS.map((t) => (
          <button key={t.k} className={`gd-tab${tab === t.k ? " on" : ""}`} onClick={() => go(t.k)}>{t.label}</button>
        ))}
      </div>

      {/* ══ はじめに ══ */}
      {tab === "start" && (
        <>
          <Bubble expr="happy">
            はじめまして、案内役の <b>てこみん</b> だてこ！<br />
            このアプリは <b>みんなでスマホを持って、同じテーブルで遊ぶ</b> ゲームだてこ。声に出して話すのが本番、スマホは役と時間と点数の係だてこ。
          </Bubble>

          <Panel head="★ さいしょの4ステップ ★">
            <Steps items={[
              { t: "同じページを開く", d: "全員が tekomi-insider.vercel.app を開く。合言葉や部屋番号はいらない。" },
              { t: "なまえを入れて「はじめる」", d: "同じ名前で入り直せば、同じ人として点数も引き継がれる。" },
              { t: "主催者が部屋をオープンにする", d: "ふだんは閉じている。主催者だけが オープン／リセット／設定／強制進行 をできる。" },
              { t: "ロビーでゲームを選んでスタート", d: "3つのゲームを行き来しても、メンバーと得点はそのまま。3人から遊べる。" },
            ]} />
          </Panel>

          <Panel head="★ あそべる3つのゲーム ★">
            <div className="gd-card" onClick={() => go("insider")}>
              <Char who={"insider"} size={44} />
              <div style={{ flex: 1 }}>
                <div className="gd-name" style={{ color: "#b8901f" }}>🕵️ インサイダー</div>
                <div className="gd-desc">みんなで質問してお題を当てる。でも1人だけ答えを知っている。誰だ？ ▶</div>
              </div>
            </div>
            <div className="gd-card" onClick={() => go("wolf")}>
              <Char who={"wolf"} size={44} />
              <div style={{ flex: 1 }}>
                <div className="gd-name" style={{ color: "#3a62b8" }}>🐺 ワードウルフ</div>
                <div className="gd-desc">1人だけ違うお題を持っている。会話のズレから見つけ出す ▶</div>
              </div>
            </div>
            <div className="gd-card" onClick={() => go("jammer")}>
              <Char who={"jammer"} size={44} />
              <div style={{ flex: 1 }}>
                <div className="gd-name" style={{ color: "#1f6b46" }}>📝 ワードジャマー</div>
                <div className="gd-desc">本当の答え1つに、嘘2つ。どれが本物か当てる ▶</div>
              </div>
            </div>
          </Panel>
        </>
      )}

      {/* ══ インサイダー ══ */}
      {tab === "insider" && (
        <>
          <Bubble expr="suspicious">
            合言葉は「<b>まず協力、そのあと疑う</b>」だてこ。<br />
            時間内にお題が当たらないと <b>ほぼ全員がマイナス</b>。インサイダーも、バレないように“当てさせる”のが仕事だてこ。
          </Bubble>

          <Panel head="★ やくわり ★">
            <CharCard who="master" name="🎤 マスター（司会）" color="#b8901f"
              desc="お題を知っている進行役。質問に YES / NO / わからない で答える。お題が出たら「お題的中」ボタンを押す。毎ラウンド交代。" />
            <CharCard who="insider" name="🕵️ インサイダー（潜入者）" color="#E53935"
              desc="こっそりお題を知っている。バレない程度にヒントを出して、みんなに当てさせたい。" />
            <CharCard who="common" name="👥 コモン（みんな）" color="#3a62b8"
              desc="お題を知らない。質問してお題を当てて、そのあと『誰が知っていたか』を見抜く。" />
            <CharCard who="follower" name="🥷 フォロワー（6人以上・オプション）" color="#7a2fa0"
              desc="お題は知らないが、インサイダーが誰かだけ知っている味方。運命共同体で、勝ち負けを一緒に背負う。" />
          </Panel>

          <Panel head="★ 1ラウンドの流れ ★">
            <Steps items={[
              { t: "マスターがお題を引く", d: "カテゴリは 食べもの／場所／モノ／生きもの／エンタメ／むずかしめ。" },
              { t: "役が配られる", d: "自分の画面だけに表示。まわりに見せないこと。" },
              { t: "質問タイム（5・7・9分）", d: "「それは食べ物？」のように YES / NO で答えられる質問をする。答えるのはマスターだけ。足りなければ +1分 延長できる。" },
              { t: "お題が当たったら「お題的中」", d: "当てた瞬間にマスターがボタンを押す。ここで時間はストップ。" },
              { t: "全員でインサイダーを一斉投票", d: "マスターも投票する。全員そろうと自動で開票。" },
              { t: "結果ととくてん → 次のラウンドへ", d: "マスターが交代してロビーに戻る。" },
            ]} />
          </Panel>

          <Panel head="★ とくてん ★">
            <Pts rows={[
              { e: "👥", t: "コモン勝利（お題も犯人も当てた）", p: "コモン・マスター +2" },
              { e: "🕵️", t: "インサイダー逃げ切り（お題は判明・犯人は外した）", p: "インサイダー +3" },
              { e: "🥷", t: "そのときのフォロワー", p: "+2" },
              { e: "⏰", t: "時間切れ：マスター", p: "0", k: "0" },
              { e: "⏰", t: "時間切れ：コモン", p: "−1", k: "-" },
              { e: "⏰", t: "時間切れ：インサイダー・フォロワー", p: "−2", k: "-" },
            ]} />
          </Panel>

          <Bubble expr="thinking">
            コツてこ：質問は「はい／いいえ」で答えられる形にするてこ。<br />
            そして<b>やけに鋭い人</b>と<b>やけに黙っている人</b>、どっちも怪しいてこ🍺
          </Bubble>
        </>
      )}

      {/* ══ ワードウルフ ══ */}
      {tab === "wolf" && (
        <>
          <Bubble expr="surprised">
            みんな似たお題を持っているてこ。でも<b>1人だけ違う言葉</b>…！<br />
            自分が多数派か少数派かは、<b>誰にも分からない</b>まま話し始めるてこ。
          </Bubble>

          <Panel head="★ やくわり ★">
            <CharCard who="citizen" name="👥 市民（多数派）" color="#3a62b8"
              desc="同じお題を持つ仲間。会話のズレから、違うお題の人＝ウルフを探す。" />
            <CharCard who="wolf" name="🐺 ウルフ（少数派）" color="#E53935"
              desc="1人だけ違うお題。話を合わせて逃げ切る。7人以上のときはウルフが2人になる。" />
          </Panel>

          <Panel head="★ ながれ ★">
            <Steps items={[
              { t: "お題が配られる", d: "例：みんな「寿司」／ウルフだけ「刺身」。どちらが多数派かは毎回入れ替わる。" },
              { t: "話し合い（3・4・5分）", d: "「いつ食べる？」など、断定を避けつつ探り合う。+1分 延長あり。" },
              { t: "一斉投票", d: "いちばん票を集めた人が吊られる。同数なら市民は負け扱い。" },
              { t: "吊られたウルフには敗者復活", d: "多数派のお題を言い当てれば大逆転。合っているかは市民の誰かが判定する。" },
            ]} />
          </Panel>

          <Panel head="★ とくてん ★">
            <Pts rows={[
              { e: "👥", t: "市民勝ち（ウルフを吊った）", p: "市民 +1" },
              { e: "🐺", t: "ウルフ逃げ切り", p: "ウルフ +2" },
              { e: "🔥", t: "吊られたウルフがお題を言い当てた", p: "ウルフ +3" },
            ]} />
          </Panel>
        </>
      )}

      {/* ══ ワードジャマー ══ */}
      {tab === "jammer" && (
        <>
          <Bubble expr="happy">
            <b>本当の答え1つ</b>に<b>嘘2つ</b>を混ぜるてこ。<br />
            役はラウンドごとに自動でじゅんぐりに回るから、覚えなくて大丈夫だてこ。
          </Bubble>

          <Panel head="★ やくわり ★">
            <CharCard who="dasmon" name="✍️ ダスモン（答える人）" color="#1f6b46"
              desc="お題の質問に、本当の答えを入力する。当ててもらえると得点になる。" />
            <CharCard who="jammer" name="🃏 ジャマー（邪魔する人）" color="#8a5a10"
              desc="本物っぽい嘘を2つ作って混ぜる。だまされた人数だけ点が入る。" />
            <CharCard who="wakarun" name="🔍 ワカルン（当てる人）" color="#3cb371"
              desc="残り全員。シャッフルされた3択から、本物を選ぶ。" />
          </Panel>

          <Panel head="★ ながれ ★">
            <Steps items={[
              { t: "ダスモンが本当の答えを入力", d: "質問には ★1〜3 の難易度がついている。" },
              { t: "ジャマーが嘘を2つ入力", d: "ありそうな嘘ほど強い。" },
              { t: "3択がシャッフルされて出る", d: "ワカルンが1つ選ぶ。全員選ぶと自動で開票。" },
              { t: "結果発表", d: "主催者は「今ある回答で締め切る」で先に進められる。" },
            ]} />
          </Panel>

          <Panel head="★ とくてん ★">
            <Pts rows={[
              { e: "🔍", t: "正解したワカルン", p: "+難易度pt（★1〜3）" },
              { e: "🃏", t: "だまされたワカルン1人につき ジャマー", p: "+1" },
              { e: "✍️", t: "ワカルンの半数以上が正解したら ダスモン", p: "+1" },
            ]} />
          </Panel>
        </>
      )}

      {/* ══ オプション ══ */}
      {tab === "opts" && (
        <>
          <Bubble expr="normal">
            インサイダーは、主催者がロビーで<b>味付け</b>を変えられるてこ。<br />初めての回は、全部OFFの「ふつう」がおすすめだてこ。
          </Bubble>

          <Panel head="★ マジカル🪄（ルールが変わる） ★">
            <CharCard who="wizard" name="🧙 魔術師（マスターの代わり）" color="#3a62b8"
              desc="お題を知っていて質問に答える。お題が当たったら、この人が1人だけでインサイダーを指名する。" />
            <CharCard who="villager" name="🏠 村人チーム（ほかの全員）" color="#5b8def"
              desc="お題は知らないが、インサイダーが誰かは知っている。チーム全員に“魔術カード”（ヒソヒソ声・語尾に〜にゃ・武士口調など全20種のしゃべり方の縛り）が配られる。" />
            <Pts rows={[
              { e: "🏠", t: "村人チーム勝利（お題を当て、指名を外させた）", p: "チーム全員 +2" },
              { e: "🧙", t: "魔術師がインサイダーを見破った", p: "魔術師 +3" },
              { e: "⏰", t: "時間切れ", p: "魔術師 +2 / 村人 −1", k: "-" },
            ]} />
            <div className="gd-desc">※ マジカル中は 平和村・フォロワー は使えない（自動でOFFになる）。</div>
          </Panel>

          <Panel head="★ そのほかのオプション ★">
            <div className="gd-card">
              <span style={{ fontSize: 26, filter: "drop-shadow(1px 1px 0 #000)" }}>😇</span>
              <div style={{ flex: 1 }}>
                <div className="gd-name">平和村</div>
                <div className="gd-desc">10%の確率でインサイダーが<b>いない</b>回になる。全員が「インサイダーなし」に投票できたら全員 +1。見抜けなかったときや時間切れは<b>全員0点</b>（マイナスにはならない）。疑心暗鬼が跳ね上がる。</div>
              </div>
            </div>
            <div className="gd-card">
              <span style={{ fontSize: 26, filter: "drop-shadow(1px 1px 0 #000)" }}>🥷</span>
              <div style={{ flex: 1 }}>
                <div className="gd-name">フォロワー</div>
                <div className="gd-desc">6人以上のときだけ発動。インサイダーの隠れた味方が1人つく。</div>
              </div>
            </div>
            <div className="gd-card">
              <span style={{ fontSize: 26, filter: "drop-shadow(1px 1px 0 #000)" }}>🔞</span>
              <div style={{ flex: 1 }}>
                <div className="gd-name">アダルト</div>
                <div className="gd-desc">インサイダーとワードウルフのお題が、下ネタ寄りの専用リストだけに入れ替わる。ワードジャマーは通常の質問に成人向けの質問が<b>加わる</b>（混ざる）。<b>初対面の人がいる席ではOFF</b>にしておくこと。</div>
              </div>
            </div>
          </Panel>

          <Panel head="★ 主催者ができること ★">
            <Steps items={[
              { t: "部屋のオープン／クローズ", d: "閉めている間は誰も入れない。" },
              { t: "ゲーム・オプション・制限時間の設定", d: "マスターの決め方（ランダム／じゅんぐり／固定）もここ。" },
              { t: "強制開票・強制進行", d: "電波が悪くて票がそろわないときに先へ進める。" },
              { t: "部屋のリセット・通算成績のリセット", d: "通算成績は名前ごとに残り、1位👑・ビリ💩が付く。" },
            ]} />
          </Panel>
        </>
      )}

      <button className="mp-btn mp-green" onClick={onClose}>とじる ✓</button>
    </Shell>
  );
}

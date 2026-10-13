// ビジュアル説明書「あそびかた」。初見の人がここだけ見れば遊べるように、
// 役職は“色ちがいのてこみん”＋アイコン、流れは番号ステップ、得点はチップで見せる。
import { useState } from "react";
import { RoleChar, Bubble, Header, Shell, Panel } from "./ui";
import { Icon } from "./icons";
import { ROLES } from "./lib/roles";

const CharCard = ({ who, name, desc }) => (
  <div className="gd-card">
    <RoleChar role={who} size={48} />
    <div style={{ flex: 1, minWidth: 0, paddingLeft: 4 }}>
      <div className="gd-name" style={{ color: ROLES[who].color }}>{name}</div>
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
        <Icon name={r.e} size={24} />
        <div className="gd-pt-t">{r.t}</div>
        <span className={`chip chip-wrap ${r.k === "-" ? "chip-minus" : r.k === "0" ? "chip-zero" : "chip-plus"}`}>{r.p}</span>
      </div>
    ))}
  </div>
);

const Sec = ({ head, icon, children }) => (
  <Panel head={head} icon={icon}><div className="gd-grid">{children}</div></Panel>
);

const OptCard = ({ icon, name, children }) => (
  <div className="gd-card">
    <Icon name={icon} size={36} />
    <div style={{ flex: 1 }}>
      <div className="gd-name">{name}</div>
      <div className="gd-desc">{children}</div>
    </div>
  </div>
);

const TABS = [
  { k: "start",   label: "はじめに",     icon: "book" },
  { k: "insider", label: "インサイダー", icon: "eye" },
  { k: "wolf",    label: "ウルフ",       icon: "wolf" },
  { k: "jammer",  label: "ジャマー",     icon: "memo" },
  { k: "opts",    label: "オプション",   icon: "wand" },
];

export default function Guide({ onClose, initialTab }) {
  const [tab, setTab] = useState(TABS.some((t) => t.k === initialTab) ? initialTab : "start");

  return (
    <Shell>
      <Header title="あそびかた" icon="book" onHome={onClose} />

      <div className="gd-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} className={`gd-tab${tab === t.k ? " on" : ""}`} onClick={() => setTab(t.k)}>
            <Icon name={t.icon} size={24} />{t.label}
          </button>
        ))}
      </div>

      {/* ══ はじめに ══ */}
      {tab === "start" && (
        <>
          <Bubble expr="happy">
            はじめまして、案内役の <b>てこみん</b> だてこ！<br />
            このアプリは <b>みんなでスマホを持って、同じテーブルで遊ぶ</b> ゲームだてこ。声に出して話すのが本番、スマホは役と時間と点数の係だてこ。
          </Bubble>

          <Sec head="さいしょの4ステップ" icon="arrowR">
            <Steps items={[
              { t: "同じページを開く", d: "全員が tekomi-insider.vercel.app を開く。合言葉や部屋番号はいらない。" },
              { t: "なまえを入れて「はじめる」", d: "名前はスマホが覚えている。途中でページを閉じても「つづきから」で戻れる。同じ名前で入り直せば、同じ人として点数も引き継がれる。" },
              { t: "主催者が部屋をオープンにする", d: "ふだんは閉じている。主催者だけが オープン／リセット／設定／強制進行 をできる。" },
              { t: "ロビーでゲームを選んでスタート", d: "3つのゲームを行き来しても、メンバーと得点はそのまま。3人から遊べる。" },
            ]} />
          </Sec>

          <Sec head="あそべる3つのゲーム" icon="star">
            <button className="gd-card" onClick={() => setTab("insider")}>
              <RoleChar role="insider" size={48} />
              <div style={{ flex: 1, paddingLeft: 4 }}>
                <div className="gd-name" style={{ color: "#8f6f17" }}>インサイダー</div>
                <div className="gd-desc">みんなで質問してお題を当てる。でも1人だけ答えを知っている。誰だ？ ▶</div>
              </div>
            </button>
            <button className="gd-card" onClick={() => setTab("wolf")}>
              <RoleChar role="wolf" size={48} />
              <div style={{ flex: 1, paddingLeft: 4 }}>
                <div className="gd-name" style={{ color: "#2f5fc4" }}>ワードウルフ</div>
                <div className="gd-desc">1人だけ違うお題を持っている。会話のズレから見つけ出す ▶</div>
              </div>
            </button>
            <button className="gd-card" onClick={() => setTab("jammer")}>
              <RoleChar role="jammer" size={48} />
              <div style={{ flex: 1, paddingLeft: 4 }}>
                <div className="gd-name" style={{ color: "#1f7a4c" }}>ワードジャマー</div>
                <div className="gd-desc">本当の答え1つに、嘘2つ。どれが本物か当てる ▶</div>
              </div>
            </button>
          </Sec>

          <Sec head="スマホを見られても大丈夫" icon="eye">
            <div className="gd-desc" style={{ fontSize: 14 }}>
              ゲーム中、役とお題は <b>押しているあいだだけ</b> 表示されるてこ。指をはなすと隠れるので、テーブルに置いたままでも安心。<br />
              ゲーム中は画面が消えにくくなるてこ（対応しているスマホだけ）。
            </div>
          </Sec>
        </>
      )}

      {/* ══ インサイダー ══ */}
      {tab === "insider" && (
        <>
          <Bubble expr="suspicious">
            合言葉は「<b>まず協力、そのあと疑う</b>」だてこ。<br />
            時間内にお題が当たらないと <b>ほぼ全員がマイナス</b>。インサイダーも、バレないように“当てさせる”のが仕事だてこ。
          </Bubble>

          <Sec head="やくわり" icon="people">
            <CharCard who="master" name="マスター（司会）"
              desc="お題を知っている進行役。質問に YES / NO / わからない で答える。お題が出たら「お題的中」を押す。毎ラウンド交代。" />
            <CharCard who="insider" name="インサイダー（潜入者）"
              desc="こっそりお題を知っている。バレない程度にヒントを出して、みんなに当てさせたい。" />
            <CharCard who="common" name="コモン（みんな）"
              desc="お題を知らない。質問してお題を当てて、そのあと『誰が知っていたか』を見抜く。" />
            <CharCard who="follower" name="フォロワー（6人以上・オプション）"
              desc="お題は知らないが、インサイダーが誰かだけ知っている味方。勝ち負けを一緒に背負う。" />
          </Sec>

          <Sec head="1ラウンドの流れ" icon="loop">
            <Steps items={[
              { t: "マスターがお題を引く", d: "カテゴリは 食べもの／場所／モノ／生きもの／エンタメ／しごと・学校／むずかしめ。引いたお題も押しているあいだだけ見える。" },
              { t: "役が配られる", d: "自分の画面だけに表示。「おぼえた！」を押すと隠れる。" },
              { t: "質問タイム（5・7・9分）", d: "「それは食べ物？」のように YES / NO で答えられる質問をする。答えるのはマスターだけ。質問は口で言っても、アプリに書いてもOK。足りなければ1分のばせる。" },
              { t: "お題が当たったら「お題的中」", d: "当てた瞬間にマスターが押す。ここで時間はストップ。" },
              { t: "全員でインサイダーを投票", d: "マスターも投票する。名前をえらんで「決定」。全員そろうと自動で開票。" },
              { t: "結果ととくてん → 次のラウンドへ", d: "このラウンドで増えた点が +2 のように出る。マスターが交代してロビーに戻る。" },
            ]} />
          </Sec>

          <Sec head="とくてん" icon="star">
            <Pts rows={[
              { e: "people", t: "コモン勝利（お題も犯人も当てた）", p: "コモン・マスター +2" },
              { e: "mask", t: "インサイダー逃げ切り（お題は判明・犯人は外した。同票も逃げ切り）", p: "インサイダー +3" },
              { e: "ninja", t: "そのときのフォロワー", p: "+2" },
              { e: "hourglass", t: "時間切れ：マスター", p: "0", k: "0" },
              { e: "hourglass", t: "時間切れ：コモン", p: "−1", k: "-" },
              { e: "hourglass", t: "時間切れ：インサイダー・フォロワー", p: "−2", k: "-" },
            ]} />
          </Sec>

          <Bubble expr="thinking">
            コツてこ：質問は「はい／いいえ」で答えられる形にするてこ。<br />
            そして<b>やけに鋭い人</b>と<b>やけに黙っている人</b>、どっちも怪しいてこ！
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

          <Sec head="やくわり" icon="people">
            <CharCard who="citizen" name="市民（多数派）" desc="同じお題を持つ仲間。会話のズレから、違うお題の人＝ウルフを探す。" />
            <CharCard who="wolf" name="ウルフ（少数派）" desc="1人だけ違うお題。話を合わせて逃げ切る。7人以上で2人になる（部屋主が1人／2人に決めることもできる）。" />
          </Sec>

          <Sec head="ながれ" icon="loop">
            <Steps items={[
              { t: "お題が配られる", d: "例：みんな「寿司」／ウルフだけ「刺身」。どちらが多数派かは毎回入れ替わる。" },
              { t: "話し合い（3・4・5分）", d: "「いつ食べる？」など、断定を避けつつ探り合う。部屋主が1分のばせる。" },
              { t: "一斉投票", d: "いちばん票を集めた人が吊られる。同数なら市民の負け。" },
              { t: "吊られたウルフには敗者復活", d: "多数派のお題を言い当てれば大逆転。合っているかは市民の誰かが判定する。" },
            ]} />
          </Sec>

          <Sec head="とくてん" icon="star">
            <Pts rows={[
              { e: "people", t: "市民勝ち（ウルフを吊った）", p: "市民 +1" },
              { e: "wolf", t: "ウルフ逃げ切り", p: "ウルフ +2" },
              { e: "fire", t: "吊られたウルフがお題を言い当てた", p: "ウルフ +3" },
            ]} />
          </Sec>
        </>
      )}

      {/* ══ ワードジャマー ══ */}
      {tab === "jammer" && (
        <>
          <Bubble expr="happy">
            <b>本当の答え1つ</b>に<b>嘘2つ</b>を混ぜるてこ。<br />
            役はラウンドごとに自動でじゅんぐりに回るから、覚えなくて大丈夫だてこ。
          </Bubble>

          <Sec head="やくわり" icon="people">
            <CharCard who="dasmon" name="ダスモン（答える人）" desc="質問カードに、本当の答えを入力する。見抜いてもらえると得点になる。" />
            <CharCard who="jammer" name="ジャマー（邪魔する人）" desc="本物っぽい嘘を2つ作って混ぜる。だまされた人数だけ点が入る。" />
            <CharCard who="wakarun" name="ワカルン（当てる人）" desc="残り全員。シャッフルされた3択から、本物を選ぶ。" />
          </Sec>

          <Sec head="ながれ" icon="loop">
            <Steps items={[
              { t: "ダスモンが本当の答えを入力", d: "質問には ★1〜3 の難易度がついている。" },
              { t: "ジャマーが嘘を2つ入力", d: "ありそうな嘘ほど強い。" },
              { t: "3択がシャッフルされて出る", d: "ワカルンが1つ選んで「決定」。全員選ぶと自動で開票。" },
              { t: "結果発表", d: "主催者は「いまある回答で締め切る」で先に進められる。" },
            ]} />
          </Sec>

          <Sec head="とくてん" icon="star">
            <Pts rows={[
              { e: "glass", t: "正解したワカルン", p: "+難易度（1〜3）" },
              { e: "devil", t: "だまされたワカルン1人につき ジャマー", p: "+1" },
              { e: "pencil", t: "ワカルンの半数以上が正解したら ダスモン", p: "+1" },
            ]} />
          </Sec>
        </>
      )}

      {/* ══ オプション ══ */}
      {tab === "opts" && (
        <>
          <Bubble expr="normal">
            インサイダーは、主催者がロビーで<b>味付け</b>を変えられるてこ。<br />初めての回は、全部OFFの「ふつう」がおすすめだてこ。
          </Bubble>

          <Sec head="マジカル（ルールが変わる）" icon="wand">
            <CharCard who="wizard" name="魔術師（マスターの代わり）"
              desc="お題を知っていて質問に答える。お題が当たったら、この人が1人だけでインサイダーを指名する。" />
            <CharCard who="villager" name="村人チーム（ほかの全員）"
              desc="お題は知らないが、インサイダーが誰かは知っている。チーム全員に“魔術カード”（ヒソヒソ声・語尾に〜にゃ・武士口調など全40種のしゃべり方の縛り）が配られる。結果で全員のカードが公開される。" />
            <Pts rows={[
              { e: "house", t: "村人チーム勝利（お題を当て、指名を外させた）", p: "チーム全員 +2" },
              { e: "wizard", t: "魔術師がインサイダーを見破った", p: "魔術師 +3" },
              { e: "hourglass", t: "時間切れ", p: "魔術師 +2 ／ 村人 −1", k: "-" },
            ]} />
            <div className="gd-desc">※ マジカル中は 平和村・フォロワー は使えない（自動でOFFになる）。</div>
          </Sec>

          <Sec head="そのほかのオプション" icon="star">
            <OptCard icon="halo" name="平和村">
              10%の確率でインサイダーが<b>いない</b>回になる。いちばん多い票が「インサイダーはいない」なら全員 +1。見抜けなかったときや時間切れは<b>全員0点</b>（マイナスにはならない）。疑心暗鬼が跳ね上がる。
            </OptCard>
            <OptCard icon="ninja" name="フォロワー">6人以上のときだけ発動。インサイダーの隠れた味方が1人つく。</OptCard>
            <OptCard icon="book" name="カテゴリ公開（やさしめ）">お題のカテゴリ（食べもの・場所…）を全員に見せる。初めての人が多いときや、時間切れが続くときに。</OptCard>
            <OptCard icon="chili" name="アダルト">
              お題がきわどくなる。部屋主がロビーで<b>エロ度</b>をラウンドごとに選べる：<b>ほんのり</b>（恋愛・ドキッ）／<b>きわどい</b>（体・下着・夜の店）／<b>どエロ</b>（行為・プレイ）／ミックス。インサイダーとワードウルフはそのエロ度のお題だけ、ワードジャマーは通常の質問にそのエロ度までの質問が混ざる。<b>初対面の人がいる席ではOFF</b>にしておくこと。
            </OptCard>
            <OptCard icon="pencil" name="自由お題">マスターはお題を引くかわりに、自分で好きなお題を書ける。ワードジャマーのダスモンも質問を自分で書ける。</OptCard>
          </Sec>

          <Sec head="主催者ができること" icon="key">
            <Steps items={[
              { t: "部屋のオープン／クローズ", d: "閉めている間は新しい人は入れない（もう入っている人は「つづきから」で戻れる）。" },
              { t: "ゲーム・オプション・制限時間の設定", d: "マスターの決め方（ランダム／じゅんぐり／固定）もここ。" },
              { t: "帰った人を外す", d: "ロビーの名前の横の × で外せる。電波が切れた人がいると投票がそろわないので、そのときに。" },
              { t: "主催者メニュー（強制開票・ラウンド中止）", d: "電波が悪くて止まったときに先へ進める。うっかり押さないよう、たたんである。" },
              { t: "部屋のリセット・通算成績のリセット", d: "通算成績は名前ごとに残り、1位に王冠・ビリにうんちが付く。" },
            ]} />
          </Sec>
        </>
      )}

      <button className="btn btn-gold" onClick={onClose}><Icon name="check" size={24} />とじる</button>
    </Shell>
  );
}

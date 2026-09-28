// ワードウルフ：全員にお題が配られるが、1人（7人以上なら2人）だけ違うお題＝ウルフ。
// 話し合いでウルフを見つけて投票。ウルフが吊られても、多数派のお題を言い当てれば逆転勝ち。
import { useState, useEffect, useContext } from "react";
import { updateRoom, setRoomField, transactRoom } from "../lib/db";
import { finalizeRound } from "../lib/scoring";
import { ROOM, dec, computeFlair, topVote, scorerOf, TAKEOVER_MS } from "../lib/util";
import { wolfCount, wolvesOf, wolfLeft, tallyWolf, scoreWolf } from "../lib/rules";
import { GAMES } from "../lib/roles";
import { useNow, buzz } from "../lib/hooks";
import { sfxReveal, sfxVote } from "../lib/sound";
import { ShotCtx } from "../lib/shotctx";
import { Icon } from "../icons";
import { OwlDoc, RoleChar, Bubble, Shell, Header, Panel, ErrBox, PlayerRows, OptRow, Seg, Secret, TimerBar, HostMenu } from "../ui";

const WOLF_TIMES = [{ k: 180, label: "3分" }, { k: 240, label: "4分" }, { k: 300, label: "5分" }];

// ── ロビー内の設定 ──
export function WolfSettings({ room, isHost, onStart, err }) {
  const n = (room?.players || []).length;
  const dur = room?.wolfDuration || 180;
  return (
    <>
      {isHost && (
        <Panel head="ワードウルフ設定（部屋主）" icon="key">
          <OptRow on={!!room.adult} color="#a020e0" icon="chili" label="アダルト" desc="お題のペアがきわどく…完全に身内だけの席で" onClick={() => updateRoom(ROOM, { adult: !room.adult })} />
          <div className="label">話し合いの時間</div>
          <Seg items={WOLF_TIMES} value={dur} onChange={(s) => updateRoom(ROOM, { wolfDuration: s })} />
          <div className="panel-note center" style={{ marginTop: 10 }}>ウルフは {wolfCount(n)}人（7人以上で2人）</div>
        </Panel>
      )}
      {isHost ? (
        <>
          <button className="btn btn-red" onClick={onStart} disabled={n < 3}><Icon name="arrowR" size={24} />{n < 3 ? `あと${3 - n}人` : "ワードウルフ スタート！"}</button>
          <ErrBox>{err}</ErrBox>
        </>
      ) : (
        <div className="note-bar note-dark"><Icon name="wolf" size={24} />部屋主のスタートを待つてこ（話し合い {dur / 60}分・ウルフ {wolfCount(n)}人{room?.adult ? "・アダルト" : ""}）</div>
      )}
      <Panel head="ワードウルフのルール" icon="wolf" headStyle={{ background: "linear-gradient(180deg,#8fb3ff,#5b8def)" }}>
        <div className="gd-grid">
          {[
            ["全員にお題が配られる。でも1人だけ違うお題（＝ウルフ）。自分がウルフかは分からない", null],
            ["お題の話をして、話が合わない人を探す", null],
            ["いちばん票を集めた人がウルフなら", "市民 +1"],
            ["ウルフが逃げ切ったら", "ウルフ +2"],
            ["吊られたウルフが多数派のお題を当てたら大逆転", "ウルフ +3"],
          ].map(([t, p], i) => (
            <div key={i} className="gd-pt"><div className="gd-num" style={{ width: 32, flex: "0 0 32px" }}>{i + 1}</div><div className="gd-pt-t">{t}</div>{p && <span className="chip chip-plus">{p}</span>}</div>
          ))}
        </div>
      </Panel>
    </>
  );
}

// ── ゲーム本体（phase: playing → vote → wolfguess → result）──
export function WolfGame({ room, myId, myName, isHost, lb, onHome, onAbort, onNextRound, openLb }) {
  const shot = useContext(ShotCtx);
  const [revealed, setRevealed] = useState(!!shot.revealed);
  const [guess, setGuess] = useState("");
  const [pick, setPick] = useState(null);
  const phase = room?.phase;
  const players = room?.players || [];
  const wolves = wolvesOf(room);
  const amWolf = wolves.includes(myId);
  const maj = dec(room?.wolf?.majEnc || "");
  const min = dec(room?.wolf?.minEnc || "");
  const myWord = amWolf ? min : maj;
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
  const now = useNow(phase === "playing");
  const left = wolfLeft(room, now);
  const total = room?.wolfEndAt && room?.startTime ? Math.round((room.wolfEndAt - room.startTime) / 1000) : (room?.wolfDuration || 180);
  const G = GAMES.wordwolf;
  const hdr = (sub) => <Header title="ワードウルフ" icon="wolf" sub={sub || `ROUND ${room?.round || 1}`} onHome={onHome} />;

  const toVote = () => transactRoom(ROOM, (cur) => (cur?.phase === "playing" ? { ...cur, phase: "vote", votes: null } : undefined));
  const extend = () => transactRoom(ROOM, (cur) => (cur?.phase === "playing" ? { ...cur, wolfEndAt: Math.max(cur.wolfEndAt || 0, Date.now()) + 60000 } : undefined));

  // 開票：最多票が単独でウルフなら逆転チャンスへ。そうでなければウルフの逃げ切りで採点（どちらも1回だけ）
  const tally = async () => {
    const res = await transactRoom(ROOM, (cur) => {
      if (!cur || cur.phase !== "vote" || cur.scored) return undefined;
      const t = tallyWolf(cur);
      return t.caughtId ? { ...cur, phase: "wolfguess", wolf: { ...cur.wolf, caughtId: t.caughtId } } : undefined;
    });
    if (!res.committed) await finalizeRound((cur) => (cur.phase === "vote" && !tallyWolf(cur).caughtId ? scoreWolf(cur, "wolf") : null));
  };
  const doVote = async (targetId) => {
    if (!targetId || room?.votes?.[myId]) return;
    sfxVote(); buzz(40);
    await setRoomField(ROOM, `votes/${myId}`, targetId); // 自分の票だけ書く
  };

  // 票が全員ぶんそろったら開票。採点役（部屋主）がすぐ、寝ていれば他の端末が少し待って肩代わり
  useEffect(() => {
    if (phase !== "vote" || room?.scored) return undefined;
    if (!players.length || !players.every((p) => room?.votes?.[p.id])) return undefined;
    const id = setTimeout(() => { tally().catch(() => {}); }, scorerOf(room) === myId ? 0 : TAKEOVER_MS);
    return () => clearTimeout(id);
  }, [phase, room, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitGuess = () => { if (guess.trim()) updateRoom(ROOM, { "wolf/guess": guess.trim().slice(0, 30) }); };
  const judge = (ok) => finalizeRound((cur) => (cur.phase === "wolfguess" ? scoreWolf(cur, ok ? "reverse" : "citizens") : null));

  // ════ 話し合い ════
  if (phase === "playing") {
    if (!revealed) return (
      <Shell>
        {hdr()}
        <div className="center" style={{ paddingTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><OwlDoc size={96} bob expr="surprised" /></div>
          <div className="mp-title" style={{ fontSize: 24 }}>{myName} へ</div>
          <div className="mp-lead" style={{ margin: "12px 0 26px" }}>お題をくばるてこ。<br />まわりに見られないようにてこ！</div>
          <button className="btn btn-red" onClick={() => { setRevealed(true); sfxReveal(); buzz(60); }}><Icon name="eye" size={24} />お題を見る</button>
        </div>
      </Shell>
    );
    return (
      <Shell>
        {hdr()}
        <TimerBar left={left} total={total} keeper={isHost} labelL="話し合い" labelR={`ウルフ ${wolves.length}人`} />
        <Secret label="あなたのお題" hint="押しているあいだだけ見える（まわりに見せない）">
          <div className="center" style={{ fontSize: 32, color: "#111", padding: "4px 0" }}>「{myWord}」</div>
          <div className="panel-note center">自分がウルフかは分からない。みんなと同じ気持ちで語るてこ</div>
        </Secret>
        {isHost ? (
          <>
            <button className="btn btn-gold" onClick={toVote}><Icon name="check" size={24} />話し合いおわり → 投票へ</button>
            <button className="btn btn-cream btn-sm" onClick={extend}><Icon name="clock" size={24} />1分のばす</button>
            <HostMenu><button className="btn btn-dark btn-sm" onClick={onAbort}>ラウンド中止（点数なし・ロビーへ）</button></HostMenu>
          </>
        ) : left === 0 ? (
          <div className="note-bar note-red"><Icon name="hourglass" size={24} />時間切れ！ 部屋主が投票へ進めるてこ</div>
        ) : null}
        <Bubble expr="thinking">お題を直接言わずに、それっぽい話をするてこ。話が微妙にズレてる人…それがウルフてこ！</Bubble>
      </Shell>
    );
  }

  // ════ 投票 ════
  if (phase === "vote") {
    const votes = room?.votes || {};
    const cnt = players.filter((p) => votes[p.id]).length;
    const waiting = players.filter((p) => !votes[p.id]).map((p) => p.name);
    const myVote = votes[myId];
    return (
      <Shell>
        {hdr()}
        <div className="center">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><OwlDoc size={72} bob expr="suspicious" /></div>
          <div className="mp-title" style={{ fontSize: 26 }}>ウルフは誰だ？</div>
          <div className="mp-lead" style={{ margin: "6px 0 14px" }}>いちばん怪しい人に投票！</div>
        </div>
        <div className="note-bar note-dark"><Icon name="people" size={24} />{cnt} / {players.length} 人が投票{cnt > 0 && waiting.length ? `（まだ：${waiting.join("・")}）` : ""}</div>
        {myVote ? (
          <Panel><div className="center" style={{ padding: 8 }}><div className="small">あなたの投票</div><div style={{ fontSize: 22, margin: "4px 0" }}>{nameOf(myVote)}</div><div className="panel-note">開票を待つてこ</div></div></Panel>
        ) : (
          <Panel head="一斉投票" icon="wolf" headStyle={{ background: "linear-gradient(180deg,#8fb3ff,#5b8def)" }}>
            {players.filter((p) => p.id !== myId).map((p) => (
              <button key={p.id} className={`btn btn-sm ${pick === p.id ? "btn-gold" : "btn-dark"}`} onClick={() => setPick(p.id)} aria-pressed={pick === p.id}>
                {pick === p.id && <Icon name="check" size={24} />}{p.name}
              </button>
            ))}
            <button className="btn btn-red" onClick={() => doVote(pick)} disabled={!pick} style={{ marginBottom: 0 }}>{pick ? `「${nameOf(pick)}」に決定！` : "えらんでから決定してね"}</button>
          </Panel>
        )}
        {isHost && (
          <HostMenu note="電波が悪くて票がそろわない時に使う">
            <button className="btn btn-red btn-sm" onClick={() => { if (Object.keys(votes).length) tally(); }}>いまある票で開票する</button>
            <button className="btn btn-dark btn-sm" onClick={onAbort}>ラウンド中止（点数なし・ロビーへ）</button>
          </HostMenu>
        )}
      </Shell>
    );
  }

  // ════ 逆転チャンス ════
  if (phase === "wolfguess") {
    const caught = room?.wolf?.caughtId;
    const g = room?.wolf?.guess;
    const amCaught = caught === myId;
    return (
      <Shell>
        {hdr()}
        <div className="center pop">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><RoleChar role="wolf" size={72} /></div>
          <div className="mp-title" style={{ fontSize: 24 }}>{nameOf(caught)} がウルフだった！</div>
          <div className="mp-lead" style={{ margin: "6px 0 14px" }}>でも最後の逆転チャンス！<br />多数派のお題を言い当てたら大逆転てこ</div>
        </div>
        {amCaught ? (
          g ? <div className="note-bar note-dark">「{g}」で回答ずみ。判定を待つてこ…</div> : (
            <Panel head="みんなのお題は…？" icon="fire" headStyle={{ background: "linear-gradient(180deg,#ff8a7e,#E53935)", color: "#fff" }}>
              <input className="mp-input" placeholder="多数派のお題を入力" value={guess} maxLength={30} enterKeyHint="send"
                onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitGuess(); }} />
              <button className="btn btn-red" onClick={submitGuess} disabled={!guess.trim()} style={{ marginBottom: 0 }}><Icon name="fire" size={24} />これだ！</button>
            </Panel>
          )
        ) : (
          <Panel head="ウルフの答え" icon="wolf">
            {g ? (
              <>
                <div className="center" style={{ fontSize: 26, color: "#c62828", margin: "4px 0" }}>「{g}」</div>
                <div className="panel-note center" style={{ marginBottom: 12 }}>多数派は「{maj}」。合ってる？{amWolf ? "（判定は市民）" : "（市民が判定）"}</div>
                {!amWolf && (
                  <div className="btn-row" style={{ marginBottom: 0 }}>
                    <button className="btn btn-red" onClick={() => judge(true)}>正解…逆転！</button>
                    <button className="btn btn-gold" onClick={() => judge(false)}>ハズレ！</button>
                  </div>
                )}
              </>
            ) : <div className="panel-note center" style={{ padding: 12 }}>{nameOf(caught)} が考え中…</div>}
          </Panel>
        )}
        {isHost && !g && <HostMenu><button className="btn btn-dark btn-sm" onClick={() => judge(false)}>回答なしで市民の勝ちにする</button></HostMenu>}
      </Shell>
    );
  }

  // ════ 結果 ════
  if (phase === "result") {
    const oc = room?.outcome;
    const title = { citizens: "市民の勝利！", wolf: "ウルフの勝利！", reverse: "ウルフの大逆転！" }[oc] || "結果";
    const votes = room?.votes || {};
    const { vc } = topVote(votes);
    const flair = computeFlair(players, lb);
    return (
      <Shell>
        {hdr(`ROUND ${room?.round || 1} 結果`)}
        <div className="center pop">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>{oc === "citizens" ? <RoleChar role="citizen" size={72} /> : <RoleChar role="wolf" size={72} />}</div>
          <div className="mp-title" style={{ fontSize: 28, color: oc === "citizens" ? "#D4AF37" : "#ff6b5e" }}>{title}</div>
        </div>
        <Panel className="rise" style={{ animationDelay: ".3s" }}>
          <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", gap: 8 }}>
            <div><div className="small">多数派</div><div style={{ fontSize: 22, color: G.color }}>「{maj}」</div></div>
            <div><div className="small">ウルフ</div><div style={{ fontSize: 22, color: "#c62828" }}>「{min}」</div></div>
          </div>
        </Panel>
        <Panel head="ウルフの正体は…" className="pop" style={{ animationDelay: ".5s", borderColor: "#E53935" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <RoleChar role="wolf" size={48} />
            <span style={{ fontSize: 26, color: "#c62828" }}>{wolves.map(nameOf).join("・")}</span>
          </div>
          {room?.wolf?.guess && <div className="panel-note center" style={{ marginTop: 8 }}>逆転の答え →「{room.wolf.guess}」</div>}
        </Panel>
        <Panel head="とくてん（このラウンド／合計）" icon="star">
          <PlayerRows players={players} scores={room?.scores} delta={room?.lastDelta || {}} myId={myId} animate
            mark={(p) => (wolves.includes(p.id) ? "wolf" : flair[p.name] || null)}
            nameColor={(p) => (wolves.includes(p.id) ? "#c62828" : undefined)}
            note={(p) => (vc[p.id] ? <span className="prow-note">{vc[p.id]}票</span> : null)} />
        </Panel>
        {Object.keys(votes).length > 0 && (
          <Panel head="だれが だれに" icon="people">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
              {players.filter((p) => votes[p.id]).map((p) => (
                <div key={p.id} style={{ fontSize: 15, padding: "3px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name} <span style={{ color: "#c62828" }}>→</span> <b style={{ color: wolves.includes(votes[p.id]) ? "#1f7a4c" : "#1a1a1a" }}>{nameOf(votes[p.id])}</b>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {isHost
          ? <button className="btn btn-gold" onClick={onNextRound}><Icon name="arrowR" size={24} />次のラウンドへ（ロビー）</button>
          : <div className="note-bar note-dark">部屋主が次のラウンドを始めるてこ</div>}
        <div className="btn-row">
          <button className="btn btn-dark btn-sm" onClick={openLb}><Icon name="trophy" size={24} />せいせき</button>
          <button className="btn btn-cream btn-sm" onClick={onHome}><Icon name="door" size={24} />ホームへ</button>
        </div>
      </Shell>
    );
  }

  return <Shell><div className="center" style={{ paddingTop: 48 }}>…</div></Shell>;
}

// 画面の小道具（React のフック）
import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from "react";
import { subscribeConnected } from "./db";
import { setSound, isSound } from "./sound";
import { device } from "./device";

// 効果音の ON/OFF（どの画面の右上からでも切り替えられる。端末に記憶する）
const soundSubs = new Set();
export function loadSoundPref() {
  const saved = device.get("tekomi_sound");
  if (saved !== null) setSound(saved === "1");
}
export function toggleSound() {
  const next = !isSound();
  setSound(next);
  device.set("tekomi_sound", next ? "1" : "0");
  soundSubs.forEach((f) => f(next));
  return next;
}
export function useSound() {
  const [on, setOn] = useState(isSound());
  useEffect(() => { soundSubs.add(setOn); return () => { soundSubs.delete(setOn); }; }, []);
  return [on, toggleSound];
}

// ゲーム中はスマホの画面が消えないようにする（対応ブラウザだけ。非対応なら何もしない）。
// 画面が消えると時計や投票の同期が止まるので、飲み会で一番よく起きる「寝落ち」を防ぐ。
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.wakeLock) return undefined;
    let lock = null;
    let dead = false;
    const grab = async () => {
      try { if (!dead && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen"); } catch { /* 拒否されたら諦める */ }
    };
    grab();
    const onVis = () => { if (document.visibilityState === "visible") grab(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { dead = true; document.removeEventListener("visibilitychange", onVis); try { lock?.release(); } catch { /* noop */ } };
  }, [active]);
}

// 1秒ごとに今の時刻を返す（残り時間の表示用）
export function useNow(active, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const first = setTimeout(() => setNow(Date.now()), 0); // 画面を開いた直後にも最新にする
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active, ms]);
  return now;
}

// 短く震わせる（Android のみ。iPhone は非対応なので何もしない）
export const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* noop */ } };

// サーバーとつながっているか。アプリ全体で1つだけ購読し、画面が変わっても値を引き継ぐ。
// 切れてもすぐには「切れた」と言わない（起動直後や一瞬の途切れでチラつかないように）
const OFFLINE_GRACE_MS = 1500;
const conn = { ok: true, subs: new Set(), started: false, timer: null };
const notify = () => conn.subs.forEach((f) => f());
function startConnWatch() {
  if (conn.started) return;
  conn.started = true;
  subscribeConnected((connected) => {
    if (connected) {
      clearTimeout(conn.timer); conn.timer = null;
      if (!conn.ok) { conn.ok = true; notify(); }
    } else if (!conn.timer) {
      conn.timer = setTimeout(() => { conn.timer = null; conn.ok = false; notify(); }, OFFLINE_GRACE_MS);
    }
  });
}
const subscribeConn = (cb) => { startConnWatch(); conn.subs.add(cb); return () => { conn.subs.delete(cb); }; };
export function useConnected() {
  return useSyncExternalStore(subscribeConn, () => conn.ok, () => true);
}

// ボタンを押したあとの「通信中」と「つながらない」を画面に出すための道具。
//   const { busy, err, setErr, run } = useAction();
//   onClick={() => run(() => transactRoom(...))}   → 押している間 busy、8秒たっても返ってこなければ err に文を入れる
// 圏外で押した操作は Firebase が覚えていて、つながった瞬間に流れる。だから文は「つながれば自動で進む」
export const MSG_TIMEOUT = "つながらないてこ…電波を確かめてね。つながれば自動で進むてこ";
export const MSG_FAIL = "うまくいかなかったてこ…もう一度押してね";
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = useCallback(async (fn, { timeout = 8000 } = {}) => {
    setErr(""); setBusy(true);
    let timer = null;
    try {
      return await Promise.race([
        Promise.resolve().then(fn),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { timeout: true })), timeout); }),
      ]);
    } catch (e) {
      if (!e?.timeout) console.error(e);
      if (alive.current) setErr(e?.timeout ? MSG_TIMEOUT : MSG_FAIL);
      return undefined;
    } finally {
      clearTimeout(timer);
      if (alive.current) setBusy(false);
    }
  }, []);
  return { busy, err, setErr, run };
}

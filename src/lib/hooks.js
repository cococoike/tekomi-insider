// 画面の小道具（React のフック）
import { useEffect, useState } from "react";
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

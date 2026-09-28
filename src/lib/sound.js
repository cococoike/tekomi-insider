// 軽量効果音（音声ファイル不要。WebAudioで合成）。ON/OFF可。
let ctx = null;
let enabled = true;

const getCtx = () => {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
};

export const setSound = (v) => { enabled = v; if (v) getCtx(); };
export const isSound = () => enabled;

function tone(freq, startOffset, dur, type = "square", gain = 0.12) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

export function sfxClick() {
  if (!enabled) return;
  tone(740, 0, 0.07, "square", 0.1);
}

export function sfxSelect() {
  if (!enabled) return;
  tone(523, 0, 0.06, "square", 0.1);
  tone(784, 0.05, 0.08, "square", 0.1);
}

export function sfxCorrect() {
  if (!enabled) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.14, "square", 0.12));
}

export function sfxDrumroll() {
  if (!enabled) return;
  for (let i = 0; i < 10; i++) tone(180 + i * 4, i * 0.05, 0.05, "triangle", 0.09);
  tone(880, 0.55, 0.25, "square", 0.14);
}

export function sfxResult(win) {
  if (!enabled) return;
  if (win) [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.1, 0.2, "square", 0.13));
  else [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.22, "sawtooth", 0.11));
}

// 役職を開いたとき（ファンファーレ）
export function sfxReveal() {
  if (!enabled) return;
  [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.12, "square", 0.1));
  tone(1047, 0.3, 0.3, "triangle", 0.13);
}

// 残り10秒のカウント（最後の1秒は高い音）。時計役の端末だけが鳴らす
export function sfxTick(last = false) {
  if (!enabled) return;
  tone(last ? 1320 : 880, 0, 0.06, "square", 0.08);
}

// 時間切れのブザー
export function sfxBuzzer() {
  if (!enabled) return;
  tone(220, 0, 0.45, "sawtooth", 0.13);
  tone(233, 0, 0.45, "square", 0.06);
  tone(196, 0.45, 0.6, "sawtooth", 0.13);
}

// 投票した・選んだ
export function sfxVote() {
  if (!enabled) return;
  tone(660, 0, 0.06, "square", 0.1);
  tone(990, 0.06, 0.1, "square", 0.1);
}

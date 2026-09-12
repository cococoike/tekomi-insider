// Firebase なしで動作確認するためのメモリ内モック（`MOCK_DB=1 npm run dev` で db.js の代わりに読み込まれる）
// 同じ関数名・同じ引数。window.__db でブラウザのコンソールから中身を操作できる。
const store = { rooms: {}, leaderboard: {} };
const listeners = {};
const emit = (code) => (listeners[code] || []).forEach((cb) => cb(store.rooms[code] ? JSON.parse(JSON.stringify(store.rooms[code])) : null));

export function subscribeRoom(code, callback) {
  (listeners[code] = listeners[code] || []).push(callback);
  setTimeout(() => callback(store.rooms[code] ? JSON.parse(JSON.stringify(store.rooms[code])) : null), 0);
  return () => { listeners[code] = (listeners[code] || []).filter((c) => c !== callback); };
}
export async function saveRoom(code, data) { store.rooms[code] = JSON.parse(JSON.stringify(data)); emit(code); }
export async function setRoomField(code, key, value) { store.rooms[code] = { ...(store.rooms[code] || {}), [key]: value }; emit(code); }
export async function loadRoom(code) { return store.rooms[code] ? JSON.parse(JSON.stringify(store.rooms[code])) : null; }
export async function loadLeaderboard() { return JSON.parse(JSON.stringify(store.leaderboard)); }
export async function saveLeaderboard(data) { store.leaderboard = JSON.parse(JSON.stringify(data)); }
if (typeof window !== "undefined") window.__db = { store, saveRoom, setRoomField, loadRoom };

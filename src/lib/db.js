import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, runTransaction, update } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export function subscribeRoom(code, callback) {
  const r = ref(db, `rooms/${code}`);
  return onValue(r, (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}

export async function saveRoom(code, data) {
  await set(ref(db, `rooms/${code}`), data);
}

// 部屋の一部だけ書く。key は "votes/<id>" のようなパスも可（他の人の書き込みを上書きしない）
export async function setRoomField(code, key, value) {
  await set(ref(db, `rooms/${code}/${key}`), value);
}

// 部屋の中の、指定した項目だけを書き換える（他の項目＝他の人の変更には触らない）。
// patch のキーは "wolf/guess" のようなパスも可。値に null を渡すとその項目を消す。
export async function updateRoom(code, patch) {
  await update(ref(db, `rooms/${code}`), patch);
}

export async function loadRoom(code) {
  const snap = await get(ref(db, `rooms/${code}`));
  return snap.exists() ? snap.val() : null;
}

// 「読んで・直して・書く」を1回の不可分な操作にする（同時に何人が押しても、誰の変更も消えない）。
// fn(いまの部屋) は「書き込む値」か、書かないなら undefined を返す。fn は何度か呼ばれることがあるので、
// 中で通信や画面の更新などの副作用を起こさないこと。
export async function transactRoom(code, fn) {
  const res = await runTransaction(ref(db, `rooms/${code}`), (cur) => fn(cur));
  return { committed: res.committed, value: res.snapshot.exists() ? res.snapshot.val() : null };
}

export async function loadLeaderboard() {
  const snap = await get(ref(db, "leaderboard"));
  return snap.exists() ? snap.val() : {};
}

export async function saveLeaderboard(data) {
  await set(ref(db, "leaderboard"), data);
}

export async function transactLeaderboard(fn) {
  const res = await runTransaction(ref(db, "leaderboard"), (cur) => fn(cur || {}));
  return { committed: res.committed, value: res.snapshot.exists() ? res.snapshot.val() : {} };
}

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue } from "firebase/database";

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

// 部屋の特定フィールドだけ更新（残り時間の毎秒同期など。全体を上書きしないので競合しない）
export async function setRoomField(code, key, value) {
  await set(ref(db, `rooms/${code}/${key}`), value);
}

export async function loadRoom(code) {
  const snap = await get(ref(db, `rooms/${code}`));
  return snap.exists() ? snap.val() : null;
}

export async function loadLeaderboard() {
  const snap = await get(ref(db, "leaderboard"));
  return snap.exists() ? snap.val() : {};
}

export async function saveLeaderboard(data) {
  await set(ref(db, "leaderboard"), data);
}

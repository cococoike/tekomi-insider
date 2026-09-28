import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { loadSoundPref } from "./lib/hooks";

const el = document.getElementById("root");
const params = new URLSearchParams(location.search);

// 確認用（npm run dev:mock）のときだけ、撮影モード・全画面一覧を使える。本番のビルドには入らない
if (import.meta.env.VITE_MOCK === "1" && (params.has("shot") || params.has("gallery"))) {
  import("./dev/shot.jsx").then((m) => m.mountShot(el, params));
} else {
  loadSoundPref();
  createRoot(el).render(<App />);
}

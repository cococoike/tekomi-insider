// 撮影モード（dev:mock の ?shot=…）用の合図。本番では常に既定値のまま。
//   peek: 「押しているあいだだけ見える」カードを開いた状態で描く
//   revealed: 役職・お題を開封した状態で描く
import { createContext } from "react";

export const ShotCtx = createContext({ peek: false, revealed: false });

// 役職の見た目（色ちがいのてこみん・アイコン・説明）。あそびかたと役職配りの両方で使う。
// pal: てこみんの色替え（W=体と帽子 / G=星と服の縁）。color: 明るい紙の上で読める文字色。
export const ROLES = {
  master:   { name: "マスター",     icon: "mic",      color: "#8f6f17", pal: { W: "#F4F1EA", G: "#D4AF37" }, expr: "happy",      desc: "お題を知っている司会。質問に YES / NO で答えるてこ" },
  insider:  { name: "インサイダー", icon: "mask",     color: "#c62828", pal: { W: "#E88a86", G: "#8c1512" }, expr: "suspicious", desc: "こっそりお題を知っている。正体を隠して、みんなをお題へ導くてこ" },
  common:   { name: "コモン",       icon: "question", color: "#2f5fc4", pal: { W: "#cfd6e4", G: "#5b6b8a" }, expr: "thinking",   desc: "お題を知らない。質問でお題を当てて、潜入者を暴くてこ" },
  follower: { name: "フォロワー",   icon: "ninja",    color: "#7a2fa0", pal: { W: "#c7a2e8", G: "#5c2a8a" }, expr: "normal",     desc: "お題は知らないが、インサイダーの隠れた味方。勝ち負けは一緒てこ" },
  wizard:   { name: "魔術師",       icon: "wizard",   color: "#2f5fc4", pal: { W: "#9fc0ff", G: "#20408a" }, expr: "happy",      desc: "質問に YES / NO で答え、最後にひとりでインサイダーを見破るてこ" },
  villager: { name: "村人",         icon: "house",    color: "#2f5fc4", pal: { W: "#F4F1EA", G: "#5b8def" }, expr: "normal",     desc: "お題は知らないが、インサイダーが誰かは知っている。かばいながら当てるてこ" },
  citizen:  { name: "市民",         icon: "people",   color: "#2f5fc4", pal: { W: "#F4F1EA", G: "#7aa2f7" }, expr: "normal",     desc: "同じお題の仲間。話のズレからウルフを探すてこ" },
  wolf:     { name: "ウルフ",       icon: "wolf",     color: "#c62828", pal: { W: "#9aa6bd", G: "#2b3648" }, expr: "suspicious", desc: "1人だけ違うお題。話を合わせて逃げ切るてこ" },
  dasmon:   { name: "ダスモン",     icon: "pencil",   color: "#1f7a4c", pal: { W: "#a8dcc0", G: "#1f6b46" }, expr: "happy",      desc: "質問に本当の答えを書く人。当ててもらえると点になるてこ" },
  jammer:   { name: "ジャマー",     icon: "devil",    color: "#8a5a10", pal: { W: "#f0c98a", G: "#8a5a10" }, expr: "suspicious", desc: "本物っぽい嘘を2つ作って混ぜる人。だませた数だけ点になるてこ" },
  wakarun:  { name: "ワカルン",     icon: "glass",    color: "#1f7a4c", pal: { W: "#F4F1EA", G: "#3cb371" }, expr: "thinking",   desc: "3つの答えから本物を見抜く人てこ" },
};

// 遊べるゲーム。ロビーで部屋主が切り替える（同じ部屋・同じメンバーのまま移動できる）
export const GAMES = {
  insider:  { label: "インサイダー",   short: "インサイダー", icon: "eye",  color: "#b8901f", min: 3, desc: "質問でお題を当て、知ってるフリの潜入者を暴く" },
  wordwolf: { label: "ワードウルフ",   short: "ウルフ",       icon: "wolf", color: "#3f6fd6", min: 3, desc: "1人だけ違うお題の“ウルフ”を会話で探す" },
  jammer:   { label: "ワードジャマー", short: "ジャマー",     icon: "memo", color: "#2e9a5f", min: 3, desc: "本当の答えに嘘を2つ混ぜて、見抜けるか騙し合う" },
};

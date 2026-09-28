@echo off
chcp 65001 >nul
rem ============================================================
rem  手元で確認する（Firebase も本番の通算成績も使わない）
rem  ・ブラウザが開いたら、タブを何枚か開く（タブ1枚 = スマホ1台）
rem  ・全画面の見本は http://localhost:5199/?gallery
rem  ・止めるときは、この黒い窓を閉じる
rem  Node.js が必要。node_modules は Google Drive に置かないので、
rem  PC の中の作業用フォルダ（%LOCALAPPDATA%\tekomi-insider-work）にコピーして動かす。
rem ============================================================
set "SRC=%~dp0"
set "WORK=%LOCALAPPDATA%\tekomi-insider-work"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つからないてこ。https://nodejs.org/ から入れてね
  pause
  exit /b 1
)
echo 最新のファイルを作業用フォルダへコピーしてるてこ...
robocopy "%SRC%." "%WORK%" /MIR /XD node_modules dist .git shots /NFL /NDL /NJH /NJS /NP >nul
cd /d "%WORK%"
if not exist node_modules (
  echo はじめてなので準備中てこ（1〜2分かかる）...
  call npm ci --no-audit --no-fund
)
if not defined NO_BROWSER start "" cmd /c "timeout /t 4 >nul & start "" http://localhost:5199/"
call npm run dev:mock

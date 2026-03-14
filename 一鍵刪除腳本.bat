@echo off
:: 設定編碼為 UTF-8 避免中文亂碼
chcp 65001 >nul
title 驗證碼自動識別小助手 - 一鍵解除安裝
color 0C

echo ===================================================
echo       驗證碼自動識別小助手 - 一鍵解除安裝腳本
echo ===================================================
echo.
echo ⚠️ 警告：這個操作將會從你的電腦中移除以下 Python 套件：
echo    - ddddocr (驗證碼辨識核心)
echo    - flask (網頁伺服器)
echo    - flask-cors (跨網域連線套件)
echo.
echo 如果你確定不想再使用此工具，請按任意鍵繼續。
echo 如果你是點錯了，請直接點擊右上角 X 關閉這個視窗。
echo ===================================================
pause

echo.
echo [1/2] 正在解除安裝 Python 套件，請稍候...
pip uninstall ddddocr flask flask-cors -y -q
echo ✔️ 套件解除安裝完成！
echo.

echo [2/2] 正在幫你打開 Chrome 擴充功能頁面...
echo 👉 請在頁面中找到「驗證碼自動識別填入」，點擊【移除】按鈕。
start chrome "chrome://extensions/"
echo.

echo ===================================================
echo 🎉 清理完成！
echo 現在你可以直接把這個工具的「整個資料夾」丟進資源回收桶了。
echo ===================================================
echo.

pause

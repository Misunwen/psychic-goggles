@echo off
:: 設定編碼為 UTF-8 避免中文亂碼
chcp 65001 >nul
title 驗證碼自動識別小助手 - 啟動伺服器
color 0A

echo ===================================================
echo       驗證碼自動識別小助手 - 一鍵啟動腳本
echo ===================================================
echo.

:: 1. 檢查是否安裝了 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [錯誤] 你的電腦似乎沒有安裝 Python！
    echo 請先前往 https://www.python.org/downloads/ 安裝。
    echo ⚠️ 注意：安裝時請務必勾選底部的 "Add Python to PATH"！
    echo.
    pause
    exit /b
)

:: 2. 安裝必要的套件
echo [1/3] 檢查並安裝必要的 AI 辨識套件... (可能需要幾十秒，請稍候)
pip install flask flask-cors ddddocr -q
echo ✔️ 套件安裝/檢查完成！
echo.

//:: 3. 打開 Chrome 擴充功能頁面與當前資料夾
//echo [2/3] 正在幫你打開 Chrome 擴充功能頁面...
//echo         👉 請打開右上角的「開發人員模式」
//echo         👉 並點擊「載入未封裝項目」，選擇彈出來的這個資料夾
//start chrome "chrome://extensions/"
//:: 打開當前資料夾，方便朋友直接複製路徑或選取
//explorer "%~dp0"
//echo.

:: 4. 啟動 Python 伺服器
echo [3/3] 準備啟動辨識伺服器...
echo ===================================================
echo ⚠️ 請注意：這個黑色視窗必須【保持開啟】，辨識功能才能運作！
echo ⚠️ 如果想關閉伺服器，直接右上角 X 關閉這個視窗即可。
echo ===================================================
echo.

:: 假設你的 Python 檔案叫做 server.py，如果叫別的名字請修改這裡
python app.py

pause

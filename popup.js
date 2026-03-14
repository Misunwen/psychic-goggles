document.addEventListener('DOMContentLoaded', () => {
    // =========================================
    // 1. 取得畫面上的所有元素
    // =========================================
    const serverStatusSpan = document.getElementById('server-status');
    const recognizeBtn = document.getElementById('recognize-btn');
    const selectBtn = document.getElementById('select-btn');
    const clearBtn = document.getElementById('clear-btn'); 
    const autoFillCheckbox = document.getElementById('auto-fill-checkbox');
    const autoRunCheckbox = document.getElementById('auto-run-checkbox');
    const serverUrlInput = document.getElementById('server-url');
    const fieldInfo = document.getElementById('field-info');
    const fieldName = document.getElementById('field-name');
    const resultDiv = document.getElementById('result');
    
    // ★ 新增：取得輸入模式下拉選單
    const typingModeSelect = document.getElementById('typingMode'); 

    // =========================================
    // 2. 建立檢查伺服器狀態的函數 (加入超時機制)
    // =========================================
    async function checkServerStatus(url) {
        if (!serverStatusSpan) return;
        
        serverStatusSpan.textContent = '🟡 檢查中...';
        serverStatusSpan.style.color = '#f39c12'; // 橘色

        const targetUrl = (url || 'http://127.0.0.1:5000').replace(/\/+$/, '');

        // 設定 2 秒超時，如果伺服器沒開才不會一直卡住
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        try {
            // 發送 GET 請求測試
            const response = await fetch(targetUrl, { 
                method: 'GET',
                signal: controller.signal // 綁定超時控制器
            });
            
            // 只要有回應 (包含 404, 405) 都算伺服器有開
            clearTimeout(timeoutId);
            serverStatusSpan.textContent = '🟢 正常連線';
            serverStatusSpan.style.color = '#2ecc71'; // 綠色

        } catch (err) {
            clearTimeout(timeoutId);
            // 發生錯誤 (連線被拒絕，或是超時)
            serverStatusSpan.textContent = '🔴 無法連線';
            serverStatusSpan.style.color = '#e74c3c'; // 紅色
            console.log("伺服器檢查失敗:", err.message);
        }
    }

    // =========================================
    // 3. 讀取儲存的設定，並執行第一次伺服器檢查
    // =========================================
    // ★ 修改：在 get 陣列中加入 'typingMode'
    chrome.storage.local.get(['savedSelector', 'autoFill', 'autoRun', 'serverUrl', 'typingMode'], (data) => {
        if (data.savedSelector) {
            fieldInfo.style.display = 'block';
            fieldName.textContent = data.savedSelector;
        }
        if (data.autoFill !== undefined && autoFillCheckbox) autoFillCheckbox.checked = data.autoFill;
        if (data.autoRun !== undefined && autoRunCheckbox) autoRunCheckbox.checked = data.autoRun;
        
        const currentUrl = data.serverUrl || 'http://127.0.0.1:5000';
        if (serverUrlInput) {
            serverUrlInput.value = currentUrl;
        }

        // ★ 新增：讀取並設定輸入模式選單
        if (data.typingMode && typingModeSelect) {
            typingModeSelect.value = data.typingMode;
        }
        
        // 打開視窗時立刻檢查一次伺服器狀態
        checkServerStatus(currentUrl);
    });

    // =========================================
    // 4. 綁定事件監聽器
    // =========================================
    
    // ★ 新增：監聽輸入模式下拉選單改變時，儲存設定
    if (typingModeSelect) {
        typingModeSelect.addEventListener('change', (e) => {
            chrome.storage.local.set({ typingMode: e.target.value });
        });
    }

    // 儲存設定 (自動填入)
    if (autoFillCheckbox) {
        autoFillCheckbox.addEventListener('change', (e) => chrome.storage.local.set({ autoFill: e.target.checked }));
    }

    // 當「全自動模式」打勾改變時
    if (autoRunCheckbox) {
        autoRunCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            chrome.storage.local.set({ autoRun: isChecked });
            
            // 如果使用者打勾了，立刻發送指令給網頁，要求「現在馬上執行一次全自動」，不需要等 F5
            if (isChecked) {
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {action: 'runAutoNow'});
                    }
                });
            }
        });
    }

    // 網址輸入框改變時：儲存網址並重新檢查伺服器連線 (防手震)
    let typingTimer;
    if(serverUrlInput) {
        serverUrlInput.addEventListener('input', (e) => {
            const newUrl = e.target.value;
            chrome.storage.local.set({ serverUrl: newUrl });
            
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                checkServerStatus(newUrl);
            }, 800); // 停下鍵盤 0.8 秒後才檢查
        });
    }

    // 清除選擇按鈕
    if(clearBtn) {
        clearBtn.addEventListener('click', () => {
            chrome.storage.local.remove('savedSelector', () => {
                fieldInfo.style.display = 'none';
                fieldName.textContent = '';
                resultDiv.textContent = '已清除選擇的輸入框';
                resultDiv.className = 'result success';
                resultDiv.style.display = 'block';
            });
        });
    }

    // 手動選擇輸入框
    if(selectBtn) {
        selectBtn.addEventListener('click', () => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {action: 'startSelecting'}, (response) => {
                    if (chrome.runtime.lastError) {
                        alert("無法連線到網頁，請重新整理 (F5) 網頁後再試一次！");
                        return;
                    }
                });
                window.close();
            });
        });
    }

    // 手動識別驗證碼
    if(recognizeBtn) {
        recognizeBtn.addEventListener('click', () => {
            resultDiv.style.display = 'block';
            resultDiv.className = 'result loading';
            resultDiv.textContent = '正在取得驗證碼...';

            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {action: 'getCaptchaImage'}, (response) => {
                    if (chrome.runtime.lastError || !response || response.error) {
                        resultDiv.className = 'result error';
                        resultDiv.textContent = '未找到驗證碼，請嘗試重新整理頁面。';
                        return;
                    }

                    resultDiv.textContent = '正在交給後端識別...';
                    const serverUrl = (serverUrlInput ? serverUrlInput.value : 'http://127.0.0.1:5000').replace(/\/+$/, '');
                    const apiUrl = serverUrl + '/recognize'; 

                    fetch(apiUrl, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ image: response.imageData })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success || data.text) {
                            const text = data.text || data.result;
                            resultDiv.className = 'result success';
                            resultDiv.textContent = '識別成功: ' + text;

                            if (autoFillCheckbox && autoFillCheckbox.checked) {
                                // ★ 修改：手動點擊識別時，一併讀取並傳送 typingMode 給網頁
                                chrome.storage.local.get(['savedSelector', 'typingMode'], (storageData) => {
                                    chrome.tabs.sendMessage(tabs[0].id, {
                                        action: 'fillCaptcha',
                                        text: text,
                                        selector: storageData.savedSelector,
                                        typingMode: storageData.typingMode || 'simulate' // 傳送輸入模式
                                    });
                                });
                            }
                        } else {
                            throw new Error(data.error || '識別失敗');
                        }
                    })
                    .catch(err => {
                        resultDiv.className = 'result error';
                        resultDiv.textContent = '後端連線失敗: ' + err.message;
                    });
                });
            });
        });
    }
});

// ==========================================
// 1. 手動選擇輸入框的邏輯 (滑鼠移動會有紅框)
// ==========================================
function startSelectionMode() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    overlay.style.zIndex = '999999';
    overlay.style.cursor = 'crosshair';
    document.body.appendChild(overlay);

    let lastElement = null;

    const mouseMoveHandler = (e) => {
        overlay.style.pointerEvents = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        overlay.style.pointerEvents = 'auto';

        if (target && target !== lastElement) {
            if (lastElement) lastElement.style.outline = ''; 
            if (target.tagName.toLowerCase() === 'input') {
                target.style.outline = '3px solid red'; 
                lastElement = target;
            } else {
                lastElement = null;
            }
        }
    };

    const clickHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (lastElement) {
            lastElement.style.outline = ''; 
            const selector = generateSelector(lastElement);
            chrome.storage.local.set({ savedSelector: selector }, () => {
                alert('✅ 已成功選擇輸入框！\n標識符：' + selector);
            });
        }

        document.body.removeChild(overlay);
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('click', clickHandler, true);
    };

    function generateSelector(element) {
        if (element.id) return '#' + element.id;
        if (element.name) return `input[name="${element.name}"]`;
        let selector = element.tagName.toLowerCase();
        if (element.className) {
            selector += '.' + Array.from(element.classList).join('.');
        }
        return selector;
    }

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('click', clickHandler, true);
}

// ==========================================
// 全域變數
// ==========================================
let isSelecting = false;

// ==========================================
// 2. 接收從彈出視窗 (popup.js) 傳來的指令統一處理
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startSelecting') {
        startSelectionMode();
        sendResponse({status: "ok"});
    } 
    else if (request.action === 'getCaptchaImage') {
        getCaptchaImage(sendResponse);
        return true; 
    } 
    else if (request.action === 'fillCaptcha') {
        fillCaptchaInput(request.text, request.selector);
        sendResponse({status: "ok"});
    }
    else if (request.action === 'runAutoNow') {
        // 來自面板的立刻執行指令，強制執行(傳入 true)
        executeAutoRun(true);
        sendResponse({status: "ok"});
    }
});

// ==========================================
// 3. 抓取驗證碼圖片的核心邏輯
// ==========================================
function getCaptchaImage(callback) {
    const selectors =[
        '#yw0', '#vadimg', 'img[src^="data:image"]',
        'img[alt*="驗證碼"]', 'img[src*="VaildImage"]',
        'img[alt*="captcha" i]', 'img[alt*="验证码" i]',
        'img[class*="captcha" i]', 'img[class*="code" i]',
        '.captcha img', '.captcha-img', '#captcha',
        'img[src*="captcha" i]'
    ];

    let captchaImg = null;
    for (let selector of selectors) {
        captchaImg = document.querySelector(selector);
        if (captchaImg && captchaImg.offsetHeight > 0) break;
    }

    if (!captchaImg) {
        callback({error: '未找到驗證碼圖像'});
        return;
    }

    convertImageToBase64(captchaImg, (imageData) => {
        if (imageData) {
            callback({imageData: imageData});
        } else {
            callback({error: '圖片轉換 Base64 失敗'});
        }
    });
}

function convertImageToBase64(captchaImg, callback) {
    if (captchaImg.src !== captchaImg.dataset.lastGeneratedSrc) {
        captchaImg.dataset.originalSrc = captchaImg.src;
    }
    
    const imgSrc = captchaImg.dataset.originalSrc;
    const isBase64 = imgSrc.startsWith('data:image');

    const img = new Image();
    if (!isBase64) img.crossOrigin = 'anonymous'; 
    
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const base64Data = canvas.toDataURL('image/png');
        captchaImg.src = base64Data;
        captchaImg.dataset.lastGeneratedSrc = base64Data;
        
        callback(base64Data);
    };
    
    img.onerror = () => callback(null);
    
    if (isBase64) {
        img.src = imgSrc; 
    } else {
        const separator = imgSrc.includes('?') ? '&' : '?';
        img.src = imgSrc + separator + 't=' + new Date().getTime();
    }
}

// ==========================================
// ★ 模擬真人打字功能 (防偵測核心)
// ==========================================
async function simulateTyping(inputElement, text) {
    inputElement.value = '';
    for (let i = 0; i < text.length; i++) {
        inputElement.value += text[i];
        inputElement.dispatchEvent(new Event('input', { bubbles: true })); 
        inputElement.dispatchEvent(new Event('change', { bubbles: true })); 
        // 每個字中間隨機停頓 100 毫秒 ~ 300 毫秒
        await new Promise(r => setTimeout(r, Math.random() * 200 + 100));
    }
}

// ==========================================
// 4. 自動填入驗證碼的邏輯 (使用模擬打字)
// ==========================================
async function fillCaptchaInput(text, selector) {
    let inputField = null;
    if (selector) inputField = document.querySelector(selector);
    
    if (!inputField) {
        const defaultSelectors = [
            'input[name*="captcha" i]', 'input[name*="verify" i]',
            'input[id*="captcha" i]', 'input[id*="verify" i]',
            'input[placeholder*="验证码" i]', 'input[placeholder*="驗證碼" i]'
        ];
        for (let sel of defaultSelectors) {
            inputField = document.querySelector(sel);
            if (inputField) break;
        }
    }

    if (inputField) {
        await simulateTyping(inputField, text);
    }
}

// ==========================================
// 5. 手動選擇輸入框的滑鼠特效與點擊邏輯 (第二種選擇模式)
// ==========================================
document.addEventListener('mouseover', (e) => {
    if (!isSelecting) return;
    e.stopPropagation();
    e.target.style.outline = '2px solid red';
    e.target.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
});

document.addEventListener('mouseout', (e) => {
    if (!isSelecting) return;
    e.stopPropagation();
    e.target.style.outline = '';
    e.target.style.backgroundColor = '';
});

document.addEventListener('click', (e) => {
    if (!isSelecting) return;
    e.preventDefault();  
    e.stopPropagation();

    const target = e.target;
    target.style.outline = '';
    target.style.backgroundColor = '';
    isSelecting = false;
    document.body.style.cursor = 'default';

    let selector = '';
    if (target.id) selector = '#' + target.id;
    else if (target.name) selector = `input[name="${target.name}"]`;
    else if (target.className && typeof target.className === 'string') {
        selector = target.tagName.toLowerCase() + '.' + target.className.trim().split(/\s+/).join('.');
    } else selector = target.tagName.toLowerCase();

    chrome.storage.local.set({savedSelector: selector}, () => {
        alert('✅ 已成功選擇輸入框！\n標識符：' + selector);
    });
}, true); 


// ==========================================
// ★ 全自動核心執行函數 (加入 forceRun 參數)
// ==========================================
// forceRun 如果是 true，代表無視「全自動」有沒有打勾，強制執行
function executeAutoRun(forceRun = false) {
    chrome.storage.local.get(['autoRun', 'serverUrl', 'savedSelector'], (data) => {
        // 如果沒打勾全自動，且「不是」強制執行(例如按下F4)，就不執行
        if (!data.autoRun && !forceRun) return; 

        const apiUrl = (data.serverUrl || 'http://127.0.0.1:5000').replace(/\/+$/, '') + '/recognize';
        
        getCaptchaImage((response) => {
            if (response && response.imageData) {
                console.log('【驗證碼小助手】啟動識別任務，正在與伺服器連線...');
                fetch(apiUrl, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ image: response.imageData })
                })
                .then(res => res.json())
                .then(async resData => {
                    const text = resData.text || resData.result;
                    if (text) {
                        // 加入 await 等待模擬打字完成
                        await fillCaptchaInput(text, data.savedSelector);
                        console.log('【驗證碼小助手】識別與輸入完成：', text);
                    }
                })
                .catch(err => console.error('【驗證碼小助手】識別失敗：', err));
            }
        });
    });
}

// ==========================================
// 觸發時機設定
// ==========================================

// 觸發時機 1：網頁剛載入完畢時 (F5)
window.addEventListener('load', () => {
    // 稍微隨機延遲一下再啟動，更像人類
    setTimeout(() => executeAutoRun(false), Math.random() * 500 + 800); 
});

// 觸發時機 2：當使用者點擊網頁上的圖片時，延遲 1 秒自動重跑
document.addEventListener('click', (e) => {
    if (e.target.tagName.toLowerCase() === 'img') {
        chrome.storage.local.get(['autoRun'], (data) => {
            if (data.autoRun) {
                console.log('【驗證碼小助手】偵測到點擊圖片，1秒後自動重新識別...');
                setTimeout(() => executeAutoRun(false), 1000); 
            }
        });
    }
});

// ★ 新增觸發時機 3：按下 F4 快捷鍵強制重新識別
document.addEventListener('keydown', (e) => {
    if (e.key === 'F4') {
        e.preventDefault(); // 防止瀏覽器預設行為 (Chrome 按 F4 預設會跳到網址列)
        console.log('【驗證碼小助手】按下 F4 快捷鍵，強制重新抓取與識別！');
        executeAutoRun(true); // 傳入 true，強制幫你辨識並打字
    }
});

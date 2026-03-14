// ==========================================
// 1. 手動選擇輸入框的邏輯 (滑鼠移動會有紅框)
// ==========================================
function startSelectionMode() {
    // 建立一個半透明的遮罩層
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

    // 滑鼠移動時，畫紅色邊框
    const mouseMoveHandler = (e) => {
        // 先把遮罩層暫時隱藏，才抓得到底下的元素
        overlay.style.pointerEvents = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        overlay.style.pointerEvents = 'auto';

        if (target && target !== lastElement) {
            if (lastElement) {
                lastElement.style.outline = ''; // 恢復上一個元素的邊框
            }
            if (target.tagName.toLowerCase() === 'input') {
                target.style.outline = '3px solid red'; // 是輸入框就畫紅框
                lastElement = target;
            } else {
                lastElement = null;
            }
        }
    };

    // 滑鼠點擊時，儲存選擇的輸入框
    const clickHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (lastElement) {
            lastElement.style.outline = ''; // 移除紅框
            
            // 產生這個元素的 CSS Selector，並存起來
            const selector = generateSelector(lastElement);
            chrome.storage.local.set({ savedSelector: selector }, () => {
                alert('已成功选择输入框！');
            });
        }

        // 結束選擇模式，移除遮罩和監聽器
        document.body.removeChild(overlay);
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('click', clickHandler, true);
    };

    // 產生 CSS 選擇器的小工具
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
// 1. 全域變數：用來判斷現在是不是「選擇輸入框」模式
// ==========================================
let isSelecting = false;

// ==========================================
// 2. 接收從彈出視窗 (popup.js) 傳來的指令
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startSelecting') {
        // 啟動手動選擇輸入框的邏輯
        startSelectionMode();
        sendResponse({status: "ok"});
    } 
    else if (request.action === 'getCaptchaImage') {
        // 手動獲取圖片的邏輯
        getCaptchaImage(sendResponse);
        return true; // 保持非同步通道開啟
    } 
    else if (request.action === 'fillCaptcha') {
        // 手動填入驗證碼的邏輯
        fillCaptchaInput(request.text, request.selector);
        sendResponse({status: "ok"});
    }
});

// ==========================================
// 3. 抓取驗證碼圖片的核心邏輯
// ==========================================
function getCaptchaImage(callback) {
    // 常見的驗證碼圖片特徵 (包含您新增的 #yw0 和 Base64 格式)
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
        callback({error: '未找到验证码图像'});
        return;
    }

    // 找到圖片後，轉換為白底 Base64
    convertImageToBase64(captchaImg, (imageData) => {
        if (imageData) {
            callback({imageData: imageData});
        } else {
            callback({error: '圖片轉換 Base64 失敗'});
        }
    });
}

function convertImageToBase64(captchaImg, callback) {
    // 判斷網頁是否刷新了圖片，如果刷新了就更新記錄
    if (captchaImg.src !== captchaImg.dataset.lastGeneratedSrc) {
        captchaImg.dataset.originalSrc = captchaImg.src;
    }
    
    const imgSrc = captchaImg.dataset.originalSrc;
    const isBase64 = imgSrc.startsWith('data:image');

    const img = new Image();
    
    // 如果不是 Base64 才處理跨域
    if (!isBase64) {
        img.crossOrigin = 'anonymous'; 
    }
    
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // 填上白色背景，防止透明背景變黑
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const base64Data = canvas.toDataURL('image/png');
        
        // 替換網頁上的圖片並記錄，防止重複點擊出錯
        captchaImg.src = base64Data;
        captchaImg.dataset.lastGeneratedSrc = base64Data;
        
        callback(base64Data);
    };
    
    img.onerror = () => {
        callback(null);
    };
    
    // 如果是實體網址就加上時間戳防快取，如果是 Base64 就直接讀取
    if (isBase64) {
        img.src = imgSrc; 
    } else {
        const separator = imgSrc.includes('?') ? '&' : '?';
        img.src = imgSrc + separator + 't=' + new Date().getTime();
    }
}

// ==========================================
// 4. 自動填入驗證碼的邏輯
// ==========================================
function fillCaptchaInput(text, selector) {
    let inputField = null;
    
    // 優先使用我們手動選擇儲存的輸入框
    if (selector) {
        inputField = document.querySelector(selector);
    }
    
    // 如果沒選過，就用猜的（找網頁中常見的驗證碼輸入框）
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

    // 填入文字並觸發事件，讓網頁 (如 Vue/React) 知道我們填了字
    if (inputField) {
        inputField.value = text;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// ==========================================
// 5. 手動選擇輸入框的滑鼠特效與點擊邏輯
// ==========================================

// 滑鼠移過去：加上紅框與紅底
document.addEventListener('mouseover', (e) => {
    if (!isSelecting) return;
    e.stopPropagation();
    e.target.style.outline = '2px solid red';
    e.target.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
});

// 滑鼠移走：取消紅框與紅底
document.addEventListener('mouseout', (e) => {
    if (!isSelecting) return;
    e.stopPropagation();
    e.target.style.outline = '';
    e.target.style.backgroundColor = '';
});

// 滑鼠點擊：確認選擇這個輸入框
document.addEventListener('click', (e) => {
    if (!isSelecting) return;
    e.preventDefault();  // 阻止網頁原本的點擊反應
    e.stopPropagation();

    const target = e.target;
    // 清除特效，恢復正常狀態
    target.style.outline = '';
    target.style.backgroundColor = '';
    isSelecting = false;
    document.body.style.cursor = 'default';

    // 產生這個輸入框的唯一識別碼 (Selector)
    let selector = '';
    if (target.id) {
        selector = '#' + target.id;
    } else if (target.name) {
        selector = `input[name="${target.name}"]`;
    } else if (target.className && typeof target.className === 'string') {
        selector = target.tagName.toLowerCase() + '.' + target.className.trim().split(/\s+/).join('.');
    } else {
        selector = target.tagName.toLowerCase();
    }

    // 存入 Chrome 記憶體，並通知使用者
    chrome.storage.local.set({savedSelector: selector}, () => {
        alert('✅ 已成功选择输入框！\n标识符：' + selector + '\n\n现在您可以再次打开扩充功能进行识别了。');
    });
}, true); // true 代表在「捕獲階段」攔截點擊，確保最高優先級

// ==========================================
// 全自動核心執行函數
// ==========================================
function executeAutoRun() {
    chrome.storage.local.get(['autoRun', 'serverUrl', 'savedSelector'], (data) => {
        if (!data.autoRun) return; // 如果沒打勾全自動，就不執行

        const apiUrl = (data.serverUrl || 'http://127.0.0.1:5000').replace(/\/+$/, '') + '/recognize';
        
        getCaptchaImage((response) => {
            if (response && response.imageData) {
                console.log('【验证码小助手】全自动模式启动，正在识别...');
                fetch(apiUrl, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ image: response.imageData })
                })
                .then(res => res.json())
                .then(resData => {
                    const text = resData.text || resData.result;
                    if (text) {
                        fillCaptchaInput(text, data.savedSelector);
                        console.log('【验证码小助手】全自动识别完成：', text);
                    }
                })
                .catch(err => console.error('【验证码小助手】识别失败：', err));
            }
        });
    });
}

// 觸發時機 1：網頁剛載入完畢時 (F5)
window.addEventListener('load', () => {
    setTimeout(executeAutoRun, 1000); 
});

// 觸發時機 2：接收來自 popup.js 的「立刻執行」指令 (打勾瞬間)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ... 這裡保留你原本其他的監聽器 (startSelecting, getCaptchaImage 等) ...
    
    if (request.action === 'runAutoNow') {
        executeAutoRun();
        sendResponse({status: "ok"});
    }
});

// 觸發時機 3：當使用者點擊網頁上的圖片 (通常是為了換一張驗證碼) 時，延遲 1 秒自動重跑
document.addEventListener('click', (e) => {
    if (e.target.tagName.toLowerCase() === 'img') {
        chrome.storage.local.get(['autoRun'], (data) => {
            if (data.autoRun) {
                console.log('【验证码小助手】侦测到点击图片，可能在更换验证码，1秒后自动重新识别...');
                setTimeout(executeAutoRun, 1000); // 等待新圖片載入後再辨識
            }
        });
    }
});

// ==========================================
// 全域變數與防護鎖 (🌟 這次修復的核心)
// ==========================================
let isSelecting = false;
let isExecuting = false; // 防暴走鎖：判斷目前是否正在執行辨識中
let retryCount = 0;      // 重試計數器
const MAX_RETRIES = 3;   // 最多自動換圖 3 次

// ==========================================
// 1. 手動選擇輸入框的邏輯
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
        fillCaptchaInput(request.text, request.selector, request.typingMode);
        sendResponse({status: "ok"});
    }
    else if (request.action === 'runAutoNow') {
        retryCount = 0; // 手動觸發時歸零重試次數
        executeAutoRun(true);
        sendResponse({status: "ok"});
    }
});

// ==========================================
// 3. 抓取驗證碼圖片的核心邏輯 (包含加強版特徵)
// ==========================================
function getCaptchaImage(callback) {
    const selectors =[
        '#yw0', '#vadimg', '#ValidCode', '#imgCaptcha', '#captcha_image',
        'img[src^="data:image"]',
        'img[alt*="驗證碼"]', 'img[alt*="验证码" i]', 'img[alt*="captcha" i]',
        'img[src*="VaildImage" i]', 'img[src*="captcha" i]', 'img[src*="Verify" i]',
        'img[src*="Validate" i]', 'img[src*="Code.aspx" i]', 'img[src*="CreateCode" i]',
        'img[class*="captcha" i]', 'img[class*="code" i]', 'img[id*="captcha" i]',
        '.captcha img', '.captcha-img', '#captcha'
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
// ★ 模式 1：模擬真人逐字打字
// ==========================================
async function simulateTyping(inputElement, text) {
    inputElement.value = '';
    for (let i = 0; i < text.length; i++) {
        inputElement.value += text[i];
        inputElement.dispatchEvent(new Event('input', { bubbles: true })); 
        inputElement.dispatchEvent(new Event('change', { bubbles: true })); 
        await new Promise(r => setTimeout(r, Math.random() * 200 + 100));
    }
}

// ==========================================
// ★ 模式 2：瞬間帶入
// ==========================================
function instantInput(inputElement, text) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputElement, text);
    } else {
        inputElement.value = text;
    }
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
}

// ==========================================
// 4. 自動填入驗證碼的邏輯
// ==========================================
async function fillCaptchaInput(text, selector, typingMode = 'simulate') {
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
        if (typingMode === 'simulate') {
            await simulateTyping(inputField, text);
        } else {
            instantInput(inputField, text);
        }
    }
}

// ==========================================
// ★ 神級外掛：直接從語音按鈕網址偷取驗證碼答案
// ==========================================
function checkAudioCaptchaBypass() {
    const audioBtn = document.querySelector('#playcaptcha, a[href*="translate_tts"]');
    if (audioBtn && audioBtn.href) {
        try {
            const url = new URL(audioBtn.href);
            let qParam = url.searchParams.get('q'); 
            if (qParam) {
                return qParam.replace(/["']/g, ''); 
            }
        } catch(e) {}
    }
    return null; 
}

// ==========================================
// 5. 手動選擇輸入框的滑鼠特效與點擊邏輯
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
// ★ 全自動核心執行函數 (加入安全鎖定機制)
// ==========================================
function executeAutoRun(forceRun = false) {
    // 🌟 防護鎖：如果已經在執行中，就直接擋掉，避免重複發送請求！
    if (isExecuting) return; 

    chrome.storage.local.get(['autoRun', 'serverUrl', 'savedSelector', 'typingMode', 'captchaLength'], async (data) => {
        if (!data.autoRun && !forceRun) return; 
        
        isExecuting = true; // 鎖上門，不讓其他人進來

        const typingMode = data.typingMode || 'simulate';
        const expectedLength = data.captchaLength ? parseInt(data.captchaLength) : null;

        let bypassAnswer = checkAudioCaptchaBypass();
        if (bypassAnswer) {
            if (expectedLength && !isNaN(expectedLength)) {
                bypassAnswer = bypassAnswer.substring(0, expectedLength);
            }
            await fillCaptchaInput(bypassAnswer, data.savedSelector, typingMode);
            isExecuting = false; // 開鎖
            return; 
        }

        const apiUrl = (data.serverUrl || 'http://127.0.0.1:5000').replace(/\/+$/, '') + '/recognize';
        
        getCaptchaImage((response) => {
            if (response && response.imageData) {
                console.log('【Captcha-Sniper】🚀 傳送圖片至伺服器...');
                fetch(apiUrl, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        image: response.imageData,
                        length: expectedLength
                    })
                })
                .then(res => res.json())
                .then(async resData => {
                    const text = resData.text || resData.result;
                    if (text) {
                        // 🌟 檢查長度是否不足
                        if (expectedLength && text.length < expectedLength) {
                            console.log(`【Captcha-Sniper】⚠️ 辨識長度不足: ${text.length} < ${expectedLength}`);
                            
                            // 🌟 防暴走機制：最多只重試 3 次
                            if (retryCount >= MAX_RETRIES) {
                                console.log('【Captcha-Sniper】❌ 重試達上限，放棄自動換圖。請手動點擊圖片。');
                                retryCount = 0;
                                isExecuting = false; // 開鎖
                                return;
                            }

                            retryCount++;
                            console.log(`【Captcha-Sniper】🔄 第 ${retryCount} 次點擊換圖...`);
                            
                            const captchaImg = document.querySelector('img[src*="captcha" i], #yw0, .captcha img');
                            if (captchaImg) {
                                captchaImg.click(); // 模擬點擊
                            }
                            
                            // 等待 1.5 秒讓新圖片載入，然後再試一次
                            setTimeout(() => {
                                isExecuting = false; // 先開鎖才能重新執行
                                executeAutoRun(forceRun);
                            }, 1500);
                            
                            return; 
                        }

                        // 長度正確，成功填入！
                        retryCount = 0; // 成功就歸零
                        await fillCaptchaInput(text, data.savedSelector, typingMode);
                        console.log('【Captcha-Sniper】✅ 輸入完成：', text);
                        isExecuting = false; // 開鎖
                    } else {
                        isExecuting = false; // 開鎖
                    }
                })
                .catch(err => {
                    console.error('【Captcha-Sniper】❌ 伺服器錯誤：', err);
                    isExecuting = false; // 開鎖
                });
            } else {
                console.error('【Captcha-Sniper】找不到驗證碼圖片');
                isExecuting = false; // 開鎖
            }
        });
    });
}

// ==========================================
// 觸發時機設定 (🌟 更新：智能蹲點，專治動態載入網頁)
// ==========================================
// 1. 網頁剛載入時的「智能蹲點」尋找機制
function startSmartObserver() {
    let attempts = 0;
    const maxAttempts = 5; // 最多蹲點等 5 秒
    console.log('【Captcha-Sniper】啟動智能蹲點，等待驗證碼圖片出現...');
    const checkInterval = setInterval(() => {
        attempts++;
        
        // 檢查網頁上有沒有出現任何像是驗證碼的圖片
        const imgEl = document.querySelector('img[src*="captcha" i], #yw0, img[alt*="驗證" i], img[src*="Code" i]');
        
        if (imgEl && imgEl.offsetHeight > 0) {
            console.log(`【Captcha-Sniper】👀 蹲點第 ${attempts} 秒：發現驗證碼圖片！準備自動執行...`);
            clearInterval(checkInterval); // 找到就停止計時器
            
            // 找到圖片後，稍微延遲 0.8 秒，確保圖片已經「完全顯示(渲染)」出來再抓
            setTimeout(() => executeAutoRun(false), 800); 
            
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval); // 等了 5 秒都沒找到，收工不找了
            console.log('【Captcha-Sniper】⏳ 蹲點 5 秒結束：此頁面似乎沒有驗證碼。');
        }
    }, 1000); // 每 1 秒檢查一次
}
// 根據網頁載入狀態，決定何時啟動蹲點
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSmartObserver);
} else {
    startSmartObserver();
}
// 2. 🌟 修復關鍵：只允許「真正的滑鼠點擊」觸發重跑
document.addEventListener('click', (e) => {
    // e.isTrusted 為 true 代表是真人滑鼠點擊；false 代表是程式 (click()) 觸發的
    if (!e.isTrusted) return; 
    // 放寬判定：點擊的元素本身是圖片，或者它被包在圖片/超連結裡面
    const target = e.target;
    const isImg = target.tagName.toLowerCase() === 'img' || target.closest('img');
    if (isImg) {
        chrome.storage.local.get(['autoRun'], (data) => {
            if (data.autoRun) {
                console.log('【Captcha-Sniper】🖱️ 偵測到手動點擊圖片，等待新圖片載入後重新識別...');
                
                // ★ 核心修復 1：強制解除防護鎖！(避免上一次辨識卡住，導致這次不跑)
                isExecuting = false; 
                retryCount = 0; 
                
                // ★ 核心修復 2：傳入 true 強制觸發，延遲 1.8 秒確保網頁 AJAX 完全把新圖片載入
                setTimeout(() => executeAutoRun(true), 1800); 
            }
        });
    }
}, true); // ★ 核心修復 3：加上 true (Capture Phase 捕獲階段)，無視網頁前端框架的 stopPropagation 阻擋！

// 3. 快捷鍵強制觸發
document.addEventListener('keydown', (e) => {
    if (e.key === 'F4') {
        e.preventDefault(); 
        console.log('【Captcha-Sniper】按下 F4 快捷鍵，強制重跑！');
        retryCount = 0; // 手動快捷鍵歸零
        executeAutoRun(true); 
    }
});

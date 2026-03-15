# app_en.py - 【純英文版】(V40.1 除蟲修復版：修正 Pillow 奇偶數 Bug)
from flask import Flask, request, jsonify
from flask_cors import CORS
import ddddocr
import base64
from io import BytesIO
from PIL import Image, ImageOps, ImageStat, ImageFilter, ImageChops

app = Flask(__name__)
CORS(app)

DEBUG_MODE = True  

ocr = ddddocr.DdddOcr(show_ad=False)
ocr.set_ranges("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "Captcha Sniper Server is running!"}), 200

# ==========================================
# 🧅 核心預處理
# ==========================================
def standardize_captcha_image(img):
    img = img.convert('L')
    w, h = img.size
    edges = []
    for x in range(w): edges.extend([img.getpixel((x, 0)), img.getpixel((x, h-1))])
    for y in range(h): edges.extend([img.getpixel((0, y)), img.getpixel((w-1, y))])
    
    outer_bg = max(set(edges), key=edges.count)
    mask = img.point(lambda p: 255 if abs(p - outer_bg) > 20 else 0)
    bbox = mask.getbbox()
    if bbox: img = img.crop(bbox)
        
    w, h = img.size
    inner_edges = []
    for x in range(w): inner_edges.extend([img.getpixel((x, 0)), img.getpixel((x, h-1))])
    for y in range(h): inner_edges.extend([img.getpixel((0, y)), img.getpixel((w-1, y))])
    
    if inner_edges:
        inner_bg = max(set(inner_edges), key=inner_edges.count)
        if inner_bg < 127: img = ImageOps.invert(img)
    return img

# ==========================================
# 🛡️ 安全派武器 (票值 2 分：專治帶圈字母 e, o, q 與普通沾黏)
# ==========================================
def strategy_safe_comb(zoom=2.5, shave=0, max_filter=0, w_mult=1.0, h_mult=1.0):
    def strategy(img):
        resample = getattr(Image, 'Resampling', Image).LANCZOS
        img = img.point(lambda p: 255 if p > 140 else 0)
        img = img.resize((int(img.width * zoom), int(img.height * zoom)), resample)
        img = img.point(lambda p: 255 if p > 127 else 0)

        # 🌟 Pillow 濾鏡參數必須為奇數 (3, 5, 7...)
        if max_filter > 0:
            img = img.filter(ImageFilter.MaxFilter(max_filter))

        # 左右碎骨橫梳
        if shave > 0:
            for _ in range(shave):
                left = Image.new("L", img.size, 255)
                left.paste(img, (-1, 0))
                right = Image.new("L", img.size, 255)
                right.paste(img, (1, 0))
                img = ImageChops.lighter(img, ImageChops.lighter(left, right))

        bbox = ImageOps.invert(img).getbbox()
        if bbox: img = img.crop(bbox)
        
        # h_mult 抽高魔法，撐開 e, o, q 被擠壓的白洞
        h = int(42 * h_mult)
        w = max(int(img.width * (h / img.height) * w_mult), 1)
        img = img.resize((w, h), resample)
        return ImageOps.expand(img, border=20, fill='white')
    return strategy

# ==========================================
# ⚔️ 暴力派武器 (票值 1 分：全方位瘦子雷達)
# ==========================================
def strategy_aggro_guillotine(zoom=3.0, proportions=(1,1,1,1), gap=5):
    def strategy(img):
        resample = getattr(Image, 'Resampling', Image).LANCZOS
        img = img.resize((int(img.width * zoom), int(img.height * zoom)), resample)
        img = img.point(lambda p: 255 if p > 127 else 0)
        
        bbox = ImageOps.invert(img).getbbox()
        if bbox:
            left, top, right, bottom = bbox
            W, H = img.size
            pixels = img.load()
            total_width = right - left
            total_prop = sum(proportions)
            current_prop = 0
            
            for p in proportions[:-1]: 
                current_prop += p
                ratio = current_prop / total_prop
                cut_x = left + int(total_width * ratio)
                for gx in range(gap):
                    cx = cut_x + gx - gap//2
                    if 0 <= cx < W:
                        for y in range(top, bottom):
                            pixels[cx, y] = 255

        bbox = ImageOps.invert(img).getbbox()
        if bbox: img = img.crop(bbox)
        h = 42
        w = max(int(img.width * (h / img.height)), 1)
        img = img.resize((w, h), resample)
        return ImageOps.expand(img, border=20, fill='white')
    return strategy

# ==========================================

@app.route('/recognize', methods=['POST'])
def recognize_captcha():
    try:
        data = request.json
        image_data = data.get('image')
        expected_length = data.get('length') 
        
        if not image_data: return jsonify({'success': False, 'error': '未收到圖片'}), 400
        if image_data.startswith('data:image'): image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        original_image = Image.open(BytesIO(image_bytes))

        if original_image.mode == 'RGBA':
            bg = Image.new("RGB", original_image.size, (255, 255, 255))
            bg.paste(original_image, mask=original_image.split()[3]) 
            original_image = bg
        else:
            original_image = original_image.convert('RGB')

        base_img = standardize_captcha_image(original_image)

        # 🏃‍♂️ V40.1 武器庫 (已修復 Pillow 奇數尺寸問題)
        strategies = [
            # --- 🛡️ 安全派 (票值 2 分) ---
            ("SAFE_標準瘦身", strategy_safe_comb(max_filter=3, shave=0)),
            ("SAFE_開洞抽高", strategy_safe_comb(max_filter=5, shave=0, h_mult=1.4)), # 🐛 已修正：4 改為 5 (奇數)
            ("SAFE_拉寬破冰", strategy_safe_comb(max_filter=3, shave=2, w_mult=1.4)), 
            ("SAFE_純粹橫梳", strategy_safe_comb(max_filter=0, shave=5)),             # 🐛 已修正：移除可能的 1，改為 0 配強力梳理

            # --- ⚔️ 暴力派 (票值 1 分：全方位瘦子雷達矩陣) ---
            ("AGGRO_均分",     strategy_aggro_guillotine(proportions=(1, 1, 1, 1))),
            ("AGGRO_瘦在第一", strategy_aggro_guillotine(proportions=(0.6, 1.2, 1.2, 1.2))), 
            ("AGGRO_瘦在第二", strategy_aggro_guillotine(proportions=(1.2, 0.5, 1.2, 1.2))), 
            ("AGGRO_瘦在第三", strategy_aggro_guillotine(proportions=(1.2, 1.2, 0.5, 1.2))), 
            ("AGGRO_瘦在第四", strategy_aggro_guillotine(proportions=(1.2, 1.2, 1.2, 0.6))), 
            ("AGGRO_大夾心瘦", strategy_aggro_guillotine(proportions=(1.5, 1.1, 0.5, 1.4)))  
        ]
        
        print(f"\n🎯 開始識別，預期長度：{expected_length or '未指定'}")
        
        vote_box = {}       
        image_box = {}      
        longest_text = ""
        longest_image = None

        for strategy_name, strategy_func in strategies:
            processed_img = strategy_func(base_img.copy())
            processed_img = processed_img.convert('RGB')
            
            with BytesIO() as output_buffer:
                processed_img.save(output_buffer, format="PNG")
                final_image_bytes = output_buffer.getvalue()

            current_text = ocr.classification(final_image_bytes)
            print(f"   ➔ [{strategy_name}] 辨識結果: '{current_text}' (長度 {len(current_text)})")

            if len(current_text) > len(longest_text):
                longest_text = current_text
                longest_image = processed_img

            # 收集有效選票並加權 (SAFE=2, AGGRO=1)
            if expected_length and len(current_text) == expected_length:
                weight = 2 if strategy_name.startswith("SAFE") else 1
                
                if current_text in vote_box:
                    vote_box[current_text] += weight
                else:
                    vote_box[current_text] = weight
                    image_box[current_text] = processed_img

        # 🏆 V40 加權計票系統
        best_result = ""
        best_image = None
        
        if expected_length and vote_box:
            best_result = max(vote_box, key=vote_box.get)
            best_image = image_box[best_result]
            print(f"\n   🗳️ 權重投票結果：{vote_box}")
            print(f"   👑 最高積分勝出：'{best_result}' (積分: {vote_box[best_result]})")
        else:
            best_result = longest_text
            best_image = longest_image
            if expected_length and len(best_result) > expected_length:
                best_result = best_result[:expected_length]
                print(f"\n✂️ 長度過長，強制裁切為：[{best_result}]")

        if DEBUG_MODE and best_image:
            best_image.save("debug_winner_strategy.png")

        print(f"🏆 最終輸出給前端：[{best_result}]\n")
        return jsonify({'success': True, 'text': best_result})

    except Exception as e:
        print(f"❌ 發生錯誤：{str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("🚀 【純英文版】(V40.1 除蟲修復版) 伺服器啟動中...")
    app.run(host='0.0.0.0', port=5000, debug=False)

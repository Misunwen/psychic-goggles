# app_num_en.py - 【大寫英文＋數字版】(V2.1 點陣專武：強制大寫標籤)
from flask import Flask, request, jsonify
from flask_cors import CORS
import ddddocr
import base64
from io import BytesIO
from PIL import Image, ImageOps, ImageFilter

app = Flask(__name__)
CORS(app)

DEBUG_MODE = True  

# 🌟 絕對關鍵：字典強制鎖定「數字 + 大寫字母」
ocr = ddddocr.DdddOcr(show_ad=False)
ocr.set_ranges("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")

@app.route('/', methods=['GET'])
def health_check():
    # 🌟 標籤 1：前端檢查時顯示的大寫 API 標籤
    return jsonify({"status": "ok", "message": "UPPER-EN + NUM Captcha Server is running!"}), 200

# ==========================================
# ⚔️ 兵工廠：點陣字體提取與防閉合策略
# ==========================================
def create_dot_matrix_strategy(threshold=150, max_filter=0, blur=False):
    def strategy(img):
        img = img.point(lambda p: 255 if p > threshold else 0)
        
        resample = getattr(Image, 'Resampling', Image).LANCZOS
        img = img.resize((int(img.width * 2.5), int(img.height * 2.5)), resample)
        
        img = img.point(lambda p: 255 if p > 130 else 0)

        if max_filter > 0:
            img = img.filter(ImageFilter.MaxFilter(max_filter))

        if blur:
            img = img.filter(ImageFilter.SMOOTH_MORE)
            img = img.point(lambda p: 255 if p > 150 else 0)

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

        base_img = original_image.convert('L')

        strategies = [
            ("1. 標準提取 (閥值140)", create_dot_matrix_strategy(threshold=140)),
            ("2. 高壓提取 (防紅字消失)", create_dot_matrix_strategy(threshold=160)), 
            ("3. 輕度撬開 (防3變8)", create_dot_matrix_strategy(threshold=140, max_filter=3)),
            ("4. 重度撬開", create_dot_matrix_strategy(threshold=140, max_filter=5)),
            ("5. 平滑化連字", create_dot_matrix_strategy(threshold=140, blur=True)), 
            ("6. 高壓平滑化", create_dot_matrix_strategy(threshold=160, blur=True))
        ]
        
        # 🌟 標籤 2：終端機開始辨識的標籤
        print(f"\n🎯 開始識別 (大寫英數模式)，預期長度：{expected_length or '未指定'}")
        
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
            # 🌟 雙重保險：就算 AI 腦霧，也強制轉大寫
            current_text = current_text.upper() 
            
            print(f"   ➔ [{strategy_name}] 辨識結果: '{current_text}' (長度 {len(current_text)})")

            if len(current_text) > len(longest_text):
                longest_text = current_text
                longest_image = processed_img

            if expected_length and len(current_text) == expected_length:
                if current_text in vote_box:
                    vote_box[current_text] += 1
                else:
                    vote_box[current_text] = 1
                    image_box[current_text] = processed_img

        best_result = ""
        best_image = None
        
        if expected_length and vote_box:
            best_result = max(vote_box, key=vote_box.get)
            best_image = image_box[best_result]
            print(f"\n   🗳️ 投票箱結果：{vote_box}")
            print(f"   👑 最高票勝出：'{best_result}' (得票數: {vote_box[best_result]})")
        else:
            best_result = longest_text
            best_image = longest_image
            if expected_length and len(best_result) > expected_length:
                best_result = best_result[:expected_length]
                print(f"\n✂️ 長度過長，強制裁切為：[{best_result}]")

        if DEBUG_MODE and best_image:
            best_image.save("debug_num_en_winner.png")

        print(f"🏆 最終輸出給前端：[{best_result}]\n")
        return jsonify({'success': True, 'text': best_result})

    except Exception as e:
        print(f"❌ 發生錯誤：{str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # 🌟 標籤 3：伺服器啟動時的綠色標籤
    print("🚀 【大寫英文＋數字版】(V2.1 點陣專武) 伺服器啟動中...")
    app.run(host='0.0.0.0', port=5000, debug=False)

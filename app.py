# 后端服务 - app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import ddddocr
import base64
from io import BytesIO
from PIL import Image

app = Flask(__name__)
CORS(app)

# 初始化识别器
ocr = ddddocr.DdddOcr()

@app.route('/recognize', methods=['POST'])
def recognize_captcha():
    try:
        data = request.json
        image_data = data.get('image')
        
        if not image_data:
            return jsonify({'error': '未收到图像数据'}), 400
        
        # 处理 base64 图像
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        
        # 识别验证码
        result = ocr.classification(image)
        
        return jsonify({
            'success': True,
            'text': result
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
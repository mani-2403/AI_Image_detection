import os
import uuid
import time
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from transformers import pipeline
from PIL import Image
import serial
from twilio.rest import Client

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ================= TWILIO CONFIG =================
TWILIO_ACCOUNT_SID = "TWILIO_ACCOUNT_SID"
TWILIO_AUTH_TOKEN  = "TWILIO_AUTH_TOKEN"
TWILIO_FROM_NUMBER = "TWILIO_FROM_NUMBER"
YOUR_PHONE_NUMBER  = "YOUR_PHONE_NUMBER"

try:
    twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
except Exception as e:
    print(f"Twilio setup error: {e}")
    twilio_client = None

def make_twilio_call():
    if twilio_client:
        try:
            call = twilio_client.calls.create(
                twiml='<Response><Say>Security Alert: A fake image has been detected by the system. Please verify the dashboard.</Say></Response>',
                to=YOUR_PHONE_NUMBER,
                from_=TWILIO_FROM_NUMBER
            )
            print(f"Twilio Call Initiated: {call.sid}")
            return True
        except Exception as e:
            print(f"Error making Twilio call: {e}")
    return False

# ================= AI MODEL =================
print("Loading AI model...")
try:
    image_detector = pipeline("image-classification", model="umm-maybe/AI-image-detector")
    print("Model loaded successfully.")
except Exception as e:
    print(f"Error loading model: {e}")
    image_detector = None

# ================= SERIAL CONNECTION =================
ARDUINO_PORT = 'COM5'
BAUD_RATE = 9600
arduino = None

def connect_arduino():
    global arduino
    try:
        arduino = serial.Serial(ARDUINO_PORT, BAUD_RATE, timeout=1)
        time.sleep(2) # Give Arduino time to reset
        print(f"Arduino Connected on {ARDUINO_PORT}")
    except serial.SerialException as e:
        print(f"Warning: Arduino not connected on {ARDUINO_PORT}. {e}")
        arduino = None

connect_arduino()

def send_to_arduino(message):
    if arduino and arduino.is_open:
        try:
            arduino.write(f"{message}\n".encode('utf-8'))
            print(f"Sent to Arduino: {message}")
        except Exception as e:
            print(f"Error sending to Arduino: {e}")

# In-memory database
history = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/status')
def status():
    return jsonify({
        "arduino_connected": arduino is not None and arduino.is_open,
        "model_loaded": image_detector is not None
    })

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return jsonify({"error": "No image part"}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)

        # Notify Arduino
        send_to_arduino("PROCESSING")

        if not image_detector:
            return jsonify({"error": "AI Model not loaded properly."}), 500

        try:
            img = Image.open(filepath).convert('RGB')
            results = image_detector(img)
            
            # Find the score for 'artificial'
            artificial_score = 0.0
            for res in results:
                if res['label'].lower() == 'artificial':
                    artificial_score = res['score']
            
            # If score > 0.5 -> FAKE, Else -> REAL
            is_fake = artificial_score > 0.5
            final_label = "FAKE" if is_fake else "REAL"
            confidence = artificial_score * 100 if is_fake else (1 - artificial_score) * 100

            if final_label == "REAL":
                send_to_arduino(f"REAL,{confidence:.2f}")
            else:
                send_to_arduino(f"FAKE,{confidence:.2f}")

            record = {
                "id": str(uuid.uuid4()),
                "filename": unique_filename,
                "label": final_label,
                "confidence": confidence,
                "artificial_score": artificial_score * 100,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            history.insert(0, record)

            return jsonify(record)

        except Exception as e:
            print(f"Error processing image: {e}")
            return jsonify({"error": str(e)}), 500

@app.route('/history')
def get_history():
    return jsonify(history)

@app.route('/trigger_call', methods=['POST'])
def trigger_call():
    success = make_twilio_call()
    return jsonify({"success": success})

if __name__ == '__main__':
    app.run(debug=True, port=5000)

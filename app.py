from flask import Flask, request, jsonify
from flask_cors import CORS
import os, time, base64, uuid
from openai import OpenAI
from dotenv import load_dotenv
from gtts import gTTS
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = Flask(__name__)
CORS(app,
     origins=["http://localhost:3000"],
     allow_headers=["Content-Type", "X-Session-ID"],
     expose_headers=["X-Session-ID"]
)
SESSIONS = {}

#SESSION 
def get_session():
    sid = request.headers.get("X-Session-ID")
    if not sid or sid not in SESSIONS:
        sid = str(uuid.uuid4())
        SESSIONS[sid] = {"history":[], "issue":None}
    return sid, SESSIONS[sid]

#LANGUAGE
def detect_language(text):
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":f"Detect language of this: {text}. Reply only language name."}],
        temperature=0
    )
    return resp.choices[0].message.content.strip()

def translate(text, lang):
    lang_names = {
        "te": "Telugu",
        "hi": "Hindi",
        "en": "English"
    }

    target = lang_names.get(lang, "English")
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role":"user",
            "content":f"Translate this into natural {target}. Only give the translated sentence. No explanation:\n{text}"
        }],
        temperature=0
    )
    return resp.choices[0].message.content.strip()

#AI MEDICAL DETECTOR

def is_medical(text):
    prompt = f"""
Is this medically related?
Includes:
Symptoms
Body discomfort
Illness
Skincare / dermatology
Text: "{text}"
Reply only YES or NO
"""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0
    )
    return resp.choices[0].message.content.strip() == "YES"

#SEVERITY 
def severity_ai(text):
    prompt = f"""
Classify symptom severity medically.
Rules:
Chest pain = SEVERE unless clearly mild
Breathing issues = SEVERE
Bleeding = SEVERE
Headache = usually MILD unless extreme
Text: "{text}"
Reply:
MILD
MODERATE
SEVERE
NONE
"""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0
    )
    return resp.choices[0].message.content.strip()

#GPT RESPONSE 

def generate_reply(history, issue, user):
    context = "\n".join([m["role"] + ": " + m["eng"] for m in history[-10:]])

    system_prompt = f"""
You are HealthMate, a caring medical assistant.
Conversation:
{context}
Current issue: {issue}
Rules:
- Warm
- Short
- Natural
- No lists
- No emojis
"""
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role":"system","content":system_prompt},
            {"role":"user","content":user}
        ],
        temperature=0.3
    )
    return resp.choices[0].message.content.strip()

#CHAT 
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    msg = data.get("message","")
    sid, state = get_session()
    history = state["history"]
    lang = detect_language(msg)
    greeting = msg.lower().strip() in ["hi","hello","hey"]
    has_context = state["issue"] is not None
    if not greeting and not has_context:
        if not is_medical(msg):
            fallback = "I am a medical assistant and can only help with medical or health-related queries."
            fallback = translate(fallback, lang)
            return jsonify({
                "reply": fallback,
                "severity": None,
                "sessionId": sid
            })
    severity = None
    sev = severity_ai(msg)

    if sev != "NONE":
        severity = sev
        state["issue"] = msg
    reply = generate_reply(history, state["issue"], msg)
    history.append({"role":"User","eng":msg})
    history.append({"role":"Assistant","eng":reply})

    return jsonify({
        "reply": reply,
        "severity": severity,
        "sessionId": sid
    })

#IMAGE 
@app.route("/api/image", methods=["POST"])
def image_chat():
    file = request.files["image"]
    question = request.form.get("question","")
    selected_lang = request.form.get("lang","auto")
    sid, state = get_session()
    history = state["history"]
    img_b64 = base64.b64encode(file.read()).decode("utf-8")
    lang_map = {
        "Telugu": "te",
        "Hindi": "hi",
        "English": "en",
        "te": "te",
        "hi": "hi",
        "en": "en"
    }
    if question.strip() and question.strip() != "[image]":
        lang_code = detect_language(question)
    else:
        lang_code = lang_map.get(selected_lang, "en")

    system_prompt = """
You are HealthMate, a caring medical assistant.
Rules:
- Speak naturally
- Short sentences
- No bullet points
- No lists
- No markdown
- No headings
- No emojis
- Give simple medical explanation and gentle advice
"""
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role":"system","content":system_prompt},
            {"role":"user","content":[
                {"type":"text","text":f"The user sent an image. Question: {question}"},
                {"type":"image_url","image_url":{"url":f"data:image/jpeg;base64,{img_b64}"}}
            ]}
        ],
        temperature=0.3
    )

    reply = resp.choices[0].message.content.strip()
    if lang_code != "en":
        reply = translate(reply, lang_code)
    state["issue"] = "image_related"
    history.append({"role":"User","eng":question or "[image]"})
    history.append({"role":"Assistant","eng":reply})
    return jsonify({
        "reply": reply,
        "severity": None,
        "sessionId": sid
    })

#TTS 
@app.route("/api/tts", methods=["POST"])
def tts():
    data = request.get_json()
    text = data.get("text")
    lang = data.get("lang", "en")
    filename = f"tts_{int(time.time())}.mp3"
    path = os.path.join("static", filename)
    tts = gTTS(text=text, lang=lang)
    tts.save(path)
    return jsonify({"audio_url": f"/static/{filename}"})

@app.route("/")
def home():
    return "HealthMate running."
if __name__ == "__main__":
    app.run(debug=True)  
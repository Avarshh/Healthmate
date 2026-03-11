# AI HealthMate

AI HealthMate is a web-based medical assistant designed to provide safe early health guidance through conversational interaction. The system allows users to describe symptoms using text or images and receive contextual responses in multiple languages.

## Features

- Multilingual interaction (English, Hindi, Telugu)
- Context-aware multi-turn conversation
- Image-based symptom explanation
- Severity classification (mild, moderate, severe)
- Optional text-to-speech response
- Web-based chat interface

## Technologies Used
Frontend:
- React.js
Backend:
- Flask (Python)
AI Components:
- GPT-4o model via OpenAI API
- Multilingual translation using LLM
- gTTS for speech output

## System Architecture
The system follows a client–server architecture:
1. User Interface Layer (React frontend)
2. Backend Application Layer (Flask server)
3. Intelligence and Processing Layer (LLM reasoning + severity analysis)
4. Response Delivery Layer (text + speech output)

## Running the Project
### 1. Install dependencies
pip install -r requirements.txt

### 2. Add environment variable
Create a `.env` file:
OPENAI_API_KEY=your_api_key_here

### 3. Start backend
python app.py

### 4. Start frontend
npm start

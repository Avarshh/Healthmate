import React, { useState, useRef, useEffect } from "react";
import "./App.css";

const BACKEND = "http://127.0.0.1:5000";

function ChatBubble({ role, severity, text, image, lang, onSpeak }) {
  return (
    <div className={`bubble ${role === "user" ? "user" : "assistant"}`}>
      {role !== "user" && severity ? (
        <div className="severity-badge" style={{ 
          fontWeight: 700, 
          marginBottom: 8,
          padding: "4px 8px",
          borderRadius: "6px",
          display: "inline-block",
          backgroundColor: severity?.toLowerCase() === "severe" ? "#ff4444" : 
                severity?.toLowerCase() === "moderate" ? "#ff9944" : "#44ff88"
        }}>
          Severity: {severity.toUpperCase()}
        </div>
      ) : null}

      {image ? (
        <img
          src={image}
          alt="uploaded"
          style={{
            maxWidth: "150px",
            borderRadius: "10px",
            marginBottom: "8px",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />
      ) : null}

      <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>

      {role !== "user" && (
        <button className="speak-btn" onClick={() => onSpeak(text, lang)}>
          Play Audio
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [imgLang, setImgLang] = useState("auto");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);  // SESSION ID STATE

  const fileRef = useRef(null);
  const audioRef = useRef(new Audio());
  const chatAreaRef = useRef(null);
  const [pendingImage, setPendingImage] = useState(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // POST JSON WITH SESSION HEADER
  async function postJson(path, body) {
    const headers = { 
      "Content-Type": "application/json",
    };
    
    if (sessionId) {
      headers["X-Session-ID"] = sessionId;
    }

    const res = await fetch(BACKEND + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return res.json();
  }

  // SEND MESSAGE
  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;

    const userMsg = {
      role: "user",
      content: text || "[image]",
      image: pendingImage ? pendingImage.previewUrl : null,
      lang: imgLang,
    };
    setMessages((m) => [...m, userMsg]);

    setInput("");
    const imageToSend = pendingImage;
    setPendingImage(null);  // Clear preview immediately after sending
    if (fileRef.current) fileRef.current.value = "";
    
    setLoading(true);

    try {
      if (imageToSend) {
        const form = new FormData();
        form.append("image", imageToSend.file, imageToSend.file.name);
        form.append("question", text);
        form.append("lang", imgLang);

        const headers = {};
        if (sessionId) {
          headers["X-Session-ID"] = sessionId;
        }

        const res = await fetch(BACKEND + "/api/image", {
          method: "POST",
          headers: headers,
          body: form,
        });

        const data = await res.json();
        
        // Save session ID
        if (data.sessionId) {
          setSessionId(data.sessionId);
        }

        if (data.error) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: "Image error: " + data.error,
            },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: data.reply,
              severity: data.severity,
              lang: data.lang,
            },
          ]);
        }
      } else {
        const res = await postJson("/api/chat", {
          message: text,
          lang: "auto",
        });

        // Save session ID
        if (res.sessionId) {
          setSessionId(res.sessionId);
        }

        if (res.error) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Error: " + res.error },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: res.reply,
              severity: res.severity,
              lang: res.lang,
            },
          ]);
        }
      }
    } catch (err) {
      console.error("Error:", err);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${err.message}. Make sure backend is running on port 5000.` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // IMAGE SELECT
  const handleFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl });
  };

  const handleCancelImage = () => {
    setPendingImage(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // RESET
  const handleReset = async () => {
    if (!window.confirm("Start a new conversation? This will clear all history and memory.")) {
      return;
    }

    setLoading(true);
    try {
      await postJson("/api/reset", {});
      setMessages([]);
      setInput("");
      setPendingImage(null);
      setSessionId(null);
      
      if (fileRef.current) fileRef.current.value = "";
      
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }

      setMessages([{
        role: "assistant",
        content: "New conversation started! How can I help you today?",
        lang: "en"
      }]);
    } catch (err) {
      alert("Failed to reset conversation. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  // TTS
  const handleSpeak = async (text, lang = "en") => {
    if (!text) return;

    if (!audioRef.current.paused && audioRef.current.src) {
      audioRef.current.pause();
      audioRef.current.src = "";
      return;
    }

    try {
      const res = await postJson("/api/tts", { text, lang });

      if (res.audio_url) {
        audioRef.current.src = BACKEND + res.audio_url;
        await audioRef.current.play();
      } else if (res.error) {
        console.error("TTS error:", res.error);
      }
    } catch (err) {
      console.error("TTS failed:", err);
    }
  };

  // ENTER TO SEND
  const handleTextareaKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) handleSend();
    }
  };

  return (
    <div className="app">
      <header>
        AI HealthMate 
        <button 
          className="reset-btn-header"
          onClick={handleReset}
          disabled={loading}
          title="Start new conversation"
        >
          Reset Chat
        </button>
      </header>

      <div className="controls">
        <label>
          Image output language:
          <select
            value={imgLang}
            onChange={(e) => setImgLang(e.target.value)}
            disabled={loading}
          >
            <option value="auto">Auto</option>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="te">Telugu</option>
          </select>
        </label>

        <div style={{ fontSize: "12px", color: "#000000", marginLeft: "auto" }}>
          {messages.filter(m => m.role === "user").length} messages sent
        </div>
      </div>

      <div className="chat-area" ref={chatAreaRef}>
        {messages.length === 0 && (
          <div className="welcome-message">
            <h2>Welcome to AI HealthMate</h2>
            <p>I'm here to help with medical symptoms and wellness questions.</p>
            <p>Just describe your symptoms in English, Hindi, or Telugu</p>
            <p>You can also upload images for analysis</p>
            <p style={{ fontSize: "12px", color: "#888", marginTop: "20px" }}>
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="message-row">
            <ChatBubble
              role={m.role}
              severity={m.severity}
              text={m.content}
              image={m.image}
              lang={m.lang}
              onSpeak={handleSpeak}
            />
          </div>
        ))}

        {loading && (
          <div className="loading">
            <div className="loading-dots">
              <span>.</span><span>.</span><span>.</span>
            </div>
            Thinking
          </div>
        )}
      </div>

      <div className="composer">
        <button
          className="camera-btn"
          onClick={() => fileRef.current.click()}
          disabled={loading}
          title="Upload image"
        >
          Camera
        </button>

        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {pendingImage && (
          <div className="preview-chip">
            <img src={pendingImage.previewUrl} alt="preview" />
            <button className="close-btn" onClick={handleCancelImage}>
              ✖
            </button>
          </div>
        )}

        <textarea
          placeholder="Type your symptoms or question… (Press Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          disabled={loading}
        />

        <button
          className="send-btn"
          onClick={handleSend}
          disabled={loading || (!input.trim() && !pendingImage)}
          title={loading ? "Sending..." : "Send message"}
        >
          {loading ? "..." : "Send"}
        </button>
      </div>

      <footer>
        AI HealthMate •  
        <span style={{ color: "#888", fontSize: "11px", marginLeft: "10px" }}>
          Not a replacement for professional medical advice
        </span>
      </footer>
    </div>
  );
}
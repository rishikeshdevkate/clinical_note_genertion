import React, { useState, useRef } from "react";
import "./App.css";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from "react-markdown";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [clinicalNote, setClinicalNote] = useState("");
  const [status, setStatus] = useState("Idle");
  const [fullTranscription, setFullTranscription] = useState("");
  const [generatingClinicalNote, setGeneratingClinicalNote] = useState(false);
  const mediaRecorderRef = useRef(null);
  const deepgramClientRef = useRef(null);

  const startRecording = async () => {
    setStatus("Connecting to Deepgram...");
    setTranscription("");
    setClinicalNote("");
    setFullTranscription("");

    try {
      const deepgramClient = createClient(
        process.env.REACT_APP_DEEPGRAM_API_KEY
      );
      const connection = deepgramClient.listen.live({
        model: "nova-2",
        punctuate: true,
        interim_results: true,
      });
      deepgramClientRef.current = connection;

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram connection opened");
        setStatus("Recording...");

        // Set up microphone audio stream
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            mediaRecorderRef.current = new MediaRecorder(stream, {
              mimeType: "audio/webm",
            });

            mediaRecorderRef.current.ondataavailable = (event) => {
              if (
                event.data.size > 0 &&
                connection.getReadyState() === WebSocket.OPEN
              ) {
                connection.send(event.data);
              }
            };
            mediaRecorderRef.current.start(250);
            setIsRecording(true);
          })
          .catch((err) => {
            console.error("Microphone access error:", err);
            setStatus("Error accessing microphone.");
          });
      });

      connection.on(LiveTranscriptionEvents.Transcript, (transcription) => {
        const transcript = transcription.channel.alternatives[0].transcript;
        if (transcript) {
          setTranscription((prev) => prev + transcript + " ");
          if (transcription.is_final) {
            setFullTranscription((prev) => prev + transcript + " ");
          }
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error("Deepgram error:", err);
        setStatus("Deepgram connection error.");
        stopRecording();
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("Deepgram connection closed");
        setStatus("Transcription finished.");
      });
    } catch (error) {
      console.error("Failed to create Deepgram client:", error);
      setStatus("Failed to connect to Deepgram.");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      setIsRecording(false);

      setStatus("Stopping transcription...");
    }

    if (deepgramClientRef.current) {
      deepgramClientRef.current.finish();
      deepgramClientRef.current = null;
    }

    // Trigger note generation after Deepgram connection is finished
    // setTimeout(() => {
    //   if (fullTranscription) {
    //     generateClinicalNote(fullTranscription);
    //   }
    // }, 1000); // Wait a moment for final transcript
  };

  const generateClinicalNote = async (text) => {
    setStatus("Generating clinical note...");
    setGeneratingClinicalNote(true);
    try {
      const prompt = `Based on the following patient-provider conversation transcript, generate a professional clinical note. Transcript: "${text}"`;
      const openaiApiUrl = "https://api.openai.com/v1/chat/completions";
      const ai = new GoogleGenAI({
        apiKey: process.env.REACT_APP_GEMINI_API_KEY,
      });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const data = await response.candidates[0].content.parts[0].text;
      if (data) {
        setGeneratingClinicalNote(false);

        setClinicalNote(data);
        setStatus("Clinical note generated!");
      } else {
        setGeneratingClinicalNote(false);

        console.error("OpenAI API error:", data);
        setStatus("Failed to generate note.");
      }
    } catch (error) {
      setGeneratingClinicalNote(false);

      console.error("Error with OpenAI API call:", error);
      setStatus("Error generating note.");
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Clinical Note Assistant ⚕️</h1>
      </header>
      <main>
        <div className="controls flex">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={isRecording ? "stop-button" : "start-button"}
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>
          <button
            onClick={() => generateClinicalNote(fullTranscription)}
            disabled={isRecording || !transcription || generatingClinicalNote}
            className={"start-button"}
          >
            {generatingClinicalNote ? "Generating..." : "Generate Note"}
          </button>
        </div>

        <div className="content-area">
          <div className="transcription-pane">
            <h2>Live Transcription</h2>
            <div className="transcription-text-box">
              <p>{transcription}</p>
            </div>
          </div>

          <div className="note-pane">
            <h2>Clinical Note</h2>
            <div className="note-text-box">
              <p>
                {" "}
                <ReactMarkdown>{clinicalNote}</ReactMarkdown>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

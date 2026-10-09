"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  PhoneOff,
  Activity,
  ArrowLeft,
  Wrench,
  Check,
  Copy,
  ShieldCheck,
  Award,
  ChevronRight,
  Play,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";

export default function InterrogationPage() {
  const router = useRouter();
  const [hasStarted, setHasStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("Click 'Initiate Interrogation Protocol' to begin...");
  const [userTranscript, setUserTranscript] = useState("");
  const [chatHistory, setChatHistory] = useState<{ type: string; text: string }[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  
  // Turn Management State
  const [currentTurn, setCurrentTurn] = useState(0);
  const [turnQuestions, setTurnQuestions] = useState<{ [key: number]: string }>({});
  const [turnTopics, setTurnTopics] = useState<{ [key: number]: string }>({});
  const [showReport, setShowReport] = useState(false);

  // Stored session state
  const [roastData, setRoastData] = useState<any>(null);
  const [rawResumeText, setRawResumeText] = useState("");

  // Report state
  const [rebuildBullets, setRebuildBullets] = useState<{ original: string; enhanced: string }[]>([]);
  const [defenseReport, setDefenseReport] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const deepgramSocket = useRef<WebSocket | null>(null);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typewriterTimer = useRef<NodeJS.Timeout | null>(null);
  const isInterrogationEndedRef = useRef<boolean>(false);
  const isConclusionReachedRef = useRef<boolean>(false);

  useEffect(() => {
    try {
      const storedData = sessionStorage.getItem("sparta_roast_data");
      const storedResume = sessionStorage.getItem("sparta_resume_text");
      
      if (!storedData || !storedResume) {
        console.warn("No resume data found, redirecting to home...");
        window.location.href = "/";
        return;
      }

      if (storedData) {
        setRoastData(JSON.parse(storedData));
      }
      if (storedResume) {
        setRawResumeText(storedResume);
      }
    } catch (e) {
      console.error("Error reading session storage:", e);
      window.location.href = "/";
    }
  }, [router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && hasStarted && !showReport) {
        e.preventDefault();
        if (isListening) {
          stopMicrophone();
        } else {
          startMicrophone();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasStarted, showReport, isListening, currentTurn, userTranscript]);

  const handleStartInterrogation = () => {
    setHasStarted(true);
    // User interaction gesture unlocks browser HTML5 audio element
    if (audioPlayer.current) {
      audioPlayer.current.play().catch(() => {});
    }

    const initPrompt = `Start the interrogation at TURN 0 (INTRO). Ask the candidate to introduce themselves.`;
    triggerAiResponse(initPrompt, 0);
  };

  const startMicrophone = async () => {
    try {
      const tokenRes = await fetch("/api/deepgram");
      const tokenData = await tokenRes.json();
      if (!tokenData.key) throw new Error("No Deepgram key returned");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      deepgramSocket.current = new WebSocket(
        "wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&smart_format=true",
        ["token", tokenData.key]
      );

      deepgramSocket.current.onopen = () => {
        mediaRecorder.current = new MediaRecorder(stream, { mimeType: "audio/webm" });

        mediaRecorder.current.ondataavailable = (event) => {
          if (event.data.size > 0 && deepgramSocket.current?.readyState === 1) {
            deepgramSocket.current.send(event.data);
          }
        };

        mediaRecorder.current.start(250);
        setIsListening(true);
        setUserTranscript("");
      };

      let fullTranscript = "";
      deepgramSocket.current.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const transcriptText = received.channel?.alternatives[0]?.transcript;
        if (transcriptText) {
          if (received.is_final) {
            fullTranscript += transcriptText + " ";
            setUserTranscript(fullTranscript);
          } else {
            setUserTranscript(fullTranscript + transcriptText);
          }
        }
      };
    } catch (err) {
      console.error("Microphone error:", err);
    }
  };

  const stopMicrophone = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (deepgramSocket.current) {
      deepgramSocket.current.close();
    }
    setIsListening(false);

    if (userTranscript.trim()) {
      // Turn advances ONLY after the candidate finishes speaking and sends their defense
      const nextTurn = currentTurn + 1;
      setCurrentTurn(nextTurn);
      triggerAiResponse(userTranscript, nextTurn);
    }
  };

  const triggerAiResponse = async (userMessage: string, targetTurn: number) => {
    if (isInterrogationEndedRef.current || isConclusionReachedRef.current) return;

    setIsAiSpeaking(true);
    setTranscript("");
    setUserTranscript("");

    // Stop any previously playing audio or typewriter timers
    if (audioPlayer.current) {
      audioPlayer.current.ontimeupdate = null;
      audioPlayer.current.onended = null;
      audioPlayer.current.pause();
      audioPlayer.current.currentTime = 0;
      audioPlayer.current.removeAttribute("src");
      audioPlayer.current.load();
    }
    if (typewriterTimer.current) {
      clearInterval(typewriterTimer.current);
    }

    try {
      const res = await axios.post("/api/interrogation", {
        message: userMessage,
        history: chatHistory,
        context: JSON.stringify(roastData || {}),
      });

      if (isInterrogationEndedRef.current) return;

      const rawReplyText =
        res.data.response ||
        res.data.reply ||
        (typeof res.data === "string" ? res.data : JSON.stringify(res.data));

      let extractedTopic = `Turn ${targetTurn}`;
      let cleanText = rawReplyText.toString().trim();
      
      const topicMatch = cleanText.match(/\[TOPIC:\s*(.*?)\]/i);
      if (topicMatch) {
        extractedTopic = topicMatch[1].trim();
        cleanText = cleanText.replace(topicMatch[0], "").trim();
      }

      cleanText = cleanText.replace(/[*#`_\[\]]/g, "").trim();
      
      if (extractedTopic.toLowerCase().includes("conclusion") || cleanText.toLowerCase().includes("thank you for participating")) {
        isConclusionReachedRef.current = true;
      }

      // Store the actual question asked for this turn
      setTurnQuestions((prev) => ({ ...prev, [targetTurn]: cleanText }));
      setTurnTopics((prev) => ({ ...prev, [targetTurn]: extractedTopic }));

      // Update chat history immediately so interruptions don't cause history loss
      setChatHistory((prev) => [
        ...prev,
        { type: "user", text: userMessage },
        { type: "model", text: rawReplyText },
      ]);

      const words = cleanText.split(" ");
      let audioPlayed = false;

      // Deepgram TTS Fetch & Audio-synced text reveal
      try {
        const tokenRes = await fetch("/api/deepgram");
        const tokenData = await tokenRes.json();
        if (tokenData.key && !isInterrogationEndedRef.current) {
          const cleanTtsPayload = cleanText.slice(0, 350);

          const audioRes = await fetch(
            "https://api.deepgram.com/v1/speak?model=aura-athena-en",
            {
              method: "POST",
              headers: {
                Authorization: `Token ${tokenData.key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ text: cleanTtsPayload }),
            }
          );

          if (isInterrogationEndedRef.current) return;

          const audioBlob = await audioRes.blob();
          if (audioBlob && audioBlob.size > 100 && audioPlayer.current && !isInterrogationEndedRef.current) {
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPlayer.current.src = audioUrl;

            audioPlayer.current.ontimeupdate = () => {
              if (
                audioPlayer.current &&
                audioPlayer.current.duration > 0 &&
                audioPlayer.current.currentTime > 0.05 &&
                !isInterrogationEndedRef.current
              ) {
                const progress =
                  audioPlayer.current.currentTime / audioPlayer.current.duration;
                const wordIndex = Math.min(
                  words.length,
                  Math.floor(progress * words.length) + 1
                );
                setTranscript(words.slice(0, wordIndex).join(" "));
              }
            };

            audioPlayer.current.onended = () => {
              if (!isInterrogationEndedRef.current) {
                setTranscript(cleanText);
                setIsAiSpeaking(false);

                // Auto-redirect to Results if Conclusion finishes speaking
                if (
                  // targetTurn >= 8 ||
                  extractedTopic.toLowerCase().includes("conclusion") ||
                  cleanText.toLowerCase().includes("thank you for participating")
                ) {
                  handleFinishInterrogation();
                }
              }
            };

            try {
              if (!isInterrogationEndedRef.current) {
                await audioPlayer.current.play();
                audioPlayed = true;
              }
            } catch (playErr: any) {
              if (playErr.name !== "AbortError") {
                console.warn("Audio playback interrupted:", playErr);
              }
            }
          }
        }
      } catch (err) {
        console.error("TTS Error:", err);
      }

      if (!audioPlayed && !isInterrogationEndedRef.current) {
        let currentText = "";
        let i = 0;
        typewriterTimer.current = setInterval(() => {
          if (isInterrogationEndedRef.current) {
            if (typewriterTimer.current) clearInterval(typewriterTimer.current);
            return;
          }
          if (i < words.length) {
            currentText += (i > 0 ? " " : "") + words[i];
            setTranscript(currentText);
            i++;
          } else {
            if (typewriterTimer.current) clearInterval(typewriterTimer.current);
            setIsAiSpeaking(false);
            if (
              // targetTurn >= 8 ||
              extractedTopic.toLowerCase().includes("conclusion") ||
              cleanText.toLowerCase().includes("thank you for participating")
            ) {
              handleFinishInterrogation();
            }
          }
        }, 120);
      }
    } catch (e) {
      console.error(e);
      if (!isInterrogationEndedRef.current) {
        setTranscript("SYS_ERR: Connection lost to S.P.A.R.T.A. main node.");
        setIsAiSpeaking(false);
      }
    }
  };
  const copyTranscriptToClipboard = () => {
    const rawTranscript = chatHistory
      .filter((msg, idx) => !(idx === 0 && msg.type === "user" && msg.text.includes("Start the interrogation at TURN 0")))
      .map((msg) => `${msg.type === "user" ? "Candidate" : "S.P.A.R.T.A. Agent"}\n${msg.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(rawTranscript).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error("Failed to copy transcript:", err);
    });
  };
  const handleFinishInterrogation = async () => {
    // Set flag first to block all in-flight async TTS play calls
    isInterrogationEndedRef.current = true;

    // Instant voice cutoff: silence and unload audio player immediately
    if (audioPlayer.current) {
      audioPlayer.current.pause();
      audioPlayer.current.currentTime = 0;
      audioPlayer.current.removeAttribute("src");
      audioPlayer.current.load();
    }
    if (typewriterTimer.current) {
      clearInterval(typewriterTimer.current);
    }
    setIsAiSpeaking(false);
    stopMicrophone();

    setIsGeneratingReport(true);
    setShowReport(true);

    const fullVoiceTranscript = chatHistory
      .map((h) => `${h.type === "user" ? "Candidate" : "Agent"}: ${h.text}`)
      .join("\n");

    try {
      const res = await fetch("/api/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: rawResumeText || "Worked on backend APIs and system infrastructure.",
          spokenTranscript: fullVoiceTranscript || userTranscript || "",
          context: JSON.stringify(roastData || {}),
        }),
      });
      const data = await res.json();
      setRebuildBullets(data.bullets || []);
      setDefenseReport(data);
    } catch (e) {
      console.error("Error generating report bullets:", e);
    }
    setIsGeneratingReport(false);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, userTranscript]);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!roastData || !rawResumeText) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center font-mono text-red-500">
        <Activity className="animate-pulse mb-4" size={32} />
        <p>Initializing Secure Connection...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans">
      <audio ref={audioPlayer} className="hidden" />

      {/* Top Header */}
      <header className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-xs font-mono"
          >
            <ArrowLeft size={16} /> Return to Dashboard
          </Link>
          <div className="h-4 w-px bg-neutral-800" />
          <div className="flex items-center gap-2">
            <Activity className="text-red-500 animate-pulse" size={18} />
            <h1 className="font-bold tracking-widest text-sm uppercase">S.P.A.R.T.A. Voice Terminal</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-red-950/40 border border-red-800/40 text-red-400 text-xs font-mono rounded-full">
            {showReport ? "PHASE 2: BATTLE REPORT" : (roastData?.has_github ? "CODE GROUNDED INTERVIEW" : "RESUME GROUNDED INTERVIEW")}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 max-w-7xl w-full mx-auto relative">
        {/* User Interaction Start Modal (Fixes Browser Audio Autoplay Blocking) */}
        {!hasStarted && !showReport && (
          <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-neutral-950 border border-neutral-800 rounded-2xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full bg-red-950/60 border border-red-800/60 text-red-500 flex items-center justify-center mx-auto">
                <Activity size={32} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white uppercase tracking-widest">
                  Live Technical Interrogation
                </h2>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  S.P.A.R.T.A. will stress-test your technical depth across 4 turns. Speak clearly into your microphone to defend your claims.
                </p>
              </div>
              <button
                onClick={handleStartInterrogation}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-lg cursor-pointer"
              >
                <Play size={18} /> Initiate Interrogation Protocol
              </button>
            </motion.div>
          </div>
        )}

        {!showReport ? (
          /* Live Interrogation Terminal View */
          <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-[750px] lg:h-[750px] lg:max-h-[85vh] bg-black border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Left Column: Context & Structured Topic Progression Panel */}
            <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-neutral-900 p-6 bg-neutral-950/50 flex flex-col gap-6">

              {/* Structured Topic Progression Panel */}
              <div className="flex-1 bg-neutral-900/80 border border-neutral-800 rounded-xl p-5 space-y-4 flex flex-col min-h-0">
                <h4 className="text-xs font-mono text-neutral-400 uppercase tracking-widest border-b border-neutral-800 pb-2">
                  Topic Progression
                </h4>

                <div id="topic-progression-container" className="flex-1 space-y-3 text-xs overflow-y-auto pr-2 custom-scrollbar relative">
                  {Array.from({ length: currentTurn + 1 }).map((_, turnNum) => {
                    const questionText = turnQuestions[turnNum];
                    const label = turnTopics[turnNum] || `Turn ${turnNum}`;
                    const isCurrent = currentTurn === turnNum;
                    const isCompleted = turnNum < currentTurn || !!questionText;

                    return (
                      <div
                        key={turnNum}
                        ref={(el) => {
                          if (isCurrent && el) {
                            const container = document.getElementById("topic-progression-container");
                            if (container) {
                              container.scrollTo({
                                top: el.offsetTop - container.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2),
                                behavior: 'smooth'
                              });
                            }
                          }
                        }}
                        className={`p-3 rounded-lg border transition-all ${
                          isCurrent
                            ? "bg-red-950/20 border-red-900/60 text-white"
                            : isCompleted
                            ? "bg-neutral-950/60 border-neutral-800 text-neutral-300"
                            : "bg-neutral-950/20 border-neutral-900 text-neutral-600"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-mono font-bold ${isCurrent ? "text-red-400" : "text-neutral-500"}`}>
                            {label}
                          </span>
                          {isCurrent && isAiSpeaking && (
                            <span className="flex items-center gap-1 text-[10px] text-red-400 font-mono animate-pulse">
                              <Loader2 size={10} className="animate-spin" /> Asking...
                            </span>
                          )}
                        </div>

                        {questionText ? (
                          <p className="text-xs leading-relaxed font-medium line-clamp-3">
                            "{questionText}"
                          </p>
                        ) : (
                          <div className="flex items-center gap-2 py-1 text-neutral-600 font-mono">
                            <span className="inline-block w-2 h-2 rounded-full bg-neutral-800 animate-pulse" />
                            <span>{isCurrent ? "Processing..." : "Awaiting..."}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Live Spoken Transcript */}
            <div className="flex-1 p-6 flex flex-col relative bg-black min-w-0 min-h-[500px]">
              <div ref={scrollRef} className="flex-1 overflow-y-auto pb-12 space-y-6">
                <AnimatePresence>
                  {userTranscript && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-4 self-end justify-end"
                    >
                      <div className="text-lg text-neutral-300 font-medium leading-relaxed max-w-xl text-right bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                        {userTranscript}
                        {isListening && <span className="inline-block w-2 h-4 bg-neutral-500 ml-2 animate-pulse" />}
                      </div>
                      <div className="w-8 h-8 rounded bg-neutral-800 text-neutral-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        YOU
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded bg-white text-black flex items-center justify-center font-bold text-xs flex-shrink-0">
                    AI
                  </div>
                  <div className="text-xl sm:text-2xl text-white font-light leading-relaxed max-w-2xl bg-neutral-950 border border-neutral-900 rounded-xl p-5 min-h-[90px] flex items-center">
                    {transcript ? (
                      <div>
                        {transcript}
                        {isAiSpeaking && (
                          <span className="inline-block w-3 h-6 bg-red-500 ml-2 animate-pulse align-middle rounded-none shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-6 bg-red-500 animate-pulse rounded-none inline-block align-middle shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Controls */}
              <div className="pt-4 border-t border-neutral-900 flex items-center justify-center gap-4">
                <button
                  onClick={isListening ? stopMicrophone : startMicrophone}
                  className={`px-6 py-3.5 rounded-full font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                    isListening
                      ? "bg-red-500/20 border-red-500 text-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                      : "bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800"
                  }`}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  {isListening ? "Stop Speaking & Send (Space)" : "Tap to Speak (Space)"}
                </button>

                <button
                  onClick={handleFinishInterrogation}
                  className="px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-colors flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <PhoneOff size={18} /> End & View Battle Report
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Post-Interrogation Battle Report View */
          <div className="space-y-8 animate-[fadeIn_0.5s_ease_forwards]">
            {/* Header Score Card */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Award className="text-yellow-500" size={26} />
                  <h2 className="text-2xl font-black text-white">S.P.A.R.T.A. Battle Audit Report</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 bg-red-950/40 border border-red-900/60 text-red-400 font-mono text-xs rounded-md uppercase tracking-wider font-semibold">
                    {isGeneratingReport ? "ANALYZING DEFENSE..." : defenseReport?.mode_evaluated || "VERBAL DEFENSE AUDIT"}
                  </span>
                  {isGeneratingReport ? (
                    <span className="px-3 py-1 bg-neutral-800 text-white font-mono text-xs rounded-md font-semibold flex items-center gap-2">
                      <Loader2 className="animate-spin" size={12} /> EVALUATING VERDICT
                    </span>
                  ) : defenseReport?.defense_verdict && (
                    <span className="px-3 py-1 bg-neutral-800 text-white font-mono text-xs rounded-md font-semibold">
                      VERDICT: {defenseReport.defense_verdict}
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-400">
                  {roastData?.has_github 
                    ? "Code and Resume grounded voice defense evaluation derived from your spoken answers." 
                    : "Resume grounded voice defense evaluation derived from your spoken answers."}
                </p>
              </div>

              <div className="flex items-center gap-6">
                <button
                  onClick={() => setShowTranscriptModal(true)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono rounded-lg transition-colors border border-neutral-700 cursor-pointer"
                >
                  View Transcript
                </button>
                <div className="text-center bg-black/60 border border-neutral-800 rounded-xl px-6 py-4">
                  <p className="text-xs font-mono text-neutral-500 uppercase tracking-widest mb-1">
                    Verbal Defense Score
                  </p>
                  <span className="text-4xl font-black text-red-500">
                    {isGeneratingReport ? (
                      <Loader2 className="animate-spin inline-block mr-2" size={32} />
                    ) : (
                      `${defenseReport?.overall_defense_score ?? 0}/100`
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Phase 1: Mistakes & Failsafes */}
            {defenseReport?.phase1_mistakes && (
              <div className="bg-neutral-950 border border-neutral-900 rounded-2xl p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Activity className="text-red-500" size={22} />
                    Phase 1: Mistakes & Scrutiny
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {defenseReport.phase1_mistakes.map((mistake: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden"
                    >
                      {mistake.is_unanswered && (
                         <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500" />
                      )}
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-neutral-400">
                          {mistake.question_label}
                        </span>
                        <span className={`px-2.5 py-1 font-mono text-xs rounded font-bold ${
                          mistake.score >= 80 ? 'bg-green-950/60 text-green-400 border border-green-900/60' : 
                          mistake.score >= 50 ? 'bg-yellow-950/60 text-yellow-400 border border-yellow-900/60' : 
                          'bg-red-950/60 text-red-400 border border-red-900/60'
                        }`}>
                          {mistake.score}/100
                        </span>
                      </div>

                      {mistake.feedback === "QUESTION NOT ANSWERED" ? (
                        <p className="text-sm text-red-500 font-bold text-center my-4 uppercase tracking-wider">
                          QUESTION NOT ANSWERED
                        </p>
                      ) : (
                        <p className="text-sm text-neutral-300 leading-relaxed font-medium">
                          "{mistake.feedback}"
                        </p>
                      )}

                      {mistake.is_unanswered && mistake.failsafe_recommendation && (
                        <div className="mt-auto pt-3 border-t border-neutral-800">
                          <p className="text-xs font-mono text-yellow-500 mb-1 flex items-center gap-1">
                            ⚠️ Failsafe Recommendation
                          </p>
                          <p className="text-xs text-yellow-200/70">
                            {mistake.failsafe_recommendation}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phase 2: Corrections / Additions */}
            <div className="bg-neutral-950 border border-neutral-900 rounded-2xl p-8 space-y-6">
              <div className="flex items-center gap-3">
                <Wrench className="text-white" size={22} />
                <h3 className="text-xl font-bold text-white">Phase 2: Corrections & Resume Additions</h3>
              </div>
              <p className="text-sm text-neutral-400">
                Actionable bullet points derived from your mock interview defense to fix gaps in your resume:
              </p>

              {isGeneratingReport ? (
                <div className="py-12 text-center text-neutral-500 font-mono animate-pulse">
                  Generating battle report & STAR resume patches from your voice defense...
                </div>
              ) : defenseReport?.phase2_corrections?.length === 0 ? (
                <div className="py-8 text-center text-red-500 font-bold font-mono border border-red-900/30 bg-red-950/20 rounded-xl">
                  NO DEFENSE PROVIDED TO GENERATE BULLETS
                </div>
              ) : (
                <div className="space-y-4">
                  {defenseReport?.phase2_corrections?.map((correction: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-mono text-green-400 mb-1 flex items-center gap-2">
                            <ShieldCheck size={14} /> Category: {correction.category || "Addition"}
                          </p>
                          <p className="text-sm text-white font-medium leading-relaxed">
                            {correction.bullet}
                          </p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(correction.bullet, idx)}
                          className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                        >
                          {copiedIndex === idx ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                          {copiedIndex === idx ? "Copied" : "Copy Bullet"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Back Button */}
            <div className="flex justify-center pt-4">
              <Link
                href="/"
                className="px-8 py-4 bg-white hover:bg-neutral-200 text-black font-bold rounded-xl transition-all flex items-center gap-2"
              >
                <ArrowLeft size={18} /> Return to Main Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Transcript Modal */}
        {showTranscriptModal && (
          <div 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowTranscriptModal(false)}
          >
            <div 
              className="bg-neutral-950 border border-neutral-800 rounded-2xl p-8 max-w-2xl w-full flex flex-col max-h-[80vh] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 border-b border-neutral-900 pb-4">
                <h3 className="text-xl font-bold text-white">Full Interview Transcript</h3>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={copyTranscriptToClipboard}
                    className="p-2 text-green-400 hover:text-green-300 bg-green-950/30 hover:bg-green-900/40 rounded-lg transition-colors cursor-pointer border border-green-900/50 text-sm font-medium w-32"
                  >
                    {isCopied ? "Copied!" : "Copy Transcript"}
                  </button>
                  <button
                    onClick={() => setShowTranscriptModal(false)}
                    className="p-2 text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {chatHistory.length === 0 ? (
                  <p className="text-neutral-500 text-center font-mono py-8">No transcript recorded.</p>
                ) : (
                  chatHistory
                    .filter((msg, idx) => !(idx === 0 && msg.type === "user" && msg.text.includes("Start the interrogation at TURN 0")))
                    .map((msg, idx) => (
                    <div key={idx} className={`p-4 rounded-xl ${msg.type === "user" ? "bg-neutral-900 ml-12 border border-neutral-800" : "bg-red-950/20 border border-red-900/30 mr-12"}`}>
                      <p className={`text-xs font-mono font-bold mb-2 uppercase tracking-wider ${msg.type === "user" ? "text-neutral-500" : "text-red-500/70"}`}>
                        {msg.type === "user" ? "Candidate" : "S.P.A.R.T.A. Agent"}
                      </p>
                      <p className="text-sm text-neutral-300 leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

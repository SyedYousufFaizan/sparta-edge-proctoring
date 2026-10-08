"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  DragEvent,
  ChangeEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  ShieldAlert,
  FileText,
  Briefcase,
  Code2,
  BarChart2,
  Shield,
  AlertTriangle,
  Mic,
  Zap,
  CheckCircle,
  Clock,
  MicOff,
  PhoneOff,
  Activity,
  Wrench,
  CheckCircle2,
  Copy,
  RefreshCcw,
} from "lucide-react";
import { prepare, layout } from '@chenglou/pretext';
import axios from "axios";
import TextType from "./components/TextType";

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────
type AppState = "idle" | "processing" | "done" | "error" | "interview" | "rebuild";

interface SectionData {
  score: number;
  roast: string;
}

interface RoastSections {
  experience: SectionData;
  skills: SectionData;
  formatting: SectionData;
  ats_compatibility: SectionData;
}

export interface RoastData {
  combat_readiness_score: number;
  verdict: string;
  ats_metrics: {
    keyword_match_rate: number;
    quantification_rate: number;
    missing_critical_skills: string[];
  };
  sections: {
    [key: string]: {
      score: number;
      roast: string;
    };
  };
  faang_attack_vectors: Array<{
    trigger_claim: string;
    attack_question: string;
  }>;
  resume_text?: string;
}

interface ApiResponse {
  status: string;
  data: string;
  initial_chat: string;
}

const LOCAL_CACHE = new Map<string, RoastData>();

// ─────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────
const PROCESSING_MESSAGES = [
  "✓ Parsing PDF...",
  "✓ Extracting claims...",
  "✓ Finding red flags...",
  "🔥 Generating your roast...",
];

const MAX_FILE_SIZE_MB = 10;
const API_URL = `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"}/analyze`;

// ─────────────────────────────────────────────────
// useCountUp Hook
// ─────────────────────────────────────────────────
function useCountUp(target: number, duration: number = 1500): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === 0) return;
    let startTime: number | null = null;
    const startValue = 0;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(startValue + (target - startValue) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };

    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return count;
}

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score < 50) return "text-red-400";
  if (score < 70) return "text-yellow-400";
  return "text-green-400";
}

function scoreBarColor(score: number): string {
  if (score < 50) return "bg-red-400";
  if (score < 70) return "bg-yellow-400";
  return "bg-green-400";
}

function scoreBadgeLabel(score: number): string {
  if (score < 30) return "CATASTROPHIC";
  if (score < 50) return "FAILING";
  if (score < 70) return "MEDIOCRE";
  if (score < 85) return "ADEQUATE";
  return "EXCEPTIONAL";
}

function scoreBadgeColor(score: number): string {
  if (score < 30) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (score < 50) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (score < 70) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (score < 85) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-green-500/20 text-green-400 border-green-500/30";
}

const SECTION_ICONS: Record<keyof RoastSections, React.ElementType> = {
  experience: Briefcase,
  skills: Code2,
  formatting: BarChart2,
  ats_compatibility: Shield,
};

const SECTION_LABELS: Record<keyof RoastSections, string> = {
  experience: "Experience",
  skills: "Skills",
  formatting: "Formatting",
  ats_compatibility: "ATS Compatibility",
};

const SECTION_KEYS = [
  "experience",
  "skills",
  "formatting",
  "ats_compatibility",
] as const;

// ─────────────────────────────────────────────────
// Cycling Text Component
// ─────────────────────────────────────────────────
function CyclingText() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={index}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className="text-sm font-mono text-neutral-400 tracking-wide"
      >
        {PROCESSING_MESSAGES[index]}
      </motion.p>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────
// Skeleton Dashboard
// ─────────────────────────────────────────────────
function SkeletonDashboard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-5xl mx-auto"
    >
      <div className="flex gap-4 w-full h-[480px]">
        <div className="w-2/5 h-full rounded-xl bg-neutral-900 animate-pulse" />
        <div className="flex-1 flex flex-col gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-xl bg-neutral-900 animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="w-48 h-[2px] bg-neutral-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white rounded-full"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <CyclingText />
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────
// Score Ring SVG
// ─────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const animated = useCountUp(score, 1500);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const ringColor =
    score < 50 ? "#f87171" : score < 70 ? "#facc15" : "#4ade80";

  return (
    <div className="relative flex items-center justify-center w-36 h-36 mx-auto">
      <svg
        className="absolute inset-0 -rotate-90"
        width="144"
        height="144"
        viewBox="0 0 144 144"
      >
        {/* Track */}
        <circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          stroke="#262626"
          strokeWidth="10"
        />
        {/* Progress */}
        <circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className={`text-3xl font-black tabular-nums ${scoreColor(score)}`}>
          {animated}
        </span>
        <span className="text-xs text-neutral-500 font-mono">/100</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Section Card (collapsible)
// ─────────────────────────────────────────────────
interface SectionCardProps {
  sectionKey: keyof RoastSections;
  data: SectionData;
  delay: number;
  visible: boolean;
}

function SectionCard({ sectionKey, data, delay, visible }: SectionCardProps) {
  const [open, setOpen] = useState(sectionKey === "experience" || sectionKey === "skills");
  const [barWidth, setBarWidth] = useState("0%");

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setBarWidth(`${data.score}%`), delay + 200);
    return () => clearTimeout(t);
  }, [visible, data.score, delay]);

  const handleToggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div
      className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-3 hover:border-neutral-700 transition-colors duration-200 cursor-pointer select-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
      }}
      onClick={handleToggle}
      role="button"
      aria-expanded={open}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`${scoreColor(data.score)}`}>
            {(() => {
              const IconComp = SECTION_ICONS[sectionKey];
              return <IconComp className="w-4 h-4" />;
            })()}
          </span>
          <span className="text-sm font-semibold text-white">
            {SECTION_LABELS[sectionKey]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full border font-mono ${scoreColor(data.score)} bg-neutral-800 border-neutral-700`}
          >
            {data.score}
          </span>
          <span className="text-neutral-600 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-[3px] bg-neutral-800 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${scoreBarColor(data.score)}`}
          style={{
            width: barWidth,
            transition: "width 1s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>

      {/* Collapsible Roast Text */}
      <AnimatePresence>
        {open && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="text-sm text-neutral-300 leading-relaxed overflow-hidden"
          >
            {data.roast}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Sticky Nav Bar
// ─────────────────────────────────────────────────
function StickyNav({ onReset }: { onReset?: () => void }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString());
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left */}
        {onReset ? (
          <button
            onClick={onReset}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-all group focus:outline-none"
            title="Return to Home"
          >
            <Zap className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold tracking-widest text-white uppercase group-hover:text-green-400 transition-colors">
              S.P.A.R.T.A.
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-white" />
            <span className="text-sm font-bold tracking-widest text-white uppercase">
              S.P.A.R.T.A.
            </span>
          </div>
        )}

        {/* Center */}
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-sm text-neutral-300 font-medium">
            Audit Complete
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-green-500 text-xs font-mono text-neutral-300 hover:text-green-400 transition-all shadow-sm cursor-pointer"
            >
              <RefreshCcw className="w-3.5 h-3.5 text-green-400" />
              <span>Return Home</span>
            </button>
          )}
          <div className="hidden sm:flex items-center gap-2 text-neutral-500 text-xs font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Roast Dashboard
// ─────────────────────────────────────────────────
function RoastDashboard({
  roastData,
  uploadedFile,
  onReset,
  onInterviewStart,
  setAppState,
}: {
  roastData: RoastData;
  uploadedFile: File | null;
  onReset: () => void;
  onInterviewStart: () => void;
  setAppState: (state: any) => void;
}) {
  const [cardsVisible, setCardsVisible] = useState(false);
  const [rippling, setRippling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadedFile) return;
    const url = URL.createObjectURL(uploadedFile);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedFile]);

  useEffect(() => {
    const t = setTimeout(() => setCardsVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  const handleVoice = useCallback(() => {
    setRippling(true);
    setTimeout(() => {
      setRippling(false);
      onInterviewStart();
    }, 600);
  }, [onInterviewStart]);

  return (
    <>
      <StickyNav onReset={onReset} />
      <div
        className="max-w-[1600px] mx-auto w-full px-6 py-10 opacity-0 animate-[fadeIn_0.7s_ease_forwards]"
        style={{ animationFillMode: "forwards" }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes ripple { 0% { transform: scale(0); opacity: 0.6; } 100% { transform: scale(3); opacity: 0; } }
          .ripple-circle { animation: ripple 0.6s ease-out forwards; }
        `}</style>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ── Left Column: PDF Panel ── */}
          <div className="lg:col-span-6 lg:sticky lg:top-24 self-start">
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl min-h-[820px] p-6 flex flex-col">
              {/* Panel header */}
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-neutral-500" />
                <span className="text-xs font-mono text-neutral-500 tracking-widest uppercase">
                  Resume PDF
                </span>
              </div>

              {pdfUrl ? (
                // Real PDF viewer
                <iframe
                  src={pdfUrl}
                  className="w-full h-full rounded-xl min-h-[760px] border border-neutral-800 bg-neutral-900 flex-1"
                  title="Resume Preview"
                />
              ) : (
                // Keep the original shimmer skeleton as fallback 
                // when no file is available
                <div className="flex-1 p-6 flex flex-col gap-4">
                  {[...Array(3)].map((_, blockIdx) => (
                    <div key={blockIdx} className="space-y-2">
                      <div className="h-3 w-1/3 rounded bg-neutral-800 animate-pulse" />
                      {[...Array(4)].map((_, lineIdx) => (
                        <div
                          key={lineIdx}
                          className="h-2 rounded bg-neutral-800/60 animate-pulse"
                          style={{
                            width: `${70 + Math.random() * 25}%`,
                            animationDelay: `${(blockIdx * 4 + lineIdx) * 80}ms`,
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column: Roast Analysis ── */}
          <div className="lg:col-span-6">
            {/* Score Header Card */}
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 mb-4">
              <div className="flex flex-col items-center">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4">
                  Combat Readiness
                </span>
                <ScoreRing score={roastData.combat_readiness_score} />
              </div>

              <div className="text-center mt-4 space-y-2">
                <span
                  className={`inline-block px-3 py-1 rounded-full border text-xs font-bold tracking-widest ${scoreBadgeColor(roastData.combat_readiness_score)}`}
                >
                  {scoreBadgeLabel(roastData.combat_readiness_score)}
                </span>
                <p className="text-white text-2xl font-black leading-snug">
                  {roastData.verdict}
                </p>
              </div>
            </div>

            {/* ── ATS METRICS SECTION ── */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Match Rate */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-center">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-1">Keyword Match</span>
                <span className="text-2xl font-bold text-white">{roastData.ats_metrics.keyword_match_rate}%</span>
              </div>
              
              {/* Quantification Rate */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-center">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-1">Quantification</span>
                <span className="text-2xl font-bold text-white">{roastData.ats_metrics.quantification_rate}%</span>
              </div>
            </div>

            {/* Missing Skills Badges */}
            {roastData.ats_metrics.missing_critical_skills.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-3">Critical Missing Ammo</h3>
                <div className="flex flex-wrap gap-2">
                  {roastData.ats_metrics.missing_critical_skills.map((skill, idx) => (
                    <span key={idx} className="bg-red-900/20 text-red-400 border border-red-800/50 rounded-full px-3 py-1 text-xs font-mono">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Section Cards */}
            <div>
              {SECTION_KEYS.map((key, i) => (
                <SectionCard
                  key={key}
                  sectionKey={key}
                  data={roastData.sections[key]}
                  delay={i * 100}
                  visible={cardsVisible}
                />
              ))}
            </div>

            {/* ── FAANG ATTACK VECTORS ── */}
            {roastData.faang_attack_vectors && roastData.faang_attack_vectors.length > 0 && (
              <div className="mt-8 mb-6">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-yellow-500" />
                  Predicted FAANG Attack Vectors
                </h3>
                
                <div className="space-y-3">
                  {roastData.faang_attack_vectors.map((vector, idx) => (
                    <div key={idx} className="bg-neutral-900 border border-neutral-800 border-l-2 border-l-yellow-500 rounded-lg p-4">
                      <p className="text-xs text-neutral-500 font-mono mb-2">Claim Detected: "{vector.trigger_claim}"</p>
                      <p className="text-sm text-neutral-200 font-medium leading-relaxed">{vector.attack_question}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA: Voice Interrogation */}
            <div
              className="mb-4"
              style={{
                opacity: cardsVisible ? 1 : 0,
                transform: cardsVisible ? "translateY(0)" : "translateY(16px)",
                transition: "opacity 0.4s ease 600ms, transform 0.4s ease 600ms",
              }}
            >
              <div className="flex flex-col sm:flex-row items-center gap-4 mt-8 w-full">
                <button 
                  onClick={() => {
                    sessionStorage.setItem("sparta_roast_data", JSON.stringify(roastData));
                    sessionStorage.setItem("sparta_resume_text", roastData.resume_text || "");
                    window.location.href = "/interrogation";
                  }}
                  className="flex-1 px-8 py-4 bg-red-950/20 hover:bg-red-900/40 border border-red-500/30 hover:border-red-500/60 text-red-500 font-bold rounded-xl transition-all flex justify-center items-center gap-2"
                >
                  <Mic size={18} /> Initiate Voice Interrogation →
                </button>

                <button 
                  onClick={() => setAppState("rebuild")}
                  className="flex-1 px-8 py-4 bg-white hover:bg-neutral-200 text-black font-bold rounded-xl transition-all flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  <Wrench size={18} /> Execute Reconstruction
                </button>
              </div>
            </div>

            {/* Reset */}
            <button
              onClick={onReset}
              className="w-full text-xs text-neutral-600 hover:text-neutral-400 transition-colors duration-150 py-2"
            >
              Analyze another resume
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────
// Voice Modal Simulator
// ─────────────────────────────────────────────────
const VoiceModal = ({ 
  roastData, 
  onClose 
}: { 
  roastData: RoastData; 
  onClose: () => void 
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [containerHeight, setContainerHeight] = useState(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const deepgramSocket = useRef<WebSocket | null>(null);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const [userTranscript, setUserTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);

  const [chatHistory, setChatHistory] = useState<{type: string, text: string}[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // The first Attack Vector is our starting context
  const attackContext = roastData.faang_attack_vectors?.[0];

  const startMicrophone = async () => {
    try {
      const tokenRes = await fetch("/api/deepgram");
      const tokenData = await tokenRes.json();
      if (!tokenData.key) throw new Error("No Deepgram key returned");
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      deepgramSocket.current = new WebSocket(
        "wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&smart_format=true",
        ['token', tokenData.key]
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
        setUserTranscript(""); // Reset user transcript for new input
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
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
    if (deepgramSocket.current) {
      deepgramSocket.current.close();
    }
    setIsListening(false);
    
    if (userTranscript.trim()) {
      triggerAiResponse(userTranscript);
    }
  };

  const triggerAiResponse = async (userMessage: string) => {
    setIsAiSpeaking(true);
    setTranscript("");
    
    try {
      const res = await axios.post("/api/interrogation", {
        message: userMessage,
        history: chatHistory,
        context: JSON.stringify(roastData),
      });

      // Safely extract the response directly matching FastAPI's {response: ...} structure
      const replyText = res.data.response || res.data.reply || (typeof res.data === 'string' ? res.data : JSON.stringify(res.data));

      const words = replyText.toString().split(" ");
      let audioPlayed = false;

      // -- FETCH TTS FROM DEEPGRAM AURA & SYNC TEXT TO AUDIO --
      try {
        const tokenRes = await fetch("/api/deepgram");
        const tokenData = await tokenRes.json();
        if (tokenData.key) {
          const audioRes = await fetch("https://api.deepgram.com/v1/speak?model=aura-athena-en", {
            method: "POST",
            headers: {
              "Authorization": `Token ${tokenData.key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ text: replyText.toString() })
          });
          const audioBlob = await audioRes.blob();
          if (audioBlob && audioBlob.size > 100 && audioPlayer.current) {
            const audioUrl = URL.createObjectURL(audioBlob);
            try {
              audioPlayer.current.pause();
            } catch (e) {}
            
            audioPlayer.current.src = audioUrl;
            
            // Audio-synced text reveal handler
            audioPlayer.current.ontimeupdate = () => {
              if (audioPlayer.current && audioPlayer.current.duration > 0) {
                const progress = audioPlayer.current.currentTime / audioPlayer.current.duration;
                const wordIndex = Math.min(words.length, Math.floor(progress * words.length) + 1);
                setTranscript(words.slice(0, wordIndex).join(" "));
              }
            };
            
            audioPlayer.current.onended = () => {
              setTranscript(replyText.toString());
              setIsAiSpeaking(false);
              setChatHistory((prev) => [
                ...prev, 
                { type: "user", text: userMessage }, 
                { type: "model", text: replyText.toString() }
              ]);
            };
            
            try {
              await audioPlayer.current.play();
              audioPlayed = true;
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
      
      // Fallback typewriter interval if audio isn't supported or fails
      if (!audioPlayed) {
        let currentText = "";
        let i = 0;
        const interval = setInterval(() => {
          if (i < words.length) {
            currentText += (i > 0 ? " " : "") + words[i];
            setTranscript(currentText);
            i++;
          } else {
            clearInterval(interval);
            setIsAiSpeaking(false);
            setChatHistory((prev) => [
              ...prev, 
              { type: "user", text: userMessage }, 
              { type: "model", text: replyText.toString() }
            ]);
          }
        }, 150);
      }
      
    } catch (e) {
      console.error(e);
      setTranscript("SYS_ERR: Connection lost to S.P.A.R.T.A. main node. Ensure the backend is running.");
      setIsAiSpeaking(false);
    }
  };

  useEffect(() => {
    if (attackContext) {
      const initPrompt = `Start the interrogation using this context: the user claimed "${attackContext.trigger_claim}". Your objective is to brutally question them on this: "${attackContext.attack_question}". Ask the first question.`;
      triggerAiResponse(initPrompt);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, userTranscript]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
    >
      <div className="w-full max-w-6xl bg-black border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-900 bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800">
              <Activity className="text-red-500 animate-pulse" size={18} />
              {/* Outer pulsing ring */}
              <div className="absolute inset-0 rounded-full border border-red-500/30 animate-ping"></div>
            </div>
            <div>
              <h2 className="text-white font-bold tracking-widest uppercase text-sm">S.P.A.R.T.A. Engine</h2>
              <p className="text-red-500/80 text-xs font-mono uppercase">Live Interrogation</p>
            </div>
          </div>
          <div className="text-neutral-500 font-mono text-xs animate-pulse">
            REC 00:00:14
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          
          {/* Left: Context Panel */}
          <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-neutral-900 p-6 bg-neutral-950/50 flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">Current Attack Vector</h3>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-xs text-neutral-500 font-mono mb-2">Trigger Claim:</p>
              <p className="text-sm text-neutral-300">"{attackContext?.trigger_claim || 'Parsing resume...'}"</p>
            </div>
            <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4">
              <p className="text-xs text-red-500/70 font-mono mb-2">Objective:</p>
              <p className="text-sm text-red-400">Test depth of technical implementation. Do not accept high-level buzzwords.</p>
            </div>
          </div>

          {/* Right: Transcript Window */}
          <div className="flex-1 p-6 flex flex-col relative bg-black min-w-0 min-h-0">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-transparent z-10 pointer-events-none h-24"></div>
            
            <div ref={scrollRef} className="flex-1 overflow-y-auto pb-24 scrollbar-hide flex flex-col justify-start">
              <AnimatePresence>
                {userTranscript && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-start gap-4 mb-8 self-end"
                  >
                    <div className="text-xl text-neutral-400 font-medium leading-relaxed max-w-2xl text-right">
                      {userTranscript}
                      {isListening && <span className="inline-block w-2 h-5 bg-neutral-600 ml-2 animate-pulse"></span>}
                    </div>
                    <div className="w-8 h-8 rounded bg-neutral-800 text-neutral-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      YOU
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-start gap-4 mb-6">
                <div className="w-8 h-8 rounded bg-white text-black flex items-center justify-center font-bold text-xs flex-shrink-0">
                  AI
                </div>
                {/* PRETEXT DRIVEN CONTAINER */}
                <div 
                  className="text-2xl text-white font-light leading-relaxed max-w-2xl"
                  style={{ minHeight: containerHeight > 0 ? `${containerHeight}px` : 'auto' }}
                >
                  {transcript}
                  <span className="inline-block w-2 h-6 bg-red-500 ml-2 animate-pulse"></span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Controls */}
        <div className="p-6 border-t border-neutral-900 bg-neutral-950 flex items-center justify-center gap-4 relative">
          <audio ref={audioPlayer} className="hidden" />
          
          <button 
            onClick={isListening ? stopMicrophone : startMicrophone}
            className={`p-4 rounded-full transition-all duration-300 border ${
              isListening 
                ? 'bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse' 
                : 'bg-neutral-900 border-neutral-800 text-white hover:bg-neutral-800'
            }`}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          
          <button 
            onClick={onClose}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-colors flex items-center gap-2"
          >
            <PhoneOff size={18} />
            End Interrogation
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const RebuildModal = ({ onClose, rawResumeText }: { onClose: () => void, rawResumeText: string }) => {
  const [isGenerating, setIsGenerating] = useState(true);
  const [diffs, setDiffs] = useState<{original: string, enhanced: string}[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const generateDiffs = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: rawResumeText || "Worked on database and frontend UI" }),
      });
      const data = await res.json();
      setDiffs(data.bullets);
    } catch (e) {
      console.error(e);
    }
    setIsGenerating(false);
  };

  useEffect(() => {
    generateDiffs();
  }, []);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md"
    >
      <div className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-neutral-900 bg-black">
          <div>
            <h2 className="text-white font-bold tracking-widest uppercase text-sm">S.P.A.R.T.A. Reconstruction</h2>
            <p className="text-neutral-500 text-xs font-mono uppercase mt-1">Stacked Diff Transformation</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto bg-black space-y-8">
          {isGenerating ? (
             <div className="h-full flex flex-col items-center justify-center gap-4 text-neutral-500">
                <Wrench className="animate-spin text-green-500/50" size={24} />
                <p className="animate-pulse font-mono text-sm">Executing XYZ Formula Rewrite & Extracting Metrics...</p>
             </div>
          ) : (
            (diffs || []).map((diff, idx) => (
              <div key={idx} className="flex flex-col gap-2">
                {/* BEFORE block */}
                <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-lg">
                  <span className="text-xs font-mono text-red-500/70 uppercase block mb-2">Original Context</span>
                  <p className="text-sm text-neutral-400 line-through decoration-red-900/50">{diff.original}</p>
                </div>
                
                {/* AFTER block */}
                <div className="p-5 bg-green-950/10 border border-green-500/30 rounded-lg relative group">
                  <span className="text-xs font-mono text-green-400 uppercase block mb-3">S.P.A.R.T.A. Enhanced</span>
                  {/* Pretext layout injection for smooth rendering */}
                  <div className="text-sm text-neutral-200 font-mono leading-relaxed" dangerouslySetInnerHTML={{ 
                    __html: diff.enhanced.replace(/🔴\[(.*?)\]/g, '<span class="text-red-400 bg-red-950/50 px-1 rounded">[$1]</span>') 
                  }} />
                  
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onClick={() => handleCopy(diff.enhanced, idx)} className="px-3 py-1 bg-black border border-neutral-700 hover:border-green-500 rounded text-xs text-neutral-300 transition-colors flex items-center gap-2">
                      {copiedIndex === idx ? <CheckCircle2 size={12} className="text-green-500"/> : <Copy size={12}/>} 
                      {copiedIndex === idx ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Action Footer */}
        {!isGenerating && (
          <div className="p-4 border-t border-neutral-900 bg-black flex justify-end">
            <button onClick={generateDiffs} className="px-4 py-2 flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors">
              <RefreshCcw size={14} /> Regenerate All
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────
export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roastData, setRoastData] = useState<RoastData | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState<string>("");
  const [jdError, setJdError] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File Validation ──────────────────────────
  const validateFile = (file: File): string | null => {
    if (file.type !== "application/pdf") {
      return "Invalid file type. Please upload a PDF.";
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`;
    }
    return null;
  };

  // ── API Call ─────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    // Gate 1: JD must not be empty or just whitespace
    if (!jobDescription.trim()) {
      setJdError(true);
      setTimeout(() => setJdError(false), 3000);
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setAppState("error");
      return;
    }

    const fileCacheKey = `${file.name}-${file.size}-${file.lastModified}-${jobDescription.trim()}`;
    const cachedData = LOCAL_CACHE.get(fileCacheKey);
    
    if (cachedData) {
      console.log("⚡ Cache hit for:", file.name);
      setUploadedFile(file);
      setRoastData(cachedData);
      setAppState("done");
      return;
    }

    setAppState("processing");
    setErrorMessage(null);
    setRoastData(null);
    setUploadedFile(file);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("job_description", jobDescription.trim());

    try {
      const response = await axios.post<ApiResponse>(API_URL, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      console.log("✅ S.P.A.R.T.A. Raw Response:", response.data);

      if (response.data.status === "error" || (response.data as any).detail) {
        const errorDetail = (response.data as any).detail || (response.data as any).message || "Document rejected. Please upload a valid resume PDF.";
        setErrorMessage(errorDetail);
        setAppState("error");
        return;
      }
      
      const parsedData = typeof response.data.data === "string" 
        ? JSON.parse(response.data.data) 
        : response.data.data;

      if (!parsedData || !parsedData.sections) {
        setErrorMessage("This document does not appear to be a valid resume. Please upload a valid resume PDF.");
        setAppState("error");
        return;
      }
        
      LOCAL_CACHE.set(fileCacheKey, parsedData as RoastData);
      setRoastData(parsedData as RoastData);
      setAppState("done");
    } catch (err: unknown) {
      console.error("❌ API Error:", err);
      const message =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? err.response.data.detail
          : "Could not connect to the S.P.A.R.T.A. backend. Is it running?";
      setErrorMessage(message);
      setAppState("error");
    }
  }, [jobDescription]);

  // ── Drag & Drop Handlers ─────────────────────
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!jobDescription.trim()) {
        setJdError(true);
        setTimeout(() => setJdError(false), 3000);
        return;
      }
      processFile(file);
    },
    [jobDescription, processFile]
  );

  // ── Click to Upload ──────────────────────────
  const handleClick = useCallback(() => {
    if (appState === "idle" || appState === "error") {
      if (!jobDescription.trim()) {
        setJdError(true);
        setTimeout(() => setJdError(false), 3000);
        return;
      }
      fileInputRef.current?.click();
    }
  }, [appState, jobDescription]);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = "";
    },
    [processFile]
  );

  const handleReset = useCallback(() => {
    setAppState("idle");
    setErrorMessage(null);
    setRoastData(null);
    setUploadedFile(null);
    setJobDescription("");
    setJdError(false);
  }, []);

// ── Render: Dashboard ────────────────────────
  if ((appState === "done" || appState === "interview" || appState === "rebuild") && roastData) {
    const parsedResumeData = { text: "" }; // Fallback to prevent ReferenceError since it's not defined originally
    return (
      <>
        <RoastDashboard 
          roastData={roastData} 
          uploadedFile={uploadedFile} 
          onReset={handleReset} 
          onInterviewStart={() => setAppState("interview")} 
          setAppState={setAppState}
        />
        <AnimatePresence>
          {appState === "interview" && (
            <VoiceModal 
              roastData={roastData} 
              onClose={() => setAppState("done")} 
            />
          )}
          {appState === "rebuild" && (
            <RebuildModal 
              rawResumeText={(roastData as any)?.resume_text || ""}
              onClose={() => setAppState("done")}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Render: Upload / Processing / Error ──────
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="absolute top-8 left-8 flex items-center gap-2.5"
      >
        <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center">
          <ShieldAlert className="w-4 h-4 text-black" />
        </div>
        <span className="text-sm font-semibold tracking-widest text-white uppercase">
          S.P.A.R.T.A.
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="absolute top-8 right-8 text-xs text-neutral-500 tracking-widest uppercase font-mono"
      >
        Resume Forensics · v2
      </motion.p>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-10">
        <AnimatePresence mode="wait">
          {appState !== "processing" && (
            <motion.div
              key="title"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5 }}
              className="text-center space-y-5"
            >
              <p className="text-xs font-mono tracking-[0.25em] text-neutral-600 uppercase">
                Forensic Resume Auditor · AI-Powered
              </p>
              <div className="min-h-[7.5rem] md:min-h-[8.5rem] flex items-start justify-center w-full px-2">
                <h1 className="text-3xl sm:text-4xl md:text-[3.25rem] font-semibold tracking-tight text-white leading-[1.2] text-center max-w-3xl">
                  <TextType
                    as="span"
                    text={[
                      "Your resume is about to get destroyed.",
                      "We expose every lie in your resume.",
                      "Code doesn't lie. Your resume does.",
                      "S.P.A.R.T.A. never shows mercy.",
                      "Drop the PDF. Face the verdict.",
                    ]}
                    typingSpeed={45}
                    deletingSpeed={25}
                    pauseDuration={2200}
                    showCursor
                    cursorCharacter="_"
                    cursorBlinkDuration={0.45}
                    cursorClassName="text-neutral-500 font-light"
                    className="text-white"
                    loop
                  />
                </h1>
              </div>
              <p className="text-sm text-neutral-500 tracking-wide max-w-md mx-auto leading-relaxed">
                Upload your resume. Our AI cross-references every claim against
                your actual GitHub code and issues a{" "}
                <span className="text-neutral-300 font-medium">
                  forensic verdict
                </span>
                .
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drop Zone / Skeleton */}
        <AnimatePresence mode="wait">
          {appState === "idle" || appState === "error" ? (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35 }}
              className="w-full"
            >
              <motion.div
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                animate={{
                  scale: isDragOver ? 1.015 : 1,
                  borderColor: isDragOver
                    ? "rgba(161,161,170,0.6)"
                    : "rgba(38,38,38,1)",
                  boxShadow: isDragOver
                    ? "0 0 0 1px rgba(161,161,170,0.15), 0 0 40px rgba(255,255,255,0.04)"
                    : "none",
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`
                  relative flex flex-col items-center justify-center gap-5
                  w-full min-h-[320px] md:min-h-[380px]
                  rounded-2xl border-2 border-dashed
                  transition-all duration-300 select-none
                  ${!jobDescription.trim()
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer"
                  }
                  ${isDragOver && jobDescription.trim()
                    ? "border-red-500/60 bg-red-500/5 scale-[1.02]"
                    : jdError
                      ? "border-red-500/40 bg-red-500/5"
                      : jobDescription.trim()
                        ? "border-neutral-700 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900"
                        : "border-neutral-800 bg-neutral-900/30"
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  aria-label="Upload resume PDF"
                />

                <motion.div
                  animate={{ y: isDragOver ? -4 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-14 h-14 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center"
                >
                  <UploadCloud
                    className={`w-7 h-7 transition-colors duration-200 ${
                      isDragOver ? "text-white" : "text-neutral-500"
                    }`}
                  />
                </motion.div>

                <div className="text-center space-y-2 px-6">
                  <p className="text-lg md:text-xl font-semibold text-white leading-snug">
                    Drop your resume here to get{" "}
                    <span className="text-neutral-400">
                      brutally roasted by AI
                    </span>
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {jobDescription.trim()
                      ? "✓ JD ready — drop your PDF to begin"
                      : "Paste a Job Description below first"
                    }
                  </p>
                  <p className="text-sm text-neutral-600">
                    PDF only · Max {MAX_FILE_SIZE_MB}MB
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px w-16 bg-neutral-800" />
                  <span className="text-xs text-neutral-600 tracking-widest uppercase font-mono">
                    or click to browse
                  </span>
                  <div className="h-px w-16 bg-neutral-800" />
                </div>

                  <AnimatePresence>
                  {isDragOver && jobDescription.trim() && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 rounded-2xl bg-white/[0.02] pointer-events-none"
                    />
                  )}
                </AnimatePresence>
              </motion.div>

              {/* ── JD INPUT SECTION ── */}
              <div className="w-full mt-4 space-y-2 w-full min-h-[320px] md:min-h-[380px] max-w-[500px]">
                {/* Section Label */}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
                    Target Job Description
                  </label>
                  <span className={`text-xs tabular-nums transition-colors duration-200 ${jobDescription.length > 50 ? "text-green-400" : "text-neutral-600"}`}>
                    {jobDescription.length} chars
                  </span>
                </div>

                {/* Textarea */}
                <div className="relative">
                  <textarea
                    value={jobDescription}
                    onChange={(e) => {
                      setJobDescription(e.target.value);
                      if (jdError) setJdError(false);
                    }}
                    placeholder="Paste the Target Job Description here&#10;(Required for FAANG Combat Simulation)..."
                    rows={4}
                    className={`
                      w-full bg-neutral-900 rounded-xl p-4
                      text-sm text-neutral-300 placeholder:text-neutral-600
                      border transition-all duration-300
                      focus:outline-none resize-none
                      leading-relaxed
                      ${jdError
                        ? "border-red-500/60 focus:border-red-500 bg-red-500/5"
                        : jobDescription.length > 50
                          ? "border-green-500/30 focus:border-green-500/50"
                          : "border-neutral-800 focus:border-neutral-500"
                      }
                    `}
                  />
                  {jobDescription.length === 0 && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 pointer-events-none">
                      <kbd className="px-1.5 py-0.5 rounded text-neutral-700 bg-neutral-800 text-xs font-mono">
                        ⌘V
                      </kbd>
                    </div>
                  )}
                  {jobDescription.length > 50 && (
                    <div className="absolute top-3 right-3 pointer-events-none">
                      <CheckCircle size={14} className="text-green-400" />
                    </div>
                  )}
                </div>

                {/* Error message */}
                <div className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg
                  border border-red-500/30 bg-red-500/5
                  transition-all duration-300 ease-in-out
                  ${jdError ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 hidden"}
                `}>
                  <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-400">
                    Paste a Job Description before uploading — 
                    S.P.A.R.T.A. needs a target to calculate Combat Readiness.
                  </p>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed px-1">
                  💡 Copy the full JD from LinkedIn, Greenhouse, or Lever. 
                  More detail = more accurate FAANG simulation.
                </p>
              </div>

              <AnimatePresence>
                {appState === "error" && errorMessage && (
                  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-neutral-950 border border-red-900/60 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-5 text-center"
                    >
                      <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800/60 text-red-500 flex items-center justify-center">
                        <AlertTriangle size={24} />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold text-white tracking-wide">Document Rejected</h3>
                        <p className="text-sm text-red-300/90 leading-relaxed font-medium">
                          {errorMessage}
                        </p>
                      </div>
                      <button
                        onClick={handleReset}
                        className="mt-2 w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all text-xs font-mono uppercase tracking-wider shadow-lg cursor-pointer"
                      >
                        ← Got It / Upload Another Resume
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full"
            >
              <SkeletonDashboard />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="absolute bottom-6 text-xs text-neutral-700 font-mono tracking-widest"
      >
        SMART PLATFORM FOR ADVERSARIAL READINESS &amp; TECHNICAL ASSESSMENT
      </motion.p>
    </main>
  );
}
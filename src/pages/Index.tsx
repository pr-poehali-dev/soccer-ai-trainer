import { useState, useRef, useCallback, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// ── Types ────────────────────────────────────────────────────────────────────

interface Attachment {
  type: "image" | "video";
  url: string;
  name: string;
}

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  attachment?: Attachment;
  timestamp: Date;
  analysisResult?: AnalysisResult;
}

interface AnalysisResult {
  scores: { label: string; value: number; status: "good" | "warn" | "bad" }[];
  angles: { name: string; value: number; threshold: number }[];
  notes: string[];
}

interface Thresholds {
  elbowMin: number;
  hipMin: number;
  kneeMin: number;
  shoulderMax: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  good: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
};

const MOCK_ANALYSIS: AnalysisResult = {
  scores: [
    { label: "Техника удара", value: 78, status: "good" },
    { label: "Стабильность стойки", value: 61, status: "warn" },
    { label: "Скорость руки", value: 42, status: "bad" },
    { label: "Баланс корпуса", value: 85, status: "good" },
  ],
  angles: [
    { name: "Угол локтя (прав.)", value: 98, threshold: 110 },
    { name: "Угол колена (лев.)", value: 142, threshold: 130 },
    { name: "Наклон корпуса", value: 17, threshold: 20 },
    { name: "Плечо (прав.)", value: 34, threshold: 45 },
  ],
  notes: [
    "Угол локтя ниже нормы на 12° — рекомендую отработать выпрямление",
    "Хорошая работа бёдер, правильная ротация",
    "Плечо поднято — риск травмы при продолжении",
  ],
};

const AI_REPLIES: Record<string, string[]> = {
  default: [
    "Проанализировал материал. Техника в целом на хорошем уровне, но есть точки роста — посмотри детали ниже.",
    "Вижу несколько моментов для улучшения. Особенно обращу внимание на работу локтя — угол ниже оптимального.",
    "Общая оценка: стойка устойчивая, но скорость руки можно увеличить за счёт правильной ротации бедра.",
  ],
  greeting: [
    "Привет! Загружай видео или фото удара — разберём технику детально.",
    "Здравствуй! Готов к анализу. Прикрепи материал и задай вопрос.",
  ],
  speed: [
    "Скорость удара зависит от нескольких факторов: ротация бедра, работа плеча и финальный щелчок запястья. Попробуй сначала отработать без скорости, с правильной механикой.",
    "Для увеличения скорости ключевой момент — своевременная ротация корпуса, а не только работа руки.",
  ],
  elbow: [
    "Угол локтя критически важен для силы удара. Оптимальный диапазон — 110–130° в момент контакта. Рекомендую упражнение с резиновой лентой.",
    "По локтю: держи руку ближе к телу на начальной фазе — это автоматически улучшит угол.",
  ],
  balance: [
    "Баланс — основа всего. Попробуй упражнения на одной ноге: 30 сек стойка, затем динамические перемещения.",
    "Для улучшения баланса советую работу с балансировочной доской 10–15 минут до тренировки.",
  ],
};

function getAiReply(text: string, hasAttachment: boolean): { text: string; analysis?: AnalysisResult } {
  const lower = text.toLowerCase();
  let replies = AI_REPLIES.default;
  if (/привет|здравствуй|добрый|хай/.test(lower)) replies = AI_REPLIES.greeting;
  else if (/скорост|быстр/.test(lower)) replies = AI_REPLIES.speed;
  else if (/локот|elbow/.test(lower)) replies = AI_REPLIES.elbow;
  else if (/баланс|равновес/.test(lower)) replies = AI_REPLIES.balance;
  const reply = replies[Math.floor(Math.random() * replies.length)];
  return { text: reply, analysis: hasAttachment ? MOCK_ANALYSIS : undefined };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ value, status }: { value: number; status: "good" | "warn" | "bad" }) {
  const color = STATUS_COLOR[status];
  return (
    <div className="relative h-1 bg-secondary rounded-full overflow-hidden">
      <div className="absolute left-0 top-0 h-full rounded-full score-bar"
        style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}60` }} />
    </div>
  );
}

function AnalysisCard({ result }: { result: AnalysisResult }) {
  return (
    <div className="mt-3 rounded-xl border border-border overflow-hidden" style={{ background: "hsl(216 18% 10%)" }}>
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Icon name="Activity" size={12} style={{ color: "hsl(204 80% 52%)" }} />
        <span className="text-xs font-semibold" style={{ color: "hsl(204 80% 52%)" }}>Результаты анализа</span>
      </div>
      <div className="p-3 space-y-3">
        {result.scores.map((s, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-xs font-mono-custom font-semibold" style={{ color: STATUS_COLOR[s.status] }}>{s.value}%</span>
            </div>
            <ScoreBar value={s.value} status={s.status} />
          </div>
        ))}
        <Separator className="bg-border" />
        <div className="space-y-1.5">
          {result.angles.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: a.value >= a.threshold ? "#4ade80" : "#f87171" }} />
              <span className="text-muted-foreground flex-1">{a.name}</span>
              <span className="font-mono-custom" style={{ color: a.value >= a.threshold ? "#4ade80" : "#f87171" }}>{a.value}°</span>
              <span className="font-mono-custom text-muted-foreground">/{a.threshold}°</span>
            </div>
          ))}
        </div>
        <Separator className="bg-border" />
        <div className="space-y-1.5">
          {result.notes.map((n, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Icon name="ChevronRight" size={11} className="mt-0.5 flex-shrink-0" style={{ color: "hsl(204 80% 52%)" }} />
              <span>{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  return (
    <div className="relative rounded-xl overflow-hidden h-36 max-w-[200px] mb-2">
      {attachment.type === "image" ? (
        <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
      ) : (
        <video src={attachment.url} className="h-full w-full object-cover" />
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs truncate font-mono-custom"
        style={{ background: "rgba(0,0,0,0.65)", color: "#aaa" }}>
        {attachment.name}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} animate-fade-in`}>
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
        style={{ background: isUser ? "hsl(216 14% 22%)" : "hsl(204 80% 52%)" }}>
        {isUser
          ? <Icon name="User" size={13} className="text-muted-foreground" />
          : <Icon name="Activity" size={13} className="text-background" />
        }
      </div>
      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        <div className="text-xs text-muted-foreground font-mono-custom px-1">
          {isUser ? "Тренер" : "Strike AI"} · {msg.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"}`}
          style={{
            background: isUser ? "hsl(216 14% 20%)" : "hsl(216 16% 16%)",
            border: `1px solid ${isUser ? "hsl(216 14% 26%)" : "hsl(216 14% 22%)"}`,
            color: "hsl(210 20% 85%)",
          }}>
          {msg.attachment && <AttachmentPreview attachment={msg.attachment} />}
          <p>{msg.text}</p>
          {msg.analysisResult && <AnalysisCard result={msg.analysisResult} />}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: "hsl(204 80% 52%)" }}>
        <Icon name="Activity" size={13} className="text-background" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5"
        style={{ background: "hsl(216 16% 16%)", border: "1px solid hsl(216 14% 22%)" }}>
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse-soft"
            style={{ background: "hsl(204 80% 52%)", animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([{
    id: "0",
    role: "ai",
    text: "Привет! Я Strike AI — помогу проанализировать технику удара. Загрузи видео или фото и задай вопрос.",
    timestamp: new Date(),
  }]);
  const [inputText, setInputText]     = useState("");
  const [attachment, setAttachment]   = useState<Attachment | null>(null);
  const [isTyping, setIsTyping]       = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "settings">("chat");
  const [thresholds, setThresholds]   = useState<Thresholds>({ elbowMin: 110, hipMin: 30, kneeMin: 130, shoulderMax: 45 });

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type: Attachment["type"] = file.type.startsWith("image/") ? "image" : "video";
    setAttachment({ type, url: URL.createObjectURL(file), name: file.name });
    e.target.value = "";
  }, []);

  const removeAttachment = useCallback(() => {
    if (attachment) URL.revokeObjectURL(attachment.url);
    setAttachment(null);
  }, [attachment]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text && !attachment) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: text || `Прикреплён файл: ${attachment?.name}`,
      attachment: attachment ?? undefined,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setAttachment(null);
    setIsTyping(true);

    setTimeout(() => {
      const { text: replyText, analysis } = getAiReply(userMsg.text, !!userMsg.attachment);
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "ai",
        text: replyText,
        timestamp: new Date(),
        analysisResult: analysis,
      }]);
    }, 900 + Math.random() * 1100);
  }, [inputText, attachment]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  const handleSaveReport = useCallback(() => {
    const last = [...messages].reverse().find(m => m.analysisResult);
    if (!last) return;
    const r = last.analysisResult!;
    const lines = [
      `ОТЧЁТ АНАЛИЗА — ${new Date().toLocaleString("ru-RU")}`, "",
      "ОЦЕНКИ:", ...r.scores.map(s => `  ${s.label}: ${s.value}%`), "",
      "УГЛЫ СУСТАВОВ:", ...r.angles.map(a => `  ${a.name}: ${a.value}° (порог ${a.threshold}°)`), "",
      "ЗАМЕТКИ:", ...r.notes.map(n => `  • ${n}`), "",
      "ПОРОГИ:", `  Локоть мин.: ${thresholds.elbowMin}°`, `  Бедро мин.: ${thresholds.hipMin}°`,
      `  Колено мин.: ${thresholds.kneeMin}°`, `  Плечо макс.: ${thresholds.shoulderMax}°`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `strike-report-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [messages, thresholds]);

  const canSend = !!(inputText.trim() || attachment);
  const hasAnalysis = messages.some(m => m.analysisResult);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(216 18% 9%)" }}>

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0"
        style={{ background: "hsl(216 18% 11%)" }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: "hsl(204 80% 52%)" }}>
            <Icon name="Activity" size={15} className="text-background" />
          </div>
          <span className="font-semibold tracking-tight" style={{ fontFamily: "'IBM Plex Sans'" }}>Strike Analyzer</span>
          <Badge variant="outline" className="text-xs font-mono-custom border-border text-muted-foreground">AI</Badge>
        </div>

        <div className="flex items-center gap-1">
          {(["chat", "settings"] as const).map(tab => (
            <button key={tab} onClick={() => setActivePanel(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activePanel === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={activePanel === tab ? { background: "hsl(216 14% 20%)" } : {}}>
              <Icon name={tab === "chat" ? "MessageSquare" : "SlidersHorizontal"} size={12} />
              {tab === "chat" ? "Чат" : "Настройки"}
            </button>
          ))}
          {hasAnalysis && (
            <button onClick={handleSaveReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="Download" size={12} />
              Отчёт
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Chat */}
        {activePanel === "chat" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 max-w-3xl mx-auto w-full">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-border px-4 py-3" style={{ background: "hsl(216 18% 11%)" }}>
              <div className="max-w-3xl mx-auto">
                {attachment && (
                  <div className="mb-2 flex items-start">
                    <div className="relative">
                      <div className="rounded-xl overflow-hidden h-20 max-w-[120px]">
                        {attachment.type === "image"
                          ? <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                          : <video src={attachment.url} className="h-full w-full object-cover" />
                        }
                      </div>
                      <button onClick={removeAttachment}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "hsl(4 70% 52%)", color: "#fff" }}>
                        <Icon name="X" size={10} />
                      </button>
                      <div className="text-xs text-muted-foreground font-mono-custom mt-1 max-w-[120px] truncate">{attachment.name}</div>
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors mb-0.5"
                    style={{ background: "hsl(216 14% 20%)", border: "1px solid hsl(216 14% 26%)" }}
                    title="Прикрепить фото или видео">
                    <Icon name="Paperclip" size={16} className="text-muted-foreground" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />

                  <Textarea
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Спросите про технику удара..."
                    rows={1}
                    className="flex-1 resize-none text-sm leading-relaxed min-h-[40px] max-h-[120px] overflow-y-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                    style={{
                      background: "hsl(216 14% 17%)",
                      border: "1px solid hsl(216 14% 24%)",
                      color: "hsl(210 20% 85%)",
                      borderRadius: "14px",
                      padding: "9px 14px",
                    }}
                  />

                  <Button onClick={sendMessage} disabled={!canSend} size="sm"
                    className="flex-shrink-0 w-9 h-9 rounded-xl p-0 mb-0.5 border-none"
                    style={{
                      background: canSend ? "hsl(204 80% 52%)" : "hsl(216 14% 20%)",
                      color: canSend ? "hsl(216 18% 8%)" : "hsl(215 15% 40%)",
                      transition: "background 0.2s",
                    }}>
                    <Icon name="ArrowUp" size={16} />
                  </Button>
                </div>

                <p className="text-xs text-center mt-2 font-mono-custom" style={{ color: "hsl(215 15% 35%)" }}>
                  Enter — отправить · Shift+Enter — перенос строки
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        {activePanel === "settings" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-md mx-auto space-y-4 animate-fade-in">
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-foreground mb-1">Пороговые значения углов</h2>
                <p className="text-xs text-muted-foreground">Влияют на оценку техники в результатах анализа.</p>
              </div>

              {([
                { key: "elbowMin"    as keyof Thresholds, label: "Локоть — минимум",  min: 60,  max: 180 },
                { key: "hipMin"      as keyof Thresholds, label: "Бедро — минимум",   min: 0,   max: 90  },
                { key: "kneeMin"     as keyof Thresholds, label: "Колено — минимум",  min: 90,  max: 170 },
                { key: "shoulderMax" as keyof Thresholds, label: "Плечо — максимум",  min: 10,  max: 90  },
              ] as const).map(({ key, label, min, max }) => (
                <div key={key} className="panel p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-foreground">{label}</label>
                    <span className="font-mono-custom text-sm font-semibold" style={{ color: "hsl(204 80% 52%)" }}>
                      {thresholds[key]}°
                    </span>
                  </div>
                  <Slider min={min} max={max} step={1} value={[thresholds[key]]}
                    onValueChange={([v]) => setThresholds(prev => ({ ...prev, [key]: v }))} />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono-custom">
                    <span>{min}°</span><span>{max}°</span>
                  </div>
                </div>
              ))}

              <Button variant="outline" size="sm" className="w-full gap-2 mt-2"
                onClick={() => setThresholds({ elbowMin: 110, hipMin: 30, kneeMin: 130, shoulderMax: 45 })}>
                <Icon name="RotateCcw" size={13} />
                Сбросить к умолчаниям
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

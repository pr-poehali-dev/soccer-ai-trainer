import { useState, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface AnalysisResult {
  timestamp: string;
  frame: number;
  scores: {
    label: string;
    value: number;
    status: "good" | "warn" | "bad";
    unit?: string;
  }[];
  notes: string[];
  angles: { name: string; value: number; threshold: number }[];
}

interface Thresholds {
  elbowMin: number;
  hipMin: number;
  kneeMin: number;
  shoulderMax: number;
}

const SKELETON_POINTS = {
  nose:          { x: 200, y: 55 },
  leftShoulder:  { x: 158, y: 118 },
  rightShoulder: { x: 242, y: 118 },
  leftElbow:     { x: 128, y: 188 },
  rightElbow:    { x: 272, y: 183 },
  leftWrist:     { x: 108, y: 252 },
  rightWrist:    { x: 292, y: 246 },
  leftHip:       { x: 163, y: 242 },
  rightHip:      { x: 237, y: 242 },
  leftKnee:      { x: 153, y: 322 },
  rightKnee:     { x: 247, y: 320 },
  leftAnkle:     { x: 146, y: 400 },
  rightAnkle:    { x: 254, y: 398 },
};

type PointKey = keyof typeof SKELETON_POINTS;

const SKELETON_CONNECTIONS: [PointKey, PointKey][] = [
  ["nose", "leftShoulder"], ["nose", "rightShoulder"],
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"], ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"],
];

const STATUS_COLOR: Record<string, string> = {
  good: "#4ade80",
  warn: "#fbbf24",
  bad:  "#f87171",
};

function SkeletonOverlay({ animate }: { animate: boolean }) {
  const pts = SKELETON_POINTS;
  return (
    <svg
      viewBox="0 0 400 460"
      className={`absolute inset-0 w-full h-full pointer-events-none ${animate ? "skeleton-svg" : ""}`}
      style={{ zIndex: 10 }}
    >
      {SKELETON_CONNECTIONS.map(([a, b], i) => (
        <line
          key={i}
          x1={pts[a].x} y1={pts[a].y}
          x2={pts[b].x} y2={pts[b].y}
          stroke="#4ade80"
          strokeWidth={2}
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 3px rgba(74,222,128,0.6))" }}
        />
      ))}
      {Object.entries(pts).map(([key, { x, y }]) => (
        <circle
          key={key}
          cx={x} cy={y} r={5}
          fill="#4ade80"
          style={{ filter: "drop-shadow(0 0 6px rgba(74,222,128,0.8))" }}
        />
      ))}
    </svg>
  );
}

function ScoreBar({ value, status }: { value: number; status: "good" | "warn" | "bad" }) {
  const color = STATUS_COLOR[status];
  return (
    <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full rounded-full score-bar"
        style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}80` }}
      />
    </div>
  );
}

function AngleMeter({ name, value, threshold }: { name: string; value: number; threshold: number }) {
  const ok = value >= threshold;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: ok ? "#4ade80" : "#f87171", boxShadow: `0 0 6px ${ok ? "#4ade8080" : "#f8717180"}` }}
      />
      <span className="text-xs text-muted-foreground flex-1">{name}</span>
      <span className="font-mono-custom text-xs font-medium" style={{ color: ok ? "#4ade80" : "#f87171" }}>
        {value}°
      </span>
      <span className="font-mono-custom text-xs text-muted-foreground">/{threshold}°</span>
    </div>
  );
}

const MOCK_RESULT: AnalysisResult = {
  timestamp: "00:02:14",
  frame: 3242,
  scores: [
    { label: "Техника удара",       value: 78, status: "good", unit: "%" },
    { label: "Стабильность стойки", value: 61, status: "warn", unit: "%" },
    { label: "Скорость руки",       value: 42, status: "bad",  unit: "%" },
    { label: "Баланс корпуса",      value: 85, status: "good", unit: "%" },
  ],
  notes: [
    "Угол локтя ниже нормы на 12°",
    "Хорошая работа бёдер",
    "Плечо поднято — риск травмы",
  ],
  angles: [
    { name: "Угол локтя (прав.)",  value: 98,  threshold: 110 },
    { name: "Угол колена (лев.)",  value: 142, threshold: 130 },
    { name: "Наклон корпуса",      value: 17,  threshold: 20  },
    { name: "Плечо (прав.)",       value: 34,  threshold: 45  },
  ],
};

export default function Index() {
  const [videoSrc, setVideoSrc]   = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [analyzed, setAnalyzed]   = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult]       = useState<AnalysisResult | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds>({
    elbowMin: 110,
    hipMin: 30,
    kneeMin: 130,
    shoulderMax: 45,
  });
  const [activeTab, setActiveTab] = useState<"results" | "settings">("results");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      setVideoSrc(URL.createObjectURL(file));
      setVideoName(file.name);
      setAnalyzed(false);
      setResult(null);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoSrc(URL.createObjectURL(file));
      setVideoName(file.name);
      setAnalyzed(false);
      setResult(null);
    }
  }, []);

  const handleAnalyze = useCallback(() => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed(true);
      setResult(MOCK_RESULT);
      setActiveTab("results");
    }, 1800);
  }, []);

  const handleSaveReport = useCallback(() => {
    if (!result) return;
    const lines = [
      `ОТЧЁТ АНАЛИЗА — ${new Date().toLocaleString("ru-RU")}`,
      `Файл: ${videoName}`,
      `Кадр: ${result.frame}  |  Тайм-код: ${result.timestamp}`,
      "",
      "ОЦЕНКИ:",
      ...result.scores.map(s => `  ${s.label}: ${s.value}${s.unit ?? ""}`),
      "",
      "УГЛЫ СУСТАВОВ:",
      ...result.angles.map(a => `  ${a.name}: ${a.value}° (порог ${a.threshold}°)`),
      "",
      "ЗАМЕТКИ:",
      ...result.notes.map(n => `  • ${n}`),
      "",
      "НАСТРОЙКИ ПОРОГОВ:",
      `  Локоть мин.: ${thresholds.elbowMin}°`,
      `  Бедро мин.: ${thresholds.hipMin}°`,
      `  Колено мин.: ${thresholds.kneeMin}°`,
      `  Плечо макс.: ${thresholds.shoulderMax}°`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `strike-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, videoName, thresholds]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(216 18% 9%)" }}>
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b border-border"
        style={{ background: "hsl(216 18% 11%)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: "hsl(204 80% 52%)" }}
          >
            <Icon name="Activity" size={16} className="text-background" />
          </div>
          <span className="font-semibold tracking-tight text-foreground" style={{ fontFamily: "'IBM Plex Sans'" }}>
            Strike Analyzer
          </span>
          <Badge variant="outline" className="text-xs font-mono-custom border-border text-muted-foreground">
            v1.0
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono-custom">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: analyzed ? "#4ade80" : "#fbbf24",
              boxShadow: analyzed ? "0 0 6px #4ade8080" : "0 0 6px #fbbf2480",
            }}
          />
          {analyzed ? "Анализ завершён" : videoSrc ? "Видео загружено" : "Ожидание видео"}
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 gap-0 overflow-hidden" style={{ height: "calc(100vh - 53px)" }}>

        {/* ── Left: Video ── */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-border">
          <div className="flex-1 relative overflow-hidden" style={{ background: "hsl(216 18% 8%)" }}>
            {!videoSrc ? (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer group"
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div
                  className="w-16 h-16 rounded-2xl border-2 border-dashed border-border flex items-center justify-center group-hover:border-primary transition-colors"
                  style={{ background: "hsl(216 16% 13%)" }}
                >
                  <Icon name="Upload" size={28} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Перетащите видео сюда</p>
                  <p className="text-xs text-muted-foreground mt-1">или нажмите для выбора файла</p>
                  <p className="text-xs text-muted-foreground mt-0.5">MP4, MOV, AVI</p>
                </div>
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  className="max-w-full max-h-full object-contain"
                />
                {showSkeleton && <SkeletonOverlay animate={analyzed} />}
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-t border-border"
            style={{ background: "hsl(216 16% 13%)" }}
          >
            {videoSrc ? (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1 min-w-0">
                  <Icon name="Film" size={13} />
                  <span className="truncate font-mono-custom">{videoName}</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1.5"
                  onClick={() => setShowSkeleton(!showSkeleton)}
                >
                  <Icon name={showSkeleton ? "Eye" : "EyeOff"} size={13} />
                  Скелет
                </Button>

                <Button
                  size="sm"
                  className="h-7 px-3 text-xs gap-1.5 font-medium"
                  style={{ background: "hsl(204 80% 52%)", color: "hsl(216 18% 8%)" }}
                  onClick={handleAnalyze}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <><Icon name="Loader2" size={13} className="animate-spin" />Анализ...</>
                  ) : (
                    <><Icon name="ScanSearch" size={13} />Анализ кадра</>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => { setVideoSrc(null); setAnalyzed(false); setResult(null); }}
                >
                  <Icon name="X" size={13} />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="FolderOpen" size={13} />
                  Открыть видео
                </Button>
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
              </>
            )}
          </div>
        </div>

        {/* ── Right: Analysis panel ── */}
        <div className="flex flex-col w-80 flex-shrink-0" style={{ background: "hsl(216 16% 12%)" }}>
          {/* Tabs */}
          <div className="flex border-b border-border">
            {(["results", "settings"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab ? "text-foreground border-b-2" : "text-muted-foreground hover:text-foreground"
                }`}
                style={activeTab === tab ? { borderBottomColor: "hsl(204 80% 52%)" } : {}}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Icon name={tab === "results" ? "BarChart3" : "SlidersHorizontal"} size={12} />
                  {tab === "results" ? "Результаты" : "Настройки"}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Results Tab ── */}
            {activeTab === "results" && (
              <div className="p-4 space-y-4 animate-fade-in">
                {!result ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl border border-border flex items-center justify-center"
                      style={{ background: "hsl(216 16% 16%)" }}
                    >
                      <Icon name="ScanSearch" size={22} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {videoSrc ? "Нажмите «Анализ кадра»" : "Загрузите видео для анализа"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-mono-custom">Кадр #{result.frame}</span>
                      <span className="flex items-center gap-1.5 text-xs font-mono-custom" style={{ color: "hsl(204 80% 52%)" }}>
                        <Icon name="Clock" size={11} />{result.timestamp}
                      </span>
                    </div>

                    {/* Scores */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Оценки</p>
                      {result.scores.map((s, i) => (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{s.label}</span>
                            <span className="text-xs font-semibold font-mono-custom" style={{ color: STATUS_COLOR[s.status] }}>
                              {s.value}{s.unit}
                            </span>
                          </div>
                          <ScoreBar value={s.value} status={s.status} />
                        </div>
                      ))}
                    </div>

                    <Separator className="bg-border" />

                    {/* Angles */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Углы суставов</p>
                      {result.angles.map((a, i) => <AngleMeter key={i} {...a} />)}
                    </div>

                    <Separator className="bg-border" />

                    {/* Notes */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Заметки</p>
                      {result.notes.map((note, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Icon name="ChevronRight" size={12} className="mt-0.5 flex-shrink-0" style={{ color: "hsl(204 80% 52%)" }} />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>

                    <Separator className="bg-border" />

                    <Button
                      className="w-full h-8 text-xs gap-2"
                      style={{ background: "hsl(216 14% 20%)", color: "hsl(210 20% 80%)", border: "1px solid hsl(216 14% 26%)" }}
                      onClick={handleSaveReport}
                    >
                      <Icon name="Download" size={13} />
                      Сохранить отчёт .txt
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* ── Settings Tab ── */}
            {activeTab === "settings" && (
              <div className="p-4 space-y-5 animate-fade-in">
                <p className="text-xs text-muted-foreground">Пороговые значения углов для оценки техники</p>

                {([
                  { key: "elbowMin"    as keyof Thresholds, label: "Локоть — минимум",  min: 60,  max: 180 },
                  { key: "hipMin"      as keyof Thresholds, label: "Бедро — минимум",   min: 0,   max: 90  },
                  { key: "kneeMin"     as keyof Thresholds, label: "Колено — минимум",  min: 90,  max: 170 },
                  { key: "shoulderMax" as keyof Thresholds, label: "Плечо — максимум",  min: 10,  max: 90  },
                ] as const).map(({ key, label, min, max }) => (
                  <div key={key} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-foreground">{label}</label>
                      <span className="font-mono-custom text-xs font-medium" style={{ color: "hsl(204 80% 52%)" }}>
                        {thresholds[key]}°
                      </span>
                    </div>
                    <Slider
                      min={min}
                      max={max}
                      step={1}
                      value={[thresholds[key]]}
                      onValueChange={([v]) => setThresholds(prev => ({ ...prev, [key]: v }))}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground font-mono-custom">
                      <span>{min}°</span>
                      <span>{max}°</span>
                    </div>
                    <Separator className="bg-border" />
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-2"
                  onClick={() => setThresholds({ elbowMin: 110, hipMin: 30, kneeMin: 130, shoulderMax: 45 })}
                >
                  <Icon name="RotateCcw" size={12} />
                  Сбросить к умолчаниям
                </Button>
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="px-4 py-2 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono-custom">
              {analyzed ? `Кадр ${result?.frame}` : "—"}
            </span>
            <div className="flex items-center gap-1.5">
              {result?.scores.map((s, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: STATUS_COLOR[s.status], boxShadow: `0 0 4px ${STATUS_COLOR[s.status]}80` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, AlertTriangle, ArrowUpRight, Bell, Check, ChevronDown, CircleDot,
  ClipboardCheck, Compass, Download, ExternalLink, FileImage, Filter, Gauge,
  ImagePlus, Layers, Layers3, LoaderCircle, MapPinned, Menu, Moon, MoreHorizontal,
  PanelLeftClose, Play, Plus, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, Sun, Target, Timer, UploadCloud, Volume2, VolumeX,
  Waves, X, Zap
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import {
  activity, confidenceSeries, currentMission, detections as initialDetections,
  getDetection, missions as initialMissions, modelRuns,
  type Detection, type DetectionCategory, type DetectionStatus, type Mission
} from "@/data/tarang";
import { subscribeToTelemetry, type TelemetryConnectionStatus, type TelemetryFrame } from "@/lib/tarangApi";
import { sounds } from "@/lib/soundEffects";
import { SONAR_PRESETS, runDualEngineInference, type SonarPreset } from "@/lib/sonarEngine";
import { exportCsv, exportGeoJson, printMissionBriefing } from "@/lib/evidenceExporter";
import { SonarSpatialCanvas3D } from "@/components/tarang/SonarSpatialCanvas3D";
import { VisionProHero } from "@/components/tarang/VisionProHero";
import {
  TactileButton, TactileCard, TactileSlider, TactileStepper,
  TactileSwitch, TactileTabs
} from "@/components/tarang/TactileControls";

// Navigation Groups
const navGroups = [
  {
    label: "Operate",
    items: [
      { href: "/", label: "Mission Control", icon: Compass },
      { href: "/review", label: "Review Workspace", icon: Target, count: 14 },
      { href: "/map", label: "Geotag Nautical Map", icon: MapPinned },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/missions", label: "Missions Log", icon: Waves },
      { href: "/detections", label: "Detections Library", icon: Layers3 },
      { href: "/model", label: "Model & Acoustic Health", icon: Gauge },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/reports", label: "Evidence & Exports", icon: ClipboardCheck },
      { href: "/settings", label: "Console Settings", icon: Settings2 },
    ],
  },
];

const pageMeta: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/": {
    eyebrow: "Acoustic Command · Mission M-042",
    title: "Good morning, Officer Sen.",
    description: "Arabian Sea Continental Shelf Survey. Side-scan sonar pipeline running active acoustic sweeps.",
  },
  "/review": {
    eyebrow: "Dual-Engine Sonar Inspection",
    title: "Sonar Review Workspace",
    description: "Validate side-scan sonar targets. Acoustic highlight-to-shadow physics filters out seabed rock false alarms.",
  },
  "/missions": {
    eyebrow: "Survey Operations · Fleet Telemetry",
    title: "Mission Logs",
    description: "Every tow-path transect, acoustic ping coverage, and confirmed marine debris target in one operational record.",
  },
  "/detections": {
    eyebrow: "Target Catalog · 395 Anomalies",
    title: "Detections Audit Library",
    description: "Search, filter, and audit all side-scan sonar detections with coordinates and physical dimensions.",
  },
  "/map": {
    eyebrow: "Geospatial Intelligence · Live Swath",
    title: "Geotag Nautical Map",
    description: "Geographic footprint of identified ghost nets, metal wreckage, and plastic debris along the Kochi shelf.",
  },
  "/model": {
    eyebrow: "Inference Architecture · YOLOv8m + Refiner",
    title: "Model & Acoustic Health",
    description: "Inspect precision-recall boundary, shadow-ratio calibration, and Edge AI inference latency.",
  },
  "/reports": {
    eyebrow: "Evidence Packages · GIS & Field Ready",
    title: "Evidence & Cleanup Briefings",
    description: "Generate GeoJSON footprints, CSV manifests, and printable operational briefs for cleanup vessels.",
  },
  "/settings": {
    eyebrow: "Field Preferences & Audio Design",
    title: "Console Settings",
    description: "Configure tactile theme, acoustic audio feedback, and Dual-Engine AI endpoints.",
  },
};

// Brand Logo
function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="TARANG Home">
      <span className="brand-mark">
        <Waves size={18} strokeWidth={2.4} />
        <span className="brand-diamond" />
      </span>
      {!compact && <span className="brand-word">TARANG</span>}
    </Link>
  );
}

// Status Pill
function StatusPill({ status }: { status: string }) {
  const norm = status.toLowerCase();
  const cls = norm.includes("confirm")
    ? "badge-confirmed"
    : norm.includes("review") || norm.includes("active")
    ? "badge-review"
    : norm.includes("flag")
    ? "badge-flagged"
    : "badge-rejected";
  return (
    <span className={`tactile-badge ${cls}`}>
      <span className="live-pulse-dot" style={{ width: 5, height: 5 }} />
      {status}
    </span>
  );
}

// KPI Card
function KpiCard({
  label,
  value,
  change,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  change: string;
  note: string;
  icon: typeof Activity;
}) {
  return (
    <TactileCard level={2} className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between text-muted text-xs">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="p-2 rounded-xl bg-surface-inset">
          <Icon size={16} className="text-primary dark:text-signal" />
        </span>
      </div>
      <div className="my-3 font-mono text-3xl font-bold text-foreground tracking-tight">
        {value}
      </div>
      <div className="flex items-center justify-between text-xs font-mono">
        <span className={change.startsWith("+") ? "text-green" : "text-amber"}>
          {change}
        </span>
        <span className="text-muted font-sans text-[11px]">{note}</span>
      </div>
    </TactileCard>
  );
}

// Mini Confidence Sparkline
function MiniChart() {
  const points = confidenceSeries
    .map((value, index) => `${index * 9.09},${94 - (value - 60) * 1.28}`)
    .join(" ");
  return (
    <svg className="w-full h-14 my-3" viewBox="0 0 100 48" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M 0 48 L ${points} L 100 48 Z`} fill="url(#chartGrad)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Interactive Leaflet Map Canvas
function MapCanvas({
  selectedId,
  onSelect,
  detectionsList,
}: {
  selectedId?: string;
  onSelect?: (id: string) => void;
  detectionsList: Detection[];
}) {
  const [LeafletMap, setLeafletMap] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    if (!document.querySelector("#leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    import("react-leaflet").then((rl) => {
      const { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } = rl;

      // Real survey transect along Kochi Outer Shelf
      const track: [number, number][] = [
        [9.985, 76.06],
        [9.9806, 76.068],
        [9.976, 76.074],
        [9.972, 76.081],
        [9.968, 76.087],
        [9.964, 76.094],
      ];

      const Component = () => (
        <MapContainer
          center={[9.973, 76.075]}
          zoom={13}
          style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline
            positions={track}
            pathOptions={{ color: "#0b4f55", weight: 3, dashArray: "6 5", opacity: 0.85 }}
          />
          {detectionsList.map((item) => {
            const parts = item.coordinates.match(
              /([\d.]+)°([\d.]+)'([\d.]+)"\s*N\s*([\d.]+)°([\d.]+)'([\d.]+)"\s*E/
            );
            if (!parts) return null;
            const lat =
              parseFloat(parts[1]) + parseFloat(parts[2]) / 60 + parseFloat(parts[3]) / 3600;
            const lon =
              parseFloat(parts[4]) + parseFloat(parts[5]) / 60 + parseFloat(parts[6]) / 3600;

            const isConf = item.status === "Confirmed";
            const isSel = item.id === selectedId;

            return (
              <CircleMarker
                key={item.id}
                center={[lat, lon]}
                radius={isSel ? 9 : 6}
                pathOptions={{
                  color: isSel ? "#ea580c" : isConf ? "#2d9c7e" : "#0b4f55",
                  fillColor: isSel ? "#f59e0b" : isConf ? "#2d9c7e" : "#0b4f55",
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="p-1 font-sans text-xs">
                    <strong className="block text-sm text-foreground">{item.label}</strong>
                    <span className="text-muted text-[11px] font-mono">
                      {item.id} · {item.confidence}% Conf
                    </span>
                    <div className="mt-1 font-semibold text-teal">{item.category}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted">{item.size}</div>
                    <button
                      className="mt-2 text-xs font-semibold text-primary underline block cursor-pointer"
                      onClick={() => onSelect?.(item.id)}
                    >
                      Inspect Sonar Return →
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      );
      setLeafletMap(() => Component);
    });
  }, [detectionsList, selectedId]);

  if (!LeafletMap) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#081a24] text-white/70">
        <LoaderCircle size={24} className="animate-spin text-teal" />
        <span className="text-xs font-mono">Loading Nautical Bathymetry Map…</span>
      </div>
    );
  }

  return <LeafletMap />;
}

// --------------------------------------------------------------------------
// MAIN APPLICATION COMPONENT
// --------------------------------------------------------------------------
export default function Home() {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();

  // App-wide data states
  const [detections, setDetections] = useState<Detection[]>(initialDetections);
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [selectedId, setSelectedId] = useState<string>("D-0842");
  const [soundEnabled, setSoundEnabled] = useState(sounds.isEnabled());
  const [railOpen, setRailOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Telemetry frame
  const [telemetry, setTelemetry] = useState<TelemetryFrame>({
    timestamp: new Date().toISOString(),
    mission_id: currentMission.id,
    position: { lat: 9.9706, lon: 76.0809 },
    depth_m: 42.1,
    altitude_m: 5.8,
    speed_knots: 2.4,
    heading_deg: 118,
    temperature_c: 26.8,
    ping_rate_hz: 18.4,
    signal_quality: 94.3,
  });

  // Review workspace states
  const [selectedPreset, setSelectedPreset] = useState<SonarPreset>(SONAR_PRESETS[0]);
  const [currentScanImage, setCurrentScanImage] = useState<string>(SONAR_PRESETS[0].generateDataUrl());
  const [currentScanName, setCurrentScanName] = useState<string>(SONAR_PRESETS[0].name);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeEngine, setActiveEngine] = useState<"python-yolo" | "edge-vision">("edge-vision");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [confidenceThreshold, setConfidenceThreshold] = useState(72);
  const [leeFilterActive, setLeeFilterActive] = useState(true);
  const [claheActive, setClaheActive] = useState(true);
  const [operatorNote, setOperatorNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync selected detection note
  const currentSelected = useMemo(() => {
    return detections.find((d) => d.id === selectedId) || detections[0];
  }, [detections, selectedId]);

  useEffect(() => {
    if (currentSelected?.note) {
      setOperatorNote(currentSelected.note);
    } else {
      setOperatorNote("");
    }
  }, [selectedId, currentSelected]);

  // Subscribe to live telemetry
  useEffect(() => {
    const sub = subscribeToTelemetry(
      (frame) => {
        setTelemetry(frame);
      },
      () => {}
    );
    return () => sub.close();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const toggleSound = () => {
    const res = sounds.toggle();
    setSoundEnabled(res);
  };

  // Status update handler (Confirm / Flag / Reject)
  const handleUpdateStatus = (id: string, newStatus: DetectionStatus) => {
    setDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus, note: operatorNote } : d))
    );
    if (newStatus === "Confirmed") sounds.playConfirm();
    else if (newStatus === "Flagged") sounds.playFlag();
    else sounds.playClick(600);

    showToast(`${id} marked as ${newStatus}`);
  };

  // Run Sonar Scan Analysis (Dual-Engine)
  const handleRunInference = async (customFile?: File) => {
    setIsAnalyzing(true);
    sounds.playSonarPing();

    try {
      const input = customFile || { name: currentScanName, dataUrl: currentScanImage };
      const res = await runDualEngineInference(input, telemetry);
      setActiveEngine(res.engine);

      // Merge new detections into list
      setDetections((prev) => {
        const existingIds = new Set(prev.map((d) => d.id));
        const newOnes = res.detections.filter((d) => !existingIds.has(d.id));
        return [...newOnes, ...prev];
      });

      if (res.detections.length > 0) {
        setSelectedId(res.detections[0].id);
      }

      showToast(
        `Analysis complete · ${res.detections.length} debris candidate returns detected via ${
          res.engine === "python-yolo" ? "Python YOLOv8" : "Edge Vision Engine"
        }`
      );
    } catch {
      showToast("Scan processed with standard acoustic thresholding.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Select Preset Scan
  const handleSelectPreset = (preset: SonarPreset) => {
    sounds.playClick();
    setSelectedPreset(preset);
    const dataUrl = preset.generateDataUrl();
    setCurrentScanImage(dataUrl);
    setCurrentScanName(preset.name);
    // Auto trigger analysis on preset load
    setTimeout(() => {
      handleRunInference();
    }, 200);
  };

  // Handle custom file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    sounds.playClick(1000);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const url = String(evt.target?.result);
      setCurrentScanImage(url);
      setCurrentScanName(file.name);
      showToast(`Uploaded ${file.name} — starting Dual-Engine Sonar scan...`);
      handleRunInference(file);
    };
    reader.readAsDataURL(file);
  };

  // Filtered queue items
  const queueItems = useMemo(() => {
    return detections.filter((d) => {
      const matchStatus = d.status === "Needs review" || d.status === "Flagged";
      const matchPriority = priorityFilter === "All" || d.priority === priorityFilter;
      const matchCat = categoryFilter === "All" || d.category === categoryFilter;
      const matchConf = d.confidence >= confidenceThreshold - 10;
      return matchStatus && matchPriority && matchCat && matchConf;
    });
  }, [detections, priorityFilter, categoryFilter, confidenceThreshold]);

  // Active Meta
  const meta = pageMeta[location] || pageMeta["/"];

  return (
    <div className="app-shell">
      {/* -------------------------------------------------------------------- */}
      {/* SIDEBAR NAVIGATION RAIL                                              */}
      {/* -------------------------------------------------------------------- */}
      <aside className={`side-rail ${railOpen ? "open" : ""}`}>
        <div className="rail-top">
          <Logo />
          <button className="rail-collapse md:hidden" onClick={() => setRailOpen(false)}>
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="rail-scroll">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map(({ href, label, icon: Icon, count }) => {
                const isActive = location === href;
                return (
                  <Link
                    href={href}
                    key={href}
                    className={`nav-item ${isActive ? "active" : ""}`}
                    onClick={() => {
                      sounds.playClick();
                      setRailOpen(false);
                    }}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    {count && <b>{queueItems.length}</b>}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="rail-bottom">
          <div className="system-status">
            <span className="live-pulse-dot" />
            <div>
              <strong>Edge AI Core Nominal</strong>
              <span>Latency 142ms · 450 kHz</span>
            </div>
          </div>
          <div className="user-card">
            <div className="avatar">AS</div>
            <div>
              <strong>Officer Anika Sen</strong>
              <span>Lead Marine Hydrographer</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Scrim for Mobile */}
      <AnimatePresence>
        {railOpen && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-35 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRailOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* -------------------------------------------------------------------- */}
      {/* MAIN VIEWPORT SHELL                                                  */}
      {/* -------------------------------------------------------------------- */}
      <main className="main-shell">
        {/* Topbar */}
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="topbar-icon-pill md:hidden"
              onClick={() => setRailOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="topbar-context">
              <span className="live-pulse-dot" style={{ width: 6, height: 6 }} />
              <span>MISSION M-042</span>
              <span className="opacity-40">/</span>
              <span>KOCHI OUTER SHELF</span>
            </div>
          </div>

          <div className="topbar-actions">
            {/* Audio Toggle */}
            <button
              className={`topbar-icon-pill ${soundEnabled ? "active" : ""}`}
              onClick={toggleSound}
              title={soundEnabled ? "Mute Feedback Audio" : "Enable Tactile Audio"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span className="hidden sm:inline">Audio FX</span>
            </button>

            {/* Theme Toggle */}
            <button
              className="topbar-icon-pill"
              onClick={() => {
                sounds.playClick();
                toggleTheme?.();
              }}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden sm:inline">
                {theme === "dark" ? "Studio Light" : "Abyss HUD"}
              </span>
            </button>

            <Link href="/review">
              <TactileButton variant="primary" size="sm" icon={<Target size={14} />}>
                Review Queue ({queueItems.length})
              </TactileButton>
            </Link>
          </div>
        </header>

        {/* Dynamic Route View Content */}
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {/* ========================================================== */}
              {/* ROUTE: / (MISSION CONTROL)                                 */}
              {/* ========================================================== */}
              {location === "/" && (
                <div>
                  {/* Reference Image 2: Vision Pro 3D Exhibition Studio Hero */}
                  <VisionProHero
                    onStartReview={() => setLocation("/review")}
                    onExploreMap={() => setLocation("/map")}
                  />

                  {/* Reference Image 1 & Pinterest: 3D Spatial Bathymetry & AUV Model */}
                  <div className="my-8">
                    <SonarSpatialCanvas3D
                      selectedId={selectedId}
                      onSelectTarget={(id) => {
                        setSelectedId(id);
                        setLocation("/review");
                      }}
                    />
                  </div>

                  {/* Tactile KPI Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                    <KpiCard
                      label="Acoustic Scans"
                      value="18,426"
                      change="+12.8%"
                      note="active transect frames"
                      icon={Activity}
                    />
                    <KpiCard
                      label="Confirmed Debris"
                      value={`${detections.filter((d) => d.status === "Confirmed").length + 78}`}
                      change="+18"
                      note="verified cleanup targets"
                      icon={ShieldCheck}
                    />
                    <KpiCard
                      label="Review Backlog"
                      value={`${queueItems.length}`}
                      change="+4"
                      note="awaiting confirmation"
                      icon={Timer}
                    />
                    <KpiCard
                      label="Swath Area"
                      value="8.7 km²"
                      change="+2.1 km²"
                      note="of 12.8 km² total target"
                      icon={Compass}
                    />
                  </div>

                  {/* Dashboard Split: Live Map Preview & Review Queue */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                    {/* Left: Interactive Map Preview */}
                    <div className="lg:col-span-2">
                      <TactileCard level={3} className="h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                              REAL-TIME SURVEY TRACK
                            </span>
                            <h3 className="text-xl font-bold text-foreground">
                              Kochi Outer Shelf Footprint
                            </h3>
                          </div>
                          <Link href="/map">
                            <TactileButton variant="secondary" size="sm" icon={<ExternalLink size={12} />}>
                              Expand Map
                            </TactileButton>
                          </Link>
                        </div>
                        <div className="w-full h-80 rounded-xl overflow-hidden shadow-inner">
                          <MapCanvas
                            selectedId={selectedId}
                            onSelect={(id) => {
                              setSelectedId(id);
                              setLocation("/review");
                            }}
                            detectionsList={detections}
                          />
                        </div>
                      </TactileCard>
                    </div>

                    {/* Right: Quick Review Queue Preview */}
                    <div>
                      <TactileCard level={3} className="h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber">
                              PRIORITY QUEUE
                            </span>
                            <h3 className="text-xl font-bold text-foreground">Needs Attention</h3>
                          </div>
                          <span className="tactile-badge badge-review font-mono">
                            {queueItems.length} Open
                          </span>
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto max-h-80 pr-1">
                          {queueItems.slice(0, 4).map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                sounds.playClick();
                                setSelectedId(item.id);
                                setLocation("/review");
                              }}
                              className="queue-card-item"
                            >
                              <div className="queue-card-main">
                                <strong>{item.label}</strong>
                                <span>{item.id} · {item.location}</span>
                              </div>
                              <div className="queue-card-conf">
                                <strong>{item.confidence}%</strong>
                                <span>Conf</span>
                              </div>
                            </button>
                          ))}
                        </div>

                        <div className="pt-4 border-t border-border mt-3">
                          <Link href="/review">
                            <TactileButton
                              variant="primary"
                              size="md"
                              className="w-full"
                              icon={<Play size={14} fill="currentColor" />}
                            >
                              Open Full Review Console
                            </TactileButton>
                          </Link>
                        </div>
                      </TactileCard>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* ROUTE: /review (SONAR WORKSPACE)                           */}
              {/* ========================================================== */}
              {location === "/review" && (
                <div>
                  <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                        {meta.eyebrow}
                      </span>
                      <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {meta.title}
                      </h1>
                      <p className="text-xs text-muted mt-1">{meta.description}</p>
                    </div>

                    {/* Presets & Scan Upload Actions */}
                    <div className="flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <TactileButton
                        variant="secondary"
                        size="md"
                        icon={<UploadCloud size={15} />}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload Sonar File
                      </TactileButton>
                      <TactileButton
                        variant="primary"
                        size="md"
                        icon={<Sparkles size={15} />}
                        onClick={() => handleRunInference()}
                        disabled={isAnalyzing}
                      >
                        {isAnalyzing ? "Processing Acoustic Mesh…" : "Run Live Inference"}
                      </TactileButton>
                    </div>
                  </div>

                  {/* Sonar Scan Presets Row (Instant 1-click test cases) */}
                  <div className="mb-4">
                    <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-muted mb-2">
                      Sample Sonar Acoustic Scans (1-Click Load):
                    </span>
                    <div className="sonar-presets-row">
                      {SONAR_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          className={`preset-chip-btn ${selectedPreset.id === p.id ? "active" : ""}`}
                          onClick={() => handleSelectPreset(p)}
                        >
                          <FileImage size={13} />
                          <span>{p.name}</span>
                          <span className="preset-chip-tag">{p.tag}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Workspace Main Grid */}
                  <div className="review-layout">
                    {/* Left: Queue Column */}
                    <div className="review-queue-panel">
                      <div className="review-queue-header">
                        <div className="queue-title-wrap">
                          <span className="text-[10px] font-mono uppercase text-muted">
                            QUEUE AUDIT
                          </span>
                          <h3>Candidate Returns</h3>
                        </div>
                        <span className="tactile-badge badge-review font-mono">
                          {queueItems.length}
                        </span>
                      </div>

                      {/* Filters */}
                      <div className="space-y-3 mb-4">
                        <div>
                          <span className="block text-[10px] font-mono text-muted mb-1">
                            PRIORITY
                          </span>
                          <div className="flex gap-2">
                            {["All", "High", "Medium", "Low"].map((p) => (
                              <button
                                key={p}
                                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                                  priorityFilter === p
                                    ? "bg-primary text-white border-primary"
                                    : "bg-surface-inset text-muted border-border"
                                }`}
                                onClick={() => {
                                  sounds.playClick();
                                  setPriorityFilter(p);
                                }}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="block text-[10px] font-mono text-muted mb-1">
                            CATEGORY
                          </span>
                          <select
                            value={categoryFilter}
                            onChange={(e) => {
                              sounds.playClick();
                              setCategoryFilter(e.target.value);
                            }}
                            className="w-full text-xs p-2 rounded-lg bg-surface-inset text-foreground border border-border outline-none"
                          >
                            <option value="All">All Categories</option>
                            <option value="Fishing gear">Fishing Gear</option>
                            <option value="Metal fragment">Metal Fragment</option>
                            <option value="Plastic mass">Plastic Mass</option>
                            <option value="Unknown object">Unknown Object</option>
                          </select>
                        </div>

                        <div>
                          <TactileSlider
                            label="Confidence Floor"
                            min={50}
                            max={95}
                            value={confidenceThreshold}
                            onChange={(val) => setConfidenceThreshold(val)}
                            unit="%"
                          />
                        </div>
                      </div>

                      {/* Queue List Scroll */}
                      <div className="queue-items-scroll">
                        {queueItems.map((item) => (
                          <button
                            key={item.id}
                            className={`queue-card-item ${item.id === selectedId ? "selected" : ""}`}
                            onClick={() => {
                              sounds.playClick();
                              setSelectedId(item.id);
                            }}
                          >
                            <div className="queue-card-main">
                              <strong>{item.label}</strong>
                              <span>{item.id} · {item.location}</span>
                            </div>
                            <div className="queue-card-conf">
                              <strong>{item.confidence}%</strong>
                              <span>{item.category.split(" ")[0]}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Right: Sonar Inspection Stage */}
                    <div className="sonar-inspector-wrap">
                      <div className="sonar-screen-panel">
                        <div className="sonar-screen-header">
                          <div className="flex items-center gap-3">
                            <span className="text-teal font-bold">{currentScanName}</span>
                            <span>·</span>
                            <span>450 kHz Side-Scan</span>
                            <span>·</span>
                            <span>Swath Width: 80 m</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-green font-mono">
                              Engine: {activeEngine === "python-yolo" ? "Python YOLOv8" : "Dual-Edge Vision"}
                            </span>
                          </div>
                        </div>

                        {/* Sonar Waterfall Canvas */}
                        <div
                          className="sonar-screen-canvas"
                          style={{ backgroundImage: `url(${currentScanImage})` }}
                        >
                          <div className="scanline-sweep" />

                          {/* Interactive Bounding Boxes */}
                          {detections.slice(0, 5).map((item) => {
                            const isSel = item.id === selectedId;
                            return (
                              <div
                                key={item.id}
                                className={`sonar-box-overlay ${isSel ? "selected" : ""}`}
                                style={{
                                  left: `${item.x}%`,
                                  top: `${item.y}%`,
                                  width: "90px",
                                  height: "55px",
                                }}
                                onClick={() => {
                                  sounds.playClick();
                                  setSelectedId(item.id);
                                }}
                              >
                                <span className="sonar-box-tag">
                                  {item.id} · {item.confidence}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Selected Detection Details & Operator Action Bar */}
                      <div className="inspection-detail-card">
                        <div className="inspection-detail-header">
                          <div>
                            <span className="text-[10px] font-mono uppercase text-muted">
                              TARGET INSPECTION · {currentSelected.id}
                            </span>
                            <h2 className="text-2xl font-bold text-foreground">
                              {currentSelected.label}
                            </h2>
                          </div>
                          <StatusPill status={currentSelected.status} />
                        </div>

                        <div className="inspection-detail-grid">
                          <div className="inspection-field">
                            <span>CLASSIFICATION</span>
                            <strong className="text-primary dark:text-signal">
                              {currentSelected.category}
                            </strong>
                          </div>
                          <div className="inspection-field">
                            <span>CONFIDENCE</span>
                            <strong>{currentSelected.confidence}% Acoustic</strong>
                          </div>
                          <div className="inspection-field">
                            <span>DIMENSIONS</span>
                            <strong>{currentSelected.size}</strong>
                          </div>
                          <div className="inspection-field">
                            <span>COORDINATES</span>
                            <strong className="font-mono text-xs">
                              {currentSelected.coordinates}
                            </strong>
                          </div>
                        </div>

                        {/* Field Notes Input */}
                        <textarea
                          className="inspection-textarea"
                          value={operatorNote}
                          onChange={(e) => setOperatorNote(e.target.value)}
                          placeholder="Log hydrographic observation for salvage crew (e.g. high snag risk, acoustic shadow verified)..."
                        />

                        {/* Operator Decision Actions */}
                        <div className="inspection-actions-row">
                          <TactileButton
                            variant="confirm"
                            size="md"
                            icon={<Check size={16} />}
                            onClick={() => handleUpdateStatus(currentSelected.id, "Confirmed")}
                          >
                            Confirm Debris
                          </TactileButton>

                          <TactileButton
                            variant="flag"
                            size="md"
                            icon={<AlertTriangle size={16} />}
                            onClick={() => handleUpdateStatus(currentSelected.id, "Flagged")}
                          >
                            Flag for Re-sweep
                          </TactileButton>

                          <TactileButton
                            variant="reject"
                            size="md"
                            icon={<X size={16} />}
                            onClick={() => handleUpdateStatus(currentSelected.id, "Rejected")}
                          >
                            Reject False Return
                          </TactileButton>

                          <Link href="/map" className="ml-auto">
                            <TactileButton
                              variant="secondary"
                              size="md"
                              icon={<MapPinned size={14} />}
                            >
                              Show on Nautical Map
                            </TactileButton>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* ROUTE: /map (NAUTICAL MAP)                                 */}
              {/* ========================================================== */}
              {location === "/map" && (
                <div>
                  <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                        {meta.eyebrow}
                      </span>
                      <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {meta.title}
                      </h1>
                      <p className="text-xs text-muted mt-1">{meta.description}</p>
                    </div>
                    <div className="flex gap-3">
                      <TactileButton
                        variant="primary"
                        size="md"
                        icon={<Download size={14} />}
                        onClick={() => {
                          sounds.playClick();
                          exportGeoJson(detections);
                          showToast("Downloaded GeoJSON nautical footprint!");
                        }}
                      >
                        Export GeoJSON Layer
                      </TactileButton>
                    </div>
                  </div>

                  <div className="map-full-panel">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4 text-xs font-mono">
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-green" /> Confirmed Debris (
                          {detections.filter((d) => d.status === "Confirmed").length})
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-amber" /> Needs Review (
                          {detections.filter((d) => d.status === "Needs review").length})
                        </span>
                      </div>
                      <span className="text-xs text-muted font-mono">
                        Datum: WGS84 · Kochi Outer Shelf
                      </span>
                    </div>

                    <div className="map-container-box">
                      <MapCanvas
                        selectedId={selectedId}
                        onSelect={(id) => {
                          setSelectedId(id);
                          setLocation("/review");
                        }}
                        detectionsList={detections}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* ROUTE: /missions (MISSIONS LOG)                            */}
              {/* ========================================================== */}
              {location === "/missions" && (
                <div>
                  <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                        {meta.eyebrow}
                      </span>
                      <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {meta.title}
                      </h1>
                      <p className="text-xs text-muted mt-1">{meta.description}</p>
                    </div>
                    <TactileButton
                      variant="primary"
                      size="md"
                      icon={<Plus size={15} />}
                      onClick={() => {
                        sounds.playClick();
                        showToast("Initiated New Mission Transect Planning wizard.");
                      }}
                    >
                      New Survey Mission
                    </TactileButton>
                  </div>

                  <div className="tactile-table-panel">
                    <div className="tactile-table-head">
                      <span>Mission & Vessel</span>
                      <span>Survey Area</span>
                      <span>Progress</span>
                      <span>Debris Identified</span>
                      <span>Status</span>
                      <span>Actions</span>
                    </div>
                    {missions.map((m) => (
                      <div key={m.id} className="tactile-table-row">
                        <div>
                          <strong className="block text-sm text-foreground">{m.name}</strong>
                          <span className="text-xs text-muted font-mono">
                            {m.id} · {m.vessel}
                          </span>
                        </div>
                        <span className="font-mono text-xs">{m.area}</span>
                        <div>
                          <span className="font-mono text-xs font-bold text-foreground">
                            {m.progress}%
                          </span>
                          <div className="w-24 h-1.5 bg-surface-inset rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${m.progress}%` }}
                            />
                          </div>
                        </div>
                        <span className="font-mono text-xs text-primary dark:text-signal font-bold">
                          {m.confirmed} Confirmed
                        </span>
                        <StatusPill status={m.status} />
                        <TactileButton
                          variant="secondary"
                          size="sm"
                          icon={<Target size={13} />}
                          onClick={() => {
                            sounds.playClick();
                            setLocation("/review");
                          }}
                        >
                          Inspect
                        </TactileButton>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* ROUTE: /detections (DETECTIONS LIBRARY)                    */}
              {/* ========================================================== */}
              {location === "/detections" && (
                <div>
                  <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                        {meta.eyebrow}
                      </span>
                      <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {meta.title}
                      </h1>
                      <p className="text-xs text-muted mt-1">{meta.description}</p>
                    </div>
                    <TactileButton
                      variant="primary"
                      size="md"
                      icon={<Download size={14} />}
                      onClick={() => {
                        sounds.playClick();
                        exportCsv(detections);
                        showToast("Exported full detections CSV manifest!");
                      }}
                    >
                      Export CSV Manifest
                    </TactileButton>
                  </div>

                  <div className="tactile-table-panel">
                    <div className="tactile-table-head">
                      <span>Target ID & Label</span>
                      <span>Classification</span>
                      <span>Confidence</span>
                      <span>Physical Size</span>
                      <span>Status</span>
                      <span>Inspect</span>
                    </div>
                    {detections.map((d) => (
                      <div key={d.id} className="tactile-table-row">
                        <div>
                          <strong className="block text-sm text-foreground">{d.label}</strong>
                          <span className="text-xs text-muted font-mono">
                            {d.id} · {d.coordinates}
                          </span>
                        </div>
                        <span className="text-xs font-semibold">{d.category}</span>
                        <span className="font-mono text-xs font-bold text-teal">
                          {d.confidence}%
                        </span>
                        <span className="font-mono text-xs">{d.size}</span>
                        <StatusPill status={d.status} />
                        <TactileButton
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            sounds.playClick();
                            setSelectedId(d.id);
                            setLocation("/review");
                          }}
                        >
                          Review
                        </TactileButton>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* ROUTE: /model (MODEL & ACOUSTIC HEALTH)                    */}
              {/* ========================================================== */}
              {location === "/model" && (
                <div>
                  <div className="mb-6">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                      {meta.eyebrow}
                    </span>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                      {meta.title}
                    </h1>
                    <p className="text-xs text-muted mt-1">{meta.description}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <TactileCard level={3}>
                      <span className="text-[10px] font-mono font-bold uppercase text-muted">
                        PRECISION SCORE
                      </span>
                      <div className="text-4xl font-mono font-bold text-green my-2">94.3%</div>
                      <p className="text-xs text-muted">
                        Acoustic shadow validation eliminates specular seabed false positives.
                      </p>
                      <MiniChart />
                    </TactileCard>

                    <TactileCard level={3}>
                      <span className="text-[10px] font-mono font-bold uppercase text-muted">
                        RECALL RATE
                      </span>
                      <div className="text-4xl font-mono font-bold text-primary dark:text-signal my-2">
                        91.8%
                      </div>
                      <p className="text-xs text-muted">
                        Detects low-reflectivity polymer synthetic mats down to 50m depth.
                      </p>
                      <MiniChart />
                    </TactileCard>

                    <TactileCard level={3}>
                      <span className="text-[10px] font-mono font-bold uppercase text-muted">
                        INFERENCE SPEED
                      </span>
                      <div className="text-4xl font-mono font-bold text-amber my-2">142 ms</div>
                      <p className="text-xs text-muted">
                        Runs on edge tow-fish microcontroller at 18.4 pings per second.
                      </p>
                      <MiniChart />
                    </TactileCard>
                  </div>

                  <div className="tactile-table-panel">
                    <h3 className="text-lg font-bold mb-4">Benchmark Evaluation History</h3>
                    <div className="tactile-table-head">
                      <span>Model Version</span>
                      <span>Run Date</span>
                      <span>Accuracy</span>
                      <span>Latency</span>
                      <span>Deployment</span>
                      <span>Status</span>
                    </div>
                    {modelRuns.map((r) => (
                      <div key={r.name} className="tactile-table-row">
                        <strong>{r.name}</strong>
                        <span className="text-xs text-muted">{r.date}</span>
                        <span className="font-mono text-xs text-green font-bold">{r.accuracy}</span>
                        <span className="font-mono text-xs">{r.latency}</span>
                        <span className="text-xs">Edge Tow-fish Micro</span>
                        <StatusPill status={r.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* ROUTE: /reports (EVIDENCE & EXPORTS)                       */}
              {/* ========================================================== */}
              {location === "/reports" && (
                <div>
                  <div className="mb-6">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                      {meta.eyebrow}
                    </span>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                      {meta.title}
                    </h1>
                    <p className="text-xs text-muted mt-1">{meta.description}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* GeoJSON Card */}
                    <TactileCard level={4} className="flex flex-col justify-between">
                      <div>
                        <div className="p-3 w-fit rounded-xl bg-surface-inset mb-4 text-primary dark:text-signal">
                          <Compass size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">
                          GeoJSON Spatial Layer
                        </h3>
                        <p className="text-xs text-muted leading-relaxed mb-6">
                          Standard geospatial FeatureCollection ready for QGIS, ArcGIS, or salvage
                          shipboard navigation systems.
                        </p>
                      </div>
                      <TactileButton
                        variant="primary"
                        size="md"
                        icon={<Download size={15} />}
                        onClick={() => {
                          sounds.playClick();
                          exportGeoJson(detections);
                          showToast("GeoJSON footprint downloaded!");
                        }}
                      >
                        Download GeoJSON
                      </TactileButton>
                    </TactileCard>

                    {/* CSV Audit Card */}
                    <TactileCard level={4} className="flex flex-col justify-between">
                      <div>
                        <div className="p-3 w-fit rounded-xl bg-surface-inset mb-4 text-green">
                          <Layers size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">
                          CSV Manifest Audit
                        </h3>
                        <p className="text-xs text-muted leading-relaxed mb-6">
                          Complete tabular inventory of every debris detection, acoustic confidence,
                          geotags, dimensions, and operator notes.
                        </p>
                      </div>
                      <TactileButton
                        variant="secondary"
                        size="md"
                        icon={<Download size={15} />}
                        onClick={() => {
                          sounds.playClick();
                          exportCsv(detections);
                          showToast("CSV manifest downloaded!");
                        }}
                      >
                        Download CSV Manifest
                      </TactileButton>
                    </TactileCard>

                    {/* Printable Briefing Card */}
                    <TactileCard level={4} className="flex flex-col justify-between">
                      <div>
                        <div className="p-3 w-fit rounded-xl bg-surface-inset mb-4 text-amber">
                          <ClipboardCheck size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">
                          Field Operations Briefing
                        </h3>
                        <p className="text-xs text-muted leading-relaxed mb-6">
                          Executive printable briefing with transect metrics, classification
                          breakdown, and priority salvage instructions.
                        </p>
                      </div>
                      <TactileButton
                        variant="secondary"
                        size="md"
                        icon={<ExternalLink size={15} />}
                        onClick={() => {
                          sounds.playClick();
                          printMissionBriefing(currentMission, detections);
                        }}
                      >
                        Print Mission Briefing
                      </TactileButton>
                    </TactileCard>
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* ROUTE: /settings (SETTINGS)                                */}
              {/* ========================================================== */}
              {location === "/settings" && (
                <div>
                  <div className="mb-6">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary dark:text-signal">
                      {meta.eyebrow}
                    </span>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                      {meta.title}
                    </h1>
                    <p className="text-xs text-muted mt-1">{meta.description}</p>
                  </div>

                  <div className="space-y-6 max-w-2xl">
                    <TactileCard level={3} className="space-y-4">
                      <h3 className="text-lg font-bold">Appearance Theme</h3>
                      <p className="text-xs text-muted">
                        Switch between Warm Sand Velvet Studio (as requested in reference designs)
                        and Abyss Tactical HUD.
                      </p>
                      <div className="flex gap-4">
                        <button
                          className={`tactile-btn ${theme === "light" ? "tactile-btn-primary" : "tactile-btn-secondary"}`}
                          onClick={() => {
                            sounds.playClick();
                            if (theme === "dark") toggleTheme?.();
                          }}
                        >
                          <Sun size={15} /> Warm Sand Studio (Default)
                        </button>
                        <button
                          className={`tactile-btn ${theme === "dark" ? "tactile-btn-primary" : "tactile-btn-secondary"}`}
                          onClick={() => {
                            sounds.playClick();
                            if (theme === "light") toggleTheme?.();
                          }}
                        >
                          <Moon size={15} /> Abyss Dark HUD
                        </button>
                      </div>
                    </TactileCard>

                    <TactileCard level={3} className="space-y-4">
                      <h3 className="text-lg font-bold">Sensory Audio Feedback</h3>
                      <p className="text-xs text-muted">
                        Synthesizes subtle mechanical clicks, sonar pings, and operator alerts via
                        the browser Web Audio API.
                      </p>
                      <TactileSwitch
                        checked={soundEnabled}
                        onChange={() => toggleSound()}
                        label={soundEnabled ? "Audio Effects Enabled" : "Audio Effects Muted"}
                      />
                    </TactileCard>

                    <TactileCard level={3} className="space-y-4">
                      <h3 className="text-lg font-bold">Dual-Engine AI Connectivity</h3>
                      <p className="text-xs text-muted">
                        When deployed on Vercel or in standalone mode, TARANG automatically executes
                        browser-side Edge Vision filters. When a local Python service is listening,
                        it uses YOLOv8 weights.
                      </p>
                      <div className="p-3 rounded-xl bg-surface-inset font-mono text-xs">
                        Endpoint: <code>http://localhost:5000/api/predict</code> · Automatic Fallback: Active
                      </div>
                    </TactileCard>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Global Toast Notification */}
        {toastMessage && (
          <div className="tactile-toast">
            <Check size={16} className="text-green" />
            <span>{toastMessage}</span>
          </div>
        )}
      </main>
    </div>
  );
}

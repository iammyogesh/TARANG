import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp,
  ClipboardCheck, Cloud, Compass, Download, Filter, Gauge, Layers3, MapPinned,
  Menu, Moon, MoreHorizontal, PanelLeftClose, Play, Plus, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Sun, Target, Timer, Waves, X,
  Zap, CircleDot, CircleDashed, AlertTriangle, RotateCcw, ExternalLink, UploadCloud,
  ImagePlus, LoaderCircle, FileImage,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { activity, confidenceSeries, currentMission, detections, getDetection, missions, modelRuns, type Detection, type DetectionCategory, type DetectionStatus } from "@/data/tarang";
import { inferSonarScan, subscribeToTelemetry, TarangApiError, type InferenceResponse, type TelemetryConnectionStatus, type TelemetryFrame } from "@/lib/tarangApi";

const navGroups = [
  { label: "Operate", items: [{ href: "/", label: "Mission control", icon: Compass }, { href: "/review", label: "Review queue", icon: Target, count: 14 }, { href: "/map", label: "Geotag map", icon: MapPinned }] },
  { label: "Understand", items: [{ href: "/missions", label: "Missions", icon: Waves }, { href: "/detections", label: "Detections", icon: Layers3 }, { href: "/model", label: "Model health", icon: Gauge }] },
  { label: "Deliver", items: [{ href: "/reports", label: "Reports", icon: ClipboardCheck }, { href: "/settings", label: "Settings", icon: Settings2 }] },
];

const pageMeta: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/": { eyebrow: "Mission control · 29 Sep 2026", title: "Good morning, Anika.", description: "The ocean is giving up its secrets. Here’s where TARANG needs your attention." },
  "/review": { eyebrow: "Operator workspace · live queue", title: "Review queue", description: "Validate what the model sees. Your calls train the next tide of cleanup." },
  "/missions": { eyebrow: "Survey operations · 4 missions", title: "Mission log", description: "Every sweep, ping, and confirmed object in one operational view." },
  "/detections": { eyebrow: "Object library · 395 records", title: "Detections", description: "Search, filter, and audit every candidate identified by TARANG." },
  "/map": { eyebrow: "Geospatial intelligence · live", title: "Geotag map", description: "A geographic view of the debris footprint around Kochi Outer Shelf." },
  "/model": { eyebrow: "Inference pipeline · TARANG-v0.9.4", title: "Model health", description: "Keep an eye on the signal quality, throughput, and decision thresholds." },
  "/reports": { eyebrow: "Evidence & exports · 12 packs", title: "Reports", description: "Turn a reviewed mission into a clear brief for the cleanup crew." },
  "/settings": { eyebrow: "Workspace preferences", title: "Settings", description: "Tune TARANG to the way your team works in the field." },
};

function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className={`brand ${compact ? "brand-compact" : ""}`} aria-label="TARANG home">
    <span className="brand-mark"><Waves size={17} strokeWidth={2.4} /><span className="brand-diamond" /></span>
    {!compact && <span className="brand-word">TARANG</span>}
  </Link>;
}

function StatusPill({ status }: { status: string }) {
  const className = status.toLowerCase().replace(/\s/g, "-");
  return <span className={`status-pill ${className}`}><span className="status-dot" />{status}</span>;
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="section-label"><span>{children}</span>{action}</div>;
}

function MiniChart() {
  const points = confidenceSeries.map((value, index) => `${index * 9.09},${94 - (value - 60) * 1.28}`).join(" ");
  return <svg className="mini-chart" viewBox="0 0 100 48" preserveAspectRatio="none" aria-label="confidence trend">
    <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--signal)" stopOpacity=".22" /><stop offset="1" stopColor="var(--signal)" stopOpacity="0" /></linearGradient></defs>
    <path d={`M 0 48 L ${points} L 100 48 Z`} fill="url(#chartFill)" />
    <polyline points={points} fill="none" stroke="var(--signal)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function KpiCard({ label, value, change, note, icon: Icon, tone = "cyan" }: { label: string; value: string; change: string; note: string; icon: typeof Activity; tone?: string }) {
  return <motion.div className={`kpi-card tone-${tone}`} whileHover={{ y: -3 }} transition={{ duration: .2 }}>
    <div className="kpi-top"><span>{label}</span><span className="icon-box"><Icon size={16} /></span></div>
    <div className="kpi-value">{value}</div>
    <div className="kpi-bottom"><span className={change.startsWith("+") ? "positive" : "neutral"}><ArrowUpRight size={13} /> {change}</span><span>{note}</span></div>
  </motion.div>;
}

function MissionCard({ onOpen }: { onOpen: () => void }) {
  return <div className="panel mission-card">
    <div className="mission-visual"><div className="mission-grid" /><div className="mission-route"><span /><span /><span /><span /><span /></div><div className="mission-ship"><Waves size={20} /></div><div className="mission-coordinate">09°58'14.2" N<br />76°04'51.9" E</div><div className="mission-live"><span className="pulse-dot" /> live tracking</div></div>
    <div className="mission-info">
      <div className="eyebrow"><span className="eyebrow-dot" /> active mission</div>
      <div className="mission-title-row"><div><h2>{currentMission.name}</h2><p>{currentMission.vessel} <span>·</span> Arabian Sea</p></div><StatusPill status={currentMission.status} /></div>
      <div className="mission-progress"><div className="progress-meta"><span>Survey coverage</span><strong>{currentMission.progress}%</strong></div><div className="progress-track"><span style={{ width: `${currentMission.progress}%` }} /></div><div className="progress-foot"><span>{currentMission.area} surveyed</span><span>ETA 11:20 IST</span></div></div>
      <div className="mission-actions"><button className="button button-primary" onClick={onOpen}><Play size={14} fill="currentColor" /> Open mission</button><button className="button button-quiet"><MoreHorizontal size={17} /></button></div>
    </div>
  </div>;
}

function QueueRow({ item, selected, onClick }: { item: Detection; selected?: boolean; onClick?: () => void }) {
  return <button className={`queue-row ${selected ? "selected" : ""}`} onClick={onClick}>
    <div className={`priority-marker ${item.priority.toLowerCase()}`} />
    <div className="queue-main"><strong>{item.label}</strong><span>{item.id} <i>·</i> {item.location}</span></div>
    <div className="queue-confidence"><strong>{item.confidence}%</strong><span>confidence</span></div>
    <ChevronDown size={15} className="row-chevron" />
  </button>;
}

function ReviewPreview({ onReview }: { onReview: () => void }) {
  const queue = detections.filter((item) => item.status === "Needs review");
  return <div className="panel queue-panel"><div className="panel-heading"><div><SectionLabel action={<Link href="/review" className="text-link">View all <ArrowUpRight size={13} /></Link>}>needs attention</SectionLabel><h3>Review queue</h3></div><span className="count-badge">14 open</span></div><div className="queue-list">{queue.slice(0, 4).map((item) => <QueueRow key={item.id} item={item} onClick={onReview} />)}</div><button className="queue-footer" onClick={onReview}>Open review workspace <ArrowUpRight size={14} /></button></div>;
}

function SonarCanvas({ selected, onSelect, imageSrc, scanName, analysisState, analysisError, scanDetections, onUpload, onRunAnalysis, onClear }: { selected: Detection; onSelect: (id: string) => void; imageSrc?: string; scanName?: string; analysisState: "idle" | "ready" | "analyzing" | "complete" | "error"; analysisError?: string; scanDetections: Detection[]; onUpload: () => void; onRunAnalysis: () => void; onClear: () => void }) {
  const showDetections = !imageSrc || analysisState === "complete";
  const overlayDetections = imageSrc ? scanDetections : detections;
  return <div className="sonar-canvas-wrap"><div className="scan-source-bar"><div className="scan-source-info"><span className="eyebrow">source scan</span><strong>{scanName ?? "TARANG sample scan"}</strong>{imageSrc && <span className="scan-source-meta"><FileImage size={11} /> custom image loaded</span>}</div><div className="scan-source-actions">{imageSrc && <button className="scan-clear" onClick={onClear}>Clear</button>}<button className="button button-quiet scan-upload-button" onClick={onUpload}><UploadCloud size={14} /> {imageSrc ? "Replace scan" : "Upload scan"}</button></div></div><div className={`sonar-canvas ${imageSrc ? "has-custom-scan" : ""}`}><div className="sonar-noise" />{imageSrc && <img className="custom-sonar-image" src={imageSrc} alt={scanName ? `Uploaded sonar scan ${scanName}` : "Uploaded sonar scan"} />}<div className="sonar-grid" /><div className="sonar-sweep" /><div className="sonar-ruler top"><span>0 m</span><span>20 m</span><span>40 m</span><span>60 m</span></div><div className="sonar-ruler side"><span>0 m</span><span>10 m</span><span>20 m</span><span>30 m</span></div>{showDetections && overlayDetections.slice(0, 5).map((item) => <button key={item.id} onClick={() => onSelect(item.id)} className={`detection-box ${selected.id === item.id ? "active" : ""} ${item.status.toLowerCase().replace(/\s/g, "-")}`} style={{ left: `${item.x}%`, top: `${item.y}%` }}><span className="box-corner" /><span className="box-label">{item.id}</span></button>)}{imageSrc && analysisState === "ready" && <div className="scan-action-overlay"><div className="scan-action-card"><span className="scan-action-icon"><ImagePlus size={18} /></span><strong>Custom scan ready</strong><span>Send this scan to the configured Python inference service.</span><button className="button button-primary" onClick={onRunAnalysis}><Sparkles size={14} /> Run live inference</button></div></div>}{imageSrc && analysisState === "analyzing" && <div className="scan-action-overlay"><div className="scan-action-card analyzing"><LoaderCircle size={23} className="spin" /><strong>Reading sonar texture…</strong><span>Waiting for the Python model response</span><div className="analysis-progress"><span /></div></div></div>}{imageSrc && analysisState === "error" && <div className="scan-action-overlay"><div className="scan-action-card inference-error"><span className="scan-action-icon"><CircleHelp size={18} /></span><strong>Inference unavailable</strong><span>{analysisError ?? "The Python service could not process this scan."}</span><button className="button button-primary" onClick={onRunAnalysis}><RotateCcw size={14} /> Retry live inference</button></div></div>}{imageSrc && analysisState === "complete" && <div className="analysis-complete"><Check size={12} /> live inference complete · {scanDetections.length} candidate returns</div>}<div className="sonar-caption"><span><span className="legend-line" /> return strength</span><span>{imageSrc ? "custom scan · Python model" : "swath 04 · 42 m depth"}</span></div></div></div>;
}


// Maps sonar debris class names → TARANG UI categories
function sonarClassToCategory(label: string): DetectionCategory {
  const l = label.toLowerCase();
  if (["hook", "chain", "propeller", "valve", "wall"].some((k) => l.includes(k))) return "Metal fragment";
  if (["bottle", "can", "carton", "shampoo", "standing", "bidon", "sachet"].some((k) => l.includes(k))) return "Plastic mass";
  if (["tire", "net", "pipe", "wrench"].some((k) => l.includes(k))) return "Fishing gear";
  return "Unknown object";
}

function normalizeInferenceDetections(result: InferenceResponse, frame: TelemetryFrame): Detection[] {
  return result.detections.map((item, index) => {
    const confidence = Math.round(item.confidence <= 1 ? item.confidence * 100 : item.confidence);
    const category = sonarClassToCategory(item.label);
    const x = item.bbox ? Math.max(6, Math.min(92, (item.bbox.x + item.bbox.width / 2) * 100)) : 16 + index * 17;
    const y = item.bbox ? Math.max(8, Math.min(86, (item.bbox.y + item.bbox.height / 2) * 100)) : 24 + index * 11;
    const size = item.dimensions_m ? `${item.dimensions_m.length.toFixed(1)} × ${item.dimensions_m.width.toFixed(1)} m` : "pending measurement";
    const coordinates = item.coordinates
      ? `${item.coordinates.lat.toFixed(4)}° N ${item.coordinates.lon.toFixed(4)}° E`
      : `${frame.position.lat.toFixed(4)}° N ${frame.position.lon.toFixed(4)}° E`;
    return {
      id: item.id ?? `LIVE-${String(index + 1).padStart(3, "0")}`,
      label: item.label,
      category,
      status: "Needs review",
      confidence,
      location: `Live scan · ${(item.depth_m ?? frame.depth_m).toFixed(1)} m`,
      coordinates,
      timestamp: new Date().toLocaleTimeString(),
      size,
      priority: item.priority ?? (confidence >= 90 ? "High" : confidence >= 78 ? "Medium" : "Low"),
      x,
      y,
      depthM: item.depth_m ?? frame.depth_m,
    };
  });
}

function MapCanvas({ selectedId, onSelect, statusMap = {} }: { selectedId?: string; onSelect?: (id: string) => void; statusMap?: Record<string, DetectionStatus> }) {
  const [LeafletMap, setLeafletMap] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    // Dynamically import Leaflet to avoid SSR issues; add CSS once
    if (!document.querySelector("#leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    import("react-leaflet").then((rl) => {
      const { MapContainer, TileLayer, Marker, Popup, Polyline } = rl;
      // AUV sonar track along the Kochi Outer Shelf (real coordinates)
      const track: [number, number][] = [
        [9.9850, 76.0600], [9.9806, 76.0680], [9.9760, 76.0740],
        [9.9720, 76.0810], [9.9680, 76.0870], [9.9640, 76.0940],
      ];

      const Component = () => (
        <MapContainer
          center={[9.9706, 76.0809]}
          zoom={13}
          style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline positions={track} pathOptions={{ color: "#00d4ff", weight: 2, dashArray: "6 4", opacity: 0.8 }} />
          {detections.map((item) => {
            const status = statusMap[item.id] ?? item.status;
            // Parse coordinates from string like "09°58'14.2" N 76°04'51.9" E"
            const parts = item.coordinates.match(/([\d.]+)°([\d.]+)'([\d.]+)"\s*N\s*([\d.]+)°([\d.]+)'([\d.]+)"\s*E/);
            if (!parts) return null;
            const lat = parseFloat(parts[1]) + parseFloat(parts[2]) / 60 + parseFloat(parts[3]) / 3600;
            const lon = parseFloat(parts[4]) + parseFloat(parts[5]) / 60 + parseFloat(parts[6]) / 3600;
            return (
              <Marker key={item.id} position={[lat, lon]}>
                <Popup>
                  <strong>{item.label}</strong><br />
                  {item.id} · {item.confidence}% conf<br />
                  {status}<br />
                  <button style={{ marginTop: 4, cursor: "pointer" }} onClick={() => onSelect?.(item.id)}>
                    Select
                  </button>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      );
      setLeafletMap(() => Component);
    });
  }, []);

  if (!LeafletMap) {
    return (
      <div className="map-canvas" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
        <div className="map-water" />
        <LoaderCircle size={22} className="spin" style={{ position: "relative", zIndex: 2 }} />
        <span style={{ position: "relative", zIndex: 2, fontSize: 13, opacity: 0.7 }}>Loading map…</span>
      </div>
    );
  }

  return (
    <div className="map-canvas" style={{ overflow: "hidden" }}>
      <LeafletMap />
      <div className="map-compass"><span>N</span><Compass size={18} /></div>
      <div className="map-scale">500 m <span /></div>
    </div>
  );
}

function ModelCard() {
  return <div className="panel model-card"><div className="panel-heading"><div><SectionLabel>inference pipeline</SectionLabel><h3>Signal quality</h3></div><span className="live-tag"><span className="pulse-dot" /> healthy</span></div><div className="model-score"><div><span>Current model</span><strong>TARANG<span>-v0.9.4</span></strong></div><div className="score-ring"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" /><circle cx="20" cy="20" r="16" className="score-progress" /></svg><b>91.8</b></div></div><MiniChart /><div className="model-stats"><span><i className="green-dot" /> precision <b>93.4%</b></span><span><i className="cyan-dot" /> latency <b>1.4s</b></span></div><Link href="/model" className="panel-link">Inspect model health <ArrowUpRight size={14} /></Link></div>;
}

function ActivityPanel() {
  return <div className="panel activity-panel"><div className="panel-heading"><div><SectionLabel>field notes · today</SectionLabel><h3>Recent activity</h3></div><button className="icon-button"><MoreHorizontal size={17} /></button></div><div className="activity-list">{activity.map((item) => <div className="activity-item" key={item.time}><span className={`activity-dot ${item.tone}`} /><div><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>)}</div><button className="panel-link">Open activity log <ArrowUpRight size={14} /></button></div>;
}

function Overview({ onReview }: { onReview: () => void }) {
  return <div className="page-content"><div className="hero-row"><div><div className="eyebrow">{pageMeta["/"].eyebrow}</div><h1>{pageMeta["/"].title}</h1><p className="hero-copy">{pageMeta["/"].description}</p></div><div className="hero-actions"><button className="button button-quiet"><Bell size={16} /><span className="notification-dot" /></button><button className="button button-primary" onClick={onReview}><Target size={15} /> Start reviewing</button></div></div><div className="kpi-grid"><KpiCard label="Scans processed" value="18,426" change="+12.8%" note="vs last mission" icon={Activity} /><KpiCard label="Debris confirmed" value="84" change="+18" note="this mission" icon={ShieldCheck} tone="green" /><KpiCard label="Review queue" value="14" change="+6" note="need attention" icon={Timer} tone="coral" /><KpiCard label="Area surveyed" value="8.7 km²" change="+2.1 km²" note="of 12.8 km²" icon={Compass} tone="amber" /></div><div className="dashboard-grid"><MissionCard onOpen={onReview} /><ReviewPreview onReview={onReview} /><ModelCard /><ActivityPanel /><div className="panel map-panel"><div className="panel-heading"><div><SectionLabel action={<Link href="/map" className="text-link">Explore map <ArrowUpRight size={13} /></Link>}>live footprint</SectionLabel><h3>Where the signal is</h3></div><span className="map-meta"><span className="pulse-dot" /> 128 returns</span></div><MapCanvas /><div className="map-footer"><span><i className="map-legend confirmed" /> confirmed debris <b>84</b></span><span><i className="map-legend pending" /> needs review <b>14</b></span><span className="map-date">updated 08:42 IST</span></div></div></div></div>;
}

function ReviewWorkspace({ selectedId, setSelectedId, statusMap, onStatusChange }: { selectedId: string; setSelectedId: (id: string) => void; statusMap: Record<string, DetectionStatus>; onStatusChange: (id: string, status: DetectionStatus) => void }) {
  const baseSelected = getDetection(selectedId);
  const selected = { ...baseSelected, status: statusMap[selectedId] ?? baseSelected.status };
  const [priorityFilter, setPriorityFilter] = useState("All open");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [confidenceFilter, setConfidenceFilter] = useState("Any confidence");
  const [note, setNote] = useState(selected.note ?? "");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedScan, setUploadedScan] = useState<{ url: string; name: string; file: File }>();
  const [analysisState, setAnalysisState] = useState<"idle" | "ready" | "analyzing" | "complete" | "error">("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [inferenceResult, setInferenceResult] = useState<InferenceResponse>();
  const [inferenceDetections, setInferenceDetections] = useState<Detection[]>([]);
  const [telemetryFrame, setTelemetryFrame] = useState<TelemetryFrame>({ timestamp: new Date().toISOString(), mission_id: currentMission.id, position: { lat: 9.9706, lon: 76.0809 }, depth_m: 42.1, altitude_m: 5.8, speed_knots: 2.4, heading_deg: 118, temperature_c: 26.8, ping_rate_hz: 18.4, signal_quality: 91.8 });
  const [telemetryStatus, setTelemetryStatus] = useState<TelemetryConnectionStatus>("connecting");
  const [signalHistory, setSignalHistory] = useState([88, 90, 89, 92, 91, 93, 90, 92, 91, 94, 92, 91]);
  useEffect(() => subscribeToTelemetry((frame) => { setTelemetryFrame(frame); setSignalHistory((previous) => [...previous.slice(-23), frame.signal_quality]); }, setTelemetryStatus).close, []);
  const queueItems = detections.map((item) => ({ ...item, status: statusMap[item.id] ?? item.status }));
  const openItems = queueItems.filter((item) => {
    const open = item.status === "Needs review" || item.status === "Flagged";
    const priority = priorityFilter === "All open" || item.priority === priorityFilter;
    const category = categoryFilter === "All categories" || item.category === categoryFilter;
    const confidence = confidenceFilter === "Any confidence" || (confidenceFilter === "< 80%" ? item.confidence < 80 : item.confidence >= 80);
    return open && priority && category && confidence;
  });
  const choose = (id: string) => { setSelectedId(id); const next = getDetection(id); setNote(next.note ?? ""); };
  const act = (status: DetectionStatus) => { onStatusChange(selected.id, status); setToast(`${selected.id} marked ${status.toLowerCase()}`); window.setTimeout(() => setToast(""), 2400); };
  const handleFile = (file?: File) => { if (!file) return; if (!file.type.startsWith("image/")) { setToast("Please choose a JPG, PNG, WEBP, or TIFF sonar image."); window.setTimeout(() => setToast(""), 2400); return; } const reader = new FileReader(); reader.onload = () => { setUploadedScan({ url: String(reader.result), name: file.name, file }); setInferenceResult(undefined); setInferenceDetections([]); setAnalysisError(""); setAnalysisState("ready"); setToast(`${file.name} loaded — ready for live Python inference`); window.setTimeout(() => setToast(""), 2400); }; reader.readAsDataURL(file); };
  const runAnalysis = async () => { if (!uploadedScan) return; setAnalysisState("analyzing"); setAnalysisError(""); try { const result = await inferSonarScan(uploadedScan.file); setInferenceResult(result); setInferenceDetections(normalizeInferenceDetections(result, telemetryFrame)); setAnalysisState("complete"); setToast(`Live inference complete — ${result.detections.length} candidate returns`); window.setTimeout(() => setToast(""), 2600); } catch (error) { const message = error instanceof TarangApiError ? error.message : "The Python inference service could not be reached."; setAnalysisError(message); setAnalysisState("error"); } };
  const clearScan = () => { setUploadedScan(undefined); setInferenceResult(undefined); setInferenceDetections([]); setAnalysisError(""); setAnalysisState("idle"); if (fileInputRef.current) fileInputRef.current.value = ""; };
  return <div className="review-layout"><div className="review-queue panel"><div className="review-queue-head"><div><SectionLabel>{openItems.length} open candidates</SectionLabel><h3>Review queue</h3></div><button className="icon-button"><Filter size={16} /></button></div><div className="filter-row">{["All open", "High", "Medium", "Low"].map((item) => <button key={item} className={priorityFilter === item ? "active" : ""} onClick={() => setPriorityFilter(item)}>{item}</button>)}</div><div className="filter-select-row"><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option><option>Fishing gear</option><option>Metal fragment</option><option>Plastic mass</option><option>Unknown object</option></select><select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)}><option>Any confidence</option><option>&lt; 80%</option><option>80%+</option></select></div><div className="queue-list extended">{openItems.map((item) => <QueueRow key={item.id} item={item} selected={item.id === selectedId} onClick={() => choose(item.id)} />)}</div><div className="queue-progress"><span>4 of 14 reviewed</span><span>28%</span><div className="progress-track"><span style={{ width: "28%" }} /></div></div></div><div className="review-main" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }}><div className="review-toolbar"><div className="toolbar-breadcrumb"><span>Mission M-042</span><ChevronDown size={14} /><span>Transect 04</span><ChevronDown size={14} /></div><div className="toolbar-actions"><label className="button button-primary upload-file-label"><UploadCloud size={15} /> Upload scan<input ref={fileInputRef} className="scan-file-picker" type="file" accept="image/png,image/jpeg,image/webp,image/tiff" onChange={(event) => handleFile(event.target.files?.[0])} /></label><button className="button button-quiet"><RotateCcw size={15} /> Reset view</button><button className="button button-quiet"><CircleHelp size={15} /></button></div></div><SonarCanvas selected={selected} onSelect={choose} imageSrc={uploadedScan?.url} scanName={uploadedScan?.name} analysisState={analysisState} onUpload={() => fileInputRef.current?.click()} onRunAnalysis={runAnalysis} onClear={clearScan} scanDetections={inferenceDetections} analysisError={analysisError} /><div className="review-detail"><div className="detail-header"><div><SectionLabel>selected detection · {selected.id}</SectionLabel><h2>{selected.label}</h2></div><StatusPill status={selected.status} /></div><div className="detail-grid"><div><span>category</span><strong>{selected.category}</strong></div><div><span>confidence</span><strong className="signal-text">{selected.confidence}%</strong></div><div><span>dimensions</span><strong>{selected.size}</strong></div><div><span>depth</span><strong>{selected.location.split("·")[1]}</strong></div></div><div className="detail-location"><MapPinned size={15} /><span>{selected.coordinates}</span><Link href="/map">view on map <ExternalLink size={12} /></Link></div><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a field note for the cleanup crew…" />{inferenceResult && <div className="inference-meta"><span><Sparkles size={12} /> {inferenceResult.model_version}</span><span>{inferenceResult.processing_ms} ms processing</span><span>{inferenceResult.request_id}</span></div>}<div className="detail-actions"><button className="button button-confirm" onClick={() => act("Confirmed")}><Check size={15} /> Confirm debris</button><button className="button button-flag" onClick={() => act("Flagged")}><AlertTriangle size={15} /> Flag for later</button><button className="button button-reject" onClick={() => act("Rejected")}><X size={15} /> Reject</button></div></div></div>{toast && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="toast"><Check size={15} /> {toast}</motion.div>}</div>;
}

function TablePage({ type }: { type: string }) {
  const [query, setQuery] = useState("");
  const [exported, setExported] = useState(false);
  const meta = pageMeta[type];
  const isMissions = type === "/missions";
  const rows = isMissions ? missions : detections;
  const filtered = rows.filter((item) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content"><div className="hero-row compact"><div><div className="eyebrow">{meta.eyebrow}</div><h1>{meta.title}</h1><p className="hero-copy">{meta.description}</p></div><div className="hero-actions"><button className="button button-quiet"><Download size={15} /> Export CSV</button><button className="button button-primary"><Plus size={15} /> {isMissions ? "New mission" : "Add review"}</button></div></div><div className="table-toolbar"><div className="search-box"><Search size={16} /><input placeholder={`Search ${isMissions ? "missions" : "detections"}…`} value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className="button button-quiet"><SlidersHorizontal size={15} /> Filters <span className="filter-count">3</span></button><span className="toolbar-result">{filtered.length} results</span></div><div className="panel data-table"><div className="table-head"><span>{isMissions ? "Mission" : "Detection"}</span><span>{isMissions ? "Coverage" : "Category"}</span><span>{isMissions ? "Detections" : "Confidence"}</span><span>{isMissions ? "Last ping" : "Location"}</span><span>Status</span><span /></div>{filtered.map((item) => <div className="table-row" key={item.id}><div className="table-primary"><span className="table-icon">{isMissions ? <Waves size={15} /> : <Target size={15} />}</span><div><strong>{isMissions ? (item as typeof missions[number]).name : (item as Detection).label}</strong><span>{item.id} <i>·</i> {isMissions ? (item as typeof missions[number]).vessel : (item as Detection).timestamp}</span></div></div><span>{isMissions ? `${(item as typeof missions[number]).progress}% surveyed` : (item as Detection).category}</span><span className={isMissions ? "" : "signal-text"}>{isMissions ? `${(item as typeof missions[number]).confirmed} confirmed` : `${(item as Detection).confidence}%`}</span><span>{isMissions ? (item as typeof missions[number]).lastPing : (item as Detection).location}</span><StatusPill status={item.status} /><button className="icon-button"><MoreHorizontal size={16} /></button></div>)}</div>{exported && <div className="toast"><Check size={15} /> Evidence pack ready to download</div>}</div>;
}

function ModelPage() {
  return <div className="page-content"><div className="hero-row compact"><div><div className="eyebrow">{pageMeta["/model"].eyebrow}</div><h1>{pageMeta["/model"].title}</h1><p className="hero-copy">{pageMeta["/model"].description}</p></div><div className="hero-actions"><button className="button button-quiet"><Download size={15} /> Download run log</button><button className="button button-primary"><Zap size={15} /> Run evaluation</button></div></div><div className="model-overview-grid"><div className="panel health-hero"><div className="health-graphic"><div className="health-orbit orbit-one" /><div className="health-orbit orbit-two" /><div className="health-core"><Sparkles size={22} /><strong>91.8%</strong><span>signal quality</span></div></div><div className="health-copy"><SectionLabel>live model</SectionLabel><h2>TARANG<span>-v0.9.4</span></h2><p>Performing above the field threshold across all active transects.</p><div className="health-metrics"><span><b>93.4%</b> precision</span><span><b>89.9%</b> recall</span><span><b>1.4s</b> latency</span></div></div></div><div className="panel threshold-panel"><SectionLabel>decision boundary</SectionLabel><h3>Review threshold</h3><div className="threshold-value">0.72 <span>confidence</span></div><div className="threshold-bar"><span /><i style={{ left: "72%" }} /></div><div className="threshold-ends"><span>more candidates</span><span>higher certainty</span></div><p>14 candidates are currently waiting for an operator decision.</p><button className="button button-quiet">Adjust threshold <SlidersHorizontal size={14} /></button></div></div><div className="panel data-table model-runs"><div className="panel-heading"><div><SectionLabel>version history</SectionLabel><h3>Recent evaluation runs</h3></div><button className="button button-quiet">View all</button></div><div className="table-head"><span>Model</span><span>Run date</span><span>Accuracy</span><span>Latency</span><span>Status</span><span /></div>{modelRuns.map((run) => <div className="table-row" key={run.name}><div className="table-primary"><span className="table-icon"><CircleDot size={15} /></span><div><strong>{run.name}</strong><span>side-scan debris classifier</span></div></div><span>{run.date}</span><span className="signal-text">{run.accuracy}</span><span>{run.latency}</span><StatusPill status={run.status === "Live" ? "Confirmed" : "Archived"} /><button className="icon-button"><MoreHorizontal size={16} /></button></div>)}</div></div>;
}

function ReportsPage() {
  const [ready, setReady] = useState(false);
  return <div className="page-content"><div className="hero-row compact"><div><div className="eyebrow">{pageMeta["/reports"].eyebrow}</div><h1>{pageMeta["/reports"].title}</h1><p className="hero-copy">{pageMeta["/reports"].description}</p></div><div className="hero-actions"><button className="button button-primary" onClick={() => setReady(true)}><Plus size={15} /> New evidence pack</button></div></div><div className="report-grid"><div className="panel export-card"><div className="export-symbol"><Download size={22} /></div><SectionLabel>active mission · M-042</SectionLabel><h2>Kochi Outer Shelf</h2><p>Package confirmed debris, geotags, sonar crops, and field notes into a cleanup-ready brief.</p><div className="export-includes"><span><Check size={13} /> 84 confirmed detections</span><span><Check size={13} /> 6 sonar transects</span><span><Check size={13} /> GeoJSON + CSV + PDF</span></div><button className="button button-primary export-button" onClick={() => setReady(true)}>{ready ? <><Check size={15} /> Pack ready</> : <><Download size={15} /> Generate evidence pack</>}</button></div><div className="panel report-history"><div className="panel-heading"><div><SectionLabel>recent exports</SectionLabel><h3>Evidence packs</h3></div><button className="icon-button"><MoreHorizontal size={17} /></button></div>{["Kochi Outer Shelf", "Vypin Channel Sweep", "Alleppey North Pass"].map((name, index) => <div className="report-row" key={name}><div className="report-file"><div className="file-icon"><ClipboardCheck size={15} /></div><div><strong>{name}</strong><span>{index === 0 ? "In progress" : "PDF · GeoJSON · CSV"}</span></div></div><span>{index === 0 ? <span className="processing"><span className="pulse-dot" /> preparing</span> : `${12 - index * 3} Sep 2026`}</span><MoreHorizontal size={16} /></div>)}</div></div></div>;
}

function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [threshold, setThreshold] = useState(72);
  return <div className="page-content"><div className="hero-row compact"><div><div className="eyebrow">{pageMeta["/settings"].eyebrow}</div><h1>{pageMeta["/settings"].title}</h1><p className="hero-copy">{pageMeta["/settings"].description}</p></div></div><div className="settings-grid"><div className="panel settings-nav"><div className="settings-nav-item active"><Settings2 size={16} /> General</div><div className="settings-nav-item"><Bell size={16} /> Notifications</div><div className="settings-nav-item"><ShieldCheck size={16} /> Team & access</div><div className="settings-nav-item"><Cloud size={16} /> Data connections</div></div><div className="settings-main"><div className="panel settings-section"><div><SectionLabel>appearance</SectionLabel><h3>Make TARANG yours</h3><p className="settings-help">Choose how the console feels during a long review session.</p></div><button className="theme-switch" onClick={toggleTheme}><span className={theme === "light" ? "active" : ""}><Sun size={15} /> Light</span><span className={theme === "dark" ? "active" : ""}><Moon size={15} /> Dark</span></button></div><div className="panel settings-section"><div><SectionLabel>review queue</SectionLabel><h3>Default confidence threshold</h3><p className="settings-help">Candidates below this signal appear in the review queue.</p></div><div className="setting-control"><strong>{threshold}%</strong><input type="range" min="50" max="95" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><div className="range-labels"><span>more candidates</span><span>higher certainty</span></div></div></div><div className="panel settings-section"><div><SectionLabel>notifications</SectionLabel><h3>Keep the field team in sync</h3><p className="settings-help">Get a short alert when a high-priority object is confirmed.</p></div><button className="toggle active"><span /></button></div></div></div></div>;
}

function MapPage({ selectedId, setSelectedId, statusMap }: { selectedId: string; setSelectedId: (id: string) => void; statusMap: Record<string, DetectionStatus> }) {
  const selected = getDetection(selectedId);
  return <div className="page-content"><div className="hero-row compact"><div><div className="eyebrow">{pageMeta["/map"].eyebrow}</div><h1>{pageMeta["/map"].title}</h1><p className="hero-copy">{pageMeta["/map"].description}</p></div><div className="hero-actions"><button className="button button-quiet"><Filter size={15} /> Filters</button><button className="button button-primary"><Download size={15} /> Export map</button></div></div><div className="map-page-grid"><div className="panel map-page-canvas"><div className="map-page-toolbar"><span><span className="pulse-dot" /> live mission track</span><span className="map-meta">M-042 · updated 08:42</span></div><MapCanvas selectedId={selectedId} onSelect={setSelectedId} statusMap={statusMap} /></div><div className="panel map-side"><SectionLabel>selected detection</SectionLabel><h3>{selected.label}</h3><p>{selected.id} <span>·</span> {selected.location}</p><div className="map-stat"><span>review state</span><StatusPill status={statusMap[selected.id] ?? selected.status} /></div><div className="map-stat"><span>confidence</span><strong className="signal-text">{selected.confidence}%</strong></div><div className="map-stat"><span>cleanup priority</span><strong className="coral-text">{selected.priority}</strong></div><div className="map-coords"><MapPinned size={15} /><div><span>active coordinate</span><strong>{selected.coordinates.split(" ").slice(0, 2).join(" ")}</strong><strong>{selected.coordinates.split(" ").slice(2).join(" ")}</strong></div></div><button className="button button-primary full-width">Open cleanup cluster <ArrowUpRight size={14} /></button></div></div></div>;
}

function AppShell() {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [selectedId, setSelectedId] = useState("D-0842");
  const [statusMap, setStatusMap] = useState<Record<string, DetectionStatus>>({});
  const [railOpen, setRailOpen] = useState(false);
  const meta = pageMeta[location] ?? pageMeta["/"];
  const goReview = () => setLocation("/review");
  const onStatusChange = (id: string, status: DetectionStatus) => setStatusMap((previous) => ({ ...previous, [id]: status }));
  const view = useMemo(() => { if (location === "/") return <Overview onReview={goReview} />; if (location === "/review") return <ReviewWorkspace selectedId={selectedId} setSelectedId={setSelectedId} statusMap={statusMap} onStatusChange={onStatusChange} />; if (location === "/model") return <ModelPage />; if (location === "/reports") return <ReportsPage />; if (location === "/settings") return <SettingsPage />; if (location === "/map") return <MapPage selectedId={selectedId} setSelectedId={setSelectedId} statusMap={statusMap} />; return <TablePage type={location} />; }, [location, selectedId, statusMap]);
  return <div className="app-shell"><aside className={`side-rail ${railOpen ? "open" : ""}`}><div className="rail-top"><Logo /><button className="rail-collapse" onClick={() => setRailOpen(false)}><PanelLeftClose size={16} /></button></div><div className="rail-scroll">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map(({ href, label, icon: Icon, count }) => <Link href={href} key={href} className={`nav-item ${location === href ? "active" : ""}`} onClick={() => setRailOpen(false)}><Icon size={17} /><span>{label}</span>{count && <b>{count}</b>}</Link>)}</div>)}</div><div className="rail-bottom"><div className="system-status"><span className="pulse-dot" /><div><strong>Systems nominal</strong><span>last sync 08:42 IST</span></div></div><div className="user-card"><div className="avatar">AS</div><div><strong>Anika Sen</strong><span>Field operations</span></div><MoreHorizontal size={16} /></div></div></aside><AnimatePresence>{railOpen && <motion.div className="rail-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRailOpen(false)} />}</AnimatePresence><main className="main-shell"><header className="topbar"><button className="mobile-menu" onClick={() => setRailOpen(true)}><Menu size={20} /></button><div className="mobile-brand"><Logo compact /></div><div className="topbar-context"><span className="context-dot" /><span>Mission M-042</span><span className="context-divider">/</span><span>{currentMission.name}</span></div><div className="topbar-actions"><button className="topbar-icon" onClick={toggleTheme} title="Toggle theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button><button className="topbar-icon has-notification" title="Notifications"><Bell size={17} /><i /></button><div className="topbar-avatar">AS</div></div></header><AnimatePresence mode="wait"><motion.div key={location} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .26, ease: "easeOut" }}>{view}</motion.div></AnimatePresence></main></div>;
}

export default function Home() { return <AppShell />; }

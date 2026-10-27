import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  FolderOpen,
  CheckCircle2,
  Sliders,
  Anchor,
  Box,
  Layers,
  RotateCcw,
  CheckCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTarangStore } from '../stores/useTarangStore';

// Silky-Smooth Tactile 3D Card Wrapper (Hardware Accelerated, Stutter-Free)
function Card3D({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.4 } }}
      whileHover={{ y: -3, transition: { duration: 0.2, ease: 'easeOut' } }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-3xl backdrop-blur-2xl bg-white/95 border border-white/90 shadow-[0_15px_35px_rgba(0,12,30,0.18),0_1px_3px_rgba(255,255,255,0.9)_inset] transition-all duration-300 hover:shadow-[0_22px_45px_rgba(0,180,216,0.22)] hover:border-cyan-100 will-change-transform transform-gpu ${className}`}
    >
      {children}
    </motion.div>
  );
}

export default function AnalyticsStack() {
  const {
    scanResult,
    selectedHazardIndex,
    setSelectedHazardIndex,
    minConfidence,
    setMinConfidence,
    filename,
    resetToSurface,
    setViewMode,
  } = useTarangStore();

  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const filteredDetections = (scanResult?.detections || []).filter(
    (d) => d.confidence >= minConfidence
  );

  // Export structured JSON report
  const exportJSON = () => {
    if (!filteredDetections.length) return;

    const exportPayload = {
      project: 'TARANG — Deep Ocean Marine Debris Detection',
      sourceScan: filename || 'survey_pass.jpg',
      timestamp: new Date().toISOString(),
      summary: {
        totalDetected: filteredDetections.length,
        verifiedHazards: filteredDetections.filter((d) => d.confidence > 0.85).length,
      },
      hazards: filteredDetections.map((d) => ({
        id: d.id,
        classification: d.label,
        category: d.category,
        confidencePct: `${(d.confidence * 100).toFixed(1)}%`,
        location: `${d.coordinates?.lat?.toFixed(4)}°N, ${d.coordinates?.lon?.toFixed(4)}°E`,
        dimensions: `${d.dimensions_m?.length}m × ${d.dimensions_m?.width}m`,
        status: d.confidence > 0.85 ? 'Verified Hazard' : 'Review Required',
      })),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `TARANG_Debris_Report_${filename || 'survey'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setDownloadSuccess(true);
    confetti({
      particleCount: 45,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#00b4d8', '#38bdf8', '#0284c7'],
    });
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const getHazardIcon = (label = '') => {
    const l = label.toLowerCase();
    if (l.includes('net')) return <Anchor className="w-4 h-4 text-cyan-600" />;
    if (l.includes('pipe')) return <Box className="w-4 h-4 text-cyan-600" />;
    return <Layers className="w-4 h-4 text-cyan-600" />;
  };

  return (
    <div className="space-y-4 flex flex-col justify-between h-full perspective-1200">
      {/* 3D CARD 1: Executive Scan Overview (Zero Clutter) */}
      <Card3D delay={0.1} className="p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <h4 className="text-sm font-bold text-slate-900 tracking-tight font-sans">
            Detection Overview
          </h4>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Scan Complete
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[11px] text-slate-500 font-medium block">Debris Found</span>
            <span className="text-xl font-bold font-display text-slate-900">
              {filteredDetections.length}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-cyan-50/70 border border-cyan-100">
            <span className="text-[11px] text-cyan-700 font-medium block">High Priority</span>
            <span className="text-xl font-bold font-display text-cyan-800">
              {filteredDetections.filter((d) => d.confidence > 0.85).length}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[11px] text-slate-500 font-medium block">Avg Confidence</span>
            <span className="text-xl font-bold font-display text-slate-900">
              {filteredDetections.length
                ? `${Math.round(
                    (filteredDetections.reduce((acc, d) => acc + d.confidence, 0) /
                      filteredDetections.length) *
                      100
                  )}%`
                : '0%'}
            </span>
          </div>
        </div>
      </Card3D>

      {/* 3D CARD 2: Identified Marine Hazards Table */}
      <Card3D delay={0.2} className="flex-1 p-6 flex flex-col min-h-[280px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <h4 className="text-sm font-bold text-slate-900 tracking-tight font-sans">
            Identified Marine Hazards
          </h4>

          {/* User-friendly Confidence Filter Slider */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Sliders className="w-3.5 h-3.5 text-cyan-600" />
            <span className="text-xs text-slate-700 font-semibold">
              {(minConfidence * 100).toFixed(0)}% Min
            </span>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-16 accent-cyan-600 cursor-pointer h-1.5"
            />
          </div>
        </div>

        {/* Table Column Headers */}
        <div className="grid grid-cols-12 text-xs font-semibold text-slate-400 pb-2 px-2 border-b border-slate-100">
          <div className="col-span-2">ID</div>
          <div className="col-span-4">Object</div>
          <div className="col-span-3">Coordinates</div>
          <div className="col-span-3 text-right">Status</div>
        </div>

        {/* Interactive Hazard Rows */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pt-2 pr-1 max-h-[220px]">
          {filteredDetections.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-8">
              No anomalies matching the current filter.
            </p>
          ) : (
            filteredDetections.map((hazard, index) => {
              const isSelected = selectedHazardIndex === index;
              const isVerified = hazard.confidence > 0.85;

              return (
                <div
                  key={hazard.id || index}
                  onClick={() => setSelectedHazardIndex(index)}
                  className={`grid grid-cols-12 items-center p-3 rounded-2xl border transition-all cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-cyan-50/90 border-cyan-400 shadow-sm translate-x-1'
                      : 'bg-slate-50/70 border-slate-100 hover:bg-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="col-span-2 font-bold font-mono text-slate-900">
                    {hazard.id || `TR-${index + 1}`}
                  </div>

                  <div className="col-span-4 flex items-center gap-2 font-bold text-slate-800">
                    {getHazardIcon(hazard.label)}
                    <span className="truncate">{hazard.label}</span>
                  </div>

                  <div className="col-span-3 text-[11px] font-mono text-slate-500">
                    {hazard.coordinates?.lat?.toFixed(2)}°N, {hazard.coordinates?.lon?.toFixed(2)}°E
                  </div>

                  <div className="col-span-3 text-right">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        isVerified
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isVerified ? 'Verified' : 'Review'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card3D>

      {/* 3D CARD 3: Command Console */}
      <Card3D delay={0.3} className="p-6">
        <h4 className="text-sm font-bold text-slate-900 tracking-tight font-sans mb-3">
          Export & Tools
        </h4>

        <div className="flex items-center gap-3">
          <button
            onClick={exportJSON}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-600/20 active:scale-95"
          >
            <FileText className="w-4 h-4" />
            <span>Download Report (.JSON)</span>
          </button>

          <button
            onClick={() => setViewMode('SONAR_TEXTURE')}
            className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <FolderOpen className="w-4 h-4 text-slate-600" />
            <span>Inspect Sonar Log</span>
          </button>

          <button
            onClick={resetToSurface}
            className="p-3 rounded-2xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition-all active:scale-95"
            title="Upload New Sonar Scan"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {downloadSuccess && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 justify-center font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Analysis Report Downloaded Successfully!</span>
          </div>
        )}
      </Card3D>
    </div>
  );
}

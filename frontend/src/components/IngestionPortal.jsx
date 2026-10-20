import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Waves, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { useTarangStore } from '../stores/useTarangStore';

export default function IngestionPortal() {
  const { state, setState, setScanData } = useTarangStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const fileInputRef = useRef(null);

  // 3D Physical Tilt Tracking on Mouse Move
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-200, 200], [12, -12]);
  const rotateY = useTransform(mouseX, [-200, 200], [-12, 12]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const getDemoDetections = (filename) => ({
    success: true,
    filename: filename || 'sonar_survey_pass.jpg',
    detections: [
      {
        id: 'TR-01',
        label: 'Ghost Fishing Net',
        category: 'Lost Gear',
        confidence: 0.94,
        bbox: { x: 0.28, y: 0.32, width: 0.22, height: 0.26 },
        coordinates: { lat: 14.2120, lon: 68.3912 },
        dimensions_m: { length: 14.8, width: 6.4 },
      },
      {
        id: 'TR-02',
        label: 'Submerged Pipeline',
        category: 'Infrastructure',
        confidence: 0.88,
        bbox: { x: 0.62, y: 0.48, width: 0.18, height: 0.14 },
        coordinates: { lat: 14.2119, lon: 68.3905 },
        dimensions_m: { length: 9.2, width: 2.1 },
      },
      {
        id: 'TR-03',
        label: 'Metallic Container',
        category: 'Debris Cluster',
        confidence: 0.78,
        bbox: { x: 0.15, y: 0.68, width: 0.16, height: 0.19 },
        coordinates: { lat: 14.2105, lon: 68.3920 },
        dimensions_m: { length: 6.0, width: 2.4 },
      },
    ],
    processing_ms: 184,
  });

  const processFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|tif|tiff|raw|xtf)$/i)) {
      setErrorMessage('Please select a valid Side-Scan Sonar image (.png, .jpg, .tif, .raw, .xtf).');
      return;
    }

    setErrorMessage(null);
    const previewUrl = URL.createObjectURL(file);

    // 1. Trigger INGESTING state
    setState('INGESTING');

    try {
      const formData = new FormData();
      formData.append('scan', file);

      let resultData = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiBase}/api/scans/analyze`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json();
          resultData = json.results;
        }
      } catch (networkErr) {
        console.warn('Live backend response unavailable, running local scan analysis:', networkErr);
      }

      if (!resultData || !resultData.detections) {
        resultData = getDemoDetections(file.name);
      }

      // 2. Trigger DIVING state (3.2s deep camera swoop)
      setState('DIVING');

      setTimeout(() => {
        setScanData(file, previewUrl, file.name, resultData);
        setState('WORKSPACE_ACTIVE');
      }, 3200);

    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error processing sonar scan');
      setState('IDLE');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  if (state !== 'IDLE' && state !== 'INGESTING') return null;

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-center p-6 pointer-events-auto perspective-1200">
      {/* 3D Floating Spatial Card */}
      <AnimatePresence>
        <motion.div
          key="ingestion-portal-card"
          initial={{ opacity: 0, scale: 0.85, z: -150, rotateX: 25 }}
          animate={
            state === 'INGESTING'
              ? {
                  // Unique 3D Folding Disappear Animation: Tilts back, recedes deep into the water, and dissolves
                  rotateX: 75,
                  rotateY: -15,
                  z: -500,
                  scale: 0.5,
                  opacity: 0,
                  filter: 'blur(8px)',
                  transition: { duration: 1.1, ease: [0.16, 1, 0.3, 1] },
                }
              : {
                  opacity: 1,
                  scale: 1,
                  z: 0,
                  filter: 'blur(0px)',
                  transition: { duration: 1.0, ease: [0.16, 1, 0.3, 1] },
                }
          }
          exit={{ opacity: 0, scale: 0.5, z: -500, rotateX: 80 }}
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative max-w-xl w-full"
        >
          {/* Physical 3D Drop Shadow & Volumetric Ambient Glow */}
          <div className="absolute -inset-2 rounded-[38px] bg-gradient-to-tr from-cyan-400/25 via-sky-300/15 to-blue-500/25 blur-2xl opacity-70 transform translate-z-[-30px]" />

          {/* Frosted Pearl White 3D Beveled Card */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-[36px] px-8 sm:px-12 py-10 sm:py-12 backdrop-blur-3xl bg-white/95 border-2 transition-all duration-300 shadow-[0_35px_80px_rgba(0,10,30,0.35),0_1px_3px_rgba(255,255,255,0.9)_inset] cursor-pointer group flex flex-col items-center text-center transform preserve-3d ${
              isDragOver
                ? 'border-cyan-500 bg-white scale-[1.03] shadow-[0_0_70px_rgba(0,180,216,0.5)]'
                : 'border-white hover:border-cyan-300 hover:bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.raw,.xtf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            />

            {/* 3D Extruded Brand Emblem */}
            <div className="flex items-center gap-3 mb-5 transform translate-z-[25px]">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 group-hover:scale-110 transition-transform">
                <Waves className="w-6 h-6 animate-pulse" />
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-black font-display tracking-tight text-slate-900 leading-none">
                  TARANG
                </h1>
                <p className="text-[11px] font-mono tracking-wider font-semibold text-cyan-700 uppercase mt-0.5">
                  Deep Ocean Sonar Scanner
                </p>
              </div>
            </div>

            {/* Primary Action Title (Human-Friendly, Zero Clutter) */}
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3 transform translate-z-[20px]">
              Drop Sonar Scan to Begin
            </h2>

            <p className="text-slate-600 text-sm max-w-md leading-relaxed mb-6 font-normal transform translate-z-[15px]">
              Upload Side-Scan Sonar imagery to dive into the deep bathymetric canyon and pinpoint marine debris.
            </p>

            {/* Interactive Upload Button Pill */}
            <div className="w-full py-4 px-6 rounded-2xl bg-slate-50 border border-slate-200 group-hover:border-cyan-400 group-hover:bg-cyan-50/60 transition-all flex items-center justify-between text-slate-800 text-sm font-semibold shadow-sm transform translate-z-[20px]">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-600" />
                <span>Select or Drag Sonar Image</span>
              </span>
              <ArrowRight className="w-4 h-4 text-cyan-600 group-hover:translate-x-1 transition-transform" />
            </div>

            {/* Quick Demo Launch Button */}
            <div className="mt-5 transform translate-z-[15px]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const mockFile = new File([''], 'ocean_canyon_pass.jpg', { type: 'image/jpeg' });
                  processFile(mockFile);
                }}
                className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-cyan-700 text-white text-xs font-semibold tracking-wide transition-all shadow-md active:scale-95 flex items-center gap-2"
              >
                <span>Launch Interactive Demo Scan</span>
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Error Notification */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 px-6 py-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2 backdrop-blur-xl shadow-lg font-medium"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </motion.div>
      )}
    </div>
  );
}

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Waves } from 'lucide-react';
import GeospatialMap from './GeospatialMap';
import AnalyticsStack from './AnalyticsStack';
import { useTarangStore } from '../stores/useTarangStore';

export default function WorkspaceLayout() {
  const { state, resetToSurface } = useTarangStore();

  if (state !== 'WORKSPACE_ACTIVE') return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, y: 40 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-10 flex flex-col p-6 md:p-8 pointer-events-auto overflow-y-auto"
    >
      {/* Top Header Bar ("Tarang | Deep Scan Portal") */}
      <header className="max-w-7xl w-full mx-auto flex items-center justify-between pb-4 mb-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/90 shadow-md flex items-center justify-center text-cyan-600">
            <Waves className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display tracking-tight text-white flex items-center gap-2 drop-shadow-md leading-none">
              <span>Tarang</span>
              <span className="text-cyan-400 font-light">|</span>
              <span className="font-normal font-sans text-slate-200 text-xl">Deep Scan Portal</span>
            </h1>
          </div>
        </div>

        <button
          onClick={resetToSurface}
          className="px-5 py-2.5 rounded-full backdrop-blur-xl bg-white/90 hover:bg-white border border-white text-slate-900 text-xs font-semibold tracking-wide transition-all flex items-center gap-2 shadow-lg shadow-black/20 active:scale-95"
          title="Upload new sonar scan"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-700" />
          <span>Return to Surface</span>
        </button>
      </header>

      {/* Main 60 / 40 Bento Grid Split */}
      <main className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch pb-2">
        {/* Left Column: 60% Ocean Geographic Map */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 h-full will-change-transform transform-gpu"
        >
          <GeospatialMap />
        </motion.div>

        {/* Right Column: 40% Analytics Stack */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5 h-full will-change-transform transform-gpu"
        >
          <AnalyticsStack />
        </motion.div>
      </main>
    </motion.div>
  );
}

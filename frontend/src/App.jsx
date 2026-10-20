import React from 'react';
import Canvas3D from './components/Canvas3D';
import IngestionPortal from './components/IngestionPortal';
import WorkspaceLayout from './components/WorkspaceLayout';

export default function App() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#040814] text-slate-100 select-none">
      {/* 1. Persistent 3D WebGL Canvas (Particulates, Abyss Lighting, Camera Choreography) */}
      <Canvas3D />

      {/* 2. State 1: Ingestion Portal (Frosted glass pill with 3D dive collapse) */}
      <IngestionPortal />

      {/* 3. State 2: Spatial Workspace (3D Bathymetry + Analytics Bento Grid) */}
      <WorkspaceLayout />
    </div>
  );
}
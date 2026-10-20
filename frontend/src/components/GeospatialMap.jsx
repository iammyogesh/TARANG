import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import * as THREE from 'three';
import { useTarangStore } from '../stores/useTarangStore';
import { Layers, Crosshair } from 'lucide-react';

// 3D Canyon Bathymetry Scene
function CanyonBathymetryScene({ onPinClick }) {
  const scanResult = useTarangStore((s) => s.scanResult);
  const selectedHazardIndex = useTarangStore((s) => s.selectedHazardIndex);

  // Deep Ocean Rocky Canyon Terrain
  const canyonGeometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(22, 16, 64, 48);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const ridge =
        Math.sin(x * 0.45) * Math.cos(y * 0.35) * 1.5 +
        Math.sin(x * 0.9 + y * 0.7) * 0.6 -
        Math.exp(-((x * x) / 14)) * 1.8;
      pos.setZ(i, ridge);
    }
    geom.computeVertexNormals();
    return geom;
  }, []);

  // Floating Sonar Coverage Grid Mesh
  const sonarGridGeometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(10, 7, 6, 4);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const curve = Math.sin(x * 0.25) * 0.3 + Math.cos(y * 0.3) * 0.2;
      pos.setZ(i, curve);
    }
    return new THREE.WireframeGeometry(geom);
  }, []);

  // Debris Return Point-Cloud Speckle Clusters
  const pointCloudClusters = useMemo(() => {
    const points = [];
    const clusters = [
      { cx: -2.2, cy: 1.2, count: 260, spread: 0.8 },
      { cx: 1.8, cy: 1.4, count: 300, spread: 0.9 },
      { cx: -1.5, cy: -1.2, count: 380, spread: 1.1 },
      { cx: 2.1, cy: -1.1, count: 320, spread: 0.85 },
    ];

    clusters.forEach((c) => {
      for (let i = 0; i < c.count; i++) {
        const r = Math.random() * c.spread;
        const theta = Math.random() * Math.PI * 2;
        points.push(c.cx + r * Math.cos(theta), c.cy + r * Math.sin(theta), 0.25 + (Math.random() - 0.5) * 0.15);
      }
    });

    return new Float32Array(points);
  }, []);

  return (
    <group rotation={[-Math.PI / 2.35, 0, 0]} position={[0, -0.6, 0]}>
      {/* Canyon Seabed Surface */}
      <mesh geometry={canyonGeometry}>
        <meshStandardMaterial
          color="#0c2338"
          roughness={0.85}
          metalness={0.2}
          wireframe={false}
        />
      </mesh>

      {/* Floating Curved Sonar Coverage Grid */}
      <group position={[0, 0, 0.3]}>
        <lineSegments geometry={sonarGridGeometry}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.65} linewidth={1.5} />
        </lineSegments>

        {/* Acoustic Speckle Returns (Point Cloud Clusters) */}
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[pointCloudClusters, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.045}
            color="#ffffff"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>

      {/* Interactive Detected Hazard Pins */}
      {scanResult?.detections?.map((hazard, index) => {
        const posX = (hazard.bbox.x + hazard.bbox.width / 2 - 0.5) * 8;
        const posY = (0.5 - (hazard.bbox.y + hazard.bbox.height / 2)) * 6;
        const isSelected = selectedHazardIndex === index;
        const isCritical = hazard.confidence > 0.85;

        return (
          <group key={index} position={[posX, posY, 0.6]}>
            {/* Glowing Target Sphere */}
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(index, [posX, posY, 0.6]);
              }}
            >
              <sphereGeometry args={[isSelected ? 0.32 : 0.22, 16, 16]} />
              <meshStandardMaterial
                color={isCritical ? '#ff3366' : '#00e5ff'}
                emissive={isCritical ? '#ff3366' : '#00e5ff'}
                emissiveIntensity={isSelected ? 2.5 : 1.3}
              />
            </mesh>

            {/* Expanding Beacon Ring */}
            {isSelected && (
              <mesh position={[0, 0, 0.05]}>
                <ringGeometry args={[0.3, 0.7, 32]} />
                <meshBasicMaterial
                  color={isCritical ? '#ff3366' : '#00e5ff'}
                  transparent
                  opacity={0.65}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}

            {/* 3D Label Tag */}
            <Html position={[0, 0.6, 0]} center distanceFactor={11}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onPinClick(index, [posX, posY, 0.6]);
                }}
                className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shadow-xl border transition-all ${
                  isSelected
                    ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold scale-110 shadow-rose-500/20'
                    : 'bg-white/95 text-slate-800 border-slate-200 hover:scale-105'
                }`}
              >
                {hazard.label} ({(hazard.confidence * 100).toFixed(0)}%)
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// Raw Sonar Scan Texture Inspector
function SonarScanOverlay() {
  const { previewUrl, scanResult, selectedHazardIndex, setSelectedHazardIndex } = useTarangStore();
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!previewUrl) return null;

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 overflow-hidden select-none">
      <div className="relative max-h-full max-w-full rounded-2xl overflow-hidden border border-slate-200 shadow-xl bg-slate-950">
        <img
          src={previewUrl}
          alt="Side-Scan Sonar Analysis"
          className="max-h-[460px] w-auto object-contain rounded-2xl"
        />

        <svg className="absolute inset-0 w-full h-full pointer-events-auto">
          {scanResult?.detections?.map((det, index) => {
            const isSelected = selectedHazardIndex === index;
            const isHovered = hoveredIndex === index;
            const isHighConfidence = det.confidence > 0.85;

            const strokeColor = isHighConfidence ? '#e11d48' : '#00b4d8';
            const fillColor = isHighConfidence
              ? isSelected ? 'rgba(225,29,72,0.38)' : 'rgba(225,29,72,0.18)'
              : isSelected ? 'rgba(0,180,216,0.38)' : 'rgba(0,180,216,0.15)';

            return (
              <g
                key={index}
                className="cursor-pointer transition-all"
                onClick={() => setSelectedHazardIndex(index)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <rect
                  x={`${det.bbox.x * 100}%`}
                  y={`${det.bbox.y * 100}%`}
                  width={`${det.bbox.width * 100}%`}
                  height={`${det.bbox.height * 100}%`}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={isSelected || isHovered ? '2.8' : '1.8'}
                  rx="6"
                  className="transition-all"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function GeospatialMap() {
  const { viewMode, setViewMode, setSelectedHazardIndex, setFocusedCoordinate } = useTarangStore();

  // Subtle 3D Card Tilt on Mouse Move
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-200, 200], [4, -4]);
  const rotateY = useTransform(mouseX, [-300, 300], [-4, 4]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const handlePinClick = (index, coord) => {
    setSelectedHazardIndex(index);
    setFocusedCoordinate(coord);
  };

  return (
    <motion.div
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full h-[580px] rounded-3xl backdrop-blur-3xl bg-white/95 border border-white/90 overflow-hidden shadow-[0_25px_60px_rgba(0,12,30,0.22),0_1px_3px_rgba(255,255,255,0.9)_inset] flex flex-col transition-shadow duration-300 hover:shadow-[0_30px_70px_rgba(0,180,216,0.25)]"
    >
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 z-10 bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-700">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight font-sans">
              Seabed Topography & Debris Map
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Interactive 3D Bathymetry & Hazard Location Markers
            </p>
          </div>
        </div>

        {/* Viewport Mode Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setViewMode('3D_SEABED')}
            className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              viewMode === '3D_SEABED'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white font-bold shadow-sm shadow-cyan-600/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D Canyon</span>
          </button>
          <button
            onClick={() => setViewMode('SONAR_TEXTURE')}
            className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              viewMode === 'SONAR_TEXTURE'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white font-bold shadow-sm shadow-cyan-600/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Raw Sonar Log</span>
          </button>
        </div>
      </div>

      {/* Active Visualizer Viewport */}
      <div className="relative flex-1 w-full h-full bg-[#051628]">
        {viewMode === '3D_SEABED' ? (
          <Canvas camera={{ position: [0, 5.5, 7.5], fov: 42 }}>
            <ambientLight intensity={0.7} color="#38bdf8" />
            <directionalLight position={[6, 12, 6]} intensity={2.2} color="#f0f9ff" />
            <pointLight position={[0, 4, 2]} intensity={2.0} color="#00e5ff" />
            <pointLight position={[-4, 1, -2]} intensity={1.5} color="#ff3366" />

            <CanyonBathymetryScene onPinClick={handlePinClick} />
            <OrbitControls
              enablePan={true}
              enableZoom={true}
              maxPolarAngle={Math.PI / 2.15}
              minDistance={3}
              maxDistance={14}
            />
          </Canvas>
        ) : (
          <SonarScanOverlay />
        )}

        {/* Compass Rose */}
        <div className="absolute bottom-5 left-5 z-10 flex flex-col items-center select-none pointer-events-none">
          <div className="w-11 h-11 rounded-full border border-white/30 bg-black/40 backdrop-blur-md flex flex-col items-center justify-center text-white shadow-lg">
            <span className="text-[10px] font-mono font-bold leading-none -mt-1 text-cyan-300">N</span>
            <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[9px] border-b-cyan-400 my-0.5" />
            <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[9px] border-t-white/40" />
          </div>
        </div>

        {/* Legend Overlay at Bottom-Right */}
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-white/90 border border-white text-xs shadow-md backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ff3366]" />
            <span className="text-slate-700 font-semibold">Detected Hazard</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white border border-slate-300" />
            <span className="text-slate-700 font-semibold">Acoustic Return</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

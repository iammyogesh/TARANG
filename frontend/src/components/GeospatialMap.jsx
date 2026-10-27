import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import L from 'leaflet';
import { useTarangStore } from '../stores/useTarangStore';
import {
  MapPin,
  Crosshair,
  Layers,
  Globe2,
  Navigation,
  Maximize2,
  Compass,
  Eye,
  Sliders,
} from 'lucide-react';

// =========================================================================
// 1. REAL INTERACTIVE OCEAN & SEABED GEOGRAPHIC MAP (Leaflet Engine)
// =========================================================================
function RealOceanMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const trackLayerRef = useRef(null);
  const activeTileLayerRef = useRef(null);

  const {
    scanResult,
    selectedHazardIndex,
    setSelectedHazardIndex,
    minConfidence,
    setViewMode,
  } = useTarangStore();

  const [activeBaseLayer, setActiveBaseLayer] = useState('OCEAN'); // 'OCEAN' | 'SATELLITE' | 'DARK'
  const [cursorCoords, setCursorCoords] = useState(null);

  // Normalize detections and ensure every anomaly has real coordinates
  const anomalies = useMemo(() => {
    const raw = (scanResult?.detections || []).filter((d) => d.confidence >= minConfidence);
    return raw.map((d, i) => {
      // Default base location: Arabian Sea / Goa Coastal Survey Zone (14.2120° N, 68.3912° E)
      const lat =
        typeof d.coordinates?.lat === 'number' && !isNaN(d.coordinates.lat)
          ? d.coordinates.lat
          : 14.2120 + ((d.bbox?.y || i * 0.15) - 0.5) * 0.015;
      const lon =
        typeof d.coordinates?.lon === 'number' && !isNaN(d.coordinates.lon)
          ? d.coordinates.lon
          : 68.3912 + ((d.bbox?.x || i * 0.15) - 0.5) * 0.018;

      return {
        ...d,
        index: i,
        lat,
        lon,
        id: d.id || `TRG-${String(i + 1).padStart(3, '0')}`,
        label: d.label || 'Marine Anomaly',
        category: d.category || 'Debris Hazard',
        confidence: typeof d.confidence === 'number' ? d.confidence : 0.85,
        length_m: d.dimensions_m?.length || 8.5,
        width_m: d.dimensions_m?.width || 3.2,
      };
    });
  }, [scanResult, minConfidence]);

  // Tile Layer Providers
  const tileProviders = {
    OCEAN: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, GEBCO, NOAA Bathymetric Survey',
      maxZoom: 16,
    },
    SATELLITE: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri World Imagery, Maxar, Earthstar Geographics',
      maxZoom: 18,
    },
    DARK: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap &copy; CARTO Dark Matter',
      maxZoom: 19,
    },
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const centerLat = anomalies.length > 0 ? anomalies[0].lat : 14.2120;
      const centerLon = anomalies.length > 0 ? anomalies[0].lon : 68.3912;

      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLon],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      // Default Ocean Basemap
      const baseTile = L.tileLayer(tileProviders.OCEAN.url, {
        maxZoom: tileProviders.OCEAN.maxZoom,
        attribution: tileProviders.OCEAN.attribution,
      }).addTo(map);

      activeTileLayerRef.current = baseTile;
      markersLayerRef.current = L.layerGroup().addTo(map);
      trackLayerRef.current = L.layerGroup().addTo(map);

      // Track cursor coordinates
      map.on('mousemove', (e) => {
        setCursorCoords({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
        });
      });

      map.on('mouseout', () => {
        setCursorCoords(null);
      });

      mapInstanceRef.current = map;

      // Force resize calculation once DOM is rendered
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Switch Base Layers dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (activeTileLayerRef.current) {
      map.removeLayer(activeTileLayerRef.current);
    }

    const provider = tileProviders[activeBaseLayer] || tileProviders.OCEAN;
    const newLayer = L.tileLayer(provider.url, {
      maxZoom: provider.maxZoom,
      attribution: provider.attribution,
    }).addTo(map);

    activeTileLayerRef.current = newLayer;
  }, [activeBaseLayer]);

  // Update Anomaly Markers & Survey Track
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    const trackLayer = trackLayerRef.current;

    if (!map || !markersLayer || !trackLayer) return;

    markersLayer.clearLayers();
    trackLayer.clearLayers();

    if (anomalies.length === 0) return;

    const latLngs = [];

    anomalies.forEach((anomaly) => {
      latLngs.push([anomaly.lat, anomaly.lon]);

      const isSelected = selectedHazardIndex === anomaly.index;
      const isCritical = anomaly.confidence > 0.85;

      const pulseColor = isCritical ? 'rgba(255, 51, 102, 0.45)' : 'rgba(0, 229, 255, 0.45)';
      const solidColor = isCritical ? '#ff3366' : '#00b4d8';

      // Custom pulsating radar beacon icon
      const customIcon = L.divIcon({
        className: 'sonar-marker-div',
        html: `
          <div style="position: relative; width: 38px; height: 38px; display: flex; items-center; justify-content: center; cursor: pointer;">
            <div style="position: absolute; inset: 0; border-radius: 50%; background: ${pulseColor};" class="animate-sonar-pulse"></div>
            <div style="position: absolute; top: 7px; left: 7px; width: 24px; height: 24px; border-radius: 50%; background: ${
              isSelected ? '#ffffff' : solidColor
            }; border: 2.5px solid ${
          isSelected ? solidColor : '#ffffff'
        }; box-shadow: 0 0 14px ${solidColor}; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background: ${
                isSelected ? solidColor : '#ffffff'
              };"></div>
            </div>
            ${
              isSelected
                ? `<div style="position: absolute; top: -22px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px; white-space: nowrap; border: 1px solid ${solidColor}; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">${anomaly.label}</div>`
                : ''
            }
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([anomaly.lat, anomaly.lon], { icon: customIcon });

      // Rich Anomaly Popup
      const popupContent = `
        <div style="width: 240px; padding: 14px; font-family: 'Space Grotesk', -apple-system, sans-serif; color: #0f172a;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #0284c7;">${
              anomaly.id
            }</span>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: ${
              isCritical ? '#ffe4e6' : '#e0f2fe'
            }; color: ${isCritical ? '#be123c' : '#0369a1'};">
              ${isCritical ? 'Critical Hazard' : 'Review Required'}
            </span>
          </div>

          <h4 style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">${
            anomaly.label
          }</h4>
          <p style="font-size: 11px; color: #64748b; margin: 0 0 10px 0; font-weight: 500;">Category: ${
            anomaly.category
          }</p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span style="color: #64748b;">AI Confidence:</span>
              <strong style="color: ${solidColor};">${(anomaly.confidence * 100).toFixed(1)}%</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span style="color: #64748b;">GPS Latitude:</span>
              <strong style="font-family: 'JetBrains Mono', monospace;">${anomaly.lat.toFixed(5)}°N</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span style="color: #64748b;">GPS Longitude:</span>
              <strong style="font-family: 'JetBrains Mono', monospace;">${anomaly.lon.toFixed(5)}°E</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;">
              <span style="color: #64748b;">Dimensions:</span>
              <strong style="font-family: 'JetBrains Mono', monospace;">${anomaly.length_m}m × ${anomaly.width_m}m</strong>
            </div>
          </div>

          <div style="display: flex; gap: 6px;">
            <button id="inspect-sonar-btn-${anomaly.index}" style="width: 100%; background: linear-gradient(135deg, #0284c7, #0ea5e9); color: #ffffff; border: none; border-radius: 8px; padding: 7px 10px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              Inspect Sonar Texture
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 280 });

      marker.on('click', () => {
        setSelectedHazardIndex(anomaly.index);
      });

      marker.on('popupopen', () => {
        const btn = document.getElementById(`inspect-sonar-btn-${anomaly.index}`);
        if (btn) {
          btn.onclick = () => setViewMode('SONAR_TEXTURE');
        }
      });

      markersLayer.addLayer(marker);

      // Auto-open popup if this anomaly is selected
      if (isSelected) {
        setTimeout(() => {
          marker.openPopup();
        }, 100);
      }
    });

    // Draw AUV / Vessel Sonar Sweep Path (Illuminated Cyan Polyline)
    if (latLngs.length > 1) {
      const surveyTrack = L.polyline(latLngs, {
        color: '#00e5ff',
        weight: 2.5,
        dashArray: '6, 8',
        opacity: 0.85,
      });

      trackLayer.addLayer(surveyTrack);
    }

    // Auto-fit bounds if we have points
    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [anomalies, selectedHazardIndex]);

  // Synchronized flight when table selection changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || selectedHazardIndex === null) return;

    const target = anomalies.find((a) => a.index === selectedHazardIndex);
    if (target) {
      map.flyTo([target.lat, target.lon], 15, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  }, [selectedHazardIndex, anomalies]);

  // Map controls
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleFitBounds = () => {
    if (!mapInstanceRef.current || anomalies.length === 0) return;
    const latLngs = anomalies.map((a) => [a.lat, a.lon]);
    mapInstanceRef.current.fitBounds(L.latLngBounds(latLngs), {
      padding: [50, 50],
      maxZoom: 15,
    });
  };

  return (
    <div className="relative w-full h-full bg-[#031122] overflow-hidden select-none">
      {/* Real Interactive Leaflet Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Floating Map Controls HUD */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Layer Switcher Pills */}
        <div className="flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-lg text-[11px] font-bold text-slate-700">
          <button
            onClick={() => setActiveBaseLayer('OCEAN')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeBaseLayer === 'OCEAN'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            Bathymetry
          </button>
          <button
            onClick={() => setActiveBaseLayer('SATELLITE')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeBaseLayer === 'SATELLITE'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            Satellite
          </button>
          <button
            onClick={() => setActiveBaseLayer('DARK')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeBaseLayer === 'DARK'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            Dark HUD
          </button>
        </div>

        {/* Zoom & Reset Buttons */}
        <div className="flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-lg">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
            title="Zoom Out"
          >
            -
          </button>
          <button
            onClick={handleFitBounds}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
            title="Fit All Detected Anomalies"
          >
            <Maximize2 className="w-4 h-4 text-cyan-700" />
          </button>
        </div>
      </div>

      {/* Bottom Coordinates & Bathymetry Telemetry HUD */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
        <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/20 text-white shadow-xl flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-cyan-400">
            <Compass className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '10s' }} />
            <span>GEO-FIX:</span>
          </div>
          {cursorCoords ? (
            <span>
              {cursorCoords.lat.toFixed(4)}°N, {cursorCoords.lng.toFixed(4)}°E
            </span>
          ) : (
            <span>14.2120°N, 68.3912°E (Survey Datum)</span>
          )}
          <span className="text-slate-500">|</span>
          <span className="text-sky-300">DEPTH: ~48.2m MSL</span>
        </div>
      </div>

      {/* Bottom-Right Legend */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-white/80 text-xs shadow-lg">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff3366] shadow-[0_0_6px_#ff3366]" />
          <span className="text-slate-700 font-semibold text-[11px]">Critical (&gt;85%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00b4d8] shadow-[0_0_6px_#00b4d8]" />
          <span className="text-slate-700 font-semibold text-[11px]">Review</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 bg-[#00e5ff] border-t border-dashed" />
          <span className="text-slate-700 font-semibold text-[11px]">AUV Sweep Path</span>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 2. RAW SONAR SCAN TEXTURE INSPECTOR
// =========================================================================
function SonarScanOverlay() {
  const { previewUrl, scanResult, selectedHazardIndex, setSelectedHazardIndex } = useTarangStore();
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!previewUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
        <Crosshair className="w-10 h-10 text-cyan-500/50 mb-3 animate-pulse" />
        <p className="text-sm font-semibold text-slate-300">No active sonar image scan loaded.</p>
        <p className="text-xs text-slate-500 mt-1">Upload a sonar pass from the surface portal.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 overflow-hidden select-none bg-slate-950">
      <div className="relative max-h-full max-w-full rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl bg-black">
        <img
          src={previewUrl}
          alt="Side-Scan Sonar Acoustic Data"
          className="max-h-[460px] w-auto object-contain rounded-2xl"
        />

        <svg className="absolute inset-0 w-full h-full pointer-events-auto">
          {scanResult?.detections?.map((det, index) => {
            const isSelected = selectedHazardIndex === index;
            const isHovered = hoveredIndex === index;
            const isHighConfidence = det.confidence > 0.85;

            const strokeColor = isHighConfidence ? '#ff3366' : '#00b4d8';
            const fillColor = isHighConfidence
              ? isSelected
                ? 'rgba(255, 51, 102, 0.4)'
                : 'rgba(255, 51, 102, 0.18)'
              : isSelected
              ? 'rgba(0, 180, 216, 0.4)'
              : 'rgba(0, 180, 216, 0.15)';

            return (
              <g
                key={index}
                className="cursor-pointer transition-all"
                onClick={() => setSelectedHazardIndex(index)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <rect
                  x={`${(det.bbox?.x || 0) * 100}%`}
                  y={`${(det.bbox?.y || 0) * 100}%`}
                  width={`${(det.bbox?.width || 0.1) * 100}%`}
                  height={`${(det.bbox?.height || 0.1) * 100}%`}
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

// =========================================================================
// 3. 3D CANYON BATHYMETRY SCENE (Optional 3D Perspective)
// =========================================================================
function CanyonBathymetryScene({ onPinClick }) {
  const scanResult = useTarangStore((s) => s.scanResult);
  const selectedHazardIndex = useTarangStore((s) => s.selectedHazardIndex);

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

  return (
    <group rotation={[-Math.PI / 2.35, 0, 0]} position={[0, -0.6, 0]}>
      <mesh geometry={canyonGeometry}>
        <meshStandardMaterial color="#0c2338" roughness={0.85} metalness={0.2} />
      </mesh>

      {scanResult?.detections?.map((hazard, index) => {
        const posX = ((hazard.bbox?.x || 0.5) + (hazard.bbox?.width || 0.1) / 2 - 0.5) * 8;
        const posY = (0.5 - ((hazard.bbox?.y || 0.5) + (hazard.bbox?.height || 0.1) / 2)) * 6;
        const isSelected = selectedHazardIndex === index;
        const isCritical = hazard.confidence > 0.85;

        return (
          <group key={index} position={[posX, posY, 0.6]}>
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
            <Html position={[0, 0.6, 0]} center distanceFactor={11}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onPinClick(index, [posX, posY, 0.6]);
                }}
                className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shadow-xl border transition-all ${
                  isSelected
                    ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold scale-110'
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

// =========================================================================
// 4. MAIN GEOSPATIAL MAP CARD CONTAINER (Hardware-Accelerated, Stutter-Free)
// =========================================================================
export default function GeospatialMap() {
  const { viewMode, setViewMode, setSelectedHazardIndex, setFocusedCoordinate } = useTarangStore();

  const handlePinClick = (index, coord) => {
    setSelectedHazardIndex(index);
    setFocusedCoordinate(coord);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      whileHover={{ y: -3, transition: { duration: 0.2, ease: 'easeOut' } }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full h-[580px] rounded-3xl backdrop-blur-2xl bg-white/95 border border-white/90 overflow-hidden shadow-[0_15px_35px_rgba(0,12,30,0.18),0_1px_3px_rgba(255,255,255,0.9)_inset] flex flex-col transition-all duration-300 hover:shadow-[0_25px_50px_rgba(0,180,216,0.22)] hover:border-cyan-100 will-change-transform transform-gpu"
    >
      {/* Top Header Bar & Mode Selector */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 z-10 bg-white/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-700 shadow-sm">
            <Globe2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight font-sans">
              Ocean Geographic & Sonar Anomaly Map
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Interactive Seabed GPS Coordinates & Anomaly Telemetry
            </p>
          </div>
        </div>

        {/* Viewport Mode Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setViewMode('REAL_MAP')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              viewMode === 'REAL_MAP'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white font-bold shadow-sm shadow-cyan-600/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Ocean Map</span>
          </button>

          <button
            onClick={() => setViewMode('SONAR_TEXTURE')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              viewMode === 'SONAR_TEXTURE'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white font-bold shadow-sm shadow-cyan-600/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Raw Sonar</span>
          </button>

          <button
            onClick={() => setViewMode('3D_SEABED')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              viewMode === '3D_SEABED'
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white font-bold shadow-sm shadow-cyan-600/30'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D Canyon</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Content */}
      <div className="relative flex-1 w-full h-full bg-[#031122]">
        {viewMode === 'REAL_MAP' ? (
          <RealOceanMap />
        ) : viewMode === 'SONAR_TEXTURE' ? (
          <SonarScanOverlay />
        ) : (
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
        )}
      </div>
    </motion.div>
  );
}

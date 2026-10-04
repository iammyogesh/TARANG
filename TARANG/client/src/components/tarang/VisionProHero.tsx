import React from "react";
import { ArrowUpRight, Check, Compass, Play, Sparkles, Target, Waves, Zap } from "lucide-react";
import { sounds } from "@/lib/soundEffects";

interface VisionProHeroProps {
  onStartReview: () => void;
  onExploreMap: () => void;
}

export function VisionProHero({ onStartReview, onExploreMap }: VisionProHeroProps) {
  return (
    <div className="vision-hero-stage">
      {/* Studio Header */}
      <div className="vision-stage-header">
        <div className="vision-pill-brand">
          <Waves size={16} className="brand-wave-icon" />
          <span>TARANG ACOUSTIC VISION</span>
          <span className="vision-version-chip">v0.9.4</span>
        </div>
        <div className="vision-mission-pill">
          <span className="live-pulse-dot" />
          <span>RV Samudra 04 · Kochi Outer Shelf</span>
        </div>
      </div>

      {/* Floating 3D Cards Exhibition Grid matching Reference Image 2 */}
      <div className="vision-cards-grid">
        {/* Left Column: Porcelain White Tactile Main Card */}
        <div className="vision-card-porcelain">
          <div className="porcelain-eyebrow">
            <span className="pill-mini-dot" />
            <span>Side-Scan Sonar Computer Vision</span>
          </div>
          <h2 className="porcelain-title">
            Autonomous Marine Debris Intelligence
          </h2>
          <p className="porcelain-description">
            High-frequency acoustic mapping pipeline detecting submerged ghost nets, plastic debris, and industrial ordnance across the Arabian Sea continental shelf.
          </p>

          <div className="porcelain-specs">
            <div className="spec-item">
              <span className="spec-label">Model Engine</span>
              <strong className="spec-value">YOLOv8m + Acoustic Refiner</strong>
            </div>
            <div className="spec-item">
              <span className="spec-label">Swath Coverage</span>
              <strong className="spec-value">80 m @ 450 kHz</strong>
            </div>
            <div className="spec-item">
              <span className="spec-label">Confidence Gate</span>
              <strong className="spec-value text-teal">0.72 Boundary</strong>
            </div>
          </div>

          <div className="porcelain-actions">
            <button
              className="tactile-pill-btn primary"
              onClick={() => {
                sounds.playClick();
                onStartReview();
              }}
            >
              <Target size={14} /> Start Review Queue
            </button>
            <button
              className="tactile-pill-btn secondary"
              onClick={() => {
                sounds.playClick();
                onExploreMap();
              }}
            >
              <Compass size={14} /> View Nautical Map
            </button>
          </div>
        </div>

        {/* Center Top: Sunset Amber Waves Card */}
        <div className="vision-card-amber">
          <div className="amber-card-glow" />
          <div className="amber-card-content">
            <div className="amber-badge">
              <Sparkles size={12} />
              <span>Acoustic Fidelity</span>
            </div>
            <h3 className="amber-title">94.3% Precision</h3>
            <p className="amber-sub">
              Shadow-to-highlight ratio filtering eliminates false rock reflections across 18,426 sonar frames.
            </p>
            <div className="amber-button-container">
              <button
                className="amber-pill-button"
                onClick={() => {
                  sounds.playSonarPing();
                }}
              >
                <span>Acoustic Profile Validated</span>
                <Check size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Top: Sunken Treasure / Metrics Card */}
        <div className="vision-card-porcelain-compact">
          <span className="card-micro-label">CONFIRMED TARGETS</span>
          <div className="porcelain-metric-row">
            <span className="porcelain-huge-num">84</span>
            <span className="porcelain-unit">debris returns</span>
          </div>
          <div className="metric-breakdown">
            <div className="breakdown-bar">
              <span className="bar-net" style={{ width: "45%" }} title="Ghost Nets 45%" />
              <span className="bar-metal" style={{ width: "32%" }} title="Metal Wreckage 32%" />
              <span className="bar-plastic" style={{ width: "23%" }} title="Polymer Masses 23%" />
            </div>
            <div className="breakdown-legend">
              <span><i></i> Nets</span>
              <span><i className="metal"></i> Metals</span>
              <span><i className="plastic"></i> Plastics</span>
            </div>
          </div>
        </div>

        {/* Center Bottom: Deep Ocean Emerald Glowing Card */}
        <div className="vision-card-emerald">
          <div className="emerald-light-streak" />
          <div className="emerald-content">
            <div className="emerald-header">
              <span className="emerald-tag">AUV TOW-FISH</span>
              <span className="emerald-live">42.1 m DEPTH</span>
            </div>
            <h3 className="emerald-heading">Continuous Transect Ping</h3>
            <p className="emerald-text">
              Real-time multi-beam swath telemetry logging bathymetry contours, heading, and speed over ground.
            </p>
            <div className="emerald-floating-pill">
              <span className="floating-pill-dot" />
              <span>Edge AI Latency: 142 ms</span>
            </div>
          </div>
        </div>

        {/* Right Bottom: Quick Sensor Card */}
        <div className="vision-card-porcelain-sensor">
          <span className="card-micro-label">TOW CONFIGURATION</span>
          <div className="sensor-readout">
            <div>
              <span>Tow Speed</span>
              <strong>2.4 kts</strong>
            </div>
            <div>
              <span>Altitude</span>
              <strong>5.8 m</strong>
            </div>
            <div>
              <span>Ping Rate</span>
              <strong>18.4 Hz</strong>
            </div>
          </div>
          <button
            className="tactile-sensor-btn"
            onClick={() => {
              sounds.playClick();
              onStartReview();
            }}
          >
            <Play size={12} fill="currentColor" /> Open Review Console
          </button>
        </div>
      </div>

      {/* Exhibition Stage Podium Rim */}
      <div className="vision-stage-podium">
        <div className="podium-surface" />
        <div className="podium-shadow" />
      </div>
    </div>
  );
}

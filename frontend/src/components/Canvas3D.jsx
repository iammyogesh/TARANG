import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { useTarangStore } from '../stores/useTarangStore';

// -------------------------------------------------------------
// DEAD SPACE 2 MULTI-WAYPOINT CAMERA RIG
// Coordinates 3D perspective orientation on button clicks
// -------------------------------------------------------------
function DeadSpaceCameraRig() {
  const { camera } = useThree();
  const state = useTarangStore((s) => s.state);
  const viewMode = useTarangStore((s) => s.viewMode);
  const focusedCoordinate = useTarangStore((s) => s.focusedCoordinate);

  useEffect(() => {
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camera.rotation);

    if (state === 'IDLE') {
      // WAYPOINT 1: Surface / Ingestion Portal
      gsap.to(camera.position, { x: 0, y: 0.5, z: 5.6, duration: 2.5, ease: 'power3.out' });
      gsap.to(camera.rotation, { x: -0.05, y: 0, z: 0, duration: 2.5, ease: 'power3.out' });
    } else if (state === 'INGESTING') {
      // Anticipation recoil
      gsap.to(camera.position, { x: -0.4, y: 0.7, z: 6.0, duration: 0.8, ease: 'sine.inOut' });
      gsap.to(camera.rotation, { x: -0.1, y: -0.08, z: -0.06, duration: 0.8, ease: 'sine.inOut' });
    } else if (state === 'DIVING') {
      // THE 3.2s CINEMATIC DEEP DIVE SWOOP
      const diveTl = gsap.timeline();
      diveTl
        .to(camera.position, { x: 2.4, y: -1.0, z: 3.2, duration: 1.4, ease: 'power2.in' })
        .to(camera.rotation, { x: 0.16, y: 0.38, z: 0.22, duration: 1.4, ease: 'power2.in' }, 0)
        .to(camera.position, { x: 0.4, y: 0.1, z: 4.8, duration: 1.8, ease: 'power3.out' })
        .to(camera.rotation, { x: 0.02, y: 0.05, z: 0.0, duration: 1.8, ease: 'power3.out' }, 1.4);
    } else if (state === 'WORKSPACE_ACTIVE') {
      if (viewMode === 'SONAR_TEXTURE') {
        // WAYPOINT 3: Sonar Log Close Inspection Swoop
        gsap.to(camera.position, { x: -2.0, y: 0.3, z: 4.0, duration: 2.0, ease: 'power3.inOut' });
        gsap.to(camera.rotation, { x: 0.04, y: -0.25, z: -0.08, duration: 2.0, ease: 'power3.inOut' });
      } else if (focusedCoordinate) {
        // Target Anomaly Zoom Flight
        gsap.to(camera.position, { x: focusedCoordinate[0] * 0.35, y: 0.3, z: 4.2, duration: 1.6, ease: 'power2.out' });
        gsap.to(camera.rotation, { x: 0.05, y: -0.1, z: 0.02, duration: 1.6, ease: 'power2.out' });
      } else {
        // WAYPOINT 2: Deep Scan Console Dock
        gsap.to(camera.position, { x: 0.4, y: 0.1, z: 4.8, duration: 1.8, ease: 'power2.out' });
        gsap.to(camera.rotation, { x: 0.02, y: 0.05, z: 0.0, duration: 1.8, ease: 'power2.out' });
      }
    }
  }, [state, viewMode, focusedCoordinate, camera]);

  useFrame(({ clock }) => {
    if (state === 'IDLE' || state === 'WORKSPACE_ACTIVE') {
      const t = clock.getElapsedTime();
      camera.position.x += Math.sin(t * 0.4) * 0.001;
      camera.position.y += Math.cos(t * 0.3) * 0.0012;
    }
  });

  return null;
}

// -------------------------------------------------------------
// 100% REAL UNDERWATER VIDEO BACKGROUND
// Clean, unobstructed authentic NOAA deep ocean footage
// -------------------------------------------------------------
export default function Canvas3D() {
  const state = useTarangStore((s) => s.state);
  const videoRef = useRef(null);

  // Initialize and play real underwater footage
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.play().catch((err) => console.warn('Autoplay interaction pending:', err));
  }, []);

  // Dynamic Cinematic Motion & Depth Filters based on state
  const getVideoAnimation = () => {
    switch (state) {
      case 'INGESTING':
        return {
          scale: 1.08,
          filter: 'brightness(0.85) contrast(1.15) saturate(1.1)',
          transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
        };
      case 'DIVING':
        return {
          scale: 1.25,
          filter: 'brightness(0.6) contrast(1.3) blur(2px)',
          transition: { duration: 3.2, ease: [0.16, 1, 0.3, 1] },
        };
      case 'WORKSPACE_ACTIVE':
        return {
          scale: 1.05,
          filter: 'brightness(0.55) contrast(1.18)',
          transition: { duration: 1.6, ease: [0.16, 1, 0.3, 1] },
        };
      case 'IDLE':
      default:
        return {
          scale: 1,
          filter: 'brightness(0.88) contrast(1.08)',
          transition: { duration: 1.8, ease: [0.16, 1, 0.3, 1] },
        };
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden bg-[#020b17]">
      {/* Real 1080p Underwater Deep-Sea Exploration Video Footage */}
      <motion.video
        ref={videoRef}
        src="/real-ocean.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        animate={getVideoAnimation()}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none will-change-transform"
      />

      {/* Atmospheric Vignette & Depth Color Grading */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#020b17]/90 via-transparent to-[#020b17]/65 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(1,8,18,0.75)_100%)] pointer-events-none" />

      {/* Synchronized 3D Camera Controller (No overlapping fake particles) */}
      <div className="absolute inset-0 pointer-events-none">
        <Canvas
          camera={{ position: [0, 0.5, 5.6], fov: 48 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <DeadSpaceCameraRig />
        </Canvas>
      </div>
    </div>
  );
}

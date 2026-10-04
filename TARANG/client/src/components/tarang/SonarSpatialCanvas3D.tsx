import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Compass, Eye, Layers, Maximize2, RotateCcw, Volume2, Waves, Zap } from "lucide-react";
import { sounds } from "@/lib/soundEffects";

interface DebrisTarget3D {
  id: string;
  label: string;
  category: string;
  confidence: number;
  depthM: number;
  x: number;
  z: number;
}

const DEBRIS_TARGETS: DebrisTarget3D[] = [
  { id: "D-0842", label: "Ghost Fishing Net", category: "Fishing gear", confidence: 96, depthM: 42.4, x: -6, z: 4 },
  { id: "D-0841", label: "Freight Container", category: "Metal fragment", confidence: 94, depthM: 48.1, x: 8, z: -10 },
  { id: "D-0838", label: "Polymer Cluster", category: "Plastic mass", confidence: 91, depthM: 36.5, x: -14, z: -20 },
  { id: "D-0834", label: "Subsea Pipe", category: "Metal fragment", confidence: 89, depthM: 39.8, x: 12, z: 15 },
  { id: "D-0827", label: "Wreckage Rib", category: "Metal fragment", confidence: 97, depthM: 52.0, x: -2, z: -35 },
];

export function SonarSpatialCanvas3D({
  selectedId,
  onSelectTarget,
}: {
  selectedId?: string;
  onSelectTarget?: (id: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"chase" | "top" | "side" | "orbit">("orbit");
  const [wireframe, setWireframe] = useState(false);
  const [hoveredTarget, setHoveredTarget] = useState<DebrisTarget3D | null>(null);
  const [lastPingTime, setLastPingTime] = useState<number>(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(sounds.isEnabled());

  const stateRef = useRef({
    viewMode: "orbit" as "chase" | "top" | "side" | "orbit",
    wireframe: false,
    selectedId: selectedId,
    mouse: new THREE.Vector2(-100, -100),
    isDragging: false,
    prevMousePos: { x: 0, y: 0 },
    orbitAngles: { theta: 0.8, phi: 0.65, radius: 45 },
  });

  useEffect(() => {
    stateRef.current.viewMode = viewMode;
  }, [viewMode]);

  useEffect(() => {
    stateRef.current.wireframe = wireframe;
  }, [wireframe]);

  useEffect(() => {
    stateRef.current.selectedId = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 460;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06151f);
    scene.fog = new THREE.FogExp2(0x06151f, 0.016);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(25, 22, 35);
    camera.lookAt(0, -5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0x0a3344, 1.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0x67d7e4, 2.4);
    sunLight.position.set(20, 50, 20);
    scene.add(sunLight);

    const underGlow = new THREE.PointLight(0x2affc6, 2, 60);
    underGlow.position.set(0, 5, 0);
    scene.add(underGlow);

    // 3. Seabed Bathymetric Terrain
    const gridDim = 120;
    const gridRes = 60;
    const terrainGeo = new THREE.PlaneGeometry(gridDim, gridDim, gridRes, gridRes);
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position;
    const colors = [];
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      // Realistic undulating seabed bathymetry with shelf drop-off
      const shelfSlope = (vz / gridDim) * 12;
      const hills = Math.sin(vx * 0.08) * 3.5 + Math.cos(vz * 0.09) * 2.8 + Math.sin(vx * 0.18 + vz * 0.15) * 1.5;
      const y = -12 - shelfSlope + hills;
      posAttr.setY(i, y);

      // Depth gradient colors
      const depthRatio = Math.min(1, Math.max(0, (-y - 8) / 22));
      const col = new THREE.Color();
      // From shallow cyan-teal (0x126e82) to deep trench navy (0x041a24)
      col.lerpColors(new THREE.Color(0x0f5263), new THREE.Color(0x041922), depthRatio);
      colors.push(col.r, col.g, col.b);
    }
    terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.15,
      wireframe: false,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);

    // 4. Underwater Particles (Marine Snow)
    const particleCount = 400;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePos[i] = (Math.random() - 0.5) * 100;
      particlePos[i + 1] = Math.random() * 30 - 20;
      particlePos[i + 2] = (Math.random() - 0.5) * 100;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x67d7e4,
      size: 0.45,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 5. Autonomous Tow-Fish / AUV Model
    const auvGroup = new THREE.Group();
    // Fuselage
    const bodyGeo = new THREE.CylinderGeometry(0.8, 0.7, 5, 24);
    bodyGeo.rotateZ(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0e4c5b,
      metalness: 0.7,
      roughness: 0.25,
      emissive: 0x05232b,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    auvGroup.add(bodyMesh);

    // Nose dome
    const noseGeo = new THREE.SphereGeometry(0.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    noseGeo.rotateZ(-Math.PI / 2);
    noseGeo.translate(2.5, 0, 0);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xf18473, metalness: 0.5, roughness: 0.3 });
    const noseMesh = new THREE.Mesh(noseGeo, noseMat);
    auvGroup.add(noseMesh);

    // Dive Wings (Side Sonar Fin Transducers)
    const wingGeo = new THREE.BoxGeometry(2.4, 0.08, 3.8);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x133842, metalness: 0.8, roughness: 0.3 });
    const wingMesh = new THREE.Mesh(wingGeo, wingMat);
    wingMesh.position.set(-0.2, 0, 0);
    auvGroup.add(wingMesh);

    // Vertical Stabilizer Rudder
    const rudderGeo = new THREE.BoxGeometry(1.4, 1.4, 0.08);
    const rudderMesh = new THREE.Mesh(rudderGeo, wingMat);
    rudderMesh.position.set(-2, 0.7, 0);
    auvGroup.add(rudderMesh);

    // Propeller
    const propGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 6);
    propGeo.rotateZ(Math.PI / 2);
    const propMat = new THREE.MeshStandardMaterial({ color: 0x67d7e4, metalness: 0.9, roughness: 0.1 });
    const propMesh = new THREE.Mesh(propGeo, propMat);
    propMesh.position.set(-2.6, 0, 0);
    auvGroup.add(propMesh);

    // Navigation LED Beacon
    const ledLight = new THREE.PointLight(0x2affc6, 3, 15);
    ledLight.position.set(2.8, 0.4, 0);
    auvGroup.add(ledLight);

    // Dual-Beam Sonar Acoustic Cones (Port & Starboard)
    const coneGeo = new THREE.ConeGeometry(8, 16, 16, 1, true);
    coneGeo.translate(0, -8, 0);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x2affc6,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      wireframe: true,
    });
    const portCone = new THREE.Mesh(coneGeo, coneMat);
    portCone.position.set(0, 0, -1.8);
    portCone.rotation.x = -0.35;
    auvGroup.add(portCone);

    const stbdCone = new THREE.Mesh(coneGeo, coneMat);
    stbdCone.position.set(0, 0, 1.8);
    stbdCone.rotation.x = 0.35;
    auvGroup.add(stbdCone);

    auvGroup.position.set(0, 3, 0);
    scene.add(auvGroup);

    // 6. Sonar Pulse Ripple Ring on Seabed
    const ringGeo = new THREE.RingGeometry(0.1, 1.2, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2affc6,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const pulseRing = new THREE.Mesh(ringGeo, ringMat);
    pulseRing.position.set(0, -12, 0);
    scene.add(pulseRing);

    // 7. 3D Debris Target Beacons
    const targetMeshes: THREE.Group[] = [];
    DEBRIS_TARGETS.forEach((target) => {
      const markerGroup = new THREE.Group();
      markerGroup.userData = { target };

      // Base cylinder pillar
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 6, 8);
      const poleMat = new THREE.MeshBasicMaterial({ color: 0x67d7e4, transparent: true, opacity: 0.6 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 3;
      markerGroup.add(pole);

      // Floating holographic diamond badge
      const diamondGeo = new THREE.OctahedronGeometry(0.8);
      const isNet = target.category === "Fishing gear";
      const isMetal = target.category === "Metal fragment";
      const badgeColor = isNet ? 0x2affc6 : isMetal ? 0x67d7e4 : 0xf18473;

      const diamondMat = new THREE.MeshStandardMaterial({
        color: badgeColor,
        emissive: badgeColor,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const diamond = new THREE.Mesh(diamondGeo, diamondMat);
      diamond.position.y = 6.2;
      markerGroup.add(diamond);

      // Pulsing target ground ring
      const gRingGeo = new THREE.RingGeometry(1.2, 1.5, 24);
      gRingGeo.rotateX(-Math.PI / 2);
      const gRingMat = new THREE.MeshBasicMaterial({
        color: badgeColor,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      const gRing = new THREE.Mesh(gRingGeo, gRingMat);
      gRing.position.y = 0.2;
      markerGroup.add(gRing);

      markerGroup.position.set(target.x, -14, target.z);
      scene.add(markerGroup);
      targetMeshes.push(markerGroup);
    });

    // 8. Mouse & Interaction
    const raycaster = new THREE.Raycaster();
    const mousePos = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      stateRef.current.mouse.copy(mousePos);

      if (stateRef.current.isDragging) {
        const dx = e.clientX - stateRef.current.prevMousePos.x;
        const dy = e.clientY - stateRef.current.prevMousePos.y;
        stateRef.current.orbitAngles.theta -= dx * 0.008;
        stateRef.current.orbitAngles.phi = Math.max(0.15, Math.min(Math.PI / 2.2, stateRef.current.orbitAngles.phi - dy * 0.008));
        stateRef.current.prevMousePos = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      stateRef.current.isDragging = true;
      stateRef.current.prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      stateRef.current.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stateRef.current.orbitAngles.radius = Math.max(15, Math.min(85, stateRef.current.orbitAngles.radius + e.deltaY * 0.04));
    };

    const onClick = () => {
      raycaster.setFromCamera(stateRef.current.mouse, camera);
      const intersects = raycaster.intersectObjects(targetMeshes, true);
      if (intersects.length > 0) {
        let root = intersects[0].object;
        while (root.parent && !root.userData?.target) {
          root = root.parent;
        }
        if (root.userData?.target) {
          const t = root.userData.target as DebrisTarget3D;
          onSelectTarget?.(t.id);
          sounds.playClick(1200);
        }
      }
    };

    container.addEventListener("mousemove", onPointerMove);
    container.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mouseup", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("click", onClick);

    // 9. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();
    let ringScale = 0.1;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Terrain wireframe toggle
      terrainMat.wireframe = stateRef.current.wireframe;

      // Tow-Fish gentle cruising trajectory
      const auvSpeed = 0.35;
      const auvX = Math.sin(elapsed * auvSpeed) * 8;
      const auvZ = Math.cos(elapsed * auvSpeed * 0.8) * 12;
      auvGroup.position.x = auvX;
      auvGroup.position.z = auvZ;
      auvGroup.position.y = 2 + Math.sin(elapsed * 1.2) * 0.3;
      // Heading & banking
      auvGroup.rotation.y = Math.atan2(
        Math.cos(elapsed * auvSpeed) * 8 * auvSpeed,
        -Math.sin(elapsed * auvSpeed * 0.8) * 12 * auvSpeed * 0.8
      );
      auvGroup.rotation.z = Math.sin(elapsed * 1.2) * 0.08;

      // Spin propeller
      propMesh.rotation.x += 0.4;

      // Sonar Acoustic Ripple expansion
      ringScale += 0.35;
      if (ringScale > 28) {
        ringScale = 0.5;
        pulseRing.position.x = auvX;
        pulseRing.position.z = auvZ;
      }
      pulseRing.scale.set(ringScale, ringScale, 1);
      ringMat.opacity = Math.max(0, 0.8 - ringScale / 28);

      // Rotate Debris Diamonds
      targetMeshes.forEach((mesh) => {
        const diamond = mesh.children[1];
        if (diamond) {
          diamond.rotation.y += 0.02;
          diamond.rotation.x = Math.sin(elapsed * 2) * 0.15;
        }
      });

      // Marine snow slow drift
      const pAttr = particleGeo.attributes.position;
      for (let i = 1; i < pAttr.count * 3; i += 3) {
        let py = pAttr.array[i] - 0.04;
        if (py < -25) py = 15;
        pAttr.array[i] = py;
      }
      pAttr.needsUpdate = true;

      // Raycasting hover check
      raycaster.setFromCamera(stateRef.current.mouse, camera);
      const hits = raycaster.intersectObjects(targetMeshes, true);
      if (hits.length > 0) {
        let parent = hits[0].object;
        while (parent.parent && !parent.userData?.target) {
          parent = parent.parent;
        }
        if (parent.userData?.target) {
          setHoveredTarget(parent.userData.target as DebrisTarget3D);
        }
      } else {
        setHoveredTarget(null);
      }

      // Camera View Modes
      const vm = stateRef.current.viewMode;
      if (vm === "chase") {
        const offset = new THREE.Vector3(-12, 6, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), auvGroup.rotation.y);
        camera.position.lerp(auvGroup.position.clone().add(offset), 0.05);
        camera.lookAt(auvGroup.position.clone().add(new THREE.Vector3(4, -2, 0)));
      } else if (vm === "top") {
        camera.position.lerp(new THREE.Vector3(0, 52, 0), 0.05);
        camera.lookAt(0, 0, 0);
      } else if (vm === "side") {
        camera.position.lerp(new THREE.Vector3(42, 2, 0), 0.05);
        camera.lookAt(0, -6, 0);
      } else {
        // Orbit mode
        const { theta, phi, radius } = stateRef.current.orbitAngles;
        const targetCamX = radius * Math.sin(phi) * Math.sin(theta);
        const targetCamY = radius * Math.cos(phi);
        const targetCamZ = radius * Math.sin(phi) * Math.cos(theta);
        camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.08);
        camera.lookAt(0, -6, 0);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mouseup", onPointerUp);
      container.removeEventListener("mousemove", onPointerMove);
      container.removeEventListener("mousedown", onPointerDown);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("click", onClick);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const triggerSonarPing = () => {
    sounds.playSonarPing();
    setLastPingTime(Date.now());
  };

  const toggleSound = () => {
    const next = sounds.toggle();
    setSoundEnabled(next);
  };

  return (
    <div className="sonar-3d-wrap">
      {/* 3D Canvas Container */}
      <div className="sonar-3d-viewport" ref={mountRef} />

      {/* Top HUD overlay */}
      <div className="sonar-3d-hud-top">
        <div className="hud-tag">
          <Waves size={13} className="text-teal" />
          <span>SPATIAL BATHYMETRY & TOW-FISH AUV</span>
          <span className="hud-badge-live">LIVE TELEMETRY</span>
        </div>
        <div className="hud-coords">
          <span>LAT 09°58'14.2" N</span>
          <span>·</span>
          <span>LON 76°04'51.9" E</span>
          <span>·</span>
          <span>TOW DEPTH 42.1 M</span>
        </div>
      </div>

      {/* Floating Debris Tooltip on Hover */}
      {hoveredTarget && (
        <div className="sonar-3d-target-card">
          <div className="target-card-top">
            <strong>{hoveredTarget.label}</strong>
            <span className="target-conf">{hoveredTarget.confidence}% CONF</span>
          </div>
          <div className="target-card-meta">
            <span>{hoveredTarget.category}</span>
            <span>Seabed Depth: {hoveredTarget.depthM} m</span>
          </div>
          <div className="target-card-hint">Click diamond marker to inspect</div>
        </div>
      )}

      {/* Bottom Floating Control Bar (Pill Bar matching reference) */}
      <div className="sonar-3d-controls-bar">
        {/* Perspective view pills */}
        <div className="view-pills">
          <button
            className={`pill-btn ${viewMode === "orbit" ? "active" : ""}`}
            onClick={() => {
              setViewMode("orbit");
              sounds.playClick();
            }}
          >
            <RotateCcw size={13} /> Orbit
          </button>
          <button
            className={`pill-btn ${viewMode === "chase" ? "active" : ""}`}
            onClick={() => {
              setViewMode("chase");
              sounds.playClick();
            }}
          >
            <Eye size={13} /> AUV Chase
          </button>
          <button
            className={`pill-btn ${viewMode === "top" ? "active" : ""}`}
            onClick={() => {
              setViewMode("top");
              sounds.playClick();
            }}
          >
            <Compass size={13} /> Top Swath
          </button>
          <button
            className={`pill-btn ${viewMode === "side" ? "active" : ""}`}
            onClick={() => {
              setViewMode("side");
              sounds.playClick();
            }}
          >
            <Layers size={13} /> Profile
          </button>
        </div>

        {/* Feature toggles */}
        <div className="utility-pills">
          <button
            className={`icon-pill ${wireframe ? "active" : ""}`}
            onClick={() => {
              setWireframe(!wireframe);
              sounds.playClick();
            }}
            title="Toggle Bathymetry Wireframe Grid"
          >
            <Layers size={14} />
          </button>
          <button
            className={`icon-pill ${soundEnabled ? "active" : ""}`}
            onClick={toggleSound}
            title={soundEnabled ? "Mute Acoustic Audio" : "Enable Acoustic Audio"}
          >
            <Volume2 size={14} />
          </button>
          <button
            className="pulse-ping-btn"
            onClick={triggerSonarPing}
            title="Transmit Acoustic Sonar Pulse"
          >
            <Zap size={13} /> Transmit Ping
          </button>
        </div>
      </div>
    </div>
  );
}

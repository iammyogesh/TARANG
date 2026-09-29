export type TelemetryConnectionStatus = "connecting" | "live" | "simulated" | "offline" | "error";

export interface InferenceDetection {
  id?: string;
  label: string;
  category: string;
  confidence: number;
  priority?: "High" | "Medium" | "Low";
  bbox?: { x: number; y: number; width: number; height: number };
  depth_m?: number;
  dimensions_m?: { length: number; width: number; height?: number };
  coordinates?: { lat: number; lon: number };
}

export interface InferenceResponse {
  request_id: string;
  model_version: string;
  processing_ms: number;
  image_width: number;
  image_height: number;
  detections: InferenceDetection[];
  scan?: { depth_m?: number; swath_width_m?: number; heading_deg?: number };
}

export interface TelemetryFrame {
  timestamp: string;
  mission_id: string;
  position: { lat: number; lon: number };
  depth_m: number;
  altitude_m: number;
  speed_knots: number;
  heading_deg: number;
  temperature_c: number;
  ping_rate_hz: number;
  signal_quality: number;
  bathymetry?: Array<{ distance_m: number; depth_m: number }>;
}

export interface TelemetrySubscription {
  close: () => void;
}

const env = import.meta.env as Record<string, string | undefined>;
export const tarangConfig = {
  inferenceUrl: env.VITE_TARANG_INFERENCE_URL || "/api/inference/predict",
  telemetryUrl: env.VITE_TARANG_TELEMETRY_URL || "",
  scanField: env.VITE_TARANG_SCAN_FIELD || "scan",
};

export class TarangApiError extends Error {
  readonly status?: number;
  readonly code: "CONFIG" | "NETWORK" | "HTTP" | "SCHEMA";

  constructor(message: string, code: TarangApiError["code"], status?: number) {
    super(message);
    this.name = "TarangApiError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInferenceResponse(value: unknown): value is InferenceResponse {
  if (!isRecord(value) || typeof value.request_id !== "string" || typeof value.model_version !== "string" || !isFiniteNumber(value.processing_ms) || !isFiniteNumber(value.image_width) || !isFiniteNumber(value.image_height) || !Array.isArray(value.detections)) return false;
  return value.detections.every((detection) => {
    if (!isRecord(detection) || typeof detection.label !== "string" || typeof detection.category !== "string" || !isFiniteNumber(detection.confidence)) return false;
    if (detection.bbox !== undefined && (!isRecord(detection.bbox) || !isFiniteNumber(detection.bbox.x) || !isFiniteNumber(detection.bbox.y) || !isFiniteNumber(detection.bbox.width) || !isFiniteNumber(detection.bbox.height))) return false;
    if (detection.depth_m !== undefined && !isFiniteNumber(detection.depth_m)) return false;
    if (detection.dimensions_m !== undefined && (!isRecord(detection.dimensions_m) || !isFiniteNumber(detection.dimensions_m.length) || !isFiniteNumber(detection.dimensions_m.width))) return false;
    if (detection.coordinates !== undefined && (!isRecord(detection.coordinates) || !isFiniteNumber(detection.coordinates.lat) || !isFiniteNumber(detection.coordinates.lon))) return false;
    return true;
  });
}

function parseTelemetryFrame(value: unknown): TelemetryFrame {
  if (!isRecord(value) || typeof value.timestamp !== "string" || typeof value.mission_id !== "string" || !isRecord(value.position) || !isFiniteNumber(value.position.lat) || !isFiniteNumber(value.position.lon) || !isFiniteNumber(value.depth_m) || !isFiniteNumber(value.altitude_m) || !isFiniteNumber(value.speed_knots) || !isFiniteNumber(value.heading_deg) || !isFiniteNumber(value.temperature_c) || !isFiniteNumber(value.ping_rate_hz) || !isFiniteNumber(value.signal_quality)) throw new TarangApiError("Telemetry frame does not match the TARANG contract.", "SCHEMA");
  if (value.bathymetry !== undefined && (!Array.isArray(value.bathymetry) || value.bathymetry.some((point) => !isRecord(point) || !isFiniteNumber(point.distance_m) || !isFiniteNumber(point.depth_m)))) throw new TarangApiError("Telemetry bathymetry does not match the TARANG contract.", "SCHEMA");
  return value as unknown as TelemetryFrame;
}

export async function inferSonarScan(file: File, signal?: AbortSignal): Promise<InferenceResponse> {
  const body = new FormData();
  body.append(tarangConfig.scanField, file, file.name);
  let response: Response;
  try {
    response = await fetch(tarangConfig.inferenceUrl, { method: "POST", body, headers: { Accept: "application/json" }, signal });
  } catch (error) {
    throw new TarangApiError(error instanceof Error ? error.message : "Could not reach the Python inference service.", "NETWORK");
  }
  if (!response.ok) throw new TarangApiError(`Inference service returned HTTP ${response.status}.`, "HTTP", response.status);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new TarangApiError("Inference service returned a non-JSON response. Check VITE_TARANG_INFERENCE_URL and the API route.", "SCHEMA");
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new TarangApiError("Inference service returned invalid JSON.", "SCHEMA"); }
  if (!isInferenceResponse(payload)) throw new TarangApiError("Inference response does not match the TARANG contract.", "SCHEMA");
  return payload;
}

const simulatedBathymetry = Array.from({ length: 25 }, (_, index) => ({ distance_m: index * 4, depth_m: 38 + Math.sin(index / 2.8) * 2.2 + Math.cos(index / 4.1) * 1.4 }));
const simulationSeed: TelemetryFrame = {
  timestamp: new Date().toISOString(), mission_id: "M-042", position: { lat: 9.9706, lon: 76.0809 }, depth_m: 42.1, altitude_m: 5.8, speed_knots: 2.4, heading_deg: 118, temperature_c: 26.8, ping_rate_hz: 18.4, signal_quality: 91.8, bathymetry: simulatedBathymetry,
};

function simulatedFrame(previous: TelemetryFrame, tick: number): TelemetryFrame {
  return { ...previous, timestamp: new Date().toISOString(), depth_m: 42 + Math.sin(tick / 3) * .7, altitude_m: 5.8 + Math.cos(tick / 4) * .25, speed_knots: 2.4 + Math.sin(tick / 5) * .12, heading_deg: (118 + tick * .7) % 360, temperature_c: 26.8 + Math.sin(tick / 7) * .08, ping_rate_hz: 18.4 + Math.cos(tick / 3) * .35, signal_quality: 91.8 + Math.sin(tick / 4) * 1.8, bathymetry: simulatedBathymetry.map((point, index) => ({ ...point, depth_m: point.depth_m + Math.sin((tick + index) / 8) * .18 })), };
}

function subscribeToSimulation(onFrame: (frame: TelemetryFrame) => void, onStatus: (status: TelemetryConnectionStatus) => void): TelemetrySubscription {
  let tick = 0;
  let frame = simulationSeed;
  onStatus("simulated");
  onFrame(frame);
  const timer = window.setInterval(() => { tick += 1; frame = simulatedFrame(frame, tick); onFrame(frame); }, 1200);
  return { close: () => window.clearInterval(timer) };
}

export function subscribeToTelemetry(onFrame: (frame: TelemetryFrame) => void, onStatus: (status: TelemetryConnectionStatus) => void): TelemetrySubscription {
  const endpoint = tarangConfig.telemetryUrl;
  if (!endpoint) return subscribeToSimulation(onFrame, onStatus);
  onStatus("connecting");
  if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://")) {
    const socket = new WebSocket(endpoint);
    socket.onopen = () => onStatus("live");
    socket.onmessage = (event) => { try { onFrame(parseTelemetryFrame(JSON.parse(event.data))); } catch { onStatus("error"); } };
    socket.onerror = () => onStatus("error");
    socket.onclose = () => onStatus("offline");
    return { close: () => socket.close() };
  }
  if (typeof EventSource !== "undefined" && endpoint.includes("/stream")) {
    const source = new EventSource(endpoint);
    source.onopen = () => onStatus("live");
    source.onmessage = (event) => { try { onFrame(parseTelemetryFrame(JSON.parse(event.data))); } catch { onStatus("error"); } };
    source.onerror = () => onStatus("error");
    return { close: () => source.close() };
  }
  let stopped = false;
  const poll = async () => { try { const response = await fetch(endpoint, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); onFrame(parseTelemetryFrame(await response.json())); onStatus("live"); } catch { onStatus("error"); } finally { if (!stopped) window.setTimeout(poll, 1200); } };
  void poll();
  return { close: () => { stopped = true; } };
}

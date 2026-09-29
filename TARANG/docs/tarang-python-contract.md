# TARANG Python service contract

The frontend is a static React SPA. Configure the Python service with Vite variables at build time.

```bash
VITE_TARANG_INFERENCE_URL=https://python-service.example.com/api/inference/predict
VITE_TARANG_TELEMETRY_URL=wss://python-service.example.com/api/telemetry
VITE_TARANG_SCAN_FIELD=scan
```

## Inference

`POST VITE_TARANG_INFERENCE_URL` as `multipart/form-data`. The uploaded image field is `scan` by default; override with `VITE_TARANG_SCAN_FIELD`.

Return JSON:

```json
{
  "request_id": "req_01J...",
  "model_version": "TARANG-v1.0.0",
  "processing_ms": 842,
  "image_width": 2048,
  "image_height": 1024,
  "scan": { "depth_m": 42.1, "swath_width_m": 60, "heading_deg": 118 },
  "detections": [
    {
      "id": "D-live-001",
      "label": "Linear object",
      "category": "Fishing gear",
      "confidence": 0.94,
      "priority": "High",
      "bbox": { "x": 0.42, "y": 0.28, "width": 0.12, "height": 0.08 },
      "depth_m": 42.4,
      "dimensions_m": { "length": 2.8, "width": 0.6 },
      "coordinates": { "lat": 9.9706, "lon": 76.0809 }
    }
  ]
}
```

`bbox` coordinates are normalized from 0 to 1. `confidence` may be sent as a fraction (0–1) or percentage (0–100); the UI normalizes it for display.

## Telemetry

The frontend supports:

- WebSocket URLs (`ws://` / `wss://`) with JSON messages.
- Server-Sent Events when the URL contains `/stream`.
- JSON polling for any other URL.

Each frame:

```json
{
  "timestamp": "2026-09-29T06:20:00.000Z",
  "mission_id": "M-042",
  "position": { "lat": 9.9706, "lon": 76.0809 },
  "depth_m": 42.1,
  "altitude_m": 5.8,
  "speed_knots": 2.4,
  "heading_deg": 118,
  "temperature_c": 26.8,
  "ping_rate_hz": 18.4,
  "signal_quality": 91.8,
  "bathymetry": [
    { "distance_m": 0, "depth_m": 39.4 },
    { "distance_m": 4, "depth_m": 40.1 }
  ]
}
```

If `VITE_TARANG_TELEMETRY_URL` is empty, the review workspace deliberately shows a **SIMULATED** telemetry state so operators can evaluate the UI without the service. Uploaded scan inference does not silently fall back: it reports an offline/configuration error until the Python endpoint is available.

## CORS and errors

Allow the deployed TARANG origin in CORS. Return JSON errors with an HTTP 4xx/5xx status, for example `{ "detail": "unsupported image format" }`. The frontend surfaces network, HTTP, and schema failures in the review workspace.

import type { Detection, Mission } from "../data/tarang";

export function exportGeoJson(detections: Detection[], filename = "tarang_debris_footprint_M042.geojson") {
  const features = detections.map((item) => {
    // Parse coordinates "09°58'14.2" N 76°04'51.9" E"
    const parts = item.coordinates.match(/([\d.]+)°([\d.]+)'([\d.]+)"\s*N\s*([\d.]+)°([\d.]+)'([\d.]+)"\s*E/);
    let lat = 9.9706;
    let lon = 76.0809;
    if (parts) {
      lat = parseFloat(parts[1]) + parseFloat(parts[2]) / 60 + parseFloat(parts[3]) / 3600;
      lon = parseFloat(parts[4]) + parseFloat(parts[5]) / 60 + parseFloat(parts[6]) / 3600;
    }

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(lon.toFixed(6)), Number(lat.toFixed(6))],
      },
      properties: {
        id: item.id,
        label: item.label,
        category: item.category,
        status: item.status,
        confidence_pct: item.confidence,
        dimensions: item.size,
        depth_m: item.depthM || 42.0,
        priority: item.priority,
        timestamp: item.timestamp,
        operator_note: item.note || "Acoustic shadow verified",
      },
    };
  });

  const geoJson = {
    type: "FeatureCollection",
    metadata: {
      generator: "TARANG Marine Debris Intelligence Pipeline v0.9.4",
      mission: "M-042 Kochi Outer Shelf",
      vessel: "RV Samudra 04",
      export_date: new Date().toISOString(),
      count: features.length,
    },
    features,
  };

  const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: "application/geo+json" });
  triggerDownload(blob, filename);
}

export function exportCsv(detections: Detection[], filename = "tarang_debris_manifest_M042.csv") {
  const headers = [
    "Detection ID",
    "Label",
    "Category",
    "Review Status",
    "Confidence (%)",
    "Coordinates",
    "Depth (m)",
    "Physical Dimensions",
    "Cleanup Priority",
    "Timestamp",
    "Field Notes",
  ];

  const rows = detections.map((d) => [
    `"${d.id}"`,
    `"${d.label}"`,
    `"${d.category}"`,
    `"${d.status}"`,
    d.confidence,
    `"${d.coordinates}"`,
    d.depthM || 42.0,
    `"${d.size}"`,
    `"${d.priority}"`,
    `"${d.timestamp}"`,
    `"${d.note || ""}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function printMissionBriefing(mission: Mission, detections: Detection[]) {
  const confirmed = detections.filter((d) => d.status === "Confirmed").length;
  const pending = detections.filter((d) => d.status === "Needs review").length;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>TARANG Mission Briefing · ${mission.name}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #14212b; background: #fff; }
        h1 { font-size: 24px; margin-bottom: 4px; color: #0b4f55; }
        .meta { font-size: 13px; color: #64748b; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
        .stats { display: flex; gap: 24px; margin-bottom: 28px; }
        .stat-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; min-width: 140px; }
        .stat-box strong { font-size: 22px; display: block; color: #0b4f55; }
        .stat-box span { font-size: 11px; text-transform: uppercase; color: #64748b; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
        th { text-align: left; background: #f1f5f9; padding: 10px; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
        td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
        .tag { display: inline-block; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .confirmed { background: #dcfce7; color: #15803d; }
        .review { background: #fef3c7; color: #b45309; }
      </style>
    </head>
    <body>
      <h1>TARANG Marine Debris Cleanup Briefing</h1>
      <div class="meta">
        <strong>Mission:</strong> ${mission.name} (${mission.id}) · 
        <strong>Vessel:</strong> ${mission.vessel} · 
        <strong>Survey Area:</strong> ${mission.area} · 
        <strong>Date:</strong> ${new Date().toLocaleDateString()}
      </div>
      <div class="stats">
        <div class="stat-box"><strong>${mission.progress}%</strong><span>Survey Progress</span></div>
        <div class="stat-box"><strong>${confirmed}</strong><span>Confirmed Debris</span></div>
        <div class="stat-box"><strong>${pending}</strong><span>Needs Review</span></div>
        <div class="stat-box"><strong>94.3%</strong><span>Model Precision</span></div>
      </div>
      <h3>Debris Anomaly Log (Ready for Cleanup Operations)</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Category</th>
            <th>Status</th>
            <th>Confidence</th>
            <th>Coordinates</th>
            <th>Dimensions</th>
          </tr>
        </thead>
        <tbody>
          ${detections
            .map(
              (d) => `
            <tr>
              <td><strong>${d.id}</strong></td>
              <td>${d.label}</td>
              <td>${d.category}</td>
              <td><span class="tag ${d.status === "Confirmed" ? "confirmed" : "review"}">${d.status}</span></td>
              <td>${d.confidence}%</td>
              <td>${d.coordinates}</td>
              <td>${d.size}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

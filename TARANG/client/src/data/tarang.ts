export type DetectionStatus = "Needs review" | "Confirmed" | "Rejected" | "Flagged";
export type DetectionCategory = "Fishing gear" | "Metal fragment" | "Plastic mass" | "Unknown object";

export interface Detection {
  id: string;
  label: string;
  category: DetectionCategory;
  status: DetectionStatus;
  confidence: number;
  location: string;
  coordinates: string;
  timestamp: string;
  size: string;
  priority: "High" | "Medium" | "Low";
  x: number;
  y: number;
  depthM?: number;
  note?: string;
}

export interface Mission {
  id: string;
  name: string;
  vessel: string;
  area: string;
  status: "Active" | "Completed" | "Queued";
  progress: number;
  detections: number;
  confirmed: number;
  started: string;
  lastPing: string;
}

export const currentMission: Mission = {
  id: "M-042",
  name: "Kochi Outer Shelf",
  vessel: "RV Samudra 04",
  area: "12.8 km²",
  status: "Active",
  progress: 68,
  detections: 128,
  confirmed: 84,
  started: "18 Sep 2026",
  lastPing: "08:42:18 IST",
};

export const detections: Detection[] = [
  { id: "D-0842", label: "Linear object", category: "Fishing gear", status: "Needs review", confidence: 94, location: "Transect 04 · 42 m", coordinates: "09°58'14.2\" N 76°04'51.9\" E", timestamp: "08:41:32", size: "2.8 × 0.6 m", priority: "High", x: 56, y: 34 },
  { id: "D-0841", label: "Dense return", category: "Metal fragment", status: "Needs review", confidence: 87, location: "Transect 04 · 38 m", coordinates: "09°58'02.8\" N 76°05'12.4\" E", timestamp: "08:37:19", size: "1.4 × 1.1 m", priority: "Medium", x: 68, y: 50 },
  { id: "D-0838", label: "Irregular mass", category: "Plastic mass", status: "Confirmed", confidence: 91, location: "Transect 03 · 41 m", coordinates: "09°57'44.7\" N 76°04'30.8\" E", timestamp: "08:26:44", size: "3.2 × 2.1 m", priority: "High", x: 32, y: 59 },
  { id: "D-0834", label: "Compact return", category: "Unknown object", status: "Flagged", confidence: 72, location: "Transect 03 · 39 m", coordinates: "09°57'28.1\" N 76°04'08.5\" E", timestamp: "08:12:06", size: "0.8 × 0.9 m", priority: "Low", x: 76, y: 70 },
  { id: "D-0827", label: "Net signature", category: "Fishing gear", status: "Confirmed", confidence: 96, location: "Transect 02 · 44 m", coordinates: "09°57'11.6\" N 76°03'42.3\" E", timestamp: "07:48:22", size: "4.6 × 1.8 m", priority: "High", x: 44, y: 77 },
  { id: "D-0819", label: "Low-profile return", category: "Metal fragment", status: "Rejected", confidence: 61, location: "Transect 02 · 40 m", coordinates: "09°56'54.9\" N 76°03'21.8\" E", timestamp: "07:24:10", size: "0.6 × 0.4 m", priority: "Low", x: 23, y: 44 },
];

export const missions: Mission[] = [
  currentMission,
  { id: "M-041", name: "Vypin Channel Sweep", vessel: "RV Samudra 03", area: "9.4 km²", status: "Completed", progress: 100, detections: 96, confirmed: 64, started: "11 Sep 2026", lastPing: "17 Sep 2026" },
  { id: "M-040", name: "Alleppey North Pass", vessel: "RV Samudra 02", area: "16.2 km²", status: "Completed", progress: 100, detections: 171, confirmed: 112, started: "02 Sep 2026", lastPing: "09 Sep 2026" },
  { id: "M-043", name: "Ponnani Approach", vessel: "RV Samudra 04", area: "11.6 km²", status: "Queued", progress: 0, detections: 0, confirmed: 0, started: "01 Oct 2026", lastPing: "Awaiting launch" },
];

export const activity = [
  { time: "08:42", title: "New scan segment processed", detail: "Transect 04 · 1,240 frames", tone: "cyan" },
  { time: "08:26", title: "Detection confirmed", detail: "D-0838 · Plastic mass", tone: "green" },
  { time: "08:11", title: "Review threshold updated", detail: "Lowered from 0.78 to 0.72", tone: "amber" },
  { time: "07:48", title: "High-priority debris found", detail: "D-0827 · Fishing gear", tone: "coral" },
];

export const confidenceSeries = [68, 72, 71, 78, 74, 82, 79, 87, 84, 91, 88, 94];

export const modelRuns = [
  { name: "TARANG-v0.9.4", date: "18 Sep 2026 · 08:39", accuracy: "91.8%", latency: "1.4s / frame", status: "Live" },
  { name: "TARANG-v0.9.3", date: "11 Sep 2026 · 16:10", accuracy: "89.6%", latency: "1.7s / frame", status: "Archived" },
  { name: "TARANG-v0.9.2", date: "02 Sep 2026 · 09:05", accuracy: "87.2%", latency: "2.0s / frame", status: "Archived" },
];

export function getDetection(id: string) {
  return detections.find((detection) => detection.id === id) ?? detections[0];
}

// Future API seam: replace seeded functions with fetch/query hooks when the Python inference service is connected.
export const tarangApi = {
  async listDetections(): Promise<Detection[]> { return detections; },
  async listMissions(): Promise<Mission[]> { return missions; },
  async updateDetectionStatus(id: string, status: DetectionStatus): Promise<Detection | undefined> {
    return getDetection(id) ? { ...getDetection(id), status } : undefined;
  },
};

import { create } from 'zustand';

export const useTarangStore = create((set) => ({
  // Navigation / Phase State: 'IDLE' | 'INGESTING' | 'DIVING' | 'WORKSPACE_ACTIVE'
  state: 'IDLE',
  setState: (state) => set({ state }),

  // Active Scan Data
  selectedFile: null,
  previewUrl: null,
  filename: null,
  scanResult: null,

  // Hazard Selection & Filtering
  selectedHazardIndex: null,
  minConfidence: 0.2, // 20% default threshold
  setSelectedHazardIndex: (index) => set({ selectedHazardIndex: index }),
  setMinConfidence: (val) => set({ minConfidence: val }),

  // 3D Viewport Controls
  viewMode: '3D_SEABED', // '3D_SEABED' | 'SONAR_TEXTURE'
  setViewMode: (viewMode) => set({ viewMode }),
  focusedCoordinate: null,
  setFocusedCoordinate: (coord) => set({ focusedCoordinate: coord }),

  // Actions
  setScanData: (file, previewUrl, filename, result) => {
    // Generate IDs for anomalies if missing
    const enrichedDetections = (result.detections || []).map((det, idx) => ({
      ...det,
      id: det.id || `TRG-${String(idx + 1).padStart(3, '0')}`,
    }));

    set({
      selectedFile: file,
      previewUrl,
      filename,
      scanResult: {
        ...result,
        detections: enrichedDetections,
      },
      selectedHazardIndex: enrichedDetections.length > 0 ? 0 : null,
    });
  },

  resetToSurface: () =>
    set({
      state: 'IDLE',
      selectedFile: null,
      previewUrl: null,
      filename: null,
      scanResult: null,
      selectedHazardIndex: null,
      focusedCoordinate: null,
    }),
}));

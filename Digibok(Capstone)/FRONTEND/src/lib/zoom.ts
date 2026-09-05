// Text-size / zoom control — scales the root font-size, which every Tailwind rem-based
// text/spacing utility in the app is relative to, so this is a real "make everything
// bigger" control rather than a single component's font override.
export const ZOOM_LEVELS = [90, 100, 110, 125, 140] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

const STORAGE_KEY = "digibok_zoom";
const DEFAULT_ZOOM: ZoomLevel = 100;

export function getInitialZoom(): ZoomLevel {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return (ZOOM_LEVELS as readonly number[]).includes(stored) ? (stored as ZoomLevel) : DEFAULT_ZOOM;
}

export function applyZoom(zoom: ZoomLevel) {
  document.documentElement.style.fontSize = `${zoom}%`;
  localStorage.setItem(STORAGE_KEY, String(zoom));
}

import { useSyncExternalStore } from "react";

export type MeasureMode = "camera" | "timer";

const STORAGE_KEY = "focusmakers:measure-mode";
const CHANGE_EVENT = "measure-mode-change";
let memoryFallback: MeasureMode | null = null;

/**
 * 기기에 저장한 측정 방식
 *
 * 계정과 무관하게 기기마다 하나만 기억한다.
 * 저장값이 없거나 알 수 없는 값이면 카메라로 측정하는 기본 동작으로 읽는다.
 */
export function readMeasureMode(): MeasureMode {
  if (memoryFallback !== null) return memoryFallback;
  try {
    return localStorage.getItem(STORAGE_KEY) === "timer" ? "timer" : "camera";
  } catch {
    return "camera";
  }
}

export function writeMeasureMode(mode: MeasureMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    memoryFallback = null;
  } catch {
    memoryFallback = mode;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(notify: () => void): () => void {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function useMeasureMode() {
  const mode = useSyncExternalStore(subscribe, readMeasureMode, () => "camera" as const);
  return [mode, writeMeasureMode] as const;
}

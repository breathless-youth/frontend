/**
 * API 응답 시간 표본 요약
 *
 * 서버가 서울 한 곳에 있어 국가별 체감 속도를 Amplitude 국가 속성으로 나눠 보려고 모은다.
 * 요청마다 보내면 이벤트가 너무 많아 페이지가 열린 뒤 앞쪽 요청만 모아 한 번 보낸다.
 * 웹뷰는 금방 백그라운드로 가서 30초를 못 채우는 일이 많아, 화면이 숨겨지면 모은 만큼 바로 보낸다.
 * Amplitude 모듈은 보낼 때 불러온다. 모든 API 호출이 지나는 api.ts가 분석 SDK를 끌고 오지 않게 하려는 것이다.
 */
const MAX_SAMPLES = 10;
const FLUSH_AFTER_MS = 30_000;

let samples: number[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sent = false;
// 숨겨진 동안 멈춘 시간이 응답 시간에 섞이지 않게, 요청 도중 숨김이 있었는지 이 횟수로 확인한다.
let hiddenCount = 0;

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function flush() {
  if (sent || samples.length === 0) return;
  sent = true;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const sorted = [...samples].sort((a, b) => a - b);
  const summary = {
    medianMs: Math.round(median(sorted)),
    maxMs: Math.round(sorted[sorted.length - 1]!),
    sampleCount: sorted.length,
  };
  void import("@/lib/amplitude").then(({ trackApiLatencySampled }) =>
    trackApiLatencySampled(summary),
  );
}

export function recordApiLatency(ms: number): void {
  if (sent) return;
  samples.push(ms);
  if (samples.length >= MAX_SAMPLES) {
    flush();
    return;
  }
  timer ??= setTimeout(flush, FLUSH_AFTER_MS);
}

/**
 * 요청 하나의 응답 시간 측정 시작
 *
 * 돌려받은 함수를 응답이 왔을 때 부르면 표본으로 남긴다.
 * 그 사이 화면이 숨겨졌으면 앱이 멈춰 있던 시간까지 섞이므로 남기지 않는다.
 */
export function beginApiLatency(): () => void {
  const startedAt = performance.now();
  const hiddenAtStart = hiddenCount;
  return () => {
    if (hiddenCount !== hiddenAtStart || document.visibilityState === "hidden") return;
    recordApiLatency(performance.now() - startedAt);
  };
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    hiddenCount += 1;
    flush();
  });
}

export function resetApiLatencyForTest(): void {
  if (timer !== null) clearTimeout(timer);
  samples = [];
  timer = null;
  sent = false;
}

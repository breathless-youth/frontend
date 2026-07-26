/**
 * 시간 표기 — 순수 함수. 표기 규칙의 출처는 ai-wiki `product/voice-tone.md` §2다.
 */

/**
 * 초를 `HH:MM:SS`로 표시한다. **시(hour)에도 항상 zero-pad**한다(`01:24:08`).
 * 2026-07-26 확정으로 "1시간 미만은 MM:SS" 규칙은 폐기됐다 — 항상 3구간 2자리다.
 */
export function formatElapsed(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  return [h, m, s].map((value) => String(value).padStart(2, "0")).join(":");
}

/**
 * 스크린리더용 한글 표현. `01:24:08`을 그대로 읽으면 의미가 전달되지 않아
 * 시각 표기 옆에 sr-only로 함께 제공한다(SCR-S3-1·S3-2 Accessibility Requirements).
 */
export function toKoreanDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  const parts: string[] = [];
  if (h > 0) {
    parts.push(`${h}시간`);
  }
  if (m > 0) {
    parts.push(`${m}분`);
  }
  if (s > 0 || parts.length === 0) {
    parts.push(`${s}초`);
  }
  return parts.join(" ");
}

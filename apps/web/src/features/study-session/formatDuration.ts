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
 * 한글 **시간 길이** 표기(voice-tone.md §2 "시간 길이(한글)").
 *
 * - 1시간 이상 → `N시간 M분` (M=0이면 `N시간`)
 * - 1시간 미만 → `M분`
 * - 1분 미만 → `S초`
 *
 * ⚠️ 아래 `toKoreanDuration`(스크린리더용)과 **다른 함수다.** 저쪽은 초까지 항상 읽어 주지만
 * 이쪽은 노출 문구용이라 상위 두 단위에서 끊는다. 다이얼로그·요약 카드에는 `HH:MM:SS`를
 * 쓰지 않는다(SCR-S3-7·S3-8 Content) — 진행 중 타이머 본문만 `formatElapsed`를 쓴다.
 */
export function toKoreanDurationLength(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  if (h > 0) {
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  }
  if (m > 0) {
    return `${m}분`;
  }
  return `${safeSeconds}초`;
}

/**
 * 시간 값 뒤 주제 조사 자동 처리(voice-tone.md §2) — 분·시간으로 끝나면 `은`, 초로 끝나면 `는`.
 * 예: `1시간 24분은 저장돼요` / `40초는 저장돼요`.
 */
export function topicJosaFor(durationLabel: string): "은" | "는" {
  return durationLabel.endsWith("초") ? "는" : "은";
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

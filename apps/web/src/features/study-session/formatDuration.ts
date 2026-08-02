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
 * 1분 미만 값의 표기 — **초 숫자를 노출하지 않는다.**
 *
 * 2026-07-27 확정(ai-wiki `product/voice-tone.md` §2, 8차 인터뷰): 모든 시간 텍스트는 분 단위이고
 * 초는 금지다. 구 "1분 미만은 S초 · 상세 맥락은 M분 S초" 조항은 폐기됐다.
 *
 * **저장은 여전히 초 단위다**(`sessionTimeline.computeSessionTotals`). 분 단위는 표시 계층에만
 * 적용되므로 이 표기를 바꿔도 기록의 정밀도는 그대로다.
 *
 * ⚠️ 라이브 타이머는 예외다 — `formatElapsed`(`HH:MM:SS`)와 그 스크린리더 짝
 * `toKoreanDuration`은 초를 그대로 쓴다. 이 상수를 그쪽에 끌어다 쓰지 말 것.
 */
export const SUB_MINUTE_LABEL = "1분 미만";

/**
 * "1분" 정책 경계(초) — **하나의 값이 세 곳을 동시에 지배한다.**
 *
 * 1. 표기: `toKoreanDurationLength`가 이 값 미만을 `1분 미만`으로 쓴다.
 * 2. 문구 분기: `sessionCopy.exitConfirmDescription`이 이 값 미만에서 저장 약속을 뺀다.
 * 3. 기록 포함 분기: `RoomPage`가 이 값 미만이면 S4 대신 미달 안내로 보낸다.
 *
 * 우연히 같은 숫자인 것이 아니라 같은 정책이다 — ai-wiki `product/mvp-scope.md`가
 * "사용자에게 보이는 '유효 공부'의 최소 단위 = 순공 1분"으로 하나로 묶었다. 셋이 서로 다른
 * 경계를 쓰면 `1분 미만`이라 써 놓고 저장을 약속하거나, 기록에 없는 세션의 결과 화면을 띄우는
 * 조합이 생긴다.
 *
 * ⚠️ 모바일에도 같은 경계가 있다(`apps/mobile/lib/displayedStats.ts`의
 * `MIN_DISPLAYED_FOCUS_SEC`) — 두 앱이 공유 패키지를 쓰지 않으므로 한쪽만 바꾸면 어긋난다.
 */
export const SUB_MINUTE_SEC = 60;

/**
 * 한글 **시간 길이** 표기(voice-tone.md §2 "시간 길이(한글)").
 *
 * - 1시간 이상 → `N시간 M분` (M=0이면 `N시간`)
 * - 1시간 미만 → `M분`
 * - 1분 미만 → `1분 미만` (2026-07-27 확정 — 구 `S초` 폐기)
 *
 * ⚠️ 아래 `toKoreanDuration`(스크린리더용)과 **다른 함수다.** 저쪽은 라이브 타이머 전용이라
 * 초까지 읽어 주지만 이쪽은 노출 문구용이다. 다이얼로그·요약 카드에는 `HH:MM:SS`를
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
  return SUB_MINUTE_LABEL;
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

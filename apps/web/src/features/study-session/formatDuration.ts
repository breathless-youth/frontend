import i18n from "@/lib/i18n";

/**
 * 시간 표기. 표기 규칙의 출처는 ai-wiki `product/voice-tone.md` §2다.
 * 단위 글자는 카탈로그에서 호출 시점 언어로 읽는다. 함수 이름의 `Korean`은 옛 이름이 남은 것이다.
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
 * "1분" 정책 경계(초) — **하나의 값이 세 곳을 동시에 지배한다.**
 *
 * 1. 표기: `toKoreanDurationLength`가 이 값 미만을 `1분 미만`으로 쓴다.
 * 2. 문구 분기: `exitConfirmDescription`이 이 값 미만에서 저장 약속을 뺀다.
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
 * 1분 미만은 초 숫자를 노출하지 않는다(8차 인터뷰). 저장은 여전히 초 단위이고 분 단위는 표시
 * 계층에만 적용된다. 라이브 타이머(`formatElapsed`)와 그 스크린리더 짝 `toKoreanDuration`은
 * 예외로 초를 그대로 쓴다.
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
    return m > 0
      ? i18n.t("common:duration.hoursMinutes", { hours: h, minutes: m })
      : i18n.t("common:duration.hours", { hours: h });
  }
  if (m > 0) {
    return i18n.t("common:duration.minutes", { minutes: m });
  }
  return i18n.t("study-session:duration.underMinute");
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
    parts.push(i18n.t("study-session:duration.srHours", { count: h }));
  }
  if (m > 0) {
    parts.push(i18n.t("study-session:duration.srMinutes", { count: m }));
  }
  if (s > 0 || parts.length === 0) {
    parts.push(i18n.t("study-session:duration.srSeconds", { count: s }));
  }
  return parts.join(" ");
}

/**
 * 종료 확인 본문. `지금까지 집중한 {순공시간}은 저장돼요`로 종료 손실 불안을 먼저 없앤다(voice-tone §1·§4).
 *
 * 순공 1분 미만 세션은 기록 목록·합산에서 빠지므로(mvp-scope "기록 저장·표시 기준") 저장을 약속하지
 * 않는 확정 문구로 갈린다. 서버에는 여전히 제출한다. 걸러내는 것은 표시·합산 단계다.
 *
 * 조사 `은`은 시간 길이가 `분`·`시간`으로만 끝나서 고정이다. Figma `40:98`은 `이`, voice-tone은
 * `은`이라 최신 문서를 따라 잠정 `은`이다(SCR-S3-7·S3-8 Review Checklist).
 */
export function exitConfirmDescription(focusSec: number): string {
  if (focusSec < SUB_MINUTE_SEC) {
    return i18n.t("study-session:exitDescription.subMinute");
  }
  return i18n.t("study-session:exitDescription.saved", {
    duration: toKoreanDurationLength(focusSec),
  });
}

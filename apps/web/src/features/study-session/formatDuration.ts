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
 * 기록으로 남는 최소 순공(초). 하나의 값이 세 곳을 동시에 지배한다.
 *
 * 1. 종료 확인 문구: `exitConfirmDescription`이 이 값 미만(순공 0초)에서 저장 약속을 뺀다.
 * 2. 결과 화면 분기: 싱글룸(`RoomPage`)과 소셜룸(`LiveRoomSession`, `liveRoomEndNavigation`)이
 *    이 값 미만이면 결과 화면 대신 순공 없음 안내로 보낸다.
 * 3. 최대 집중 구간: `longestFocusStretch`가 이 값 미만의 구간을 내세우지 않는다.
 *
 * 서버가 순공 1초 이상인 세션부터 기록으로 세므로 같은 경계를 쓴다. 경계가 어긋나면 기록에
 * 있는 세션의 결과 화면을 막거나, 기록에 없는 세션의 결과 화면을 띄우게 된다.
 */
export const MIN_RECORDED_FOCUS_SEC = 1;

/**
 * 한글 **시간 길이** 표기(voice-tone.md §2 "시간 길이(한글)").
 *
 * - 1시간 이상 → `N시간 M분` (M=0이면 `N시간`)
 * - 1시간 미만 → `M분`
 * - 1분 미만 → `S초`
 *
 * 순공 1초부터 기록으로 남으므로 1분 미만도 초 단위로 보여 준다. 시간 단위가 있으면 초는 버린다.
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
  return i18n.t("common:duration.seconds", { seconds: safeSeconds });
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
 * 순공 0초 세션은 기록에 남지 않으므로 저장을 약속하지 않는 문구로 갈린다. 서버에는 여전히
 * 제출한다.
 *
 * 조사는 시간 길이의 끝 글자에 맞춘다. `분`·`시간`은 받침이 있어 `은`, `초`는 받침이 없어 `는`이라
 * 1분 미만은 문구를 따로 둔다(`exitDescription.savedSeconds`).
 */
export function exitConfirmDescription(focusSec: number): string {
  if (focusSec < MIN_RECORDED_FOCUS_SEC) {
    return i18n.t("study-session:exitDescription.noFocus");
  }
  if (focusSec < 60) {
    return i18n.t("study-session:exitDescription.savedSeconds", {
      duration: toKoreanDurationLength(focusSec),
    });
  }
  return i18n.t("study-session:exitDescription.saved", {
    duration: toKoreanDurationLength(focusSec),
  });
}

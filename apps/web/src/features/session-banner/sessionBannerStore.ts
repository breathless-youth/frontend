import type { SessionBannerGroup } from "./sessionBanner";

/**
 * 사용자별 배너 실험군 저장
 *
 * 처음 정한 군을 실험 기간 내내 유지하려고 세션 문서가 바뀌어도 남는 localStorage에 둔다.
 * 지워지면 같은 분배 식으로 다시 정해 군은 같고, 대상 여부만 그날 기록으로 다시 본다.
 */
const keyFor = (userId: number) => `focusmakers.sessionBanner.v1.${userId}`;

const GROUPS: readonly string[] = [
  "exposed",
  "control",
  "not_eligible",
] satisfies SessionBannerGroup[];

/**
 * 저장된 군
 *
 * 아직 정하지 않았으면 `"unset"`이다.
 * 읽지 못했거나 값이 깨졌으면 null이고, 화면은 다시 판정하지 않고 배너를 그리지 않는다.
 */
export function loadSessionBannerGroup(userId: number): SessionBannerGroup | "unset" | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (raw === null) return "unset";
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" && GROUPS.includes(parsed)
      ? (parsed as SessionBannerGroup)
      : null;
  } catch (error) {
    console.warn("[session-banner] failed to read group, not showing the banner", error);
    return null;
  }
}

/** 쓰기에 실패해도 세션 흐름을 막지 않는다. */
export function saveSessionBannerGroup(userId: number, group: SessionBannerGroup): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(group));
  } catch (error) {
    console.warn("[session-banner] failed to save group", error);
  }
}

/**
 * S1 홈 화면의 시간 표시 포맷 유틸 — 순수 함수라 별도 테스트 대상으로 분리한다.
 * 시간 길이 표기(`N시간 M분`)는 전 화면 공통인 `recordsFormat.formatDuration`을 쓴다.
 * (`apps/mobile/lib/homeFormat.ts`에서 이식 — BY-329 홈 웹 이관. RN 홈 삭제 전까지 두 벌이 공존한다.)
 */
import i18n from "@/lib/i18n";
import { formatDateLabel } from "@/lib/intl";
import type { AppLocale } from "@/lib/locale";

/**
 * 예: "7월 26일 일요일". `now`를 주입 가능하게 해 테스트 가능하게 한다(기본값은 현재 시각).
 * 날짜는 기기 로컬 기준이라 로컬 연·월·일을 UTC 자정으로 옮겨 UTC로 읽는다.
 */
export function todayLabel(now: Date = new Date()): string {
  const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return formatDateLabel(i18n.language as AppLocale, day, "UTC");
}

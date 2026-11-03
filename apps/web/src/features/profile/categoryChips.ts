import type { StudyCategory } from "@focusmakers/types";

import { hasGroupRooms } from "@/lib/groupRoomCapability";
import { STUDY_CATEGORY_OPTIONS } from "@/lib/studyCategory";

/**
 * 목표 카테고리 칩
 *
 * 칩은 하나만 고른다.
 */
type CategoryChip = { value: StudyCategory; label: string };

const LEGACY_ORDER: readonly StudyCategory[] = [
  "PROFESSIONAL",
  "CSAT",
  "JOB",
  "CERTIFICATE",
  "CIVIL_SERVICE",
  "LANGUAGE",
  "ETC",
];

const LEGACY_CHIPS: readonly CategoryChip[] = STUDY_CATEGORY_OPTIONS.filter((option) =>
  LEGACY_ORDER.includes(option.value),
).sort((a, b) => LEGACY_ORDER.indexOf(a.value) - LEGACY_ORDER.indexOf(b.value));

/**
 * 지금 보일 목표 카테고리 칩
 *
 * 그룹 흐름이 켜진 앱은 그룹과 같은 9개를 서버가 정한 순서로 보인다.
 * 그 밖에서는 예전 7개를 예전 순서로 보인다.
 * 운영 서버가 새 값 두 개를 받기 전이나 칩 순서를 정하기 전에 웹을 배포해도 지금 사용자의 프로필 화면이 바뀌지 않게 하려는 것이다.
 */
export function categoryChips(): readonly CategoryChip[] {
  return hasGroupRooms() ? STUDY_CATEGORY_OPTIONS : LEGACY_CHIPS;
}

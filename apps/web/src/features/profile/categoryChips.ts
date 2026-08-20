import type { ProfileCategory } from "@focusmakers/types";

/**
 * 목표 카테고리 칩
 * ⚠️ 서버 enum 값은 명세에 `JOB`(취업)만 예시라 나머지는 잠정 매핑이다 —
 * 백엔드 확정 후 `@focusmakers/types`의 `ProfileCategory`와 함께 대조한다.
 */
export const CATEGORY_CHIPS: ReadonlyArray<{ value: ProfileCategory; label: string }> = [
  { value: "PROFESSIONAL", label: "전문직" },
  { value: "CSAT", label: "수능" },
  { value: "JOB", label: "취업" },
  { value: "CERTIFICATE", label: "자격증" },
  { value: "CIVIL_SERVICE", label: "공무원" },
  { value: "LANGUAGE", label: "어학" },
  { value: "ETC", label: "기타" },
];

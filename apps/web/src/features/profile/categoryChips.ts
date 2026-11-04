/**
 * 목표 카테고리 칩 7종 — 라벨(profile 카탈로그 `categories.*`)은 Figma V1.3 프로필 화면(2478:5472) 확정, 단일 선택.
 * ⚠️ 서버 enum 값은 명세에 `JOB`(취업)만 예시라 나머지는 잠정 매핑이다. 공유 계약
 * (`@focusmakers/types`)은 그래서 string으로 두고, 잠정 union은 이 파일이 소유한다 —
 * 백엔드 Swagger 확정 후 값을 대조하고 types로 승격한다.
 */
export type ProfileCategoryValue =
  "PROFESSIONAL" | "CSAT" | "JOB" | "CERTIFICATE" | "CIVIL_SERVICE" | "LANGUAGE" | "ETC";

export const CATEGORY_CHIPS: ReadonlyArray<{ value: ProfileCategoryValue }> = [
  { value: "PROFESSIONAL" },
  { value: "CSAT" },
  { value: "JOB" },
  { value: "CERTIFICATE" },
  { value: "CIVIL_SERVICE" },
  { value: "LANGUAGE" },
  { value: "ETC" },
];

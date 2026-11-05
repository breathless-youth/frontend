import type { StudyCategory } from "@focusmakers/types";

import i18n from "@/lib/i18n";

/**
 * 시험·목표 9개
 *
 * 프로필과 그룹이 같은 목록을 쓰고 순서는 서버가 정한 순서다.
 * 화면 글자는 profile 카탈로그 `categories.*`에 서버 값을 키로 둔다.
 */
export const STUDY_CATEGORIES: readonly StudyCategory[] = [
  "CSAT",
  "SCHOOL_EXAM",
  "UNIVERSITY_EXAM",
  "CIVIL_SERVICE",
  "CERTIFICATE",
  "LANGUAGE",
  "JOB",
  "PROFESSIONAL",
  "ETC",
];

const STUDY_CATEGORY_SET: ReadonlySet<string> = new Set(STUDY_CATEGORIES);

/**
 * 시험·목표 9개와 화면 글자
 *
 * 글자를 모듈 상수에 담으면 불러온 시점의 언어에서 바뀌지 않아 부를 때마다 카탈로그에서 읽는다.
 */
export function studyCategoryOptions(): { value: StudyCategory; label: string }[] {
  return STUDY_CATEGORIES.map((value) => ({ value, label: i18n.t(`profile:categories.${value}`) }));
}

/**
 * 서버 값인지
 *
 * 프로필 응답의 카테고리는 아무 문자열이나 올 수 있어 9개 중 하나일 때만 시험·목표로 쓴다.
 */
export function isStudyCategory(value: unknown): value is StudyCategory {
  return typeof value === "string" && STUDY_CATEGORY_SET.has(value);
}

/**
 * 시험·목표의 화면 글자
 *
 * 모르는 값이면 null이라 호출부가 빈 글을 쓸지 칩을 고르지 않을지 정한다.
 */
export function studyCategoryLabel(value: string | null): string | null {
  return isStudyCategory(value) ? i18n.t(`profile:categories.${value}`) : null;
}

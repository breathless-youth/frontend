import type { StudyCategory } from "@focusmakers/types";

/**
 * 시험·목표 9개와 화면 글자
 *
 * 프로필과 그룹이 같은 목록을 쓰고 순서는 서버가 정한 순서다.
 */
export const STUDY_CATEGORY_OPTIONS: ReadonlyArray<{ value: StudyCategory; label: string }> = [
  { value: "CSAT", label: "수능" },
  { value: "SCHOOL_EXAM", label: "내신" },
  { value: "UNIVERSITY_EXAM", label: "대학 시험" },
  { value: "CIVIL_SERVICE", label: "공무원" },
  { value: "CERTIFICATE", label: "자격증" },
  { value: "LANGUAGE", label: "어학" },
  { value: "JOB", label: "취업" },
  { value: "PROFESSIONAL", label: "전문직" },
  { value: "ETC", label: "기타" },
];

const LABEL_BY_VALUE: ReadonlyMap<string, string> = new Map(
  STUDY_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
);

/**
 * 서버 값인지
 *
 * 프로필 응답의 카테고리는 아무 문자열이나 올 수 있어 9개 중 하나일 때만 시험·목표로 쓴다.
 */
export function isStudyCategory(value: unknown): value is StudyCategory {
  return typeof value === "string" && LABEL_BY_VALUE.has(value);
}

/**
 * 시험·목표의 화면 글자
 *
 * 모르는 값이면 null이라 호출부가 빈 글을 쓸지 칩을 고르지 않을지 정한다.
 */
export function studyCategoryLabel(value: string | null): string | null {
  return value === null ? null : (LABEL_BY_VALUE.get(value) ?? null);
}

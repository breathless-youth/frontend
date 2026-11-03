import type { StudyCategory } from "@focusmakers/types";

import { STUDY_CATEGORY_OPTIONS } from "@/lib/studyCategory";

/**
 * 목표 카테고리 칩
 *
 * 서버가 9개 값과 순서를 확정해서 그룹의 시험·목표와 같은 목록을 쓴다.
 * 칩은 하나만 고른다.
 */
export type ProfileCategoryValue = StudyCategory;

export const CATEGORY_CHIPS = STUDY_CATEGORY_OPTIONS;

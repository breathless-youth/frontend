import type { StudyCategory } from "@focusmakers/types";

import { isStudyCategory } from "@/lib/studyCategory";

import type { SocialTab } from "./types";

/**
 * 그룹 탭이 주소에 남기는 조건
 *
 * 공개 그룹 보기에서 뒤로 오거나 푸시 링크로 열 때 보던 탭과 조건이 그대로 열리도록 주소 쿼리에 둔다.
 */
export interface GroupTabSearch {
  tab: SocialTab;
  query: string;
  category: StudyCategory | null;
}

const TAB_PARAM = "tab";
const QUERY_PARAM = "q";
const CATEGORY_PARAM = "category";
const CODE_PARAM = "code";

/** 주소의 조건 읽기이고, 모르는 탭과 시험·목표는 기본값으로 본다. */
export function readGroupTabSearch(search: string): GroupTabSearch {
  const params = new URLSearchParams(search);
  const category = params.get(CATEGORY_PARAM);
  return {
    tab: params.get(TAB_PARAM) === "public" ? "public" : "mine",
    query: params.get(QUERY_PARAM) ?? "",
    category: isStudyCategory(category) ? category : null,
  };
}

/**
 * 주소에 조건 쓰기
 *
 * 앱 셸이 붙인 다른 쿼리는 남기고, 기본값인 조건은 주소에서 빼서 처음 연 주소와 같게 둔다.
 */
export function writeGroupTabSearch(search: string, next: Partial<GroupTabSearch>): string {
  const params = new URLSearchParams(search);
  const merged = { ...readGroupTabSearch(search), ...next };
  setOrDelete(params, TAB_PARAM, merged.tab === "mine" ? null : merged.tab);
  setOrDelete(params, QUERY_PARAM, merged.query === "" ? null : merged.query);
  setOrDelete(params, CATEGORY_PARAM, merged.category);
  return toSearch(params);
}

/**
 * 그룹 탭 밖으로 갈 때의 쿼리
 *
 * 탭 조건은 그룹 탭에서만 뜻이 있고, 초대코드는 남아 있으면 다음에 연 참여 화면에 다시 채워져서 둘만 뺀다.
 */
export function baseSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of [TAB_PARAM, QUERY_PARAM, CATEGORY_PARAM, CODE_PARAM]) {
    params.delete(name);
  }
  return toSearch(params);
}

function setOrDelete(params: URLSearchParams, name: string, value: string | null): void {
  if (value === null) {
    params.delete(name);
  } else {
    params.set(name, value);
  }
}

function toSearch(params: URLSearchParams): string {
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

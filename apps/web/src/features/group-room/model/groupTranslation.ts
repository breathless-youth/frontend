import { useSyncExternalStore } from "react";

/**
 * 그룹 이름·소개 원문 보기 설정
 *
 * 목록과 상세의 버튼이 같은 값 하나를 바꿔 어느 화면에서 눌러도 그룹 글이 함께 바뀐다.
 * 원문으로 바꾼 걸 잊고 계속 원문만 보지 않게 저장하지 않고 문서를 새로 열면 번역 보기로 돌아간다.
 */
let showOriginal = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return showOriginal;
}

export function useShowOriginal(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function toggleShowOriginal(): void {
  showOriginal = !showOriginal;
  for (const listener of listeners) listener();
}

/** 모듈 안 상태라 테스트끼리 섞이지 않게 테스트 준비 단계에서만 부른다. */
export function resetShowOriginalForTest(): void {
  showOriginal = false;
}

/**
 * 번역을 화면에 쓸 수 있는지
 *
 * 글자를 고르는 곳과 번역됨 안내를 띄우는 곳이 같은 기준을 써야 원문을 보이면서 번역됨이라고 적지 않는다.
 */
export function hasGroupTranslation(translated: string | null | undefined): translated is string {
  return translated != null && translated.trim() !== "";
}

/** 번역이 없거나 공백뿐인 필드는 원문을 보여 준다. */
export function pickGroupText(
  original: string,
  translated: string | null,
  wantsOriginal: boolean,
): string {
  return wantsOriginal || !hasGroupTranslation(translated) ? original : translated;
}

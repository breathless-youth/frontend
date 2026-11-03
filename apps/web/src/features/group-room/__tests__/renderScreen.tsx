import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

/**
 * 그룹 화면 테스트의 그리기
 *
 * 화면 머리의 뒤로 가기 줄이 라우터의 이동과 주소를 읽어서 화면은 라우터 안에서 그린다.
 * `wrapper`로 감싸 두어 `rerender`도 같은 라우터 안에서 다시 그린다.
 */
export function renderScreen(ui: ReactElement) {
  return render(ui, { wrapper: MemoryRouter });
}

/**
 * 화면 낭독기에서 숨긴 글자를 빼고 찾는 조건
 *
 * 아바타는 숨김 표시를 바깥 상자에만 달고 글자는 그 안에 두어서 숨긴 상자 안의 글자까지 함께 뺀다.
 * 닉네임 대신 `나`처럼 아바타 글자와 이름이 같을 때 이름 쪽 한 곳만 찾는다.
 */
export const IGNORE_ARIA_HIDDEN = "[aria-hidden='true'], [aria-hidden='true'] *";

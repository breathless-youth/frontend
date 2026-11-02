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

import { attachTabBackHandler, handleTabBack } from "../tabBack";

/**
 * 보이는 탭 웹뷰에 시스템 뒤로 가기를 넘기는 통로
 *
 * 발신(`app/(tabs)/_layout.tsx`)과 수신(`RemoteWebViewHost`)이 React 트리에서 조상과 자손이 아니라 모듈 스코프 통로를 쓴다.
 */

it("붙은 처리기가 없으면 웹뷰가 처리하지 않은 것으로 본다", () => {
  expect(handleTabBack()).toBe(false);
});

it("마지막에 붙은 처리기만 부르고, 떼어 내면 앞의 처리기가 다시 받는다", () => {
  const first = jest.fn(() => false);
  const second = jest.fn(() => true);
  const detachFirst = attachTabBackHandler(first);
  const detachSecond = attachTabBackHandler(second);

  expect(handleTabBack()).toBe(true);
  expect(first).not.toHaveBeenCalled();

  detachSecond();
  expect(handleTabBack()).toBe(false);
  expect(first).toHaveBeenCalledTimes(1);

  detachFirst();
  expect(handleTabBack()).toBe(false);
  expect(first).toHaveBeenCalledTimes(1);
});

import { fireEvent, screen, within } from "@testing-library/react";

/** 싱글룸 입장 카메라 확인 창의 접근 이름 */
export const CAMERA_PROMPT_NAME = "카메라 위치를 확인해 주세요";

/**
 * 싱글룸 입장 카메라 확인 창에 답한다
 *
 * 세션 화면을 검증하는 테스트가 창에 막히지 않게 렌더 직후나 도움말을 닫은 직후 부른다.
 * 창이 없으면(도움말이 아직 떠 있음, 이미 답함) 아무것도 하지 않는다.
 * 가짜 타이머 구간에서도 쓰도록 userEvent 대신 fireEvent로 누른다.
 */
export function answerCameraPrompt(choice: "camera" | "simple" = "camera") {
  const prompt = screen.queryByRole("alertdialog", { name: CAMERA_PROMPT_NAME });
  if (prompt === null) {
    return;
  }
  fireEvent.click(
    within(prompt).getByRole("button", {
      name: choice === "camera" ? "카메라 켜기" : "심플 모드로 시작",
    }),
  );
}

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { GroupScreenFrame } from "../GroupScreenFrame";

describe("GroupScreenFrame", () => {
  it("뒤로 가기 줄 아래에 받은 내용을 두고 뒤로 가기를 넘긴다", async () => {
    const onBack = vi.fn();
    renderScreen(
      <GroupScreenFrame title="그룹 설정" onBack={onBack}>
        <p>그룹을 불러오지 못했어요</p>
      </GroupScreenFrame>,
    );
    expect(screen.getByRole("main")).toContainElement(screen.getByText("그룹을 불러오지 못했어요"));
    expect(screen.getByRole("heading", { level: 1, name: "그룹 설정" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

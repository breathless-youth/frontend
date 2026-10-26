import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionSideActions } from "../components/SessionSideActions";

describe("SessionSideActions", () => {
  it("배경음, 과목 뒤에 타이머가 놓이고 카메라 전환은 없다", () => {
    render(
      <SessionSideActions
        ambient={<button type="button" aria-label="배경음" />}
        subject={<button type="button" aria-label="과목" />}
        modes={<button type="button" aria-label="타이머" />}
      />,
    );

    const names = within(screen.getByRole("group", { name: "부가 기능" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["배경음", "과목", "타이머"]);
  });
});

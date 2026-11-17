import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionSideActions } from "../components/SessionSideActions";

describe("SessionSideActions", () => {
  it("공간, 배경음, 타이머 순서이고 과목과 카메라 전환은 없다", () => {
    render(
      <SessionSideActions
        space={<button type="button" aria-label="공간" />}
        ambient={<button type="button" aria-label="배경음" />}
        modes={<button type="button" aria-label="타이머" />}
      />,
    );

    const names = within(screen.getByRole("group", { name: "부가 기능" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["공간", "배경음", "타이머"]);
  });
});

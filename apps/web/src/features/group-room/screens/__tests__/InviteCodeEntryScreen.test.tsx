import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { joinBlockCopy } from "../../model/limits";
import { InviteCodeEntryScreen } from "../InviteCodeEntryScreen";

// 지금 숫자 4자리 초대코드 참여 화면과 같은 문구를 쓴다.
const TITLE = "초대코드로 참여";
const HEADLINE = "초대코드를 입력해 주세요";
const SUBMIT_LABEL = "참여하기";

function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const [code, setCode] = useState("");
  return (
    <InviteCodeEntryScreen
      value={code}
      onChange={setCode}
      error={null}
      pending={false}
      onSubmit={onSubmit}
      onBack={vi.fn()}
    />
  );
}

describe("InviteCodeEntryScreen", () => {
  it("머리 줄과 제목을 두고 6칸 입력칸이 제목으로 읽힌다", () => {
    renderScreen(<Harness />);
    expect(screen.getByRole("heading", { level: 1, name: TITLE })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: HEADLINE })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: HEADLINE })).toHaveAttribute("maxlength", "6");
  });

  it("영문은 대문자로 맞추고 6자리가 차야 참여할 수 있다", async () => {
    renderScreen(<Harness />);
    const input = screen.getByRole("textbox");
    await userEvent.setup().type(input, "ab12c");
    expect(input).toHaveValue("AB12C");
    expect(screen.getByRole("button", { name: SUBMIT_LABEL })).toBeDisabled();
    await userEvent.setup().type(input, "d");
    expect(screen.getByRole("button", { name: SUBMIT_LABEL })).toBeEnabled();
  });

  it("영문을 치는 자판으로 열리고 대문자로 받는다", () => {
    renderScreen(<Harness />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("inputmode", "text");
    expect(input).toHaveAttribute("autocapitalize", "characters");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
  });

  it("붙여 넣은 글은 공백과 구분 기호를 빼고 대문자로 맞춘다", async () => {
    const user = userEvent.setup();
    renderScreen(<Harness />);
    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.paste("  초대코드: ab-12 cd ");
    expect(input).toHaveValue("AB12CD");
  });

  it("6자리가 차면 키보드를 내린다", () => {
    renderScreen(<Harness />);
    const input = screen.getByRole("textbox");
    input.focus();
    fireEvent.change(input, { target: { value: "AB12C" } });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "AB12CD" } });
    expect(input).not.toHaveFocus();
  });

  it("오류가 있으면 칸 아래 한 문장으로 읽는다", () => {
    renderScreen(
      <InviteCodeEntryScreen
        value="AB12CD"
        onChange={vi.fn()}
        error={joinBlockCopy("invalid_code")}
        pending={false}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("초대코드를 다시 확인해 주세요");
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("초대코드를 다시 확인해 주세요");
  });

  it("오류가 없으면 칸 아래에 다른 줄을 두지 않는다", () => {
    renderScreen(<Harness />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
  });

  it("참여하는 중에는 누를 수 없다", () => {
    renderScreen(
      <InviteCodeEntryScreen
        value="AB12CD"
        onChange={vi.fn()}
        error={null}
        pending
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: SUBMIT_LABEL })).toBeDisabled();
  });

  it("6자리를 채워 참여하기를 누르면 넘긴다", async () => {
    const onSubmit = vi.fn();
    renderScreen(
      <InviteCodeEntryScreen
        value="AB12CD"
        onChange={vi.fn()}
        error={null}
        pending={false}
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: SUBMIT_LABEL }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

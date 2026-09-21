import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InviteCodeInput } from "../InviteCodeInput";

function typeCode(value: string) {
  const input = screen.getByLabelText("초대코드 4자리");
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("InviteCodeInput", () => {
  it("입력한 숫자가 4칸에 나눠 보인다", () => {
    render(<InviteCodeInput value="37" onChange={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("숫자 키패드 속성을 가진 입력이다", () => {
    render(<InviteCodeInput value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("초대코드 4자리");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("숫자 외 문자는 걸러서 onChange로 알린다", () => {
    const onChange = vi.fn();
    render(<InviteCodeInput value="" onChange={onChange} />);
    typeCode("12a4");
    expect(onChange).toHaveBeenLastCalledWith("124");
  });

  it("붙여넣기 문자열에서 숫자만 추출한다 — input-otp의 maxLength가 sanitize 전에 원문을 자르지 않는다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<InviteCodeInput value="" onChange={onChange} />);
    const input = screen.getByLabelText("초대코드 4자리");
    await user.click(input);
    await user.paste("코드: 3712");
    expect(onChange).toHaveBeenLastCalledWith("3712");
  });

  it("앞자리 0을 보존한다", () => {
    const onChange = vi.fn();
    render(<InviteCodeInput value="" onChange={onChange} />);
    typeCode("0712");
    expect(onChange).toHaveBeenLastCalledWith("0712");
  });

  it("4자리 완성 시 input이 blur된다 — 키보드를 내린다", () => {
    render(<InviteCodeInput value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("초대코드 4자리");
    input.focus();
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "3712" } });
    expect(input).not.toHaveFocus();
  });

  it("3자리까지는 blur되지 않는다", () => {
    render(<InviteCodeInput value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("초대코드 4자리");
    input.focus();
    fireEvent.change(input, { target: { value: "371" } });
    expect(input).toHaveFocus();
  });

  it("errorId를 주면 input에 aria-invalid와 aria-describedby가 붙는다", () => {
    render(<InviteCodeInput value="" onChange={vi.fn()} errorId="err" />);
    const input = screen.getByLabelText("초대코드 4자리");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "err");
  });
});

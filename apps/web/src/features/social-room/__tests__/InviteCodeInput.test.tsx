import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InviteCodeInput } from "../InviteCodeInput";

function typeCode(value: string) {
  const input = screen.getByLabelText("초대코드 4자리");
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("InviteCodeInput", () => {
  it("입력한 숫자가 4칸에 나눠 표시된다", () => {
    const onChange = vi.fn();
    render(<InviteCodeInput value="37" onChange={onChange} />);

    const cells = screen.getAllByTestId("invite-code-cell");
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent("3");
    expect(cells[1]).toHaveTextContent("7");
    expect(cells[2]).toHaveTextContent("");
    expect(cells[3]).toHaveTextContent("");
  });

  it("숫자 키패드 속성을 가진 단일 입력이다", () => {
    render(<InviteCodeInput value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("초대코드 4자리");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("caret을 투명 처리한다 — 안드로이드는 투명 input의 caret을 그대로 그린다 (BY-444)", () => {
    render(<InviteCodeInput value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("초대코드 4자리");
    expect(input).toHaveClass("caret-transparent");
  });

  it("숫자 외 문자는 걸러서 onChange로 알린다", () => {
    const onChange = vi.fn();
    render(<InviteCodeInput value="" onChange={onChange} />);

    typeCode("12a4");
    expect(onChange).toHaveBeenCalledWith("124");
  });

  it("붙여넣은 문구에서 코드만 추출한다", () => {
    const onChange = vi.fn();
    render(<InviteCodeInput value="" onChange={onChange} />);

    typeCode("코드: 3712");
    expect(onChange).toHaveBeenCalledWith("3712");
  });

  it("앞자리 0을 보존한다", () => {
    const onChange = vi.fn();
    render(<InviteCodeInput value="" onChange={onChange} />);

    typeCode("0712");
    expect(onChange).toHaveBeenCalledWith("0712");
  });

  it("4자리 입력 완료 시 input이 blur된다 — 키보드를 내린다", () => {
    render(<InviteCodeInput value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("초대코드 4자리");
    input.focus();
    expect(input).toHaveFocus();

    // 붙여넣기·자동완성으로 한 번에 4자리가 들어오는 경로와 같은 change 이벤트다.
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
});

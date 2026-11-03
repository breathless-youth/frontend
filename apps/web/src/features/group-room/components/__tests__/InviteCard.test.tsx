import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InviteCard } from "../InviteCard";

describe("InviteCard", () => {
  it("초대코드를 크게 보이고 링크 보내기와 코드 새로 만들기를 넘긴다", async () => {
    const user = userEvent.setup();
    const onShareLink = vi.fn();
    const onRegenerate = vi.fn();
    render(
      <InviteCard
        code="K7Q2MX"
        canRegenerate
        onShareLink={onShareLink}
        onRegenerate={onRegenerate}
      />,
    );
    expect(screen.getByRole("region", { name: "초대하기" })).toBeInTheDocument();
    expect(screen.getByText("K7Q2MX")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "링크 보내기" }));
    expect(onShareLink).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "코드 새로 만들기" }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it("초대코드는 무엇인지 함께 읽힌다", () => {
    render(<InviteCard code="K7Q2MX" canRegenerate onShareLink={vi.fn()} onRegenerate={vi.fn()} />);
    expect(screen.getByText("K7Q2MX")).toHaveTextContent("초대코드 K7Q2MX");
  });

  it("코드를 새로 만들 수 없으면 그 버튼이 없다", () => {
    render(
      <InviteCard
        code="K7Q2MX"
        canRegenerate={false}
        onShareLink={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "링크 보내기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "코드 새로 만들기" })).toBeNull();
  });
});

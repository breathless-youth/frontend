import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AddSubjectSheet } from "../AddSubjectSheet";

function renderSheet(onSubmit = vi.fn(() => Promise.resolve())) {
  const onOpenChange = vi.fn();
  render(<AddSubjectSheet open onOpenChange={onOpenChange} onSubmit={onSubmit} />);
  return { onSubmit, onOpenChange };
}

beforeAll(async () => {
  await import("@/components/ui/drawer");
});

describe("AddSubjectSheet", () => {
  it("이름을 쓰고 추가를 누르면 그 이름으로 만든다", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.change(await screen.findByRole("textbox", { name: "과목 이름" }), {
      target: { value: "  물리 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("물리", false));
  });

  it("추천 칩을 누르면 이름이 채워지고 추천으로 만든 것으로 알린다", async () => {
    const { onSubmit } = renderSheet();

    fireEvent.click(await screen.findByRole("button", { name: "수학" }));
    expect(screen.getByRole("textbox", { name: "과목 이름" })).toHaveValue("수학");
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("수학", true));
  });

  it("닫았다 다시 열면 입력이 비어 있다", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <AddSubjectSheet open onOpenChange={vi.fn()} onSubmit={onSubmit} />,
    );
    fireEvent.change(await screen.findByRole("textbox", { name: "과목 이름" }), {
      target: { value: "물리" },
    });

    rerender(<AddSubjectSheet open={false} onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    rerender(<AddSubjectSheet open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "과목 이름" })).toHaveValue(""));
  });

  it("호출부가 실패를 던져도 처리되지 않은 거부를 남기지 않고 다시 누를 수 있다", async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error("network")));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      renderSheet(onSubmit);
      fireEvent.change(await screen.findByRole("textbox", { name: "과목 이름" }), {
        target: { value: "물리" },
      });
      fireEvent.click(screen.getByRole("button", { name: "추가" }));

      await waitFor(() => expect(screen.getByRole("button", { name: "추가" })).toBeEnabled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("빈 이름이면 추가할 수 없다", async () => {
    renderSheet();

    fireEvent.change(await screen.findByRole("textbox", { name: "과목 이름" }), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  });

  it("12자를 넘기면 추가할 수 없고 한도를 알린다", async () => {
    renderSheet();

    fireEvent.change(await screen.findByRole("textbox", { name: "과목 이름" }), {
      target: { value: "가".repeat(13) },
    });

    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("12자까지 쓸 수 있어요");
  });
});

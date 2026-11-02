import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PendingApplication } from "../../types";
import { LazyPendingApplicationsSheet } from "../lazyPendingApplicationsSheet";
import { PendingApplicationsSheet } from "../PendingApplicationsSheet";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const application: PendingApplication = {
  applicationId: 31,
  roomId: 7,
  roomName: "새벽 5시 기상 공시반",
  categoryLabel: "공무원",
  expiresAt: "2026-11-05T09:00:00+09:00",
};

describe("PendingApplicationsSheet", () => {
  it("제목, 설명, 남은 시간, 신청 취소를 보인다", () => {
    render(
      <PendingApplicationsSheet
        open
        onOpenChange={vi.fn()}
        applications={[application]}
        now={NOW}
        cancelingId={null}
        onCancel={vi.fn()}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: "신청 중인 공개 그룹" })).toHaveAccessibleDescription(
      "그룹장이 3일 안에 답하지 않으면 신청이 취소돼요",
    );
    expect(screen.getByText("공무원")).toBeInTheDocument();
    expect(screen.getByText("2일 23시간 남음")).toBeInTheDocument();
  });

  it("신청 취소를 누르면 그 신청을 넘기고, 취소하는 동안에는 다시 누를 수 없다", async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <PendingApplicationsSheet
        open
        onOpenChange={vi.fn()}
        applications={[application]}
        now={NOW}
        cancelingId={null}
        onCancel={onCancel}
        onOpenRoom={vi.fn()}
      />,
    );
    const cancel = screen.getByRole("button", { name: "신청 취소" });
    expect(cancel).toHaveAccessibleDescription("새벽 5시 기상 공시반");
    await userEvent.setup().click(cancel);
    expect(onCancel).toHaveBeenCalledWith(31);
    rerender(
      <PendingApplicationsSheet
        open
        onOpenChange={vi.fn()}
        applications={[application]}
        now={NOW}
        cancelingId={31}
        onCancel={onCancel}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "신청 취소" })).toBeDisabled();
  });

  it("줄을 누르면 그 그룹의 공개 그룹 보기를 연다", async () => {
    const onOpenRoom = vi.fn();
    render(
      <PendingApplicationsSheet
        open
        onOpenChange={vi.fn()}
        applications={[application]}
        now={NOW}
        cancelingId={null}
        onCancel={vi.fn()}
        onOpenRoom={onOpenRoom}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /새벽 5시 기상 공시반/ }));
    expect(onOpenRoom).toHaveBeenCalledWith(7);
  });

  it("나눠 받는 시트도 열면 같은 시트를 그린다", async () => {
    render(
      <LazyPendingApplicationsSheet
        open
        onOpenChange={vi.fn()}
        applications={[application]}
        now={NOW}
        cancelingId={null}
        onCancel={vi.fn()}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(await screen.findByRole("dialog", { name: "신청 중인 공개 그룹" })).toBeInTheDocument();
  });

  it("불러오는 중에는 줄 대신 자리표시를 두고, 목록이 비어 있어도 닫지 않는다", () => {
    const onOpenChange = vi.fn();
    render(
      <PendingApplicationsSheet
        open
        loading
        onOpenChange={onOpenChange}
        applications={[]}
        now={NOW}
        cancelingId={null}
        onCancel={vi.fn()}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "신청 취소" })).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("마지막 신청을 취소해 목록이 비면 스스로 닫는다", () => {
    const onOpenChange = vi.fn();
    const props = {
      onOpenChange,
      now: NOW,
      cancelingId: null,
      onCancel: vi.fn(),
      onOpenRoom: vi.fn(),
    };
    const { rerender } = render(
      <PendingApplicationsSheet open applications={[application]} {...props} />,
    );
    expect(onOpenChange).not.toHaveBeenCalled();

    rerender(<PendingApplicationsSheet open applications={[]} {...props} />);

    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("닫혀 있을 때는 목록이 비어도 닫으라고 하지 않는다", () => {
    const onOpenChange = vi.fn();
    render(
      <PendingApplicationsSheet
        open={false}
        onOpenChange={onOpenChange}
        applications={[]}
        now={NOW}
        cancelingId={null}
        onCancel={vi.fn()}
        onOpenRoom={vi.fn()}
      />,
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

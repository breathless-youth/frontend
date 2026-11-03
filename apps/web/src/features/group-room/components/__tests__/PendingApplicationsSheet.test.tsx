import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

/** 띠로 시트를 열고, 마지막 신청을 취소하면 띠가 사라지는 그룹 탭의 흐름 */
function EmptiedHarness() {
  const [open, setOpen] = useState(false);
  const [applications, setApplications] = useState([application]);
  return (
    <>
      <button type="button" role="tab" aria-selected="true">
        내 그룹
      </button>
      {applications.length > 0 && (
        <button type="button" onClick={() => setOpen(true)}>
          신청 중인 공개 그룹 1
        </button>
      )}
      <PendingApplicationsSheet
        open={open}
        onOpenChange={setOpen}
        applications={applications}
        now={NOW}
        cancelingId={null}
        // 시트가 열린 동안에는 바깥 요소가 화면 낭독기에서 숨겨져 있어 숨긴 요소까지 찾는다.
        emptiedFocus={() => screen.getByRole("tab", { name: "내 그룹", hidden: true })}
        onCancel={() => setApplications([])}
        onOpenRoom={vi.fn()}
      />
    </>
  );
}

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

  it("그룹 이름이 든 줄은 클릭 분석이 글자와 aria-label을 싣지 않게 가린다", () => {
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
    const row = screen.getByRole("button", { name: /새벽 5시 기상 공시반/ });
    expect(row).toHaveAttribute("data-amp-mask");
    expect(row).toHaveAttribute("data-amp-mask-attributes", "aria-label");
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

  it("목록이 비어 닫히면 사라진 띠 대신 정해 준 요소로 포커스를 돌려준다", async () => {
    render(<EmptiedHarness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "신청 중인 공개 그룹 1" }));
    await user.click(await screen.findByRole("button", { name: "신청 취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("tab", { name: "내 그룹" })).toHaveFocus());
  });
});

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderScreen } from "../../__tests__/renderScreen";
import { buildGroupRoomFixtures } from "../../fixtures";
import { RequestsScreen } from "../RequestsScreen";

const NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(NOW);
const [firstRequest, secondRequest] = fixtures.requests;

function renderRequests(overrides: Partial<ComponentProps<typeof RequestsScreen>> = {}) {
  const props = { onBack: vi.fn(), onAccept: vi.fn(), onReject: vi.fn(), onReport: vi.fn() };
  renderScreen(
    <RequestsScreen
      roomName="새벽 5시 기상 공시반"
      remainingSeats={2}
      requests={fixtures.requests}
      now={NOW}
      busyId={null}
      {...props}
      {...overrides}
    />,
  );
  return props;
}

describe("RequestsScreen", () => {
  it("머리 아래에 그룹 이름과 남은 자리를 쓰고, 신청마다 신청한 때와 남은 시간을 보인다", () => {
    renderRequests();
    expect(screen.getByRole("heading", { level: 1, name: "신청 확인" })).toBeInTheDocument();
    expect(screen.getByText("새벽 5시 기상 공시반 · 남은 자리 2")).toBeInTheDocument();
    expect(screen.getByText("방금 신청")).toBeInTheDocument();
    expect(screen.getByText("어제 신청")).toBeInTheDocument();
    expect(screen.getAllByText(/^답하지 않으면 .+ 뒤에 신청이 취소돼요$/)).toHaveLength(
      fixtures.requests.length,
    );
    expect(screen.getByText("답하지 않으면 2일 23시간 뒤에 신청이 취소돼요")).toBeInTheDocument();
    expect(
      screen.getByText("수락하면 바로 멤버가 되고, 신청한 사람에게 알림이 가요"),
    ).toBeInTheDocument();
  });

  it("소개 글은 따옴표 안에 보인다", () => {
    renderRequests();
    expect(
      screen.getByText("“9급 행정직 준비 중이에요. 새벽 5시에 꾸준히 나올게요.”"),
    ).toBeInTheDocument();
  });

  it("신고, 거절, 수락은 그 신청을 넘긴다", async () => {
    const { onReport, onReject, onAccept } = renderRequests({ requests: [firstRequest] });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "신고" }));
    expect(onReport).toHaveBeenCalledWith(firstRequest.applicationId);
    await user.click(screen.getByRole("button", { name: "거절" }));
    expect(onReject).toHaveBeenCalledWith(firstRequest.applicationId);
    await user.click(screen.getByRole("button", { name: "수락" }));
    expect(onAccept).toHaveBeenCalledWith(firstRequest.applicationId);
  });

  it("버튼마다 어느 사람의 신청인지 설명으로 붙인다", () => {
    renderRequests();
    const secondCard = screen.getByText(secondRequest.nickname).closest("li");
    expect(secondCard).not.toBeNull();
    for (const name of ["신고", "거절", "수락"]) {
      expect(
        within(secondCard as HTMLElement).getByRole("button", { name }),
      ).toHaveAccessibleDescription(secondRequest.nickname);
    }
  });

  it("자리가 다 차면 수락을 누를 수 없다", () => {
    renderRequests({ remainingSeats: 0, requests: [firstRequest] });
    expect(screen.getByRole("button", { name: "수락" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "거절" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "신고" })).toBeEnabled();
  });

  it("처리 중인 신청의 버튼은 누를 수 없다", () => {
    renderRequests({ requests: [firstRequest], busyId: firstRequest.applicationId });
    for (const name of ["신고", "거절", "수락"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("다른 신청을 처리하는 중에도 이 신청의 버튼은 누를 수 있다", () => {
    renderRequests({ busyId: firstRequest.applicationId });
    const secondCard = screen.getByText(secondRequest.nickname).closest("li");
    expect(secondCard).not.toBeNull();
    for (const name of ["신고", "거절", "수락"]) {
      expect(within(secondCard as HTMLElement).getByRole("button", { name })).toBeEnabled();
    }
  });

  it("신청이 없으면 답을 기다리는 신청이 없어요다", () => {
    renderRequests({ requests: [] });
    expect(screen.getByText("답을 기다리는 신청이 없어요")).toBeInTheDocument();
    expect(screen.queryByText("수락하면 바로 멤버가 되고, 신청한 사람에게 알림이 가요")).toBeNull();
  });

  it("신청을 불러오는 중에는 빈 상태 대신 자리표시를 둔다", () => {
    renderRequests({ requests: [], loading: true });
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("답을 기다리는 신청이 없어요")).toBeNull();
    expect(screen.queryByText("수락하면 바로 멤버가 되고, 신청한 사람에게 알림이 가요")).toBeNull();
  });

  it("뒤로 가기를 누르면 넘긴다", async () => {
    const { onBack } = renderRequests();
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

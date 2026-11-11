import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { buildPointsFixture } from "../../../fixtures";
import { MascotCollectionScreen } from "../../../screens/MascotCollectionScreen";
import { ProfileMascotRow } from "../ProfileMascotRow";

const fixture = buildPointsFixture("default");
const shop = {
  items: fixture.items,
  mascots: fixture.mascots,
  totalFocusSec: fixture.totalFocusSec,
};

function renderScreen(props: Partial<Parameters<typeof MascotCollectionScreen>[0]> = {}) {
  const onSelect = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <MascotCollectionScreen
        data={shop}
        balance={1240}
        onSelect={onSelect}
        onBack={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onSelect };
}

describe("MascotCollectionScreen", () => {
  it("위에 누적 순공이 있고 마스코트마다 상태가 보인다", () => {
    renderScreen();
    expect(screen.getByText("누적 순공")).toBeInTheDocument();
    expect(screen.getByText("25시간 48분")).toBeInTheDocument();
    expect(screen.getAllByText("선택 가능")).toHaveLength(2);
    expect(screen.getAllByText("선택 중")).toHaveLength(1);
    expect(screen.getByText("4시간 12분 남음")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스톱워치 선택 중" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("다음 차례 뒤의 잠긴 마스코트는 이름을 ???로 숨긴다", () => {
    renderScreen();
    expect(screen.getByText("램프")).toBeInTheDocument();
    expect(screen.getAllByText("???")).toHaveLength(3);
    expect(screen.queryByText("자물쇠")).not.toBeInTheDocument();
  });

  it("잠긴 마스코트를 누르면 남은 시간과 진행을 알리는 시트가 뜬다", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "램프 잠김, 4시간 12분 남음" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("순공 4시간 12분 더 하면 열려요.")).toBeInTheDocument();
    expect(within(sheet).getByRole("img", { name: "램프까지 86% 모았어요" })).toBeInTheDocument();
    expect(within(sheet).getByText("30시간")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("연 마스코트를 누르면 선택을 부른다", async () => {
    const { onSelect } = renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "플래너 선택 가능" }));
    expect(onSelect).toHaveBeenCalledWith("planner");
  });

  it("다 모아도 모두 이름과 선택 가능이 보인다", () => {
    const done = buildPointsFixture("allCollected");
    renderScreen({
      data: { items: done.items, mascots: done.mascots, totalFocusSec: done.totalFocusSec },
    });
    expect(screen.queryByText("???")).not.toBeInTheDocument();
    expect(screen.getByText("자물쇠")).toBeInTheDocument();
    expect(screen.getAllByText("선택 가능")).toHaveLength(6);
  });

  it("새로 열린 마스코트가 있으면 축하 화면을 한 번만 보인다", async () => {
    const { onSelect } = renderScreen({ newlyUnlocked: "lamp" });
    expect(screen.getByText("새 마스코트")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "램프" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText("새 마스코트")).not.toBeInTheDocument();
    expect(screen.getByText("누적 순공")).toBeInTheDocument();
  });

  it("축하 화면에서 바꾸기를 누르면 그 마스코트를 고른다", async () => {
    const { onSelect } = renderScreen({ newlyUnlocked: "lamp" });
    await userEvent.click(screen.getByRole("button", { name: "이 마스코트로 바꾸기" }));
    expect(onSelect).toHaveBeenCalledWith("lamp");
    expect(screen.queryByText("새 마스코트")).not.toBeInTheDocument();
  });
});

describe("ProfileMascotRow", () => {
  function renderRow() {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ProfileMascotRow
          mascots={shop.mascots}
          onSelect={onSelect}
          decorateTo="/points/accessories"
        />
      </MemoryRouter>,
    );
    return { onSelect };
  }

  it("제목과 꾸미기 링크, 마스코트가 보인다", () => {
    renderRow();
    expect(screen.getByText("내 마스코트")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /꾸미기/ })).toHaveAttribute(
      "href",
      "/points/accessories",
    );
    expect(screen.getByRole("button", { name: "스톱워치" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("연 마스코트를 누르면 바꾸고 잠긴 것은 눌러도 바뀌지 않는다", async () => {
    const { onSelect } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: "플래너" }));
    expect(onSelect).toHaveBeenCalledWith("planner");
    onSelect.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "램프 잠김" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

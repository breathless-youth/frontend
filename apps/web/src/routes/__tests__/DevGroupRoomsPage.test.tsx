import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { showToast } from "@/lib/toast";

import { DevGroupRoomsPage } from "../DevGroupRoomsPage";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const SCREEN_IDS = [
  "1-1",
  "1-2",
  "1-5",
  "1-6",
  "1-7",
  "1-14",
  "1-15",
  "1-16",
  "2-1",
  "2-2",
  "2-3",
  "2-4",
  "2-5",
  "2-6",
  "2-7",
  "2-8",
  "2-9",
  "3-1",
  "3-2",
  "3-3",
  "3-4",
  "3-5",
  "4-1",
  "4-2",
  "4-3",
  "4-4",
  "4-5",
  "4-6",
  "4-7",
  "code",
  "code-error",
  "longest",
];

function renderGallery(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DevGroupRoomsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DevGroupRoomsPage", () => {
  it("화면 번호가 없으면 모든 화면으로 가는 목록을 보인다", () => {
    renderGallery("/dev/group-rooms");
    for (const id of SCREEN_IDS) {
      expect(screen.getByRole("link", { name: new RegExp(`^${id} `) })).toHaveAttribute(
        "href",
        `/dev/group-rooms?screen=${id}`,
      );
    }
    expect(screen.getAllByRole("link")).toHaveLength(SCREEN_IDS.length);
  });

  it.each(SCREEN_IDS)("%s 화면을 목록 대신 그린다", async (id) => {
    renderGallery(`/dev/group-rooms?screen=${id}`);
    // 메뉴나 창이 열린 화면은 나머지를 화면 낭독기에서 숨기므로 숨긴 제목까지 센다.
    expect(screen.getAllByRole("heading", { hidden: true }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "그룹 화면 모음", hidden: true })).toBeNull();
    // 지연 받는 시트처럼 그린 뒤에 끝나는 일을 이 테스트 안에서 마친다.
    await act(async () => {});
  });

  it("화면 번호가 있으면 그 화면을 고정 데이터로 그린다", () => {
    renderGallery("/dev/group-rooms?screen=2-3");
    expect(screen.getByRole("heading", { name: "새벽 5시 기상 공시반" })).toBeInTheDocument();
  });

  it("모르는 화면 번호면 목록을 보인다", () => {
    renderGallery("/dev/group-rooms?screen=9-9");
    expect(screen.getAllByRole("link")).toHaveLength(SCREEN_IDS.length);
  });

  it("공부방에서 내보내기는 세션 확인 창의 빨간 내보내기로 연다", () => {
    renderGallery("/dev/group-rooms?screen=4-3");
    const dialog = screen.getByRole("alertdialog", { name: "새벽러님을 내보낼까요?" });
    expect(dialog).toHaveAccessibleDescription("새벽러님은 3일 동안 다시 들어올 수 없어요");
    expect(within(dialog).getByRole("button", { name: "내보내기" })).toHaveAttribute(
      "data-tone",
      "danger",
    );
  });

  it("멤버 관리에서 내보내기는 밝은 확인 창의 빨간 내보내기로 연다", () => {
    renderGallery("/dev/group-rooms?screen=4-2");
    const dialog = screen.getByRole("alertdialog", { name: "민준님을 내보낼까요?" });
    expect(within(dialog).getByRole("button", { name: "내보내기" })).toHaveAttribute(
      "data-tone",
      "danger",
    );
  });

  it("내보낸 뒤 멤버 관리는 새 초대코드를 보이고 코드가 바뀌었다고 토스트를 띄운다", () => {
    renderGallery("/dev/group-rooms?screen=4-7");
    expect(screen.getByText("우리 반 저녁 스터디 · 비공개 · 멤버 4/6")).toBeInTheDocument();
    expect(screen.getByText("R4W8XN")).toBeInTheDocument();
    expect(screen.queryByText("민준")).toBeNull();
    expect(showToast).toHaveBeenCalledWith("초대코드가 새로 바뀌었어요");
  });

  it("초대코드 오류는 칸 아래 한 문장으로 보인다", () => {
    renderGallery("/dev/group-rooms?screen=code-error");
    expect(screen.getByRole("alert")).toHaveTextContent("자리가 다 찼어요");
    expect(screen.getByRole("textbox")).toHaveValue("K7Q2M9");
  });

  it("자정 무렵에 열어도 시간 표기는 고정 데이터 그대로다", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T00:30:00+09:00"));
    renderGallery("/dev/group-rooms?screen=3-2");
    expect(screen.getByText("2시간 전")).toBeInTheDocument();
    expect(screen.getByText("16일 전")).toBeInTheDocument();
  });
});

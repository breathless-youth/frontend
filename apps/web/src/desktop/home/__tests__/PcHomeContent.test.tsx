import "fake-indexeddb/auto";

import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";
import i18n from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";

import { PcHomeContent } from "../PcHomeContent";

vi.mock("../../session/PcStudySession", () => ({
  PcStudySession: () => <p>공부 중</p>,
}));

const PHOTO = { bytes: new ArrayBuffer(1), width: 1, height: 1 };

function props(): HomeV3ContentProps {
  return {
    band: { status: "success", value: { kind: "mission", step: 1, ready: true, progress: 0 } },
    stats: {
      status: "success",
      value: { studySeconds: 15512, focusSeconds: 13337, focusRate: 86 },
    },
    subjects: { status: "success", value: [{ id: 1, name: "Math", colorIndex: 0 }] },
    selectedSubjectId: null,
    timelapseCount: 2,
    appLockLabel: "4 apps blocked",
    actions: {
      selectSubject: vi.fn(),
      startStudy: vi.fn(),
      openPlanner: vi.fn(),
      completeMission: vi.fn(),
      editGoal: vi.fn(),
      openTimelapses: vi.fn(),
      openTimelapseSettings: vi.fn(),
      openAppLock: vi.fn(),
      openContact: vi.fn(),
    },
  };
}

function renderHome() {
  render(
    <QueryClientProvider client={queryClient}>
      <div className="relative">
        <PcHomeContent
          {...props()}
          dday={null}
          contactHref="/contact/chat"
          session={null}
          onSessionEnd={vi.fn()}
        />
      </div>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  __resetTimerBackgroundPhotoStoreForTests();
  queryClient.clear();
});

describe("PcHomeContent", () => {
  it("공부 중에는 문의 버튼을 숨긴다", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <div className="relative">
          <PcHomeContent
            {...props()}
            dday={null}
            contactHref="/contact/chat"
            session={{ key: 1, resume: false }}
            onSessionEnd={vi.fn()}
          />
        </div>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("공부 중")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /문의/ })).not.toBeInTheDocument();
  });

  it("공부시간 패널 안에 진행 띠·공부 카드·시작 버튼이 보인다", () => {
    renderHome();

    const panel = screen.getByRole("region", { name: "공부시간" });
    expect(
      within(panel).getByRole("region", { name: i18n.t("home:v3.mission.caption") }),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("region", { name: "오늘 공부시간" })).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: i18n.t("home:v3.startStudy") }),
    ).toBeInTheDocument();
  });

  it("폰 홈의 플래너 바로가기·타임랩스·방해 앱 잠금·문의 푸터는 그리지 않는다", () => {
    renderHome();

    expect(screen.queryByText("4 apps blocked")).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("home:v3.contact.bubble"))).not.toBeInTheDocument();
  });

  it("접으면 머리줄과 오늘 공부시간만 남는다", async () => {
    renderHome();

    await userEvent.click(screen.getByRole("button", { name: "공부시간 패널 접기" }));

    expect(screen.getByRole("heading", { level: 2, name: "공부시간 4:18:32" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("home:v3.startStudy") }),
    ).not.toBeInTheDocument();
  });

  it("홈 전체를 글자 선택과 그림 끌기에서 뺀다", () => {
    renderHome();

    // 전체 선택이나 끌어 선택이 월페이퍼 사진까지 파랗게 칠하지 않게 한다.
    const home = screen.getByRole("region", { name: "공부시간" }).parentElement!;
    expect(home).toHaveClass("session-no-drag");
  });

  it("공간에서 사진을 고르면 월페이퍼가 바로 바뀐다", async () => {
    await timerBackgroundPhotoStore().add(PHOTO, 1);
    renderHome();
    expect(screen.queryByTestId("timer-background-layer")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "공간" }));
    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1" }));

    expect(await screen.findByTestId("timer-background-layer")).toBeInTheDocument();
  });

  it("키보드 순서는 레일 다음 패널 머리줄이고 문의가 마지막이다", async () => {
    renderHome();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "공간" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("group", { name: /방향키/ })).toHaveFocus();

    screen.getByRole("link", { name: /문의/ }).focus();
    await userEvent.tab();
    expect(document.body).toHaveFocus();
  });
});

describe("PcHomeContent 공간 플라이아웃과 공부시간 패널", () => {
  beforeEach(() => {
    // jsdom에는 포인터 붙잡기가 없어 패널 끌기가 부르는 함수만 채운다.
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
    Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture");
  });

  async function openFlyout() {
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));
    return screen.findByRole("dialog", { name: "공간" });
  }

  async function expectClosed() {
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it("패널 머리줄을 끌어도 플라이아웃이 열려 있다", async () => {
    const flyout = await openFlyout();
    const handle = screen.getByRole("group", { name: /방향키/ });

    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: handle, coords: { clientX: 900, clientY: 40 } },
      { target: handle, coords: { clientX: 700, clientY: 140 } },
      { keys: "[/MouseLeft]", target: handle, coords: { clientX: 700, clientY: 140 } },
    ]);

    expect(flyout).toBeInTheDocument();
  });

  it("패널의 접기 버튼을 눌러도 플라이아웃이 열려 있다", async () => {
    const flyout = await openFlyout();

    await userEvent.click(screen.getByRole("button", { name: "공부시간 패널 접기" }));

    expect(flyout).toBeInTheDocument();
  });

  it("패널에서 과목 메뉴를 열고 골라도 플라이아웃이 열려 있다", async () => {
    const flyout = await openFlyout();

    await userEvent.click(screen.getByRole("button", { name: i18n.t("home:v3.subject.choose") }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Math" }));

    expect(flyout).toBeInTheDocument();
  });

  it("월페이퍼를 누르면 플라이아웃이 닫힌다", async () => {
    await openFlyout();
    const home = screen.getByRole("region", { name: "공부시간" }).parentElement!;

    await userEvent.click(home.firstElementChild!);

    await expectClosed();
  });

  it("Esc를 누르면 플라이아웃이 닫힌다", async () => {
    await openFlyout();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await expectClosed();
  });
});

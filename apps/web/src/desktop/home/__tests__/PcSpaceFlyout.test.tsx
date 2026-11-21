import "fake-indexeddb/auto";

import type { ProfileResponse } from "@focusmakers/types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import spaceSource from "@/features/timer-background/components/SessionSpacePage.tsx?raw";
import { readTimerBackground } from "@/features/timer-background/timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";
import { saveWatcherAssets } from "@/features/timer-background/watcher/watcherAssets";
import { getDecorations, getShopItems, putTimerBackground } from "@/lib/pointsApi";
import { profileKeys } from "@/lib/profileQueries";
import { queryClient } from "@/lib/queryClient";
import { PROCTOR_SPACE, shopSpace } from "@/test/spaceFixtures";

import { PcHomeRail } from "../PcHomeRail";
import { PcSpaceFlyout } from "../PcSpaceFlyout";

vi.mock("@/features/timer-background/watcher/watcherAssets", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  saveWatcherAssets: vi.fn(async () => {}),
}));

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getShopItems: vi.fn(),
  getDecorations: vi.fn(),
  putTimerBackground: vi.fn(),
}));

const PHOTO = { bytes: new ArrayBuffer(1), width: 1, height: 1 };
const DECORATIONS = { selectedMascotCode: "BOOK", accessories: [], timerBackground: null };

function renderRail(path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <div data-testid="outside">바깥</div>
      <PcHomeRail>
        <PcSpaceFlyout container={null} />
      </PcHomeRail>
    </MemoryRouter>,
  );
  return screen.getByRole("button", { name: "공간" });
}

async function openFlyout(trigger: HTMLElement) {
  await userEvent.click(trigger);
  return screen.findByRole("dialog", { name: "공간" });
}

async function expectClosed() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

beforeEach(() => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  __resetTimerBackgroundPhotoStoreForTests();
  queryClient.clear();
  vi.clearAllMocks();
  vi.mocked(getShopItems).mockResolvedValue({ items: [shopSpace()] });
  vi.mocked(getDecorations).mockResolvedValue(DECORATIONS);
  vi.mocked(putTimerBackground).mockResolvedValue(DECORATIONS);
});

describe("PcSpaceFlyout", () => {
  it("레일에 홈 도구 이름을 단다", () => {
    renderRail();

    expect(screen.getByRole("group", { name: "홈 도구" })).toBeInTheDocument();
  });

  it("공간을 누르면 세션 시트와 같은 탭 줄과 검색창으로 목록을 열고 버튼에 열림을 표시한다", async () => {
    const trigger = renderRail();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    const dialog = await openFlyout(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // 홈을 막지 않는 창이라 보조 기술에 모달로 알리지 않는다.
    expect(dialog).not.toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "이미지" }));
    expect(screen.getByRole("button", { name: "심플", pressed: true })).toBeInTheDocument();
  });

  it("Esc로 닫으면 공간 버튼으로 포커스가 돌아온다", async () => {
    const trigger = renderRail();
    await openFlyout(trigger);

    await userEvent.keyboard("{Escape}");

    await expectClosed();
    expect(trigger).toHaveFocus();
  });

  it("닫기를 누르면 닫히고 공간 버튼으로 포커스가 돌아온다", async () => {
    const trigger = renderRail();
    await openFlyout(trigger);

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    await expectClosed();
    expect(trigger).toHaveFocus();
  });

  it("공간을 다시 누르면 닫힌다", async () => {
    const trigger = renderRail();
    await openFlyout(trigger);

    await userEvent.click(trigger);

    await expectClosed();
  });

  it("바깥을 누르면 닫힌다", async () => {
    const trigger = renderRail();
    await openFlyout(trigger);

    await userEvent.click(screen.getByTestId("outside"));

    await expectClosed();
  });

  it("내 사진을 누르면 바로 고른 공간으로 저장한다", async () => {
    const photo = await timerBackgroundPhotoStore().add(PHOTO, 1);
    const trigger = renderRail();
    await openFlyout(trigger);
    await userEvent.click(screen.getByRole("tab", { name: "이미지" }));

    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1" }));

    await waitFor(() =>
      expect(readTimerBackground()).toEqual({ kind: "photo", photoId: photo.id }),
    );
    expect(screen.getByRole("button", { name: "내 사진 1", pressed: true })).toBeInTheDocument();
  });

  it("세션 색 대신 앱 테마를 따라 밝은 테마에서는 밝게 그린다", async () => {
    const dialog = await openFlyout(renderRail());

    expect(dialog).not.toHaveClass("theme-dark");
    expect(dialog.closest(".theme-dark")).toBeNull();
  });

  it("공간 본문이 읽는 세션 변수를 모두 앱 테마 변수로 채우고, 세션 화면에도 같은 변수가 있다", async () => {
    const dialog = await openFlyout(renderRail());
    const used = new Set(spaceSource.match(/--session-[a-z0-9-]+/g));
    const session = sessionSurfaceStyle as unknown as Record<string, string>;

    expect(used.size).toBeGreaterThan(0);
    for (const name of used) {
      expect(session[name], name).toBeDefined();
      const value = dialog.style.getPropertyValue(name);
      // 심플 미리보기 바탕은 테마가 아니라 공간 자체의 색이라 그대로 둔다.
      if (name === "--session-simple-base") expect(value, name).not.toBe("");
      else expect(value, name).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
});

describe("PcSpaceFlyout 서버 공간", () => {
  function profile(loginProvider: string | null) {
    queryClient.setQueryData(profileKeys.detail(1), { loginProvider } as ProfileResponse);
  }

  it("회원이 서버 공간을 고르면 기기와 서버에 함께 저장한다", async () => {
    profile("KAKAO");
    await openFlyout(renderRail("/?userId=1"));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    await waitFor(() => expect(putTimerBackground).toHaveBeenCalledExactlyOnceWith(41));
    expect(readTimerBackground()).toEqual(PROCTOR_SPACE);
  });

  it("비회원은 서버 공간을 기기에만 저장한다", async () => {
    profile(null);
    await openFlyout(renderRail("/?userId=1"));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    await waitFor(() => expect(readTimerBackground()).toEqual(PROCTOR_SPACE));
    expect(putTimerBackground).not.toHaveBeenCalled();
    expect(getDecorations).not.toHaveBeenCalled();
  });

  it("회원이면 홈을 열 때 서버에 적용해 둔 공간으로 맞춘다", async () => {
    profile("KAKAO");
    vi.mocked(getDecorations).mockResolvedValue({
      ...DECORATIONS,
      timerBackground: { ...PROCTOR_SPACE, imageUrl: null } as never,
    });

    renderRail("/?userId=1");

    await waitFor(() => expect(readTimerBackground()).toEqual(PROCTOR_SPACE));
  });

  it("신원이 없으면 서버 공간 없이 열린다", async () => {
    await openFlyout(renderRail());

    expect(await screen.findByText("찾는 공간이 없어요")).toBeInTheDocument();
    expect(getShopItems).not.toHaveBeenCalled();
  });

  it("창이 낮아도 감시 공간 파일은 태블릿 것을 받아 둔다", async () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 500);
    profile(null);
    await openFlyout(renderRail("/?userId=1"));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    await waitFor(() => expect(saveWatcherAssets).toHaveBeenCalledOnce());
    const [assetKey, urls] = vi.mocked(saveWatcherAssets).mock.calls[0]!;
    expect(assetKey).toBe(PROCTOR_SPACE.assetKey);
    expect(urls).toContain(`/spaces/${PROCTOR_SPACE.assetKey}/enter/tablet_landscape.mp4`);
    expect(urls.some((url) => url.includes("phone_"))).toBe(false);
    vi.unstubAllGlobals();
  });
});

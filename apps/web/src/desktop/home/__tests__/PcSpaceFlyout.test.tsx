import "fake-indexeddb/auto";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import spaceSource from "@/features/timer-background/components/SessionSpacePage.tsx?raw";
import { readTimerBackground } from "@/features/timer-background/timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";
import { queryClient } from "@/lib/queryClient";

import { PcHomeRail } from "../PcHomeRail";
import { PcSpaceFlyout } from "../PcSpaceFlyout";

const PHOTO = { bytes: new ArrayBuffer(1), width: 1, height: 1 };

function renderRail() {
  render(
    <>
      <div data-testid="outside">바깥</div>
      <PcHomeRail>
        <PcSpaceFlyout container={null} />
      </PcHomeRail>
    </>,
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
});

describe("PcSpaceFlyout", () => {
  it("레일에 홈 도구 이름을 단다", () => {
    renderRail();

    expect(screen.getByRole("group", { name: "홈 도구" })).toBeInTheDocument();
  });

  it("공간을 누르면 탭 줄 없이 이미지 목록을 열고 버튼에 열림을 표시한다", async () => {
    const trigger = renderRail();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    const dialog = await openFlyout(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // 홈을 막지 않는 창이라 보조 기술에 모달로 알리지 않는다.
    expect(dialog).not.toHaveAttribute("aria-modal", "true");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
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

    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1" }));

    expect(readTimerBackground()).toEqual({ kind: "photo", photoId: photo.id });
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

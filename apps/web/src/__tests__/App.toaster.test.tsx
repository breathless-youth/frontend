import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";

/** 네이티브가 `injectJavaScript`로 부르는 전역 진입점을 그대로 호출한다. */
function sendFromNative(message: Record<string, unknown>) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify(message));
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })),
  );
});

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
  vi.unstubAllGlobals();
});

describe("App 전역 Toaster", () => {
  it("화면이 마운트되자마자 부른 토스트도 보인다", async () => {
    markSocialRoomNotice({ kind: "failure", message: "방이 만료되었어요" });

    render(
      <MemoryRouter initialEntries={["/social?userId=7"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("방이 만료되었어요")).toBeInTheDocument();
  });

  // 알림 훅 테스트는 자체 하네스에서 돌아서 `App`이 그 훅을 부르는지는 이 테스트만 확인한다.
  it("앱을 쓰는 중에 온 그룹 알림을 홈에서 토스트로 보인다", async () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <App />
      </MemoryRouter>,
    );

    act(() => {
      sendFromNative({
        type: "in-app-notification",
        title: "그룹장이 됐어요",
        body: "새벽 공시반의 그룹장을 넘겨받았어요",
        link: "/social/groups/10",
        atMs: 1,
      });
    });

    expect(
      await screen.findByRole("button", {
        name: "그룹장이 됐어요. 새벽 공시반의 그룹장을 넘겨받았어요",
      }),
    ).toBeInTheDocument();
  });
});

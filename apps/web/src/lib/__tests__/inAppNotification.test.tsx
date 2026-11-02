import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import type { Mock } from "vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/sonner";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { isSessionRoute, useInAppNotificationRelay } from "@/lib/inAppNotification";
import { showToast } from "@/lib/toast";

/**
 * 앱을 쓰는 중에 온 그룹 알림 토스트
 *
 * 앱이 보낸 `in-app-notification`을 세션 화면 밖에서만 두 줄 토스트로 띄우고, 누르면 `open-push-link`로 돌려준다.
 */

/**
 * 브리지가 있는 웹뷰 흉내
 *
 * 반환값으로 앱에 보낸 메시지를 본다.
 */
function stubNativeBridge() {
  const postMessage = vi.fn();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
  return postMessage;
}

/** 네이티브가 `injectJavaScript`로 부르는 전역 진입점을 그대로 호출한다. */
function sendFromNative(message: Record<string, unknown>) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify(message));
}

function lastPosted(postMessage: Mock) {
  return JSON.parse(String(postMessage.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
}

/** sonner는 토스트를 다음 매크로태스크에 그리므로 그 뒤까지 기다린다. */
async function flushToasts() {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

function RelayHarness({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Relay />
      <Toaster />
    </MemoryRouter>
  );
}

function Relay() {
  useInAppNotificationRelay();
  return null;
}

const NOTIFICATION = {
  type: "in-app-notification",
  title: "그룹장이 됐어요",
  body: "새벽 공시반의 그룹장을 넘겨받았어요",
  link: "/social/groups/10",
  atMs: 1,
};

beforeAll(() => {
  // sonner는 토스트를 누를 때 포인터를 잡는데 jsdom에는 그 API가 없다.
  Element.prototype.setPointerCapture ??= () => {};
});

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
  vi.unstubAllGlobals();
});

describe("useInAppNotificationRelay", () => {
  it("제목과 본문 두 줄 토스트를 띄우고 누르면 앱에 링크를 넘긴다", async () => {
    const postMessage = stubNativeBridge();
    render(<RelayHarness path="/home" />);

    act(() => sendFromNative(NOTIFICATION));
    const toastButton = await screen.findByRole("button", {
      name: "그룹장이 됐어요. 새벽 공시반의 그룹장을 넘겨받았어요",
    });
    expect(toastButton).toHaveTextContent("그룹장이 됐어요");
    expect(toastButton).toHaveTextContent("새벽 공시반의 그룹장을 넘겨받았어요");
    await userEvent.setup().click(toastButton);

    expect(lastPosted(postMessage)).toMatchObject({
      type: "open-push-link",
      link: "/social/groups/10",
    });
    expect(lastPosted(postMessage)).not.toHaveProperty("pushType");
  });

  it("위쪽 가운데에 띄우고 누르면 닫는다", async () => {
    stubNativeBridge();
    render(<RelayHarness path="/records" />);

    act(() => sendFromNative(NOTIFICATION));
    const toastButton = await screen.findByRole("button", {
      name: "그룹장이 됐어요. 새벽 공시반의 그룹장을 넘겨받았어요",
    });
    expect(toastButton.closest("[data-sonner-toaster]")).toHaveAttribute("data-y-position", "top");
    await userEvent.setup().click(toastButton);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /그룹장이 됐어요/ })).not.toBeInTheDocument();
    });
  });

  it("알림 종류를 받았으면 누를 때 그대로 돌려준다", async () => {
    const postMessage = stubNativeBridge();
    render(<RelayHarness path="/home" />);

    act(() => sendFromNative({ ...NOTIFICATION, pushType: "group_owner_transferred" }));
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: "그룹장이 됐어요. 새벽 공시반의 그룹장을 넘겨받았어요",
      }),
    );

    expect(lastPosted(postMessage)).toMatchObject({
      type: "open-push-link",
      link: "/social/groups/10",
      pushType: "group_owner_transferred",
    });
  });

  it("세션 화면에서는 띄우지 않는다", async () => {
    stubNativeBridge();
    render(<RelayHarness path="/social/groups/10/room" />);

    act(() =>
      sendFromNative({
        type: "in-app-notification",
        title: "t",
        body: "b",
        link: "/social",
        atMs: 1,
      }),
    );
    await flushToasts();

    expect(screen.queryByRole("button", { name: "t. b" })).toBeNull();
  });

  it("알림 토스트 뒤에 뜬 일반 토스트는 알림 내용을 물려받지 않는다", async () => {
    stubNativeBridge();
    render(<RelayHarness path="/home" />);

    act(() => sendFromNative(NOTIFICATION));
    await screen.findByRole("button", { name: /그룹장이 됐어요/ });
    act(() => {
      showToast("저장했어요");
    });

    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /그룹장이 됐어요/ })).not.toBeInTheDocument();
  });
});

describe("isSessionRoute", () => {
  it.each([
    "/room/1",
    "/room/1/result",
    "/social/room/42",
    "/social/room/42/result",
    "/social/groups/10/room",
    "/social/groups/10/room/result",
  ])("%s는 세션 경로다", (path) => {
    expect(isSessionRoute(path)).toBe(true);
  });

  it.each(["/home", "/social", "/social/groups/10", "/social/groups/10/applications"])(
    "%s는 세션 경로가 아니다",
    (path) => {
      expect(isSessionRoute(path)).toBe(false);
    },
  );
});

import { onlineManager } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { groupKeys } from "@/lib/groupRoomQueries";
import i18n from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import type * as UserId from "@/lib/userId";
import { mockGroupApi, renderGroupRoute } from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));

const copy = (key: "title" | "description" | "accept" | "later" | "enabled" | "disabled") =>
  i18n.t(`group-room:notificationPrompt.${key}`);
const path = (id: number) => `/social/groups/${id}?groupRooms=1`;
const askedKey = (user: number, group: number) => `group-notification-asked:${user}:${group}`;

beforeAll(async () => {
  await import("@/routes/GroupHomePage");
});

afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  localStorage.clear();
});

async function prompt() {
  return screen.findByRole("dialog", { name: copy("title") });
}

async function expectClosed() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("group notification prompt", () => {
  it("asks once for each user and group, including the owner", async () => {
    const api = mockGroupApi();
    renderGroupRoute(path(10));
    expect(await prompt()).toHaveAccessibleDescription(copy("description"));
    expect(localStorage.getItem(askedKey(1, 10))).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: copy("later") }));
    await expectClosed();
    await act(() => queryClient.invalidateQueries({ queryKey: groupKeys.home(1, 10) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.setGroupNotification).not.toHaveBeenCalled();
    cleanup();
    renderGroupRoute(path(10));
    await screen.findByRole("button", { name: i18n.t("group-room:roomHomeScreen.aria.notify") });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();
    renderGroupRoute(path(11));
    await prompt();
    expect(localStorage.getItem(askedKey(1, 11))).toBe("1");
  });

  it("does not use another user's saved answer", async () => {
    mockGroupApi();
    localStorage.setItem(askedKey(2, 10), "1");
    renderGroupRoute(path(10));
    await prompt();
  });

  it("does not ask when notifications are already enabled", async () => {
    const api = mockGroupApi();
    await api.server.setGroupNotification(10, true);
    renderGroupRoute(path(10));
    const bell = await screen.findByRole("button", {
      name: i18n.t("group-room:roomHomeScreen.aria.notify"),
    });
    expect(bell).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(bell);
    await screen.findByText(copy("disabled"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits for home data and an online connection, even with cached home data", async () => {
    const api = mockGroupApi();
    let resolveHome!: (value: Awaited<ReturnType<typeof api.getGroupHome>>) => void;
    const home = await api.server.getGroupHome(10);
    api.getGroupHome.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHome = resolve;
        }),
    );
    renderGroupRoute(path(10));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => onlineManager.setOnline(false));
    await act(async () => resolveHome(home));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => onlineManager.setOnline(true));
    await prompt();
  });

  it("enables notifications and shows the filled bell toast only after success", async () => {
    const api = mockGroupApi();
    renderGroupRoute(path(10));
    await prompt();
    await userEvent.click(screen.getByRole("button", { name: copy("accept") }));
    await expectClosed();
    await waitFor(() => expect(api.setGroupNotification).toHaveBeenCalledWith(10, true));
    const toast = await screen.findByText(copy("enabled"));
    expect(toast.parentElement?.querySelector("svg")).toHaveClass("fill-current");
    expect(
      screen.getByRole("button", { name: i18n.t("group-room:roomHomeScreen.aria.notify") }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("closes after a failed enable and never asks again", async () => {
    const api = mockGroupApi();
    api.setGroupNotification.mockRejectedValueOnce(new ApiError("failed", 500));
    renderGroupRoute(path(10));
    await prompt();
    await userEvent.click(screen.getByRole("button", { name: copy("accept") }));
    await expectClosed();
    await screen.findByText(i18n.t("common:errors.retryLater"));
    expect(screen.queryByText(copy("enabled"))).not.toBeInTheDocument();
    cleanup();
    renderGroupRoute(path(10));
    await screen.findByRole("button", { name: i18n.t("group-room:roomHomeScreen.aria.notify") });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("treats Escape dismissal as an answer without enabling", async () => {
    const api = mockGroupApi();
    renderGroupRoute(path(10));
    await prompt();
    await userEvent.keyboard("{Escape}");
    await expectClosed();
    expect(api.setGroupNotification).not.toHaveBeenCalled();
    expect(localStorage.getItem(askedKey(1, 10))).toBe("1");
  });

  it("treats an outside press as an answer", async () => {
    const api = mockGroupApi();
    renderGroupRoute(path(10));
    await prompt();
    await userEvent.click(document.body);
    await expectClosed();
    expect(api.setGroupNotification).not.toHaveBeenCalled();
    cleanup();
    renderGroupRoute(path(10));
    await screen.findByRole("button", { name: i18n.t("group-room:roomHomeScreen.aria.notify") });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("survives blocked storage and remembers the answer for this app run", async () => {
    mockGroupApi();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderGroupRoute(path(11));
    await prompt();
    await userEvent.click(screen.getByRole("button", { name: copy("later") }));
    await expectClosed();
    cleanup();
    renderGroupRoute(path(11));
    await screen.findByRole("button", { name: i18n.t("group-room:roomHomeScreen.aria.notify") });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    get.mockRestore();
    set.mockRestore();
  });

  it("shows on/off messages with 16px bell icons above the CTA when toggling", async () => {
    mockGroupApi();
    localStorage.setItem(askedKey(1, 10), "1");
    renderGroupRoute(path(10));
    const bell = await screen.findByRole("button", {
      name: i18n.t("group-room:roomHomeScreen.aria.notify"),
    });
    await userEvent.click(bell);
    const on = await screen.findByText(copy("enabled"));
    expect(on.parentElement?.querySelector("svg")).toHaveAttribute("width", "16");
    expect(on.parentElement?.querySelector("svg")).toHaveClass("fill-current");
    const toaster = on.closest<HTMLElement>("[data-sonner-toaster]");
    expect(toaster?.style.getPropertyValue("--offset-bottom")).toBe(
      "calc(env(safe-area-inset-bottom) + 92px)",
    );
    await userEvent.click(bell);
    const off = await screen.findByText(copy("disabled"));
    expect(off.parentElement?.querySelector("svg")).toHaveClass("lucide-bell-off");
    expect(off.parentElement?.querySelector("svg")).toHaveAttribute("width", "16");
  });
});

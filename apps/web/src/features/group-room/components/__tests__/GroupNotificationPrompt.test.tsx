import { onlineManager } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import type * as LazySheetModule from "@/lib/lazyWithPreload";

import type { GroupNotificationPrompt } from "../GroupNotificationPrompt";

const loadSheet = vi.hoisted(() => vi.fn<() => Promise<void>>());

// Keep the real loader's failure/close/retry behavior and the real sheet UI.
vi.mock("@/lib/lazyWithPreload", async (importOriginal) => {
  const { lazyWithPreload } = await importOriginal<typeof LazySheetModule>();
  return {
    lazyWithPreload: (...[load, options]: Parameters<typeof lazyWithPreload>) =>
      lazyWithPreload(() => loadSheet().then(load), options),
  };
});

const askedKey = "group-notification-asked:1:10";
const copy = (key: "title" | "accept" | "later") => i18n.t(`group-room:notificationPrompt.${key}`);
const props = {
  userId: 1,
  groupId: 10,
  ready: true,
  notifyEnabled: false,
  onAccept: vi.fn(),
};

beforeEach(() => {
  vi.resetModules();
  loadSheet.mockReset().mockResolvedValue(undefined);
  props.onAccept.mockClear();
  onlineManager.setOnline(true);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

async function revisit(Prompt: typeof GroupNotificationPrompt) {
  cleanup();
  render(<Prompt {...props} />);
  // Let the prompt's deferred eligibility check run before checking that it stays closed.
  await act(() => new Promise((resolve) => window.setTimeout(resolve, 20)));
}

describe("GroupNotificationPrompt persistence", () => {
  it.each(["available", "read blocked", "write blocked"])(
    "does not remember a pending or failed load and retries on the next visit (%s storage)",
    async (storage) => {
      const { GroupNotificationPrompt } = await import("../GroupNotificationPrompt");
      if (storage === "read blocked") {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
          throw new Error("blocked");
        });
      }
      if (storage === "write blocked") {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new Error("blocked");
        });
      }
      let rejectLoad!: (error: Error) => void;
      loadSheet.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectLoad = reject;
          }),
      );
      render(<GroupNotificationPrompt {...props} />);
      await waitFor(() => expect(loadSheet).toHaveBeenCalledOnce());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      if (storage === "available") expect(localStorage.getItem(askedKey)).toBeNull();

      await act(() => rejectLoad(new Error("chunk download failed")));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      if (storage === "available") expect(localStorage.getItem(askedKey)).toBeNull();

      await revisit(GroupNotificationPrompt);
      expect(await screen.findByRole("dialog", { name: copy("title") })).toBeInTheDocument();
      expect(loadSheet).toHaveBeenCalledTimes(2);
      if (storage === "available") expect(localStorage.getItem(askedKey)).toBe("1");
      await userEvent.click(screen.getByRole("button", { name: copy("later") }));
      await revisit(GroupNotificationPrompt);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(loadSheet).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["later", "accept", "Escape", "outside"] as const)(
    "remembers a rendered prompt after %s and does not ask on the next visit",
    async (answer) => {
      const { GroupNotificationPrompt } = await import("../GroupNotificationPrompt");
      render(<GroupNotificationPrompt {...props} />);
      await screen.findByRole("dialog", { name: copy("title") });
      expect(localStorage.getItem(askedKey)).toBe("1");

      const user = userEvent.setup();
      if (answer === "Escape") await user.keyboard("{Escape}");
      else if (answer === "outside") await user.click(document.body);
      else await user.click(screen.getByRole("button", { name: copy(answer) }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(props.onAccept).toHaveBeenCalledTimes(answer === "accept" ? 1 : 0);
      expect(localStorage.getItem(askedKey)).toBe("1");
      await revisit(GroupNotificationPrompt);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(loadSheet).toHaveBeenCalledOnce();
    },
  );
});

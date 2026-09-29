import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";

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
});

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import {
  RESUBMIT_TOAST_MESSAGE,
  resubmitPendingSessions,
} from "@/features/study-session/resubmitPendingSessions";

vi.mock("@/features/study-session/resubmitPendingSessions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resubmitPendingSessions: vi.fn(async () => 0),
}));

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/licenses"]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — 부팅 재제출", () => {
  it("마운트 1회에 보관분 재제출을 시작한다", () => {
    renderApp();

    expect(resubmitPendingSessions).toHaveBeenCalledTimes(1);
  });

  it("재제출 성공 건이 있으면 토스트를 띄운다", async () => {
    vi.mocked(resubmitPendingSessions).mockResolvedValue(2);
    renderApp();

    expect(await screen.findByText(RESUBMIT_TOAST_MESSAGE)).toBeInTheDocument();
  });

  it("성공 건이 없으면 토스트를 띄우지 않는다", async () => {
    vi.mocked(resubmitPendingSessions).mockResolvedValue(0);
    renderApp();

    await waitFor(() => {
      expect(resubmitPendingSessions).toHaveBeenCalled();
    });
    expect(screen.queryByText(RESUBMIT_TOAST_MESSAGE)).not.toBeInTheDocument();
  });
});

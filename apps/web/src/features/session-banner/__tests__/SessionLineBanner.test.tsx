import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { SessionLineBanner } from "../SessionLineBanner";

const analytics = vi.hoisted(() => ({ trackSessionBannerClicked: vi.fn() }));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("SessionLineBanner", () => {
  it("AD 라벨과 문구를 보이고 버튼 이름에 문구가 들어간다", () => {
    render(<SessionLineBanner copy={2} onOpen={() => {}} />);

    expect(screen.getByText("AD")).toBeInTheDocument();
    expect(screen.getByText("이번 주 집중 리포트 받아 보기")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "AD 이번 주 집중 리포트 받아 보기" }),
    ).toBeInTheDocument();
  });

  it("누르면 clicked를 보내고 onOpen을 부른다", async () => {
    const onOpen = vi.fn();
    render(<SessionLineBanner copy={3} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole("button", { name: /프리미엄 사전 신청 받는 중/ }));

    expect(analytics.trackSessionBannerClicked).toHaveBeenCalledWith({ copy: 3 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

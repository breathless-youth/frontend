import { act, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it } from "vitest";

import { CtaToaster, Toaster } from "@/components/ui/sonner";
import { showCtaToast, showToast } from "@/lib/toast";

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

describe("showToast", () => {
  it("새 토스트가 이전 토스트를 실제로 대체한다", async () => {
    render(<Toaster />);

    act(() => {
      showToast("A");
    });
    expect(await screen.findByText("A")).toBeInTheDocument();

    act(() => {
      showToast("B");
    });
    expect(await screen.findByText("B")).toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
  });

  it("토스트가 지워진 뒤에는 대체됐던 이전 토스트가 되살아나지 않는다", async () => {
    render(<Toaster />);

    act(() => {
      showToast("A");
    });
    act(() => {
      showToast("B");
    });
    await screen.findByText("B");

    // 떠 있는 토스트를 지운다.
    act(() => {
      toast.dismiss();
    });

    // sonner는 퇴장 애니메이션 뒤 약 200ms 지나야 DOM에서 걷어낸다.
    await waitFor(() => {
      expect(screen.queryByText("A")).not.toBeInTheDocument();
      expect(screen.queryByText("B")).not.toBeInTheDocument();
    });
  });
});

describe("showCtaToast", () => {
  it("새 CTA 토스트가 이전 토스트를 대체하고 화면 알림 영역에만 뜬다", async () => {
    render(
      <>
        <Toaster />
        <CtaToaster />
      </>,
    );

    act(() => {
      showCtaToast("A");
    });
    act(() => {
      showCtaToast("B");
    });

    const ctaRegion = screen.getByRole("region", { name: "화면 알림" });
    expect(await within(ctaRegion).findByText("B")).toBeInTheDocument();
    expect(within(ctaRegion).queryByText("A")).not.toBeInTheDocument();

    const globalRegion = screen.getByRole("region", { name: "알림" });
    expect(within(globalRegion).queryByText("B")).not.toBeInTheDocument();
  });

  it("화면이 사라진 뒤 다시 떠도 이전 CTA 토스트를 재생하지 않는다", async () => {
    const { unmount } = render(<CtaToaster />);

    act(() => {
      showCtaToast("A");
    });
    await screen.findByText("A");

    // 화면 이탈을 흉내낸다. 5초 타이머가 아직 안 끝난 채로 CtaToaster가 사라진다.
    unmount();

    // 새 화면이 같은 CtaToaster를 다시 띄운다.
    render(<CtaToaster />);

    // Sonner는 구독이 걸리면 남아 있는 토스트를 setTimeout(0)으로 재생한다. 그 구간을 지나 보낸다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.queryByText("A")).not.toBeInTheDocument();
  });
});

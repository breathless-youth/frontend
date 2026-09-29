import { act, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it } from "vitest";

import { CtaToaster, TOAST_PILL_CLASS, Toaster } from "@/components/ui/sonner";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { CTA_TOASTER_ID, showCtaToast, showToast } from "@/lib/toast";

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

describe("Toaster", () => {
  it("토스트 문구를 스크린리더가 읽는 알림 영역 안에 그린다", async () => {
    render(<Toaster />);
    act(() => {
      toast("버전을 복사했어요");
    });

    const region = screen.getByRole("region", { name: "알림" });
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(await within(region).findByText("버전을 복사했어요")).toBeInTheDocument();
  });

  it("CTA 토스트는 전용 Toaster에만, 일반 토스트는 전역 Toaster에만 뜬다", async () => {
    render(
      <>
        <div data-testid="global">
          <Toaster />
        </div>
        <div data-testid="cta">
          <CtaToaster />
        </div>
      </>,
    );
    act(() => {
      toast("카메라를 전환했어요", { toasterId: CTA_TOASTER_ID });
      toast("프로필이 저장됐어요");
    });

    const cta = screen.getByTestId("cta");
    const global = screen.getByTestId("global");
    expect(await within(cta).findByText("카메라를 전환했어요")).toBeInTheDocument();
    expect(await within(global).findByText("프로필이 저장됐어요")).toBeInTheDocument();
    expect(within(global).queryByText("카메라를 전환했어요")).not.toBeInTheDocument();
    expect(within(cta).queryByText("프로필이 저장됐어요")).not.toBeInTheDocument();

    // 이름이 같으면 스크린리더에 "알림" 영역이 둘로 잡힌다 — CTA 쪽만 이름을 "화면 알림"으로 갈라야 한다.
    const globalRegion = screen.getByRole("region", { name: "알림" });
    const ctaRegion = screen.getByRole("region", { name: "화면 알림" });
    expect(await within(ctaRegion).findByText("카메라를 전환했어요")).toBeInTheDocument();
    expect(within(globalRegion).queryByText("카메라를 전환했어요")).not.toBeInTheDocument();
  });

  it("알약 배경 폴백이 세션 화면이 주입하는 값과 같다", () => {
    const injected = (sessionSurfaceStyle as Record<string, string>)["--session-toast-bg"];
    expect(TOAST_PILL_CLASS).toContain(`var(--session-toast-bg,${injected.replaceAll(" ", "")})`);
  });

  it("모바일 오프셋의 좌우를 0으로 둬서 알약 폭 보정이 어긋나지 않게 한다", async () => {
    render(
      <>
        <div data-testid="global">
          <Toaster bottom="12px" />
        </div>
        <div data-testid="cta">
          <CtaToaster />
        </div>
      </>,
    );
    await act(async () => {
      showToast("버전을 복사했어요");
      showCtaToast("카메라를 전환했어요");
    });

    const global = screen.getByTestId("global");
    const cta = screen.getByTestId("cta");
    const globalOl = await within(global)
      .findByText("버전을 복사했어요")
      .then(() => global.querySelector("[data-sonner-toaster]"));
    const ctaOl = await within(cta)
      .findByText("카메라를 전환했어요")
      .then(() => cta.querySelector("[data-sonner-toaster]"));

    expect(globalOl).not.toBeNull();
    expect(ctaOl).not.toBeNull();

    expect((globalOl as HTMLElement).style.getPropertyValue("--mobile-offset-left")).toBe("0px");
    expect((globalOl as HTMLElement).style.getPropertyValue("--mobile-offset-right")).toBe("0px");
    expect((globalOl as HTMLElement).style.getPropertyValue("--mobile-offset-bottom")).toBe("12px");

    expect((ctaOl as HTMLElement).style.getPropertyValue("--mobile-offset-left")).toBe("0px");
    expect((ctaOl as HTMLElement).style.getPropertyValue("--mobile-offset-right")).toBe("0px");
    expect((ctaOl as HTMLElement).style.getPropertyValue("--mobile-offset-bottom")).toBe(
      "calc(100% + 12px)",
    );
  });
});

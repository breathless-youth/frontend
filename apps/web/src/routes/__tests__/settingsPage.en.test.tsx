import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import i18n from "@/lib/i18n";
import { SettingsPage } from "@/routes/SettingsPage";
import { TermsPage } from "@/routes/TermsPage";

vi.mock("@/lib/interviewApi", () => ({ getInterviewStatus: vi.fn() }));

const HANGUL = /[가-힣]/;

function renderInRouter(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
function visibleText(container: HTMLElement): string {
  const labels = [...container.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return [container.textContent, ...labels].join("\n");
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage("ko");
});

describe("설정 영어 화면", () => {
  it("영어로 바꾸면 설정 탭에 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    const { container } = renderInRouter(<SettingsPage />);
    // 카메라 권한 토글의 접근성 라벨까지 그려지게 네이티브 응답을 흉내 낸다.
    const receive = (globalThis as unknown as Record<string, (raw: string) => void>)[
      NATIVE_MESSAGE_ENTRY
    ];
    act(() => {
      receive(JSON.stringify({ type: "camera-permission", granted: true, atMs: 1 }));
    });

    expect(visibleText(container)).not.toMatch(HANGUL);
  });

  it("약관 화면은 영어일 때만 한국어 전용 안내를 보인다", async () => {
    const ko = renderInRouter(<TermsPage />);
    expect(
      screen.queryByText("This document is currently available in Korean only."),
    ).not.toBeInTheDocument();
    ko.unmount();

    await i18n.changeLanguage("en");
    renderInRouter(<TermsPage />);
    expect(
      screen.getByText("This document is currently available in Korean only."),
    ).toBeInTheDocument();
  });
});

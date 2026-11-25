import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import { PointsGatewayProvider } from "@/features/points/gateway/PointsGatewayContext";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import type * as Bridge from "@/lib/bridge";

import { PointsAccessoriesPage } from "../PointsAccessoriesPage";
import { PointsPage } from "../PointsPage";
import { PointsPaymentGuidePage } from "../PointsPaymentGuidePage";

vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => true),
}));

const GUIDE_LINES = [
  "쓰지 않은 유료 포인트는 충전한 뒤 7일 안에 환불을 요청할 수 있어요.",
  "쓴 포인트와 포인트로 산 소품·캐릭터는 환불되지 않아요.",
  "7일이 지나도 계정을 삭제하면 남은 유료 포인트를 수수료 10%를 빼고 환불해요.",
  "세트는 입기 전이면 결제한 뒤 7일 안에 환불을 요청할 수 있어요.",
  "한 번 입은 세트는 환불되지 않아요.",
  "스토어(App Store·Google Play)가 환불하면 그만큼 포인트를 회수해요.",
  "그 포인트를 이미 썼다면 잔액이 0 아래로 내려갈 수 있어요.",
  "미성년자가 법정대리인 동의 없이 결제했다면 본인이나 법정대리인이 결제를 취소할 수 있어요.",
];

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderApp(path: string, withGateway = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const routes = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/points" element={<PointsPage />} />
        <Route path="/points/accessories" element={<PointsAccessoriesPage />} />
        <Route path="/points/payment-guide" element={<PointsPaymentGuidePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
  const wrap = (children: ReactNode) =>
    withGateway ? (
      <PointsGatewayProvider gateway={createFakePointsGateway("default")} userId={7}>
        {children}
      </PointsGatewayProvider>
    ) : (
      children
    );
  render(<QueryClientProvider client={client}>{wrap(routes)}</QueryClientProvider>);
}

/** 실제 앱은 BrowserRouter라 앞 화면이 있는지를 window.history.state.idx로 본다. */
function pretendInAppHistory() {
  window.history.replaceState({ idx: 1 }, "");
}

beforeEach(() => {
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
});

afterEach(() => {
  window.history.replaceState(null, "");
});

describe("결제·환불 안내 화면", () => {
  it("소제목 세 개 아래에 환불 규칙 여덟 문장을 나눠 보이고 판매자를 적는다", async () => {
    renderApp("/points/payment-guide");

    expect(await screen.findByRole("heading", { name: "결제·환불 안내" })).toBeInTheDocument();
    const sections = [
      ["충전한 포인트", GUIDE_LINES.slice(0, 3)],
      ["세트", GUIDE_LINES.slice(3, 5)],
      ["스토어 환불과 미성년자", GUIDE_LINES.slice(5)],
    ] as const;
    for (const [title, lines] of sections) {
      const section = screen.getByRole("region", { name: title });
      expect(
        within(section)
          .getAllByRole("listitem")
          .map((li) => li.textContent),
      ).toEqual(lines);
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText("판매자: 포커스메이커스")).toBeInTheDocument();
    // 바로 아래 문의하기가 있어서 문의 안내 문장은 두지 않는다.
    expect(screen.queryByText("환불 요청과 문의는 설정의 문의하기에서 받아요.")).toBeNull();
    // 잔액과 상관없는 안내라 잔액 알약을 그리지 않는다.
    expect(screen.queryByText(/^[\d,]+P$/)).toBeNull();
  });

  it("비회원도 포인트 신원 없이 볼 수 있다", async () => {
    renderApp("/points/payment-guide", false);
    expect(await screen.findByRole("region", { name: "세트" })).toBeInTheDocument();
  });

  it("문의하기는 문의 화면으로, 이용약관 보기는 앱 안 약관 화면으로 간다", async () => {
    renderApp("/points/payment-guide");
    const contact = await screen.findByRole("link", { name: "문의하기" });
    expect(contact).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: "이용약관 보기" })).toHaveAttribute("href", "/terms");

    await userEvent.click(contact);
    expect(screen.getByTestId("where")).toHaveTextContent("/contact");
  });

  it("이용약관 보기를 누르면 약관 화면으로 간다", async () => {
    renderApp("/points/payment-guide");
    await userEvent.click(await screen.findByRole("link", { name: "이용약관 보기" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/terms");
  });
});

describe("결제·환불 안내로 가는 링크와 돌아오기", () => {
  it("받기 탭 충전 칸의 링크로 안내 화면을 열고, 뒤로 가면 받기 탭이 고른 채로 남는다", async () => {
    renderApp("/points?tab=earn");
    await userEvent.click(await screen.findByRole("link", { name: "결제·환불 안내" }));

    expect(await screen.findByRole("region", { name: "충전한 포인트" })).toBeInTheDocument();
    pretendInAppHistory();
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(await screen.findByRole("tab", { name: "포인트 받기" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("link", { name: "결제·환불 안내" })).toBeInTheDocument();
  });

  it("세트 결제 버튼 위 링크로 안내 화면을 열고, 뒤로 가면 보던 마스코트·세트 칸·세트가 남는다", async () => {
    renderApp("/points/accessories");
    await userEvent.click(await screen.findByRole("button", { name: "세트" }));
    const guide = screen.getByRole("link", { name: "결제·환불 안내" });
    const buy = screen.getByRole("button", { name: /구매하기/ });
    expect(guide.compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(guide);
    expect(await screen.findByRole("region", { name: "세트" })).toBeInTheDocument();
    pretendInAppHistory();
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(await screen.findByRole("button", { name: "세트" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /비 오는 날 세트/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "타이미, 고른 캐릭터" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type * as UserId from "@/lib/userId";

import { PremiumFakeDoorHost } from "../PremiumFakeDoorHost";
import { assignPremiumPrice } from "../premiumFakeDoor";

const putPremiumWaitlist = vi.hoisted(() => vi.fn());
vi.mock("../premiumWaitlistApi", () => ({ putPremiumWaitlist }));
const getProfile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/profileApi", () => ({ getProfile }));
const tokenSource = vi.hoisted(() => ({ present: true }));
vi.mock("@/lib/userId", async (o) => ({
  ...(await o<typeof UserId>()),
  hasTokenSource: () => tokenSource.present,
}));
const analytics = vi.hoisted(() => ({
  trackPremiumFakeDoor: vi.fn(),
  trackPremiumFakeDoorApplied: vi.fn(),
  trackPremiumFakeDoorFeatureSelected: vi.fn(),
  trackPremiumFakeDoorFeatureViewed: vi.fn(),
  trackPremiumFakeDoorApplyClicked: vi.fn(),
  setPremiumFakeDoorPriceUserProperty: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));

const USER_ID = 7;
const PRICE = assignPremiumPrice(USER_ID);

function renderHost() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PremiumFakeDoorHost userId={USER_ID} />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

async function openApplyFlow() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "프리미엄 기능 사전 신청 보기" }));
  await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
  return user;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-25T12:00:00+09:00") });
  localStorage.clear();
  tokenSource.present = true;
  putPremiumWaitlist.mockResolvedValue(undefined);
  getProfile.mockResolvedValue({ nickname: "민준" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("PremiumFakeDoorHost 14세 확인", () => {
  it("체크하지 않으면 이메일 없이 ageOver14=false로 신청하고 완료로 간다", async () => {
    renderHost();
    const user = await openApplyFlow();

    await user.click(screen.getByRole("button", { name: "앱 알림으로 신청하기" }));

    expect(putPremiumWaitlist).toHaveBeenCalledTimes(1);
    expect(putPremiumWaitlist).toHaveBeenCalledWith({
      price: PRICE,
      placement: "RESULT",
      ageOver14: false,
      email: null,
      expectedFeature: null,
    });
    expect(await screen.findByText("출시되면 앱에서 알려드릴게요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
    // 완료 화면에는 결제 안내를 두지 않는다.
    expect(screen.queryByText(/자동 결제되지 않아요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/출시 후 직접 구독할 때만 결제돼요/)).not.toBeInTheDocument();
  });
});

async function goToEmailStep() {
  const user = await openApplyFlow();
  await user.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
  await user.click(screen.getByRole("button", { name: "다음" }));
  return user;
}

describe("PremiumFakeDoorHost 14세 확인 되돌리기", () => {
  it("이메일을 적었다가 돌아가 체크를 풀면 이메일을 싣지 않는다", async () => {
    renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));
    await user.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
    await user.click(screen.getByRole("button", { name: "앱 알림으로 신청하기" }));

    expect(putPremiumWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ ageOver14: false, email: null }),
    );
  });
});

describe("PremiumFakeDoorHost 이메일 검사", () => {
  it("이메일 칸은 비어 있고, 빈 값이면 보내지 않고 입력칸 아래에 알린다", async () => {
    renderHost();
    const user = await goToEmailStep();

    expect(screen.getByLabelText("이메일")).toHaveValue("");
    await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(screen.getByText("이메일을 입력해 주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toHaveAttribute("aria-invalid", "true");
    expect(putPremiumWaitlist).not.toHaveBeenCalled();
  });

  it("형식이 틀리면 보내지 않는다", async () => {
    renderHost();
    const user = await goToEmailStep();

    await user.type(screen.getByLabelText("이메일"), "minjun@mail");
    await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(screen.getByText("이메일 형식을 확인해 주세요.")).toBeInTheDocument();
    expect(putPremiumWaitlist).not.toHaveBeenCalled();
  });

  it("동의하지 않으면 보내지 않고, 동의하면 이메일과 함께 신청한다", async () => {
    renderHost();
    const user = await goToEmailStep();

    await user.type(screen.getByLabelText("이메일"), " minjun@example.com ");
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    expect(screen.getByText("개인정보 수집·이용에 동의해야 신청할 수 있어요.")).toBeInTheDocument();
    expect(putPremiumWaitlist).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(putPremiumWaitlist).toHaveBeenCalledWith({
      price: PRICE,
      placement: "RESULT",
      ageOver14: true,
      email: "minjun@example.com",
      expectedFeature: null,
    });
    expect(await screen.findByText("민준님, 사전 신청이 끝났어요")).toBeInTheDocument();
    expect(screen.getByText("알림은 minjun@example.com로 보내드려요.")).toBeInTheDocument();
  });

  it("서버가 실패하면 입력칸 아래에 알리고, 다시 누르면 다시 보낸다", async () => {
    putPremiumWaitlist.mockRejectedValueOnce(new Error("500"));
    renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));

    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    expect(await screen.findByText("신청하지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoorApplied).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    expect(await screen.findByText("민준님, 사전 신청이 끝났어요")).toBeInTheDocument();
    expect(putPremiumWaitlist).toHaveBeenCalledTimes(2);
  });

  it("응답을 기다리는 동안 다시 눌러도 한 번만 보낸다", async () => {
    let resolve: () => void = () => {};
    putPremiumWaitlist.mockImplementationOnce(() => new Promise<void>((r) => (resolve = r)));
    renderHost();
    const user = await openApplyFlow();
    const button = screen.getByRole("button", { name: "앱 알림으로 신청하기" });

    await user.click(button);
    await user.click(button);
    expect(button).toBeDisabled();
    resolve();

    expect(await screen.findByText("출시되면 앱에서 알려드릴게요.")).toBeInTheDocument();
    expect(putPremiumWaitlist).toHaveBeenCalledTimes(1);
  });
});

describe("PremiumFakeDoorHost 기대 기능", () => {
  it("기능을 고르면 같은 본문에 expectedFeature를 채워 한 번 더 보내고, 결과로 돌아가면 카드를 다시 그리지 않는다", async () => {
    const view = renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(await screen.findByRole("radio", { name: "강력한 앱 잠금" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "맞춤 알림" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "강력한 앱 잠금" }));

    expect(putPremiumWaitlist).toHaveBeenLastCalledWith({
      price: PRICE,
      placement: "RESULT",
      ageOver14: true,
      email: "minjun@example.com",
      expectedFeature: "APP_LOCK",
    });
    expect(await screen.findByText("답변해 주셔서 감사합니다!")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "강력한 앱 잠금" })).toBeChecked();
    expect(analytics.trackPremiumFakeDoorFeatureSelected).toHaveBeenCalledWith(
      { price: PRICE, placement: "RESULT" },
      "APP_LOCK",
    );
    expect(screen.queryByRole("button", { name: "홈으로 돌아가기" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "결과로 돌아가기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "프리미엄 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();

    view.unmount();
    renderHost();
    expect(
      screen.queryByRole("button", { name: "프리미엄 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();
  });

  it("기능 저장이 실패하면 기능 선택 이벤트를 보내지 않는다", async () => {
    renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    const radio = await screen.findByRole("radio", { name: "AI 집중 리포트" });
    putPremiumWaitlist.mockRejectedValueOnce(new Error("network"));

    await user.click(radio);

    await waitFor(() => expect(putPremiumWaitlist).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(radio).toBeEnabled());
    expect(analytics.trackPremiumFakeDoorFeatureSelected).not.toHaveBeenCalled();

    // 실패한 선택은 풀어 둬야 같은 기능을 다시 눌러 재시도할 수 있다.
    expect(radio).not.toBeChecked();
    await user.click(radio);
    await waitFor(() => expect(putPremiumWaitlist).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("답변해 주셔서 감사합니다!")).toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoorFeatureSelected).toHaveBeenCalledTimes(1);
  });
});

describe("PremiumFakeDoorHost 노출", () => {
  it("토큰 출처가 없는 구 앱에는 카드를 그리지 않는다", () => {
    tokenSource.present = false;
    renderHost();
    expect(
      screen.queryByRole("button", { name: "프리미엄 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoor).not.toHaveBeenCalled();
  });

  it("X로 닫으면 다시 그리지 않는다", async () => {
    const user = userEvent.setup();
    const first = renderHost();
    await user.click(screen.getByRole("button", { name: "프리미엄 기능 안내 닫기" }));
    expect(
      screen.queryByRole("button", { name: "프리미엄 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();

    first.unmount();
    renderHost();
    expect(
      screen.queryByRole("button", { name: "프리미엄 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoor).toHaveBeenCalledWith("dismissed", {
      price: PRICE,
      placement: "RESULT",
    });
  });

  it("카드 노출(viewed)은 다시 그려도 사용자당 한 번만 보내고 가격을 사용자 속성으로 남긴다", () => {
    renderHost().unmount();
    renderHost();

    const viewed = analytics.trackPremiumFakeDoor.mock.calls.filter(
      ([action]) => action === "viewed",
    );
    expect(viewed).toEqual([["viewed", { price: PRICE, placement: "RESULT" }]]);
    expect(analytics.setPremiumFakeDoorPriceUserProperty).toHaveBeenCalledTimes(1);
    expect(analytics.setPremiumFakeDoorPriceUserProperty).toHaveBeenCalledWith(PRICE);
  });

  it("신청부터 기능 선택까지 어떤 분석 이벤트에도 이메일이 실리지 않는다", async () => {
    renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "secret.person@example.com");
    await user.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    await user.click(await screen.findByRole("radio", { name: "강력한 앱 잠금" }));
    await waitFor(() => expect(screen.getByText("답변해 주셔서 감사합니다!")).toBeInTheDocument());

    expect(analytics.trackPremiumFakeDoorApplied).toHaveBeenCalledWith(
      { price: PRICE, placement: "RESULT" },
      "over14",
    );
    const sent = JSON.stringify(Object.values(analytics).map((fn) => fn.mock.calls));
    expect(sent).not.toContain("secret.person");
    expect(sent).not.toContain("example.com");
    expect(analytics.trackPremiumFakeDoor.mock.calls.map(([action]) => action)).toEqual([
      "viewed",
      "opened",
    ]);
  });
});

describe("PremiumFakeDoorHost 기능 설명 시트", () => {
  async function openBenefits() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "프리미엄 기능 사전 신청 보기" }));
    return user;
  }

  it("타일을 누르면 그 기능의 설명 창을 열고 feature_viewed를 보내며, 닫으면 혜택 화면에 남는다", async () => {
    renderHost();
    const user = await openBenefits();
    // 결제 안내는 혜택 화면과 설명 시트 모두 한 문장뿐이다.
    expect(screen.getByText("사전 신청으로 자동 결제되지 않아요.")).toBeInTheDocument();
    expect(screen.queryByText(/출시 후 직접 구독할 때만 결제돼요/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /AI 플랜 비서/ }));

    const sheet = await screen.findByRole("dialog", { name: "AI 플랜 비서" });
    expect(
      within(sheet).getByText("목표와 기간만 정하면 진도는 비서가 짜줘요"),
    ).toBeInTheDocument();
    expect(within(sheet).getByText("출시 준비 중")).toBeInTheDocument();
    expect(within(sheet).getByText("사전 신청으로 자동 결제되지 않아요.")).toBeInTheDocument();
    expect(within(sheet).queryByText(/출시 후 직접 구독할 때만 결제돼요/)).not.toBeInTheDocument();
    // 설명은 두 줄로 나뉜다.
    expect(
      within(sheet).getByText(
        "목표 시험과 남은 기간, 공부할 범위를 알려주면 하루에 어디까지 하면 되는지 진도율과 학습 범위를 추천해줘요.",
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText("내 목표와 공부 속도에 맞춰 계획을 계속 다듬어줘요."),
    ).toBeInTheDocument();
    expect(
      within(sheet)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "목표와 기간에 맞춰 하루 학습 범위와 진도율을 추천해줘요",
      "하루를 놓쳐도 남은 날에 맞춰 계획을 다시 짜줘요",
      "계획한 시작 시간과 남은 할 일을 딱 맞춰 알려줘요",
    ]);
    expect(analytics.trackPremiumFakeDoorFeatureViewed).toHaveBeenCalledWith(
      { price: PRICE, placement: "RESULT" },
      "AI_PLANNER",
    );

    await user.click(within(sheet).getByRole("button", { name: "닫기" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "AI 플랜 비서" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "프리미엄 기능" })).toBeInTheDocument();

    // 맞춤 알림은 빠지고 그 자리에 강력한 앱 잠금이 들어왔다.
    expect(screen.queryByRole("button", { name: /맞춤 알림/ })).not.toBeInTheDocument();
    const tiles = screen
      .getAllByRole("button")
      .filter((tile) => tile.getAttribute("aria-haspopup") === "dialog")
      .map((tile) => tile.textContent);
    expect(tiles).toEqual([
      "AI 플랜 비서",
      "AI 집중 리포트",
      "그룹 공부 맞춤 매칭",
      "강력한 앱 잠금",
      "프리미엄 타이머 배경",
      "캐릭터 소품 착용세트 상품 제외",
    ]);
    await user.click(screen.getByRole("button", { name: /강력한 앱 잠금/ }));
    const appLock = await screen.findByRole("dialog", { name: "강력한 앱 잠금" });
    expect(within(appLock).getByText("잠금 풀기, 이제 쉽지 않아요")).toBeInTheDocument();
    expect(
      within(appLock)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "잠금을 풀려면 문제 풀기·사진 찍기 같은 미션을 끝내야 해요",
      "정해 둔 공부 시간이 되면 잠금이 저절로 켜져요",
      "공부가 끝날 때까지 잠금을 끌 수 없게 설정할 수 있어요",
    ]);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "강력한 앱 잠금" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "프리미엄 기능" })).toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoorFeatureViewed).toHaveBeenLastCalledWith(
      { price: PRICE, placement: "RESULT" },
      "APP_LOCK",
    );
  });

  it.each([
    ["캐릭터 소품 착용", "캐릭터 소품을 골라 캐릭터에 입혀요.", "원할 때마다 바꿔 입을 수 있어요."],
    [
      "프리미엄 타이머 배경",
      "프리미엄 전용 배경으로 공부 타이머 화면을 꾸며요.",
      "그날 기분에 맞는 배경을 골라 공부를 시작해요.",
    ],
    [
      "AI 집중 리포트",
      "매주 내 공부를 돌아보는 리포트를 받아요.",
      "잘 된 시간은 늘리고 끊긴 시간은 줄이는 다음 주 계획까지 함께 알려줘요.",
    ],
    [
      "강력한 앱 잠금",
      "공부하는 동안 방해 앱을 잠그고, 일찍 풀려면 미션을 끝내야 해요.",
      "무심코 휴대폰을 집어도 다시 공부로 돌아오게 도와줘요.",
    ],
    [
      "그룹 공부 맞춤 매칭",
      "내 목표와 공부 시간대에 맞는 사람을 찾아줘요.",
      "같은 목표인 사람들과 자극 받으며 공부할 수 있어요.",
    ],
  ])("%s 설명은 문장마다 줄을 나눠 보인다", async (name, first, second) => {
    renderHost();
    const user = await openBenefits();
    await user.click(screen.getByRole("button", { name: new RegExp(name) }));
    const sheet = await screen.findByRole("dialog", { name });

    expect(within(sheet).getByText(first)).toBeInTheDocument();
    expect(within(sheet).getByText(second)).toBeInTheDocument();
  });

  it("그룹 매칭 시트는 시간대 연결과 버튼 한 번 참여를 체크 항목으로 보인다", async () => {
    renderHost();
    const user = await openBenefits();
    await user.click(screen.getByRole("button", { name: /그룹 공부 맞춤 매칭/ }));
    const sheet = await screen.findByRole("dialog", { name: "그룹 공부 맞춤 매칭" });

    const items = within(sheet)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "토익·공무원·수능처럼 목표를 고르면 맞는 방으로 연결해줘요",
      "아침·밤처럼 내가 주로 공부하는 시간대의 사람과 이어줘요",
      "방을 찾거나 만들 필요 없이 버튼 한 번이면 같이 공부해요",
    ]);
  });

  it("집중 리포트 시트의 첫 체크 항목은 요일·시간대별 집중을 말한다", async () => {
    renderHost();
    const user = await openBenefits();
    await user.click(screen.getByRole("button", { name: /AI 집중 리포트/ }));
    const sheet = await screen.findByRole("dialog", { name: "AI 집중 리포트" });

    expect(within(sheet).getAllByRole("listitem")[0]).toHaveTextContent(
      "요일·시간대별로 집중이 가장 잘 된 때를 한눈에 보여줘요",
    );
  });

  it("설명 창의 사전 신청하기는 나이 확인으로 가고 from=sheet를 보낸다", async () => {
    renderHost();
    const user = await openBenefits();
    await user.click(screen.getByRole("button", { name: /AI 집중 리포트/ }));
    const sheet = await screen.findByRole("dialog", { name: "AI 집중 리포트" });

    await user.click(within(sheet).getByRole("button", { name: "사전 신청하기" }));

    expect(await screen.findByText("만 14세 이상인가요?")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "AI 집중 리포트" })).not.toBeInTheDocument(),
    );
    expect(analytics.trackPremiumFakeDoorApplyClicked).toHaveBeenCalledWith(
      { price: PRICE, placement: "RESULT" },
      "sheet",
    );
  });

  it("혜택 화면의 사전 신청하기는 from=benefits를 보낸다", async () => {
    renderHost();
    await openApplyFlow();
    expect(analytics.trackPremiumFakeDoorApplyClicked).toHaveBeenCalledWith(
      { price: PRICE, placement: "RESULT" },
      "benefits",
    );
  });
});

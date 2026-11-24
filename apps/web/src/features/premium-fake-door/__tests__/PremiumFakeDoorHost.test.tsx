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
  await user.click(screen.getByRole("button", { name: "스파르타 기능 사전 신청 보기" }));
  await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
  return user;
}

beforeEach(() => {
  // 혜택 화면의 불꽃 캔버스가 그리기 판을 찾는다. jsdom에는 없어서 없는 것으로 둔다.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-25T12:00:00+09:00") });
  localStorage.clear();
  tokenSource.present = true;
  putPremiumWaitlist.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("PremiumFakeDoorHost 14세 확인", () => {
  it("사전 신청하기는 바로 이메일 화면으로 가고, 만 14세 확인은 필수 동의 체크 칸에 들어 있다", async () => {
    renderHost();
    await openApplyFlow();

    expect(screen.getByText("출시 소식을 받을 이메일을 알려주세요.")).toBeInTheDocument();
    expect(screen.queryByText("만 14세 이상인가요?")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "만 14세 이상이에요" })).not.toBeInTheDocument();
    expect(screen.queryByText("1/2")).not.toBeInTheDocument();
    expect(screen.queryByText("2/2")).not.toBeInTheDocument();
    // 만 14세 확인은 동의 체크 칸 하나에 합쳤다. 버튼 위 안내 줄은 없고 결제 안내만 남는다.
    expect(
      screen.queryByText("신청하면 만 14세 이상임을 확인한 것으로 봐요."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("사전 신청으로 자동 결제되지 않아요.")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    ).not.toBeChecked();
    // 만 14세 미만 따로 신청하는 길은 없다. 신청은 이메일 제출 하나뿐이다.
    expect(screen.queryByRole("button", { name: /만 14세 미만/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/앱 알림으로 신청/)).not.toBeInTheDocument();
  });
});

/** 이제 사전 신청하기를 누르면 바로 이메일 화면이다. */
const goToEmailStep = openApplyFlow;

describe("PremiumFakeDoorHost 이메일 검사", () => {
  it("이메일 칸은 비어 있고, 빈 값이면 보내지 않고 입력칸 아래에 알린다", async () => {
    renderHost();
    const user = await goToEmailStep();

    expect(screen.getByLabelText("이메일")).toHaveValue("");
    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(screen.getByText("이메일을 입력해 주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toHaveAttribute("aria-invalid", "true");
    expect(putPremiumWaitlist).not.toHaveBeenCalled();
  });

  it("형식이 틀리면 보내지 않는다", async () => {
    renderHost();
    const user = await goToEmailStep();

    await user.type(screen.getByLabelText("이메일"), "minjun@mail");
    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(screen.getByText("이메일 형식을 확인해 주세요.")).toBeInTheDocument();
    expect(putPremiumWaitlist).not.toHaveBeenCalled();
  });

  it("동의하지 않으면 보내지 않고, 동의하면 이메일과 함께 신청한다", async () => {
    renderHost();
    const user = await goToEmailStep();

    await user.type(screen.getByLabelText("이메일"), " minjun@example.com ");
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    expect(
      screen.getByText("만 14세 이상이고 개인정보 수집·이용에 동의해야 신청할 수 있어요."),
    ).toBeInTheDocument();
    expect(putPremiumWaitlist).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(putPremiumWaitlist).toHaveBeenCalledWith({
      price: PRICE,
      placement: "RESULT",
      ageOver14: true,
      email: "minjun@example.com",
      expectedFeature: null,
    });
    expect(await screen.findByText("가장 먼저 알려드릴게요")).toBeInTheDocument();
    expect(screen.getByText("알림은 minjun@example.com와 앱으로 보내드려요.")).toBeInTheDocument();
    expect(screen.getByText("사전 신청 완료")).toBeInTheDocument();
    // 닉네임은 더 보이지 않는다.
    expect(screen.queryByText(/님,/)).not.toBeInTheDocument();
    // 완료 화면에는 결제 안내를 두지 않는다.
    expect(screen.queryByText(/자동 결제되지 않아요/)).not.toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoorApplied).toHaveBeenCalledWith(
      { price: PRICE, placement: "RESULT" },
      "over14",
    );
  });

  it("서버가 실패하면 입력칸 아래에 알리고, 다시 누르면 다시 보낸다", async () => {
    putPremiumWaitlist.mockRejectedValueOnce(new Error("500"));
    renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );

    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    expect(await screen.findByText("신청하지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoorApplied).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    expect(await screen.findByText("가장 먼저 알려드릴게요")).toBeInTheDocument();
    expect(putPremiumWaitlist).toHaveBeenCalledTimes(2);
  });

  it("응답을 기다리는 동안 다시 눌러도 한 번만 보낸다", async () => {
    let resolve: () => void = () => {};
    putPremiumWaitlist.mockImplementationOnce(() => new Promise<void>((r) => (resolve = r)));
    renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );
    const button = screen.getByRole("button", { name: "사전 신청하기" });

    await user.click(button);
    await user.click(button);
    expect(button).toBeDisabled();
    resolve();

    expect(await screen.findByText("가장 먼저 알려드릴게요")).toBeInTheDocument();
    expect(putPremiumWaitlist).toHaveBeenCalledTimes(1);
  });
});

describe("PremiumFakeDoorHost 기대 기능", () => {
  it("기능을 고르면 같은 본문에 expectedFeature를 채워 한 번 더 보내고, 결과로 돌아가면 카드를 다시 그리지 않는다", async () => {
    const view = renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));

    expect(await screen.findByRole("radio", { name: "전화 알림" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "맞춤 알림" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "강력한 앱 잠금" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "전화 알림" }));

    expect(putPremiumWaitlist).toHaveBeenLastCalledWith({
      price: PRICE,
      placement: "RESULT",
      ageOver14: true,
      email: "minjun@example.com",
      expectedFeature: "PHONE_CALL",
    });
    expect(await screen.findByText("답변해 주셔서 감사합니다!")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "전화 알림" })).toBeChecked();
    expect(analytics.trackPremiumFakeDoorFeatureSelected).toHaveBeenCalledWith(
      { price: PRICE, placement: "RESULT" },
      "PHONE_CALL",
    );
    expect(screen.queryByRole("button", { name: "홈으로 돌아가기" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "결과로 돌아가기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "스파르타 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();

    view.unmount();
    renderHost();
    expect(
      screen.queryByRole("button", { name: "스파르타 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();
  });

  it("기능 저장이 실패하면 기능 선택 이벤트를 보내지 않는다", async () => {
    renderHost();
    const user = await goToEmailStep();
    await user.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );
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
      screen.queryByRole("button", { name: "스파르타 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoor).not.toHaveBeenCalled();
  });

  it("X로 닫으면 다시 그리지 않는다", async () => {
    const user = userEvent.setup();
    const first = renderHost();
    await user.click(screen.getByRole("button", { name: "스파르타 기능 안내 닫기" }));
    expect(
      screen.queryByRole("button", { name: "스파르타 기능 사전 신청 보기" }),
    ).not.toBeInTheDocument();

    first.unmount();
    renderHost();
    expect(
      screen.queryByRole("button", { name: "스파르타 기능 사전 신청 보기" }),
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
    await user.click(
      screen.getByRole("checkbox", {
        name: "[필수] 만 14세 이상이며, 개인정보 수집·이용에 동의해요",
      }),
    );
    await user.click(screen.getByRole("button", { name: "사전 신청하기" }));
    await user.click(await screen.findByRole("radio", { name: "전화 알림" }));
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
    await user.click(screen.getByRole("button", { name: "스파르타 기능 사전 신청 보기" }));
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
    expect(screen.getByRole("heading", { name: "스파르타 기능" })).toBeInTheDocument();

    // 4번째 자리는 전화 알림이다. 맞춤 알림과 강력한 앱 잠금은 화면에 없다.
    expect(screen.queryByRole("button", { name: /맞춤 알림/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /강력한 앱 잠금/ })).not.toBeInTheDocument();
    // 타일은 그림, 이름, 아래 작은 줄(보조 표기가 있으면 그것, 없으면 후킹 문구) 순서다.
    const tiles = screen
      .getAllByRole("button")
      .filter((tile) => tile.getAttribute("aria-haspopup") === "dialog")
      .map((tile) => tile.textContent);
    expect(tiles).toEqual([
      "AI 플랜 비서목표와 기간만 정하면 진도는 비서가 짜줘요",
      "AI 집중 리포트오래 앉아 있었는데 남은 게 없을 때",
      "그룹 공부 맞춤 매칭혼자 하면 자꾸 늘어질 때",
      "전화 알림미루는 순간, 전화가 울려요",
      "프리미엄 타이머 배경오래 앉아 있고 싶은 화면 만들기",
      "캐릭터 소품 무제한세트 상품 제외",
    ]);
    await user.click(screen.getByRole("button", { name: /전화 알림/ }));
    const phoneCall = await screen.findByRole("dialog", { name: "전화 알림" });
    expect(within(phoneCall).getByText("미루는 순간, 전화가 울려요")).toBeInTheDocument();
    expect(
      within(phoneCall)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "계획한 시작 시간에 전화가 와서 공부를 시작하게 해줘요",
      "받지 않으면 몇 분 뒤 다시 걸어줘요",
      "전화를 받으면 오늘 할 일을 바로 알려줘요",
    ]);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "전화 알림" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "스파르타 기능" })).toBeInTheDocument();
    expect(analytics.trackPremiumFakeDoorFeatureViewed).toHaveBeenLastCalledWith(
      { price: PRICE, placement: "RESULT" },
      "PHONE_CALL",
    );
  });

  it.each([
    [
      "캐릭터 소품 무제한",
      "캐릭터 소품을 골라 캐릭터에 입혀요.",
      "원할 때마다 바꿔 입을 수 있어요.",
    ],
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
      "전화 알림",
      "계획한 공부 시간이 되면 알림 대신 전화로 불러줘요.",
      "알림은 쉽게 넘기지만, 전화는 받게 되니까 바로 책상에 앉게 돼요.",
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

  it("설명 창의 사전 신청하기는 이메일 화면으로 가고 from=sheet를 보낸다", async () => {
    renderHost();
    const user = await openBenefits();
    await user.click(screen.getByRole("button", { name: /AI 집중 리포트/ }));
    const sheet = await screen.findByRole("dialog", { name: "AI 집중 리포트" });

    await user.click(within(sheet).getByRole("button", { name: "사전 신청하기" }));

    expect(await screen.findByText("출시 소식을 받을 이메일을 알려주세요.")).toBeInTheDocument();
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

describe("PremiumFakeDoorHost R2 혜택 화면", () => {
  it("신청 화면과 설명 시트는 다크로 그리고, 결과 화면의 진입 카드는 사용자 테마를 따른다", async () => {
    renderHost();
    const card = screen.getByRole("button", { name: "스파르타 기능 사전 신청 보기" });
    expect(card.closest(".theme-dark")).toBeNull();

    const user = userEvent.setup();
    await user.click(card);
    const flow = screen.getByRole("dialog", { name: "스파르타 기능" });
    expect(flow).toHaveClass("theme-dark");

    await user.click(screen.getByRole("button", { name: /전화 알림/ }));
    const sheet = await screen.findByRole("dialog", { name: "전화 알림" });
    expect(sheet.closest(".theme-dark")).not.toBeNull();
  });

  it("실제 기록 카드와 가격 카드를 보이고, 예전 안내 줄은 없다", async () => {
    renderHost();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "스파르타 기능 사전 신청 보기" }));

    for (const text of [
      "공부를 끝까지 하게 만드는",
      "눌러서 자세히 보기",
      "스파르타 기능 6가지",
      "포커스 메이커스 실제 기록",
      "의지만으로는",
      "부족했던 순간들",
      "공부 흐름이 끊긴 순간",
      "71,000번+",
      "앉아 있었지만 공부가 멈춘 횟수",
      "970시간+",
      "'잠깐만' 쉬다 흘러간 시간",
      "280시간+",
      "공부 중 흐트러진 시간",
      "이 시간을 공부로 돌려놓는 게",
      "2026년 8월~11월 포커스 메이커스 앱 기록",
      "스파르타 기능 6가지 모두",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText(`월 ${PRICE.toLocaleString("ko-KR")}원`)).toBeInTheDocument();
    expect(screen.getByText(`하루 약 ${PRICE === 2900 ? 97 : 197}원`)).toBeInTheDocument();
    expect(screen.queryByText("기능을 누르면 자세한 설명을 볼 수 있어요.")).not.toBeInTheDocument();
  });
});

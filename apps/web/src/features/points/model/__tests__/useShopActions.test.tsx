import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { pointsKeys } from "@/lib/pointsQueries";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import { useShopActions } from "../useShopActions";

const USER_ID = 7;

function setup(member = true) {
  const client = new QueryClient();
  client.setQueryData(pointsKeys.look(USER_ID), null);
  const gateway = createFakePointsGateway("default");
  const requestLogin = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <PointsGatewayProvider
        gateway={gateway}
        userId={USER_ID}
        member={member}
        requestLogin={requestLogin}
      >
        {children}
      </PointsGatewayProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useShopActions(), { wrapper });
  const lookIsStale = () => client.getQueryState(pointsKeys.look(USER_ID))?.isInvalidated;
  return { actions: result.current, lookIsStale, gateway, requestLogin };
}

describe("useShopActions", () => {
  it("마스코트를 바꾸면 다른 화면이 읽는 내 모습도 다시 받게 한다", async () => {
    const { actions, lookIsStale } = setup();

    await actions.selectMascot("book");

    expect(lookIsStale()).toBe(true);
  });

  it("소품을 벗으면 내 모습도 다시 받게 한다", async () => {
    const { actions, lookIsStale } = setup();

    await actions.equipAccessory("stopwatch", "head", null);

    expect(lookIsStale()).toBe(true);
  });

  it.each([
    ["마스코트 고르기", (a: ReturnType<typeof setup>["actions"]) => a.selectMascot("book")],
    [
      "소품 착용",
      (a: ReturnType<typeof setup>["actions"]) => a.equipAccessory("stopwatch", "head", null),
    ],
    ["타이머 배경 적용", (a: ReturnType<typeof setup>["actions"]) => a.setTimerBackground(null)],
  ])("비회원의 %s는 서버에 보내지 않고 로그인 화면을 연다", async (_, act) => {
    const { actions, gateway, requestLogin } = setup(false);
    const calls = [
      vi.spyOn(gateway, "selectMascot"),
      vi.spyOn(gateway, "equipAccessory"),
      vi.spyOn(gateway, "setTimerBackground"),
    ];

    await act(actions);

    expect(requestLogin).toHaveBeenCalledOnce();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it("비회원이 받기·광고·충전을 누르면 문이 로그인 화면을 열고 막는다", () => {
    const guest = setup(false);
    expect(guest.actions.allowMemberAction()).toBe(false);
    expect(guest.requestLogin).toHaveBeenCalledOnce();

    const member = setup(true);
    expect(member.actions.allowMemberAction()).toBe(true);
    expect(member.requestLogin).not.toHaveBeenCalled();
  });

  it("서버가 받기를 회원 전용이라고 거절하면 로그인 화면을 열고 오류를 그대로 던진다", async () => {
    const { actions, gateway, requestLogin } = setup();
    const refused = new ApiError("member only", 403, "MEMBER_ONLY");
    vi.spyOn(gateway, "claim").mockRejectedValue(refused);

    await expect(actions.claim("attendance")).rejects.toBe(refused);
    expect(requestLogin).toHaveBeenCalledOnce();
  });
});

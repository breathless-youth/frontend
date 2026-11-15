import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { pointsKeys } from "@/lib/pointsQueries";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import { useShopActions } from "../useShopActions";

const USER_ID = 7;

function setup() {
  const client = new QueryClient();
  client.setQueryData(pointsKeys.look(USER_ID), null);
  const gateway = createFakePointsGateway("default");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={USER_ID}>
        {children}
      </PointsGatewayProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useShopActions(), { wrapper });
  const lookIsStale = () => client.getQueryState(pointsKeys.look(USER_ID))?.isInvalidated;
  return { actions: result.current, lookIsStale };
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
});

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import i18n from "@/lib/i18n";
import { balanceQuery, pointsKeys } from "@/lib/pointsQueries";
import { showToast } from "@/lib/toast";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { AdResult, ChargeResult, ShopItem } from "../types";

export type PurchaseStep = "idle" | "confirm" | "insufficient" | "pending" | "done";

/**
 * 상품 하나를 사는 흐름
 *
 * 연 순간의 잔액으로 확인 창과 모자람 창을 고르지만, 살 수 있는지는 경계의 답으로 정한다.
 * 확인을 빠르게 두 번 눌러도 요청은 한 번만 나가게 ref로 막는다.
 * 비활성 표시는 다음 렌더에 붙어서 같은 순간의 두 번째 누름은 막지 못한다.
 * 산 뒤의 잔액은 경계가 돌려준 값으로 덮고, 보유 상태와 기록은 다시 받는다.
 * 모자람 창에서 충전하면 이어서 같은 상품을 사서, 충전하고 다시 구매 버튼을 찾는 일을 없앤다.
 * 광고는 받는 양이 작아 다 채울지 알 수 없으므로 잔액만 채우고 창을 닫는다.
 */
export function usePurchaseFlow(item: ShopItem | null) {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const queryClient = useQueryClient();
  const balance = useQuery(balanceQuery(gateway, userId)).data;
  const [step, setStep] = useState<PurchaseStep>("idle");
  const [paidBalance, setPaidBalance] = useState<number | null>(null);
  const inFlightRef = useRef(false);

  const price = item?.acquire.type === "price" ? item.acquire.price : null;

  function open() {
    if (item === null || price === null || item.owned) {
      return;
    }
    setPaidBalance(null);
    setStep(balance !== undefined && balance < price ? "insufficient" : "confirm");
  }

  async function confirm() {
    if (item === null || inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setStep("pending");
    try {
      const result = await gateway.purchase(item.id);
      if (result.ok) {
        queryClient.setQueryData(pointsKeys.balance(userId), result.balance);
        setPaidBalance(result.balance);
        setStep("done");
      } else if (result.reason === "insufficient") {
        setStep("insufficient");
        void queryClient.invalidateQueries({ queryKey: pointsKeys.balance(userId) });
      } else {
        setStep("idle");
      }
      void queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) });
      void queryClient.invalidateQueries({ queryKey: [...pointsKeys.user(userId), "history"] });
    } catch {
      setStep("confirm");
      showToast(i18n.t("common:errors.retryLater"));
    } finally {
      inFlightRef.current = false;
    }
  }

  function close() {
    setStep("idle");
  }

  async function chargeAndBuy(charge: () => Promise<ChargeResult>) {
    let result: ChargeResult;
    try {
      result = await charge();
    } catch {
      showToast(i18n.t("common:errors.retryLater"));
      return;
    }
    if (result.status === "completed") {
      await confirm();
    } else {
      showToast(i18n.t("points-earn:failed.title"));
    }
  }

  async function watchAdForPoints(watchAd: () => Promise<AdResult>) {
    try {
      const result = await watchAd();
      if (result.status === "rewarded") {
        setStep("idle");
      } else if (result.status === "unavailable") {
        showToast(i18n.t("points-earn:adUnavailable.title"));
      }
    } catch {
      showToast(i18n.t("common:errors.retryLater"));
    }
  }

  const balanceAfter =
    step === "done"
      ? paidBalance
      : balance !== undefined && price !== null
        ? balance - price
        : null;

  return { step, open, confirm, close, chargeAndBuy, watchAdForPoints, balanceAfter };
}

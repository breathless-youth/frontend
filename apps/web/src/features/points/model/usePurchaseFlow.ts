import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { trackPointsPurchase } from "@/lib/amplitude";
import i18n from "@/lib/i18n";
import { balanceQuery, pointsKeys } from "@/lib/pointsQueries";
import { showToast } from "@/lib/toast";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { AdResult, ChargeResult, PurchaseResult, ShopItem } from "../types";
import { isMemberOnlyError } from "../gateway/memberOnly";
import { useMemberOnly } from "./useMemberOnly";

/** 마스코트는 상점 상품의 모양을 빌려 오므로 id 앞머리로 종류를 가린다. */
function tracked(item: ShopItem, price: number) {
  return { kind: item.id.startsWith("mascot-") ? ("mascot" as const) : item.kind, price };
}

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
 * 마스코트처럼 상점 상품이 아닌 것을 살 때는 buy로 사는 요청을 바꿔 끼운다.
 * 사는 일은 회원만 하므로 비회원이 열면 확인 창 대신 로그인 화면을 열고, 서버가 회원 전용이라고 거절해도 같은 화면으로 보낸다.
 */
export function usePurchaseFlow(item: ShopItem | null, buy?: () => Promise<PurchaseResult>) {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const queryClient = useQueryClient();
  const balance = useQuery(balanceQuery(gateway, userId)).data;
  const [step, setStep] = useState<PurchaseStep>("idle");
  const [paidBalance, setPaidBalance] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const memberOnly = useMemberOnly();

  const price = item?.acquire.type === "price" ? item.acquire.price : null;

  function open() {
    if (item === null || price === null || item.owned) {
      return;
    }
    if (!memberOnly.allow()) {
      return;
    }
    setPaidBalance(null);
    trackPointsPurchase("attempted", tracked(item, price));
    if (balance !== undefined && balance < price) {
      trackPointsPurchase("insufficient", tracked(item, price));
    }
    setStep(balance !== undefined && balance < price ? "insufficient" : "confirm");
  }

  async function confirm() {
    if (item === null || inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setStep("pending");
    try {
      const result = await (buy ?? (() => gateway.purchase(item.id)))();
      if (result.ok) {
        queryClient.setQueryData(pointsKeys.balance(userId), result.balance);
        setPaidBalance(result.balance);
        if (price !== null) trackPointsPurchase("succeeded", tracked(item, price));
        setStep("done");
      } else if (result.reason === "insufficient") {
        if (price !== null) trackPointsPurchase("insufficient", tracked(item, price));
        setStep("insufficient");
        void queryClient.invalidateQueries({ queryKey: pointsKeys.balance(userId) });
      } else {
        setStep("idle");
        // 이미 가졌거나 잠긴 것은 다시 받은 상점이 보여 주고, 팔지 않거나 없어진 상품은 화면이 설명할 길이 없어 일반 안내를 띄운다.
        if (result.reason === "notPurchasable" || result.reason === "notFound") {
          showToast(i18n.t("common:errors.retryLater"));
        }
      }
      void queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) });
      void queryClient.invalidateQueries({ queryKey: pointsKeys.histories(userId) });
    } catch (error) {
      if (memberOnly.redirected(error)) {
        setStep("idle");
      } else {
        setStep("confirm");
        showToast(i18n.t("common:errors.retryLater"));
      }
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
    } catch (error) {
      // 회원 전용 거절은 충전 처리기가 이미 로그인 화면으로 보냈다.
      if (!isMemberOnlyError(error)) showToast(i18n.t("common:errors.retryLater"));
      return;
    }
    if (result.status === "completed") {
      await confirm();
    } else if (result.status === "late") {
      showToast(i18n.t("points-earn:late.title"));
    } else if (result.status !== "cancelled") {
      // 취소는 사용자가 고른 일이라 실패로 알리지 않는다.
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

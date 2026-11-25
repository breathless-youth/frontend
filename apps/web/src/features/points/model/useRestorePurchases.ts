import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { trackPointsRestore } from "@/lib/amplitude";
import { pointsKeys } from "@/lib/pointsQueries";
import { showToast } from "@/lib/toast";

import { appPointsGateway } from "../gateway/appPointsGateway";
import { isMemberOnlyError } from "../gateway/memberOnly";
import type { RestoreResult } from "../types";

/** 서버가 결제 알림을 받아 보유를 바꾸기까지 몇 초 걸릴 수 있어 그 뒤에 다시 읽는 시점이다. */
const LATE_REFETCH_MS = [2_000, 5_000];

/**
 * 구매 복원
 *
 * 결제로 산 상품이 새 기기나 다시 설치한 앱에서 보이지 않을 때 스토어 결제 기록으로 되찾는다.
 * 보유는 서버가 결제 알림을 받은 뒤에 바뀌어서, 복원이 끝나면 상점과 내 모습을 바로 읽고 조금 뒤에 다시 읽는다.
 * 알림은 뒤늦은 읽기와 상관없이 앱의 복원 결과로 한 번만 띄운다.
 * 비활성 표시는 다음 렌더에야 붙으므로 같은 순간의 두 번째 누름은 ref로 막는다.
 * 서버가 결제용 ID를 주지 않아 회원 전용으로 거절되면 다시 시도하라고 알리지 않고 `onMemberOnly`로 로그인 화면을 연다.
 */
export function useRestorePurchases(
  userId: number | null,
  onMemberOnly?: () => void,
): {
  restoring: boolean;
  restore: () => Promise<void>;
} {
  const { t } = useTranslation(["points-shop", "common"]);
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);
  const [restoring, setRestoring] = useState(false);

  const restore = async () => {
    if (userId === null || inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setRestoring(true);
    trackPointsRestore("attempted");
    let status: RestoreResult;
    try {
      status = await appPointsGateway().restorePurchases();
    } catch (error) {
      if (isMemberOnlyError(error)) {
        trackPointsRestore("failed");
        onMemberOnly?.();
        return;
      }
      status = "failed";
    } finally {
      inFlightRef.current = false;
      setRestoring(false);
    }
    trackPointsRestore(status);
    if (status === "failed") {
      showToast(t("common:errors.retryLater"));
      return;
    }
    const readOwned = () => {
      void queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) });
      void queryClient.invalidateQueries({ queryKey: pointsKeys.look(userId) });
    };
    readOwned();
    if (status === "restored") {
      for (const delayMs of LATE_REFETCH_MS) {
        window.setTimeout(readOwned, delayMs);
      }
    }
    showToast(
      t(
        status === "restored"
          ? "points-shop:settings.restored"
          : "points-shop:settings.restoreNothing",
      ),
    );
  };

  return { restoring, restore };
}

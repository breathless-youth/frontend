import { useEffect } from "react";

import { hasTokenSource } from "@/lib/userId";

import {
  decideOnboarding,
  isNewUserLaunch,
  markOnboardingPending,
  onboardingRecord,
  type OnboardingDecision,
} from "./onboardingGate";

/**
 * 홈에 들어온 계정을 온보딩으로 보낼지
 *
 * 서버를 조회하지 않고 앱이 넘긴 새 계정 표시와 기기 기록만 본다.
 * 토큰 출처가 없는 문서(구버전 앱·브라우저 단독)는 새 계정 표시를 받을 수 없어 홈이다.
 * 신원이 도착하기 전에는 어느 계정의 기록을 볼지 몰라 판단을 미룬다.
 */
export function useOnboardingDecision(
  userId: number | null,
  identityPending: boolean,
): OnboardingDecision {
  let decision: OnboardingDecision;
  let record = null as ReturnType<typeof onboardingRecord>;
  if (!hasTokenSource()) {
    decision = "home";
  } else if (identityPending) {
    decision = "pending";
  } else if (userId === null) {
    decision = "home";
  } else {
    record = onboardingRecord(userId);
    decision = decideOnboarding({ record, newUser: isNewUserLaunch() });
  }

  const startsNow = decision === "onboarding" && record === null;
  useEffect(() => {
    if (startsNow && userId !== null) {
      markOnboardingPending(userId);
    }
  }, [startsNow, userId]);

  return decision;
}

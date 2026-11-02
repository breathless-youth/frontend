import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { markOnboardingSettled } from "@/features/onboarding/onboardingGate";
import { OnboardingFlow } from "@/features/onboarding/OnboardingFlow";
import {
  trackOnboardingCompleted,
  trackOnboardingNotificationResult,
  trackOnboardingStepViewed,
} from "@/lib/amplitude";
import { signalLaunchReady } from "@/lib/launchReady";
import { trackMetaTutorialCompleted } from "@/lib/metaAppEvents";
import { useNativeBackGestureLock } from "@/lib/nativeBackGesture";
import { requestPushPermission } from "@/lib/nativePushPermission";
import { useUserId } from "@/lib/userId";

/**
 * 첫 실행 온보딩
 *
 * 홈이 새로 가입한 계정을 이 화면으로 보낸다(`useOnboardingDecision`).
 * 단계는 화면 상태라 히스토리에 쌓이지 않으므로, iOS 가장자리 스와이프가 온보딩을 통째로 벗어나지 않게 막는다.
 * `시작하기`를 누르면 다시 보이지 않도록 기록하고 쿼리를 유지한 채 홈으로 바꿔 간다.
 */
export function OnboardingPage() {
  useNativeBackGestureLock();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useUserId();

  useEffect(() => {
    signalLaunchReady();
  }, []);

  const askNotification = useCallback(async () => {
    trackOnboardingNotificationResult(await requestPushPermission());
  }, []);

  // 연타해도 홈 이동과 완료 이벤트는 한 번만 일어난다.
  const finishedRef = useRef(false);
  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (userId !== null) {
      markOnboardingSettled(userId);
    }
    trackOnboardingCompleted();
    trackMetaTutorialCompleted();
    navigate({ pathname: "/home", search: location.search }, { replace: true });
  };

  return (
    <OnboardingFlow
      onStepView={trackOnboardingStepViewed}
      onAskNotification={askNotification}
      onFinish={finish}
    />
  );
}

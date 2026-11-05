import { useEffect, useRef } from "react";

import {
  trackStudySessionHelpShown,
  trackStudySessionHelpStepViewed,
  type SessionHelpTrigger,
} from "@/lib/amplitude";

import { SESSION_HELP_STEPS } from "./sessionGuide";

/**
 * 세션 도움말의 노출·단계 이벤트
 *
 * 메뉴로 연 도움말은 가려지면 언마운트되어 다시 뜰 때 효과가 또 돈다.
 * 그래서 화면이 아니라 호출부에서 노출마다, 단계가 바뀔 때마다 한 번씩만 보낸다.
 * 추적 단계가 null이면 이번 노출의 첫 이벤트를 아직 보내지 않은 것이다. 돌려주는 함수로 노출을 끝낸다.
 */
export function useSessionHelpFunnel(
  visible: boolean,
  step: number,
  trigger: SessionHelpTrigger,
): () => void {
  const trackedStepRef = useRef<number | null>(null);
  useEffect(() => {
    if (!visible || trackedStepRef.current === step) {
      return;
    }
    if (trackedStepRef.current === null) {
      trackStudySessionHelpShown(trigger, "single");
    }
    trackedStepRef.current = step;
    trackStudySessionHelpStepViewed({
      step: step + 1,
      stepId: SESSION_HELP_STEPS[step].id,
      trigger,
      roomType: "single",
    });
  }, [visible, step, trigger]);
  return () => {
    trackedStepRef.current = null;
  };
}

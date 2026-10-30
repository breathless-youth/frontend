import { useEffect, useRef, useState } from "react";

import {
  type StudyRoomType,
  trackMeasurementFeedbackRated,
  trackMeasurementFeedbackReasonSelected,
  trackMeasurementFeedbackShown,
} from "@/lib/amplitude";

import { MeasurementFeedbackCard } from "./MeasurementFeedbackCard";
import { canShowMeasurementFeedback } from "./measurementFeedbackGate";
import {
  loadMeasurementFeedbackState,
  recordMeasurementFeedbackShown,
} from "./measurementFeedbackStore";

/**
 * 결과 화면 AI 측정 만족도 카드 호스트
 *
 * 결과가 드러난 뒤 마운트되어 띄울지를 한 번만 정한다.
 * 띄우는 순간 노출 시각을 남겨, 인터뷰 폼에서 돌아오는 식으로 결과 화면을 다시 열어도 3일 안에는 또 뜨지 않는다.
 */
export function MeasurementFeedbackCardHost({
  focusSec,
  roomType,
}: {
  focusSec: number;
  roomType: StudyRoomType;
}) {
  const [visible] = useState(() => {
    const state = loadMeasurementFeedbackState();
    return state !== null && canShowMeasurementFeedback(state, focusSec, Date.now());
  });
  // 개발 모드는 이펙트를 두 번 돌린다.
  // 노출 기록과 이벤트가 한 번만 나가게 막는다.
  const recordedRef = useRef(false);

  useEffect(() => {
    if (!visible || recordedRef.current) {
      return;
    }
    recordedRef.current = true;
    recordMeasurementFeedbackShown(Date.now());
    trackMeasurementFeedbackShown({ roomType, focusSec });
  }, [visible, roomType, focusSec]);

  if (!visible) {
    return null;
  }

  return (
    <MeasurementFeedbackCard
      onRate={(rating) => trackMeasurementFeedbackRated({ roomType, focusSec, rating })}
      onReason={(rating, reason) =>
        trackMeasurementFeedbackReasonSelected({ roomType, focusSec, rating, reason })
      }
    />
  );
}

import { useEffect, useRef, useState } from "react";

import {
  type StudyRoomType,
  trackFocusFeedbackAnswered,
  trackFocusFeedbackCommentSubmitted,
  trackFocusFeedbackShown,
} from "@/lib/amplitude";

import { FocusFeedbackCard } from "./FocusFeedbackCard";
import { canShowFocusFeedback } from "./focusFeedbackGate";
import { loadFocusFeedbackState, recordFocusFeedbackShown } from "./focusFeedbackStore";

const FOCUS_FEEDBACK_COMMENT_MIN_STUDY_SEC = 60 * 60;

/**
 * 결과 화면 집중 도움 설문 호스트
 *
 * 결과가 드러난 뒤 마운트되어 띄울지를 한 번만 정한다.
 * 띄우는 순간 노출 시각을 남겨, 인터뷰 폼에서 돌아오는 식으로 결과 화면을 다시 열어도 3일 안에는 또 뜨지 않는다.
 */
export function FocusFeedbackCardHost({
  studySec,
  roomType,
  onAnswered,
}: {
  studySec: number;
  roomType: StudyRoomType;
  onAnswered: () => void;
}) {
  const [visible] = useState(() => {
    const state = loadFocusFeedbackState();
    return state !== null && canShowFocusFeedback(state, studySec, Date.now());
  });
  // 개발 모드는 이펙트를 두 번 돌린다.
  // 노출 기록과 이벤트가 한 번만 나가게 막는다.
  const recordedRef = useRef(false);

  useEffect(() => {
    if (!visible || recordedRef.current) {
      return;
    }
    recordedRef.current = true;
    recordFocusFeedbackShown(Date.now());
    trackFocusFeedbackShown({ roomType, studySec });
  }, [visible, roomType, studySec]);

  if (!visible) {
    return null;
  }

  return (
    <FocusFeedbackCard
      allowComment={studySec >= FOCUS_FEEDBACK_COMMENT_MIN_STUDY_SEC}
      onAnswer={(impact) => {
        trackFocusFeedbackAnswered({ roomType, studySec, impact });
        onAnswered();
      }}
      onComment={(impact, comment) =>
        trackFocusFeedbackCommentSubmitted({ roomType, studySec, impact, comment })
      }
    />
  );
}

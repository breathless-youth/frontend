import type { MeasurementFeedbackRating, MeasurementFeedbackReason } from "@/lib/amplitude";

/**
 * AI 측정 만족도 카드 문구
 *
 * 문구를 화면 코드에 흩뿌리지 않고 여기 한 곳에 모은다.
 */
export const MEASUREMENT_FEEDBACK_COPY = {
  title: "이번 측정 결과 어땠나요?",
  reasonDescription: "하나만 골라주세요",
  thanks: "소중한 의견 감사합니다!",
} as const;

export const RATING_OPTIONS: readonly { value: MeasurementFeedbackRating; label: string }[] = [
  { value: "good", label: "만족해요" },
  { value: "meh", label: "보통이에요" },
  { value: "bad", label: "아쉬워요" },
];

/** 보통이에요는 불만이 크지 않은 답이라 이유를 묻는 말을 한 단계 누그러뜨린다. */
export const REASON_TITLE: Record<Exclude<MeasurementFeedbackRating, "good">, string> = {
  meh: "조금 아쉬운 점이 있었나요?",
  bad: "어떤 점이 아쉬웠나요?",
};

export const REASON_OPTIONS: readonly { value: MeasurementFeedbackReason; label: string }[] = [
  { value: "under", label: "실제보다 적게 잡혔어요" },
  { value: "over", label: "실제보다 많이 잡혔어요" },
  { value: "unclear", label: "결과를 봐도 잘 모르겠어요" },
  { value: "missing_info", label: "보고 싶은 정보가 없어요" },
];

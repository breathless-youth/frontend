import iconItems from "@/assets/sparta/icon-items.svg";
import iconMatch from "@/assets/sparta/icon-match.svg";
import iconPhone from "@/assets/sparta/icon-phone.svg";
import iconPlanner from "@/assets/sparta/icon-planner.svg";
import iconReport from "@/assets/sparta/icon-report.svg";
import iconThemes from "@/assets/sparta/icon-themes.svg";

import type { PremiumFeature } from "./premiumFakeDoor";

/**
 * 혜택 타일, 가격 카드 목록, 기능 설명 시트, 완료 화면 질문이 같이 쓰는 기능 아이콘(손그림 SVG, 96×96)
 *
 * 그림을 바꿀 때는 이 표와 `assets/sparta/`만 고친다.
 */
export const FEATURE_ART: Record<PremiumFeature, string> = {
  AI_PLANNER: iconPlanner,
  AI_REPORT: iconReport,
  GROUP_MATCHING: iconMatch,
  PHONE_CALL: iconPhone,
  TIMER_BACKGROUND: iconThemes,
  CHARACTER_ITEMS: iconItems,
};

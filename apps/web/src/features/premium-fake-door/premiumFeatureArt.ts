import iconItems from "@/assets/sparta/icon-items.png";
import iconMatch from "@/assets/sparta/icon-match.png";
import iconPhone from "@/assets/sparta/icon-phone.png";
import iconPlanner from "@/assets/sparta/icon-planner.png";
import iconReport from "@/assets/sparta/icon-report.png";
import iconThemes from "@/assets/sparta/icon-themes.png";

import type { PremiumFeature } from "./premiumFakeDoor";

/**
 * 혜택 타일, 가격 카드 목록, 기능 설명 시트, 완료 화면 질문이 같이 쓰는 기능 아이콘(240px 투명 PNG 평면 아이콘)
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

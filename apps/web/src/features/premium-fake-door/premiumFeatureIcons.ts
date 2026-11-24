import {
  Bell,
  ChartColumn,
  Image as ImageIcon,
  ListChecks,
  type LucideIcon,
  Shirt,
  Users,
} from "lucide-react";

import type { PremiumFeature } from "./premiumFakeDoor";

/** 혜택 타일, 설명 시트, 완료 화면 질문이 같은 아이콘을 쓴다. */
export const FEATURE_ICONS: Record<PremiumFeature, LucideIcon> = {
  AI_PLANNER: ListChecks,
  AI_REPORT: ChartColumn,
  GROUP_MATCHING: Users,
  SMART_NOTIFICATION: Bell,
  TIMER_BACKGROUND: ImageIcon,
  CHARACTER_ITEMS: Shirt,
};

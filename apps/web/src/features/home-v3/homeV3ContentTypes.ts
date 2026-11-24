import type { HomeMissionStep } from "@focusmakers/types";
import type { ReactNode } from "react";

import type { WornAccessoriesByMascot } from "@/components/mascot/types";

import type { HomeBand } from "./homeV3Model";

export type HomeLoadState<T> =
  { status: "pending" } | { status: "error"; retry: () => void } | { status: "success"; value: T };

export interface HomeSubject {
  id: number;
  name: string;
  colorIndex: number;
}
export interface HomeTodayStats {
  studySeconds: number;
  focusSeconds: number;
  focusRate: number;
}

export interface HomeV3ContentProps {
  band: HomeLoadState<HomeBand>;
  stats: HomeLoadState<HomeTodayStats>;
  wornAccessories?: WornAccessoriesByMascot;
  subjects: HomeLoadState<readonly HomeSubject[]>;
  selectedSubjectId: number | null;
  completingMission?: boolean;
  claimingReward?: boolean;
  startingStudy?: boolean;
  startError?: string;
  missionError?: string;
  timelapseCount?: number;
  plannerTaskCount?: number;
  appLockLabel: string;
  /** "공부 시작" 버튼 바로 아래에 두는 카드. 프리미엄 사전 신청 실험(BY-1392)이 쓴다. */
  afterStart?: ReactNode;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  actions: {
    selectSubject: (id: number | null) => void;
    startStudy: () => void;
    openPlanner: () => void;
    completeMission: (step: HomeMissionStep) => void;
    openAccessories?: () => void;
    claimMissionReward?: () => void;
    editGoal: () => void;
    openTimelapses: () => void;
    openTimelapseSettings: () => void;
    openAppLock: () => void;
    openContact: () => void;
  };
}

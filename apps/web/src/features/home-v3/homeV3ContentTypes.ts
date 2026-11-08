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
  subjects: HomeLoadState<readonly HomeSubject[]>;
  selectedSubjectId: number | null;
  completingMission?: boolean;
  startingStudy?: boolean;
  startError?: string;
  missionError?: string;
  timelapseCount?: number;
  plannerTaskCount?: number;
  appLockLabel: string;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  actions: {
    selectSubject: (id: number | null) => void;
    startStudy: () => void;
    openPlanner: () => void;
    completeMission: (step: 1 | 2) => void;
    editGoal: () => void;
    openTimelapses: () => void;
    openTimelapseSettings: () => void;
    openAppLock: () => void;
  };
}

import type { HomeMissionResponse } from "@focusmakers/types";

export function homeMission<C extends 0 | 1 | 2>(
  completedSteps: C,
  measuredFocusSec = 300,
  eligible = completedSteps === 0 || (completedSteps === 1 && measuredFocusSec >= 300),
): HomeMissionResponse & { completedSteps: C } {
  return {
    version: "home-v3",
    startsOn: "2026-11-07",
    completedSteps,
    currentStep: completedSteps === 2 ? null : completedSteps === 1 ? 2 : 1,
    eligible,
    measuredFocusSec,
  };
}

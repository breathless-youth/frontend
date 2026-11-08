import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { HomeV3Content } from "@/features/home-v3/HomeV3Content";
import { HomeGoalSheet } from "@/features/home-v3/HomeGoalSheet";
import { homeDateLabel, type HomeMission } from "@/features/home-v3/homeV3Model";
import type { HomeGoal, HomeV3Gateway } from "@/features/home-v3/HomeV3Gateway";
import { homeV3Keys, useHomeV3Progress } from "@/features/home-v3/useHomeV3Progress";

const scenarios = ["2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"] as const;
type Scenario = (typeof scenarios)[number];
const day = { dateKey: "2026-11-05", timeZone: "Asia/Seoul" };
const PREVIEW_USER = -1188;
const stats = {
  status: "success" as const,
  value: { studySeconds: 15512, focusSeconds: 13337, focusRate: 86 },
};

function Preview({ scenario }: { scenario: Scenario }) {
  const { t, i18n } = useTranslation("home");
  const client = useQueryClient();
  const [subjectCount, setSubjectCount] = useState(scenario === "2a" ? 0 : 4);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(scenario === "2h");
  const [editing, setEditing] = useState({
    open: scenario === "2f",
    key: 0,
    seconds: null as number | null,
  });
  const [message, setMessage] = useState("");
  // 개발 미리보기 전용 메모리 어댑터. production 모듈에서는 가져오지 않는다.
  const mission = useRef<HomeMission>({
    version: "home-v3",
    startsOn: "2026-11-07",
    currentStep: scenario <= "2b" ? 1 : scenario <= "2d" ? 2 : null,
    eligible: scenario !== "2a" && scenario !== "2c" && scenario <= "2d",
    completedSteps: scenario <= "2b" ? 0 : scenario <= "2d" ? 1 : 2,
    measuredFocusSec: scenario === "2c" ? 100 : 300,
  });
  const goal = useRef<HomeGoal>({
    seconds: scenario >= "2g" ? 28800 : null,
    defaultSeconds: null,
    remainingTasks: 3,
  });
  const gateway: HomeV3Gateway = {
    readMission: async () => mission.current,
    acknowledgeMission: async (step) => {
      mission.current = {
        ...mission.current,
        completedSteps: step,
        currentStep: step === 1 ? 2 : null,
        eligible: step === 1 && mission.current.measuredFocusSec >= 300,
      };
      return mission.current;
    },
    readPlannerDay: async (editedDay) => ({
      date: editedDay.dateKey,
      timeZone: editedDay.timeZone,
      studySec: 0,
      focusSec: 0,
      goal: {
        goalSec: goal.current.seconds,
        individualGoalSec: goal.current.seconds,
        defaultGoalSec: goal.current.defaultSeconds,
      },
      subjects: [],
      records: [],
    }),
    saveDateGoal: async (_, seconds) => {
      goal.current = { ...goal.current, seconds };
      return {
        goalSec: seconds,
        individualGoalSec: seconds,
        defaultGoalSec: goal.current.defaultSeconds,
      };
    },
    saveDefaultGoal: async (_, seconds) => {
      goal.current = { ...goal.current, defaultSeconds: seconds };
      return { goalSec: seconds };
    },
    startStudy: () => {
      mission.current = {
        ...mission.current,
        measuredFocusSec: 300,
        eligible: mission.current.currentStep === 2,
      };
      client.setQueryData(homeV3Keys.mission(PREVIEW_USER), mission.current);
      setMessage(`DEV: startStudy(${selectedId ?? "null"}); measured focus = 300s`);
    },
  };
  const progress = useHomeV3Progress(gateway, PREVIEW_USER, day, stats);
  const subjects = [
    { id: 1, name: t("v3.preview.subjects.korean"), colorIndex: 0 },
    { id: 2, name: t("v3.preview.subjects.math"), colorIndex: 7 },
    { id: 3, name: t("v3.preview.subjects.english"), colorIndex: 11 },
    { id: 4, name: t("v3.preview.subjects.science"), colorIndex: 2 },
  ].slice(0, subjectCount);
  return (
    <>
      <header className="flex min-h-14.5 items-end justify-between gap-4 pb-1">
        <button
          type="button"
          className="flex min-h-13.5 flex-col gap-0.5 text-left"
          onClick={() => setMessage("DEV: edit D-Day")}
        >
          <span className="flex items-center gap-1 text-[13px] leading-4 font-medium text-muted-foreground">
            {t("v3.preview.exam")}
            <ChevronRight size={12} className="text-text-tertiary" aria-hidden="true" />
          </span>
          <span className="text-[30px] leading-9 font-extrabold tracking-[-0.8px]">D-52</span>
        </button>
        <span className="pb-1.5 text-sm leading-4.5 font-medium text-muted-foreground">
          {homeDateLabel(day.dateKey, i18n.language)}
        </span>
      </header>
      <HomeV3Content
        band={progress.band}
        stats={stats}
        subjects={{ status: "success", value: subjects }}
        selectedSubjectId={selectedId}
        completingMission={progress.completingMission}
        missionError={progress.missionError ? t("v3.mission.failed") : undefined}
        timelapseCount={2}
        plannerTaskCount={3}
        appLockLabel={t("v3.appLock.locked", { count: 4 })}
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        actions={{
          selectSubject: setSelectedId,
          startStudy: () => gateway.startStudy(selectedId),
          completeMission: progress.completeMission,
          openPlanner: () => {
            setSubjectCount(4);
            if (mission.current.currentStep === 1) {
              mission.current = { ...mission.current, eligible: true };
              client.setQueryData(homeV3Keys.mission(PREVIEW_USER), mission.current);
            }
            setMessage("DEV: planner opened; active subject count = 4");
          },
          editGoal: () =>
            setEditing((previous) => ({
              open: true,
              key: previous.key + 1,
              seconds: progress.goal?.seconds ?? null,
            })),
          openTimelapses: () => setMessage("DEV: /timelapses"),
          openTimelapseSettings: () => setMessage("DEV: /timelapse-settings"),
          openAppLock: () => setMessage("DEV: /app-lock-settings"),
        }}
      />
      <HomeGoalSheet
        key={editing.key}
        open={editing.open}
        onOpenChange={(open) => setEditing((previous) => ({ ...previous, open }))}
        initialSeconds={editing.seconds}
        dateLabel={homeDateLabel(day.dateKey, i18n.language)}
        onSave={(input) => progress.saveGoal(day, input)}
      />
      {message && <output className="mt-4 block text-xs text-muted-foreground">{message}</output>}
    </>
  );
}

function ScenarioPreview({ scenario }: { scenario: Scenario }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Preview scenario={scenario} />
    </QueryClientProvider>
  );
}

export function DevHomeV3Page() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("scenario");
  const scenario = scenarios.find((value) => value === raw) ?? "2a";
  const dark = params.get("theme") === "dark";
  const capture = params.get("capture") === "1";
  useEffect(() => {
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    return () => {
      if (previous === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = previous;
    };
  }, [dark]);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }
  return (
    <main className="theme-soft-blue bg-soft-blue page-column min-h-dvh pt-21 pb-10 text-foreground">
      {!capture && (
        <div className="fixed top-2 right-2 left-2 z-40 flex items-center justify-center gap-3 text-xs">
          <label>
            DEV Home v3{" "}
            <select
              aria-label="Scenario"
              value={scenario}
              onChange={(event) => update("scenario", event.target.value)}
            >
              {scenarios.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={dark}
              onChange={(event) => update("theme", event.target.checked ? "dark" : "light")}
            />{" "}
            Dark
          </label>
        </div>
      )}
      <div className="flex flex-col gap-3 px-5">
        <ScenarioPreview key={scenario} scenario={scenario} />
      </div>
    </main>
  );
}

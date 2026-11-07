import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { startPlannerSample } from "./plannerSampleSetup";
import { usePlannerClock } from "./usePlannerClock";

export function PlannerSample({
  dateKey,
  onDirect,
  onCreated,
  promptContainer,
}: {
  dateKey: string;
  onDirect: () => void;
  onCreated: () => Promise<void>;
  promptContainer?: HTMLElement | null;
}) {
  const { t } = useTranslation(["planner", "common"]);
  const { timeZone } = usePlannerClock();
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false);
  const samples = [
    { subject: t("sample.language"), task: t("sample.languageTask") },
    { subject: t("sample.math"), task: t("sample.mathTask") },
  ];
  const prompt = (
    <div
      className={
        promptContainer
          ? "absolute right-0 bottom-4 left-0 z-10 flex flex-col gap-3 rounded-[22px] bg-muted p-4 shadow-[0_12px_32px_color-mix(in_srgb,var(--foreground)_16%,transparent)] ring-1 ring-border"
          : "absolute right-4 z-10 bottom-[max(84px,calc(env(safe-area-inset-bottom)+60px))] left-4 flex flex-col gap-3 rounded-[22px] bg-muted p-4 shadow-[0_12px_32px_color-mix(in_srgb,var(--foreground)_16%,transparent)] ring-1 ring-border"
      }
    >
      <p className="text-base leading-5.5 font-extrabold">{t("sample.title")}</p>
      <div className="flex gap-2">
        <Button
          variant="subtle"
          disabled={pending}
          onClick={onDirect}
          className="h-12 flex-1 rounded-2xl bg-bg-layer-2 px-2 text-[15px] font-bold text-foreground"
        >
          {t("sample.direct")}
        </Button>
        <Button
          disabled={pending}
          className="h-12 flex-1 rounded-2xl px-2 text-[15px] font-bold shadow-sb-cta"
          onClick={() => {
            if (pending) return;
            setPending(true);
            setFailed(false);
            void startPlannerSample(dateKey, samples, { timeZone })
              .then(onCreated)
              .catch(() => setFailed(true))
              .finally(() => setPending(false));
          }}
        >
          {t("sample.start")}
        </Button>
      </div>
    </div>
  );
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <p className="flex h-6 items-center self-start rounded-full bg-brand-subtle px-2.25 text-xs font-bold text-brand-subtle-text">
        {t("sample.label")}
      </p>
      {samples.map((sample, index) => (
        <section key={index} className="flex flex-col gap-1">
          <p className="flex h-5 items-center gap-1.5 pl-0.5 text-[13px] leading-4.5 font-bold">
            <span
              aria-hidden
              className="size-2 rounded-[2px]"
              style={{ background: subjectColorVar(index === 0 ? 0 : 7) }}
            />
            {sample.subject}
          </p>
          <p
            className="flex min-h-8.5 items-start gap-2 rounded-l-[3px] rounded-r-[10px] border-l-3 py-2 pr-2 pl-2.25 text-[13px] leading-4.5 font-semibold wrap-break-word"
            style={{
              borderColor: subjectColorVar(index === 0 ? 0 : 7),
              background: `color-mix(in srgb, ${subjectColorVar(index === 0 ? 0 : 7)} 16%, var(--muted))`,
            }}
          >
            <span className="min-w-0 flex-1">{sample.task}</span>
            <span
              aria-hidden
              className="size-4.5 shrink-0 rounded-full border-[1.5px] bg-muted"
              style={{
                borderColor: `color-mix(in srgb, ${subjectColorVar(index === 0 ? 0 : 7)} 55%, var(--muted))`,
              }}
            />
          </p>
          <Button
            variant="unstyled"
            disabled={pending}
            onClick={onDirect}
            className="relative h-7 min-h-0 justify-start gap-1.25 self-start rounded-none pr-1.5 pl-3 text-xs leading-4 font-semibold text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-2"
          >
            <Plus aria-hidden size={12} strokeWidth={2.4} />
            {t("plan.addTask")}
          </Button>
        </section>
      ))}
      {promptContainer ? createPortal(prompt, promptContainer) : prompt}
      {failed && (
        <p role="alert" className="text-sm text-state-distract-text">
          {t("common:errors.retryLater")}
        </p>
      )}
    </div>
  );
}

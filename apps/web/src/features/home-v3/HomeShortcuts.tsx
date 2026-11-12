import { useTranslation } from "react-i18next";
import notebook from "@/assets/home-v3/mascot-notebook.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HomeDesignIcon } from "./HomeDesignIcon";
import type { HomeV3ContentProps } from "./homeV3ContentTypes";
import { tapped } from "./homeShortcutTap";

function ShortcutSummary({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm leading-5 font-medium">{title}</span>
      <span className="text-xs leading-4 font-normal text-muted-foreground">{detail}</span>
    </span>
  );
}

export function HomePlannerShortcut({
  plannerTaskCount,
  onOpen,
}: {
  plannerTaskCount?: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation("home");
  return (
    <Card className="overflow-hidden rounded-xl border-0 shadow-sb-card">
      <Button
        variant="unstyled"
        className="relative h-auto min-h-22 w-full items-center justify-start rounded-xl px-5 py-4 text-left"
        onClick={tapped("planner", onOpen)}
      >
        <span className="relative z-1 flex flex-col gap-1.5">
          <span className="text-[22px] leading-7.5 font-bold">{t("v3.planner.title")}</span>
          <span className="text-[13px] leading-5 font-normal text-muted-foreground">
            {plannerTaskCount === undefined
              ? t("v3.planner.open")
              : t("v3.planner.remaining", { count: plannerTaskCount })}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="home-v3-notebook pointer-events-none absolute -right-6 -bottom-11.5 size-40 -rotate-12 select-none"
        >
          <span className="relative block size-full overflow-hidden">
            <img
              src={notebook}
              alt=""
              width={160}
              height={160}
              className="absolute -top-[5.65%] -left-[10.99%] size-[109.75%] max-w-none"
            />
          </span>
        </span>
      </Button>
    </Card>
  );
}

export function HomeUtilityShortcuts({
  timelapseCount,
  appLockLabel,
  actions,
}: Pick<HomeV3ContentProps, "timelapseCount" | "appLockLabel"> & {
  actions: Pick<
    HomeV3ContentProps["actions"],
    "openTimelapses" | "openTimelapseSettings" | "openAppLock"
  >;
}) {
  const { t } = useTranslation("home");
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Card className="flex min-h-16 overflow-hidden rounded-xl border-0 shadow-sb-card">
        <Button
          variant="unstyled"
          className="h-auto min-h-16 min-w-0 flex-1 justify-start gap-2.5 rounded-none py-2 pr-0 pl-3.5 text-left"
          onClick={tapped("timelapse", actions.openTimelapses)}
        >
          <HomeDesignIcon name="video" className="text-primary" />
          <ShortcutSummary
            title={t("v3.timelapse.title")}
            detail={
              timelapseCount === undefined
                ? t("v3.timelapse.open")
                : t("v3.timelapse.recent", { count: timelapseCount })
            }
          />
        </Button>
        <Separator className="my-3.5 h-auto w-px shrink-0" />
        <Button
          variant="unstyled"
          className="h-auto min-h-16 w-12 shrink-0 rounded-none p-0 text-muted-foreground"
          aria-label={t("v3.timelapse.settings")}
          onClick={tapped("timelapse_settings", actions.openTimelapseSettings)}
        >
          <HomeDesignIcon name="settings" />
        </Button>
      </Card>
      <Card className="overflow-hidden rounded-xl border-0 shadow-sb-card">
        <Button
          variant="unstyled"
          className="h-auto min-h-16 w-full justify-start gap-2.5 rounded-xl px-3.5 py-2 text-left"
          onClick={tapped("app_lock", actions.openAppLock)}
        >
          <HomeDesignIcon name="lock" className="text-primary" />
          <ShortcutSummary title={t("v3.appLock.title")} detail={appLockLabel} />
        </Button>
      </Card>
    </div>
  );
}

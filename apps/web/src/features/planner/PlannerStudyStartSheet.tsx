import type { PlannerTask, SubjectResponse } from "@focusmakers/types";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { enterGroupStudyRoom } from "@/features/group-room/enterGroupStudyRoom";
import type { GroupRoomLocationState } from "@/features/live-room/liveRoomEntryState";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { sessionGuideState } from "@/features/study-session/sessionGuide";
import { trackFocusStartTapped } from "@/lib/amplitude";
import { hasGroupRooms } from "@/lib/groupRoomCapability";
import { haptic } from "@/lib/haptics";
import { myGroupsQuery } from "@/lib/groupRoomQueries";
import { requestSessionStart, SubjectStartUnavailableError } from "@/lib/sessionStart";
import { cn } from "@/lib/utils";
export interface PlannerStudyStartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number | null;
  task: PlannerTask;
  subject?: Pick<SubjectResponse, "name" | "colorIndex">;
}
export function PlannerStudyStartSheet({
  open,
  onOpenChange,
  userId,
  task,
  subject,
}: PlannerStudyStartSheetProps) {
  const { t } = useTranslation(["planner", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const groupsEnabled = hasGroupRooms();
  const [panel, setPanel] = useState<"where" | "groups">("where");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starting = useRef(false);
  const automatic = useRef(false);
  const soloHintId = useId();
  const groupHintId = useId();
  const color = subject ? subjectColorVar(subject.colorIndex) : "var(--primary)";
  const groups = useQuery({
    ...myGroupsQuery(userId ?? 0),
    enabled: open && panel === "groups" && userId !== null,
  });
  async function start(groupId?: number) {
    if (starting.current || userId === null) return;
    starting.current = true;
    setPending(true);
    setError(null);
    const search = new URLSearchParams(location.search);
    search.delete("date");
    search.delete("from");
    search.delete("initialSubjectId");
    try {
      if (groupId === undefined) {
        haptic("medium");
        if (sessionGuideState(userId) !== "seen") {
          navigate(
            { pathname: "/session-guide", search: search.toString() },
            { state: { source: "planner", initialSubjectId: task.subjectId } },
          );
        } else {
          trackFocusStartTapped("planner");
          await requestSessionStart(
            userId,
            () => {
              search.set("initialSubjectId", String(task.subjectId));
              navigate({ pathname: "/room/1", search: search.toString() });
            },
            { subjectId: task.subjectId },
          );
        }
      } else {
        const seat = await enterGroupStudyRoom(userId, groupId);
        const state: GroupRoomLocationState = { ...seat, initialSubjectId: task.subjectId };
        navigate({ pathname: `/groups/${groupId}/room`, search: search.toString() }, { state });
      }
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof SubjectStartUnavailableError
          ? t("studyStart.updateApp")
          : t("common:errors.retryLater"),
      );
    } finally {
      starting.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    if (open && !groupsEnabled && !automatic.current) {
      automatic.current = true;
      void start();
    }
  });
  return (
    <Drawer
      open={open && (groupsEnabled || error !== null)}
      onOpenChange={(next, details) => {
        if (!next && starting.current) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent
        variant="planner"
        className="theme-soft-blue"
        initialFocus={false}
        finalFocus={false}
      >
        <div className={cn("flex flex-col", panel === "where" ? "gap-4 pt-4" : "gap-3.5 pt-3.5")}>
          <div className="flex items-center gap-1">
            {panel === "groups" && (
              <Button
                variant="unstyled"
                className="relative -ml-1.5 size-8 shrink-0 p-0 before:absolute before:-inset-1.5"
                disabled={pending}
                aria-label={t("studyStart.backToWhere")}
                onClick={() => setPanel("where")}
              >
                <ChevronLeft aria-hidden size={22} />
              </Button>
            )}
            <div className={cn("flex min-w-0 flex-col", panel === "where" && "gap-1")}>
              <p
                className={cn(
                  "flex items-center gap-1.5 font-semibold text-muted-foreground",
                  panel === "where" ? "text-[13px] leading-4.5" : "text-xs leading-4",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 border-l-3",
                    panel === "where" ? "size-3.5 rounded-xs" : "size-3 rounded-[3px]",
                  )}
                  style={{
                    borderColor: color,
                    background: `color-mix(in srgb, ${color} 30%, var(--muted))`,
                  }}
                />
                <span className="min-w-0 wrap-break-word">
                  {subject?.name ?? t("subjects.unassigned")} · {task.name}
                </span>
              </p>
              <DrawerTitle className="text-lg leading-6.5 font-bold">
                {t(panel === "where" ? "studyStart.where" : "studyStart.whichGroup")}
              </DrawerTitle>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-feedback-danger">
              {error}
            </p>
          )}
          {panel === "where" ? (
            <div className="flex flex-col gap-2.5">
              <Button
                variant="unstyled"
                className="h-auto min-h-19 w-full justify-start gap-3.5 rounded-xl border-[1.5px] border-border bg-muted px-4 py-3 text-left"
                aria-label={t("studyStart.solo")}
                aria-describedby={soloHintId}
                disabled={pending}
                onClick={() => void start()}
              >
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-subtle text-primary"
                >
                  <svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx={12} cy={8} r={4} />
                    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                  </svg>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 whitespace-normal">
                  <span className="text-base leading-5.5 font-bold">{t("studyStart.solo")}</span>
                  <span
                    id={soloHintId}
                    className="text-[13px] leading-4.5 font-normal text-muted-foreground"
                  >
                    {t("studyStart.soloHint")}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  size={18}
                  strokeWidth={2.2}
                  className="shrink-0 text-muted-foreground"
                />
              </Button>
              {groupsEnabled && (
                <Button
                  variant="unstyled"
                  className="h-auto min-h-19 w-full justify-start gap-3.5 rounded-xl border-[1.5px] border-border bg-muted px-4 py-3 text-left"
                  aria-label={t("studyStart.group")}
                  aria-describedby={groupHintId}
                  disabled={pending}
                  onClick={() => setPanel("groups")}
                >
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-subtle text-primary"
                  >
                    <svg
                      width={22}
                      height={22}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx={9} cy={8} r={3.5} />
                      <path d="M2.5 20v-.5A5.5 5.5 0 0 1 8 14h2a5.5 5.5 0 0 1 5.5 5.5v.5" />
                      <circle cx={17} cy={9} r={2.8} />
                      <path d="M17.5 14.2A4.5 4.5 0 0 1 21.5 18.7v.8" />
                    </svg>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 whitespace-normal">
                    <span className="text-base leading-5.5 font-bold">{t("studyStart.group")}</span>
                    <span
                      id={groupHintId}
                      className="text-[13px] leading-4.5 font-normal text-muted-foreground"
                    >
                      {t("studyStart.groupHint")}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    size={18}
                    strokeWidth={2.2}
                    className="shrink-0 text-muted-foreground"
                  />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto">
              {groups.isPending ? (
                <Skeleton className="h-28 w-full" />
              ) : groups.isError ? (
                <Button variant="subtle" onClick={() => void groups.refetch()}>
                  {t("common:actions.retry")}
                </Button>
              ) : groups.data.groups.length === 0 ? (
                <p className="py-5 text-sm text-muted-foreground">{t("studyStart.noGroups")}</p>
              ) : (
                groups.data.groups.map((group) => (
                  <Button
                    key={group.groupId}
                    variant="unstyled"
                    className="h-auto min-h-16 w-full justify-start gap-3 rounded-[18px] border-[1.5px] border-border bg-muted px-4 py-3 text-left"
                    disabled={pending}
                    onClick={() => void start(group.groupId)}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 whitespace-normal">
                      <span className="text-[15px] leading-[normal] font-bold wrap-break-word">
                        {group.name}
                      </span>
                      <span className="flex items-center gap-1.25 text-[13px] leading-[normal] font-normal text-muted-foreground">
                        {group.studyingCount > 0 && (
                          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                        {group.studyingCount
                          ? t("studyStart.studyingCount", { count: group.studyingCount })
                          : t("studyStart.emptyRoom")}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden
                      size={18}
                      strokeWidth={2.2}
                      className="shrink-0 text-muted-foreground"
                    />
                  </Button>
                ))
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

import { useEffect, useEffectEvent, useId } from "react";
import { useTranslation } from "react-i18next";

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/Skeleton";

import { GROUP_ROOM_LIMITS } from "../model/limits";
import { remainingText } from "../model/timeText";
import type { PendingApplication } from "../types";
import { CategoryTag } from "./RoomMeta";

/**
 * 신청 중인 공개 그룹 시트
 *
 * 줄을 누르면 그 그룹의 공개 그룹 보기를 열고, 신청 취소는 확인 창 없이 바로 넘긴다.
 * 마지막 신청을 취소해 목록이 비면 제목만 남은 시트가 떠 있지 않게 스스로 닫는다.
 * 목록을 받는 동안의 빈 목록은 닫을 까닭이 아니어서 `loading`이면 줄 자리표시를 두고 닫지 않는다.
 * 시트는 body로 나가므로 Soft Blue 테마를 시트에도 단다.
 * 시트 안 버튼은 iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려지지 않게 목록째 끌기에서 뺀다.
 */
export function PendingApplicationsSheet({
  open,
  onOpenChange,
  applications,
  now,
  loading = false,
  cancelingId,
  onCancel,
  onOpenRoom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: PendingApplication[];
  now: Date;
  loading?: boolean;
  cancelingId: number | null;
  onCancel: (applicationId: number) => void;
  onOpenRoom: (roomId: number) => void;
}) {
  const { t } = useTranslation("group-room");
  const close = useEffectEvent(() => onOpenChange(false));
  const emptied = open && !loading && applications.length === 0;
  useEffect(() => {
    if (emptied) {
      close();
    }
  }, [emptied]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="theme-soft-blue">
        <DrawerTitle className="pt-4 text-lg leading-6.5 font-bold text-foreground">
          {t("pendingApplicationsSheet.title")}
        </DrawerTitle>
        <DrawerDescription className="pt-1 pb-2 text-[13px] leading-5 text-muted-foreground">
          {t("pendingApplicationsSheet.description", {
            count: GROUP_ROOM_LIMITS.applicationTtlDays,
          })}
        </DrawerDescription>
        <ul data-base-ui-swipe-ignore="">
          {loading
            ? [0, 1].map((index) => (
                <li key={index} className="flex min-h-17 items-center">
                  <Skeleton className="h-12 w-full rounded-[14px]" />
                </li>
              ))
            : applications.map((application) => (
                <PendingRow
                  key={application.applicationId}
                  application={application}
                  now={now}
                  canceling={cancelingId === application.applicationId}
                  onCancel={onCancel}
                  onOpenRoom={onOpenRoom}
                />
              ))}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * 신청 하나의 줄
 *
 * 버튼 안에 버튼이 들어가지 않도록 그룹을 여는 줄과 신청 취소를 형제로 둔다.
 * 줄마다 같은 이름의 신청 취소가 놓이므로 어느 그룹의 신청인지 설명으로 붙인다.
 */
function PendingRow({
  application,
  now,
  canceling,
  onCancel,
  onOpenRoom,
}: {
  application: PendingApplication;
  now: Date;
  canceling: boolean;
  onCancel: (applicationId: number) => void;
  onOpenRoom: (roomId: number) => void;
}) {
  const { t } = useTranslation("group-room");
  const nameId = useId();
  const remaining = t("pendingApplicationsSheet.remaining", {
    time: remainingText(application.expiresAt, now),
  });
  return (
    <li className="flex min-h-17 items-center gap-2.5">
      <button
        type="button"
        aria-label={[application.roomName, application.categoryLabel, remaining].join(", ")}
        onClick={() => onOpenRoom(application.roomId)}
        className="flex min-h-11 min-w-0 flex-1 flex-col items-start gap-1 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        <span
          id={nameId}
          className="w-full truncate text-[15px] leading-5.25 font-bold text-foreground"
        >
          {application.roomName}
        </span>
        <span className="flex items-center gap-1.5">
          <CategoryTag label={application.categoryLabel} />
          <span className="text-xs leading-4 text-state-pause tabular-nums">{remaining}</span>
        </span>
      </button>
      <button
        type="button"
        aria-describedby={nameId}
        disabled={canceling}
        onClick={() => onCancel(application.applicationId)}
        className="h-11 shrink-0 rounded-[14px] bg-bg-layer-2 px-3.5 text-[13px] leading-4 font-bold text-muted-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none disabled:opacity-50"
      >
        {t("pendingApplicationsSheet.cancel")}
      </button>
    </li>
  );
}

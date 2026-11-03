import { useEffect, useEffectEvent, useId } from "react";

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
 * 목록이 비어 닫힐 때는 시트를 연 띠도 함께 사라져 포커스가 갈 곳을 잃으므로 `emptiedFocus`가 준 요소로 돌려준다.
 */
export function PendingApplicationsSheet({
  open,
  onOpenChange,
  applications,
  now,
  loading = false,
  cancelingId,
  emptiedFocus,
  onCancel,
  onOpenRoom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: PendingApplication[];
  now: Date;
  loading?: boolean;
  cancelingId: number | null;
  /** 목록이 비어 시트가 닫힐 때 포커스를 받을 요소이고, 없으면 시트를 연 요소로 돌아간다. */
  emptiedFocus?: () => HTMLElement | null;
  onCancel: (applicationId: number) => void;
  onOpenRoom: (roomId: number) => void;
}) {
  const close = useEffectEvent(() => onOpenChange(false));
  const settledEmpty = !loading && applications.length === 0;
  const emptied = open && settledEmpty;
  useEffect(() => {
    if (emptied) {
      close();
    }
  }, [emptied]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="theme-soft-blue"
        finalFocus={() => (settledEmpty ? (emptiedFocus?.() ?? true) : true)}
      >
        <DrawerTitle className="pt-4 text-lg leading-6.5 font-bold text-foreground">
          신청 중인 공개 그룹
        </DrawerTitle>
        <DrawerDescription className="pt-1 pb-2 text-[13px] leading-5 text-muted-foreground">
          그룹장이 {GROUP_ROOM_LIMITS.applicationTtlDays}일 안에 답하지 않으면 신청이 취소돼요
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
  const nameId = useId();
  const remaining = `${remainingText(application.expiresAt, now)} 남음`;
  return (
    <li className="flex min-h-17 items-center gap-2.5">
      <button
        type="button"
        aria-label={[application.roomName, application.categoryLabel, remaining].join(", ")}
        // Amplitude 클릭 자동 수집이 싣는 그룹 이름 글자와 aria-label을 가린다.
        data-amp-mask
        data-amp-mask-attributes="aria-label"
        // Sentry 클릭 기록은 aria-label 대신 이 이름을 적는다.
        data-sentry-element="PendingApplicationRow"
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
        신청 취소
      </button>
    </li>
  );
}

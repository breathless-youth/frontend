import { useId } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { RankAvatar } from "@/features/ranking/components/RankAvatar";

import { appliedAtText, remainingText } from "../model/timeText";
import type { ApplicationRequest } from "../types";

/**
 * 그룹장의 신청 확인
 *
 * 신청마다 소개 글과 남은 시간을 보고 신고, 거절, 수락 가운데 하나로 답한다.
 * 자리가 다 차도 신청은 기한까지 남으므로 목록은 유지하고 수락만 막는다.
 * 답을 보내는 중인 신청은 버튼을 모두 막아 같은 답이 두 번 나가지 않는다.
 */
export function RequestsScreen({
  roomName,
  remainingSeats,
  requests,
  now,
  busyId,
  onBack,
  onAccept,
  onReject,
  onReport,
}: {
  roomName: string;
  remainingSeats: number;
  requests: ApplicationRequest[];
  now: Date;
  /** 답을 보내는 중인 신청이고, 없으면 `null`이다. */
  busyId: number | null;
  onBack: () => void;
  onAccept: (applicationId: number) => void;
  onReject: (applicationId: number) => void;
  onReport: (applicationId: number) => void;
}) {
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader title="신청 확인" onBack={onBack} />
      <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <p className="pt-0.5 text-[13px] leading-5 wrap-break-word break-keep text-muted-foreground">
          {`${roomName} · 남은 자리 ${remainingSeats}`}
        </p>
        {requests.length === 0 ? (
          <p className="pt-16 text-center text-[15px] leading-5.5 text-muted-foreground">
            답을 기다리는 신청이 없어요
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3 pt-4">
              {requests.map((request) => (
                <RequestCard
                  key={request.applicationId}
                  request={request}
                  now={now}
                  busy={busyId === request.applicationId}
                  canAccept={remainingSeats > 0}
                  onAccept={onAccept}
                  onReject={onReject}
                  onReport={onReport}
                />
              ))}
            </ul>
            <p className="pt-4 text-center text-[13px] leading-5 break-keep text-muted-foreground">
              수락하면 바로 멤버가 되고, 신청한 사람에게 알림이 가요
            </p>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * 신청 하나의 카드
 *
 * 카드마다 같은 이름의 버튼 셋이 놓이므로 누구의 신청인지 닉네임을 설명으로 붙인다.
 */
function RequestCard({
  request,
  now,
  busy,
  canAccept,
  onAccept,
  onReject,
  onReport,
}: {
  request: ApplicationRequest;
  now: Date;
  busy: boolean;
  canAccept: boolean;
  onAccept: (applicationId: number) => void;
  onReject: (applicationId: number) => void;
  onReport: (applicationId: number) => void;
}) {
  const nameId = useId();
  const { applicationId } = request;
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-muted p-4 shadow-sb-card">
      <div className="flex items-center gap-2.5">
        <RankAvatar nickname={request.nickname} imageUrl={request.imageUrl} />
        <p
          id={nameId}
          className="min-w-0 flex-1 truncate text-base leading-5.5 font-bold text-foreground"
        >
          {request.nickname}
        </p>
        <p className="shrink-0 text-xs leading-4 text-muted-foreground">
          {appliedAtText(request.appliedAt, now)}
        </p>
      </div>
      <p className="text-[15px] leading-5.5 wrap-break-word whitespace-pre-line text-foreground">
        {`“${request.message}”`}
      </p>
      <p className="text-xs leading-4 text-muted-foreground">
        {`답하지 않으면 ${remainingText(request.expiresAt, now)} 뒤에 신청이 취소돼요`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-describedby={nameId}
          disabled={busy}
          onClick={() => onReport(applicationId)}
          className="mr-auto flex h-11 min-w-11 items-center rounded-sm px-1 text-[13px] leading-4 font-semibold text-muted-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none disabled:opacity-50"
        >
          신고
        </button>
        <Button
          variant="secondary"
          aria-describedby={nameId}
          disabled={busy}
          onClick={() => onReject(applicationId)}
          className="h-11 w-22 rounded-lg text-[15px] font-bold"
        >
          거절
        </Button>
        <Button
          aria-describedby={nameId}
          disabled={busy || !canAccept}
          onClick={() => onAccept(applicationId)}
          className="h-11 w-26 rounded-lg text-[15px] font-bold"
        >
          수락
        </Button>
      </div>
    </li>
  );
}

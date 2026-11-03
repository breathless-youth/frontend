import type { ReactNode, Ref } from "react";
import { Mic, MicOff } from "lucide-react";

import type { RoomMember } from "@focusmakers/types";

import { normalizeGoal } from "@/features/profile/profileValidation";
import { cn } from "@/lib/utils";

import { formatStudyHhMm } from "../roomGrid";
import { RoomAvatarFallback } from "./RoomAvatarFallback";

/**
 * UI
 * 룸 멤버 타일
 */

type TileBadgeState = "FOCUS" | "DISTRACTED" | "OFF" | "BREAK";

const TILE_BADGE_SPEC: Record<TileBadgeState, { label: string; border: string }> = {
  FOCUS: { label: "집중 중", border: "border-(--state-focus)" },
  DISTRACTED: { label: "휴식", border: "border-(--state-distract)" },
  OFF: { label: "카메라 꺼짐", border: "border-(--text-tertiary)" },
  // 뽀모도로 휴식은 측정을 멈춘 것이라 일시정지와 같은 색으로 보인다.
  BREAK: { label: "휴식 중", border: "border-(--text-tertiary)" },
};

/**
 * 상대 타일 시간 뱃지 상태
 *
 * 차단한 멤버는 카메라를 끈 사람처럼 보여서 무엇보다 먼저 꺼짐이다.
 * 휴식은 그룹 공부방에서만 오는 값이고, 휴식 중에는 카메라를 켜 둬도 측정이 멈춰 있어서 카메라보다 앞서 본다.
 */
function tileBadgeState(member: RoomMember, blocked: boolean): TileBadgeState {
  if (blocked) {
    return "OFF";
  }
  if (member.onBreak === true) {
    return "BREAK";
  }
  if (!member.cameraOn) {
    return "OFF";
  }
  return member.focusState === "DISTRACTED" ? "DISTRACTED" : "FOCUS";
}

/**
 * 닉네임 옆 마이크 아이콘
 *
 * 꺼짐과 켜짐을 모양으로 가르고 화면 낭독기에는 상태 글로 알린다.
 */
function TileMicIcon({ on }: { on: boolean }) {
  const Icon = on ? Mic : MicOff;
  return (
    <span
      role="img"
      aria-label={on ? "마이크 켜짐" : "마이크 꺼짐"}
      className={cn("flex shrink-0", on ? "text-white" : "text-white/72")}
    >
      <Icon
        aria-hidden="true"
        className="size-3.5 drop-shadow-[0_1px_2px_rgb(0_0_0/0.45)] regular:size-4 short-side-lg:size-5"
      />
    </span>
  );
}

/**
 * 상대 타일 순공 시간 뱃지
 *
 * 값은 서버가 보낸 순공 시간 그대로이고 기기에서 이어 세지 않는다.
 * 색만으로 상태를 전하지 않도록 상태 문구를 sr-only로 함께 둔다.
 */
function TileTimeBadge({
  state,
  focusSec,
  className,
}: {
  state: TileBadgeState;
  focusSec: number | undefined;
  className?: string;
}) {
  const spec = TILE_BADGE_SPEC[state];
  return (
    <div
      data-testid="tile-time-badge"
      data-state={state}
      className={cn(
        "inline-flex items-center rounded-full border-[1.5px] bg-[#101419]/68 px-3 py-1.25 backdrop-blur-[5px] regular:px-3.5 regular:py-1.5 short-side-lg:px-4.5 short-side-lg:py-2",
        spec.border,
        className,
      )}
    >
      <span className="text-[13px] leading-4 font-bold text-white tabular-nums regular:text-base regular:leading-5 short-side-lg:text-xl short-side-lg:leading-6.25">
        {focusSec === undefined ? "--:--" : formatStudyHhMm(focusSec)}
      </span>
      <span className="sr-only"> {spec.label}</span>
    </div>
  );
}

export type RoomTileProps = {
  member: RoomMember;
  /** 배경 미디어(내 타일의 로컬 카메라). 없거나 카메라 끔이면 아바타를 그린다. */
  media?: ReactNode;
  /** 내 타일이면 뱃지를 그리지 않는다. 내 시간은 화면 왼쪽 위 글자로 보여 준다. */
  isSelf?: boolean;
  /** 내 타일에만 넘긴다 — 카메라 켜기 모달이 미리보기 비율을 맞추려고 타일 박스를 잰다. */
  rootRef?: Ref<HTMLDivElement>;
  className?: string;
  /** 다른 사람 타일 오른쪽 아래 구석의 메뉴 버튼 */
  menuButton?: ReactNode;
  /** 말하는 중이면 초록 테두리로 감싼다. */
  speaking?: boolean;
  /** 닉네임 옆 마이크 상태이고, 소리가 없는 초대코드 방은 넘기지 않아 그리지 않는다. */
  micOn?: boolean;
  /** 차단한 멤버는 카메라를 켜 둬도 영상 대신 프로필로 그린다. */
  blocked?: boolean;
};

export function RoomTile({
  member,
  media,
  isSelf = false,
  rootRef,
  className,
  menuButton,
  speaking = false,
  micOn,
  blocked = false,
}: RoomTileProps) {
  const cameraShown = member.cameraOn && !blocked;
  const showMedia = cameraShown && media !== undefined;
  // 지운 목표는 서버에 빈 문자열로 남으므로 빈 줄을 그리지 않게 미설정으로 맞춘다.
  const goal = normalizeGoal(member.goal);
  return (
    <div
      ref={rootRef}
      data-testid="room-tile"
      data-user-id={member.userId}
      data-state={cameraShown ? member.focusState : "OFF"}
      data-speaking={speaking || undefined}
      className={`relative overflow-hidden rounded-xl bg-(--session-dialog-bg) ${className ?? ""}`}
    >
      {showMedia ? (
        <div className="absolute inset-0">{media}</div>
      ) : (
        <RoomAvatarFallback
          nickname={member.nickname}
          imageUrl={member.profileImageUrl}
          scaleWithTile
        />
      )}
      {showMedia && (
        /* 영상 위 텍스트 가독성용 하단 스크림 */
        <div
          aria-hidden="true"
          data-testid="tile-scrim"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-19 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_100%)]"
        />
      )}
      {!isSelf && (
        <TileTimeBadge
          state={tileBadgeState(member, blocked)}
          focusSec={member.focusSec}
          className="absolute top-2.5 right-2.5"
        />
      )}
      {/* 좁은 타일에서 줄이 늘면 영상을 가리므로 이름과 목표는 각각 한 줄로 줄인다.
          메뉴 버튼이 있으면 이름이 버튼 아래로 들어가지 않게 그만큼 오른쪽을 비운다. */}
      <div
        data-testid="tile-info"
        className={cn(
          "absolute bottom-3 left-3",
          menuButton === undefined ? "right-3" : "right-12",
        )}
      >
        <p className="flex min-w-0 items-center gap-1 text-[15px] font-bold text-white regular:text-[1.0625rem] short-side-lg:text-[1.3125rem]">
          <span className="min-w-0 truncate">{member.nickname}</span>
          {micOn !== undefined && <TileMicIcon on={micOn} />}
        </p>
        {goal !== null && (
          <p className="mt-1 truncate text-xs leading-3.75 text-white/72 regular:text-sm regular:leading-4.5 short-side-lg:text-[1.0625rem] short-side-lg:leading-5.5">
            {goal}
          </p>
        )}
      </div>
      {menuButton !== undefined && <div className="absolute right-1 bottom-1">{menuButton}</div>}
      {speaking && (
        <>
          {/* 초록 테두리는 Soft Blue 팔레트의 성공 색이라 세션의 어두운 바탕 안에 Soft Blue를 한 겹 둬서 어두운 값을 받는다. */}
          <span
            aria-hidden="true"
            className="theme-soft-blue pointer-events-none absolute inset-0 rounded-xl ring-3 ring-feedback-success ring-inset"
          />
          <span className="sr-only">말하는 중</span>
        </>
      )}
    </div>
  );
}

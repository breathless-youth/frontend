import type { ReactNode, Ref } from "react";
import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";

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

const TILE_BADGE_SPEC = {
  FOCUS: { labelKey: "tile.focus", border: "border-(--state-focus)" },
  DISTRACTED: { labelKey: "tile.distracted", border: "border-(--state-distract)" },
  OFF: { labelKey: "tile.off", border: "border-(--text-tertiary)" },
  // 뽀모도로 휴식은 측정을 멈춘 것이라 일시정지와 같은 색으로 보인다.
  BREAK: { labelKey: "tile.break", border: "border-(--text-tertiary)" },
} as const satisfies Record<TileBadgeState, { labelKey: string; border: string }>;

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
  const { t } = useTranslation("live-room");
  const Icon = on ? Mic : MicOff;
  return (
    <span
      role="img"
      aria-label={on ? t("tile.aria.micOn") : t("tile.aria.micOff")}
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
  const { t } = useTranslation("live-room");
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
      <span className="sr-only"> {t(spec.labelKey)}</span>
    </div>
  );
}

/**
 * 목표 문구가 내려가고 올라오는 전환
 *
 * 아래 바와 한 덩어리로 보이도록 RoomControlBar의 슬라이드와 같은 시간과 곡선을 쓴다.
 * 이름과 목표 묶음이 타일 아래에 붙어 있어서 목표 줄을 없애면 묶음이 줄어 닉네임이 갑자기 내려가므로 줄의 자리는 유지하고, 닉네임은 아래 `NICKNAME_DROP`으로 같이 내려보낸다.
 * 위치와 투명도만 바꾸므로 타일에 레이아웃 전환을 쓰지 않는 규칙도 지킨다.
 * 이동 거리는 문구 높이에 `bottom-3`과 같은 간격 토큰 3칸을 더해, 문구가 타일 아래 끝 밖으로 나가는 만큼이다.
 * 보일 때의 위치도 `translate-y-0`으로 적어 두 상태가 모두 값을 가진 채로 전환한다.
 * 동작 줄이기에서는 위치를 바꾸지 않고 바로 감춘다.
 */
const GOAL_SLIDE =
  "translate-y-0 transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none data-hidden:opacity-0 motion-safe:data-hidden:translate-y-[calc(100%+var(--spacing)*3)]";

/**
 * 목표가 숨을 때 닉네임 줄이 목표 자리로 내려오는 전환
 *
 * 목표 줄이 숨은 뒤 그 자리가 빈 띠로 남지 않게 닉네임 줄을 목표 줄의 위 간격과 높이만큼 내린다.
 * 시간과 곡선은 바와 목표 줄과 같다.
 * 자리를 비우지 않으려는 위치 이동이라 동작 줄이기에서도 위치는 바뀌고 전환만 끈다.
 * 내리는 거리는 목표 줄이 읽는 `--goal-line`에 위 간격 한 칸을 더한 값이라 목표 줄 높이를 바꾸면 함께 바뀐다.
 */
const NICKNAME_DROP =
  "translate-y-0 transition-[translate] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none data-dropped:translate-y-[calc(var(--goal-line)+var(--spacing))]";

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
  /**
   * 아래 바가 내려간 동안 목표 문구를 바와 함께 내리며 감춘다.
   *
   * 목표가 있는 타일은 닉네임과 마이크 아이콘이 든 줄이 같은 시간과 곡선으로 그 자리로 내려온다.
   * 화면 낭독기는 감춘 문구도 읽어야 해서 `aria-hidden`을 쓰지 않는다.
   */
  goalHidden?: boolean;
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
  goalHidden = false,
}: RoomTileProps) {
  const { t } = useTranslation("live-room");
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
      className={`relative overflow-hidden rounded-xl bg-(--session-dialog-bg) [--tile-scrim-height:--spacing(19)] ${className ?? ""}`}
    >
      {showMedia ? (
        <div className="absolute inset-0">{media}</div>
      ) : (
        <RoomAvatarFallback imageUrl={member.profileImageUrl} scaleWithTile />
      )}
      {showMedia && (
        <>
          {/* 영상 위 텍스트 가독성용 하단 스크림 */}
          <div
            aria-hidden="true"
            data-testid="tile-scrim"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-(--tile-scrim-height) bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_100%)]"
          />
        </>
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
          "[--goal-line:--spacing(3.75)] regular:[--goal-line:--spacing(4.5)] short-side-lg:[--goal-line:--spacing(5.5)]",
        )}
      >
        <p
          data-dropped={(goal !== null && goalHidden) || undefined}
          className={cn(
            "flex min-w-0 items-center gap-1 text-[15px] font-bold text-white regular:text-[1.0625rem] short-side-lg:text-[1.3125rem]",
            NICKNAME_DROP,
          )}
        >
          <span className="min-w-0 truncate">{member.nickname}</span>
          {micOn !== undefined && <TileMicIcon on={micOn} />}
        </p>
        {goal !== null && (
          <p
            data-hidden={goalHidden || undefined}
            className={cn(
              "mt-1 truncate text-xs leading-(--goal-line) text-white/72 regular:text-sm short-side-lg:text-[1.0625rem]",
              GOAL_SLIDE,
            )}
          >
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
          <span className="sr-only">{t("tile.aria.speaking")}</span>
        </>
      )}
    </div>
  );
}

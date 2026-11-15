import { Crown } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/Skeleton";
import { RankAvatar } from "@/features/ranking/components/RankAvatar";
import { cn } from "@/lib/utils";

import { InviteCard } from "../components/InviteCard";
import { MemberMenu } from "../components/MemberMenu";
import { memberCountText } from "../model/limits";
import type { RoomVisibility } from "../model/roomMenu";
import { lastStudiedText } from "../model/timeText";
import type { RoomMemberRow } from "../types";
import { visibilityText } from "../visibility";
import { GroupScreenFrame } from "./GroupScreenFrame";

/**
 * 멤버 관리와 멤버 보기
 *
 * 그룹장이 보는 멤버 관리는 비공개 그룹이면 맨 위에 초대 카드를 두고, 그룹장과 나를 뺀 멤버 줄마다 메뉴를 둔다.
 * 멤버가 보는 멤버 보기는 같은 목록에서 초대 카드와 멤버 줄 메뉴만 뺀다.
 * 마지막으로 온 날은 오래 오지 않은 멤버를 찾는 데 쓰고, 그런 멤버도 자리를 자동으로 비우지 않는다.
 * 받아 둔 멤버가 있으면 그것을 보이고, 없을 때만 목록 자리에 오류나 자리표시를 둔다.
 */
export function MembersScreen({
  mode,
  roomName,
  visibility,
  memberCount,
  members,
  invite,
  inviteError,
  now,
  loading = false,
  error,
  defaultMenuUserId,
  onBack,
  onTransfer,
  onKick,
}: {
  mode: "manage" | "view";
  roomName: string;
  visibility: RoomVisibility;
  memberCount: number;
  members: RoomMemberRow[];
  /** 비공개 그룹의 초대 링크와 코드이고, 공개 그룹이거나 아직 받지 못했으면 `null`이다. */
  invite: ComponentProps<typeof InviteCard> | null;
  /** 초대코드를 받지 못했을 때 초대 카드 자리에 둘 오류 표시이고, 다시 시도까지 호출부가 채운다. */
  inviteError?: ReactNode;
  now: Date;
  loading?: boolean;
  /** 멤버를 받지 못했을 때 목록 자리에 둘 오류 표시이고, 다시 시도까지 호출부가 채운다. */
  error?: ReactNode;
  /** 개발용 화면 모음에서 이 멤버의 메뉴가 열린 모습을 바로 보려고 쓴다. */
  defaultMenuUserId?: number;
  onBack: () => void;
  onTransfer: (userId: number) => void;
  onKick: (userId: number) => void;
}) {
  const { t } = useTranslation("group-room");
  const listTitleId = useId();
  const manage = mode === "manage";
  let list: ReactNode;
  if (members.length > 0) {
    list = (
      <ul
        aria-labelledby={listTitleId}
        className="mt-2 flex flex-col rounded-xl bg-muted py-1 pr-1.5 pl-4 shadow-sb-card"
      >
        {members.map((member) => {
          let menu: ReactNode = null;
          if (manage && (member.isOwner || member.isMe)) {
            // 메뉴가 없는 줄도 마지막으로 온 날이 다른 줄과 같은 자리에 오도록 메뉴 폭만큼 비운다.
            menu = <span aria-hidden="true" className="w-11 shrink-0" />;
          } else if (manage) {
            menu = (
              <MemberMenu
                nickname={member.nickname}
                defaultOpen={member.userId === defaultMenuUserId}
                onTransfer={() => onTransfer(member.userId)}
                onKick={() => onKick(member.userId)}
              />
            );
          }
          return <MemberRow key={member.userId} member={member} now={now} menu={menu} />;
        })}
      </ul>
    );
  } else if (error) {
    list = <div className="pt-2">{error}</div>;
  } else if (loading) {
    list = <Skeleton className="mt-2 h-72 rounded-xl" />;
  } else {
    list = null;
  }
  let inviteSlot: ReactNode = null;
  if (manage && visibility === "private") {
    if (invite !== null) {
      inviteSlot = <InviteCard {...invite} />;
    } else if (inviteError) {
      inviteSlot = inviteError;
    }
  }
  return (
    <GroupScreenFrame
      title={manage ? t("membersScreen.titleManage") : t("membersScreen.titleView")}
      onBack={onBack}
    >
      <p className="pt-0.5 text-[13px] leading-5 wrap-break-word break-keep text-muted-foreground">
        {`${roomName} · ${visibilityText(visibility)} · ${memberCountText(memberCount)}`}
      </p>
      {inviteSlot !== null && <div className="pt-4">{inviteSlot}</div>}
      <div className="flex items-center justify-between gap-3 pt-4.5">
        <h2 id={listTitleId} className="text-[15px] leading-5.5 font-bold text-foreground">
          {t("membersScreen.listTitle")}
        </h2>
        <p className="shrink-0 text-xs leading-4 text-muted-foreground">
          {t("membersScreen.lastActive")}
        </p>
      </div>
      {list}
      <p className="pt-4 text-center text-xs leading-4.5 break-keep text-muted-foreground">
        {t("membersScreen.ownerLeaveNote")}
      </p>
    </GroupScreenFrame>
  );
}

/**
 * 멤버 한 줄
 *
 * 그룹장은 이름 뒤 왕관을 글로도 읽히게 한다.
 */
function MemberRow({ member, now, menu }: { member: RoomMemberRow; now: Date; menu: ReactNode }) {
  const { t } = useTranslation("group-room");
  const lastText = lastStudiedText(member.lastStudiedAt, now);
  return (
    <li className="flex min-h-14 items-center gap-2.5 border-b border-border last:border-b-0">
      <RankAvatar me={member.isMe} imageUrl={member.imageUrl} />
      <p className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={cn(
            "truncate text-[15px] leading-5.5 text-foreground",
            member.isMe && "font-bold",
            !member.isMe && "font-semibold",
          )}
        >
          {member.nickname}
        </span>
        {member.isOwner && (
          <Crown
            role="img"
            aria-label={t("membersScreen.aria.owner")}
            size={16}
            strokeWidth={2.2}
            className="shrink-0 fill-brand-subtle text-primary"
          />
        )}
      </p>
      {lastText !== null && (
        <span className="shrink-0 text-[13px] leading-5 text-muted-foreground">{lastText}</span>
      )}
      {menu}
    </li>
  );
}

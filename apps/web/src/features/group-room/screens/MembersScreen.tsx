import { Crown } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { RankAvatar } from "@/features/ranking/components/RankAvatar";
import { cn } from "@/lib/utils";

import { InviteCard } from "../components/InviteCard";
import { MemberMenu } from "../components/MemberMenu";
import { memberName } from "../memberName";
import { memberCountText } from "../model/limits";
import type { RoomVisibility } from "../model/roomMenu";
import { lastStudiedText } from "../model/timeText";
import type { RoomMemberRow } from "../types";
import { VISIBILITY_TEXT } from "../visibility";

/**
 * 멤버 관리와 멤버 보기
 *
 * 그룹장이 보는 멤버 관리는 비공개 그룹이면 맨 위에 초대 카드를 두고, 그룹장과 나를 뺀 멤버 줄마다 메뉴를 둔다.
 * 멤버가 보는 멤버 보기는 같은 목록에서 초대 카드와 멤버 줄 메뉴만 뺀다.
 * 마지막으로 온 날은 그룹 홈 책상의 표기와 같은 값이고, 오래 오지 않은 멤버도 자리를 자동으로 비우지 않는다.
 */
export function MembersScreen({
  mode,
  roomName,
  visibility,
  memberCount,
  members,
  invite,
  now,
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
  now: Date;
  /** 개발용 화면 모음에서 이 멤버의 메뉴가 열린 모습을 바로 보려고 쓴다. */
  defaultMenuUserId?: number;
  onBack: () => void;
  onTransfer: (userId: number) => void;
  onKick: (userId: number) => void;
}) {
  const listTitleId = useId();
  const manage = mode === "manage";
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader title={manage ? "멤버 관리" : "멤버 보기"} onBack={onBack} />
      <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <p className="pt-0.5 text-[13px] leading-5 wrap-break-word break-keep text-muted-foreground">
          {`${roomName} · ${VISIBILITY_TEXT[visibility]} · ${memberCountText(memberCount)}`}
        </p>
        {manage && visibility === "private" && invite !== null && (
          <div className="pt-4">
            <InviteCard {...invite} />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-4.5">
          <h2 id={listTitleId} className="text-[15px] leading-5.5 font-bold text-foreground">
            멤버
          </h2>
          <p className="shrink-0 text-xs leading-4 text-muted-foreground">마지막으로 온 날</p>
        </div>
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
        <p className="pt-4 text-center text-xs leading-4.5 break-keep text-muted-foreground">
          그룹장은 다른 멤버에게 그룹장을 넘긴 뒤에 그룹을 나갈 수 있어요
        </p>
      </div>
    </main>
  );
}

/**
 * 멤버 한 줄
 *
 * 지금 보는 사람은 닉네임 대신 나로 쓰고, 그룹장은 이름 뒤 왕관을 글로도 읽히게 한다.
 */
function MemberRow({ member, now, menu }: { member: RoomMemberRow; now: Date; menu: ReactNode }) {
  const name = memberName(member);
  const lastText = lastStudiedText(member.lastStudiedAt, now);
  return (
    <li className="flex min-h-14 items-center gap-2.5 border-b border-border last:border-b-0">
      <RankAvatar nickname={name} me={member.isMe} imageUrl={member.imageUrl} />
      <p className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={cn(
            "truncate text-[15px] leading-5.5 text-foreground",
            member.isMe && "font-bold",
            !member.isMe && "font-semibold",
          )}
        >
          {name}
        </span>
        {member.isOwner && (
          <Crown
            role="img"
            aria-label="그룹장"
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

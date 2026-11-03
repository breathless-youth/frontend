import { useId } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { RankAvatar } from "@/features/ranking/components/RankAvatar";

import type { BlockedUser } from "../types";

/**
 * 설정의 차단 목록
 *
 * 차단 해제는 확인 창 없이 바로 넘기고, 푸는 중인 사람의 버튼만 막아 같은 요청이 두 번 나가지 않는다.
 * 줄마다 같은 이름의 버튼이 놓이므로 누구를 푸는지 닉네임을 설명으로 붙인다.
 */
export function BlockListScreen({
  users,
  unblockingId,
  onBack,
  onUnblock,
}: {
  users: BlockedUser[];
  /** 차단을 푸는 중인 사람이고, 없으면 `null`이다. */
  unblockingId: number | null;
  onBack: () => void;
  onUnblock: (userId: number) => void;
}) {
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader title="차단 목록" onBack={onBack} />
      <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <p className="pt-1.5 text-[13px] leading-5 break-keep text-muted-foreground">
          차단한 사람과는 공부방에서 화면과 소리가 오가지 않아요
        </p>
        {users.length === 0 ? (
          <p className="pt-16 text-center text-[15px] leading-5.5 text-muted-foreground">
            차단한 사람이 없어요
          </p>
        ) : (
          <ul className="mt-4.5 flex flex-col rounded-xl bg-muted py-1 pr-2 pl-4 shadow-sb-card">
            {users.map((user) => (
              <BlockedRow
                key={user.userId}
                user={user}
                unblocking={unblockingId === user.userId}
                onUnblock={onUnblock}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function BlockedRow({
  user,
  unblocking,
  onUnblock,
}: {
  user: BlockedUser;
  unblocking: boolean;
  onUnblock: (userId: number) => void;
}) {
  const nameId = useId();
  return (
    <li className="flex min-h-15 items-center gap-2.5 border-b border-border last:border-b-0">
      <RankAvatar nickname={user.nickname} imageUrl={user.imageUrl} />
      <p
        id={nameId}
        className="min-w-0 flex-1 truncate text-[15px] leading-5.5 font-bold text-foreground"
      >
        {user.nickname}
      </p>
      <Button
        variant="secondary"
        aria-describedby={nameId}
        disabled={unblocking}
        onClick={() => onUnblock(user.userId)}
        className="h-11 shrink-0 rounded-[14px] px-3.5 text-[13px] font-bold"
      >
        차단 해제
      </Button>
    </li>
  );
}

import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { RankAvatar } from "@/features/ranking/components/RankAvatar";

import type { BlockedUser } from "../types";
import { GroupScreenFrame } from "./GroupScreenFrame";

/**
 * 설정의 차단 목록
 *
 * 차단 해제는 확인 창 없이 바로 넘기고, 푸는 중인 사람의 버튼만 막아 같은 요청이 두 번 나가지 않는다.
 * 줄마다 같은 이름의 버튼이 놓이므로 누구를 푸는지 닉네임을 설명으로 붙인다.
 * 받아 둔 목록이 있으면 그것을 보이고, 없을 때만 목록 자리에 오류나 자리표시를 둔다.
 */
export function BlockListScreen({
  users,
  unblockingId,
  loading = false,
  error,
  onBack,
  onUnblock,
}: {
  users: BlockedUser[];
  /** 차단을 푸는 중인 사람이고, 없으면 `null`이다. */
  unblockingId: number | null;
  loading?: boolean;
  /** 목록을 받지 못했을 때 목록 자리에 둘 오류 표시이고, 다시 시도까지 호출부가 채운다. */
  error?: ReactNode;
  onBack: () => void;
  onUnblock: (userId: number) => void;
}) {
  const { t } = useTranslation("group-room");
  let list: ReactNode;
  if (users.length > 0) {
    list = (
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
    );
  } else if (error) {
    list = <div className="pt-4.5">{error}</div>;
  } else if (loading) {
    list = <Skeleton className="mt-4.5 h-32 rounded-xl" />;
  } else {
    list = (
      <p className="pt-16 text-center text-[15px] leading-5.5 text-muted-foreground">
        {t("blockListScreen.empty")}
      </p>
    );
  }
  return (
    <GroupScreenFrame title={t("blockListScreen.title")} onBack={onBack}>
      <p className="pt-1.5 text-[13px] leading-5 break-keep text-muted-foreground">
        {t("blockListScreen.description")}
      </p>
      {list}
    </GroupScreenFrame>
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
  const { t } = useTranslation("group-room");
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
        {t("blockListScreen.unblock")}
      </Button>
    </li>
  );
}

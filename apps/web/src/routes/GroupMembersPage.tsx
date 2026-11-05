import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { toRoomMemberRow, toRoomVisibility } from "@/features/group-room/fromApi";
import {
  groupRetryCopy,
  groupErrorCode,
  groupErrorCopy,
  isGroupGoneError,
} from "@/features/group-room/groupErrorCopy";
import type { GroupAction } from "@/features/group-room/groupErrorCopy";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import {
  inviteCodeRenewedCopy,
  kickMemberDialog,
  transferOwnerDialog,
} from "@/features/group-room/model/roomMenu";
import { parseRouteId } from "@/features/group-room/routeId";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { MembersScreen } from "@/features/group-room/screens/MembersScreen";
import { shareGroupInvite } from "@/features/group-room/shareGroupInvite";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { useNow } from "@/features/ranking/useNow";
import { kickGroupMember, regenerateGroupInvite, transferGroupOwner } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  groupHomeQuery,
  groupInviteQuery,
  groupKeys,
  groupMembersQuery,
  invalidateGroupMembership,
} from "@/lib/groupRoomQueries";
import { useScreenVisible } from "@/lib/nativeTabFocus";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 멤버 관리와 멤버 보기
 *
 * 그룹장이면 멤버 관리, 멤버면 멤버 보기이고, 신원이 정해지기 전에는 그리지 않는다.
 */
export function GroupMembersPage() {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const groupId = parseRouteId(useParams().groupId);
  const location = useLocation();
  if (identityPending) {
    return null;
  }
  if (userId === null || groupId === null) {
    return <Navigate to={{ pathname: "/social", search: baseSearch(location.search) }} replace />;
  }
  return <GroupMembers key={`${userId}:${groupId}`} userId={userId} groupId={groupId} />;
}

type MemberAction = { kind: "transfer" | "kick"; userId: number; nickname: string };

/**
 * 멤버 화면 본문
 *
 * 그룹 이름, 역할, 공개 여부는 그룹 홈 응답에서 읽고, 멤버 줄을 받는 동안에는 목록 자리에만 자리표시를 둔다.
 * 비공개 그룹에서 내보내면 서버가 초대코드를 새로 만들어서 알리고 초대 카드의 코드를 다시 받는다.
 * 그룹장이 바뀌어 막히면 그룹 홈으로 돌아가고, 대상이 이미 나갔으면 알리지 않고 멤버를 다시 받는다.
 */
function GroupMembers({ userId, groupId }: { userId: number; groupId: number }) {
  const queryClient = useQueryClient();
  const back = useBackTo(`/social/groups/${groupId}`);
  const visible = useScreenVisible();
  const now = new Date(useNow(visible ? 60_000 : null));

  // 이 화면은 그룹 이름과 역할만 읽어서 그룹 홈처럼 30초마다 다시 받지 않는다.
  const homeQuery = useQuery({ ...groupHomeQuery(userId, groupId), refetchInterval: false });
  const home = homeQuery.data;
  const membersQuery = useQuery(groupMembersQuery(userId, groupId));
  const manage = home?.myRole === "OWNER";
  const isPrivate = home?.visibility === "PRIVATE";
  const inviteQuery = useQuery({
    ...groupInviteQuery(userId, groupId),
    enabled: manage && isPrivate,
  });

  const [action, setAction] = useState<MemberAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const refreshMembers = () => void invalidateGroupMembership(queryClient, userId, groupId);
  // 그룹장만 할 수 있는 변경이 막히면 고르던 일을 접고 막힌 까닭에 맞는 화면으로 간다.
  // 그룹 홈에서 왔으면 그 화면으로 돌아가서 같은 그룹 홈이 기록에 두 번 쌓이지 않는다.
  const handleOwnerActionError = (groupAction: GroupAction, error: Error) => {
    setDialogOpen(false);
    const code = groupErrorCode(error);
    if (code === "NOT_GROUP_OWNER") {
      refreshMembers();
      back();
      return;
    }
    if (code === "GROUP_MEMBER_NOT_FOUND") {
      refreshMembers();
      return;
    }
    // 내보내졌거나 그룹이 사라졌으면 아래 사라진 그룹 처리가 그룹 탭으로 데려간다.
    if (!isGroupGoneError(error)) {
      showToast(groupErrorCopy(groupAction, error));
    }
  };

  const kick = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (memberId: number) => kickGroupMember(groupId, memberId),
    onSuccess: () => {
      setDialogOpen(false);
      if (isPrivate) {
        showToast(inviteCodeRenewedCopy());
        void queryClient.invalidateQueries({ queryKey: groupKeys.invite(userId, groupId) });
      }
      refreshMembers();
    },
    onError: (error) => handleOwnerActionError("kick", error),
  });
  const transfer = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (memberId: number) => transferGroupOwner(groupId, memberId),
    onSuccess: () => {
      setDialogOpen(false);
      refreshMembers();
    },
    onError: (error) => handleOwnerActionError("transfer", error),
  });
  const regenerate = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: () => regenerateGroupInvite(groupId),
    onSuccess: (invite) => {
      queryClient.setQueryData(groupKeys.invite(userId, groupId), invite);
    },
    onError: (error) => handleOwnerActionError("regenerate_invite", error),
  });
  const answering = kick.isPending || transfer.isPending;

  useLeaveWhenGone(
    [homeQuery.error, membersQuery.error, kick.error, transfer.error, regenerate.error].find(
      isGroupGoneError,
    ) ?? null,
    groupId,
  );

  if (home === undefined) {
    const failed = cannotLoadFirst(homeQuery) && !isGroupGoneError(homeQuery.error);
    return (
      <GroupScreenFrame onBack={back}>
        {failed ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void homeQuery.refetch()}
            screen="group_tab"
          />
        ) : (
          <div className="flex flex-col gap-4 pt-0.5">
            <Skeleton className="h-5 w-56 rounded-md" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        )}
      </GroupScreenFrame>
    );
  }

  const members = (membersQuery.data?.members ?? []).map((item) => toRoomMemberRow(item, userId));
  const openAction = (kind: MemberAction["kind"], memberId: number) => {
    const member = members.find((row) => row.userId === memberId);
    if (member === undefined) {
      return;
    }
    setAction({ kind, userId: memberId, nickname: member.nickname });
    setDialogOpen(true);
  };
  const invite = inviteQuery.data;
  const dialogCopy =
    action === null
      ? null
      : action.kind === "transfer"
        ? transferOwnerDialog(action.nickname)
        : kickMemberDialog(action.nickname);

  return (
    <>
      <MembersScreen
        mode={manage ? "manage" : "view"}
        roomName={home.name}
        visibility={toRoomVisibility(home.visibility)}
        memberCount={home.memberCount}
        members={members}
        invite={
          manage && isPrivate && invite !== undefined
            ? {
                code: invite.inviteCode,
                canRegenerate: true,
                onShareLink: () => void shareGroupInvite(invite.inviteCode),
                onRegenerate: () => {
                  // 확인 없이 바로 보내는 버튼이라 연달아 눌러도 코드를 한 번만 바꾼다.
                  if (!regenerate.isPending) {
                    regenerate.mutate();
                  }
                },
              }
            : null
        }
        inviteError={
          // 초대 카드가 사라지면 코드를 받지 못했다는 것을 알 수 없어서 그 자리에 다시 시도를 둔다.
          cannotLoadFirst(inviteQuery) && !isGroupGoneError(inviteQuery.error) ? (
            <ErrorState
              message={groupRetryCopy()}
              onRetry={() => void inviteQuery.refetch()}
              screen="group_tab"
            />
          ) : undefined
        }
        now={now}
        loading={membersQuery.isPending}
        error={
          cannotLoadFirst(membersQuery) && !isGroupGoneError(membersQuery.error) ? (
            <ErrorState
              message={groupRetryCopy()}
              onRetry={() => void membersQuery.refetch()}
              screen="group_tab"
            />
          ) : undefined
        }
        onBack={back}
        onTransfer={(memberId) => openAction("transfer", memberId)}
        onKick={(memberId) => openAction("kick", memberId)}
      />
      {action !== null && dialogCopy !== null && (
        <ConfirmDialog
          open={dialogOpen}
          {...dialogCopy}
          pending={answering}
          // 두 창 모두 문구에 멤버의 닉네임이 들어간다.
          maskFromAnalytics
          onCancel={() => setDialogOpen(false)}
          onConfirm={() => {
            if (answering) {
              return;
            }
            if (action.kind === "kick") {
              kick.mutate(action.userId);
            } else {
              transfer.mutate(action.userId);
            }
          }}
        />
      )}
    </>
  );
}

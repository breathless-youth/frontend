import type { GroupHomeResponse } from "@focusmakers/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { GroupNotificationPrompt } from "@/features/group-room/components/GroupNotificationPrompt";
import { enterGroupStudyRoom } from "@/features/group-room/enterGroupStudyRoom";
import { toRoomHome } from "@/features/group-room/fromApi";
import {
  groupRetryCopy,
  groupErrorCode,
  groupErrorCopy,
  isGroupGoneError,
} from "@/features/group-room/groupErrorCopy";
import { markLocalMembership } from "@/features/group-room/groupMembershipTracker";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { leaveRoomDialog, otherMemberCount } from "@/features/group-room/model/roomMenu";
import type { LeaveDialog, RoomMenuItem } from "@/features/group-room/model/roomMenu";
import { parseRouteId } from "@/features/group-room/routeId";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { RoomHomeScreen } from "@/features/group-room/screens/RoomHomeScreen";
import { shareGroupInvite } from "@/features/group-room/shareGroupInvite";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import type { GroupRoomLocationState } from "@/features/live-room/liveRoomEntryState";
import { GraceEndDialog } from "@/features/social-room/GraceEndDialog";
import { useSocialRoomNoticeHandoff } from "@/features/social-room/useSocialRoomNoticeHandoff";
import { trackGroupRoomLeft, trackGroupRoomNotificationToggled } from "@/lib/amplitude";
import type { GroupRoomLeaveReason } from "@/lib/amplitude";
import { leaveGroup, setGroupNotification } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  dropFromMyGroups,
  forgetGroup,
  groupHomeQuery,
  groupInviteQuery,
  groupKeys,
  invalidateGroupMembership,
} from "@/lib/groupRoomQueries";
import { haptic } from "@/lib/haptics";
import { slideNavigate } from "@/lib/pageTransition";
import { showIconToast, showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 그룹 홈
 *
 * 신원이 정해지기 전에는 그리지 않아서, 첫 렌더의 빈 신원을 멤버 아님으로 읽고 그룹 탭으로 돌려보내지 않는다.
 * 신원 없이 열었거나 주소의 그룹 번호가 번호가 아니면 그룹 탭으로 바꿔 간다.
 * 다른 그룹으로 바로 이동하면 확인 창과 나간 표시가 앞 그룹에 남지 않게 그룹마다 새로 그린다.
 * 그룹 공부방에서 자리를 오래 비우거나 방이 사라져 돌아오면 남겨 둔 안내를 여기서 띄운다.
 */
export function GroupHomePage() {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const groupId = parseRouteId(useParams().groupId);
  const location = useLocation();
  const { graceMessage, dismissGrace } = useSocialRoomNoticeHandoff();
  if (identityPending) {
    return null;
  }
  if (userId === null || groupId === null) {
    return <Navigate to={{ pathname: "/social", search: baseSearch(location.search) }} replace />;
  }
  return (
    <>
      <GroupHome key={`${userId}:${groupId}`} userId={userId} groupId={groupId} />
      <GraceEndDialog message={graceMessage} onClose={dismissGrace} />
    </>
  );
}

/**
 * 그룹 홈 본문
 *
 * 스스로 나가면 먼저 온 화면으로 돌아가고 이 그룹의 조회는 다시 받지 않는다.
 * 나간 그룹을 다시 받으면 서버가 멤버가 아니라고 답해 그 안내가 뜨기 때문이고, 그 조회는 화면을 벗어난 뒤 캐시에서 뺀다.
 */
function GroupHome({ userId, groupId }: { userId: number; groupId: number }) {
  const { t } = useTranslation("group-room");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const back = useBackTo("/social");
  const search = baseSearch(location.search);
  const groupPath = `/social/groups/${groupId}`;
  const go = (pathname: string) => slideNavigate("forward", () => navigate({ pathname, search }));

  const [left, setLeft] = useState(false);
  const homeQuery = useQuery({ ...groupHomeQuery(userId, groupId), enabled: !left });
  const home = homeQuery.data;
  // 비공개 그룹은 멤버도 초대할 수 있어, 메뉴의 초대하기가 기다리지 않고 공유 시트를 열도록 코드를 미리 받는다.
  useQuery({
    ...groupInviteQuery(userId, groupId),
    enabled: !left && home?.visibility === "PRIVATE",
  });
  const enterRoom = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: () => enterGroupStudyRoom(userId, groupId),
  });
  // 결과 처리는 mutate에 넘겨 그룹 홈이 화면에 있는 동안만 한다.
  // 자리를 잡는 사이 뒤로 가면 TanStack이 이 처리를 건너뛰어 떠난 사람을 공부방으로 데려가지 않는다.
  const enterStudyRoom = () => {
    if (enterRoom.isPending) {
      return;
    }
    enterRoom.mutate(undefined, {
      onSuccess: (seat) => {
        const state: GroupRoomLocationState = {
          roomId: seat.roomId,
          graceRejoin: seat.graceRejoin,
          iceServers: seat.iceServers,
        };
        // 공부방은 나갈 때 늘 그룹 홈으로 바꿔 가서, 그룹 홈 기록을 공부방으로 바꿔 두어야 뒤로 가기에 같은 그룹 홈이 두 번 쌓이지 않는다.
        navigate({ pathname: `${groupPath}/room`, search }, { replace: true, state });
      },
      onError: (error) => {
        // 내보내졌거나 그룹이 사라졌으면 아래 훅이 그룹 탭으로 데려가며 이유를 알린다.
        if (!isGroupGoneError(error)) {
          showToast(groupErrorCopy("load", error));
        }
      },
    });
  };
  // 자리 잡기의 멤버 아님이 홈을 다시 받다 실패한 오류에 가려지면 누름이 아무 안내 없이 끝나서 먼저 본다.
  const goneError = isGroupGoneError(enterRoom.error) ? enterRoom.error : homeQuery.error;
  useLeaveWhenGone(left ? null : goneError, groupId);
  useEffect(() => {
    if (!left) {
      return;
    }
    return () => forgetGroup(queryClient, userId, groupId);
  }, [left, queryClient, userId, groupId]);

  const notify = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (enabled: boolean) => setGroupNotification(groupId, enabled),
    // 30초마다 다시 받는 조회가 바꾼 값을 덮지 않게 받는 중인 조회를 멈춘 뒤 바로 바꾸고, 실패하면 되돌린다.
    // 흐르는 공부 시간은 받은 시각부터 세어서, 종만 바꿀 때 받은 시각까지 지금으로 바꾸면 시간이 뒤로 간다.
    onMutate: async (enabled) => {
      const queryKey = groupKeys.home(userId, groupId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<GroupHomeResponse>(queryKey);
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
      queryClient.setQueryData<GroupHomeResponse>(
        queryKey,
        (current) => (current === undefined ? current : { ...current, notifyEnabled: enabled }),
        { updatedAt },
      );
      return { previous, updatedAt };
    },
    onError: (error, _enabled, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(groupKeys.home(userId, groupId), context.previous, {
          updatedAt: context.updatedAt,
        });
      }
      // 내보내졌다면 다시 받은 그룹 홈이 그룹 탭으로 데려가며 이유를 알린다.
      if (!isGroupGoneError(error)) {
        showToast(groupRetryCopy());
      }
    },
    onSuccess: (_data, enabled) => trackGroupRoomNotificationToggled(enabled),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.home(userId, groupId) });
    },
  });

  const changeNotification = (enabled: boolean) => {
    if (notify.isPending) return;
    haptic("light");
    notify.mutate(enabled, {
      onSuccess: () => {
        showIconToast(
          t(enabled ? "notificationPrompt.enabled" : "notificationPrompt.disabled"),
          enabled ? (
            <Bell aria-hidden="true" size={16} className="shrink-0 fill-current" />
          ) : (
            <BellOff aria-hidden="true" size={16} className="shrink-0" />
          ),
        );
      },
    });
  };

  const [leaveDialog, setLeaveDialog] = useState<LeaveDialog | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const openLeaveDialog = (dialog: LeaveDialog) => {
    setLeaveDialog(dialog);
    setLeaveOpen(true);
  };
  // 그룹 탭에서 왔으면 그 기록으로 돌아가서 같은 탭이 기록에 두 번 쌓이지 않고 보던 탭과 검색 조건도 남는다.
  // 앞 화면 없이 열렸으면 그룹 탭으로 바꿔 간다.
  // 나간 그룹 홈은 앞으로 가기 기록에만 남고, 앞으로 가기로 그룹 화면에 다시 들어오면 historyGuard가 되돌린다.
  // 그룹 탭이 내 그룹을 다시 받는 동안 나간 그룹 카드가 보이지 않게 돌아가기 전에 받아 둔 목록에서 뺀다.
  const finishLeaving = () => {
    setLeft(true);
    setLeaveOpen(false);
    dropFromMyGroups(queryClient, userId, groupId);
    back();
    void invalidateGroupMembership(queryClient, userId);
  };
  const leave = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    // 나간 이유는 계측에만 쓰고 서버에는 그룹만 보낸다.
    mutationFn: (_reason: Exclude<GroupRoomLeaveReason, "kicked">) => leaveGroup(groupId),
    onSuccess: (_data, reason) => {
      // 그룹 탭이 이 그룹을 내보내짐으로 세지 않게 받아 둔 목록에서 빼고 다시 받기 전에 표시한다.
      markLocalMembership(userId, { kind: "left", groupId });
      trackGroupRoomLeft(reason);
      finishLeaving();
    },
    onError: (error) => {
      // 이미 내보내졌거나 그룹이 사라졌으면 나가려던 일은 이미 끝난 것이다.
      // 스스로 나간 것이 아니라서 표시하지 않고, 그룹 탭의 목록 비교가 내보내짐으로 센다.
      if (isGroupGoneError(error)) {
        finishLeaving();
        return;
      }
      // 혼자인 줄 알았는데 그사이 멤버가 들어오면 그룹장을 먼저 넘기라는 창으로 바꾼다.
      if (groupErrorCode(error) === "OWNER_CANNOT_LEAVE" && home !== undefined) {
        const room = toRoomHome(home, userId);
        openLeaveDialog(
          leaveRoomDialog({
            role: "owner",
            visibility: room.visibility,
            otherMemberCount: Math.max(1, otherMemberCount(room.memberCount)),
          }),
        );
        void queryClient.invalidateQueries({ queryKey: groupKeys.home(userId, groupId) });
        return;
      }
      setLeaveOpen(false);
      showToast(groupErrorCopy("leave", error));
    },
  });

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
          <div className="flex flex-col gap-3 pt-0.5">
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )}
      </GroupScreenFrame>
    );
  }

  const room = toRoomHome(home, userId);
  const shareInviteCode = async () => {
    try {
      const { inviteCode } = await queryClient.ensureQueryData(groupInviteQuery(userId, groupId));
      await shareGroupInvite(inviteCode);
    } catch (error) {
      showToast(groupErrorCopy("load", error));
    }
  };
  const selectMenu = (kind: RoomMenuItem["kind"]) => {
    switch (kind) {
      case "requests":
        go(`${groupPath}/applications`);
        return;
      case "invite":
        void shareInviteCode();
        return;
      case "manage_members":
      case "view_members":
        go(`${groupPath}/members`);
        return;
      case "settings":
        go(`${groupPath}/settings`);
        return;
      case "leave":
        openLeaveDialog(
          leaveRoomDialog({
            role: room.role,
            visibility: room.visibility,
            otherMemberCount: otherMemberCount(room.memberCount),
          }),
        );
        return;
    }
  };

  return (
    <>
      <RoomHomeScreen
        room={room}
        fetchedAtMs={homeQuery.dataUpdatedAt}
        onBack={back}
        onToggleNotify={() => {
          // 알림 설정을 보내는 동안 또 누르면 앞 요청의 되돌리기가 뒤 요청의 값을 덮을 수 있어 받지 않는다.
          if (notify.isPending) {
            return;
          }
          changeNotification(!room.notifyOn);
        }}
        onMenuOpen={() => {
          // 미리 받은 코드는 그사이 그룹장이 멤버를 내보내 바뀌었을 수 있어서 메뉴를 열 때 무효로 표시하고 다시 받는다.
          // 초대하기는 다시 받기를 기다리지 않고 받아 둔 코드로 바로 공유하는데, iOS 공유 시트는 누른 직후에만 열리기 때문이다.
          if (home.visibility === "PRIVATE") {
            void queryClient.invalidateQueries({ queryKey: groupKeys.invite(userId, groupId) });
          }
        }}
        onMenuSelect={selectMenu}
        onOpenRequests={() => go(`${groupPath}/applications`)}
        onEnterStudyRoom={enterStudyRoom}
        entering={enterRoom.isPending}
      />
      <GroupNotificationPrompt
        userId={userId}
        groupId={groupId}
        ready={!left && !homeQuery.isError && !notify.isPending}
        notifyEnabled={home.notifyEnabled}
        onAccept={() => changeNotification(true)}
      />
      {leaveDialog !== null && (
        <ConfirmDialog
          open={leaveOpen}
          {...leaveDialog.copy}
          pending={leave.isPending}
          onCancel={() => setLeaveOpen(false)}
          onConfirm={() => {
            if (leaveDialog.kind === "must_transfer") {
              setLeaveOpen(false);
              go(`${groupPath}/members`);
              return;
            }
            // 다른 멤버가 있는 그룹장은 넘기라는 창을 보므로 여기까지 온 그룹장은 혼자 남아 나가면 그룹이 사라진다.
            if (!leave.isPending) {
              leave.mutate(room.role === "owner" ? "room_deleted" : "left");
            }
          }}
        />
      )}
    </>
  );
}

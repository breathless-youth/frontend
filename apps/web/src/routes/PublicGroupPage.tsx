import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { toApplyState, toPublicRoomDetail } from "@/features/group-room/fromApi";
import {
  APPLICATION_CANCELED_COPY,
  GROUP_RETRY_COPY,
  groupErrorCopy,
  isGroupGoneError,
  isQuietApplicationError,
} from "@/features/group-room/groupErrorCopy";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { parseRouteId } from "@/features/group-room/routeId";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { PublicRoomDetailScreen } from "@/features/group-room/screens/PublicRoomDetailScreen";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { useNow } from "@/features/ranking/useNow";
import { cancelApplication } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  invalidateGroupMembership,
  publicGroupQuery,
} from "@/lib/groupRoomQueries";
import { useScreenVisible } from "@/lib/nativeTabFocus";
import { slideNavigate } from "@/lib/pageTransition";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 공개 그룹 보기
 *
 * 신원이 정해지기 전에는 그리지 않고, 신원 없이 열었거나 주소의 그룹 번호가 번호가 아니면 그룹 탭으로 바꿔 간다.
 */
export function PublicGroupPage() {
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
  return <PublicGroup key={`${userId}:${groupId}`} userId={userId} groupId={groupId} />;
}

/**
 * 공개 그룹 보기 본문
 *
 * 이미 멤버인 그룹은 공개 그룹 보기 대신 그룹 홈을 연다.
 * 신청 취소는 확인 없이 보내고, 취소한 뒤 다시 받은 신청 버튼이 결과를 보인다.
 * 사라졌거나 비공개인 그룹은 서버가 같은 404로 답해서 그룹 탭으로 돌아가 안내한다.
 */
function PublicGroup({ userId, groupId }: { userId: number; groupId: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const back = useBackTo("/social");
  const visible = useScreenVisible();
  const now = new Date(useNow(visible ? 60_000 : null));
  const search = baseSearch(location.search);

  const detailQuery = useQuery(publicGroupQuery(userId, groupId));
  const detail = detailQuery.data;
  const refresh = () => void invalidateGroupMembership(queryClient, userId, groupId);
  const cancel = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (applicationId: number) => cancelApplication(applicationId),
    onSuccess: () => {
      showToast(APPLICATION_CANCELED_COPY);
      refresh();
    },
    onError: (error) => {
      // 다른 기기에서 이미 취소했거나 기한이 지나 없어진 신청은 알리지 않고 지금 상태를 다시 받는다.
      if (!isQuietApplicationError(error)) {
        showToast(groupErrorCopy("cancel_application", error));
      }
      refresh();
    },
  });

  useLeaveWhenGone(detailQuery.error, groupId);

  if (detail === undefined) {
    const failed = cannotLoadFirst(detailQuery) && !isGroupGoneError(detailQuery.error);
    return (
      <GroupScreenFrame onBack={back}>
        {failed ? (
          <ErrorState
            message={GROUP_RETRY_COPY}
            onRetry={() => void detailQuery.refetch()}
            screen="group_tab"
          />
        ) : (
          <div className="flex flex-col gap-3 pt-0.5">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        )}
      </GroupScreenFrame>
    );
  }

  const applyState = toApplyState(detail);
  if (applyState === null) {
    return <Navigate to={{ pathname: `/social/groups/${groupId}`, search }} replace />;
  }
  const pendingApplication = detail.application;

  return (
    <PublicRoomDetailScreen
      room={toPublicRoomDetail(detail, userId)}
      applyState={applyState}
      now={now}
      fetchedAtMs={detailQuery.dataUpdatedAt}
      pending={cancel.isPending}
      onBack={back}
      onApply={() =>
        slideNavigate("forward", () =>
          navigate({ pathname: `/social/public/${groupId}/apply`, search }),
        )
      }
      onCancelApplication={() => {
        if (pendingApplication !== null && !cancel.isPending) {
          cancel.mutate(pendingApplication.applicationId);
        }
      }}
    />
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { toApplicationRequest } from "@/features/group-room/fromApi";
import {
  groupRetryCopy,
  groupErrorCode,
  groupErrorCopy,
  isGroupGoneError,
  isQuietApplicationError,
} from "@/features/group-room/groupErrorCopy";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { remainingSeats } from "@/features/group-room/model/limits";
import { parseRouteId } from "@/features/group-room/routeId";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { RequestsScreen } from "@/features/group-room/screens/RequestsScreen";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { useNow } from "@/features/ranking/useNow";
import { acceptApplication, declineApplication } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  groupApplicationsQuery,
  groupHomeQuery,
  groupKeys,
  invalidateGroupMembership,
} from "@/lib/groupRoomQueries";
import { useScreenVisible } from "@/lib/nativeTabFocus";
import { slideNavigate } from "@/lib/pageTransition";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 그룹장의 신청 확인
 *
 * 신원이 정해지기 전에는 그리지 않는다.
 */
export function GroupApplicationsPage() {
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
  return <GroupApplications key={`${userId}:${groupId}`} userId={userId} groupId={groupId} />;
}

/**
 * 신청 확인 본문
 *
 * 그룹 이름은 그룹 홈 응답에서 읽고, 남은 자리는 신청 목록이 오기 전에는 멤버 수로 센다.
 * 답을 보내는 동안에는 그 신청의 버튼을 막고 다른 신청의 수락과 거절도 받지 않아 한 번에 하나씩 답한다.
 * 답한 뒤에는 멤버 변화로 바뀌는 조회를 한 번에 무효화해 신청 목록을 두 번 받지 않는다.
 */
function GroupApplications({ userId, groupId }: { userId: number; groupId: number }) {
  const { t } = useTranslation("group-room");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const back = useBackTo(`/social/groups/${groupId}`);
  const visible = useScreenVisible();
  const now = new Date(useNow(visible ? 60_000 : null));
  const search = baseSearch(location.search);

  // 이 화면은 그룹 이름만 읽어서 그룹 홈처럼 30초마다 다시 받지 않는다.
  const homeQuery = useQuery({ ...groupHomeQuery(userId, groupId), refetchInterval: false });
  const home = homeQuery.data;
  const applicationsQuery = useQuery(groupApplicationsQuery(userId, groupId));
  const refresh = () => void invalidateGroupMembership(queryClient, userId, groupId);

  // 그룹장이 바뀐 뒤 이 화면에 남아 있으면 바뀐 역할로 그룹 홈을 다시 그리게 한다.
  // 그룹 홈에서 왔으면 그 화면으로 돌아가서 같은 그룹 홈이 기록에 두 번 쌓이지 않는다.
  const returnToGroupHome = useEffectEvent(() => {
    void queryClient.invalidateQueries({ queryKey: groupKeys.home(userId, groupId) });
    back();
  });
  const notOwner = groupErrorCode(applicationsQuery.error) === "NOT_GROUP_OWNER";
  useEffect(() => {
    if (notOwner) {
      returnToGroupHome();
    }
  }, [notOwner]);

  const answer = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: ({ applicationId, accept }: { applicationId: number; accept: boolean }) =>
      accept ? acceptApplication(applicationId) : declineApplication(applicationId),
    onSuccess: refresh,
    onError: (error) => {
      if (groupErrorCode(error) === "NOT_GROUP_OWNER") {
        refresh();
        back();
        return;
      }
      // 내보내졌거나 그룹이 사라졌으면 아래 사라진 그룹 처리가 그룹 탭으로 데려간다.
      if (isGroupGoneError(error)) {
        return;
      }
      // 이미 답했거나 기한이 지났거나 없어진 신청은 알리지 않고 다른 실패는 알린 뒤, 지금 목록과 남은 자리를 다시 받는다.
      if (!isQuietApplicationError(error)) {
        showToast(groupErrorCopy("answer", error));
      }
      refresh();
    },
  });
  const answerOnce = (applicationId: number, accept: boolean) => {
    if (!answer.isPending) {
      answer.mutate({ applicationId, accept });
    }
  };

  useLeaveWhenGone(
    [homeQuery.error, applicationsQuery.error, answer.error].find(isGroupGoneError) ?? null,
    groupId,
  );

  if (home === undefined) {
    const failed = cannotLoadFirst(homeQuery) && !isGroupGoneError(homeQuery.error);
    return (
      <GroupScreenFrame title={t("requestsScreen.title")} onBack={back}>
        {failed ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void homeQuery.refetch()}
            screen="group_tab"
          />
        ) : (
          <div className="flex flex-col gap-3 pt-0.5">
            <Skeleton className="h-5 w-48 rounded-md" />
            <Skeleton className="h-50 rounded-xl" />
          </div>
        )}
      </GroupScreenFrame>
    );
  }

  const applications = applicationsQuery.data;
  const listFailed =
    cannotLoadFirst(applicationsQuery) && !notOwner && !isGroupGoneError(applicationsQuery.error);
  return (
    <RequestsScreen
      roomName={home.name}
      remainingSeats={applications?.remainingSeats ?? remainingSeats(home.memberCount)}
      requests={(applications?.applications ?? []).map(toApplicationRequest)}
      now={now}
      busyId={answer.isPending ? answer.variables.applicationId : null}
      loading={applicationsQuery.isPending}
      error={
        listFailed ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void applicationsQuery.refetch()}
            screen="group_tab"
          />
        ) : undefined
      }
      onBack={back}
      onAccept={(applicationId) => answerOnce(applicationId, true)}
      onReject={(applicationId) => answerOnce(applicationId, false)}
      onReport={(applicationId) =>
        slideNavigate("forward", () =>
          navigate({
            pathname: `/social/groups/${groupId}/applications/${applicationId}/report`,
            search,
          }),
        )
      }
    />
  );
}

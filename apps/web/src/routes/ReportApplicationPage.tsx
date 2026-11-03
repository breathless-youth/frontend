import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  GROUP_RETRY_COPY,
  groupErrorCode,
  groupErrorCopy,
  isGroupGoneError,
  isQuietApplicationError,
} from "@/features/group-room/groupErrorCopy";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { parseRouteId } from "@/features/group-room/routeId";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { ReportApplicationScreen } from "@/features/group-room/screens/ReportApplicationScreen";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { reportApplication } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  groupApplicationsQuery,
  invalidateGroupMembership,
} from "@/lib/groupRoomQueries";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 받은 신청 신고
 *
 * 신원이 정해지기 전에는 그리지 않고, 주소의 신청 번호가 번호가 아니면 신청 확인으로 바꿔 간다.
 */
export function ReportApplicationPage() {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const params = useParams();
  const groupId = parseRouteId(params.groupId);
  const applicationId = parseRouteId(params.applicationId);
  const location = useLocation();
  if (identityPending) {
    return null;
  }
  const search = baseSearch(location.search);
  if (userId === null || groupId === null) {
    return <Navigate to={{ pathname: "/social", search }} replace />;
  }
  if (applicationId === null) {
    return <Navigate to={{ pathname: `/social/groups/${groupId}/applications`, search }} replace />;
  }
  return (
    <ReportApplication
      key={`${userId}:${groupId}:${applicationId}`}
      userId={userId}
      groupId={groupId}
      applicationId={applicationId}
    />
  );
}

/**
 * 신청 신고 본문
 *
 * 신고할 사람의 닉네임은 신청 목록에서 찾고, 받아 둔 목록에 없으면 다시 받아 본 뒤에도 없을 때 신청 확인으로 돌아간다.
 * 보내면 그 신청은 바로 거절되어 신청 목록을 다시 받고 앞의 신청 확인으로 돌아간다.
 * 그룹장이 바뀌었으면 신청 확인으로 돌아가고, 신청 확인이 다시 받은 역할을 보고 그룹 홈으로 데려간다.
 * 신고 사유는 서버가 연락처를 보지 않는 글이라 입력칸 아래 서버 오류 줄을 두지 않는다.
 */
function ReportApplication({
  userId,
  groupId,
  applicationId,
}: {
  userId: number;
  groupId: number;
  applicationId: number;
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const search = baseSearch(location.search);
  const applicationsPath = `/social/groups/${groupId}/applications`;
  const back = useBackTo(applicationsPath);
  const applicationsQuery = useQuery(groupApplicationsQuery(userId, groupId));
  const application = applicationsQuery.data?.applications.find(
    (item) => item.applicationId === applicationId,
  );
  const [reason, setReason] = useState("");
  // 돌아가기로 정한 뒤 다시 받은 목록에서 이 신청이 빠져도 신청 확인으로 한 번 더 이동하지 않게 기억한다.
  const [left, setLeft] = useState(false);

  const returnToApplications = () => {
    setLeft(true);
    void invalidateGroupMembership(queryClient, userId, groupId);
    back();
  };
  const notOwner = groupErrorCode(applicationsQuery.error) === "NOT_GROUP_OWNER";
  const returnAsMember = useEffectEvent(() => back());
  useEffect(() => {
    if (notOwner) {
      returnAsMember();
    }
  }, [notOwner]);

  const report = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (text: string) => reportApplication(applicationId, text),
    onSuccess: returnToApplications,
    onError: (error) => {
      // 그사이 처리되거나 없어진 신청이면 알리지 않고 지금 목록으로 돌아가고, 그룹장이 바뀐 때도 신청 확인을 거쳐 그룹 홈으로 간다.
      if (isQuietApplicationError(error) || groupErrorCode(error) === "NOT_GROUP_OWNER") {
        returnToApplications();
        return;
      }
      // 내보내졌거나 그룹이 사라졌으면 아래 사라진 그룹 처리가 그룹 탭으로 데려간다.
      if (!isGroupGoneError(error)) {
        showToast(groupErrorCopy("report", error));
      }
    },
  });

  useLeaveWhenGone([applicationsQuery.error, report.error].find(isGroupGoneError) ?? null, groupId);

  if (application === undefined) {
    // 받아 둔 목록에 없으면 이 화면에서 다시 받은 목록까지 보고 정한다.
    const settled = applicationsQuery.isFetchedAfterMount && !applicationsQuery.isFetching;
    if (!left && !notOwner && applicationsQuery.data !== undefined && settled) {
      return <Navigate to={{ pathname: applicationsPath, search }} replace />;
    }
    const failed =
      cannotLoadFirst(applicationsQuery) && !notOwner && !isGroupGoneError(applicationsQuery.error);
    return (
      <GroupScreenFrame title="신고하기" onBack={back}>
        {failed ? (
          <ErrorState
            message={GROUP_RETRY_COPY}
            onRetry={() => void applicationsQuery.refetch()}
            screen="group_tab"
          />
        ) : (
          <div className="flex flex-col gap-3 pt-6">
            <Skeleton className="h-7 w-56 rounded-md" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        )}
      </GroupScreenFrame>
    );
  }

  return (
    <ReportApplicationScreen
      nickname={application.nickname}
      value={reason}
      onChange={setReason}
      pending={report.isPending}
      onSubmit={() => {
        if (!report.isPending) {
          report.mutate(reason);
        }
      }}
      onBack={back}
    />
  );
}

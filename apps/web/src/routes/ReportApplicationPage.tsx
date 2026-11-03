import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  GROUP_RETRY_COPY,
  groupErrorCode,
  groupErrorCopy,
  isGroupGoneError,
  isQuietGroupConflict,
} from "@/features/group-room/groupErrorCopy";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { CONTACT_BLOCKED_COPY } from "@/features/group-room/model/contactCheck";
import { parseRouteId } from "@/features/group-room/routeId";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { ReportApplicationScreen } from "@/features/group-room/screens/ReportApplicationScreen";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { reportApplication } from "@/lib/groupRoomApi";
import {
  cannotLoadFirst,
  groupApplicationsQuery,
  groupKeys,
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
 * 보내면 그 신청은 바로 거절되어 신청 목록을 다시 받고 신청 확인으로 바꿔 간다.
 * 서버가 사유를 연락처로 막으면 입력칸 아래에 알리고 쓴 사유를 남긴 채 머문다.
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
  const navigate = useNavigate();
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
  const [serverError, setServerError] = useState<string | null>(null);

  const returnTo = (pathname: string) => {
    void invalidateGroupMembership(queryClient, userId, groupId);
    navigate({ pathname, search }, { replace: true });
  };
  // 그룹장이 바뀐 뒤 이 화면에 남아 있으면 바뀐 역할로 그룹 홈을 다시 그리게 한다.
  const returnToGroupHome = useEffectEvent(() => {
    void queryClient.invalidateQueries({ queryKey: groupKeys.home(userId, groupId) });
    navigate({ pathname: `/social/groups/${groupId}`, search }, { replace: true });
  });
  const notOwner = groupErrorCode(applicationsQuery.error) === "NOT_GROUP_OWNER";
  useEffect(() => {
    if (notOwner) {
      returnToGroupHome();
    }
  }, [notOwner]);

  const report = useMutation({
    mutationFn: (text: string) => reportApplication(applicationId, text),
    onSuccess: () => returnTo(applicationsPath),
    onError: (error) => {
      const code = groupErrorCode(error);
      if (code === "CONTACT_NOT_ALLOWED") {
        setServerError(CONTACT_BLOCKED_COPY);
        return;
      }
      if (code === "NOT_GROUP_OWNER") {
        returnTo(`/social/groups/${groupId}`);
        return;
      }
      // 그사이 답했거나 기한이 지난 신청이면 알리지 않고 지금 목록으로 돌아간다.
      if (isQuietGroupConflict(error) || code === "NOT_FOUND") {
        returnTo(applicationsPath);
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
    if (applicationsQuery.data !== undefined && settled) {
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
      onChange={(next) => {
        setReason(next);
        setServerError(null);
      }}
      pending={report.isPending}
      serverError={serverError}
      onSubmit={() => {
        if (!report.isPending) {
          report.mutate(reason);
        }
      }}
      onBack={back}
    />
  );
}

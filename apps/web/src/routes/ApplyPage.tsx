import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  groupRetryCopy,
  groupErrorCode,
  groupErrorCopy,
  isGroupGoneError,
  isQuietGroupConflict,
} from "@/features/group-room/groupErrorCopy";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { parseRouteId } from "@/features/group-room/routeId";
import { ApplyScreen } from "@/features/group-room/screens/ApplyScreen";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { applyToGroup } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  invalidateGroupMembership,
  publicGroupQuery,
} from "@/lib/groupRoomQueries";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 공개 그룹 보기의 흐린 신청 버튼이 알려 주는 거절
 *
 * 다시 받은 공개 그룹 보기가 흐린 버튼과 그 글자로 알리고, 화면을 바꾸면 토스트가 닫혀서 토스트 없이 돌아간다.
 */
const SHOWN_ON_DETAIL_CODES: ReadonlySet<string> = new Set([
  "GROUP_SLOT_LIMIT",
  "APPLICATION_LIMIT",
  "RECENTLY_KICKED",
  "GROUP_FULL",
]);

/**
 * 공개 그룹 신청하기
 *
 * 신원이 정해지기 전에는 그리지 않고, 신원 없이 열었거나 주소의 그룹 번호가 번호가 아니면 그룹 탭으로 바꿔 간다.
 */
export function ApplyPage() {
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
  return <Apply key={`${userId}:${groupId}`} userId={userId} groupId={groupId} />;
}

/**
 * 신청하기 본문
 *
 * 그룹 이름과 그룹장은 공개 그룹 보기와 같은 조회에서 읽는다.
 * 보내면 공개 그룹 보기로 돌아가고, 앞 화면이 있으면 그 화면으로 돌아가 같은 화면이 기록에 두 번 쌓이지 않는다.
 * 서버가 소개 글을 연락처로 막으면 입력칸 아래에 알리고, 공개 그룹 보기가 이유를 보여 주는 거절은 그 화면으로 돌아간다.
 * 그 밖의 실패는 쓴 소개 글을 잃지 않게 토스트로 알리고 머문다.
 */
function Apply({ userId, groupId }: { userId: number; groupId: number }) {
  const { t } = useTranslation("group-room");
  const queryClient = useQueryClient();
  const back = useBackTo(`/social/public/${groupId}`);
  const detailQuery = useQuery(publicGroupQuery(userId, groupId));
  const detail = detailQuery.data;
  const [intro, setIntro] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const returnToDetail = () => {
    void invalidateGroupMembership(queryClient, userId, groupId);
    back();
  };
  const apply = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (introduction: string) => applyToGroup(groupId, introduction),
    onSuccess: returnToDetail,
    onError: (error) => {
      const code = groupErrorCode(error);
      if (code === "CONTACT_NOT_ALLOWED") {
        setServerError(groupErrorCopy("apply", error));
        return;
      }
      // 이미 멤버이거나 신청했거나 흐린 버튼이 알려 주는 거절이면 공개 그룹 보기로 돌아가 다시 받은 상태로 알린다.
      if (isQuietGroupConflict(error) || (code !== null && SHOWN_ON_DETAIL_CODES.has(code))) {
        returnToDetail();
        return;
      }
      // 사라졌거나 비공개로 바뀐 그룹이면 아래 사라진 그룹 처리가 그룹 탭으로 데려간다.
      if (!isGroupGoneError(error)) {
        showToast(groupErrorCopy("apply", error));
      }
    },
  });

  useLeaveWhenGone([detailQuery.error, apply.error].find(isGroupGoneError) ?? null, groupId);

  if (detail === undefined) {
    const failed = cannotLoadFirst(detailQuery) && !isGroupGoneError(detailQuery.error);
    return (
      <GroupScreenFrame title={t("applyPage.title")} onBack={back}>
        {failed ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void detailQuery.refetch()}
            screen="group_tab"
          />
        ) : (
          <div className="flex flex-col gap-3 pt-4.5">
            <Skeleton className="h-7 w-56 rounded-md" />
            <Skeleton className="h-5 w-64 rounded-md" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        )}
      </GroupScreenFrame>
    );
  }

  return (
    <ApplyScreen
      roomName={detail.name}
      ownerNickname={detail.owner.nickname}
      value={intro}
      onChange={(next) => {
        setIntro(next);
        setServerError(null);
      }}
      pending={apply.isPending}
      serverError={serverError}
      onSubmit={() => {
        if (!apply.isPending) {
          apply.mutate(intro);
        }
      }}
      onBack={back}
    />
  );
}

import type { GroupCreateRequest, GroupUpdateRequest, StudyCategory } from "@focusmakers/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { toGroupVisibility, toRoomVisibility } from "@/features/group-room/fromApi";
import {
  groupRetryCopy,
  groupErrorCode,
  groupErrorCopy,
  isGroupGoneError,
} from "@/features/group-room/groupErrorCopy";
import { markLocalMembership } from "@/features/group-room/groupMembershipTracker";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { containsContactOrLink } from "@/features/group-room/model/contactCheck";
import { parseRouteId } from "@/features/group-room/routeId";
import { GroupScreenFrame } from "@/features/group-room/screens/GroupScreenFrame";
import { RoomFormScreen } from "@/features/group-room/screens/RoomFormScreen";
import type { RoomFormServerError } from "@/features/group-room/types";
import { useBackTo } from "@/features/group-room/useBackTo";
import { useLeaveWhenGone } from "@/features/group-room/useLeaveWhenGone";
import { trackGroupRoomCreated } from "@/lib/amplitude";
import { createGroup, updateGroup } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  groupHomeQuery,
  groupKeys,
  invalidateGroupMembership,
} from "@/lib/groupRoomQueries";
import { profileQuery } from "@/lib/profileQueries";
import { isStudyCategory, studyCategoryOptions } from "@/lib/studyCategory";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/** 프로필에서 시험·목표를 정하지 못할 때 처음 고르는 값이고 칩 줄의 첫 칩이다. */
const DEFAULT_CATEGORY: StudyCategory = "CSAT";

type FormAction = "create" | "update";

/**
 * 그룹 만들기와 그룹 설정
 *
 * 신원이 정해지기 전에는 그리지 않고, 신원 없이 열었거나 설정 주소의 그룹 번호가 번호가 아니면 그룹 탭으로 바꿔 간다.
 */
export function GroupFormPage({ mode }: { mode: "create" | "edit" }) {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const groupId = parseRouteId(useParams().groupId);
  const location = useLocation();
  if (identityPending) {
    return null;
  }
  const toGroupTab = (
    <Navigate to={{ pathname: "/social", search: baseSearch(location.search) }} replace />
  );
  if (userId === null) {
    return toGroupTab;
  }
  if (mode === "create") {
    return <GroupCreate key={userId} userId={userId} />;
  }
  if (groupId === null) {
    return toGroupTab;
  }
  return <GroupSettings key={`${userId}:${groupId}`} userId={userId} groupId={groupId} />;
}

/**
 * 서버가 그룹 글을 연락처로 막았을 때 오류를 둘 칸
 *
 * 서버는 어느 칸이 걸렸는지 알려 주지 않아서 서버와 같은 판정으로 걸린 칸을 찾는다.
 * 걸린 칸이 없으면 null이라 호출부가 토스트로 알린다.
 */
function contactServerError(
  action: FormAction,
  error: Error,
  name: string,
  intro: string,
): RoomFormServerError | null {
  if (groupErrorCode(error) !== "CONTACT_NOT_ALLOWED") {
    return null;
  }
  const message = groupErrorCopy(action, error);
  if (containsContactOrLink(name)) {
    return { field: "name", message };
  }
  if (containsContactOrLink(intro)) {
    return { field: "intro", message };
  }
  return null;
}

/**
 * 양식 오류 알리기
 *
 * 연락처로 걸린 칸을 찾으면 그 칸 아래에, 그 밖에는 토스트로 알린다.
 */
function useFormErrorNotice(action: FormAction) {
  const [serverError, setServerError] = useState<RoomFormServerError | null>(null);
  const notice = (error: Error, name: string, intro: string) => {
    const fieldError = contactServerError(action, error, name, intro);
    if (fieldError === null) {
      showToast(groupErrorCopy(action, error));
    }
    setServerError(fieldError);
  };
  return { serverError, notice, clear: () => setServerError(null) };
}

/**
 * 그룹 만들기 본문
 *
 * 처음 시험·목표는 프로필 카테고리이고, 프로필에 없거나 모르는 값이거나 프로필을 받지 못하면 첫 칩인 수능이다.
 * 양식은 처음 값을 한 번만 읽어서 프로필을 받는 동안에는 양식 대신 자리표시를 둔다.
 * 만들면 새 그룹 홈으로 바꿔 가서 뒤로 가기가 만들기 화면으로 돌아오지 않는다.
 */
function GroupCreate({ userId }: { userId: number }) {
  const { t } = useTranslation("group-room");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const back = useBackTo("/social");
  const profile = useQuery(profileQuery(userId));
  const formError = useFormErrorNotice("create");
  const create = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (body: GroupCreateRequest) => createGroup(body),
    onSuccess: ({ groupId }, body) => {
      // 그룹 탭이 다시 받은 목록이 이 그룹을 신청 가입으로 세지 않게 무효화보다 먼저 표시한다.
      markLocalMembership(userId, { kind: "created", groupId });
      trackGroupRoomCreated({
        visibility: toRoomVisibility(body.visibility),
        category: body.category,
      });
      void invalidateGroupMembership(queryClient, userId);
      navigate(
        { pathname: `/social/groups/${groupId}`, search: baseSearch(location.search) },
        { replace: true },
      );
    },
    onError: (error, body) => formError.notice(error, body.name, body.description ?? ""),
  });

  // 오프라인이라 멈춘 조회까지 기다리면 양식이 열리지 않아서 받는 중일 때만 기다린다.
  if (profile.isPending && !profile.isPaused) {
    return (
      <GroupScreenFrame title={t("roomFormScreen.titleCreate")} onBack={back}>
        <FormSkeleton />
      </GroupScreenFrame>
    );
  }
  const profileCategory = profile.data?.category;
  return (
    <RoomFormScreen
      mode="create"
      categories={studyCategoryOptions()}
      initial={{
        name: "",
        visibility: "public",
        category: isStudyCategory(profileCategory) ? profileCategory : DEFAULT_CATEGORY,
        intro: "",
      }}
      pending={create.isPending}
      serverError={formError.serverError}
      onBack={back}
      onSubmit={(values) => {
        if (create.isPending) {
          return;
        }
        formError.clear();
        create.mutate({
          name: values.name,
          visibility: toGroupVisibility(values.visibility),
          category: isStudyCategory(values.category) ? values.category : DEFAULT_CATEGORY,
          description: values.intro,
        });
      }}
    />
  );
}

/**
 * 그룹 설정 본문
 *
 * 처음 값은 그룹 홈 응답이고, 양식이 처음 값을 한 번만 읽어서 그룹 홈을 받기 전에는 양식 대신 자리표시를 둔다.
 * 저장은 이름, 시험·목표, 소개를 함께 바꾸는 요청이라 비운 소개도 빈 글로 보낸다.
 * 그룹장이 아니면 설정 대신 그룹 홈으로 돌아가고, 그룹 홈에서 왔으면 그 화면으로 돌아간다.
 */
function GroupSettings({ userId, groupId }: { userId: number; groupId: number }) {
  const { t } = useTranslation("group-room");
  const queryClient = useQueryClient();
  const back = useBackTo(`/social/groups/${groupId}`);
  // 이 화면은 처음 값만 읽어서 그룹 홈처럼 30초마다 다시 받지 않는다.
  const homeQuery = useQuery({ ...groupHomeQuery(userId, groupId), refetchInterval: false });
  const home = homeQuery.data;
  const formError = useFormErrorNotice("update");
  const save = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (body: GroupUpdateRequest) => updateGroup(groupId, body),
    onSuccess: () => {
      // 이름과 시험·목표는 내 그룹 카드와 공개 목록에도 보여서 이 그룹이 보이는 조회를 함께 다시 받는다.
      void invalidateGroupMembership(queryClient, userId, groupId);
      back();
    },
    onError: (error, body) => {
      if (groupErrorCode(error) === "NOT_GROUP_OWNER") {
        void queryClient.invalidateQueries({ queryKey: groupKeys.home(userId, groupId) });
        back();
        return;
      }
      // 내보내졌거나 그룹이 사라졌으면 아래 사라진 그룹 처리가 그룹 탭으로 데려간다.
      if (!isGroupGoneError(error)) {
        formError.notice(error, body.name, body.description ?? "");
      }
    },
  });

  const notOwner = home !== undefined && home.myRole !== "OWNER";
  const leaveAsMember = useEffectEvent(() => back());
  useEffect(() => {
    if (notOwner) {
      leaveAsMember();
    }
  }, [notOwner]);
  useLeaveWhenGone([homeQuery.error, save.error].find(isGroupGoneError) ?? null, groupId);

  if (home === undefined || notOwner) {
    const failed = cannotLoadFirst(homeQuery) && !isGroupGoneError(homeQuery.error);
    return (
      <GroupScreenFrame title={t("roomFormScreen.titleEdit")} onBack={back}>
        {failed ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void homeQuery.refetch()}
            screen="group_tab"
          />
        ) : (
          <FormSkeleton />
        )}
      </GroupScreenFrame>
    );
  }

  return (
    <RoomFormScreen
      mode="edit"
      categories={studyCategoryOptions()}
      initial={{
        name: home.name,
        visibility: toRoomVisibility(home.visibility),
        category: home.category,
        intro: home.description ?? "",
      }}
      pending={save.isPending}
      serverError={formError.serverError}
      onBack={back}
      onSubmit={(values) => {
        if (save.isPending) {
          return;
        }
        formError.clear();
        save.mutate({
          name: values.name,
          // 이 웹이 모르는 시험·목표는 고를 칩이 없어서 그룹이 가진 값을 바꾸지 않고 다시 보낸다.
          category: isStudyCategory(values.category) ? values.category : home.category,
          description: values.intro,
        });
      }}
    />
  );
}

/** 양식을 그리기 전의 자리표시 */
function FormSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-4">
      <Skeleton className="h-13 rounded-xl" />
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

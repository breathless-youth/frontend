import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import {
  LazyPendingApplicationsSheet,
  preloadPendingApplicationsSheet,
} from "@/features/group-room/components/lazyPendingApplicationsSheet";
import {
  toMyRoomSummary,
  toPendingApplication,
  toPublicRoomSummary,
} from "@/features/group-room/fromApi";
import {
  applicationCanceledCopy,
  groupRetryCopy,
  groupErrorCopy,
  isQuietApplicationError,
} from "@/features/group-room/groupErrorCopy";
import {
  baseSearch,
  readGroupTabSearch,
  writeGroupTabSearch,
} from "@/features/group-room/groupTabSearch";
import type { GroupTabSearch } from "@/features/group-room/groupTabSearch";
import {
  canCreateRoom,
  createRoomLimitCopy,
  myRoomsTabCount,
} from "@/features/group-room/model/limits";
import { SocialHomeScreen } from "@/features/group-room/screens/SocialHomeScreen";
import type { PendingApplication, SocialTab } from "@/features/group-room/types";
import { useNow } from "@/features/ranking/useNow";
import { GraceEndDialog } from "@/features/social-room/GraceEndDialog";
import { useSocialRoomNoticeHandoff } from "@/features/social-room/useSocialRoomNoticeHandoff";
import { cancelApplication } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  cannotLoadFirst,
  dedupePublicGroups,
  invalidateGroupMembership,
  myApplicationsQuery,
  myGroupsQuery,
  publicGroupsQuery,
} from "@/lib/groupRoomQueries";
import { useScreenVisible } from "@/lib/nativeTabFocus";
import { slideNavigate } from "@/lib/pageTransition";
import { isStudyCategory, studyCategoryOptions } from "@/lib/studyCategory";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";
import { whenIdle } from "@/lib/whenIdle";
import { prefetchGroupPages } from "@/routes/lazyRoutes";

/** 검색어를 다 쓰기 전에 글자마다 목록을 다시 받지 않게 입력이 멈춘 뒤 이만큼 기다린다. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 그룹 탭
 *
 * 신원이 정해지기 전에는 그리지 않는다.
 * 첫 렌더의 빈 신원을 신원 없음으로 읽으면 빈 상태가 잠깐 보이고, 개발용 가짜 서버는 처음 불릴 때 읽은 사용자를 계속 나로 쓰기 때문이다.
 * 방이나 공부방에서 넘어온 안내는 신원과 상관없이 지금 소셜 홈과 같은 방식으로 띄운다.
 */
export function GroupTabPage() {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  const { graceMessage, dismissGrace } = useSocialRoomNoticeHandoff();
  return (
    <>
      {identityPending ? null : <GroupTabContent userId={userId} />}
      <GraceEndDialog message={graceMessage} onClose={dismissGrace} />
    </>
  );
}

/**
 * 그룹 탭 본문
 *
 * 탭, 검색어, 시험·목표는 주소에 두어 다른 화면에서 뒤로 와도 보던 조건이 남는다.
 * 검색칸의 글자는 한글 조합이 끊기지 않게 이 화면이 들고, 입력이 멈춘 뒤의 글만 주소와 조회 조건에 쓴다.
 * 신원 없이 연 브라우저는 그룹을 받을 수 없어 빈 상태를 보이고 그룹 만들기를 막는다.
 */
function GroupTabContent({ userId }: { userId: number | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const visible = useScreenVisible();
  const now = new Date(useNow(visible ? 60_000 : null));
  const search = readGroupTabSearch(location.search);
  const signedIn = userId !== null;
  // 신원이 없으면 조회를 끄므로 키에 쓰는 번호는 쓰이지 않는다.
  const queryUserId = userId ?? 0;

  // 조건을 주소에 바꿔 쓸 때 세션 웹뷰가 넘긴 안내 넘김 표시가 사라지지 않게 이동 상태도 함께 넘긴다.
  const replaceSearch = (next: Partial<GroupTabSearch>) =>
    navigate(
      { pathname: location.pathname, search: writeGroupTabSearch(location.search, next) },
      { replace: true, state: location.state },
    );
  const leaveTab = (pathname: string) =>
    slideNavigate("forward", () => navigate({ pathname, search: baseSearch(location.search) }));
  useEffect(() => {
    prefetchGroupPages();
  }, []);

  const [rawQuery, setRawQuery] = useState(search.query);
  const settledQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS).trim();
  const writeQuery = useEffectEvent((query: string) => {
    if (query !== readGroupTabSearch(location.search).query) {
      replaceSearch({ query });
    }
  });
  useEffect(() => {
    writeQuery(settledQuery);
  }, [settledQuery]);

  const mineQuery = useQuery({ ...myGroupsQuery(queryUserId), enabled: signedIn });
  const mine = mineQuery.data;
  const pendingCount = mine?.pendingApplicationCount ?? 0;

  const [sheetOpen, setSheetOpen] = useState(false);
  // 띠가 보이면 시트를 열기 전에 목록을 받아 두어 빈 시트가 잠깐 보이지 않게 한다.
  const applicationsQuery = useQuery({
    ...myApplicationsQuery(queryUserId),
    enabled: signedIn && (pendingCount > 0 || sheetOpen),
  });
  const applications = (applicationsQuery.data?.applications ?? []).map(toPendingApplication);
  const showsBand = pendingCount > 0;
  useEffect(() => {
    if (showsBand) {
      whenIdle(preloadPendingApplicationsSheet);
    }
  }, [showsBand]);

  const cancel = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (application: PendingApplication) => cancelApplication(application.applicationId),
    onSuccess: (_data, application) => {
      showToast(applicationCanceledCopy());
      void invalidateGroupMembership(queryClient, queryUserId, application.roomId);
    },
    onError: (error, application) => {
      // 다른 기기에서 이미 취소했거나 기한이 지나 없어진 신청은 알리지 않고 지금 목록을 다시 받는다.
      if (!isQuietApplicationError(error)) {
        showToast(groupErrorCopy("cancel_application", error));
      }
      void invalidateGroupMembership(queryClient, queryUserId, application.roomId);
    },
  });

  const publicQuery = useInfiniteQuery({
    ...publicGroupsQuery(queryUserId, { query: search.query, category: search.category }),
    enabled: signedIn && search.tab === "public",
  });
  const publicCards =
    publicQuery.data === undefined ? [] : dedupePublicGroups(publicQuery.data.pages);
  const loadMore = () => {
    if (!publicQuery.hasNextPage || publicQuery.isFetchingNextPage) {
      return;
    }
    // 실패해도 감지 칸은 남아서, 목록을 올렸다 다시 끝에 닿으면 또 받는다.
    void publicQuery.fetchNextPage().then((result) => {
      if (result.isFetchNextPageError) {
        showToast(groupRetryCopy());
      }
    });
  };

  const changeTab = (tab: SocialTab) => {
    if (tab !== search.tab) {
      replaceSearch({ tab });
    }
  };

  return (
    <SocialHomeScreen
      tab={search.tab}
      onTabChange={changeTab}
      myCountText={
        mine === undefined ? "" : myRoomsTabCount(mine.groups.length, mine.pendingApplicationCount)
      }
      mine={{
        rooms:
          userId === null ? [] : (mine?.groups ?? []).map((card) => toMyRoomSummary(card, userId)),
        pendingCount,
        loading: signedIn && mineQuery.isPending,
        error: cannotLoadFirst(mineQuery) ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void mineQuery.refetch()}
            screen="group_tab"
          />
        ) : undefined,
        onOpenRoom: (roomId) => leaveTab(`/social/groups/${roomId}`),
        onOpenPending: () => {
          setSheetOpen(true);
          if (applicationsQuery.isError) {
            void applicationsQuery.refetch();
          }
        },
        onBrowsePublic: () => changeTab("public"),
      }}
      publicRooms={{
        query: rawQuery,
        onQueryChange: setRawQuery,
        categories: studyCategoryOptions(),
        category: search.category,
        onCategoryChange: (value) =>
          replaceSearch({ category: isStudyCategory(value) ? value : null }),
        rooms: publicCards.map(toPublicRoomSummary),
        loading: signedIn && publicQuery.isPending,
        error: cannotLoadFirst(publicQuery) ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void publicQuery.refetch()}
            screen="group_tab"
          />
        ) : undefined,
        hasMore: publicQuery.hasNextPage,
        onLoadMore: loadMore,
        onOpenRoom: (roomId) => {
          const member = publicCards.find((card) => card.groupId === roomId)?.member ?? false;
          leaveTab(member ? `/social/groups/${roomId}` : `/social/public/${roomId}`);
        },
      }}
      fab={{
        canCreate: signedIn && (mine === undefined || canCreateRoom(mine.ownedGroupCount)),
        // 신원이 없어 막은 것은 그룹 한도 때문이 아니라서 한도 문구를 붙이지 않는다.
        blockedReason: signedIn ? createRoomLimitCopy() : null,
        onCreate: () => leaveTab("/social/groups/new"),
        onJoinWithCode: () => leaveTab("/social/join"),
      }}
      pendingSheet={
        <LazyPendingApplicationsSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          applications={applications}
          now={now}
          // 목록이 오기 전의 빈 목록에 시트가 스스로 닫히지 않게 목록이 올 때까지 받는 중으로 둔다.
          loading={applicationsQuery.data === undefined}
          error={
            cannotLoadFirst(applicationsQuery) ? (
              <ErrorState
                message={groupRetryCopy()}
                onRetry={() => void applicationsQuery.refetch()}
                screen="group_tab"
              />
            ) : undefined
          }
          cancelingId={cancel.isPending ? cancel.variables.applicationId : null}
          // 마지막 신청을 취소하면 띠가 사라져서 포커스를 지금 고른 탭에 돌려준다.
          emptiedFocus={() =>
            document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          }
          onCancel={(applicationId) => {
            const application = applications.find((item) => item.applicationId === applicationId);
            if (application !== undefined && !cancel.isPending) {
              cancel.mutate(application);
            }
          }}
          onOpenRoom={(roomId) => leaveTab(`/social/public/${roomId}`)}
        />
      }
    />
  );
}

/** 값이 정한 시간 동안 바뀌지 않으면 그때의 값을 돌려준다. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

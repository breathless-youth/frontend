import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAppLockRevokeCheck } from "@/features/app-lock/useAppLockRevokeCheck";
import { HomeDateStrip } from "@/features/home/HomeDateStrip";
import { homeDateKeys } from "@/features/home/homeDates";
import { HomeHeader } from "@/features/home/HomeHeader";
import { HomeSubjectList } from "@/features/home/HomeSubjectList";
import { HomeWelcome } from "@/features/home/HomeWelcome";
import { useNativeHomeDateBar } from "@/features/home/nativeHomeDateBar";
import {
  hasCreatedSubject,
  homeEmptyKind,
  markSubjectCreated,
} from "@/features/home/subjectHistory";
import { useStudyStatusUserProperties } from "@/features/home/useStudyStatusUserProperties";
import { NoticeModalHost } from "@/features/notice/NoticeModalHost";
import { liveSubjectsOf } from "@/features/planner/plannerDay";
import { plannerSubjectItems } from "@/features/planner/subjectItems";
import { usePlannerDay } from "@/features/planner/usePlannerDay";
import { HomeRankingPopupHost } from "@/features/ranking/exposure/HomeRankingPopupHost";
import { dayTitleWithWeekday, kstDateKey } from "@/features/records/recordsFormat";
import { SessionRecoveryDialog } from "@/features/study-session/components/SessionRecoveryDialog";
import { clearStartSubject } from "@/features/study-session/startSubject";
import { useLaunchSessionRecovery } from "@/features/study-session/useLaunchSessionRecovery";
import { useSubjects } from "@/features/study-session/useSubjects";
import { prefetchVisionAssets } from "@/features/study-session/vision/prefetchVisionAssets";
import { useTimelapseUserProperty } from "@/features/timelapse/useTimelapseUserProperty";
import { trackHomeDateSelected } from "@/lib/amplitude";
import { subscribeToNativeMessages } from "@/lib/bridge";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { dailyStatsQuery } from "@/lib/statsQueries";
import { listSubjects } from "@/lib/subjectApi";
import { showToast } from "@/lib/toast";
import { useFocusStart } from "@/lib/useFocusStart";
import { useIdentityPending, useUserId } from "@/lib/userId";
import { whenIdle } from "@/lib/whenIdle";

/**
 * 과목 추가 시트는 시트 부품(Base UI)과 함께 따로 받는다.
 * 홈은 첫 번들에 들어가므로 화면이 뜬 뒤 한가할 때 미리 받아 둔다.
 */
const { LazySheet: LazyAddSubjectSheet, preload: preloadAddSubjectSheet } = lazyWithPreload(() =>
  import("@/features/home/AddSubjectSheet").then((module) => module.AddSubjectSheet),
);

/**
 * 홈 본문
 *
 * 날짜 줄에서 고른 날의 과목 목록이다.
 * 하루는 플래너와 같은 05시부터 다음 날 05시까지이고, 날짜는 달력 날짜다.
 * 과목 목록은 날짜와 무관한 지금 목록이라 지난 날에도 지금 있는 과목이 전부 보인다.
 * 세션은 다른 웹뷰에서 끝나 과목 목록이 낡을 수 있어 세션 모달이 닫히면 다시 받는다.
 * 그날 시간은 같은 신호의 통계 무효화로 다시 받는다.
 * 홈 탭이 다시 보이면 세션 화면이 이미 읽었거나 시작이 실패한 것이라 남은 시작 과목을 삭제한다.
 * 웹을 거치지 않는 탭 바 재생 버튼으로 시작한 세션에 그 과목이 붙지 않게 하려는 것이다.
 */
function HomeContent({ userId }: { userId: number }) {
  const todayKey = kstDateKey();
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const isToday = selectedKey === todayKey;
  // 웹 날짜 줄과 앱 날짜 줄이 함께 쓰므로 이벤트는 여기서만 보낸다.
  const selectDate = (dateKey: string) => {
    if (dateKey === selectedKey) {
      return;
    }
    const keys = homeDateKeys(todayKey);
    trackHomeDateSelected(keys.length - 1 - keys.indexOf(dateKey));
    setSelectedKey(dateKey);
  };
  // 메뉴 내용은 아직 없어 앱 메뉴는 받지 않는다.
  useNativeHomeDateBar({ todayKey, selectedKey, onSelect: selectDate });
  const day = usePlannerDay(userId, selectedKey);

  // 과목 목록은 플래너와 같은 방법으로 받는다.
  // 오늘의 일간 조회에 실려 오고, 싣지 않는 서버면 과목 목록 API로 대신한다.
  const queryClient = useQueryClient();
  const loadSubjects = async () => {
    const today = await queryClient
      .fetchQuery({ ...dailyStatsQuery(userId, todayKey), staleTime: 0 })
      .catch(() => null);
    return (today && liveSubjectsOf(today)) ?? listSubjects();
  };
  const subjects = useSubjects(true, showToast, "home", loadSubjects);
  const { reload: reloadSubjects } = subjects;
  useEffect(
    () =>
      subscribeToNativeMessages((message) => {
        if (message.type === "session-closed") {
          void reloadSubjects();
        }
        if (message.type === "tab-focus" && message.focused) {
          clearStartSubject();
        }
      }),
    [reloadSubjects],
  );

  useStudyStatusUserProperties(userId);
  useTimelapseUserProperty();
  const startFocus = useFocusStart(userId);
  const [sheetOpen, setSheetOpen] = useState(false);

  /**
   * 그날을 그린 뒤 세션의 Vision 자원(로더·wasm·모델)을 유휴 시간에 HTTP 캐시로 올려 둔다.
   * 첫 화면과 대역폭을 다투지 않도록 성공한 뒤에만 부른다.
   * document당 한 번은 함수가 보장한다.
   */
  const dayShown = day.status === "success";
  useEffect(() => {
    if (dayShown) {
      prefetchVisionAssets();
      whenIdle(preloadAddSubjectSheet);
    }
  }, [dayShown]);

  const items =
    day.status === "success"
      ? plannerSubjectItems(
          day.day,
          subjects.status === "ready" ? subjects.subjects : null,
          isToday ? "live" : "completed",
        )
      : [];
  const liveCount = subjects.status === "ready" ? subjects.subjects.length : null;
  // 그날 기록 줄이 있으면 과목을 만든 적 있는 계정이다.
  // 기록 줄로 안 것도 남겨야 기록 없는 날로 옮겼을 때 환영 화면으로 바뀌지 않는다.
  const seenSubject = (liveCount ?? 0) > 0 || items.length > 0;
  useEffect(() => {
    if (seenSubject) {
      markSubjectCreated(userId);
    }
  }, [seenSubject, userId]);
  const emptyKind =
    liveCount === null
      ? "list"
      : homeEmptyKind(liveCount, seenSubject || hasCreatedSubject(userId));

  const addSubject = async (name: string, viaSuggestion: boolean) => {
    const created = await subjects.addSubject(name, viaSuggestion);
    if (created !== null) {
      markSubjectCreated(userId);
      setSheetOpen(false);
    }
  };
  const openSheet = () => setSheetOpen(true);

  return (
    <div className="flex flex-1 flex-col gap-3 px-5">
      <HomeHeader
        userId={userId}
        dateKey={selectedKey}
        focusSec={day.status === "success" ? day.day.focusSec : null}
        studySec={day.status === "success" ? day.day.studySec : null}
      />

      <div className="flex flex-1 flex-col gap-2.5">
        {day.status === "error" ? (
          <ErrorState message="기록을 불러오지 못했어요" onRetry={day.retry} screen="home" />
        ) : day.status === "pending" ||
          subjects.status === "idle" ||
          subjects.status === "loading" ? (
          <>
            <Skeleton className="h-17 rounded-lg" />
            <Skeleton className="h-17 rounded-lg" />
          </>
        ) : (
          <>
            {items.length > 0 && (
              <HomeSubjectList
                items={items}
                isToday={isToday}
                onPlay={(subjectId) => startFocus("home_subject", subjectId)}
              />
            )}
            {subjects.status === "error" && (
              <ErrorState
                message="과목을 불러오지 못했어요"
                onRetry={() => void reloadSubjects()}
                screen="home"
              />
            )}
            {emptyKind === "welcome" && <HomeWelcome onCreate={openSheet} />}
            {emptyKind === "empty" && (
              <Button
                variant="unstyled"
                onClick={openSheet}
                className="h-15 w-full shrink-0 rounded-lg border-[1.5px] border-dashed border-primary/45 text-[15px] leading-5 font-semibold text-primary"
              >
                + 과목 추가
              </Button>
            )}
          </>
        )}
      </div>

      <HomeDateStrip
        todayKey={todayKey}
        selectedKey={selectedKey}
        onSelect={selectDate}
        // 메뉴 내용은 아직 없어 버튼만 둔다.
        onMenu={() => {}}
        onStartWithoutSubject={() => startFocus("home_fallback")}
      />

      <LazyAddSubjectSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={addSubject} />
    </div>
  );
}

export function HomeTabPage() {
  const userId = useUserId();
  const identityPending = useIdentityPending();
  const { recovered, settled: recoverySettled, dismiss } = useLaunchSessionRecovery(userId);
  useAppLockRevokeCheck();
  // 공지가 복구 창보다 먼저다. 공지 판단이 끝나야 복구 창을 띄운다. 공지 호스트가 없으면 기다릴 것도 없다.
  const [noticeSettled, setNoticeSettled] = useState(false);
  const recoveryReady = userId === null || noticeSettled;
  // 랭킹 팝업이 떠 있는 동안 늦게 온 복구 창은 공지 때처럼 그 팝업이 닫힐 때까지 미룬다.
  const [rankingPopupOpen, setRankingPopupOpen] = useState(false);
  // 이번 실행 표시를 sessionStorage에 쓰지 못한 기기에서도 같은 문서에서는 홈 팝업 하나를 지키도록 메모리에도 둔다.
  const [homePopupInDoc, setHomePopupInDoc] = useState(false);
  const [recoveryInDoc, setRecoveryInDoc] = useState(false);
  if (recovered !== null && !recoveryInDoc) {
    setRecoveryInDoc(true);
  }

  return (
    <main
      data-testid="home-tab-page"
      className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col pb-(--tab-bar-reserve) pt-[calc(env(safe-area-inset-top)+22px)] text-foreground"
    >
      {identityPending ? (
        // 첫 토큰을 기다리는 동안은 헤더와 본문이 함께 로딩이다.
        // "등록 전"이라고 단정하지 않는다.
        <div className="flex flex-col gap-3 px-5">
          <Skeleton data-testid="home-header-pending" className="h-8.5 w-48 rounded-lg" />
          <Skeleton className="h-17 rounded-lg" />
          <Skeleton className="h-17 rounded-lg" />
        </div>
      ) : userId === null ? (
        <div className="flex flex-col gap-3 px-5">
          <h1 className="pt-1 text-[22px] leading-7.5 font-bold text-foreground">
            {dayTitleWithWeekday(kstDateKey())}
          </h1>
          <p className="p-4 text-sm text-muted-foreground">
            기기 등록 전이에요 — 앱에서 열면 기록이 저장됩니다
          </p>
        </div>
      ) : (
        <HomeContent userId={userId} />
      )}

      {userId !== null && (
        <NoticeModalHost
          userId={userId}
          paused={(recovered !== null && recoveryReady) || homePopupInDoc}
          onShown={() => setHomePopupInDoc(true)}
          onSettled={() => setNoticeSettled(true)}
        />
      )}
      {recovered !== null && recoveryReady && !rankingPopupOpen && (
        <SessionRecoveryDialog recovered={recovered} onConfirm={dismiss} />
      )}
      {/*
        랭킹 팝업은 공지·인터뷰·복구 창 다음 차례라 두 판단이 끝난 뒤에 판단한다.
        복구 결과는 실행 신호 기다림이 끝난 뒤에도 늦게 올 수 있다.
        그때 이미 떠 있는 랭킹 팝업은 내리지 않고 복구 창을 그 팝업이 닫힐 때까지 미룬다.
        메달은 띄운 직후 본 것으로 보내서, 내리면 사용자가 못 본 메달이 본 것으로 넘어간다.
      */}
      {userId !== null && (
        <HomeRankingPopupHost
          userId={userId}
          ready={noticeSettled && recoverySettled}
          blocked={homePopupInDoc || recoveryInDoc}
          onOpenChange={(open) => {
            setRankingPopupOpen(open);
            if (open) {
              setHomePopupInDoc(true);
            }
          }}
        />
      )}
    </main>
  );
}

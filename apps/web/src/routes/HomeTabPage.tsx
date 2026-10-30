import type { HomeMenuAction } from "@focusmakers/types";
import { focusManager, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAppLockRevokeCheck } from "@/features/app-lock/useAppLockRevokeCheck";
import { HomeDateStrip } from "@/features/home/HomeDateStrip";
import { homeDateKeys } from "@/features/home/homeDates";
import { HomeHeader } from "@/features/home/HomeHeader";
import { useHomeMode } from "@/features/home/homeMode";
import { HomeSubjectEdit } from "@/features/home/HomeSubjectEdit";
import { HomeSubjectList } from "@/features/home/HomeSubjectList";
import { HomeSubjectReorder } from "@/features/home/HomeSubjectReorder";
import { HomeWelcome } from "@/features/home/HomeWelcome";
import { useNativeHomeDateBar } from "@/features/home/nativeHomeDateBar";
import {
  hasCreatedSubject,
  homeEmptyKind,
  markSubjectCreated,
} from "@/features/home/subjectHistory";
import { subjectsOnDayQuery, useSubjectCompletion } from "@/features/home/subjectCompletion";
import { useStudyStatusUserProperties } from "@/features/home/useStudyStatusUserProperties";
import { useOpenManualRecord } from "@/features/manual-record/useOpenManualRecord";
import { NoticeModalHost } from "@/features/notice/NoticeModalHost";
import { liveSubjectsOf, plannerDateKeyOf } from "@/features/planner/plannerDay";
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

const SUBJECTS_PENDING_NOTICE = "과목을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요";

/**
 * 홈의 오늘 날짜 키
 *
 * 앱 탭은 마운트된 채 밤을 넘기므로 마운트할 때와 화면이 다시 보일 때마다 다시 센다.
 * 탭 보임과 문서 가시성은 `focusManager` 하나로 모여 있어 그 신호를 듣는다.
 * 그리는 중에 세면 React Compiler가 첫 값을 캐시해 날이 바뀌어도 옛 오늘에 남는다.
 */
function useHomeToday(): string {
  const [todayKey, setTodayKey] = useState(() => plannerDateKeyOf(new Date()));
  useEffect(
    () =>
      focusManager.subscribe((focused) => {
        if (focused) {
          setTodayKey(plannerDateKeyOf(new Date()));
        }
      }),
    [],
  );
  return todayKey;
}

/**
 * 홈 본문
 *
 * 날짜 줄에서 고른 날의 과목 목록이다.
 * 하루는 플래너와 같은 05시부터 다음 날 05시까지이고, 오늘도 05시에 바뀐다.
 * 새벽 0~5시에 달력의 오늘을 오늘로 두면 그때 오늘 카드로 시작한 공부가 전날 구간에 들어가 오늘에서 사라져 보인다.
 * 오늘은 지금 과목을 모두 보이고, 지난 날은 날짜별 과목 조회로 그날 있던 과목만 보인다.
 * 이 조회가 없는 서버에서는 지난 날도 지금 과목을 모두 보인다.
 * 세션은 다른 웹뷰에서 끝나 과목 목록이 낡을 수 있어 세션 모달이 닫히면 다시 받는다.
 * 그날 시간은 같은 신호의 통계 무효화로 다시 받는다.
 * 홈 탭이 다시 보이면 세션 화면이 이미 읽었거나 시작이 실패한 것이라 남은 시작 과목을 삭제한다.
 * 웹을 거치지 않는 탭 바 재생 버튼으로 시작한 세션에 그 과목이 붙지 않게 하려는 것이다.
 * 날짜 줄 메뉴의 과목 순서 변경·편집은 라우트가 아니라 이 화면의 상태라서 여기서는 상태에 맞는 화면으로 바꿔 끼우기만 한다.
 * 주소의 `date`는 시간 직접 입력에서 돌아왔을 때 고른 날짜로 다시 열려고 남긴 값이다.
 */
function HomeContent({ userId, todayKey }: { userId: number; todayKey: string }) {
  const [searchParams] = useSearchParams();
  // 오늘을 고른 것은 null로 두어 화면을 띄워 둔 채 날이 바뀌면 새 오늘을 보게 한다.
  // 다른 날은 30일 안에 있는 동안만 남고, 밖으로 밀리면 오늘로 돌아간다.
  const [pickedKey, setPickedKey] = useState(() => {
    const fromUrl = searchParams.get("date");
    return fromUrl === todayKey ? null : fromUrl;
  });
  const selectedKey =
    pickedKey !== null && homeDateKeys(todayKey).includes(pickedKey) ? pickedKey : todayKey;
  const isToday = selectedKey === todayKey;
  // 웹 날짜 줄과 앱 날짜 줄이 함께 쓰므로 이벤트는 여기서만 보낸다.
  const selectDate = (dateKey: string) => {
    if (dateKey === selectedKey) {
      return;
    }
    const keys = homeDateKeys(todayKey);
    trackHomeDateSelected(keys.length - 1 - keys.indexOf(dateKey));
    setPickedKey(dateKey === todayKey ? null : dateKey);
  };
  const day = usePlannerDay(userId, selectedKey);

  // 과목 목록은 플래너와 같은 방법으로 받는다.
  // 오늘의 일간 조회에 실려 오고, 싣지 않는 서버면 과목 목록 API로 대신한다.
  // 할 일은 달력 날짜로 나뉘어, 과목 목록 API와 같은 것을 받으려면 홈의 오늘이 아니라 달력 날짜로 받는다.
  // 홈의 오늘로 받으면 새벽 0~5시에 만든 할 일이 빠진다.
  const queryClient = useQueryClient();
  const loadSubjects = async () => {
    const today = await queryClient
      .fetchQuery({ ...dailyStatsQuery(userId, kstDateKey()), staleTime: 0 })
      .catch(() => null);
    return (today && liveSubjectsOf(today)) ?? listSubjects();
  };
  const subjects = useSubjects(true, showToast, "home", loadSubjects);
  const { reload: reloadSubjects } = subjects;
  const startFocus = useFocusStart(userId);
  const completion = useSubjectCompletion(userId, selectedKey);
  const { data: subjectsOnDay, isPending: subjectsOnDayPending } = useQuery(
    subjectsOnDayQuery(userId, selectedKey),
  );

  const homeMode = useHomeMode();
  // 과목 목록을 받기 전에는 고칠 목록이 없어 들어가지 않는다.
  // 웹 메뉴는 항목을 비활성으로 그리고, 항목을 끌 수 없는 앱 메뉴는 누른 결과가 없지 않게 알린다.
  const subjectsReady = subjects.status === "ready";
  const enterMode = (action: HomeMenuAction) => {
    if (!subjectsReady) {
      showToast(SUBJECTS_PENDING_NOTICE);
      return;
    }
    homeMode.enter(action === "reorder-subjects" ? "reorder" : "edit");
  };
  useNativeHomeDateBar({
    todayKey,
    selectedKey,
    onSelect: selectDate,
    onMenuAction: enterMode,
    hidden: homeMode.mode !== null,
  });

  const openManualRecord = useOpenManualRecord();
  const startManualRecord = (subjectId: number) => {
    // 돌아왔을 때 고른 날을 다시 열도록 지금 기록 항목의 주소에 날짜를 남긴다.
    // 라우터로 바꾸면 주소 변경이 홈 페이지뷰로 한 번 더 집계되어 브라우저 기록만 고친다.
    const url = new URL(window.location.href);
    url.searchParams.set("date", selectedKey);
    window.history.replaceState(window.history.state, "", url);
    openManualRecord({ kind: "add", dateKey: selectedKey, entry: "home", subjectId });
  };
  useEffect(
    () =>
      subscribeToNativeMessages((message) => {
        if (message.type === "session-closed") {
          void reloadSubjects();
        }
        if (message.type === "tab-focus" && message.focused) {
          clearStartSubject();
        }
        // 앱이 그린 탭 바 재생 버튼은 웹을 거치지 않으면 남은 과목 기록을 삭제할 수 없어 여기서 폴백 버튼과 같은 경로로 시작한다.
        if (message.type === "home-play-pressed") {
          startFocus("tab_bar");
        }
      }),
    [reloadSubjects, startFocus],
  );

  useStudyStatusUserProperties(userId);
  useTimelapseUserProperty();
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

  const liveSubjects = subjects.status === "ready" ? subjects.subjects : null;
  // 지난 날 목록은 날짜별 과목 조회가 최종으로 정한다.
  const dayEntries = isToday ? undefined : subjectsOnDay;
  // 기록과 이름으로 맞추기 전에 걸러야, 그날 없던 같은 이름의 새 과목에 기록이 합쳐지지 않고 지운 과목 줄로 남는다.
  // 지금 목록에 남아 있어도 그날 조회가 지운 과목이라 하면 시간 직접 입력에서 고를 수 없어 지운 과목 줄로 둔다.
  const shownSubjects =
    dayEntries === undefined
      ? liveSubjects
      : (liveSubjects?.filter((live) =>
          dayEntries.some((entry) => entry.id === live.id && !entry.deleted),
        ) ?? null);
  let items =
    day.status === "success"
      ? plannerSubjectItems(day.day, shownSubjects, isToday ? "live" : "completed")
      : [];
  if (day.status === "success" && dayEntries !== undefined) {
    // 그날 조회에 없는 과목은 기록이 있어도 그날 있던 과목이 아니라 뺀다.
    // 기록 줄의 id는 같은 이름 과목의 대표라서 그날 조회의 id로 바꿔야 그날 완료 여부를 읽는다.
    items = items.flatMap((item) => {
      if (item.live) {
        return [item];
      }
      const entry =
        dayEntries.find((candidate) => candidate.id === item.subjectId) ??
        dayEntries.find((candidate) => candidate.name === item.name);
      return entry === undefined ? [] : [{ ...item, subjectId: entry.id }];
    });
    // 그 뒤에 지운 과목은 그날 기록이 없어도 그날 있던 과목이라 0분 줄로 붙인다.
    // 기록은 이름으로 합쳐지므로 같은 이름이 이미 있으면 붙이지 않아야 한 과목이 두 번 보이지 않는다.
    for (const entry of dayEntries) {
      if (entry.deleted && !items.some((item) => item.name === entry.name)) {
        items.push({
          subjectId: entry.id,
          name: entry.name,
          colorIndex: entry.colorIndex,
          focusSec: 0,
          tasks: [],
          live: false,
        });
      }
    }
  }
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
  const addSubjectSheet = (
    <LazyAddSubjectSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={addSubject} />
  );

  if (homeMode.mode !== null) {
    return (
      <div className="flex flex-1 flex-col gap-3 px-5">
        {homeMode.mode === "reorder" ? (
          <HomeSubjectReorder store={subjects} onDone={homeMode.exit} />
        ) : (
          <HomeSubjectEdit
            store={subjects}
            onDone={homeMode.exit}
            onAddSubject={openSheet}
            onNotice={showToast}
          />
        )}
        {addSubjectSheet}
      </div>
    );
  }

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
          subjects.status === "loading" ||
          // 지난 날은 지금 과목을 모두 그렸다가 줄어들지 않게 그날 과목을 받을 때까지 기다린다.
          (!isToday && subjectsOnDayPending) ? (
          <>
            <Skeleton className="h-17 rounded-lg" />
            <Skeleton className="h-17 rounded-lg" />
          </>
        ) : (
          <>
            {items.length > 0 && (
              <HomeSubjectList
                key={selectedKey}
                items={items}
                isToday={isToday}
                onPlay={(subjectId) => startFocus("home_subject", subjectId)}
                store={subjects}
                completion={completion}
                onManualRecord={startManualRecord}
                onNotice={showToast}
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
        onMenuAction={enterMode}
        menuDisabled={!subjectsReady}
        onStartWithoutSubject={() => startFocus("home_fallback")}
      />

      {addSubjectSheet}
    </div>
  );
}

export function HomeTabPage() {
  const userId = useUserId();
  const identityPending = useIdentityPending();
  const todayKey = useHomeToday();
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
            {dayTitleWithWeekday(todayKey)}
          </h1>
          <p className="p-4 text-sm text-muted-foreground">
            기기 등록 전이에요 — 앱에서 열면 기록이 저장됩니다
          </p>
        </div>
      ) : (
        <HomeContent userId={userId} todayKey={todayKey} />
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

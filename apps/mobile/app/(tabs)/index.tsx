import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconChevronRight, IconPlay, IllustFlame, IllustStudyDoodle } from "../../components/icons";
import { UpdateNoticeSheetHost } from "../../components/UpdateNoticeSheetHost";
import { type FocusStartNavigator, runFocusStartFlow } from "../../lib/focusStartFlow";
import {
  formatHoursMinutes,
  formatMinutes,
  splitHoursMinutes,
  todayLabel,
} from "../../lib/homeFormat";

/**
 * "집중 시작" 플로우의 목적지 묶음. 라우터만 알고 분기는 모르는 얇은 어댑터다 —
 * 분기 규칙(가이드 먼저인가, 권한 게이트로 바로인가)은 `lib/focusStartFlow.ts`에 있다.
 */
const HOME_FOCUS_START_NAVIGATOR: FocusStartNavigator = {
  openOnboardingGuide: (entry) => {
    router.push({ pathname: "/onboarding-guide", params: { entry } });
  },
  showPermissionDeniedGuide: () => {
    router.push("/permission-denied");
  },
  startSession: () => {
    // TODO(SCR-S1-home.md): 싱글룸 세션 라우트(S3-1)가 아직 없다 — WG 계열 화면 구현 시 연결한다.
    // 목적지가 없는 동안에는 방어적으로 아무 동작도 하지 않는다.
  },
};

/**
 * 백엔드 "오늘" 스코프 통계·연속일수 계약이 아직 확정되지 않았다(SCR-S1-home.md의
 * Data Contract 참고) — packages/types에 상상 계약을 만들지 않고, 이 화면에만 임시로 둔다.
 * 실제 계약이 정해지면 이 타입과 MOCK_SUMMARY를 실제 데이터 훅으로 교체한다.
 */
type HomeSummaryDraft = {
  focusSec: number;
  studySec: number;
  focusRate: number;
  streakDays: number;
  longestFocusSec: number;
};

const MOCK_SUMMARY: HomeSummaryDraft = {
  focusSec: 3 * 3600 + 42 * 60,
  studySec: 5 * 3600 + 12 * 60,
  focusRate: 71,
  streakDays: 12,
  longestFocusSec: 52 * 60,
};

function HeroTodayCard({ summary }: { summary: HomeSummaryDraft }) {
  const { hours, minutes } = splitHoursMinutes(summary.focusSec);
  const fillPercent = Math.min(100, Math.max(0, summary.focusRate));

  return (
    <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark gap-3 rounded-[20px] border px-5 pb-[18px] pt-[22px]">
      <View className="gap-1.5">
        <Text className="text-text-secondary dark:text-text-secondary-dark text-[13px] font-medium">
          오늘 순공시간
        </Text>
        <View className="flex-row items-baseline gap-1">
          <Text className="text-text-primary dark:text-text-primary-dark text-[46px] font-bold">
            {hours}
          </Text>
          <Text className="text-text-primary dark:text-text-primary-dark text-[21px] font-bold">
            시간
          </Text>
          <View className="w-1.5" />
          <Text className="text-text-primary dark:text-text-primary-dark text-[46px] font-bold">
            {minutes}
          </Text>
          <Text className="text-text-primary dark:text-text-primary-dark text-[21px] font-bold">
            분
          </Text>
        </View>
      </View>

      {/* 목표 참조용 게이지 — 25/50/75% 눈금은 Figma 디자인 그대로이며 특정 데이터 필드와 연동되지 않는다 */}
      <View className="bg-bg-layer2 dark:bg-bg-layer2-dark h-3 overflow-hidden rounded-full">
        <View
          className="bg-brand-primary dark:bg-brand-primary-dark h-3 rounded-full"
          style={{ width: `${fillPercent}%` }}
        />
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-text-secondary dark:text-text-secondary-dark text-[13px]">
          총 공부 {formatHoursMinutes(summary.studySec)}
        </Text>
        <View className="bg-brand-subtle dark:bg-brand-subtle-dark rounded-full px-[9px] py-[3px]">
          <Text className="text-brand-primary dark:text-brand-primary-dark text-xs font-semibold">
            {summary.focusRate}% 집중
          </Text>
        </View>
      </View>
    </View>
  );
}

function StartCtaCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="집중 시작. 누르면 바로 측정이 시작돼요"
      className="bg-brand-primary dark:bg-brand-primary-dark min-h-11 flex-row items-center justify-between rounded-[18px] px-5 py-[22px]"
      style={{
        shadowColor: "#1b64da",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
        elevation: 6,
      }}
    >
      <View className="gap-1">
        <Text className="text-[21px] font-bold text-white">집중 시작</Text>
        <Text className="text-[12.5px] text-white/80">누르면 바로 측정이 시작돼요</Text>
      </View>
      <View className="size-[50px] items-center justify-center rounded-full bg-white/20">
        <IconPlay size={18} />
      </View>
    </Pressable>
  );
}

function StatCard({ variant, onPress }: { variant: "streak" | "longest"; onPress?: () => void }) {
  const isStreak = variant === "streak";

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark min-h-11 flex-1 gap-1 rounded-2xl border p-4"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-text-tertiary text-xs font-medium">
          {isStreak ? "연속 공부" : "최장 집중"}
        </Text>
        {isStreak && <IconChevronRight size={12} />}
      </View>
      <View className="flex-row items-center gap-1.5">
        {isStreak && <IllustFlame width={19} height={22} />}
        <Text className="text-text-primary dark:text-text-primary-dark text-xl font-bold">
          {isStreak
            ? `${MOCK_SUMMARY.streakDays}일째`
            : formatMinutes(MOCK_SUMMARY.longestFocusSec)}
        </Text>
      </View>
      <Text className="text-text-tertiary text-[11px]">
        {isStreak
          ? MOCK_SUMMARY.streakDays > 0
            ? "하루 10분이면 유지돼요"
            : "오늘 10분 집중하면 연속 공부가 시작돼요"
          : "오늘 가장 길게 집중했어요"}
      </Text>
    </Pressable>
  );
}

function GuideCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="bg-bg-guide dark:bg-bg-guide-dark min-h-11 flex-row items-center justify-between rounded-[20px] px-5 pb-[18px] pt-5"
    >
      <View className="shrink gap-1.5">
        <Text className="text-text-primary dark:text-text-primary-dark text-base font-bold">
          공부 측정 가이드
        </Text>
        <Text className="text-text-secondary dark:text-text-secondary-dark text-[13px] leading-5">
          내 진짜 순공시간,{"\n"}어떻게 재는 걸까요?
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-brand-primary dark:text-brand-primary-dark text-[13px] font-semibold">
            지금 확인해 보세요
          </Text>
          {/* 가이드 카드 링크의 셰브런은 브랜드 색이다(스탯 카드의 회색 셰브런과 다름 — Figma 확인) */}
          <IconChevronRight size={12} color="#1B64DA" />
        </View>
      </View>
      <IllustStudyDoodle width={96} height={75} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <>
      <ScrollView
        className="bg-bg-base dark:bg-bg-base-dark flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 15, paddingBottom: 24 }}
      >
        <View className="gap-3 px-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold">
              FocusON
            </Text>
            <Text className="text-text-tertiary text-[13px] font-medium">{todayLabel()}</Text>
          </View>

          <HeroTodayCard summary={MOCK_SUMMARY} />

          <StartCtaCard
            onPress={() => {
              // 최초 '집중 시작' 탭이면 온보딩 가이드(G1~G5)가 먼저 뜨고, 그 종료(완료·건너뛰기
              // 둘 다) 이후에 카메라 권한 요청으로 이어진다. 이미 본 뒤라면 곧장 권한 게이트다.
              // 분기 규칙은 `lib/focusStartFlow.ts`가 갖는다 — 이 화면은 목적지만 넘긴다.
              void runFocusStartFlow(HOME_FOCUS_START_NAVIGATOR)
                // 게이트·저장소 모두 fail-safe라 reject하지 않는다(각 모듈 주석 참고).
                // 여기 catch는 화면 전환이 실패했을 때 unhandled rejection을 막는 마지막 방어선이다 —
                // 어떤 경우에도 세션을 시작하지 않는다.
                .catch((error: unknown) => {
                  console.warn("[home] 집중 시작 플로우 처리 실패", error);
                });
            }}
          />

          <Text className="text-text-tertiary px-1 text-center text-xs">
            카메라가 자동으로 측정해요 · 영상은 저장되지 않아요
          </Text>

          <View className="flex-row gap-3">
            <StatCard
              variant="streak"
              onPress={() => {
                // TODO(SCR-S1-home.md): 기록(S5) 탭이 아직 없다 — 구현 시 연결한다.
              }}
            />
            <StatCard variant="longest" />
          </View>

          {/*
          진입 경로 B — 홈 가이드 카드에서의 "다시 보기". 최초 1회 판정과 무관하게 항상 열린다
          (`SCR-G1-G5-onboarding-guide.md` Interaction Contract §1).
        */}
          <GuideCard
            onPress={() => {
              router.push({ pathname: "/onboarding-guide", params: { entry: "home-card" } });
            }}
          />
        </View>
      </ScrollView>

      {/*
        U1 업데이트 안내 시트 — 홈 위에 얹히는 오버레이다. **기본은 비노출**이라 평소에는
        아무것도 렌더하지 않는다(`app.json`의 `extra.updateNoticeEnabled`가 false).
        노출 판정·닫힘 처리는 전부 `UpdateNoticeSheetHost` 안에 있다 — 홈은 위치만 정한다.
      */}
      <UpdateNoticeSheetHost />
    </>
  );
}

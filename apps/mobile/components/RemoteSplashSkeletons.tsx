import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Skeleton } from "./ui/Skeleton";

/**
 * 웹뷰 로드 스플래시용 스켈레톤 — `RemoteScreen`의 `splash`로 꽂는다.
 */

/** 홈 */
export function HomeTabSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 gap-3 px-5" style={{ paddingTop: insets.top + 15 }}>
      <View className="h-[21px] flex-row items-center justify-between">
        <Skeleton className="h-[21px] w-20 rounded-md" />
        <Skeleton className="h-4 w-[90px] rounded-md" />
      </View>
      <Skeleton className="h-[180px] rounded-xl" />
      <Skeleton className="h-[94px] rounded-[18px]" />
      <Skeleton className="h-[14px] w-[210px] self-center rounded-md" />
      <View className="flex-row gap-3">
        <Skeleton className="h-[92px] flex-1 rounded-2xl" />
        <Skeleton className="h-[92px] flex-1 rounded-2xl" />
      </View>
      <Skeleton className="h-[108px] rounded-xl" />
    </View>
  );
}

/** 기록 */
export function RecordsTabSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 px-5" style={{ paddingTop: insets.top + 17 }}>
      <Skeleton className="h-[29px] w-14 rounded-md" />
      <View className="mt-[13px]">
        <Skeleton className="h-[92px] rounded-2xl" />
      </View>
      <View className="mt-6">
        <Skeleton className="h-[340px] rounded-xl" />
      </View>
      {/* 일별 요약 pending과 같은 구성(RecordsPage의 자체 로딩 스켈레톤과 동일 수치). */}
      <View className="mt-6 gap-2.5">
        <Skeleton className="h-[21px] w-40 rounded-md" />
        <View className="flex-row gap-2.5">
          <Skeleton className="h-[92px] flex-1 rounded-2xl" />
          <Skeleton className="h-[92px] flex-1 rounded-2xl" />
        </View>
      </View>
    </View>
  );
}

/** 랭킹 (웹 `RankingPage`의 자리표시와 같은 높이와 간격) */
export function RankingTabSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 px-5" style={{ paddingTop: insets.top + 24 }}>
      <View className="h-[29px] flex-row items-center justify-between">
        <Skeleton className="h-[29px] w-40 rounded-md" />
        <Skeleton className="h-7 w-[76px] rounded-full" />
      </View>
      <Skeleton className="mt-[7px] h-9 rounded-full" />
      <View className="mt-3 gap-3">
        <Skeleton className="h-[176px] rounded-xl" />
        <Skeleton className="h-[158px] rounded-xl" />
        <Skeleton className="h-[262px] rounded-xl" />
      </View>
    </View>
  );
}

/**
 * 설정 섹션 하나
 */
function SettingsSectionSkeleton({
  labelWidth,
  rowWidths,
  captionWidth,
  className,
}: {
  labelWidth: number;
  rowWidths: number[];
  captionWidth?: number;
  className: string;
}) {
  return (
    <View className={className}>
      <View className="px-1">
        <Skeleton className="h-[15px] rounded-md" style={{ width: labelWidth }} />
      </View>
      <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark mt-1.5 rounded-lg border px-4">
        {rowWidths.map((width, index) => (
          <View key={index}>
            {index > 0 && <View className="bg-border-default dark:bg-border-default-dark h-px" />}
            <View className="min-h-11 flex-row items-center justify-between py-[14px]">
              <Skeleton className="h-[19px] rounded-md" style={{ width }} />
              <Skeleton className="h-3 w-2 rounded-md" />
            </View>
          </View>
        ))}
      </View>
      {captionWidth !== undefined && (
        <View className="mt-2.5 px-1">
          <Skeleton className="h-[15px] rounded-md" style={{ width: captionWidth }} />
        </View>
      )}
    </View>
  );
}

/** 설정 */
export function SettingsTabSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 px-5" style={{ paddingTop: insets.top + 17 }}>
      <Skeleton className="h-[29px] w-14 rounded-md" />
      <SettingsSectionSkeleton className="mt-[23px]" labelWidth={40} rowWidths={[76]} />
      <SettingsSectionSkeleton
        className="mt-5"
        labelWidth={28}
        rowWidths={[76, 96]}
        captionWidth={196}
      />
      <SettingsSectionSkeleton className="mt-5" labelWidth={28} rowWidths={[68]} />
      <SettingsSectionSkeleton className="mt-6" labelWidth={62} rowWidths={[60, 116, 108, 68]} />
    </View>
  );
}

/**
 * 화면 바닥에서 탭 바 윗변 8 위까지의 거리
 *
 * 웹 `--tab-bar-reserve`와 같은 식이고, 웹은 떠 있는 버튼을 여기서 16 더 위에 둔다.
 * iOS 시스템 탭 바는 탭 화면의 아래쪽 안전영역에 자기 높이 49를 넣어서 웹뷰와 이 스켈레톤이 읽는 안전영역 모두 탭 바를 이미 담고 있다.
 * 여기서 49를 한 번 더 더하면 웹이 뜰 때 + 버튼이 49만큼 아래로 뛴다.
 * Android 탭 바는 높이 70이고 바닥에서 안전영역과 24 가운데 큰 값만큼 떠 있다.
 */
function tabBarReserve(bottomInset: number): number {
  return Platform.OS === "ios" ? bottomInset + 8 : 70 + Math.max(bottomInset, 24) + 8;
}

/**
 * 그룹
 *
 * 이 앱은 웹을 `groupRooms=1`로 열어서 이 탭은 언제나 그룹 탭 목록으로 열린다.
 * 웹 그룹 탭이 내 그룹을 받는 동안 그리는 자리표시와 같은 모양이라 카드도 두 장이다.
 * 앱의 rem은 14px이라 Tailwind 간격 단계 대신 웹과 같은 px 값을 쓴다.
 */
export function SocialTabSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 17 }}>
      <View className="px-[20px]">
        <Skeleton className="h-[30px] w-[48px] rounded-md" />
      </View>
      {/* 탭 줄 아래 경계선까지 그려야 웹이 뜰 때 선이 새로 생기지 않는다. */}
      <View
        testID="social-skeleton-tabs"
        className="border-border-default dark:border-border-default-dark mt-[16px] h-[46px] flex-row items-center gap-[22px] border-b px-[20px]"
      >
        <Skeleton className="h-[20px] w-[52px] rounded-md" />
        <Skeleton className="h-[20px] w-[68px] rounded-md" />
      </View>
      <View testID="social-skeleton-groups" className="gap-[12px] px-[20px] pt-[14px]">
        <Skeleton className="h-[164px] rounded-xl" />
        <Skeleton className="h-[164px] rounded-xl" />
      </View>
      <View
        testID="social-skeleton-create"
        className="absolute right-[20px]"
        style={{ bottom: tabBarReserve(insets.bottom) + 16 }}
      >
        <Skeleton className="h-[56px] w-[56px] rounded-full" />
      </View>
    </View>
  );
}

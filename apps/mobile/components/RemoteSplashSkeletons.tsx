import { View } from "react-native";
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
 * 소셜
 */
export function SocialTabSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 px-5" style={{ paddingTop: insets.top + 17 }}>
      <Skeleton className="h-[34px] w-14 rounded-md" />
      <View className="flex-1 items-center justify-center gap-2">
        <Skeleton className="h-[88px] w-[88px] rounded-full" />
        <View className="h-2" />
        <Skeleton className="h-[22px] w-[158px] rounded-md" />
        <Skeleton className="h-10 w-[205px] rounded-md" />
        <View className="h-4" />
        <View className="flex-row gap-2.5">
          <Skeleton className="h-12 w-[99px] rounded-[14px]" />
          <Skeleton className="h-12 w-[141px] rounded-[14px]" />
        </View>
      </View>
    </View>
  );
}

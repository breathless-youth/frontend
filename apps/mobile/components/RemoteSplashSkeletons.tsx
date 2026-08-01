import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Skeleton } from "./ui/Skeleton";

/**
 * 탭 3개(홈·기록·설정)의 웹뷰 로드 스플래시용 스켈레톤 — `RemoteScreen`의 `splash`로 꽂는다.
 *
 * 각 스켈레톤은 대응하는 `apps/web` 페이지의 **실측 레이아웃을 미러링한다**(HomeTabPage·
 * RecordsPage·SettingsPage의 컨테이너 패딩·카드 높이·모서리 반경을 그대로 옮김). 로드가
 * 끝나는 순간 같은 자리에 같은 모양의 실제 콘텐츠가 나타나야 스켈레톤→화면 전환이 "바뀐다"가
 * 아니라 "채워진다"로 보인다 — 수치를 임의로 고치면 전환 순간 레이아웃이 튄다.
 *
 * 정적 텍스트(타이틀·캡션)도 막대로 둔다 — 진짜 텍스트를 넣으려면 웹의 날짜 포맷 등 로직을
 * 여기 중복해야 하고, 그 값이 웹과 어긋나면 로드 완료 순간 글자가 바뀌는 게 더 눈에 띈다.
 *
 * 상단 패딩: 웹은 `env(safe-area-inset-top) + 15|17px` — RN에서는 `useSafeAreaInsets().top`이
 * 같은 값이다. 좌우 `px-5`(20px)도 웹 컨테이너와 동일.
 */

/** 홈(S1) — HomeTabPage: 헤더 / 히어로 180 / CTA / 캡션 / 통계 2열 92 / 가이드 카드. */
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

/** 기록(S5) — RecordsPage: 타이틀 / 스트릭 배너 92 / 월 달력 / 일별 요약 타일 2×2. */
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
 * 설정 섹션 하나 — 라벨 + group-card(행 사이 헤어라인) + (옵션) 캡션.
 *
 * ⚠️ **카드가 이 화면의 지배적인 형태다.** 카드 없이 행만 그리면 로드 완료 순간 테두리와
 * 배경이 통째로 생겨나 "다른 화면으로 바뀐" 것처럼 보인다(2026-08-01 사용자 확인 — 초기
 * 스켈레톤이 행만 그려 어색했던 원인). `SettingsSection`의 `bg-muted border rounded-lg px-4`와
 * 같은 껍데기를 그대로 둔다.
 *
 * `rowWidths`의 길이가 행 수이고, 값은 라벨 자리표시의 너비다 — 행마다 라벨 길이가 달라야
 * 실제 화면처럼 보인다.
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

/** 설정(S6) — SettingsPage: 타이틀 / 측정(2행+캡션) / 지원(1행) / 약관·정보(4행). */
export function SettingsTabSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 px-5" style={{ paddingTop: insets.top + 17 }}>
      <Skeleton className="h-[29px] w-14 rounded-md" />
      <SettingsSectionSkeleton
        className="mt-[23px]"
        labelWidth={28}
        rowWidths={[76, 96]}
        captionWidth={196}
      />
      <SettingsSectionSkeleton className="mt-5" labelWidth={28} rowWidths={[68]} />
      <SettingsSectionSkeleton className="mt-6" labelWidth={62} rowWidths={[60, 116, 108, 68]} />
    </View>
  );
}

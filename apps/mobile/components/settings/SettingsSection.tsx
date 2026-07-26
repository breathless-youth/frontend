import { Children, Fragment, type ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * S6 설정의 한 그룹 — 섹션 라벨 + group-card + (옵션) 카드 하단 캡션
 * (Figma `67:742` · `67:758` · `67:767`).
 *
 * **헤어라인은 이 카드가 그린다.** Figma `Settings / Row`(43:117) 컴포넌트 설명이
 * "행 사이 1px 헤어라인은 화면에서 배치"라고 못박고 있어, 행이 자기 아래 선을 그리지 않는다
 * (마지막 행 뒤에 선이 남는 흔한 버그를 구조적으로 막는다).
 *
 * 헤어라인 색은 Figma 실측값(#EFF1F3)이 아니라 `border/default` 토큰이다 — 원본은 이 값을
 * 변수에 바인딩하지 않아 다크 모드 값이 없고, 그대로 쓰면 카드 배경(#191F28) 위에 극단적으로
 * 밝은 선이 된다(`SCR-S6-settings.md` Design Tokens Used).
 * TODO(SCR-S6-settings.md Review Checklist): Figma 헤어라인(67:748·67:774·67:781·67:788)에
 * 색상 변수 바인딩 추가 요청 — 원본을 고치지 않으면 다음 익스포트에서 반복된다.
 */

type SettingsSectionProps = {
  /** 섹션 라벨. 화면 좌우 패딩(20)에 4px 더한 x24가 Figma 실측값이라 라벨만 `px-1`을 갖는다. */
  label: string;
  /** 카드 아래 안내 캡션. */
  caption?: string;
  /** 섹션 간 간격은 Figma 실측이 균일하지 않아(23/20/24) 호출부가 지정한다. */
  className?: string;
  /** `SettingsRow` 목록. 사이사이 헤어라인이 자동으로 들어간다. */
  children: ReactNode;
};

export function SettingsSection({ label, caption, className, children }: SettingsSectionProps) {
  const rows = Children.toArray(children);

  return (
    <View className={className}>
      <Text className="text-text-tertiary px-1 text-[13px] font-medium leading-[15px]">
        {label}
      </Text>

      <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark mt-1.5 rounded-lg border px-4">
        {rows.map((row, index) => (
          // 행 목록은 JSX에 정적으로 적힌 고정 배열이라(추가·삭제·재정렬 없음) 인덱스가 안정적인 키다.
          <Fragment key={index}>
            {index > 0 && <View className="bg-border-default dark:bg-border-default-dark h-px" />}
            {row}
          </Fragment>
        ))}
      </View>

      {caption !== undefined && (
        <Text className="text-text-tertiary mt-2.5 px-1 text-xs leading-[14px]">{caption}</Text>
      )}
    </View>
  );
}

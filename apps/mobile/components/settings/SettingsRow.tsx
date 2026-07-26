import { Pressable, Text, View } from "react-native";

import { IconChevronRight, IconExternalLink } from "../icons";
import { PermissionToggle } from "./PermissionToggle";

/**
 * S6 설정의 리스트 행 (Figma `Settings / Row` 43:117).
 *
 * Figma의 5개 variant(`Toggle`·`ChevronSub`·`Chevron`·`External`·`Value`)는 여기서
 * **트레일링 4종 × 보조 문구 유무**로 표현된다 — `ChevronSub`는 `chevron` + `sublabel`이다.
 *
 * 행 사이 1px 헤어라인은 **행이 아니라 카드가 그린다**(Figma 컴포넌트 설명: "행 사이 1px
 * 헤어라인은 화면에서 배치") — `SettingsSection` 참고.
 *
 * 높이를 고정하지 않는다. Figma 실측(47 / 59 / 65px)은 py 14px + 콘텐츠 높이의 결과이고,
 * 시스템 폰트 확대 시 행이 함께 늘어나야 문구가 잘리지 않는다.
 */

export type SettingsRowTrailing =
  /** OS 카메라 권한 상태 표시(조작 불가). */
  | { kind: "toggle"; granted: boolean }
  /** 앱 내 이동. */
  | { kind: "chevron" }
  /** 앱 밖(외부 브라우저)으로 나감. */
  | { kind: "external" }
  /** 값 표시만 — 누를 수 없다. */
  | { kind: "value"; value: string };

type SettingsRowProps = {
  label: string;
  /** 라벨 아래 보조 문구. 폰트 확대 시 두 줄이 될 수 있어 줄바꿈을 막지 않는다. */
  sublabel?: string;
  trailing: SettingsRowTrailing;
  /**
   * 탭 동작. **넘기지 않으면 행이 버튼으로 노출되지 않는다** — 목적지가 확정되지 않은 행을
   * 버튼처럼 읽어주면 스크린리더 사용자에게 없는 화면을 있다고 말하는 셈이다
   * (S1 홈 `StatCard`·S5 세션 아이템과 같은 방어 규칙).
   */
  onPress?: () => void;
  /**
   * 지정하지 않으면 `label`(+ `sublabel`)을 합성해 쓴다. 상태를 함께 읽어야 하는
   * 행(카메라 권한)만 넘긴다.
   *
   * ⚠️ 합성이 필요한 이유: `Pressable`은 `accessible`이 기본 `true`라 행 전체가 하나의 접근성
   * 요소로 병합되는데, `accessibilityLabel`을 명시하면 자식 `Text`를 순회해 만들던 기본 라벨이
   * 통째로 덮어써진다. 라벨만 넘기면 `sublabel`이 화면에는 보이지만 스크린리더에서는 사라진다
   * (`SettingsRow`의 `sublabel`은 `측정 기준 안내` 행의 싱글룸 프라이버시 문구다).
   */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/** 최소 44px 터치 타겟 — 실측 높이(47/59/65)가 이미 넘지만 폰트 축소 상황의 바닥값으로 둔다. */
const ROW_CLASS_NAME = "min-h-11 flex-row items-center justify-between gap-3 py-[14px]";

function RowTrailing({ trailing }: { trailing: SettingsRowTrailing }) {
  switch (trailing.kind) {
    case "toggle":
      return <PermissionToggle granted={trailing.granted} />;
    case "chevron":
      return <IconChevronRight size={12} />;
    case "external":
      return <IconExternalLink size={12} />;
    case "value":
      return (
        <Text className="text-text-tertiary shrink-0 text-[15px] leading-[18px]">
          {trailing.value}
        </Text>
      );
  }
}

export function SettingsRow({
  label,
  sublabel,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const content = (
    <>
      {/* `shrink`가 있어야 라벨이 길어질 때 트레일링을 밀어내지 않고 접힌다. */}
      <View className="shrink gap-[3px]">
        <Text className="text-text-primary dark:text-text-primary-dark text-base leading-[19px]">
          {label}
        </Text>
        {sublabel !== undefined && (
          <Text className="text-text-tertiary text-xs leading-[15px]">{sublabel}</Text>
        )}
      </View>
      <RowTrailing trailing={trailing} />
    </>
  );

  if (onPress === undefined) {
    return <View className={ROW_CLASS_NAME}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (sublabel === undefined ? label : `${label}, ${sublabel}`)
      }
      accessibilityHint={accessibilityHint}
      className={ROW_CLASS_NAME}
    >
      {content}
    </Pressable>
  );
}

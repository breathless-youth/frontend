import { Pressable, Text } from "react-native";

/**
 * Figma 공용 컴포넌트 `Button / CTA`(node 40:94)의 **LG 변형**(362×52, r16).
 *
 * 컴포넌트 설명상 변형은 3종(XL 362×56 결과 화면 · LG 362×52 시트 · Dark SM 136×48
 * 다크 다이얼로그)이지만, 지금 쓰이는 LG만 구현한다 — 쓰지 않는 변형을 미리 만들지 않는다.
 * S3-8·S4·G1~G5에서 다른 변형이 필요해지면 그때 이 파일에 추가한다.
 *
 * 너비는 인스턴스에서 조정 가능(Figma 설명) → 부모의 좌우 패딩을 그대로 채운다.
 * 높이 52px로 최소 터치 타깃 44px을 충족한다.
 */
export function PrimaryCtaButton({
  label,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  /** 라벨만으로 목적이 불분명할 때만 넘긴다. 기본값은 라벨 텍스트. */
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      className="bg-brand-primary active:bg-brand-hover dark:bg-brand-primary-dark dark:active:bg-brand-hover-dark h-[52px] w-full items-center justify-center rounded-lg"
    >
      {/* Figma 실측 16px Bold / lh19 — label.lg(16/24 medium)와 weight·행간이 달라 실측값을 쓴다 */}
      <Text className="text-text-onBrand text-[16px] font-bold leading-[19px]">{label}</Text>
    </Pressable>
  );
}

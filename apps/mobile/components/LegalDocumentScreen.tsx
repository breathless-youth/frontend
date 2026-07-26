import { useEffect, useRef } from "react";
import { AccessibilityInfo, findNodeHandle, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { effectiveDateLabel, type LegalBlock, type LegalDocument } from "../lib/legalDocuments";
import { ScreenBackHeader } from "./ScreenBackHeader";

/**
 * 법적 문서(이용약관 · 개인정보처리방침) 본문 화면.
 *
 * 두 문서의 구조가 같아서 렌더러를 하나만 둔다 — 라우트(`app/terms.tsx`·`app/privacy.tsx`)는
 * 어떤 문서를 넘길지만 정한다. 본문은 `lib/legalDocuments.ts`가 소유하며 이 컴포넌트는
 * 문구를 알지 못한다(문구를 여기 복제하면 두 곳이 갈라진다).
 *
 * 탭 바 없는 전체 화면 스택 라우트라 `app/(tabs)/` 밖에 둔다 — S2-3(권한 거부 안내)과 같은 구조다.
 */

/** 블록 사이 간격. 문단은 촘촘하게, 조항 안의 목록·라벨 블록은 조금 띄운다. */
function BlockView({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <Text className="text-text-secondary dark:text-text-secondary-dark mt-[10px] text-[14px] leading-[22px]">
          {block.text}
        </Text>
      );

    case "bullets":
      return (
        <View className="mt-[10px] gap-[6px]">
          {block.items.map((item) => (
            // 가운뎃점을 텍스트에 섞지 않고 별도 열로 둔다 — 두 줄 이상이 될 때 들여쓰기가 유지된다.
            <View key={item} className="flex-row gap-[8px]">
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="text-text-tertiary text-[14px] leading-[22px]"
              >
                ·
              </Text>
              <Text className="text-text-secondary dark:text-text-secondary-dark shrink text-[14px] leading-[22px]">
                {item}
              </Text>
            </View>
          ))}
        </View>
      );

    case "fields":
      return (
        <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark mt-[12px] gap-[12px] rounded-lg border p-[14px]">
          {block.rows.map((row) => (
            <View key={row.label} className="gap-[3px]">
              <Text className="text-text-primary dark:text-text-primary-dark text-[13px] font-medium leading-[16px]">
                {row.label}
              </Text>
              <Text className="text-text-secondary dark:text-text-secondary-dark text-[14px] leading-[22px]">
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      );
  }
}

export function LegalDocumentScreen({ document }: { document: LegalDocument }) {
  const insets = useSafeAreaInsets();
  const titleRef = useRef<Text>(null);

  // 화면 진입 시 스크린 리더 포커스를 제목으로 보낸다(S2-3과 같은 처리).
  useEffect(() => {
    const handle = findNodeHandle(titleRef.current);
    if (handle != null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  return (
    <View className="bg-bg-base dark:bg-bg-base-dark flex-1" style={{ paddingTop: insets.top }}>
      {/* 제목은 본문 첫 줄이 24px로 크게 그린다 — 상단 바에 또 넣지 않는다(중복 낭독 방지). */}
      <ScreenBackHeader />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Text
          ref={titleRef}
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark text-2xl font-bold leading-[29px]"
        >
          {document.title}
        </Text>
        <Text className="text-text-tertiary mt-[8px] text-[12px] leading-[15px]">
          {effectiveDateLabel(document)}
        </Text>

        {document.intro !== undefined && (
          <Text className="text-text-secondary dark:text-text-secondary-dark mt-[18px] text-[14px] leading-[22px]">
            {document.intro}
          </Text>
        )}

        {document.sections.map((section) => (
          <View key={section.heading} className="mt-[26px]">
            <Text
              accessibilityRole="header"
              className="text-text-primary dark:text-text-primary-dark text-[16px] font-semibold leading-[20px]"
            >
              {section.heading}
            </Text>
            {section.blocks.map((block, index) => (
              // 블록은 순서가 곧 정체성이라 인덱스를 키로 쓴다 — 재정렬·삽입이 일어나지 않는 정적 데이터다.
              <BlockView key={index} block={block} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

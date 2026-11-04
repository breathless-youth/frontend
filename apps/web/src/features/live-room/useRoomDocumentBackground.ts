import { colors } from "@focusmakers/design-tokens";
import { useLayoutEffect } from "react";

/**
 * 공부방 동안 문서 배경을 방 화면 색으로 두기
 *
 * 싱글룸은 웹뷰 자체의 배경이 어두운 세션 색이지만 공부방은 소셜 탭 웹뷰라 라이트 모드에서 웹뷰 배경이 흰색이다.
 * 문서 배경까지 흰색이면 뒤로 가기 스와이프의 미리보기에 그림이 없을 때 그 자리가 흰 화면으로 드러난다.
 * 방을 나가면 도착한 화면이 자기 테마로 그려지도록 되돌린다.
 */
export function useRoomDocumentBackground(): void {
  useLayoutEffect(() => {
    const elements = [document.documentElement, document.body];
    for (const element of elements) {
      element.style.backgroundColor = colors.bg.base.dark;
    }
    return () => {
      for (const element of elements) {
        element.style.removeProperty("background-color");
      }
    };
  }, []);
}

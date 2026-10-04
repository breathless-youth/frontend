/**
 * iOS 전용 시스템 탭 레이아웃의 Android 자리표시자
 *
 * 실제 구현은 `NativeTabsLayout.ios.tsx`에 있고 Metro가 플랫폼 확장자로 고른다.
 * Android는 `app/(tabs)/_layout.tsx`가 커스텀 바를 그리므로 여기까지 오지 않는다.
 * iOS 전용 API와 아이콘 PNG가 Android 번들에 들어가지 않게 파일을 나눴다.
 */
export function NativeTabsLayout(): null {
  return null;
}

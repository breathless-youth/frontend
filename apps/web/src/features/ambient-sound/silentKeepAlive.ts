/**
 * iOS 웹뷰에서 무음 스위치를 넘기 위한 무음 <audio>
 *
 * - WebKit 은 Web Audio 만 쓰는 페이지를 주변음으로 분류해 무음 스위치를 따르고, 미디어 요소가
 *   재생 중이면 미디어 재생으로 바꿔 스위치를 무시한다. 앱이 잡는 오디오 세션 카테고리는 여기
 *   관여하지 않는다. 앱에서 playback 카테고리를 잡고 활성화해도 무음이었고, 이 요소 하나만으로
 *   들렸다
 * - Apple WebKit 에서만 만든다. 다른 엔진은 필요 없고, Android 웹뷰는 미디어 요소가 오디오
 *   포커스를 잡아 다른 앱 음악을 끊을 수 있다. 무음 스위치가 없는 macOS Safari 도 포함되는데,
 *   그쪽에서는 소리가 켜진 동안 탭 오디오 표시와 재생 중 항목이 생기는 정도라 따로 가르지 않는다.
 * - 무음 mp3 는 react-native-webview 의 ignoreSilentHardwareSwitch 가 쓰는 파일과 같다. 그 prop 은
 *   Fabric 래퍼에 전달되지 않아 이 앱에서는 동작하지 않는다.
 */
const SILENT_MP3 =
  "data:audio/mp3;base64,//tAxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAFAAAESAAzMzMzMzMzMzMzMzMzMzMzMzMzZmZmZmZmZmZmZmZmZmZmZmZmZmaZmZmZmZmZmZmZmZmZmZmZmZmZmczMzMzMzMzMzMzMzMzMzMzMzMzM//////////////////////////8AAAA5TEFNRTMuMTAwAZYAAAAAAAAAABQ4JAMGQgAAOAAABEhNIZS0AAAAAAD/+0DEAAPH3Yz0AAR8CPqyIEABp6AxjG/4x/XiInE4lfQDFwIIRE+uBgZoW4RL0OLMDFn6E5v+/u5ehf76bu7/6bu5+gAiIQGAABQIUJ0QolFghEn/9PhZQpcUTpXMjo0OGzRCZXyKxoIQzB2KhCtGobpT9TRVj/3Pmfp+f8X7Pu1B04sTnc3s0XhOlXoGVCMNo9X//9/r6a10TZEY5DsxqvO7mO5qFvpFCmKIjhpSItGsUYcRO//7QsQRgEiljQIAgLFJAbIhNBCa+JmorCbOi5q9nVd2dKnusTMQg4MFUlD6DQ4OFijwGAijRMfLbHG4nLVTjydyPlJTj8pfPflf9/5GD950A5e+jsrmNZSjSirjs1R7hnkia8vr//l/7Nb+crvr9Ok5ZJOylUKRxf/P9Zn0j2P4pJYXyKkeuy5wUYtdmOu6uobEtFqhIJViLEKIjGxchGev/L3Y0O3bwrIOszTBAZ7Ih28EUaSOZf/7QsQfg8fpjQIADN0JHbGgQBAZ8T//y//t/7d/2+f5m7MdCeo/9tdkMtGLbt1tqnabRroO1Qfvh20yEbei8nfDXP7btW7f9/uO9tbe5IvHQbLlxpf3DkAk0ojYcv///5/u3/7PTfGjPEPUvt5D6f+/3Lea4lz4tc4TnM/mFPrmalWbboeNiNyeyr+vufttZuvrVrt/WYv3T74JFo8qEDiJqJrmDTs///v99xDku2xG02jjunrICP/7QsQtA8kpkQAAgNMA/7FgQAGnobgfghgqA+uXwWQ3XFmGimSbe2X3ksY//KzK1a2k6cnNWOPJnPWUsYbKqkh8RJzrVf///P///////4vyhLKHLrCb5nIrYIUss4cthigL1lQ1wwNAc6C1pf1TIKRSkt+a//z+yLVcwlXKSqeSuCVQFLng2h4AFAFgTkH+Z/8jTX/zr//zsJV/5f//5UX/0ZNCNCCaf5lTCTRkaEdhNP//n/KUjf/7QsQ5AEhdiwAAjN7I6jGddBCO+WGTQ1mXrYatSAgaykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg==";

type VendorSource = Pick<Navigator, "vendor"> | null;

export function isAppleWebKit(nav: VendorSource = globalThis.navigator): boolean {
  return nav?.vendor === "Apple Computer, Inc.";
}

export function createSilentKeepAlive(
  nav: VendorSource = globalThis.navigator,
): HTMLAudioElement | null {
  if (!isAppleWebKit(nav)) return null;
  const element = new Audio(SILENT_MP3);
  element.loop = true;
  return element;
}

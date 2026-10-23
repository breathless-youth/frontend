import type { InlineControl } from "@focusmakers/types";
import { requireOptionalNativeModule } from "expo-modules-core";

export type WebGlassPalette = {
  tintLight: string; // "#RRGGBB"
  tintDark: string;
  foregroundLight: string;
  foregroundDark: string;
  disabledLight: string;
  disabledDark: string;
  // 버튼 색 역할 색. 강조 채움 바탕과 그 위 아이콘, 위험, 켜짐이다.
  prominentLight: string;
  prominentDark: string;
  onProminentLight: string;
  onProminentDark: string;
  dangerLight: string;
  dangerDark: string;
  activeLight: string;
  activeDark: string;
};

export type WebGlassPressEvent = { viewTag: number; id: string; value: number };

/**
 * 뒤로 가기 스와이프 진행
 *
 * progress는 손가락이 움직인 거리를 웹뷰 폭으로 나눈 0~1 값이다.
 * ended는 손을 뗐다는 뜻일 뿐이고, 이동이 이뤄졌는지는 WebKit이 정해서 알 수 없다.
 */
export type WebGlassBackGestureEvent = {
  viewTag: number;
  phase: "began" | "changed" | "ended" | "cancelled";
  progress: number;
};

type WebGlassNative = {
  sync(
    viewTag: number,
    controls: InlineControl[],
    hidden: boolean,
    palette: WebGlassPalette,
  ): Promise<number>;
  clear(viewTag: number): Promise<void>;
  setInlineClipTop?(viewTag: number, inset: number): Promise<void>;
  setInlineColorScheme?(viewTag: number, scheme: "dark" | null): Promise<void>;
  observeBackGesture?(viewTag: number): Promise<void>;
  addListener(name: "onPress", listener: (event: WebGlassPressEvent) => void): { remove(): void };
  addListener(
    name: "onBackGesture",
    listener: (event: WebGlassBackGestureEvent) => void,
  ): { remove(): void };
};

/**
 * iOS 웹뷰 본문 glass 컨트롤 모듈
 *
 * Android와 Jest, 이 모듈이 없는 옛 Dev Client에서는 null이라 부르는 쪽이 지원하지 않는 기기로 처리한다.
 */
export const webGlassNative = requireOptionalNativeModule<WebGlassNative>("WebGlass");

/**
 * 이 앱의 Swift가 그리는 본문 부품 종류
 *
 * 웹은 이 목록에 있는 종류만 숨기고 보내서, 앱보다 새 웹이 새 종류를 써도 그 컨트롤은 웹 모양으로 남는다.
 * Swift `sync`에 종류를 더하면 여기에도 더한다.
 */
export const SUPPORTED_INLINE_KINDS: readonly InlineControl["kind"][] = [
  "segment",
  "switch",
  "button",
];

/**
 * 본문 부품 목록 맞추기
 *
 * 붙인 부품 개수를 돌려주고, 웹뷰를 아직 찾지 못했으면 네이티브가 0을 돌려준다.
 * 웹은 원본을 이미 숨겼으므로 부르는 쪽이 이 개수를 보고 다시 시도한다.
 * 네이티브 거부와 모듈이 없는 기기는 null로 돌려줘 처리되지 않은 거부가 남지 않는다.
 */
export function syncInlineControls(
  viewTag: number,
  controls: InlineControl[],
  hidden: boolean,
  palette: WebGlassPalette,
): Promise<number | null> {
  return (
    webGlassNative?.sync(viewTag, controls, hidden, palette).catch(() => null) ??
    Promise.resolve(null)
  );
}

/** 웹뷰를 다시 띄우거나 내릴 때 그 웹뷰에 붙인 부품을 모두 삭제한다. */
export function clearInlineControls(viewTag: number): void {
  webGlassNative?.clear(viewTag).catch(() => undefined);
}

/**
 * 본문 부품을 자르는 위쪽 선 맞추기
 *
 * 웹뷰 안전 영역의 위쪽 끝에서 잰 pt 값이고, 이 선보다 위로 스크롤된 부품은 그리지도 누르지도 않는다.
 * 위쪽 줄이 없으면 0을 넘기고, 그때는 자르지 않는다.
 */
export function setInlineClipTop(viewTag: number, inset: number): void {
  // 이 함수가 생기기 전에 만든 Dev Client에는 모듈만 있고 함수가 없어서 있을 때만 부른다.
  webGlassNative?.setInlineClipTop?.(viewTag, inset).catch(() => undefined);
}

/**
 * 본문 부품 층의 테마 고정
 *
 * 세션처럼 웹이 시스템 테마와 무관하게 다크로 그리는 화면은 `dark`를 넘겨 앱 부품도 다크로 그린다.
 * null이면 시스템 테마를 따른다.
 */
export function setInlineColorScheme(viewTag: number, scheme: "dark" | null): void {
  // 이 함수가 생기기 전에 만든 Dev Client에는 모듈만 있고 함수가 없어서 있을 때만 부른다.
  webGlassNative?.setInlineColorScheme?.(viewTag, scheme).catch(() => undefined);
}

/** 모듈이 없으면 아무것도 구독하지 않고 빈 해제 함수를 돌려준다. */
export function addInlineControlPressListener(
  listener: (event: WebGlassPressEvent) => void,
): () => void {
  const subscription = webGlassNative?.addListener("onPress", listener);
  return () => subscription?.remove();
}

/**
 * 뒤로 가기 스와이프 진행 받기 시작
 *
 * 이미 받고 있는 인식기면 네이티브가 다시 붙이지 않아서 로드가 끝날 때마다 불러도 된다.
 * clear를 부르면 그 웹뷰의 관찰도 멈춘다.
 */
export function observeBackGesture(viewTag: number): void {
  // 이 함수가 생기기 전에 만든 Dev Client에는 모듈만 있고 함수가 없어서 있을 때만 부른다.
  webGlassNative?.observeBackGesture?.(viewTag).catch(() => undefined);
}

/** 모듈이 없으면 아무것도 구독하지 않고 빈 해제 함수를 돌려준다. */
export function addBackGestureListener(
  listener: (event: WebGlassBackGestureEvent) => void,
): () => void {
  const subscription = webGlassNative?.addListener("onBackGesture", listener);
  return () => subscription?.remove();
}

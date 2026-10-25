import type { ControlFrame, InlineControl } from "@focusmakers/types";
import {
  GLASS_CONTROLS_BUTTON_STYLE,
  NATIVE_BUTTON_TONES,
  NATIVE_CONTROL_COORDINATE_MAX,
  NATIVE_CONTROL_ICON_SIZE_MAX,
  NATIVE_CONTROL_ID_PATTERN,
  NATIVE_CONTROL_IMAGE_PATTERN,
  NATIVE_CONTROL_LABEL_MAX_LENGTH,
  NATIVE_CONTROL_MAX_COUNT,
  NATIVE_CONTROL_POSITION_MIN,
  NATIVE_CONTROL_SYSTEM_IMAGE_PATTERN,
  NATIVE_SEGMENT_MAX_OPTIONS,
  NATIVE_SEGMENT_MIN_OPTIONS,
} from "@focusmakers/types";
import { type RefCallback, useEffect, useEffectEvent, useLayoutEffect, useState } from "react";

import { postToNative } from "./bridge";
import { hasGlassChrome, registerPressHandler, supportsInlineKind } from "./glassChrome";
import { isModalOverlayOpen, subscribeModalOverlay } from "./nativeModalOverlay";
import { pageTransitionFinished, subscribePageTransition } from "./pageTransition";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type ControlSpec = DistributiveOmit<InlineControl, "frame">;

interface Entry {
  element: HTMLElement;
  spec: ControlSpec;
  measureIcon: boolean;
  iconScale: number;
}

// 등록할 때는 아직 좌표를 몰라서 범위 안의 아무 좌표를 넣고 부품 값만 본다.
const PROBE_FRAME: ControlFrame = { x: 0, y: 0, width: 0, height: 0 };

const warnedIds = new Set<string>();

/*
 * 화면에 놓인 본문 부품 전체
 *
 * 앱은 메시지 하나로 목록을 통째로 바꾸므로 부품마다 보내지 않고 모아서 한 번에 보낸다.
 */
const entries = new Map<string, Entry>();
let flushScheduled = false;
// 레이아웃이 바뀔 때마다 측정하므로 마지막으로 보낸 목록과 같으면 보내지 않는다.
let lastPosted: string | null = null;
let resendScheduled = false;
let resizeObserver: ResizeObserver | null = null;
let stopWatching: (() => void) | null = null;
let transitionFrame: number | null = null;

function clip(text: string): string {
  return text.slice(0, NATIVE_CONTROL_LABEL_MAX_LENGTH);
}

function inRange(value: number, min: number): boolean {
  return Number.isFinite(value) && value >= min && value <= NATIVE_CONTROL_COORDINATE_MAX;
}

function isSendableFrame({ x, y, width, height }: ControlFrame): boolean {
  return (
    inRange(x, NATIVE_CONTROL_POSITION_MIN) &&
    inRange(y, NATIVE_CONTROL_POSITION_MIN) &&
    inRange(width, 0) &&
    inRange(height, 0)
  );
}

// 측정한 폭이 0이면 아직 그려지지 않은 아이콘이라 앱 기본 크기로 둔다.
function fitIconSize(size: number | undefined): number | undefined {
  return size !== undefined && size > 0 ? Math.min(size, NATIVE_CONTROL_ICON_SIZE_MAX) : undefined;
}

/**
 * 버튼 안 웹 아이콘의 렌더 폭
 *
 * 앱 아이콘을 웹 아이콘과 같은 크기로 그리게 첫 svg 또는 img를 측정한다.
 * 창 폭에 따라 아이콘 크기가 바뀌어도 레이아웃이 바뀔 때마다 다시 측정한다.
 * 아이콘 등장 효과가 작게 시작해서 화면상 크기 대신 변형과 무관한 CSS 폭을 읽는다.
 */
function iconWidth(element: HTMLElement, scale: number): number | undefined {
  const icon = element.querySelector("svg, img");
  const width = icon === null ? 0 : Number.parseFloat(getComputedStyle(icon).width);
  return width > 0 ? width * scale : undefined;
}

/**
 * 버튼 모양 표시가 있어야 앱에 맡기는 부품
 *
 * 색 역할, 아이콘 크기, 회전 수, 흐림을 모르는 앱은 그 값을 버리고 기본 모양으로 그려서 그런 앱에는 웹 원본을 남긴다.
 */
function needsButtonStyle(spec: ControlSpec, measureIcon: boolean): boolean {
  return (
    measureIcon ||
    spec.faded !== undefined ||
    (spec.kind === "button" &&
      (spec.tone !== undefined || spec.iconSize !== undefined || spec.turns !== undefined))
  );
}

/**
 * 앱 파서를 통과하는 부품
 *
 * 부품 하나만 틀려도 앱이 메시지 전체를 버려서 고칠 수 있는 값은 고치고 고칠 수 없는 부품은 뺀다.
 */
function toInlineControl(spec: ControlSpec, frame: ControlFrame): InlineControl | null {
  if (
    !NATIVE_CONTROL_ID_PATTERN.test(spec.id) ||
    !isSendableFrame(frame) ||
    (spec.faded !== undefined && typeof spec.faded !== "boolean")
  ) {
    return null;
  }
  switch (spec.kind) {
    case "segment": {
      const labels = spec.labels.map(clip);
      if (
        labels.length < NATIVE_SEGMENT_MIN_OPTIONS ||
        labels.length > NATIVE_SEGMENT_MAX_OPTIONS ||
        labels.includes("") ||
        spec.disabled.length !== labels.length
      ) {
        return null;
      }
      return {
        ...spec,
        frame,
        labels,
        selected: spec.selected >= 0 && spec.selected < labels.length ? spec.selected : -1,
        accessibilityLabel: spec.accessibilityLabel ? clip(spec.accessibilityLabel) : null,
      };
    }
    case "switch":
      return spec.accessibilityLabel
        ? { ...spec, frame, accessibilityLabel: clip(spec.accessibilityLabel) }
        : null;
    case "button":
      return spec.accessibilityLabel &&
        (spec.systemImage === null || NATIVE_CONTROL_SYSTEM_IMAGE_PATTERN.test(spec.systemImage)) &&
        (spec.image == null || NATIVE_CONTROL_IMAGE_PATTERN.test(spec.image)) &&
        (spec.turns === undefined || (Number.isInteger(spec.turns) && spec.turns >= 0)) &&
        (spec.tone === undefined || NATIVE_BUTTON_TONES.includes(spec.tone))
        ? {
            ...spec,
            frame,
            title: spec.title ? clip(spec.title) : null,
            accessibilityLabel: clip(spec.accessibilityLabel),
            iconSize: fitIconSize(spec.iconSize),
          }
        : null;
  }
}

function flush(): void {
  flushScheduled = false;
  const controls: InlineControl[] = [];
  for (const { element, spec, measureIcon, iconScale } of entries.values()) {
    const rect = element.getBoundingClientRect();
    // 자신이나 조상이 display: none이면 크기가 0이라 함께 빠진다.
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }
    const measured =
      measureIcon && spec.kind === "button"
        ? { ...spec, iconSize: iconWidth(element, iconScale) }
        : spec;
    const control = toInlineControl(measured, {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    });
    if (control !== null) {
      controls.push(control);
    }
  }
  const hidden = isModalOverlayOpen() || pageTransitionFinished() !== null;
  // 세션처럼 시스템 테마와 무관하게 `theme-dark`로 고정한 화면은 앱 부품 층도 다크로 그린다.
  const colorScheme = [...entries.values()].some(
    ({ element }) => element.closest(".theme-dark") !== null,
  )
    ? "dark"
    : undefined;
  const payload = JSON.stringify({ controls, hidden, colorScheme });
  if (payload === lastPosted && !resendScheduled) {
    return;
  }
  lastPosted = payload;
  resendScheduled = false;
  postToNative({ type: "set-inline-controls", controls, hidden, colorScheme, atMs: Date.now() });
}

// 한 프레임에 여러 부품이 바뀌어도 측정과 전송은 한 번만 한다.
function scheduleFlush(): void {
  if (flushScheduled) {
    return;
  }
  flushScheduled = true;
  requestAnimationFrame(flush);
}

// 앱 부품이 웹 값과 어긋났거나 앱이 부품을 비운 뒤라서 같은 목록이어도 다시 보낸다.
function scheduleResend(): void {
  resendScheduled = true;
  scheduleFlush();
}

// 문서 단위로 이동했다 돌아오면 bfcache에서 되살아나는데, 그 사이 앱은 부품을 비웠고 effect는 다시 돌지 않는다.
function flushOnRestore(event: PageTransitionEvent): void {
  if (event.persisted) {
    scheduleResend();
  }
}

/**
 * 문서 어딘가에서 도는 CSS 전환 여부
 *
 * 끝없이 도는 키프레임 애니메이션까지 세면 매 프레임 측정이 멈추지 않아서 전환만 센다.
 * `getAnimations`가 없는 브라우저는 전환이 끝날 때 한 번 더 재는 것으로 만족한다.
 */
function transitionRunning(): boolean {
  if (typeof document.getAnimations !== "function" || typeof CSSTransition === "undefined") {
    return false;
  }
  return document
    .getAnimations()
    .some((animation) => animation instanceof CSSTransition && animation.playState === "running");
}

function followTransition(): void {
  transitionFrame = null;
  flush();
  if (transitionRunning()) {
    transitionFrame = requestAnimationFrame(followTransition);
  }
}

/**
 * CSS 전환을 따라가는 측정
 *
 * transform 이동은 크기도 DOM도 바꾸지 않아 다른 관찰로는 다시 재지 못하고, 앱 부품이 이동 전 자리에 남는다.
 * 전환이 도는 동안 매 프레임 재고, 같은 목록은 보내지 않는 비교가 멈춰 있는 프레임을 거른다.
 */
function startFollowing(): void {
  if (transitionFrame === null) {
    transitionFrame = requestAnimationFrame(followTransition);
  }
}

function startWatching(): void {
  const observer = new ResizeObserver(scheduleFlush);
  // 위쪽 내용이 늘어 부품이 밀려나도 부품 자신의 크기는 그대로라 문서 높이 변화도 본다.
  observer.observe(document.documentElement);
  // 짧은 화면에서는 위쪽 요소가 빠져 부품이 올라가도 문서 높이가 그대로라 요소가 붙고 빠지는 것도 본다.
  const mutations = new MutationObserver(scheduleFlush);
  mutations.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleFlush);
  window.addEventListener("pageshow", flushOnRestore);
  document.addEventListener("transitionrun", startFollowing, true);
  document.addEventListener("transitionstart", startFollowing, true);
  document.addEventListener("transitionend", scheduleFlush, true);
  document.addEventListener("transitioncancel", scheduleFlush, true);
  const unsubscribes = [
    subscribeModalOverlay(scheduleFlush),
    subscribePageTransition(scheduleFlush),
  ];
  resizeObserver = observer;
  stopWatching = () => {
    observer.disconnect();
    mutations.disconnect();
    window.removeEventListener("resize", scheduleFlush);
    window.removeEventListener("pageshow", flushOnRestore);
    document.removeEventListener("transitionrun", startFollowing, true);
    document.removeEventListener("transitionstart", startFollowing, true);
    document.removeEventListener("transitionend", scheduleFlush, true);
    document.removeEventListener("transitioncancel", scheduleFlush, true);
    if (transitionFrame !== null) {
      cancelAnimationFrame(transitionFrame);
      transitionFrame = null;
    }
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}

function stop(): void {
  stopWatching?.();
  stopWatching = null;
  resizeObserver = null;
}

/**
 * 앱이 받는 개수 안에서만 하는 등록
 *
 * 개수를 보낼 때가 아니라 등록할 때 정해야 넘친 부품을 숨기지 않고 웹으로 남길 수 있다.
 * 같은 id를 다시 등록하면 자리만 바뀌어 개수가 늘지 않는다.
 */
function register(id: string, entry: Entry): boolean {
  if (entries.size >= NATIVE_CONTROL_MAX_COUNT && !entries.has(id)) {
    return false;
  }
  if (entries.size === 0) {
    startWatching();
  }
  entries.set(id, entry);
  resizeObserver?.observe(entry.element);
  scheduleFlush();
  return true;
}

function unregister(id: string, entry: Entry): void {
  resizeObserver?.unobserve(entry.element);
  // 화면 전환 중에는 새 화면이 같은 id를 먼저 등록할 수 있어서 자기 등록일 때만 뺀다.
  if (entries.get(id) === entry) {
    entries.delete(id);
  }
  if (entries.size === 0) {
    stop();
  }
  scheduleFlush();
}

/**
 * 웹 원본 숨김
 *
 * 자리는 남겨야 앱이 같은 좌표에 부품을 놓을 수 있어서 `display` 대신 `visibility`를 쓴다.
 * 스크린리더에서도 빼서 앱 부품만 읽히게 한다.
 */
function hide(element: HTMLElement): () => void {
  const { visibility } = element.style;
  const ariaHidden = element.getAttribute("aria-hidden");
  element.style.visibility = "hidden";
  element.setAttribute("aria-hidden", "true");
  return () => {
    element.style.visibility = visibility;
    if (ariaHidden === null) {
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("aria-hidden", ariaHidden);
    }
  };
}

function ignoreElement(): void {}

/**
 * 본문 컨트롤을 앱의 네이티브 부품으로 바꾸는 등록
 *
 * `glassChrome=1`인 앱에서만 등록하고 그 밖에서는 아무것도 하지 않아 웹 모양이 유지된다.
 * 등록하면 웹 원본은 자리만 남기고 숨기며 앱이 그 문서 좌표에 부품을 놓는다.
 * `spec`이 `null`이거나 앱이 받을 수 없는 값이면 등록하지 않고 `native`도 거짓이다.
 * 앱이 `glassControls`로 알리지 않은 종류도 등록하지 않고 웹으로 그린다.
 * 색 역할, 아이콘 크기, 회전 수, 흐림을 쓰는 부품은 앱이 `button-style`을 알렸을 때만 등록한다.
 * `measureIcon`이면 버튼 안 첫 svg 또는 img의 렌더 폭을 `iconSize`로 보낸다.
 * SF Symbol이 같은 크기의 웹 아이콘보다 커 보이는 버튼은 `iconScale`로 그 폭을 줄여 보낸다.
 * 앱이 받는 개수를 넘어 등록되지 못한 부품도 `native`가 거짓이고 웹으로 그린다.
 */
export function useNativeControl<T extends HTMLElement>(
  spec: ControlSpec | null,
  onPress: (value: number) => void,
  { measureIcon = false, iconScale = 1 }: { measureIcon?: boolean; iconScale?: number } = {},
): { ref: RefCallback<T>; native: boolean } {
  // 앱이 받을 수 없는 부품은 숨기면 아무것도 그려지지 않으므로 웹 원본을 그대로 둔다.
  const sendable = spec !== null && toInlineControl(spec, PROBE_FRAME) !== null;
  const wanted =
    hasGlassChrome() &&
    sendable &&
    supportsInlineKind(spec.kind) &&
    (!needsButtonStyle(spec, measureIcon) || supportsInlineKind(GLASS_CONTROLS_BUTTON_STYLE));
  const invalidId = hasGlassChrome() && spec !== null && !sendable ? spec.id : null;
  const [element, setElement] = useState<T | null>(null);
  const [overflow, setOverflow] = useState(false);
  const [pressCount, setPressCount] = useState(0);
  // spec 객체와 처리기는 렌더마다 새로 만들어지므로 보낼 값만 문자열로 비교해 바뀔 때만 다시 등록한다.
  const specKey = wanted ? JSON.stringify(spec) : null;
  const press = useEffectEvent(onPress);

  // 페인트 전에 숨겨 웹 원본과 앱 부품이 한 프레임 겹쳐 보이지 않게 한다.
  useLayoutEffect(() => {
    if (specKey === null || element === null) {
      return;
    }
    const entry: Entry = {
      element,
      spec: JSON.parse(specKey) as ControlSpec,
      measureIcon,
      iconScale,
    };
    const { id } = entry.spec;
    const accepted = register(id, entry);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 받아들여졌는지는 effect에서 모듈 목록에 넣어 봐야 안다
    setOverflow(!accepted);
    if (!accepted) {
      return;
    }
    const restore = hide(element);
    const unregisterPress = registerPressHandler(id, (value) => {
      press(value);
      setPressCount((count) => count + 1);
    });
    return () => {
      unregisterPress();
      unregister(id, entry);
      restore();
    };
  }, [specKey, element, measureIcon, iconScale]);

  // 앱 부품은 누르는 즉시 제 모양을 바꾼다.
  // 웹이 값을 받지 않으면 spec이 그대로라 다시 보내지 않으므로, 누름이 반영된 렌더 뒤에 웹 값을 한 번 더 보낸다.
  useLayoutEffect(() => {
    if (pressCount > 0) {
      scheduleResend();
    }
  }, [pressCount]);

  useEffect(() => {
    if (import.meta.env.DEV && invalidId !== null && !warnedIds.has(invalidId)) {
      warnedIds.add(invalidId);
      console.warn("[native-controls] 앱이 받을 수 없는 부품이라 웹으로 그린다", invalidId);
    }
  }, [invalidId]);

  // 웹에서는 요소를 상태에 담지 않아 마운트할 때 렌더가 한 번 더 일어나지 않는다.
  return { ref: wanted ? setElement : ignoreElement, native: wanted && !overflow };
}

/** 테스트마다 등록과 구독을 비운다. */
export function __resetNativeControlsForTests(): void {
  entries.clear();
  warnedIds.clear();
  stop();
  flushScheduled = false;
  lastPosted = null;
  resendScheduled = false;
}

import type { MouseEvent } from "react";

import { detectStorePlatform } from "@/features/social-room/storeLink";

/** 키보드 위로 올린 입력 줄과 입력 보조 막대 사이에 남길 간격(px) */
const REVEAL_MARGIN_PX = 8;

/** iPhone과 iPad의 웹뷰나 브라우저인가 */
export function isIosWeb(): boolean {
  return (
    typeof navigator !== "undefined" &&
    detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios"
  );
}

/**
 * iOS에서 입력칸을 누를 때 문서를 움직이지 않고 포커스를 준다
 *
 * WebKit은 누름으로 생긴 포커스마다 키보드를 올리며 문서를 입력칸 쪽으로 끌어 올리고, preventScroll은 스크립트가 준 포커스에만 먹는다.
 * 누름이 주는 포커스를 막고 같은 누름 안에서 preventScroll로 포커스를 주면 키보드는 뜨고 문서는 그대로다.
 * 스크롤한 터치에는 mousedown이 오지 않아서 목록을 밀다가 포커스가 생기지 않는다.
 * 이미 포커스가 있는 입력칸의 누름은 커서 옮기기라 그대로 둔다.
 */
export function focusWithoutScrollOnPress(
  event: MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
): void {
  const target = event.currentTarget;
  if (document.activeElement === target) return;
  event.preventDefault();
  target.focus({ preventScroll: true });
}

/**
 * 키보드에 가린 입력 줄을 키보드 위로 올린다
 *
 * 문서가 움직이지 않게 포커스를 주면 WebKit이 가려진 입력칸도 올려 주지 않아서 직접 올린다.
 * 가까운 스크롤 목록만 스크롤해서 고정된 머리 줄은 제자리에 둔다.
 * 목록이 없거나 키보드가 없으면 아무것도 하지 않는다.
 */
export function revealAboveKeyboard(target: HTMLElement, keyboardInset: number): void {
  if (keyboardInset <= 0) return;
  const visibleBottom = window.innerHeight - keyboardInset;
  const overflow = target.getBoundingClientRect().bottom + REVEAL_MARGIN_PX - visibleBottom;
  if (overflow <= 0) return;
  const list = target.closest<HTMLElement>("[data-scroll-list]");
  if (list !== null) list.scrollTop += overflow;
}

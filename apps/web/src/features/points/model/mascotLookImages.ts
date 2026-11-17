import { useSyncExternalStore } from "react";

import { MASCOT_EXPRESSION_SRC } from "@/components/mascot/mascotExpressions";
import type { MascotLook } from "@/components/mascot/types";

/**
 * 결과 화면이 이 모습을 그릴 때 받는 그림
 *
 * 마스코트의 표정 그림과 소품의 앞·뒤·효과 그림, 효과 조각의 띠 그림이다.
 * 표정 그림은 앱에 든 그림이지만 화면이 그 마스코트를 처음 그릴 때 받아서 함께 넣는다.
 */
export function mascotLookImageUrls(look: MascotLook): string[] {
  const urls = new Set<string>(Object.values(MASCOT_EXPRESSION_SRC[look.id]));
  for (const accessory of look.accessories) {
    for (const url of [accessory.imageUrl, accessory.backImageUrl, accessory.effectImageUrl]) {
      if (url) urls.add(url);
    }
    for (const piece of accessory.effectPieces ?? []) {
      if (piece.sprite) urls.add(piece.sprite.url);
    }
  }
  return [...urls];
}

// 받기와 디코드가 끝난 그림이다. 실패한 그림도 더 기다릴 것이 없어 끝난 것으로 둔다.
const settled = new Set<string>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 그림을 미리 받아 디코드하기
 *
 * 화면에 붙이기 전에 받아 두어, 결과 화면이 그릴 때 소품이 몸보다 늦게 붙지 않게 한다.
 * 같은 주소는 한 번만 받는다.
 * 그림 객체는 붙들지 않아 디코드한 비트맵은 브라우저가 필요할 때 내려놓고, 받은 파일은 HTTP 캐시에 남는다.
 * 실패해도 거부하지 않는다.
 */
export function preloadImages(urls: readonly string[]): Promise<void> {
  return Promise.all(urls.map(preloadImage)).then(() => undefined);
}

/** 이 그림들을 모두 받아 디코드했는지 */
export function imagesPreloaded(urls: readonly string[]): boolean {
  return urls.every((url) => settled.has(url));
}

/**
 * 이 그림들을 모두 받아 디코드했는지 지켜보기
 *
 * 받은 그림 기록은 화면 밖의 값이라 렌더 중에 그냥 읽으면 리액트 컴파일러가 처음 값을 기억해 버린다.
 * 그래서 기록이 바뀔 때마다 다시 읽도록 구독한다.
 */
export function useImagesPreloaded(urls: readonly string[]): boolean {
  return useSyncExternalStore(
    subscribe,
    () => imagesPreloaded(urls),
    () => false,
  );
}

function preloadImage(url: string): Promise<void> {
  if (settled.has(url)) {
    return Promise.resolve();
  }
  const inFlight = pending.get(url);
  if (inFlight !== undefined) {
    return inFlight;
  }
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  const done = decode(image)
    .catch(() => undefined)
    .then(() => {
      settled.add(url);
      pending.delete(url);
      for (const listener of listeners) listener();
    });
  pending.set(url, done);
  return done;
}

/** `decode()`가 없는 엔진은 다 받은 때를 디코드가 끝난 때로 본다. */
function decode(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === "function") {
    return image.decode();
  }
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("image load failed"));
  });
}

/** 테스트마다 받은 그림 기록을 비운다. */
export function __resetMascotLookImagesForTests(): void {
  settled.clear();
  pending.clear();
}

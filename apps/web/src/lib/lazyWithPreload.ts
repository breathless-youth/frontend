import { createElement, useEffect, useEffectEvent, useState } from "react";
import type { ComponentType } from "react";

import { reportHandled } from "@/lib/sentry";

/**
 * 시트 나눠 받기
 *
 * 시트 코드를 따로 받고, 처음 열 때 받거나 호출부가 한가한 때 `preload()`로 미리 받는다.
 * `React.lazy`를 쓰지 않는 이유는 거부된 결과를 기억해 다시 받지 못하기 때문이다. Suspense와 오류 경계도 쓰지 않는다.
 * 받기에 실패하면 화면 전체 오류로 올리지 않고 시트만 그리지 않으며, 다음에 열 때 새로 받는다.
 * 받은 컴포넌트는 state에 담아 그린다. 렌더 결과가 모듈 변수에 기대면 메모된 결과가 받은 뒤에도 바뀌지 않을 수 있다.
 */
export function lazyWithPreload<
  P extends { open: boolean; onOpenChange?: (open: boolean) => void },
>(load: () => Promise<ComponentType<P>>, options: { onLoadError?: (props: P) => void } = {}) {
  // 호출부의 열림 상태가 true로 남으면 다시 눌러도 바뀌는 것이 없어 받기를 다시 시도하지 못한다.
  const onLoadError = options.onLoadError ?? ((props: P) => props.onOpenChange?.(false));
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;

  function ensureLoaded(): Promise<ComponentType<P>> {
    pending ??= load().then(
      (component) => {
        loaded = component;
        return component;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  }

  function LazySheet(props: P) {
    const [Component, setComponent] = useState<ComponentType<P> | null>(() => loaded);
    const { open } = props;
    // 실패를 알릴 때는 받기를 시작한 때가 아니라 실패한 때의 props를 넘긴다.
    const notifyLoadError = useEffectEvent(() => onLoadError(props));

    useEffect(() => {
      if (!open || Component !== null) {
        return;
      }
      ensureLoaded().then(
        (component) => setComponent(() => component),
        (error: unknown) => {
          reportHandled(error, "lazy_sheet_load");
          notifyLoadError();
        },
      );
    }, [open, Component]);

    return Component === null ? null : createElement(Component, props);
  }

  /** 미리 받기는 최적화일 뿐이라 실패를 삼킨다. 열 때 다시 받는다. */
  function preload(): Promise<void> {
    return ensureLoaded().then(
      () => undefined,
      () => undefined,
    );
  }

  return { LazySheet, preload };
}

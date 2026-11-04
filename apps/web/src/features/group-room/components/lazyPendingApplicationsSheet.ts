import { lazyWithPreload } from "@/lib/lazyWithPreload";

/**
 * 신청 중인 공개 그룹 시트를 따로 받는 묶음
 *
 * 시트 부품(Base UI)이 그룹 탭의 첫 묶음에 들어가지 않게 시트를 처음 열 때나 `preload()`로 받는다.
 */
export const { LazySheet: LazyPendingApplicationsSheet, preload: preloadPendingApplicationsSheet } =
  lazyWithPreload(() =>
    import("./PendingApplicationsSheet").then((module) => module.PendingApplicationsSheet),
  );

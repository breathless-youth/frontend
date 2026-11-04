import { lazyWithPreload } from "@/lib/lazyWithPreload";

import type { RoomTimerSheetProps } from "./RoomTimerSheet";

/**
 * 공부방 타이머 시트를 따로 받는 묶음
 *
 * 시트 부품(Base UI)이 공부방의 첫 묶음에 들어가지 않게 시트를 처음 열 때나 `preload()`로 받는다.
 * 받지 못하면 연 모드를 끄고 시트 열림을 거둬서 다음에 누를 때 다시 받는다.
 */
export const { LazySheet: LazyRoomTimerSheet, preload: preloadRoomTimerSheet } =
  lazyWithPreload<RoomTimerSheetProps>(
    () => import("./RoomTimerSheet").then((module) => module.RoomTimerSheet),
    {
      onLoadError: (props) => {
        props.timer.close();
        props.onClose();
      },
    },
  );

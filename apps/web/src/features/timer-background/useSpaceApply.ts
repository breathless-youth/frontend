import { useEffect, useEffectEvent, useRef } from "react";

import { putTimerBackground } from "@/lib/pointsApi";
import { queryClient } from "@/lib/queryClient";

import { fetchAppliedSpace, isMemberUser } from "./spaceCatalogQuery";
import type { Viewport } from "./spaceFiles";
import {
  readTimerBackground,
  resolveSpace,
  type SpaceSelection,
  type TimerBackgroundSelection,
  writeTimerBackground,
} from "./timerBackground";
import { timerBackgroundPhotoQuery } from "./timerBackgroundQueries";
import { clearWatcherAssets, saveWatcherAssets, watcherAssetUrls } from "./watcher/watcherAssets";

/**
 * 고른 공간을 기기에 저장하기
 *
 * 저장소가 막히면 false다.
 * 감시 파일은 viewport 크기에 맞는 것을 받고, 없으면 지금 창 크기로 고른다.
 * 감시 파일을 기기에 받아 두면 첫 등장이 늦지 않다.
 * 받지 않아도 네트워크로 재생돼 기다리지 않는다.
 */
export function commitTimerBackground(
  next: TimerBackgroundSelection,
  viewport: Viewport = { width: innerWidth, height: innerHeight },
): boolean {
  if (!writeTimerBackground(next)) return false;
  if (next.kind === "space" && next.videoMode === "WATCH") {
    void saveWatcherAssets(next.assetKey, watcherAssetUrls(next.assetKey, viewport));
  } else {
    void clearWatcherAssets();
  }
  return true;
}

/**
 * 공간 고르기와 서버 맞추기
 *
 * 세션 화면과 PC 홈 공간 창이 같은 규칙으로 고른 공간을 저장한다.
 * 화면과 기기 값을 바로 바꾸고, 회원이면 서버에도 고른 차례대로 저장한다.
 * 서버 저장이 실패하면 화면이 아직 그 공간일 때만 이전 공간으로 되돌린다.
 * 회원이면 서버에 적용해 둔 공간을 한 번 받아 맞추고, 그 전에 사용자가 골랐으면 맞추지 않는다.
 * commit은 기기에 저장하고 화면을 바꾸며, 저장소가 막히면 false를 돌려준다.
 */
export function useSpaceApply(
  userId: number | null,
  current: TimerBackgroundSelection,
  commit: (next: TimerBackgroundSelection) => boolean,
) {
  // 사용자가 고른 뒤에는 늦게 온 서버 값으로 덮지 않는다.
  const userPickedRef = useRef(false);
  // 앞서 고른 공간의 저장 실패가 뒤에 고른 공간을 되돌리지 않게 고를 때마다 올린다.
  const pickSeqRef = useRef(0);
  // 늦게 끝난 앞 저장이 서버를 옛 공간으로 되돌리지 않게 저장을 고른 차례대로 보낸다.
  const putQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  async function applySpace(
    next: TimerBackgroundSelection,
    options?: { localOnly?: boolean },
  ): Promise<boolean> {
    const previous = current;
    if (!commit(next)) {
      return false;
    }
    userPickedRef.current = true;
    if (options?.localOnly || !(await isMemberUser(userId))) {
      return true;
    }
    const pick = ++pickSeqRef.current;
    const saving = putQueueRef.current.then(async () => {
      // 차례가 오기 전에 더 새로 고른 공간이 있으면 그 저장이 대신해 보내지 않는다.
      if (pick !== pickSeqRef.current) {
        return;
      }
      // 사진은 이 기기에만 있어 서버에는 기본 배경으로 저장한다.
      await putTimerBackground(next.kind === "space" ? next.itemId : null);
    });
    putQueueRef.current = saving.catch(() => undefined);
    try {
      await saving;
      return true;
    } catch {
      // 그 사이 기기에서만 바꾼 선택이 있으면 그 선택이 더 새로워 되돌리지 않는다.
      if (
        pick === pickSeqRef.current &&
        JSON.stringify(readTimerBackground()) === JSON.stringify(next)
      ) {
        commit(previous);
      }
      return false;
    }
  }

  const syncSpace = useEffectEvent((server: SpaceSelection | null, photoExists: boolean) => {
    const local = readTimerBackground();
    const next = resolveSpace(local, server, photoExists);
    if (userPickedRef.current || JSON.stringify(next) === JSON.stringify(local)) {
      return;
    }
    commit(next);
  });
  // 다른 기기에서 고른 공간을 서버에서 받아 한 번 맞춘다.
  // 사용자가 고른 것이 아니라 적용 이벤트를 보내지 않는다.
  useEffect(() => {
    let cancelled = false;
    void fetchAppliedSpace(userId).then(async (server) => {
      if (server === undefined) {
        return;
      }
      const local = readTimerBackground();
      // 사진을 읽지 못하면 있는지 몰라 이번에는 맞추지 않는다.
      // null로 답할 때만 지워진 사진이다.
      const photoExists =
        local.kind === "photo" &&
        (await queryClient.fetchQuery(timerBackgroundPhotoQuery(local.photoId)).then(
          (view) => view !== null,
          () => undefined,
        ));
      if (!cancelled && photoExists !== undefined) {
        syncSpace(server, photoExists);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return applySpace;
}

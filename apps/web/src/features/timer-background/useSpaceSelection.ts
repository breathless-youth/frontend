import { useEffect, useEffectEvent, useRef, useState } from "react";

import { putTimerBackground } from "@/lib/pointsApi";
import { queryClient } from "@/lib/queryClient";

import { fetchAppliedSpace, isMemberUser } from "./spaceCatalogQuery";
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
 * 고른 공간(타이머 배경)과 바꾸기
 *
 * 세션 화면과 설정의 타이머 배경 화면이 같이 쓴다.
 * 처음 한 번 기기 값을 읽고 이후에는 이 값이 원본이다.
 * 회원이면 다른 기기에서 고른 공간을 서버에서 받아 한 번 맞추고, 고를 때마다 고른 순서대로 서버에 저장한다.
 * 저장이 실패하면 앞 공간으로 되돌린다.
 */
export function useSpaceSelection(
  userId: number | null,
  {
    onCommit,
  }: {
    /** 기기 값을 바꾼 직후 부른다. 세션 화면은 여기서 그리기 실패 표시를 푼다. */
    onCommit?: (next: TimerBackgroundSelection) => void;
  } = {},
) {
  const [space, setSpace] = useState(readTimerBackground);
  // 사용자가 이 화면에서 고른 뒤에는 늦게 온 서버 값으로 덮지 않는다.
  const userPickedRef = useRef(false);
  // 앞서 고른 공간의 저장 실패가 뒤에 고른 공간을 되돌리지 않게 고를 때마다 올린다.
  const pickSeqRef = useRef(0);
  // 늦게 끝난 앞 저장이 서버를 옛 공간으로 되돌리지 않게 저장을 고른 차례대로 보낸다.
  const putQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  function commitSpace(next: TimerBackgroundSelection): boolean {
    if (!writeTimerBackground(next)) {
      return false;
    }
    setSpace(next);
    onCommit?.(next);
    // 감독 파일을 기기에 받아 두면 첫 등장이 늦지 않다. 받지 않아도 네트워크로 재생돼 기다리지 않는다.
    if (next.kind === "space" && next.videoMode === "WATCH") {
      const viewport = { width: innerWidth, height: innerHeight };
      void saveWatcherAssets(next.assetKey, watcherAssetUrls(next.assetKey, viewport));
    } else {
      void clearWatcherAssets();
    }
    return true;
  }

  async function applySpace(
    next: TimerBackgroundSelection,
    options?: { localOnly?: boolean },
  ): Promise<boolean> {
    const previous = space;
    if (!commitSpace(next)) {
      return false;
    }
    userPickedRef.current = true;
    // 기기에만 남기는 선택(고른 사진을 지워 심플로 돌림)은 차례를 올리지 않는다.
    // 앞서 보낸 사진 선택의 저장(서버에는 기본 배경)이 그대로 서버에 남아야 해서다.
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
        commitSpace(previous);
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
    commitSpace(next);
  });
  // 사용자가 고른 것이 아니라 적용 이벤트를 보내지 않는다.
  useEffect(() => {
    let cancelled = false;
    void fetchAppliedSpace(userId).then(async (server) => {
      if (server === undefined) {
        return;
      }
      const local = readTimerBackground();
      // 사진을 읽지 못하면 있는지 몰라 이번에는 맞추지 않는다. null로 답할 때만 지워진 사진이다.
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

  return { space, applySpace };
}

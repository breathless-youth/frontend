import { useEffect, useEffectEvent, useRef } from "react";

import { postToNative } from "@/lib/bridge";
import { hasLiveActivity } from "@/lib/liveActivityCapability";

import { type LiveActivityInput, toLiveActivitySnapshot } from "./liveActivitySnapshot";

/**
 * 싱글룸 세션 상태를 잠금화면 공부 표시로 보내기
 *
 * 시간은 OS가 세므로 매초 보내지 않고 상태가 바뀔 때만 그 순간의 시간을 함께 보낸다.
 * 화면을 떠날 때도 끝내라고 보낸다.
 * 앱도 세션 화면이 닫히면 끝내므로 둘 중 하나만 닿아도 된다.
 */
export function useLiveActivityBridge(input: LiveActivityInput): void {
  const snapshot = toLiveActivitySnapshot(input);
  const key =
    snapshot === null ? null : JSON.stringify([snapshot.mode, snapshot.subject, snapshot.state]);
  // 앱에 표시를 시작하라고 보낸 뒤 아직 끝내라고 보내지 않았는지
  const showing = useRef(false);

  const send = useEffectEvent(() => {
    if (snapshot === null && !showing.current) {
      return;
    }
    postToNative({ type: "live-activity", session: snapshot, atMs: Date.now() });
    showing.current = snapshot !== null;
  });

  useEffect(() => {
    if (hasLiveActivity()) {
      send();
    }
  }, [key]);

  useEffect(
    () => () => {
      if (!showing.current) {
        return;
      }
      postToNative({ type: "live-activity", session: null, atMs: Date.now() });
      showing.current = false;
    },
    [],
  );
}

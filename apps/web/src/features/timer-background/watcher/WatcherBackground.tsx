import { useEffect, useEffectEvent, useRef, useState } from "react";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

import {
  canLeaveMidClip,
  nextWatcherClip,
  WATCHER_ASSET_DIR,
  type WatcherClip,
  watcherClipUrl,
} from "./watcherClips";
import { readWatcherAsset, watcherAssetUrls } from "./watcherAssets";

type Slot = 0 | 1;

/** 지금 화면을 맡은 영상 요소와 그 클립. clip이 null이면 빈 방이다. */
type Head = { slot: Slot; clip: WatcherClip | null };

const other = (slot: Slot): Slot => (slot === 0 ? 1 : 0);

/** 화면을 넘긴 뒤 나간 영상 요소에 다음 클립을 받기까지 기다리는 시간. 넘긴 화면이 그려지기 전에 바꾸면 한 프레임 빈다. */
const SWAP_SETTLE_MS = 100;

/** 재생이 막히면 이 간격으로 그 자리에서 다시 재생한다. */
const RETRY_MS = 1_000;
/** 이만큼 다시 시도해도 막히면 빈 방으로 돌아가 다음 등장 때 다시 재생한다. */
const MAX_RETRIES = 3;

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * 감시자 영상 배경
 *
 * 평소엔 빈 방 사진을 보이고, `present`가 켜지면 감시자가 들어와 서 있다가 꺼지면 나간다.
 * 영상 요소 두 개를 번갈아 써서, 쉬는 요소에 다음 클립을 미리 받아 두고 앞 클립이 끝나면 그 요소를 재생한다.
 * 새 요소가 실제로 재생되기 전까지는 앞 요소의 마지막 프레임을 그대로 보여 줘서 이음매에 빈 화면이 끼지 않는다.
 * 클립은 끝까지 재생하고 끝나는 순간의 `present`로만 다음을 고른다(`nextWatcherClip`).
 * 다만 가만히 서 있는 클립(`canLeaveMidClip`) 중에 나가야 하면 기다리지 않고 바로 퇴장으로 넘어간다.
 */
export function WatcherBackground({
  present,
  className,
  onClipStart,
  onClipPlaying,
}: {
  present: boolean;
  className?: string;
  /** 클립을 틀기 시작할 때와 빈 방으로 돌아갈 때(null) 부른다. */
  onClipStart?: (clip: WatcherClip | null) => void;
  /** 클립이 실제로 재생되기 시작할 때 영상이 지나간 시간과 함께 부른다. 발소리를 발걸음에 맞추는 데 쓴다. */
  onClipPlaying?: (clip: WatcherClip, currentTimeSec: number) => void;
}) {
  const videos = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);
  const head = useRef<Head>({ slot: 1, clip: null });
  const retries = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const presentRef = useRef(present);
  const [visible, setVisible] = useState<Slot | null>(null);
  const local = useStoredWatcherAssets();
  // 적용할 때 받아 둔 파일이 있으면 그것을, 없으면 네트워크 주소를 쓴다.
  const resolve = (url: string) => local.get(url) ?? url;

  // 쉬는 요소에 다음에 이어질 클립을 받아 둔다. 다음이 없으면 다시 들어올 때를 위해 enter를 받아 둔다.
  // 아직 화면에 보이는 요소(넘기는 중인 앞 클립)는 건드리지 않는다.
  function preloadNext() {
    const { slot, clip } = head.current;
    const target = other(slot);
    if (target === visible) return;
    const upcoming = (clip && nextWatcherClip(clip, presentRef.current)) ?? "enter";
    const video = videos.current[target];
    const url = resolve(watcherClipUrl(upcoming, viewport()));
    if (video && !video.src.endsWith(url)) video.src = url;
  }

  function start(slot: Slot, clip: WatcherClip) {
    window.clearTimeout(retryTimer.current);
    retryTimer.current = undefined;
    retries.current = 0;
    head.current = { slot, clip };
    onClipStart?.(clip);
    const video = videos.current[slot];
    if (!video) return;
    const url = resolve(watcherClipUrl(clip, viewport()));
    if (!video.src.endsWith(url)) video.src = url;
    video.currentTime = 0;
    // 소리 없는 인라인 영상이지만 저전력 모드나 소재를 못 받은 오프라인에서는 막힐 수 있다.
    video.play().catch(() => recover(slot, clip));
  }

  // 재생이 막힌 클립을 그 자리에서 다시 재생한다. 끝내 막히면 지금 클립을 놓아야 다음 등장이 다시 시작된다.
  function recover(slot: Slot, clip: WatcherClip) {
    const current = head.current;
    if (current.slot !== slot || current.clip !== clip || retryTimer.current !== undefined) return;
    if (retries.current >= MAX_RETRIES) {
      head.current = { slot, clip: null };
      setVisible(null);
      onClipStart?.(null);
      return;
    }
    retries.current += 1;
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = undefined;
      const video = videos.current[slot];
      if (!video || head.current.slot !== slot || head.current.clip !== clip) return;
      // 파일을 못 읽은 오류는 다시 불러와야 하고, 불러와도 막힌 자리부터 잇는다.
      if (video.error) {
        const at = video.currentTime;
        video.load();
        video.currentTime = at;
      }
      video.play().catch(() => recover(slot, clip));
    }, RETRY_MS);
  }

  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  function handleEnded(slot: Slot) {
    const { slot: current, clip } = head.current;
    if (slot !== current || !clip) return;
    const next = nextWatcherClip(clip, presentRef.current);
    if (next) {
      start(other(slot), next);
      return;
    }
    head.current = { slot, clip: null };
    setVisible(null);
    onClipStart?.(null);
  }

  function handlePlaying(slot: Slot) {
    const { slot: current, clip } = head.current;
    if (slot !== current) return;
    setVisible(slot);
    if (clip) onClipPlaying?.(clip, videos.current[slot]?.currentTime ?? 0);
  }

  const preloadAfterSwap = useEffectEvent(preloadNext);
  useEffect(() => {
    const timer = setTimeout(preloadAfterSwap, SWAP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const followPresence = useEffectEvent(() => {
    presentRef.current = present;
    const { slot, clip } = head.current;
    if (present && !clip) {
      start(other(slot), "enter");
    } else if (!present && clip && canLeaveMidClip(clip)) {
      start(other(slot), "exit");
    } else {
      preloadNext();
    }
  });
  useEffect(() => {
    followPresence();
  }, [present]);

  return (
    <div
      aria-hidden="true"
      data-testid="watcher-background"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-black", className)}
    >
      {/* 빈 방. enter 첫 프레임이라 화면 크기·방향마다 영상과 같은 그림을 고른다. */}
      <picture>
        <source
          media="(orientation: landscape) and (min-height: 600px)"
          srcSet={resolve(`${WATCHER_ASSET_DIR}/poster/tablet_landscape.jpg`)}
        />
        <source
          media="(orientation: portrait) and (min-width: 600px)"
          srcSet={resolve(`${WATCHER_ASSET_DIR}/poster/tablet_portrait.jpg`)}
        />
        <source
          media="(orientation: landscape)"
          srcSet={resolve(`${WATCHER_ASSET_DIR}/poster/phone_landscape.jpg`)}
        />
        <img
          src={resolve(`${WATCHER_ASSET_DIR}/poster/phone_portrait.jpg`)}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      {([0, 1] as const).map((slot) => (
        <video
          key={slot}
          ref={(element) => {
            videos.current[slot] = element;
          }}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onPlaying={() => handlePlaying(slot)}
          onEnded={() => handleEnded(slot)}
          onError={() => {
            const { slot: current, clip } = head.current;
            if (slot === current && clip) recover(slot, clip);
          }}
          className={cn(
            "absolute inset-0 size-full object-cover",
            visible === slot ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </div>
  );
}

/** 받아 둔 영상·포스터를 화면이 쓸 수 있는 주소로 연다. 네트워크 주소 → blob 주소이고, 화면을 떠나면 닫는다. */
function useStoredWatcherAssets(): ReadonlyMap<string, string> {
  const [local, setLocal] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const opened: string[] = [];
    const urls = watcherAssetUrls(viewport()).filter((url) => !url.includes("/sound/"));
    void Promise.all(
      urls.map(async (url) => {
        const blob = await readWatcherAsset(url);
        if (!blob || cancelled) return null;
        const objectUrl = URL.createObjectURL(blob);
        opened.push(objectUrl);
        return [url, objectUrl] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const found = entries.filter((entry) => entry !== null);
      if (found.length > 0) setLocal(new Map(found));
    });
    return () => {
      cancelled = true;
      for (const objectUrl of opened) URL.revokeObjectURL(objectUrl);
    };
  }, []);
  return local;
}

/** 견본에서 감독관이 나간 뒤 빈 방을 보여 주는 시간 */
const DEMO_EMPTY_MS = 2_000;

/**
 * 설정 화면 견본
 *
 * 감독관이 들어와 시계를 한 번 보고(loop-a) 나간 뒤, 빈 방을 잠깐 보이고 다시 들어온다.
 * 모션 축소를 켠 사용자에게는 빈 방만 보인다.
 */
export function WatcherDemo({ className }: { className?: string }) {
  const [present, setPresent] = useState(() => !prefersReducedMotion());
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    if (!empty) return;
    const timer = setTimeout(() => {
      setEmpty(false);
      setPresent(true);
    }, DEMO_EMPTY_MS);
    return () => clearTimeout(timer);
  }, [empty]);
  return (
    <WatcherBackground
      present={present}
      className={className}
      onClipStart={(clip) => {
        // 시계를 보기 시작하면 나갈 차례로 돌려 두어, 그 클립이 끝나면 바로 퇴장한다.
        if (clip === "loop-a") setPresent(false);
        if (clip === null) setEmpty(true);
      }}
    />
  );
}

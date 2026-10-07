import { useEffect, useEffectEvent, useRef } from "react";

import { TIMELAPSE_FPS } from "./timelapseFrame";

const FRAME_MS = 1000 / TIMELAPSE_FPS;
/** 미리 풀어 둘 장 수. 360장을 한꺼번에 풀면 약 400MB라 앞쪽만 푼다. */
const LOOKAHEAD = 6;

function decodeJpeg(bytes: ArrayBuffer): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
}

interface Options {
  readonly photos: readonly ArrayBuffer[];
  readonly playing: boolean;
  readonly draw: (photo: ImageBitmap, index: number) => void;
  /** 바뀌면 멈춰 있어도 지금 장을 다시 그린다. 오버레이 값이 늦게 도착할 때 쓴다. */
  readonly redrawKey?: string;
  readonly decode?: (bytes: ArrayBuffer) => Promise<ImageBitmap>;
}

interface Shown {
  readonly bitmap: ImageBitmap;
  readonly index: number;
}

/**
 * 타임랩스 사진 넘기기
 *
 * 앞쪽 몇 장만 디코드해 두고 초당 12장으로 넘기며, 마지막 장 다음에는 처음으로 돌아간다.
 * 다음 장이 아직 풀리지 않았으면 그 화면 갱신은 건너뛰고, 풀지 못하는 사진은 아예 건너뛴다.
 * 멈춰 있어도 지금 장은 그려 둔다.
 * 장이 넘어가도 React 렌더를 일으키지 않는다. 화면 갱신은 모두 `draw`가 맡는다.
 */
export function useTimelapsePlayer({
  photos,
  playing,
  draw,
  redrawKey,
  decode = decodeJpeg,
}: Options): void {
  // 재생·일시정지로 효과가 다시 돌아도 보던 장에서 이어간다.
  const indexRef = useRef(0);
  const shownRef = useRef<Shown | null>(null);
  // 깨진 사진은 일시정지·재생으로 효과가 다시 돌아도 다시 풀지 않는다.
  const failedRef = useRef(new WeakMap<readonly ArrayBuffer[], Set<number>>());
  const drawFrame = useEffectEvent(draw);
  const decodePhoto = useEffectEvent(decode);

  useEffect(() => {
    const count = photos.length;
    if (count === 0) {
      return;
    }
    let disposed = false;
    let current = indexRef.current % count;
    let frame = 0;
    const decoded = new Map<number, ImageBitmap>();
    const pending = new Set<number>();
    const failed = failedRef.current.get(photos) ?? new Set<number>();
    failedRef.current.set(photos, failed);

    /** 풀 수 있는 다음 장. 전부 깨졌으면 null이다. */
    const nextPlayable = (from: number): number | null => {
      for (let step = 1; step <= count; step += 1) {
        const candidate = (from + step) % count;
        if (!failed.has(candidate)) {
          return candidate;
        }
      }
      return null;
    };

    const show = (target: number): boolean => {
      const bitmap = decoded.get(target);
      if (bitmap === undefined) {
        return false;
      }
      decoded.delete(target);
      drawFrame(bitmap, target);
      shownRef.current?.bitmap.close();
      shownRef.current = { bitmap, index: target };
      return true;
    };

    const moveTo = (target: number) => {
      current = target;
      indexRef.current = target;
    };

    const decodeAt = (target: number) => {
      const bytes = photos[target];
      if (
        bytes === undefined ||
        target === shownRef.current?.index ||
        decoded.has(target) ||
        pending.has(target) ||
        failed.has(target)
      ) {
        return;
      }
      pending.add(target);
      decodePhoto(bytes).then(
        (bitmap) => {
          pending.delete(target);
          if (disposed) {
            bitmap.close();
            return;
          }
          decoded.set(target, bitmap);
          if (shownRef.current === null && target === current) {
            show(target);
          }
        },
        () => {
          pending.delete(target);
          failed.add(target);
          // 아직 아무것도 못 그렸는데 지금 장이 깨졌으면 다음 장을 첫 화면으로 삼는다.
          if (!disposed && shownRef.current === null && target === current) {
            const next = nextPlayable(target);
            if (next !== null) {
              moveTo(next);
              // 다음 장이 먼저 풀려 있었으면 멈춘 화면에서도 바로 그린다.
              show(next);
              prefetch();
            }
          }
        },
      );
    };

    /** 아직 아무것도 못 그렸으면 지금 장부터, 그렸으면 다음 장부터 앞쪽 몇 장을 푼다. */
    function prefetch() {
      const from = shownRef.current === null ? 0 : 1;
      for (let offset = from; offset < from + Math.min(LOOKAHEAD, count); offset += 1) {
        decodeAt((current + offset) % count);
      }
    }

    const advance = () => {
      const next = nextPlayable(current);
      if (next !== null && show(next)) {
        moveTo(next);
      }
      prefetch();
    };

    prefetch();

    if (playing) {
      let last: number | null = null;
      let elapsed = 0;
      const tick = (time: number) => {
        // 탭이 가려졌다 돌아와도 밀린 장을 한꺼번에 넘기지 않게 누적을 두 장으로 묶는다.
        elapsed = Math.min(elapsed + (last === null ? 0 : time - last), FRAME_MS * 2);
        last = time;
        if (elapsed >= FRAME_MS) {
          elapsed -= FRAME_MS;
          advance();
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      shownRef.current?.bitmap.close();
      shownRef.current = null;
      for (const bitmap of decoded.values()) {
        bitmap.close();
      }
      decoded.clear();
    };
  }, [photos, playing]);

  useEffect(() => {
    const shown = shownRef.current;
    if (shown !== null) {
      drawFrame(shown.bitmap, shown.index);
    }
  }, [redrawKey]);
}

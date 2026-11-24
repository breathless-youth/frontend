import { useEffect, useRef } from "react";

import timiSpartaBody from "@/assets/mascot/timi-sparta-body.png";
import timiSpartaFire from "@/assets/mascot/timi-sparta-fire.png";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

/**
 * 혜택 화면 머리의 스파르타 티미(확정 시안 최종 섹션의 burnFrame)
 *
 * 같은 크기·같은 위치로 맞춘 그림 두 장을 겹친다. 아래 캔버스가 불을 그리고 위에 몸 그림을 얹는다.
 * 불은 세로 2px 줄마다 아래(불 뿌리)를 고정하고 위로만 늘였다 줄여 불끝만 날름거리게 하고,
 * 그 위에 자기 자신을 옅게 더해 불빛이 불규칙하게 일렁이게 한다. 한꺼번에 커졌다 작아지는 박동이 아니다.
 * 꾸밈이라 읽는 사람에게 숨긴다. 모션 줄이기를 켠 기기에는 불 그림을 그대로 한 장만 그린다.
 * 불 그림이 읽힌 뒤에 시작하고, 문서가 숨으면 멈췄다 다시 보이면 이어 가며, 화면을 떠나면 멈춘다.
 */
/** 시안이 일렁임을 맞춘 기준 크기. 다른 크기에서는 가로 물결 간격을 이 비율로 늘여 같은 모양으로 일렁이게 한다. */
const BASE_SIZE = 176;
/** 늘어난 불끝이 잘리지 않도록 캔버스만 상자 위로 14% 더 높게 둔다. 아래 끝(불 뿌리)은 상자 아래 끝에 맞춘다. */
const HEADROOM = 1.14;
const MAX_DPR = 2;
/** 불끝이 늘어나는 최대 비율(시안의 일렁임 "약"). */
const LICK = 0.09;
/** 불을 나눠 그리는 세로 줄 폭(css px). */
const COLUMN = 2;

function drawFire(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fire: HTMLImageElement,
  size: number,
  t: number | null,
) {
  const w = size;
  // 불이 늘어나는 기준 높이는 상자 높이이고, 그린 결과는 캔버스 아래 끝에 붙인다.
  const boxH = size;
  const canvasH = size * HEADROOM;
  const k = BASE_SIZE / w;
  ctx.clearRect(0, 0, w, canvasH);
  if (t === null) {
    // 움직이지 않는 한 장: 불 그림을 상자 자리에 그대로 그린다.
    ctx.drawImage(fire, 0, canvasH - boxH, w, boxH);
    return;
  }
  const iw = fire.naturalWidth;
  const ih = fire.naturalHeight;
  for (let x = 0; x < w; x += COLUMN) {
    const n =
      0.5 * Math.sin(x * 0.085 * k + t * 0.0042) +
      0.32 * Math.sin(x * 0.19 * k - t * 0.0068 + 1.3) +
      0.18 * Math.sin(x * 0.37 * k + t * 0.0115 + 2.1);
    const dh = boxH * (1 + LICK * (0.5 + 0.5 * n));
    ctx.drawImage(fire, (x / w) * iw, 0, (COLUMN / w) * iw, ih, x, canvasH - dh, COLUMN + 0.6, dh);
  }
  const glow =
    0.1 + 0.04 * Math.sin(t / 180) + 0.04 * Math.sin(t / 73 + 0.4) + 0.02 * Math.sin(t / 43);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = glow * 0.5;
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, canvasH);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export function SpartaHero({ className, size = BASE_SIZE }: { className?: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * HEADROOM * dpr);
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduced = prefersReducedMotion();

    let frameId: number | null = null;
    let disposed = false;
    const tick = (t: number) => {
      if (ctx !== null) drawFire(ctx, canvas, fire, size, t);
      frameId = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frameId === null && !document.hidden) frameId = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    // 테스트가 바꿔 끼우는 대역을 쓰도록 window에서 읽는다.
    const fire = new window.Image();
    fire.onload = () => {
      if (disposed) return;
      if (reduced) {
        if (ctx !== null) drawFire(ctx, canvas, fire, size, null);
        return;
      }
      start();
      document.addEventListener("visibilitychange", onVisibility);
    };
    fire.src = timiSpartaFire;

    return () => {
      disposed = true;
      fire.onload = null;
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [size]);

  return (
    <div aria-hidden="true" className={className} style={{ width: size, height: size }}>
      <div className="relative size-full">
        {/* 캔버스만 상자 위로 넘쳐 그린다. 상자 크기는 그대로라 제목 자리는 움직이지 않는다. */}
        <canvas
          ref={canvasRef}
          className="absolute inset-x-0 bottom-0 w-full"
          style={{ height: `${HEADROOM * 100}%` }}
        />
        <img
          src={timiSpartaBody}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="absolute inset-0 size-full select-none"
        />
      </div>
    </div>
  );
}

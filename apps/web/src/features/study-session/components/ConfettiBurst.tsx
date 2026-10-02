import { useEffect, useRef } from "react";

import { colors } from "@focusmakers/design-tokens";

/**
 * 색종이 조각 색 — BY-557 시안 프로토타입의 축하 팔레트를 design-tokens 값으로 옮긴 것.
 * 축하 연출이라 라이트/다크를 따라가지 않고 고정 팔레트다(테마와 무관한 장식). 시안의 노랑
 * (`#FFD262`)은 토큰에 없어 뺐다.
 */
const CONFETTI_COLORS = [
  colors.brand.primary.light,
  colors.brand.hover.dark,
  colors.brand.subtlePressed.light,
  colors.state.distract.dark,
  colors.feedback.error.dark,
  colors.feedback.success.light,
] as const;

/** k번째 조각의 색 — 팔레트를 순환한다. */
function confettiColor(k: number): string {
  return CONFETTI_COLORS[k % CONFETTI_COLORS.length] ?? colors.brand.primary.light;
}

/** 프로토타입 `burst(fx, fy, n, power, spread)` 값 — 도장 좌우 두 지점에서 위로 터진다. */
const BURSTS: readonly { x: number; y: number }[] = [
  { x: 0.28, y: 0.34 },
  { x: 0.72, y: 0.34 },
];
const PARTICLES_PER_BURST = 60;
const POWER = 6.5;
const SPREAD = 1.4;
/** 캔버스 해상도 상한 — 3x 기기에서 전체 화면 캔버스를 매 프레임 지우는 비용을 누른다. */
const MAX_PIXEL_RATIO = 2;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  shape: 0 | 1 | 2;
  life: number;
  ttl: number;
}

/**
 * 도장이 닿는 순간 터지는 색종이(BY-560) — 화면 전체를 덮는 장식 캔버스.
 *
 * 프로토타입의 캔버스 파티클 루프를 그대로 옮겼다: `fireAfterMs` 뒤 두 지점에서 조각 60개씩이
 * 위로 튀어 중력(0.16)으로 떨어지며 수명 끝에 흐려진다. 조각이 다 사라지면 루프를 멈춘다 —
 * 그 뒤로는 CPU를 쓰지 않는다.
 *
 * `enabled`가 아니면(모션 축소) 캔버스만 두고 아무것도 그리지 않는다. 2D 컨텍스트를 못 얻는
 * 환경(테스트 jsdom)도 같다. 터치는 막지 않는다(`pointer-events-none`) — 정보가 아니라 장식이다.
 */
export function ConfettiBurst({ enabled, fireAfterMs }: { enabled: boolean; fireAfterMs: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || canvas === null) {
      return;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }

    // 논리 크기는 부모(화면)와 같고, 픽셀은 DPR을 곱해 선명하게 — 단 상한을 둔다.
    let width = 0;
    let height = 0;
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent === null) {
        return;
      }
      const rect = parent.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      width = rect.width;
      height = rect.height;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let particles: Particle[] = [];
    let frame = 0;

    const burst = (fx: number, fy: number) => {
      for (let k = 0; k < PARTICLES_PER_BURST; k += 1) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * SPREAD;
        const power = POWER * (0.5 + Math.random() * 0.9);
        particles.push({
          x: fx * width,
          y: fy * height,
          vx: Math.cos(angle) * power,
          vy: Math.sin(angle) * power - 2,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          w: 4 + Math.random() * 5,
          h: 3 + Math.random() * 4,
          color: confettiColor(k),
          shape: (k % 3) as 0 | 1 | 2,
          life: 0,
          ttl: 100 + Math.random() * 50,
        });
      }
    };

    const loop = () => {
      context.clearRect(0, 0, width, height);
      particles = particles.filter((p) => p.life < p.ttl && p.y < height + 24);
      for (const p of particles) {
        p.life += 1;
        p.vy += 0.16;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const alpha = p.life > p.ttl - 30 ? (p.ttl - p.life) / 30 : 1;
        context.save();
        context.globalAlpha = Math.max(alpha, 0);
        context.translate(p.x, p.y);
        context.rotate(p.rot);
        context.fillStyle = p.color;
        if (p.shape === 0) {
          context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else if (p.shape === 1) {
          context.beginPath();
          context.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.beginPath();
          context.moveTo(0, -p.h / 2);
          context.lineTo(p.w / 2, p.h / 2);
          context.lineTo(-p.w / 2, p.h / 2);
          context.closePath();
          context.fill();
        }
        context.restore();
      }
      if (particles.length > 0) {
        frame = requestAnimationFrame(loop);
      } else {
        frame = 0;
        context.clearRect(0, 0, width, height);
      }
    };

    const timer = window.setTimeout(() => {
      for (const { x, y } of BURSTS) {
        burst(x, y);
      }
      frame = requestAnimationFrame(loop);
    }, fireAfterMs);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [enabled, fireAfterMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
    />
  );
}

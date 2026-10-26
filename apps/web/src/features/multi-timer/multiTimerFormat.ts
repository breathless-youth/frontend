/**
 * 멀티 타이머 시간 표기 순수 함수
 */
import { formatElapsed } from "../study-session/formatDuration";

function ceilSeconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/**
 * 타이머 남은 시간 표기
 *
 * 초를 올림해야 0초가 되는 순간과 알림이 울리는 순간이 어긋나지 않는다.
 */
export function formatTimerRemaining(ms: number): string {
  return formatElapsed(ceilSeconds(ms));
}

/**
 * 뽀모도로 남은 시간 표기
 *
 * 대부분 1시간 미만이라 시 자리는 필요할 때만 보여 준다.
 */
export function formatPomodoroRemaining(ms: number): string {
  const total = ceilSeconds(ms);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${String(m).padStart(2, "0")}:${ss}`;
}

export function splitTimerSec(sec: number): { h: number; m: number; s: number } {
  const safe = Math.max(0, Math.floor(sec));
  return { h: Math.floor(safe / 3600), m: Math.floor((safe % 3600) / 60), s: safe % 60 };
}

export function joinTimerSec(parts: { h: number; m: number; s: number }): number {
  return parts.h * 3600 + parts.m * 60 + parts.s;
}

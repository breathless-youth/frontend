import { Badge } from "@/components/ui/badge";

/**
 * 세션 상단 중앙 상태 필 (Figma V2 `S1b · 싱글 공부 세션` badge).
 *
 * 측정 중(focus)·비집중(distract)·일시정지(paused) 세 state를 Badge variant로 그린다.
 * V1.4에 있던 색 점과 서브 문구는 V2 시안에 없어 뺐다(문구만으로 상태를 전달한다).
 *
 * 접근성: 자동 감지로 상태가 바뀌므로 `role="status"` + `aria-live="polite"`로
 * 스크린리더에 알린다.
 */

export type SessionStatusPillState = "focus" | "distract" | "paused";

const BADGE_VARIANT = {
  focus: "session-focus",
  distract: "session-distract",
  paused: "session-paused",
} as const satisfies Record<SessionStatusPillState, string>;

export interface SessionStatusPillProps {
  state: SessionStatusPillState;
  label: string;
  className?: string;
}

export function SessionStatusPill({ state, label, className }: SessionStatusPillProps) {
  return (
    <Badge variant={BADGE_VARIANT[state]} role="status" aria-live="polite" className={className}>
      {label}
    </Badge>
  );
}

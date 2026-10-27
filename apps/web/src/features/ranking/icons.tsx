import type { MedalRank } from "@focusmakers/types";
import type { SVGProps } from "react";

/**
 * 메달 그림 색
 *
 * Figma 메달 컴포넌트에 칠해진 값이다(색 고정 일러스트).
 */
const MEDAL_COLORS: Record<MedalRank, { fill: string; stroke: string; text: string }> = {
  1: { fill: "#FFD262", stroke: "#FFB234", text: "#966414" },
  2: { fill: "#D6DDE8", stroke: "#AAB5C6", text: "#465268" },
  3: { fill: "#F0BE8C", stroke: "#D68C48", text: "#784218" },
};

/**
 * 1·2·3위 메달 일러스트
 *
 * 숫자는 `numbered`로 끈다.
 */
export function IllustMedal({
  rank,
  size = 24,
  numbered = true,
  ...rest
}: SVGProps<SVGSVGElement> & { rank: MedalRank; size?: number; numbered?: boolean }) {
  const color = MEDAL_COLORS[rank];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      <circle cx="12" cy="12" r="10.5" fill={color.fill} stroke={color.stroke} strokeWidth={1.5} />
      {numbered && (
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="12"
          fontWeight={800}
          fill={color.text}
        >
          {rank}
        </text>
      )}
    </svg>
  );
}

/** 시상대 아바타 테의 두께(px) */
const MEDAL_RING_WIDTH = 3;

/**
 * 시상대 아바타 둘레의 메달색 테
 *
 * 그 순위 메달의 채움색이고 라이트와 다크에서 같다(색 고정 일러스트).
 * 은색만 채움색이 연한 배경에 묻혀서 메달 테두리색을 쓴다.
 * `size`는 테 바깥 지름이다.
 * 안쪽은 비워 둬 테와 아바타 사이로 카드 배경이 보인다.
 */
export function IllustMedalRing({
  rank,
  size,
  ...rest
}: SVGProps<SVGSVGElement> & { rank: MedalRank; size: number }) {
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
      data-medal-ring={rank}
      {...rest}
    >
      <circle
        cx={center}
        cy={center}
        r={center - MEDAL_RING_WIDTH / 2}
        stroke={rank === 2 ? MEDAL_COLORS[2].stroke : MEDAL_COLORS[rank].fill}
        strokeWidth={MEDAL_RING_WIDTH}
      />
    </svg>
  );
}

const TROPHY_PATHS = [
  "M7 3.8H17V8.5C17 9.82608 16.4732 11.0979 15.5355 12.0355C14.5979 12.9732 13.3261 13.5 12 13.5C10.6739 13.5 9.40215 12.9732 8.46447 12.0355C7.52678 11.0979 7 9.82608 7 8.5V3.8Z",
  "M7 5.8H4.4V6.9C4.3985 7.76813 4.72913 8.60395 5.32411 9.23613C5.9191 9.8683 6.73337 10.2489 7.6 10.3",
  "M17 5.8H19.6V6.9C19.6015 7.76813 19.2709 8.60395 18.6759 9.23613C18.0809 9.8683 17.2666 10.2489 16.4 10.3",
  "M12 13.5V16.7",
  "M8.5 20.3H15.5V18.5C15.5 18.0226 15.3104 17.5648 14.9728 17.2272C14.6352 16.8896 14.1774 16.7 13.7 16.7H10.3C10.0636 16.7 9.82956 16.7466 9.61117 16.837C9.39278 16.9275 9.19435 17.0601 9.02721 17.2272C8.86006 17.3944 8.72748 17.5928 8.63702 17.8112C8.54656 18.0296 8.5 18.2636 8.5 18.5V20.3Z",
];

/**
 * 트로피 아이콘
 *
 * Figma `icon/trophy` 원래 패스이고 색은 글자색을 따른다.
 * 랭킹 탭 아이콘은 다른 탭과 크기를 맞추려고 키웠지만, 이 아이콘은 글자 옆에 작게 놓여 시안 크기를 그대로 쓴다.
 */
export function IconTrophy({ size = 13, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      {TROPHY_PATHS.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

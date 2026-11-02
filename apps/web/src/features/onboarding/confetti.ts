/**
 * 준비 완료 꽃가루 44조각
 *
 * 양쪽 아래에서 22조각씩 위·안쪽으로 터진다.
 * 고정 시드라 매번 같은 모양으로 터지고 시안과 같은 배치가 나온다.
 */
export type ConfettiPiece = {
  x: number;
  w: number;
  h: number;
  radius: number;
  color: string;
  dx: number;
  dy: number;
  fall: number;
  rot: number;
  delay: number;
  duration: number;
};

// 꽃가루는 축하 장식이라 테마 토큰 대신 시안의 색 묶음을 그대로 쓴다.
const COLORS = ["#3671cf", "#7aa9f5", "#ffd262", "#ff9e1b", "#21a97a", "#f0555f", "#b9d2f8"];

function makeConfetti(): ConfettiPiece[] {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pieces: ConfettiPiece[] = [];
  for (const side of [
    { x: 24, dir: 1 },
    { x: 366, dir: -1 },
  ]) {
    for (let i = 0; i < 22; i++) {
      const angle = ((38 + rnd() * 46) * Math.PI) / 180;
      const speed = 300 + rnd() * 230;
      const kind = i % 3;
      pieces.push({
        x: side.x,
        w: kind === 2 ? 4 : 7,
        h: kind === 1 ? 7 : kind === 2 ? 14 : 11,
        radius: kind === 1 ? 999 : 1.5,
        color: COLORS[Math.floor(rnd() * COLORS.length)],
        dx: Math.round(side.dir * Math.cos(angle) * speed),
        dy: Math.round(-Math.sin(angle) * speed),
        fall: Math.round(220 + rnd() * 160),
        rot: Math.round((rnd() > 0.5 ? 1 : -1) * (360 + rnd() * 540)),
        delay: Number((0.25 + rnd() * 0.12).toFixed(2)),
        duration: Number((1.6 + rnd() * 0.6).toFixed(2)),
      });
    }
  }
  return pieces;
}

export const CONFETTI = makeConfetti();

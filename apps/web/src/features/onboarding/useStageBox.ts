import { useEffect, useState } from "react";

const STAGE_WIDTH = 390;
const STAGE_HEIGHT = 844;
/** 태블릿에서 글자가 지나치게 커지지 않게 막는 상한 */
const MAX_SCALE = 1.3;

type StageBox = { scale: number; left: number; top: number };

function measure(): StageBox {
  const scale = Math.min(
    window.innerWidth / STAGE_WIDTH,
    window.innerHeight / STAGE_HEIGHT,
    MAX_SCALE,
  );
  return {
    scale,
    left: (window.innerWidth - STAGE_WIDTH * scale) / 2,
    top: (window.innerHeight - STAGE_HEIGHT * scale) / 2,
  };
}

/**
 * 시안 크기(390×844) 무대를 화면에 맞춘 배율과 자리
 *
 * 폰이 단계마다 위아래로 옮겨 다녀서 흐름 배치로는 시안의 전환을 재현할 수 없다.
 * 그래서 무대를 통째로 화면 안에 들어오게 줄이거나 키우고 가운데에 둔다.
 */
export function useStageBox(): StageBox {
  const [box, setBox] = useState(measure);
  useEffect(() => {
    const update = () => setBox(measure());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return box;
}

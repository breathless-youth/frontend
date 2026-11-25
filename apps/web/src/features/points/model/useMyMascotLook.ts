import { useQuery } from "@tanstack/react-query";

import type { MascotLook } from "@/components/mascot/types";
import { isPointsEnabled } from "@/lib/pointsCapability";
import { lookQuery } from "@/lib/pointsQueries";

import { appPointsGateway } from "../gateway/appPointsGateway";

/**
 * 포인트 화면 밖에서 쓰는 내 마스코트 모습
 *
 * 꾸미기 조회만 읽어서 상점 상품이 늘어도 결과 화면과 프로필이 받는 양은 그대로다.
 * 상점에서 마스코트나 소품을 바꾸면 이 조회가 무효화되어 다른 화면도 따라 바뀐다.
 * 포인트 기능이 꺼져 있거나 사용자가 없으면 요청하지 않고 null이다.
 * 받기 전이나 실패했을 때도 null이라 부른 쪽은 기본 마스코트를 그린다.
 */
export function useMyMascotLook(userId: number | null): MascotLook | null {
  const enabled = isPointsEnabled() && userId !== null;
  const look = useQuery({ ...lookQuery(appPointsGateway(), userId ?? 0), enabled });
  return enabled ? (look.data ?? null) : null;
}

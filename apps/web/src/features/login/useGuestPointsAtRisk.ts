import { usePointsBalance } from "@/features/points/components/shop/usePointsBalance";
import { useUserId } from "@/lib/userId";

/**
 * 로그인하면 잃을 수 있는 비회원 잔액
 *
 * 비회원으로 모은 포인트는 처음 가입하면 그대로 이어지고 이미 있는 계정으로 로그인하면 사라진다.
 * 잃을 포인트가 있을 때만 안내하므로 잔액이 0이거나 아직 모르면 null이다.
 * 로그인 화면은 비회원에게만 열려서 회원인지 따로 보지 않는다.
 */
export function useGuestPointsAtRisk(): number | null {
  const { balance } = usePointsBalance(useUserId());
  return balance !== undefined && balance > 0 ? balance : null;
}

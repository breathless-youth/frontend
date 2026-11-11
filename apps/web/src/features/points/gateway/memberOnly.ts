import { ApiError } from "@/lib/api";

/** 비회원이 포인트 API를 불렀을 때의 거절이며, 회원 판정이 늦게 바뀐 경우에도 로그인 화면으로 보내려고 가른다. */
export function isMemberOnlyError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === "MEMBER_ONLY";
}

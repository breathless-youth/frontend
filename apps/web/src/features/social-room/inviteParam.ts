import {
  isCompleteInviteCode as isCompleteGroupCode,
  normalizeInviteCode,
} from "@/features/group-room/model/inviteCode";

import { isCompleteInviteCode as isCompleteRoomCode } from "./inviteCode";

/** 초대 링크가 가리키는 참여 화면과 그 코드 */
export type InviteParam =
  | { kind: "room"; code: string }
  | { kind: "group"; code: string }
  | { kind: "public"; groupId: number };

/**
 * 공개 그룹 링크의 코드 모양
 *
 * 하이픈은 정리하면 빠지므로 정리하기 전 값으로 보고, 그래야 `go-2345`가 6자리 그룹 코드로 읽히지 않는다.
 * 메신저가 끝에 붙인 문장 부호는 뒤에 숫자나 영문이 이어지지 않을 때만 버린다.
 */
const PUBLIC_INVITE = /^\s*go-([1-9]\d{0,9})(?![0-9A-Za-z])/i;

/** `go-`나 예전 모양 `g-`로 시작하면 공개 그룹 링크 자리이고, 모양이 틀려도 다른 코드로 읽지 않는다. */
const PUBLIC_PREFIX = /^\s*go?-/i;

/**
 * 초대 링크의 코드 판별
 *
 * 예전 방의 숫자 4자리 코드, 그룹의 영문·숫자 6자리 코드, 공개 그룹의 `go-<그룹 ID>`는 같은 `/social/join?code=` 링크로 와서 코드 모양으로 구분한다.
 * 메신저가 링크 끝에 붙인 공백이나 문장 부호는 버리고, 서버가 대소문자를 구분하지 않는 그룹 코드는 대문자로 맞춰 본다.
 * 어느 모양도 아니면 null이다.
 */
export function parseInviteParam(raw: string | null): InviteParam | null {
  if (raw === null) {
    return null;
  }
  const publicMatch = PUBLIC_INVITE.exec(raw);
  if (publicMatch) {
    return { kind: "public", groupId: Number(publicMatch[1]) };
  }
  if (PUBLIC_PREFIX.test(raw)) {
    return null;
  }
  const code = normalizeInviteCode(raw);
  if (isCompleteRoomCode(code)) {
    return { kind: "room", code };
  }
  return isCompleteGroupCode(code) ? { kind: "group", code } : null;
}

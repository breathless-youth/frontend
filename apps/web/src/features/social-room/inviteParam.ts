import {
  isCompleteInviteCode as isCompleteGroupCode,
  normalizeInviteCode,
} from "@/features/group-room/model/inviteCode";

import { isCompleteInviteCode as isCompleteRoomCode } from "./inviteCode";

/** 초대 링크가 가리키는 참여 화면과 그 코드 */
export type InviteParam = { kind: "room"; code: string } | { kind: "group"; code: string };

/**
 * 초대 링크의 코드 판별
 *
 * 예전 방의 숫자 4자리 코드와 그룹의 영문·숫자 6자리 코드는 같은 `/social/join?code=` 링크로 와서 코드 모양으로 구분한다.
 * 메신저가 링크 끝에 붙인 공백이나 문장 부호는 버리고, 서버가 대소문자를 구분하지 않는 그룹 코드는 대문자로 맞춰 본다.
 * 어느 모양도 아니면 null이다.
 */
export function parseInviteParam(raw: string | null): InviteParam | null {
  if (raw === null) {
    return null;
  }
  const code = normalizeInviteCode(raw);
  if (isCompleteRoomCode(code)) {
    return { kind: "room", code };
  }
  return isCompleteGroupCode(code) ? { kind: "group", code } : null;
}

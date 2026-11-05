export const INVITE_CODE_LENGTH = 6;

const COMPLETE_CODE = new RegExp(`^[A-Z0-9]{${INVITE_CODE_LENGTH}}$`);

/**
 * 6자리 초대코드 정리
 *
 * 서버가 대문자로 바꿔 비교하므로 입력칸도 대문자로 맞춰 보여 준다.
 * 전각으로 친 글자도 받도록 NFKC로 반각에 맞춘 뒤 영문·숫자가 아닌 글자를 버린다.
 * 서버 코드에 쓰지 않는 0, O, 1, I, L은 남긴다.
 * 버리면 입력한 글자가 사라져 무엇이 틀렸는지 알 수 없고, 남기면 서버가 다시 확인하라고 답한다.
 */
export function normalizeInviteCode(input: string): string {
  return input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, INVITE_CODE_LENGTH);
}

export function isCompleteInviteCode(code: string): boolean {
  return COMPLETE_CODE.test(code);
}

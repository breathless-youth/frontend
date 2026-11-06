import i18n from "@/lib/i18n";

/** 같은 이름의 공개 그룹이 이미 있다는 서버 답을 받았을 때 이름 칸 아래에 보이는 문장. */
export function nameTakenCopy(): string {
  return i18n.t("group-room:nameCheck.taken");
}

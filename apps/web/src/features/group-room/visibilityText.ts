import type { RoomVisibility } from "./model/roomMenu";

/** 공개 표시 글자. 보이는 표시와 카드를 읽어 주는 이름이 같은 말을 쓰도록 한곳에 둔다. */
export const VISIBILITY_TEXT: Record<RoomVisibility, string> = {
  public: "공개",
  private: "비공개",
};

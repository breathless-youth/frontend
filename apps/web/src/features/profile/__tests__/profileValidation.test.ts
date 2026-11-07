import { describe, expect, it } from "vitest";

import { normalizeServerText } from "@/lib/graphemes";

import {
  nicknameWidth,
  normalizeGoal,
  normalizeNickname,
  validateGoal,
  validateNickname,
} from "../profileValidation";

/** 문구 상수가 카탈로그로 옮겨져 한국어 원문을 직접 둔다. */
const LENGTH_MESSAGE = "40칸까지 쓸 수 있어요. 한글·일본어·한자·이모지는 한 글자에 2칸이에요.";
const CHARS_MESSAGE = "한글·영문·일본어·한자·숫자·이모지·띄어쓰기·_·.·- 만 쓸 수 있어요";

describe("validateNickname", () => {
  it.each([
    "숨 벅찬 청년들",
    "Study7",
    "코딩🧑‍💻",
    "🇰🇷 화이팅",
    "1️⃣등 목표",
    "👩🏽‍💻 개발",
    "❤️‍🔥 열정",
    "🏴󠁧󠁢󠁥󠁮󠁧󠁿 잉글랜드",
    "  홍길동  ",
    "포메3721",
    "猫",
    "a",
    "가",
    "一夜漬けするラッコ",
    "ラッコ",
    "佐々木",
    "ハムスター",
    "熬夜复习的考拉",
    "捱夜溫書嘅樹熊",
    "study_otter",
    "a_b.c-d",
    "Jean-Luc",
    "José",
    "벼락치기하는 하늘다람쥐",
    "\u1100\u1161나", // 자모 입력은 완성형으로 합쳐진다
    "ﾊﾑｽﾀｰ", // 반각 가타카나는 보통 가타카나로 바뀐다
    "Ｏｔｔｅｒ", // 전각 영문은 보통 영문으로 바뀐다
    "홍길\u00a0동", // NBSP는 보통 띄어쓰기로 바뀐다
    "© 저작권", // 텍스트 기본 표시 기호도 이모지 속성이라 허용
    "가".repeat(20), // 40칸
    "a".repeat(40),
    "😀".repeat(20),
    "🇰🇷".repeat(20),
    "👨\u200D👩\u200D👧\u200D👦".repeat(12), // 84 코드포인트
    "😀" + "\u200D😀".repeat(48) + " a", // 99 코드포인트
    " ".repeat(254) + "가나", // 원문 256자
  ])("%s 는 통과한다", (nickname) => {
    expect(validateNickname(nickname)).toBeNull();
  });

  it.each([
    "",
    "   ",
    "가".repeat(21),
    "가".repeat(20) + "a", // 41칸
    "a".repeat(41),
    "🇰🇷".repeat(21),
    "😀" + "\u200D😀".repeat(49) + " a", // 101 코드포인트
    " ".repeat(255) + "가나", // 원문 257자
  ])("%s 는 길이 문구로 거부한다", (nickname) => {
    expect(validateNickname(nickname)).toBe(LENGTH_MESSAGE);
  });

  it.each([
    "느낌표금지!",
    "中・日", // 가운뎃점은 문장부호
    "ｶﾞｸ\uFF65ｾｲ", // 반각 가운뎃점도 NFKC 뒤 가운뎃점이 된다
    "ㅋㅋㅋ",
    "ㅅㅂ",
    "नमस्ते",
    "Привет",
    "a!b",
    "가‼", // NFKC가 느낌표 두 개로 푼다
    "##", // 키캡 기호 없는 # 단독
    "홍길\u200B동", // 제로폭 공백
    "홍길\u200D동", // 단독 ZWJ
    "홍길\t동",
    "😀\u200Da", // 이모지 뒤에 남은 ZWJ
    "😀\u200Ca", // ZWNJ
    "\u3164\u3164", // 한글 채움 문자
    "\ufeff가나", // BOM은 서버가 지우지 않는다
    "🇰 국기", // 지역 지시자 하나
    "😀\u0301 악센트", // 이모지 + 결합기호
    "🏴\u{E007F} 깃발", // 종료 태그만
    "a\uFE0Fb", // 글자에 붙은 표현 선택자
    "\uFE0F a", // 단독 VS16
    "\u{1F3FD}가나", // 단독 피부색 수정자
    "\u{1FC00} a", // 미할당 코드포인트
  ])("%s 는 글자 문구로 거부한다", (nickname) => {
    expect(validateNickname(nickname)).toBe(CHARS_MESSAGE);
  });

  it("서버가 지우는 공백류는 잘라내고 통과한다", () => {
    expect(validateNickname("\t가나\t")).toBeNull();
    expect(validateNickname("\u3000가나\u3000")).toBeNull();
    expect(validateNickname("\u2003가나")).toBeNull();
    expect(validateNickname("\u1680가나")).toBeNull();
    // NFKC가 보통 띄어쓰기로 바꾼 뒤 잘라낸다
    expect(validateNickname("\u00a0가나\u00a0")).toBeNull();
    expect(validateNickname("\u2007가나\u202F")).toBeNull();
  });
});

describe("validateNickname 서버 경계", () => {
  it("라틴 글자는 U+024F까지 받고 U+0250부터 거부한다", () => {
    expect(validateNickname("\u024F")).toBeNull();
    expect(validateNickname("\u0250")).toBe(CHARS_MESSAGE);
  });

  it("반복 부호 々와 확장 영역 한자를 한자로 받아 2칸으로 센다", () => {
    expect(validateNickname("々")).toBeNull();
    expect(validateNickname("\u{20000}")).toBeNull();
    expect(nicknameWidth("\u{20000}")).toBe(2);
  });

  it("정규화 뒤 코드포인트 100개는 받고 101개는 칸 수와 글자보다 먼저 길이로 거부한다", () => {
    const hundred = "😀" + "\u200D😀".repeat(49) + "a";
    expect([...hundred]).toHaveLength(100);
    expect(validateNickname(hundred)).toBeNull();
    expect(validateNickname("😀" + "\u200D😀".repeat(49) + " a")).toBe(LENGTH_MESSAGE);
    // 받지 않는 글자가 섞여도 코드포인트 상한을 먼저 본다
    expect(validateNickname("😀" + "\u200D😀".repeat(49) + " !")).toBe(LENGTH_MESSAGE);
  });

  it("태그 깃발은 종료 태그까지 갖춘 것만 받는다", () => {
    expect(
      validateNickname("\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}"),
    ).toBeNull();
    expect(validateNickname("\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}")).toBe(
      CHARS_MESSAGE,
    );
    expect(validateNickname("\u{1F3F4}\u{E007F}")).toBe(CHARS_MESSAGE);
  });
});

describe("nicknameWidth", () => {
  it("한글·가나·장음 부호·한자·이모지는 2칸, 나머지는 1칸으로 센다", () => {
    expect(nicknameWidth("벼락치기하는 하늘다람쥐")).toBe(23);
    expect(nicknameWidth("Caffeinated Capybara")).toBe(20);
    expect(nicknameWidth("一夜漬けするラッコ")).toBe(18);
    expect(nicknameWidth("ハムスター")).toBe(10);
    expect(nicknameWidth("佐々木")).toBe(6);
    expect(nicknameWidth("👨‍👩‍👧")).toBe(2);
    expect(nicknameWidth("José_K.")).toBe(7);
    expect(nicknameWidth("  가나다  ")).toBe(6);
  });
});

describe("normalizeNickname", () => {
  it("전각 영문과 반각 가타카나를 보통 글자로 바꾸고 앞뒤 공백을 뺀다", () => {
    expect(normalizeNickname(" Ｏｔｔｅｒ ")).toBe("Otter");
    expect(normalizeNickname("ﾊﾑｽﾀｰ")).toBe("ハムスター");
    expect(normalizeNickname("홍 길  동")).toBe("홍 길  동");
  });

  it("그룹 글 정규화는 NFC 그대로라 전각 영문을 바꾸지 않는다", () => {
    expect(normalizeServerText("Ｏｔｔｅｒ")).toBe("Ｏｔｔｅｒ");
  });
});

describe("validateGoal", () => {
  it("공백 포함 20자까지 유효하다", () => {
    expect(validateGoal("올해 안에 이직 성공")).toBeNull();
    expect(validateGoal("12345678901234567890")).toBeNull(); // 20자
  });

  it("21자는 길다", () => {
    expect(validateGoal("123456789012345678901")).not.toBeNull();
  });

  it("빈 문자열은 유효하다 — 목표는 선택 항목", () => {
    expect(validateGoal("")).toBeNull();
  });
});

describe("normalizeGoal", () => {
  it("빈 값과 공백뿐인 값은 미설정으로 본다", () => {
    expect(normalizeGoal("")).toBeNull();
    expect(normalizeGoal("   ")).toBeNull();
    expect(normalizeGoal(null)).toBeNull();
  });

  it("공백이 아닌 문구는 앞뒤 공백까지 그대로 둔다", () => {
    expect(normalizeGoal(" 목표 ")).toBe(" 목표 ");
    expect(normalizeGoal("올해 안에 이직 성공")).toBe("올해 안에 이직 성공");
  });
});

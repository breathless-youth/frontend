import { describe, expect, it } from "vitest";

import {
  NICKNAME_RULE_MESSAGE,
  validateGoal,
  validateNickname,
  validateNicknameLength,
} from "../profileValidation";

describe("validateNickname", () => {
  it("한글·영문·숫자·이모지·띄어쓰기 조합을 허용한다", () => {
    expect(validateNickname("숨 벅찬 청년들")).toBeNull();
    expect(validateNickname("코딩🧑‍💻")).toBeNull();
    expect(validateNickname("🇰🇷 화이팅")).toBeNull();
    expect(validateNickname("1️⃣등 목표")).toBeNull();
    expect(validateNickname("  홍길동  ")).toBeNull();
    expect(validateNickname("포메3721")).toBeNull();
    expect(validateNickname("ab")).toBeNull();
  });

  it("특수문자가 섞이면 무효다", () => {
    expect(validateNickname("느낌표금지!")).not.toBeNull();
    expect(validateNickname("日本語ニック")).not.toBeNull();
    expect(validateNickname("ㅋㅋㅋ")).not.toBeNull();
    expect(validateNickname("under_score")).not.toBeNull();
    expect(validateNickname("##")).not.toBeNull(); // 키캡 기호 없는 # 단독
    expect(validateNickname("홍길​동")).not.toBeNull(); // 제로폭 공백
    expect(validateNickname("홍길 동")).not.toBeNull(); // NBSP
    expect(validateNickname(" a ")).not.toBeNull(); // 잘라내면 1자
    expect(validateNickname("   ")).not.toBeNull(); // 공백만
    expect(validateNickname("")).not.toBeNull();
  });

  it("길이 경계 — 2자 통과, 1자 거부", () => {
    expect(validateNickname("가나")).toBeNull();
    expect(validateNickname("가")).not.toBeNull();
  });

  it("길이 경계 — 12자 통과, 13자 거부", () => {
    expect(validateNickname("가나다라마바사아자차카타")).toBeNull(); // 12자
    expect(validateNickname("가나다라마바사아자차카타파")).not.toBeNull(); // 13자
  });

  it("길이 경계 — 국기 이모지 12개 통과, 13개 거부", () => {
    expect(validateNickname("🇰🇷".repeat(12))).toBeNull();
    expect(validateNickname("🇰🇷".repeat(13))).not.toBeNull();
  });

  it("형식 오류는 공통 문구를 쓴다", () => {
    expect(validateNickname("느낌표금지!")).toBe(NICKNAME_RULE_MESSAGE);
  });

  it("서버가 지우지 않는 공백류가 남으면 무효다", () => {
    // NBSP(U+00A0) — JS trim()은 지우지만 서버 String.strip()은 남겨서 거부한다
    expect(validateNickname(" 가나 ")).not.toBeNull();
    // BOM(U+FEFF) — 마찬가지로 JS trim()만 지우고 서버는 남긴다
    expect(validateNickname("﻿가나")).not.toBeNull();
  });

  it("U+2000~U+200A 안이라도 예외로 빠진 공백류는 계속 거부한다", () => {
    // U+2007 FIGURE SPACE — Character.isWhitespace가 명시적으로 제외한다
    expect(validateNickname("\u2007가나\u2007")).not.toBeNull();
    // U+202F NARROW NO-BREAK SPACE — 마찬가지로 제외
    expect(validateNickname("\u202F가나\u202F")).not.toBeNull();
  });

  it("서버가 지우는 전각·유니코드 공백류는 잘라내고 통과한다 — 한글 IME 전각 모드 입력", () => {
    // U+3000 IDEOGRAPHIC SPACE(전각 공백)
    expect(validateNickname("\u3000가나\u3000")).toBeNull();
    // U+2003 EM SPACE
    expect(validateNickname("\u2003가나")).toBeNull();
    // U+1680 OGHAM SPACE MARK
    expect(validateNickname("\u1680가나")).toBeNull();
  });

  it("이모지 조합 부품이 단독으로 오면 무효다 — 시작 글자가 그림 이모지·지역 지시자가 아니다", () => {
    // 단독 VS16(U+FE0F)
    expect(validateNickname("️ a")).not.toBeNull();
    // 단독 ZWJ(U+200D)
    expect(validateNickname("‍가나")).not.toBeNull();
    // 단독 피부색 수정자(U+1F3FD)
    expect(validateNickname("\u{1F3FD}가나")).not.toBeNull();
  });

  it("서버가 지우는 공백류는 잘라내고 통과한다", () => {
    expect(validateNickname("\t가나\t")).toBeNull();
  });

  it("서버가 허용하는 텍스트 표현 기호(Extended_Pictographic)는 통과한다", () => {
    expect(validateNickname("가‼")).toBeNull();
    expect(validateNickname("© 저작권")).toBeNull();
  });
});

describe("validateNicknameLength", () => {
  it("12자는 통과, 13자는 안내한다", () => {
    expect(validateNicknameLength("가나다라마바사아자차카타")).toBeNull(); // 12자
    expect(validateNicknameLength("가나다라마바사아자차카타파")).not.toBeNull(); // 13자
  });

  it("국기 이모지 12개는 통과한다", () => {
    expect(validateNicknameLength("🇰🇷".repeat(12))).toBeNull();
  });

  it("앞뒤 공백은 세지 않는다", () => {
    expect(validateNicknameLength("  가나다라마바사아자차카타  ")).toBeNull(); // 12자 + 공백
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

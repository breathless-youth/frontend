// 포인트 표기는 언어와 상관없이 쉼표 묶음과 P 접미로 정했다.
const NUMBER = new Intl.NumberFormat("en-US");

/** 잔액·가격 표기 */
export function formatPoints(n: number): string {
  return `${NUMBER.format(n)}P`;
}

/** 받거나 쓴 양의 부호 붙은 표기 */
export function formatSignedPoints(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${NUMBER.format(Math.abs(n))}P`;
}

/**
 * 클립보드 복사. secure context(https·localhost)가 아니거나 사용자가 거부하면 `writeText`가
 * reject 하거나 API 자체가 없어, 두 경우 모두 false 로 돌려준다. 호출부는 결과로 성공·실패
 * 안내를 가른다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

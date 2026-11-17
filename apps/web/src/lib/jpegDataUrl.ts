/**
 * 기기에 저장한 JPEG 바이트의 data URL
 *
 * 사진 한 장은 수십~수백 KB라 data URL로 들고 있어도 작고, Blob URL처럼 해제할 것이 없다.
 * 타임랩스 썸네일과 타이머 배경 사진이 같이 쓴다.
 */
export function jpegDataUrl(bytes: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("failed to read photo"));
    reader.readAsDataURL(new Blob([bytes], { type: "image/jpeg" }));
  });
}

/** 기기 사진을 분석 도구의 세션 리플레이에서 가리는 표식. 카메라 화면과 같다(ADR 0013). */
export const REPLAY_BLOCKED = "amp-block sentry-block";

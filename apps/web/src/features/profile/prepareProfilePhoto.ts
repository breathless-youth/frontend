/** 이보다 큰 원본은 디코드하다 기기 메모리가 모자랄 수 있어 읽지 않는다. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** 서버가 업로드 주소를 내주는 상한과 같다. */
const MAX_UPLOAD_BYTES = 1024 * 1024;
const OUTPUT_PX = 512;
const JPEG_QUALITIES = [0.85, 0.7];

export class UnusablePhotoError extends Error {}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function decode(source: Blob): Promise<ImageBitmap> {
  try {
    // 휴대폰 사진은 EXIF 방향대로 돌려야 똑바로 선다.
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch (error) {
    // iOS 15 Safari와 112 미만 Android 웹뷰는 이 옵션 값을 몰라 TypeError로 거절한다.
    // 방향이 틀어질 수는 있어도 모든 사진을 막는 것보다 나아 옵션 없이 한 번 더 읽는다.
    // 디코드 자체가 실패한 것(DOMException)은 다시 읽어도 같고, 큰 원본을 두 번 풀면 메모리만 더 쓴다.
    if (!(error instanceof TypeError)) {
      throw error;
    }
    return await createImageBitmap(source);
  }
}

async function squareJpeg(source: Blob): Promise<Blob> {
  const bitmap = await decode(source);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  try {
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new UnusablePhotoError();
    }
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      OUTPUT_PX,
      OUTPUT_PX,
    );
  } finally {
    bitmap.close();
  }
  for (const quality of JPEG_QUALITIES) {
    const blob = await encodeJpeg(canvas, quality);
    // 캔버스는 JPEG를 못 만들면 오류 없이 PNG를 주는데, 업로드 주소는 JPEG로만 서명돼 있다.
    if (blob?.type === "image/jpeg" && blob.size <= MAX_UPLOAD_BYTES) {
      return blob;
    }
  }
  throw new UnusablePhotoError();
}

/**
 * 올릴 프로필 사진 만들기
 *
 * 짧은 변 기준 가운데 정사각형을 512px JPEG로 만든다.
 * iOS 웹뷰는 JPEG만 믿을 만하게 만들어 다른 형식은 쓰지 않는다.
 * 읽지 못한 사진과 화질을 낮춰도 큰 사진을 사용자에게 같은 말로 안내하도록 실패는 모두 UnusablePhotoError로 던진다.
 */
export async function prepareProfilePhoto(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new UnusablePhotoError();
  }
  try {
    // Android 웹뷰는 파일 선택기가 준 File을 바로 디코드하지 못하고, 같은 내용을 메모리로 옮긴 사본은 디코드한다.
    const copy = new Blob([await file.arrayBuffer()], { type: file.type });
    return await squareJpeg(copy);
  } catch {
    throw new UnusablePhotoError();
  }
}

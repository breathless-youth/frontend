package expo.modules.profilephotopicker

/** 웹에 넘기는 사진의 한 변. 웹 파일 입력 경로가 만드는 사진과 같은 크기다. */
internal const val OUTPUT_PX = 512

/**
 * 줄여 읽을 배율
 *
 * 짧은 변이 OUTPUT_PX 아래로 내려가지 않는 가장 큰 2의 거듭제곱이다.
 * 8160×6120 사진을 원본대로 풀면 약 200MB라 저사양 기기가 메모리 부족으로 앱을 끝낸다.
 * 디코더는 2의 거듭제곱 배율만 정확히 따르므로 그 안에서 고른다.
 * 크기를 읽지 못한 값(0 이하)은 1을 돌려주고 디코드 실패로 처리되게 둔다.
 */
internal fun sampleSizeFor(width: Int, height: Int): Int {
  val shortSide = minOf(width, height)
  var sample = 1
  while (shortSide / (sample * 2) >= OUTPUT_PX) {
    sample *= 2
  }
  return sample
}

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

/** 타이머 배경 사진의 긴 변. 휴대폰 화면을 덮고 남는 크기이고 웹 파일 입력 경로와 같다. */
internal const val BACKGROUND_LONG_EDGE_PX = 1920

/**
 * 배경 사진을 줄여 읽을 배율
 *
 * 긴 변이 BACKGROUND_LONG_EDGE_PX 아래로 내려가지 않는 가장 큰 2의 거듭제곱이다.
 * 프로필 사진과 같은 이유로 원본을 다 풀지 않는다.
 */
internal fun backgroundSampleSizeFor(width: Int, height: Int): Int {
  val longSide = maxOf(width, height)
  var sample = 1
  while (longSide / (sample * 2) >= BACKGROUND_LONG_EDGE_PX) {
    sample *= 2
  }
  return sample
}

/** 줄여 읽은 배경 사진을 긴 변 BACKGROUND_LONG_EDGE_PX로 맞출 배율. 작은 사진은 키우지 않는다. */
internal fun backgroundScaleFor(width: Int, height: Int): Float =
  minOf(1f, BACKGROUND_LONG_EDGE_PX.toFloat() / maxOf(width, height, 1))

/**
 * 사진 처리 중 메모리 부족을 실패로 바꾸기
 *
 * OutOfMemoryError는 Exception이 아니라서 그대로 두면 브리지의 실패 처리를 지나쳐 앱이 끝날 수 있다.
 * 줄여 읽어도 저사양 기기에서는 큰 비트맵 하나가 모자랄 수 있으니, 그때는 고르기 실패로 끝낸다.
 */
internal inline fun <T> failOnOutOfMemory(block: () -> T): T =
  try {
    block()
  } catch (e: OutOfMemoryError) {
    throw java.io.IOException("사진을 처리할 메모리가 모자라다", e)
  }

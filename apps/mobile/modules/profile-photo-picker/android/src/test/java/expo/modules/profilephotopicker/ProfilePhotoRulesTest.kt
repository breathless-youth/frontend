package expo.modules.profilephotopicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class ProfilePhotoRulesTest {
  @Test
  fun 카메라_원본은_짧은_변이_512_이상_남는_만큼만_줄인다() {
    // 6120 / 8 = 765, 6120 / 16 = 382
    assertEquals(8, sampleSizeFor(8160, 6120))
  }

  @Test
  fun 세로_사진도_짧은_변으로_정한다() {
    assertEquals(8, sampleSizeFor(6120, 8160))
  }

  @Test
  fun 짧은_변이_정확히_두_배면_절반으로_읽는다() {
    assertEquals(2, sampleSizeFor(1024, 4096))
  }

  @Test
  fun 두_배에_못_미치면_원본_크기로_읽는다() {
    assertEquals(1, sampleSizeFor(1023, 2000))
    assertEquals(1, sampleSizeFor(512, 512))
  }

  @Test
  fun 작은_사진은_원본_크기로_읽는다() {
    assertEquals(1, sampleSizeFor(300, 200))
  }

  @Test
  fun 크기를_읽지_못하면_원본_배율이다() {
    assertEquals(1, sampleSizeFor(-1, -1))
    assertEquals(1, sampleSizeFor(0, 0))
  }
}

class BackgroundPhotoRulesTest {
  @Test
  fun 배경은_긴_변이_1920_이상_남는_만큼만_줄여_읽는다() {
    // 8160 / 4 = 2040, 8160 / 8 = 1020
    assertEquals(4, backgroundSampleSizeFor(8160, 6120))
    assertEquals(4, backgroundSampleSizeFor(6120, 8160))
  }

  @Test
  fun 배경용으로_작은_사진은_원본_크기로_읽는다() {
    assertEquals(1, backgroundSampleSizeFor(1080, 1920))
    assertEquals(1, backgroundSampleSizeFor(0, 0))
  }

  @Test
  fun 배경_배율은_긴_변을_1920에_맞추고_키우지_않는다() {
    assertEquals(0.5f, backgroundScaleFor(3840, 2160), 0.0001f)
    assertEquals(1f, backgroundScaleFor(800, 600), 0.0001f)
  }

  @Test
  fun 사진을_다루다_메모리가_모자라면_실패로_바꾼다() {
    assertThrows(IOException::class.java) {
      failOnOutOfMemory { throw OutOfMemoryError("Failed to allocate") }
    }
  }

  @Test
  fun 메모리가_충분하면_결과를_그대로_돌려준다() {
    assertEquals("jpeg", failOnOutOfMemory { "jpeg" })
  }
}

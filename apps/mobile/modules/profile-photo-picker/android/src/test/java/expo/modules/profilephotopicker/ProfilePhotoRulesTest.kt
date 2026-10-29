package expo.modules.profilephotopicker

import org.junit.Assert.assertEquals
import org.junit.Test

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

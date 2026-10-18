package ph.bantay.family;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class AppUpdaterLogicTest {
  @Test public void sha256MatchesKnownVector() throws Exception {
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      AppUpdaterPlugin.sha256Hex(new ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8))));
  }

  @Test public void onlyHttpsGithubHostsAllowed() {
    assertTrue(AppUpdaterPlugin.allowedUrl("https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/bantay-2.0.1.apk"));
    assertTrue(AppUpdaterPlugin.allowedUrl("https://objects.githubusercontent.com/x"));
    assertTrue(AppUpdaterPlugin.allowedUrl("https://release-assets.githubusercontent.com/x"));
    assertFalse(AppUpdaterPlugin.allowedUrl("http://github.com/x.apk"));
    assertFalse(AppUpdaterPlugin.allowedUrl("https://evil.example/bantay.apk"));
    assertFalse(AppUpdaterPlugin.allowedUrl("https://github.com.evil.example/x.apk"));
    assertFalse(AppUpdaterPlugin.allowedUrl("https://evil.example/@github.com/x"));
    assertFalse(AppUpdaterPlugin.allowedUrl("https://github.com@evil.example/x"));
    assertFalse(AppUpdaterPlugin.allowedUrl(null));
    assertFalse(AppUpdaterPlugin.allowedUrl("not a url"));
  }

  @Test public void spaceNeedsTwiceTheSize() {
    assertTrue(AppUpdaterPlugin.hasSpace(2_000, 1_000));
    assertFalse(AppUpdaterPlugin.hasSpace(1_999, 1_000));
  }
}

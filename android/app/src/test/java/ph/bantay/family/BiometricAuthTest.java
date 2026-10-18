package ph.bantay.family;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import org.junit.Test;

public class BiometricAuthTest {
  private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;
  private static final int CRED = BiometricManager.Authenticators.DEVICE_CREDENTIAL;

  @Test public void api30AllowsScreenLockAndHasNoNegativeButton() {
    assertEquals(STRONG | CRED, BiometricAuth.authenticators(30));
    assertEquals(STRONG | CRED, BiometricAuth.authenticators(35));
    assertNull(BiometricAuth.negativeText(30));
  }

  @Test public void before30IsFingerprintAloneWithAUsePinButton() {
    for (int sdk : new int[] {26, 28, 29}) {
      assertEquals(STRONG, BiometricAuth.authenticators(sdk));
      assertEquals("Use PIN", BiometricAuth.negativeText(sdk));
    }
  }

  @Test public void negativeButtonMapsToUsePin() {
    assertEquals("use_pin", BiometricAuth.rejection(BiometricPrompt.ERROR_NEGATIVE_BUTTON));
    assertEquals("cancelled", BiometricAuth.rejection(BiometricPrompt.ERROR_USER_CANCELED));
    assertEquals("cancelled", BiometricAuth.rejection(BiometricPrompt.ERROR_CANCELED));
    assertEquals("failed", BiometricAuth.rejection(BiometricPrompt.ERROR_LOCKOUT));
    assertNotEquals("use_pin", BiometricAuth.rejection(BiometricPrompt.ERROR_LOCKOUT));
  }
}

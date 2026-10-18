package ph.bantay.family;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;

/** Pure choices for the fingerprint prompt, kept apart from Android classes so a JVM test can check them. */
final class BiometricAuth {
  private BiometricAuth() {}

  /** API 30+: fingerprint or the phone's screen lock. Before 30 that mix is not allowed, so fingerprint alone. */
  static int authenticators(int sdkInt) {
    return sdkInt >= 30
        ? BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL
        : BiometricManager.Authenticators.BIOMETRIC_STRONG;
  }

  /** BiometricPrompt throws unless there is a negative button whenever the screen lock is not allowed. null = must not be set. */
  static String negativeText(int sdkInt) {
    return (authenticators(sdkInt) & BiometricManager.Authenticators.DEVICE_CREDENTIAL) == 0 ? "Use PIN" : null;
  }

  /** What the web side hears: "use_pin" (the negative button), "cancelled" (back, tap outside), "failed" (lockout, error). */
  static String rejection(int errorCode) {
    if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) return "use_pin";
    if (errorCode == BiometricPrompt.ERROR_USER_CANCELED || errorCode == BiometricPrompt.ERROR_CANCELED) return "cancelled";
    return "failed";
  }
}

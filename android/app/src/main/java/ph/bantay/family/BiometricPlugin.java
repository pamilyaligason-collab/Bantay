package ph.bantay.family;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Fingerprint gate for the app (D-32). The Supabase session stays in WebView storage; this only decides whether the app is shown.
 * A fingerprint, or the phone's own screen lock as backup on API 30+. Nothing is stored here.
 */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {
  // API 30+: fingerprint or screen lock. Before 30: fingerprint alone plus a "Use PIN" button (see BiometricAuth).
  private static final int AUTH = BiometricAuth.authenticators(Build.VERSION.SDK_INT);

  /** {available, enrolled}: available = the phone can do it at all; enrolled = a fingerprint or screen lock is set up. */
  @PluginMethod
  public void status(PluginCall call) {
    int r = BiometricManager.from(getContext()).canAuthenticate(AUTH);
    JSObject o = new JSObject();
    o.put("available", r != BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE && r != BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE
        && r != BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED);
    o.put("enrolled", r == BiometricManager.BIOMETRIC_SUCCESS);
    call.resolve(o);
  }

  /** Resolves {ok:true}; rejects with "use_pin" (negative button, API < 30), "cancelled" (back, tap outside) or "failed" (lockout, error). */
  @PluginMethod
  public void prompt(PluginCall call) {
    final String title = call.getString("title", "Open Bantay");
    final FragmentActivity activity = getActivity();
    activity.runOnUiThread(() -> {
      BiometricPrompt.PromptInfo.Builder b = new BiometricPrompt.PromptInfo.Builder().setTitle(title).setAllowedAuthenticators(AUTH);
      String negative = BiometricAuth.negativeText(Build.VERSION.SDK_INT);
      if (negative != null) b.setNegativeButtonText(negative);
      BiometricPrompt.PromptInfo info = b.build();
      BiometricPrompt bp = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
        @Override
        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
          JSObject o = new JSObject();
          o.put("ok", true);
          call.resolve(o);
        }

        @Override
        public void onAuthenticationError(int code, CharSequence msg) {
          call.reject(BiometricAuth.rejection(code));
        }
      });
      bp.authenticate(info);
    });
  }

  /** Opens the system screen where the person adds a fingerprint (API 30+), or Security settings before that. */
  @PluginMethod
  public void openEnroll(PluginCall call) {
    Intent i = Build.VERSION.SDK_INT >= 30
        ? new Intent(Settings.ACTION_BIOMETRIC_ENROLL).putExtra(Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED, AUTH)
        : new Intent(Settings.ACTION_SECURITY_SETTINGS);
    try {
      getActivity().startActivity(i);
      call.resolve();
    } catch (Exception e) {
      call.reject("no settings screen could be opened");
    }
  }
}

package ph.bantay.family;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.telephony.PhoneNumberUtils;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Auto-dial for the SOS flow (Q32 = auto-dial). The 3-second hold is the deliberate act; ACTION_CALL then places the call from the
 * foreground SOS screen so a panicking elder does not have to find the green button on the dial screen.
 *
 * Every refused case resolves {placed: false} and never rejects, so the JS side falls back to the tel: dial screen:
 * no CALL_PHONE permission, SecurityException, no dialler (ActivityNotFoundException), a malformed number, or an emergency number.
 * Emergency numbers are refused natively: 911 is never auto-dialled (the elder presses call on the prefilled dial screen).
 * This plugin NEVER asks for the permission by itself inside call(): only requestPermission() prompts, and the SOS flow never calls it.
 */
@CapacitorPlugin(name = "Call", permissions = { @Permission(strings = { Manifest.permission.CALL_PHONE }, alias = "call") })
public class CallPlugin extends Plugin {
  private static final String[] ALWAYS_EMERGENCY = { "911", "112", "117" };

  private boolean granted() {
    return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED;
  }

  private JSObject state() {
    JSObject r = new JSObject();
    r.put("state", granted() ? "granted" : "denied");
    return r;
  }

  private static JSObject placed(boolean ok) {
    JSObject r = new JSObject();
    r.put("placed", ok);
    return r;
  }

  /** Digits with an optional leading +; null when it is not a plausible phone number. */
  static String clean(String raw) {
    if (raw == null) return null;
    String s = raw.trim();
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (c >= '0' && c <= '9') b.append(c);
      else if (c == '+' && b.length() == 0) b.append(c);
      else if (c == ' ' || c == '-' || c == '(' || c == ')') continue;
      else return null;
    }
    int digits = b.length() - (b.length() > 0 && b.charAt(0) == '+' ? 1 : 0);
    return digits >= 7 && digits <= 15 ? b.toString() : null;
  }

  /** Exact match only: 117 is also the tail of ordinary mobile numbers, so it must not be matched as a suffix. */
  static boolean emergency(String number) {
    String digits = number.startsWith("+") ? number.substring(1) : number;
    for (String e : ALWAYS_EMERGENCY) if (e.equals(digits)) return true;
    try {
      return PhoneNumberUtils.isEmergencyNumber(number);
    } catch (RuntimeException e) {
      return true; // cannot tell: refuse, the JS side falls back to the dial screen
    }
  }

  @PluginMethod
  public void call(PluginCall call) {
    String number = clean(call.getString("number"));
    Activity activity = getActivity();
    if (number == null || activity == null || emergency(number) || !granted()) {
      call.resolve(placed(false));
      return;
    }
    try {
      Intent i = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(number)));
      activity.startActivity(i);
      call.resolve(placed(true));
    } catch (SecurityException | ActivityNotFoundException e) {
      call.resolve(placed(false));
    }
  }

  @PluginMethod
  public void checkPermission(PluginCall call) {
    call.resolve(state());
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (granted()) {
      call.resolve(state());
      return;
    }
    requestPermissionForAlias("call", call, "permissionResult");
  }

  @PermissionCallback
  private void permissionResult(PluginCall call) {
    call.resolve(state());
  }
}

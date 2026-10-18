package ph.bantay.family;

import android.content.ComponentName;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.app.AlarmManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationManagerCompat;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

/**
 * Opens the system screen where the user can turn on phone-side warnings.
 * Android lets no app switch these on, so this only navigates; it never changes a setting.
 *
 * Sources / caveats (apart from the Settings.ACTION_* constants, none of these screens has a
 * documented public intent, so every candidate is tried until one resolves):
 * - Settings.ACTION_SAFETY_CENTER "android.settings.SAFETY_CENTER" (API 33+):
 *   https://developer.android.com/reference/android/provider/Settings#ACTION_SAFETY_CENTER
 * - Google Play services location settings (Location services > Earthquake alerts on older
 *   phones): action com.google.android.gms.location.settings.GOOGLE_LOCATION_SETTINGS (widely
 *   used, undocumented, may not resolve).
 * - Earthquake alerts help: https://support.google.com/android/answer/9319337
 * - AOSP CellBroadcastReceiver settings activity:
 *   https://android.googlesource.com/platform/packages/apps/CellBroadcastReceiver/+/refs/heads/master/src/com/android/cellbroadcastreceiver/CellBroadcastSettings.java
 *   Its exported state varies by build, so explicit components are tried and guarded.
 */
@CapacitorPlugin(name = "SettingsOpener")
public class SettingsOpenerPlugin extends Plugin {
  private static final class Cand {
    final String label;
    final Intent intent;
    Cand(String label, Intent intent) { this.label = label; this.intent = intent; }
  }

  private static Cand action(String label, String action) {
    return new Cand(label, new Intent(action));
  }

  private static Cand component(String label, String pkg, String cls) {
    return new Cand(label, new Intent(Intent.ACTION_MAIN).setComponent(new ComponentName(pkg, cls)));
  }

  private static List<Cand> chain(String target) {
    List<Cand> c = new ArrayList<>();
    if ("earthquake".equals(target)) {
      c.add(action("safety-center", "android.settings.SAFETY_CENTER"));
      c.add(action("google-location-settings", "com.google.android.gms.location.settings.GOOGLE_LOCATION_SETTINGS"));
      c.add(action("location-settings", Settings.ACTION_LOCATION_SOURCE_SETTINGS));
    } else if ("wea".equals(target)) {
      c.add(component("cellbroadcast-google", "com.google.android.cellbroadcastreceiver", "com.android.cellbroadcastreceiver.CellBroadcastSettings"));
      c.add(component("cellbroadcast-aosp", "com.android.cellbroadcastreceiver", "com.android.cellbroadcastreceiver.CellBroadcastSettings"));
      // OEM candidates: best-effort guesses, unverified on hardware. Missing or unexported ones are skipped by open().
      c.add(component("cellbroadcast-samsung", "com.samsung.android.cellbroadcastreceiver", "com.samsung.android.cellbroadcastreceiver.CellBroadcastSettings"));
      c.add(component("cellbroadcast-samsung-sec", "com.sec.android.app.cellbroadcastreceiver", "com.sec.android.app.cellbroadcastreceiver.CellBroadcastSettings"));
      c.add(component("cellbroadcast-xiaomi", "com.xiaomi.cellbroadcastreceiver", "com.android.cellbroadcastreceiver.CellBroadcastSettings"));
      c.add(component("cellbroadcast-huawei", "com.huawei.cellbroadcastreceiver", "com.android.cellbroadcastreceiver.CellBroadcastSettings"));
      c.add(action("safety-center", "android.settings.SAFETY_CENTER"));
    } else {
      return null;
    }
    c.add(action("settings", Settings.ACTION_SETTINGS));
    return c;
  }

  @PluginMethod
  public void open(PluginCall call) {
    List<Cand> cands = chain(call.getString("target", ""));
    if (cands == null) {
      call.reject("unknown target");
      return;
    }
    // No resolveActivity gate: package visibility (Android 11+) would hide other packages' activities.
    // startActivity is not filtered; a missing or unexported activity throws and we try the next one.
    for (Cand c : cands) {
      try {
        getActivity().startActivity(c.intent);
        JSObject r = new JSObject();
        r.put("opened", c.label);
        call.resolve(r);
        return;
      } catch (ActivityNotFoundException | SecurityException e) {
        // not installed, or not exported (SecurityException): try the next one
      }
    }
    call.reject("no settings screen could be opened");
  }

  /** True when Android will not pause Bantay in the background (battery optimisation off for it). */
  @PluginMethod
  public void batteryStatus(PluginCall call) {
    PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
    JSObject r = new JSObject();
    r.put("ignoring", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
    call.resolve(r);
  }

  /** One-tap system prompt "Let Bantay run in the background?". Falls back to the list screen if it cannot open. */
  @PluginMethod
  public void requestBatteryExemption(PluginCall call) {
    try {
      getActivity().startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:" + getContext().getPackageName())));
      call.resolve();
    } catch (ActivityNotFoundException | SecurityException e) {
      openBattery(call);
    }
  }

  /** Everything the setup wizard can auto-verify, so finished steps can be hidden. */
  @PluginMethod
  public void status(PluginCall call) {
    android.content.Context ctx = getContext();
    JSObject r = new JSObject();
    r.put("notificationsEnabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
    boolean exact = true; // before API 31 exact alarms are always allowed
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AlarmManager am = (AlarmManager) ctx.getSystemService(android.content.Context.ALARM_SERVICE);
      exact = am != null && am.canScheduleExactAlarms();
    }
    r.put("canScheduleExactAlarms", exact);
    PowerManager pm = (PowerManager) ctx.getSystemService(android.content.Context.POWER_SERVICE);
    r.put("ignoringBatteryOptimizations", pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
    call.resolve(r);
  }

  /** Opens the battery optimisation list screen (fallback for requestBatteryExemption). */
  @PluginMethod
  public void openBattery(PluginCall call) {
    try {
      getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
      call.resolve();
    } catch (ActivityNotFoundException | SecurityException e) {
      call.reject("battery settings could not be opened");
    }
  }
}

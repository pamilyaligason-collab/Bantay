package ph.bantay.family;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
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
    PackageManager pm = getContext().getPackageManager();
    for (Cand c : cands) {
      try {
        if (c.intent.resolveActivity(pm) == null) continue;
        c.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(c.intent);
        JSObject r = new JSObject();
        r.put("opened", c.label);
        call.resolve(r);
        return;
      } catch (Exception e) {
        // not exported, no permission, or not found: try the next one
      }
    }
    call.reject("no settings screen could be opened");
  }
}

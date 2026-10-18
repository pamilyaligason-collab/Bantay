package ph.bantay.family;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Downloads a Bantay APK from GitHub Releases, checks its SHA-256, and installs it with a
 * PackageInstaller session. Android shows its own Update box (or none, on API 31+ for a
 * self-update with USER_ACTION_NOT_REQUIRED). The first install needs "Install unknown apps"
 * for Bantay; info().canInstall reports it and openInstallPermission() opens that screen.
 *
 * Contract (src/features/update/plugin.ts): info, openInstallPermission, download, install.
 * download rejects with the code 'checksum' | 'space' | 'network'.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
  private static final Set<String> HOSTS = new HashSet<>(Arrays.asList(
    "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"));
  private static final int MAX_REDIRECTS = 5;
  private static final int PROGRESS_STEP = 256 * 1024;
  private static final String ACTION = "ph.bantay.family.APP_UPDATE_RESULT";

  private final AtomicBoolean busy = new AtomicBoolean(false);
  private BroadcastReceiver receiver;
  private PluginCall installCall;
  private int sessionId = -1;

  // ---- pure helpers (JVM-tested) ----

  static String sha256Hex(InputStream in) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] buf = new byte[64 * 1024];
    int n;
    while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
    StringBuilder sb = new StringBuilder(64);
    for (byte b : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", b));
    return sb.toString();
  }

  /** https, no credentials, default port, and a GitHub release host. */
  static boolean allowedUrl(String url) {
    if (url == null) return false;
    try {
      URI u = new URI(url);
      return "https".equals(u.getScheme())
        && u.getUserInfo() == null
        && (u.getPort() == -1 || u.getPort() == 443)
        && u.getHost() != null
        && HOSTS.contains(u.getHost().toLowerCase(Locale.ROOT));
    } catch (Exception e) {
      return false;
    }
  }

  /** Room for the download plus the installer's own copy. */
  static boolean hasSpace(long usable, long size) {
    return usable >= size * 2;
  }

  // ---- plugin methods ----

  @PluginMethod
  public void info(PluginCall call) {
    try {
      Context c = getContext();
      PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
      JSObject r = new JSObject();
      r.put("versionCode", PackageInfoCompat.getLongVersionCode(pi));
      r.put("versionName", pi.versionName == null ? "" : pi.versionName);
      r.put("canInstall", c.getPackageManager().canRequestPackageInstalls());
      call.resolve(r);
    } catch (Exception e) {
      call.reject("info failed", e);
    }
  }

  @PluginMethod
  public void openInstallPermission(PluginCall call) {
    try {
      Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:" + getContext().getPackageName()));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) {
      call.reject("could not open settings", e);
    }
  }

  @PluginMethod
  public void download(PluginCall call) {
    final String url = call.getString("url");
    final String sha = call.getString("sha256");
    final Long sizeBoxed = call.getLong("size");
    if (!allowedUrl(url) || sha == null || !sha.matches("(?i)[0-9a-f]{64}") || sizeBoxed == null || sizeBoxed <= 0) {
      call.reject("bad arguments", "network");
      return;
    }
    final long size = sizeBoxed;
    if (!busy.compareAndSet(false, true)) {
      call.reject("download already running", "network");
      return;
    }
    new Thread(() -> {
      File dir = new File(getContext().getCacheDir(), "update");
      File out = new File(dir, "bantay.apk");
      try {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cache dir");
        if (out.exists() && !out.delete()) throw new IOException("old file");
        if (!hasSpace(dir.getUsableSpace(), size)) {
          call.reject("space", "space");
          return;
        }
        String code = fetch(url, out, size);
        if (code == null) {
          try (InputStream in = new FileInputStream(out)) {
            if (!sha256Hex(in).equalsIgnoreCase(sha)) code = "checksum";
          }
        }
        if (code != null) {
          out.delete();
          call.reject(code, code);
          return;
        }
        JSObject r = new JSObject();
        r.put("path", out.getAbsolutePath());
        call.resolve(r);
      } catch (Exception e) {
        out.delete();
        call.reject("network", "network");
      } finally {
        busy.set(false);
      }
    }, "bantay-update-download").start();
  }

  /** Streams url to out following only allow-listed redirects. Returns null on success or a reject code. */
  private String fetch(String url, File out, long size) throws IOException {
    String cur = url;
    for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
      HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
      try {
        c.setInstanceFollowRedirects(false);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        int status = c.getResponseCode();
        if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
          String loc = c.getHeaderField("Location");
          if (loc == null) return "network";
          cur = new URL(new URL(cur), loc).toString();
          if (!allowedUrl(cur)) return "network";
          continue;
        }
        if (status != 200) return "network";
        long done = 0, lastEmit = 0;
        emit(0, size);
        try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
          byte[] buf = new byte[64 * 1024];
          int n;
          while ((n = in.read(buf)) > 0) {
            done += n;
            if (done > size) return "checksum"; // longer than latest.json promised
            os.write(buf, 0, n);
            if (done - lastEmit >= PROGRESS_STEP) { emit(done, size); lastEmit = done; }
          }
        }
        emit(done, size);
        return done == size ? null : "checksum";
      } finally {
        c.disconnect();
      }
    }
    return "network";
  }

  private void emit(long done, long total) {
    JSObject p = new JSObject();
    p.put("done", done);
    p.put("total", total);
    notifyListeners("progress", p);
  }

  @PluginMethod
  public void install(PluginCall call) {
    final String path = call.getString("path");
    try {
      File apk = new File(getContext().getCacheDir(), "update/bantay.apk");
      // Only our own verified download may be installed.
      if (path == null || !apk.isFile() || !apk.getCanonicalPath().equals(new File(path).getCanonicalPath())) {
        result(call, "failure", "No downloaded update.");
        return;
      }
      if (installCall != null) {
        result(call, "failure", "An install is already running.");
        return;
      }
      Context c = getContext();
      PackageInstaller pi = c.getPackageManager().getPackageInstaller();
      PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
      params.setAppPackageName(c.getPackageName());
      params.setSize(apk.length());
      if (Build.VERSION.SDK_INT >= 31) {
        params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
      }
      int id = pi.createSession(params);
      sessionId = id;
      installCall = call;
      registerReceiver(c);
      PackageInstaller.Session session = pi.openSession(id);
      try {
        try (OutputStream os = session.openWrite("bantay.apk", 0, apk.length());
             InputStream in = new FileInputStream(apk)) {
          byte[] buf = new byte[64 * 1024];
          int n;
          while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
          session.fsync(os);
        }
        Intent cb = new Intent(ACTION).setPackage(c.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent pend = PendingIntent.getBroadcast(c, id, cb, flags);
        session.commit(pend.getIntentSender());
      } catch (Exception e) {
        session.abandon();
        throw e;
      } finally {
        session.close();
      }
    } catch (Exception e) {
      cleanupInstall();
      result(call, "failure", e.getMessage() == null ? "Install failed." : e.getMessage());
    }
  }

  private void registerReceiver(Context c) {
    unregisterReceiver();
    receiver = new BroadcastReceiver() {
      @Override public void onReceive(Context ctx, Intent i) {
        if (i.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -2) != sessionId) return;
        int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        PluginCall call = installCall;
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
          Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
          if (confirm != null) {
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(confirm);
          }
          // Keep listening: the final status arrives after the user answers Android's box.
          if (call != null) { installCall = null; result(call, "pending_user", null); }
          return;
        }
        String msg = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        cleanupInstall();
        if (call != null) {
          result(call, status == PackageInstaller.STATUS_SUCCESS ? "success" : "failure", msg);
        }
      }
    };
    IntentFilter f = new IntentFilter(ACTION);
    if (Build.VERSION.SDK_INT >= 33) c.registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED);
    else c.registerReceiver(receiver, f);
  }

  private void unregisterReceiver() {
    if (receiver == null) return;
    try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) { }
    receiver = null;
  }

  private void cleanupInstall() {
    unregisterReceiver();
    installCall = null;
    sessionId = -1;
  }

  private static void result(PluginCall call, String status, String message) {
    JSObject r = new JSObject();
    r.put("status", status);
    if (message != null) r.put("message", message);
    call.resolve(r);
  }

  @Override
  protected void handleOnDestroy() {
    unregisterReceiver();
  }
}

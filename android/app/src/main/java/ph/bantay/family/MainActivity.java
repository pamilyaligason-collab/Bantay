package ph.bantay.family;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Capacitor 8: local plugins must be registered before super.onCreate.
    registerPlugin(SettingsOpenerPlugin.class);
    registerPlugin(BiometricPlugin.class);
    registerPlugin(AppUpdaterPlugin.class);
    registerPlugin(ContactPickerPlugin.class);
    registerPlugin(CallPlugin.class);
    super.onCreate(savedInstanceState);
  }
}

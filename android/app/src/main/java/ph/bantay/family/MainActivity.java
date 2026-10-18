package ph.bantay.family;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Capacitor 8: local plugins must be registered before super.onCreate.
    registerPlugin(SettingsOpenerPlugin.class);
    super.onCreate(savedInstanceState);
  }
}

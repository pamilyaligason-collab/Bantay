package ph.bantay.family;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Phonebook picker. ACTION_PICK on the Phone data kind returns a one-time read grant for the chosen row only,
 * so no READ_CONTACTS permission is needed. Resolves {name, phone}; rejects "cancelled" if the user backs out.
 */
@CapacitorPlugin(name = "ContactPicker")
public class ContactPickerPlugin extends Plugin {
  @PluginMethod
  public void pick(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
    startActivityForResult(call, i, "pickResult");
  }

  @ActivityCallback
  private void pickResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    Uri uri = data == null ? null : data.getData();
    if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
      call.reject("cancelled");
      return;
    }
    String[] cols = {
      ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
      ContactsContract.CommonDataKinds.Phone.NUMBER
    };
    try (Cursor c = getContext().getContentResolver().query(uri, cols, null, null, null)) {
      if (c != null && c.moveToFirst()) {
        JSObject r = new JSObject();
        String name = c.getString(0);
        String phone = c.getString(1);
        r.put("name", name == null ? "" : name);
        r.put("phone", phone == null ? "" : phone);
        call.resolve(r);
        return;
      }
    } catch (SecurityException e) {
      // fall through to cancelled
    }
    call.reject("cancelled");
  }
}

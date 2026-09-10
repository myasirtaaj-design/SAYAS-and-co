package com.yasir.myshiftrecord;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Scanner;

import org.json.JSONObject;

/**
 * Single-activity host for the Job Buddy web app.
 *
 * <p>The whole UI lives in {@code assets/index.html} and is rendered in a {@link WebView}. Anything
 * the web layer cannot do on its own — Storage Access Framework file pickers, alarms, notifications,
 * printing, location permission — is exposed to JavaScript as the {@code AndroidBridge} object by
 * the {@link Bridge} inner class.
 *
 * <p>Calls travel in both directions:
 * <ul>
 *   <li>JS to native: {@code AndroidBridge.<method>()}.</li>
 *   <li>Native to JS: {@link #evaluateJs(String)} invoking {@code window.on*} callbacks, each
 *       guarded with {@code &&} so a missing handler is a no-op.</li>
 * </ul>
 */
public class MainActivity extends Activity {

    private static final String PREFS = "msr_native";
    private static final String KEY_BACKUP = "backup_uri";

    private static final int REQ_BACKUP = 4201;
    private static final int REQ_SAVE = 4202;
    private static final int REQ_OPEN = 4203;
    private static final int REQ_LOCATION = 4204;
    private static final int REQ_NOTIFICATION = 4205;
    private static final int REQ_DOCUMENT = 4206;
    private static final int REQ_SAVE_BINARY = 4207;

    private WebView webView;

    /** Filename, MIME type and payload staged between a save request and its picker result. */
    private String pendingFilename;
    private String pendingMime;
    private String pendingContent;

    /**
     * The {@code AndroidBridge} JavaScript interface.
     *
     * <p>Methods that only touch SharedPreferences or AlarmManager run straight on the WebView's
     * JS thread. Methods that start an activity or touch the WebView are marshalled onto the UI
     * thread via {@link BridgeUiRunnable}.
     */
    public class Bridge {

        private final MainActivity activity;

        public Bridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public boolean backup(String json) {
            return activity.backup(json);
        }

        @JavascriptInterface
        public boolean stageBackup(String json) {
            return activity.stageBackup(json);
        }

        @JavascriptInterface
        public void connectBackup() {
            activity.runOnUiThread(new BackupConnectRunnable(activity));
        }

        @JavascriptInterface
        public void disconnectBackup() {
            activity.disconnectBackup();
        }

        @JavascriptInterface
        public boolean isBackupConnected() {
            return activity.isBackupConnected();
        }

        @JavascriptInterface
        public long getLastAutoBackup() {
            return activity.getLastAutoBackup();
        }

        @JavascriptInterface
        public void openBackup() {
            activity.runOnUiThread(
                    new BridgeUiRunnable(activity, BridgeUiRunnable.OPEN_BACKUP, null, null, null));
        }

        @JavascriptInterface
        public void saveFile(String filename, String mime, String content) {
            activity.runOnUiThread(
                    new BridgeUiRunnable(activity, BridgeUiRunnable.SAVE_FILE, filename, mime, content));
        }

        @JavascriptInterface
        public void saveBinaryFile(String filename, String mime, String base64) {
            activity.runOnUiThread(
                    new BridgeUiRunnable(activity, BridgeUiRunnable.SAVE_BINARY_FILE, filename, mime, base64));
        }

        @JavascriptInterface
        public void pickDocument() {
            activity.runOnUiThread(
                    new BridgeUiRunnable(activity, BridgeUiRunnable.PICK_DOCUMENT, null, null, null));
        }

        @JavascriptInterface
        public void openUrl(String url) {
            activity.runOnUiThread(
                    new BridgeUiRunnable(activity, BridgeUiRunnable.OPEN_URL, url, null, null));
        }

        @JavascriptInterface
        public void printPage() {
            activity.runOnUiThread(
                    new BridgeUiRunnable(activity, BridgeUiRunnable.PRINT_PAGE, null, null, null));
        }

        @JavascriptInterface
        public void requestLocation() {
            activity.runOnUiThread(
                    new BridgeUiRunnable(activity, BridgeUiRunnable.REQUEST_LOCATION, null, null, null));
        }

        @JavascriptInterface
        public boolean hasNotificationPermission() {
            return activity.hasNotificationPermission();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            activity.runOnUiThread(
                    new BridgeUiRunnable(
                            activity, BridgeUiRunnable.REQUEST_NOTIFICATION_PERMISSION, null, null, null));
        }

        @JavascriptInterface
        public void scheduleReminder(String id, long triggerAtMillis, String title, String message) {
            activity.scheduleReminder(id, triggerAtMillis, title, message);
        }

        @JavascriptInterface
        public void cancelReminder(String id) {
            activity.cancelReminder(id);
        }
    }

    /** Grants the page's geolocation request unconditionally; the OS permission is the real gate. */
    public class ChromeClient extends WebChromeClient {

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, true, false);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new ChromeClient());
        webView.addJavascriptInterface(new Bridge(this), "AndroidBridge");

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    /** Lets the in-page history act as the back stack before the activity finishes. */
    @Override
    public void onBackPressed() {
        if (webView == null || !webView.canGoBack()) {
            super.onBackPressed();
        } else {
            webView.goBack();
        }
    }

    private void evaluateJs(String script) {
        if (webView != null) {
            webView.evaluateJavascript(script, null);
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, 0);
    }

    // ---------------------------------------------------------------------------------------------
    // Backup folder (Storage Access Framework tree, typically a Google Drive folder)
    // ---------------------------------------------------------------------------------------------

    public void connectBackup() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, REQ_BACKUP);
    }

    public void disconnectBackup() {
        prefs().edit().remove(KEY_BACKUP).apply();
    }

    public boolean isBackupConnected() {
        return prefs().getString(KEY_BACKUP, null) != null;
    }

    public long getLastAutoBackup() {
        return prefs().getLong("last_auto_backup", 0L);
    }

    /**
     * Writes {@code json} to app-private storage so {@link ReminderReceiver} can copy it out later
     * without the activity being alive.
     */
    public boolean stageBackup(String json) {
        try {
            FileOutputStream out = openFileOutput("latest_full_backup.json", 0);
            out.write(json.getBytes("UTF-8"));
            out.flush();
            out.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Stages the payload, then writes a timestamped copy into the connected backup folder. */
    public boolean backup(String json) {
        stageBackup(json);

        String treeUri = prefs().getString(KEY_BACKUP, null);
        if (treeUri == null) {
            return false;
        }

        try {
            Uri tree = Uri.parse(treeUri);
            String filename =
                    "Job_Buddy_Full_Backup_"
                            + new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.UK).format(new Date())
                            + ".json";
            Uri document =
                    DocumentsContract.createDocument(
                            getContentResolver(),
                            DocumentsContract.buildDocumentUriUsingTree(
                                    tree, DocumentsContract.getTreeDocumentId(tree)),
                            "application/json",
                            filename);
            if (document != null) {
                return writeTextToUri(document, json);
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    public void openBackup() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, REQ_OPEN);
    }

    // ---------------------------------------------------------------------------------------------
    // Documents in and out
    // ---------------------------------------------------------------------------------------------

    /** Picks any document (PDF or image) for the in-page OCR / PDF pipeline to read. */
    public void openDocument() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, REQ_DOCUMENT);
    }

    public void beginSaveFile(String filename, String mime, String content) {
        pendingFilename = filename;
        pendingMime = mime;
        pendingContent = content;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(intent, REQ_SAVE);
    }

    public void beginSaveBinaryFile(String filename, String mime, String base64) {
        pendingFilename = filename;
        pendingMime = mime;
        pendingContent = base64;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(intent, REQ_SAVE_BINARY);
    }

    public void openUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            // No app can handle the URL; nothing useful to show.
        }
    }

    public void printPage() {
        PrintManager printManager = (PrintManager) getSystemService("print");
        if (printManager == null || webView == null) {
            return;
        }
        printManager.print(
                "Job Buddy Timesheet",
                webView.createPrintDocumentAdapter("Job Buddy Timesheet"),
                new PrintAttributes.Builder().build());
    }

    // ---------------------------------------------------------------------------------------------
    // Permissions
    // ---------------------------------------------------------------------------------------------

    public boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < 33
                || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == 0;
    }

    public void requestNotificationPermission() {
        if (hasNotificationPermission()) {
            evaluateJs("window.onNotificationPermissionResult&&window.onNotificationPermissionResult(true);");
        } else {
            requestPermissions(
                    new String[] {"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFICATION);
        }
    }

    /**
     * Hands off to the WebView geolocation API once a location permission is held, asking for one
     * first if it is not.
     */
    public void ensureLocationPermission() {
        if (Build.VERSION.SDK_INT < 23
                || checkSelfPermission("android.permission.ACCESS_FINE_LOCATION") == 0
                || checkSelfPermission("android.permission.ACCESS_COARSE_LOCATION") == 0) {
            evaluateJs("window.beginBrowserLocation&&window.beginBrowserLocation();");
        } else {
            requestPermissions(
                    new String[] {
                        "android.permission.ACCESS_FINE_LOCATION",
                        "android.permission.ACCESS_COARSE_LOCATION"
                    },
                    REQ_LOCATION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);

        if (requestCode == REQ_NOTIFICATION) {
            boolean granted = results.length > 0 && results[0] == 0;
            evaluateJs(
                    "window.onNotificationPermissionResult&&window.onNotificationPermissionResult("
                            + granted
                            + ");");
            return;
        }

        if (requestCode == REQ_LOCATION) {
            boolean granted =
                    results.length > 0
                            && (results[0] == 0 || (results.length > 1 && results[1] == 0));
            if (granted) {
                evaluateJs("window.beginBrowserLocation&&window.beginBrowserLocation();");
            } else {
                evaluateJs("window.onLocationPermissionDenied&&window.onLocationPermissionDenied();");
            }
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Reminders
    // ---------------------------------------------------------------------------------------------

    /**
     * Schedules a one-shot alarm keyed by {@code id}. The reserved id {@code backup_auto} also
     * persists the repeat interval so {@link BackupBootReceiver} can re-arm it after a reboot; for
     * that id {@code message} carries the interval in days rather than notification text.
     */
    public void scheduleReminder(String id, long triggerAtMillis, String title, String message) {
        if ("backup_auto".equals(id)) {
            prefs().edit()
                    .putString("backup_days", message)
                    .putLong("next_auto_backup", triggerAtMillis)
                    .apply();
        }

        Intent intent = new Intent(this, ReminderReceiver.class);
        intent.putExtra("id", id);
        intent.putExtra("title", title);
        intent.putExtra("message", message);

        PendingIntent pendingIntent =
                PendingIntent.getBroadcast(
                        this,
                        id.hashCode(),
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        AlarmManager alarmManager = (AlarmManager) getSystemService("alarm");
        if (alarmManager != null) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        }
    }

    public void cancelReminder(String id) {
        PendingIntent pendingIntent =
                PendingIntent.getBroadcast(
                        this,
                        id.hashCode(),
                        new Intent(this, ReminderReceiver.class),
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        AlarmManager alarmManager = (AlarmManager) getSystemService("alarm");
        if (alarmManager != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Picker results
    // ---------------------------------------------------------------------------------------------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (resultCode != RESULT_OK || data == null) {
            return;
        }
        Uri uri = data.getData();
        if (uri == null) {
            return;
        }

        if (requestCode == REQ_DOCUMENT) {
            takePersistablePermission(uri, data);

            String base64 = readBase64FromUri(uri);
            if (base64 == null) {
                Toast.makeText(this, "Could not read this document", Toast.LENGTH_LONG).show();
                return;
            }

            String mime = getContentResolver().getType(uri);
            if (mime == null) {
                mime = "application/octet-stream";
            }
            String name = uri.getLastPathSegment();
            if (name == null) {
                name = "document";
            }

            evaluateJs(
                    "window.onDocumentFileLoaded&&window.onDocumentFileLoaded("
                            + JSONObject.quote(name)
                            + ","
                            + JSONObject.quote(mime)
                            + ","
                            + JSONObject.quote(base64)
                            + ");");
            Toast.makeText(this, "Document loaded", Toast.LENGTH_SHORT).show();
            return;
        }

        if (requestCode == REQ_BACKUP) {
            takePersistablePermission(uri, data);

            prefs().edit().putString(KEY_BACKUP, uri.toString()).apply();
            evaluateJs("window.onBackupFileConnected&&window.onBackupFileConnected();");
            Toast.makeText(this, "Google Drive backup folder connected", Toast.LENGTH_SHORT).show();
            return;
        }

        if (requestCode == REQ_OPEN) {
            String json = readTextFromUri(uri);
            if (json == null) {
                Toast.makeText(this, "Could not read this backup file", Toast.LENGTH_LONG).show();
                return;
            }
            evaluateJs(
                    "window.onBackupFileLoaded&&window.onBackupFileLoaded("
                            + JSONObject.quote(json)
                            + ");");
            Toast.makeText(this, "Backup file loaded", Toast.LENGTH_SHORT).show();
            return;
        }

        if (requestCode == REQ_SAVE) {
            if (pendingContent == null) {
                return;
            }
            if (writeTextToUri(uri, pendingContent)) {
                Toast.makeText(this, "File saved", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Could not save the file", Toast.LENGTH_LONG).show();
            }
        } else if (requestCode == REQ_SAVE_BINARY) {
            if (pendingContent == null) {
                return;
            }
            if (writeBase64ToUri(uri, pendingContent)) {
                Toast.makeText(this, "Document saved", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Could not save the document", Toast.LENGTH_LONG).show();
            }
        } else {
            return;
        }

        pendingContent = null;
        pendingFilename = null;
        pendingMime = null;
    }

    private void takePersistablePermission(Uri uri, Intent data) {
        try {
            getContentResolver()
                    .takePersistableUriPermission(
                            uri,
                            data.getFlags()
                                    & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                                            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
        } catch (Exception e) {
            // The provider does not offer a persistable grant; the one-shot grant still works.
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Content URI helpers
    // ---------------------------------------------------------------------------------------------

    private String readTextFromUri(Uri uri) {
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) {
                return null;
            }
            Scanner scanner = new Scanner(in, "UTF-8");
            scanner.useDelimiter("\\A");
            String text = scanner.hasNext() ? scanner.next() : "";
            scanner.close();
            return text;
        } catch (Exception e) {
            return null;
        }
    }

    private String readBase64FromUri(Uri uri) {
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) {
                return null;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = in.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            in.close();
            return Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean writeTextToUri(Uri uri, String text) {
        try {
            OutputStream out = getContentResolver().openOutputStream(uri, "wt");
            if (out == null) {
                return false;
            }
            out.write(text.getBytes("UTF-8"));
            out.flush();
            out.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean writeBase64ToUri(Uri uri, String base64) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.NO_WRAP);
            OutputStream out = getContentResolver().openOutputStream(uri, "wt");
            if (out == null) {
                return false;
            }
            out.write(bytes);
            out.flush();
            out.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}

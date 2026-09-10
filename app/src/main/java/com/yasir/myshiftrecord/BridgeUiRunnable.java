package com.yasir.myshiftrecord;

/**
 * Marshals one {@code AndroidBridge} call onto the UI thread.
 *
 * <p>{@code @JavascriptInterface} methods are invoked on the WebView's JavaScript thread, so
 * anything that starts an activity or touches the WebView has to be posted with
 * {@code runOnUiThread}. Rather than a lambda per call site, each bridge method builds one of these
 * with an action constant and up to three string arguments.
 */
public final class BridgeUiRunnable implements Runnable {

    public static final int CONNECT_BACKUP = 1;
    public static final int SAVE_FILE = 2;
    public static final int SAVE_BINARY_FILE = 3;
    public static final int OPEN_BACKUP = 4;
    public static final int PICK_DOCUMENT = 5;
    public static final int OPEN_URL = 6;
    public static final int PRINT_PAGE = 7;
    public static final int REQUEST_LOCATION = 8;
    public static final int REQUEST_NOTIFICATION_PERMISSION = 9;
    public static final int DISCONNECT_BACKUP = 10;

    private final MainActivity activity;
    private final int action;
    private final String arg1;
    private final String arg2;
    private final String arg3;

    public BridgeUiRunnable(MainActivity activity, int action, String arg1, String arg2, String arg3) {
        this.activity = activity;
        this.action = action;
        this.arg1 = arg1;
        this.arg2 = arg2;
        this.arg3 = arg3;
    }

    @Override
    public void run() {
        switch (action) {
            case CONNECT_BACKUP:
                activity.connectBackup();
                break;
            case SAVE_FILE:
                activity.beginSaveFile(arg1, arg2, arg3);
                break;
            case SAVE_BINARY_FILE:
                activity.beginSaveBinaryFile(arg1, arg2, arg3);
                break;
            case OPEN_BACKUP:
                activity.openBackup();
                break;
            case PICK_DOCUMENT:
                activity.openDocument();
                break;
            case OPEN_URL:
                activity.openUrl(arg1);
                break;
            case PRINT_PAGE:
                activity.printPage();
                break;
            case REQUEST_LOCATION:
                activity.ensureLocationPermission();
                break;
            case REQUEST_NOTIFICATION_PERMISSION:
                activity.requestNotificationPermission();
                break;
            case DISCONNECT_BACKUP:
                activity.disconnectBackup();
                break;
            default:
                break;
        }
    }
}

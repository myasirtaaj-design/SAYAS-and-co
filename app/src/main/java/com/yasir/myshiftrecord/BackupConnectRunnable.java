package com.yasir.myshiftrecord;

/**
 * Posts {@link MainActivity#connectBackup()} onto the UI thread.
 *
 * <p>Equivalent to {@code BridgeUiRunnable} with {@link BridgeUiRunnable#CONNECT_BACKUP}; kept as a
 * separate type because {@code AndroidBridge.connectBackup()} is the one bridge call that uses it.
 */
public final class BackupConnectRunnable implements Runnable {

    private final MainActivity activity;

    public BackupConnectRunnable(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public void run() {
        activity.connectBackup();
    }
}

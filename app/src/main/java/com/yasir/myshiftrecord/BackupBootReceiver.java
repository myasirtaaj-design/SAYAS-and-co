package com.yasir.myshiftrecord;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * Re-arms the auto-backup alarm after a reboot, since alarms do not survive one.
 *
 * <p>Only runs if a backup folder is still connected. A missed deadline is rescheduled 15 minutes
 * out rather than fired immediately, to stay off the boot critical path.
 */
public class BackupBootReceiver extends BroadcastReceiver {

    private static final String PREFS = "msr_native";
    private static final long GRACE_MILLIS = 900000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
        if (prefs.getString("backup_uri", null) == null) {
            return;
        }

        String days = prefs.getString("backup_days", "1");
        long now = System.currentTimeMillis();
        long triggerAtMillis = prefs.getLong("next_auto_backup", 0L);
        if (triggerAtMillis <= now) {
            triggerAtMillis = now + GRACE_MILLIS;
        }

        Intent next = new Intent(context, ReminderReceiver.class);
        next.putExtra("id", "backup_auto");
        next.putExtra("title", "AUTO_BACKUP");
        next.putExtra("message", days);

        PendingIntent pendingIntent =
                PendingIntent.getBroadcast(
                        context,
                        "backup_auto".hashCode(),
                        next,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        AlarmManager alarmManager = (AlarmManager) context.getSystemService("alarm");
        if (alarmManager != null) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        }
    }
}

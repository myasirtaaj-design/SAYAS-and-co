package com.yasir.myshiftrecord;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;

import com.yasir.myshiftrecord.plus.R;

import java.io.FileInputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Handles every alarm the app schedules.
 *
 * <p>Two kinds arrive here, distinguished by the {@code id} extra:
 * <ul>
 *   <li>{@code backup_auto} — copy the staged backup into the connected folder and re-arm the next
 *       run. The {@code message} extra carries the interval in days, not text.</li>
 *   <li>anything else — post a reminder notification with the {@code title} / {@code message}
 *       extras.</li>
 * </ul>
 */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String PREFS = "msr_native";
    private static final String CHANNEL_ID = "msr_reminders";
    private static final long MILLIS_PER_DAY = 86400000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if ("backup_auto".equals(intent.getStringExtra("id"))) {
            performAutoBackup(context, intent);
            return;
        }

        NotificationManager notificationManager =
                (NotificationManager) context.getSystemService("notification");
        if (notificationManager == null) {
            return;
        }

        NotificationChannel channel =
                new NotificationChannel(
                        CHANNEL_ID, "Shift and payment reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Scheduled shifts, salary promises and personal payment due dates");
        notificationManager.createNotificationChannel(channel);

        String title = intent.getStringExtra("title");
        if (title == null) {
            title = "Job Buddy reminder";
        }
        String message = intent.getStringExtra("message");
        if (message == null) {
            message = "Open Job Buddy for details";
        }

        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        Notification notification =
                new Notification.Builder(context, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_launcher)
                        .setContentTitle(title)
                        .setContentText(message)
                        .setAutoCancel(true)
                        .setContentIntent(
                                PendingIntent.getActivity(
                                        context,
                                        0,
                                        launch,
                                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
                        .setPriority(Notification.PRIORITY_HIGH)
                        .build();

        String id = intent.getStringExtra("id");
        notificationManager.notify(id != null ? id.hashCode() : 19795, notification);
    }

    /**
     * Copies {@code latest_full_backup.json} — staged by
     * {@link MainActivity#stageBackup(String)} — into the connected backup folder as a new
     * timestamped document. Failures are swallowed so the next run is always re-armed.
     */
    private void performAutoBackup(Context context, Intent intent) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
            String treeUri = prefs.getString("backup_uri", null);
            if (treeUri != null) {
                FileInputStream in = context.openFileInput("latest_full_backup.json");
                byte[] payload = in.readAllBytes();
                in.close();

                if (payload != null) {
                    Uri tree = Uri.parse(treeUri);
                    Uri parent =
                            DocumentsContract.buildDocumentUriUsingTree(
                                    tree, DocumentsContract.getTreeDocumentId(tree));
                    String filename =
                            "Job_Buddy_Full_Backup_"
                                    + new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.UK).format(new Date())
                                    + ".json";

                    ContentResolver resolver = context.getContentResolver();
                    Uri document =
                            DocumentsContract.createDocument(resolver, parent, "application/json", filename);
                    if (document != null) {
                        OutputStream out = resolver.openOutputStream(document, "wt");
                        if (out != null) {
                            out.write(payload);
                            out.flush();
                            out.close();
                            prefs.edit()
                                    .putLong("last_auto_backup", System.currentTimeMillis())
                                    .apply();
                        }
                    }
                }
            }
        } catch (Exception e) {
            // Folder revoked, nothing staged yet, or the write failed — try again next interval.
        }

        scheduleNextBackup(context, intent);
    }

    /** Re-arms the auto-backup alarm using the interval carried in the {@code message} extra. */
    private void scheduleNextBackup(Context context, Intent intent) {
        String raw = intent.getStringExtra("message");
        int days = 1;
        if (raw != null) {
            try {
                days = Integer.parseInt(raw);
            } catch (Exception e) {
                days = 1;
            }
        }
        if (days < 1) {
            days = 1;
        }

        long triggerAtMillis = System.currentTimeMillis() + (days * MILLIS_PER_DAY);

        Intent next = new Intent(context, ReminderReceiver.class);
        next.putExtra("id", "backup_auto");
        next.putExtra("title", "AUTO_BACKUP");
        next.putExtra("message", String.valueOf(days));

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

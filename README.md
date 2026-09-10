# Job Buddy — recovered source

Android source for **Job Buddy 4.8** (`com.yasir.myshiftrecord.plus`, versionCode 14), a shift,
wage and payment tracker for shift workers.

This tree was recovered from the shipped `JobBuddyv4.8.apk` — there was no original source to hand.
See [How this was recovered](#how-this-was-recovered) for exactly what is original and what was
reconstructed, and [Build](#build) to build it.

## Architecture

Job Buddy is a hybrid app. Effectively all of the product lives in a local web app under
`app/src/main/assets/`, loaded into a single `WebView` from `file:///android_asset/index.html`.
The Java layer is ~700 lines whose entire job is to hand the web layer the things a `file://` page
cannot do for itself.

```
MainActivity (WebView host)
  └── addJavascriptInterface(Bridge, "AndroidBridge")
        │
   JS ──┤ AndroidBridge.<method>()          native → JS: webView.evaluateJavascript(...)
        │   file pickers, alarms,                        window.on*() callbacks
        │   notifications, printing,
        │   location permission
        ▼
  ReminderReceiver ← AlarmManager → BackupBootReceiver (re-arms after reboot)
```

### Java layer (`app/src/main/java/com/yasir/myshiftrecord/`)

| File | Role |
| --- | --- |
| `MainActivity.java` | The only activity. Configures the `WebView`, exposes the `AndroidBridge` JS interface, and handles every Storage Access Framework picker result. |
| `ReminderReceiver.java` | Handles all alarms. `id == "backup_auto"` runs the auto-backup and re-arms itself; any other id posts a reminder notification. |
| `BackupBootReceiver.java` | Re-arms the auto-backup alarm on `BOOT_COMPLETED`, since alarms do not survive a reboot. |
| `BridgeUiRunnable.java` | Marshals a bridge call onto the UI thread. `@JavascriptInterface` methods run on the WebView's JS thread, so anything that starts an activity has to be posted. |
| `BackupConnectRunnable.java` | The same, for `connectBackup()`. |

### The `AndroidBridge` JS interface

Everything the web layer calls, as exposed by `MainActivity.Bridge`. JS feature-detects the bridge
with `typeof AndroidBridge !== 'undefined'` (`native()` in `app.js`) and falls back to browser
behaviour when it is absent.

| Bridge call | Effect | JS callback |
| --- | --- | --- |
| `backup(json)` | Stages the payload, then writes a timestamped `Job_Buddy_Full_Backup_*.json` into the connected folder. Returns success. | — |
| `stageBackup(json)` | Writes the payload to app-private `latest_full_backup.json` so the receiver can copy it out with no activity alive. | — |
| `connectBackup()` | `ACTION_OPEN_DOCUMENT_TREE` picker for the backup folder (in practice a Google Drive folder). | `onBackupFileConnected()` |
| `disconnectBackup()` / `isBackupConnected()` / `getLastAutoBackup()` | Backup folder state. | — |
| `openBackup()` | Picks a backup file to restore. | `onBackupFileLoaded(json)` |
| `saveFile(name, mime, text)` | `ACTION_CREATE_DOCUMENT`, writes text. | — |
| `saveBinaryFile(name, mime, base64)` | The same, base64-decoded. | — |
| `pickDocument()` | Picks a PDF or image for the in-page OCR pipeline. | `onDocumentFileLoaded(name, mime, base64)` |
| `openUrl(url)` | `ACTION_VIEW` — used for the WhatsApp follow-up links. | — |
| `printPage()` | Prints the WebView through `PrintManager` (timesheets, CV). | — |
| `requestLocation()` | Ensures a location permission, then hands off to WebView geolocation. | `beginBrowserLocation()` / `onLocationPermissionDenied()` |
| `hasNotificationPermission()` / `requestNotificationPermission()` | `POST_NOTIFICATIONS` on API 33+. | `onNotificationPermissionResult(granted)` |
| `scheduleReminder(id, atMillis, title, message)` | One-shot `setAndAllowWhileIdle` alarm keyed by `id.hashCode()`. | — |
| `cancelReminder(id)` | Cancels it. | — |

Every native → JS call is written `window.onFoo&&window.onFoo(...)`, so a callback the current asset
layer does not define is a no-op rather than an error.

Two details worth knowing before changing the bridge:

- **`scheduleReminder` overloads its arguments for one id.** For `id == "backup_auto"`, `message`
  carries the backup interval *in days* rather than notification text, and the call also persists
  `backup_days` / `next_auto_backup` so `BackupBootReceiver` can rebuild the alarm after a reboot.
- **`Bridge` is reached reflectively from JavaScript.** Release builds do not run R8, but if that is
  ever switched on its methods need keeping — `app/proguard-rules.pro` already has the rule.

### Web layer (`app/src/main/assets/`)

`index.html` is the whole UI: a `<style>` block plus ten `<section class="page">` panels
(dashboard, history, employers, timesheet, money, more, profile, documents, CV, settings) switched
by a bottom `<nav>`. It contains no inline script.

The JavaScript is **append-only patch layers**, loaded in the order below. Each later file
redefines functions from earlier ones rather than editing them in place, so the load order in
`index.html` is significant and the last definition wins.

| Asset | Contents |
| --- | --- |
| `app.js` | The v1–v3 core (~190 functions): clock in/out, shifts, employers and sites, payroll, debts, timesheet, backup bundle. |
| `app-v4.js` | Documents and CV addresses; the IndexedDB document store (`MyShiftRecordDocumentsV4`). |
| `app-v4.1.js` | On-device document reading — Tesseract OCR and PDF.js — plus document-type, date and reference detection, and expiry confirmation. |
| `app-v4.2.js` | Glass UI and the saved-CV workflow, including CV-to-job relevance matching. |
| `app-v4.3.js` | Shift reminders and complete dated Drive backups. |
| `app-v4.6.js` | The sectioned home dashboard. |
| `app-v4.7.js` | Repaired Android exports, flexible employer pay, WhatsApp payment follow-ups, reliable Drive backup setup. |

Stylesheets load as `app-v4.2.css`, `app-v4.3.css`, `app-v4.6.css`, `app-v4.7.css`, cascading the
same way.

`app-v4.4.js` and `app-v4.4.css` are **present in `assets/` but not referenced by `index.html`** —
that dashboard attempt was superseded by `app-v4.6`. They are kept as shipped; they are dead
weight, and deleting them is safe. Note also that the `/* Job Buddy v4.5 */` header comments in
`app-v4.1.js` through `app-v4.4.js` do not match their filenames: the v4.5 release went out as
edits to the existing patch files rather than a new `app-v4.5.js`.

Bundled third-party libraries, all vendored as shipped and credited in
`assets/THIRD_PARTY_NOTICES.txt`: Tesseract.js 5.1.1 with `tesseract-core-lstm.wasm.js` and
`tessdata/eng.traineddata.gz`, PDF.js 3.11.174 (`pdf.min.js` + `pdf.worker.min.js`),
`pdf-lib.min.js` and `jszip.min.js`. All are Apache-2.0.

### Known hazards in the shipped code

These are all present in the shipped 4.8 app and were left exactly as they are — recording them
here rather than fixing them, because they change behaviour and that is a call for the app's owner.

**`app.js` contains a superseded copy of the money subsystem.** Twenty-six top-level functions are
declared twice in that one file, and for twenty-three of them the two copies *differ* — the pair
around lines 102–189 is an earlier revision of the pair around lines 205–300:

```
allSalaryMonths      allSalaryRemaining   applyRestore        applyTimesheetMonth
closePayrollModal    csvContent           earnedFor           getPayroll
normaliseBackupBundle openPayroll         openPayrollDetail   payrollCard
receivedFor          renderMoney          renderReceivedReport renderTimesheet
saveEmployerSummaryCsv savePayrollAction  setPayrollModalMode syncAllReminders
timesheetFilename    timesheetShifts      upcomingReminderItems
```

(`dataBundle`, `remainingFor` and `salaryStatus` are also duplicated, but identically.)

Function declarations hoist, so **the later declaration always wins** and the first copy of each is
dead. This is a live trap for anyone maintaining the file: editing `renderMoney` at line 122 has no
effect whatsoever. Always check for a second declaration before changing anything in `app.js`. The
dead copies cannot simply be cut as a block, because live single-definition functions are
interleaved with them.

**The patch layers redefine, they never edit.** The same trap applies across files: `app-v4.7.js`
overrides things defined in `app.js`. When tracing behaviour, read the load order in `index.html`
backwards — last definition wins.

**`dataBundle()` in `app.js` reports `version: '4.5'`.** `app-v4.3.js` wraps it and overrides the
field to `'4.8'`, so exports are stamped correctly; the stale literal is only reachable if that
layer ever stops loading.

**Two `BridgeUiRunnable` actions are unreachable.** `CONNECT_BACKUP` (1) is dead because
`Bridge.connectBackup()` posts a `BackupConnectRunnable` instead, and `DISCONNECT_BACKUP` (10) is
dead because `Bridge.disconnectBackup()` calls the activity directly. Both are kept so the action
numbering matches the shipped build.

### Storage

All app data is browser-side; nothing is sent to a server. `localStorage` keys, from `K` at the top
of `app.js`:

```
msr_shifts_v1   msr_profile_v1   msr_active_v1     msr_settings_v1
msr_employers_v2   msr_payrolls_v3   msr_scheduled_v3   msr_debts_v3
```

#### Record shapes

| Store | Shape |
| --- | --- |
| `employers` | `{id, name, defaultRate, payBasis, payDay, payOffset, payrollRef, phone, notes, sites[]}`. Sites nest inside the employer: `{id, name, address, rateOverride, latitude, longitude, accuracy, capturedAt}`, where a non-null `rateOverride` beats `defaultRate` (`rateFor()`). |
| `shifts` | Completed work: `{id, date, start, end, endDate, employerId, siteId, role, breakMin, grossMinutes, paidMinutes, rate, additional, deduction, total, earnedMonth, notes, method}`. |
| `scheduled` | Planned work: the same fields plus `reminderMinutes` and `status: planned \| started \| completed`. |
| `payrolls` | One row per employer × month: `{id, employerId, earnedMonth, receipts[], promises[], adjustments[], notes}`. A receipt is `{id, amount, date, note, createdAt}`; a promise is the same plus `fulfilled` and an optional `endDate` for a promised range. |
| `debts` | Personal lending: `{id, person, direction: owed_to_me \| i_owe, title, amount, dueDate, payments[], notes, status: open \| settled, createdAt}`. |
| `profile`, `settings`, `active` | The user, preferences (`role`, `defaultEmployerId`), and the currently-running clock (`null` when not clocked in). |

Two conventions matter when working with this data:

- **`earnedMonth` is the pivot, not `date`.** A shift is filed under the month it was *earned*, and
  `payrolls` is keyed the same way, so `(employerId, earnedMonth)` is what joins work to money.
  From there `expectedPayDate()` derives the due date from `payOffset` and `payDay` (clamped to the
  target month's length), and `receipts` / `promises` record what actually arrived.
- **`shifts` and `scheduled` denormalise their employer.** They carry `employerName`, `location`,
  `siteAddress` and the site's coordinates alongside the ids, so a historical record still reads
  correctly after an employer or site is renamed or deleted. `employerName()` prefers the stored
  copy and falls back to a live lookup.

The duplicate declarations described above left a schema migration behind in real user data:
`getPayroll` at line 102 creates payroll rows *without* `adjustments`, the live one at line 205
creates them *with* it, and the live one repairs old rows on read
(`if(p&&!Array.isArray(p.adjustments))p.adjustments=[]`). Keep that guard.

Document *files* live in IndexedDB (`MyShiftRecordDocumentsV4`) rather than `localStorage`.
Native-side state is the `msr_native` `SharedPreferences` file (`backup_uri`, `backup_days`,
`next_auto_backup`, `last_auto_backup`) plus the app-private `latest_full_backup.json`.

Because the store is per-WebView, **clearing the app's data loses everything** — which is what the
Drive backup folder is for.

## Build

Needs JDK 17 and an Android SDK with platform 35 and build-tools 35.0.0.

```sh
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew :app:assembleDebug        # app/build/outputs/apk/debug/
./gradlew :app:assembleRelease      # unsigned; add a signingConfig to ship
```

There are **no third-party dependencies** — the Java touches only the Android framework and
`org.json`, which the platform provides.

### One build quirk: `eng.traineddata.gz`

AGP's asset merger expands any `assets/**/*.gz` and drops the `.gz` suffix
(`MergedAssetWriter.shouldBeUnGzipped`), and there is no flag to turn that off. Tesseract.js asks
for `tessdata/eng.traineddata.gz` under exactly that name — `langPath` in `app-v4.1.js` plus its
default `gzip: true` — so a stock build ships the traineddata under a name the OCR worker never
requests and document scanning fails at runtime.

`app/build.gradle` therefore restores the pristine file after the merge, and disables the build
cache for that task so a cache hit cannot reinstate the broken state. The alternative — shipping
the traineddata uncompressed and passing `gzip: false` in `app-v4.1.js` — would change the app's
own assets, so it was left alone.

## How this was recovered

Recovered from `JobBuddyv4.8.apk` with `jadx` 1.5.1 (code) and `apktool` 2.11.1 (manifest and
resources). Fidelity, layer by layer:

- **`app/src/main/assets/` — original, byte-for-byte.** The web app was never compiled or
  minified by the build; it ships as authored. All 23 asset files in a rebuilt APK are
  byte-identical to the originals (verified by SHA-256).
- **`app/src/main/java/` — decompiled and cleaned.** Logic is unchanged, and constants the
  decompiler had inlined as bare integers were restored to their named forms (`Intent` flag sets,
  `PendingIntent.FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE`, `AlarmManager.RTC_WAKEUP`,
  `Base64.NO_WRAP`, `Toast` durations, `Notification.PRIORITY_HIGH`). Local variable and parameter
  names are **not** original — decompiled Java carries only types, so they were renamed from `str`,
  `i` and `j` to something readable. Comments are new. Class, method, and field names *are*
  original, as are the resource and preference key strings.
- **`AndroidManifest.xml` — reconstructed** to declare the same components, permissions and
  attributes as the shipped manifest. `android:label` now points at `@string/app_name` rather than
  a hardcoded `"Job Buddy"`, and the stale `compileSdkVersion="33"` and `debuggable="false"`
  attributes are dropped (the build sets both).
- **`res/` — only `ic_launcher`.** Every other resource in the APK belonged to a library or to the
  template described below. `values/strings.xml` is new, holding `app_name`.
- **Gradle files — new.** The APK was not built by Gradle (see below), so there was nothing to
  recover.

A rebuild from this tree matches the shipped APK on package name, `versionCode` 14,
`versionName` 4.8, `minSdk` 26, `targetSdk` 35, components, permissions, and assets.

### The shipped APK was repackaged over Appium Settings

Worth knowing, because it explains a lot of otherwise baffling detail in the APK.

`JobBuddyv4.8.apk` was not built from a normal Android project. It was assembled by grafting the
Job Buddy code and assets onto a copy of the **Appium Settings** APK. The evidence:

- `classes.dex`–`classes9.dex` contain all of `io.appium.settings` (42 classes) and its dependency
  tree — Kotlin stdlib, kotlinx-coroutines, `androidx.{core,activity,fragment,lifecycle,...}`,
  play-services-location/base/basement/tasks, and Apache Commons Lang 3. **3,713 classes, of which
  6 are Job Buddy's.**
- `res/values/strings.xml` in the APK defines `app_name` as `"Appium Settings"`, alongside Appium's
  `layout/main.xml` and `layout/custom_dialog.xml`.
- The Java is plain hand-written Java compiled without R8 — hence real class names like
  `BridgeUiRunnable` where a Gradle build would have left synthetic lambda classes.

None of that payload is reachable: the manifest declares only `MainActivity` and the two
receivers. It is inert, but it is also ~2.4 MB of someone else's code, and it is why the APK
declared libraries the app never calls.

**This tree does not carry any of it.** It builds only the real app, with zero dependencies, and
the resulting release APK is 5.2 MB against the shipped 7.6 MB — the assets, which are the actual
product, are unchanged.

One consequence to be aware of when comparing: the shipped APK is signed (`META-INF/JOBBUDDY.RSA`)
with a keystore that is not in this repo. `assembleRelease` here produces an unsigned APK, and
signing it with a different key means it **cannot** install as an update over an existing Job Buddy
install. Recover the original keystore before shipping an update from this tree.

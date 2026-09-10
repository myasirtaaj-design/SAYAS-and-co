# Release builds do not run R8 (see app/build.gradle). If it is ever switched on, the WebView
# bridge has to survive shrinking: its methods are only ever reached reflectively from JavaScript.
-keepclassmembers class com.yasir.myshiftrecord.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}

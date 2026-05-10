# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# react-native-audio-record
-keep class com.goodatlas.audiorecord.** { *; }

# cactus-react-native (AI engine)
-keep class com.cactus.** { *; }
-keep class com.facebook.react.bridge.NativeModule { *; }
-keep class com.facebook.react.bridge.ReactContextBaseJavaModule { *; }

# react-native-tts
-keep class net.no_mad.tts.** { *; }

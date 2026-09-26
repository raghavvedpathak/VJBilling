# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.** { *; }
-keep class expo.modules.sqlite.** { *; }

# react-native-mmkv (JSI native bindings)
-keep class com.tencent.mmkv.** { *; }
-keep class com.reactnativemmkv.** { *; }

# react-native-nitro-modules & react-native-quick-crypto (Nitro JSI)
-keep class com.margelo.nitro.** { *; }
-keep class com.quickcrypto.** { *; }

# react-native-screens
-keep class com.swmansion.rnscreens.** { *; }

# react-native-svg
-keep class com.horcrux.svg.** { *; }

# Expo Native Modules
-keep class expo.modules.** { *; }
-keepclassmembers class * extends expo.modules.kotlin.modules.Module { *; }

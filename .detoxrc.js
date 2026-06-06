// .detoxrc.js
/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 300000,
    },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      package: 'com.vjbilling.app',
    },
  },
  devices: {
    attached: {
      type: 'android.attached',
      device: {
        // ✅ Matches any connected device — no more serial changes breaking tests
        adbName: '.*',
      },
    },
  },
  configurations: {
    'android.real': {
      device: 'attached',
      app: 'android.debug',
    },
  },
};
# Gemma 4 Mobile

A small React Native Android app that runs the Cactus `gemma-4-e2b-it` model locally for text-only prompts.

## What It Does

- Shows a **Download model** button when the app opens.
- Downloads `gemma-4-e2b-it` with progress through `cactus-react-native`.
- Enables a text prompt after the model is available on the device.
- Generates local text responses with telemetry disabled for the request.
- Targets Android 10 and newer with `minSdkVersion = 29`.

## Run On Android

```sh
npm install
npm run android
```

For a direct debug build:

```sh
cd android
.\gradlew.bat assembleDebug
```

The app package is `com.gemma4mobile`, and the displayed app name is **Gemma 4 Mobile**.

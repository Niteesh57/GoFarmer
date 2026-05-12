# GoFarmer

A multilingual React Native Android application designed to empower farmers with automated RAG-based insights, multimodal crop diagnostics, and real-time guidance. Powered by local, on-device execution of the **Gemma 4** (`gemma-4-e2b-it`) LLM to ensure seamless operation even without internet connectivity.

## What It Does

The application downloads the optimized **Gemma 4** model directly to the user's mobile device. Utilizing the **Cactus** execution framework, it runs the model natively on-device combined with **Retrieval-Augmented Generation (RAG)**, dynamic **tool calling**, and multimodal interaction supporting **text, voice audio, and images** seamlessly.

## Core Features

- **On-Device AI Inference**: Downloads and runs the `gemma-4-e2b-it` model locally with complete offline capability and built-in hardware RAM safeguards.
- **Multimodal AI Eye**: Scans plant imagery to identify crop stress, leaf symptoms, and disease severity in real time.
- **Voice-First AI Consultant**: Provides direct audio-based interaction where farmers can speak questions and receive agricultural guidance voiced back in their chosen regional language.
- **Global Localization**: Fully localized across 10 distinct language interfaces (`en`, `hi`, `es`, `fr`, `zh`, `ja`, `te`, `kn`, `sv`, `de`) with automated offline model readiness setups.
- **Privacy & Telemetry**: Generates tailored management plans locally with all server logging/telemetry strictly disabled during consultation sessions.

## Technology & Library Stack

- **Framework**: [React Native](https://reactnative.dev/) v0.81.1
- **LLM Engine**: `cactus-react-native` v1.13.1 for high-performance mobile edge execution.
- **Voice & Audio Processing**: `react-native-audio-record` for raw PCM mic capture and `react-native-tts` for text-to-speech feedback loops.
- **Vision & Scanning**: `react-native-camera-kit` combined with `@bam.tech/react-native-image-resizer` for hardware-optimized multimodal preprocessing.
- **State & i18n**: `i18next` / `react-i18next` for complete dictionary mapping, and `@react-native-async-storage/async-storage` for persistent model-brain caching.

## Android Build Target Specifications

The application targets modern Android architectural standards to optimize edge acceleration:
- **Compile SDK**: `36`
- **Target SDK**: `35`
- **Minimum SDK**: `29` (Android 10+)
- **React Native Engine**: New Architecture enabled with Nitro Modules support.

## Run On Android

```sh
npm install
npm run android
```

For a direct production debug build using Gradle:

```sh
cd android
.\gradlew.bat assembleDebug
```

The application package identifier is `com.gemma4mobile`, and the user-facing display branding is **GoFarmer**.

## 📄 License

This project is open-source and licensed under the **MIT License**. See the [LICENSE](LICENSE) file for more details.

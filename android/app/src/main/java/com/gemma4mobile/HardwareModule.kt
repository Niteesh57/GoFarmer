package com.gemma4mobile

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import java.io.File
import java.io.InputStream
import java.util.Scanner

class HardwareModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "HardwareModule"
    }

    @ReactMethod
    fun getHardwareSpecs(promise: Promise) {
        try {
            val map = com.facebook.react.bridge.Arguments.createMap()
            
            // 1. CPU Cores
            val cores = Runtime.getRuntime().availableProcessors()
            map.putInt("cpuCores", cores)
            
            // 2. Chipset (Inferred from Build or Hardware)
            val hardware = Build.HARDWARE
            val board = Build.BOARD
            val model = Build.MODEL
            map.putString("hardware", hardware)
            map.putString("board", board)
            
            // Try to get a cleaner processor name from /proc/cpuinfo
            var processorName = "Unknown"
            try {
                val f = File("/proc/cpuinfo")
                if (f.exists()) {
                    val scanner = Scanner(f)
                    while (scanner.hasNextLine()) {
                        val line = scanner.nextLine()
                        if (line.contains("Hardware") || line.contains("model name")) {
                            processorName = line.split(":")[1].trim()
                            break
                        }
                    }
                }
            } catch (e: Exception) {}
            
            if (processorName == "Unknown") {
                processorName = hardware
            }
            map.putString("processorName", processorName)

            // 3. GPU (Note: Getting actual GL_RENDERER requires an EGL context, 
            // which is complex to do off-thread. We can return a generic GPU info for now 
            // or use a simpler check if we have a way to query it.)
            // For now, let's just use the board to infer it better in JS, 
            // but we can try to get it if we really want to.
            
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("Error", e.message)
        }
    }
}

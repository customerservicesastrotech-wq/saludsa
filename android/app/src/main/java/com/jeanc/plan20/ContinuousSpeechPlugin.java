package com.jeanc.plan20;

import android.Manifest;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * Dictado continuo: el micrófono sigue activo aunque la persona se quede callada,
 * hasta que llame a stop(). Nunca envía nada por sí mismo: solo entrega texto a la app.
 *
 * Modo "continuous" (Android 13+ con reconocedor en el dispositivo): una sesión segmentada
 * que no termina con los silencios; el texto llega por segmentos.
 * Modo "restart" (respaldo): el reconocedor estándar se reinicia al instante tras cada silencio,
 * sin intervención y con los sonidos del sistema silenciados mientras dura el dictado.
 * La pantalla se mantiene encendida mientras se dicta (si se apaga, Android corta el micrófono).
 */
@CapacitorPlugin(name = "ContinuousSpeech", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") })
public class ContinuousSpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer rec;
    private boolean active = false;
    private boolean onDevice = false;
    private String[] langs = new String[] { "es-CO", "es-US", "es-ES" };
    private int langIdx = 0;
    private int fails = 0;
    private boolean muted = false;
    private boolean downloadAsked = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("standard", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("onDevice", Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "permCallback");
            return;
        }
        doStart(call);
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) doStart(call);
        else call.reject("Necesito permiso de micrófono para escucharte.", "PERMISSION");
    }

    private void doStart(PluginCall call) {
        String lang = call.getString("language", "es-CO");
        langs = new String[] { lang, "es-US", "es-ES" };
        langIdx = 0;
        final boolean preferOnDevice = call.getBoolean("onDevice", true);
        main.post(() -> {
            if (active) stopInternal("restart");
            active = true;
            fails = 0;
            onDevice = preferOnDevice && Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
            try { getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } catch (Exception ignored) {}
            if (!onDevice) mute(true);
            listen();
            JSObject r = new JSObject();
            r.put("mode", onDevice ? "continuous" : "restart");
            call.resolve(r);
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> { stopInternal("user"); call.resolve(); });
    }

    private Intent buildIntent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, langs[Math.min(langIdx, langs.length - 1)]);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        if (onDevice && Build.VERSION.SDK_INT >= 33) {
            // Sesión segmentada: dura el tiempo mínimo indicado (6 h) y no se corta por silencios.
            i.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 6L * 3600L * 1000L);
            i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        } else {
            // Respaldo: pedir silencios largos (algunos reconocedores lo ignoran; por eso se reinicia solo).
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 60000L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 60000L);
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 60000L);
        }
        return i;
    }

    private void listen() {
        if (!active) return;
        try {
            if (rec == null) {
                rec = (onDevice && Build.VERSION.SDK_INT >= 31) ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext()) : SpeechRecognizer.createSpeechRecognizer(getContext());
                rec.setRecognitionListener(listener);
            }
            rec.startListening(buildIntent());
            state("listening", onDevice ? "continuous" : "restart");
        } catch (Exception e) {
            restart(true);
        }
    }

    private void restart(boolean recreate) {
        if (!active) return;
        fails++;
        if (fails > 60) { stopInternal("error"); err(-1, "El reconocimiento de voz se detuvo varias veces seguidas. Tu texto se conserva."); return; }
        if (recreate && rec != null) { try { rec.destroy(); } catch (Exception ignored) {} rec = null; }
        main.postDelayed(this::listen, Math.min(1500L, 60L + 80L * fails));
    }

    private void fallbackToStandard(String why) {
        onDevice = false;
        if (rec != null) { try { rec.destroy(); } catch (Exception ignored) {} rec = null; }
        mute(true);
        JSObject d = new JSObject(); d.put("mode", "restart"); d.put("reason", why);
        notifyListeners("mode", d);
        main.postDelayed(this::listen, 120);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int eventType, Bundle params) {}

        @Override public void onPartialResults(Bundle b) {
            String t = first(b);
            if (t != null) { JSObject d = new JSObject(); d.put("text", t); notifyListeners("partial", d); }
        }

        @Override public void onResults(Bundle b) { // fin de un tramo en modo estándar (o al detener)
            segment(first(b));
            if (active) { fails = 0; main.postDelayed(ContinuousSpeechPlugin.this::listen, 60); }
        }

        @Override public void onSegmentResults(Bundle b) { segment(first(b)); fails = 0; }

        @Override public void onEndOfSegmentedSession() { if (active) main.postDelayed(ContinuousSpeechPlugin.this::listen, 60); }

        @Override public void onError(int code) {
            if (!active) return;
            if (code == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) { stopInternal("error"); err(code, "Necesito permiso de micrófono para escucharte."); return; }
            if (onDevice && (code == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || code == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)) {
                if (langIdx < langs.length - 1) { langIdx++; restart(true); return; }
                if (Build.VERSION.SDK_INT >= 33 && !downloadAsked && rec != null) {
                    downloadAsked = true;
                    try { rec.triggerModelDownload(buildIntent()); } catch (Exception ignored) {}
                    JSObject d = new JSObject(); d.put("message", "Descargando el español para el dictado continuo. Mientras tanto uso el modo estándar."); notifyListeners("info", d);
                }
                langIdx = 0;
                fallbackToStandard("idioma");
                return;
            }
            if (onDevice && code == SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT) { fallbackToStandard("soporte"); return; }
            boolean recreate = code == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || code == SpeechRecognizer.ERROR_CLIENT || code == SpeechRecognizer.ERROR_SERVER_DISCONNECTED || code == SpeechRecognizer.ERROR_SERVER;
            restart(recreate); // silencio, "no te entendí", red, etc.: seguir escuchando
        }
    };

    private void segment(String t) {
        if (t == null || t.trim().isEmpty()) return;
        JSObject d = new JSObject(); d.put("text", t); notifyListeners("segment", d);
    }

    private static String first(Bundle b) {
        if (b == null) return null;
        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return (r != null && !r.isEmpty()) ? r.get(0) : null;
    }

    private void stopInternal(String reason) {
        boolean was = active;
        active = false;
        main.removeCallbacksAndMessages(null);
        final SpeechRecognizer r = rec;
        rec = null;
        if (r != null) {
            try { r.stopListening(); } catch (Exception ignored) {}
            main.postDelayed(() -> { try { r.destroy(); } catch (Exception ignored) {} }, 1500); // deja llegar el último texto
        }
        try { getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } catch (Exception ignored) {}
        mute(false);
        if (was) state("stopped", reason);
    }

    /** Silencia los sonidos del sistema mientras se dicta en modo de respaldo (evita el pitido en cada reinicio). */
    private void mute(boolean on) {
        if (on == muted) return;
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
            int[] streams = { AudioManager.STREAM_MUSIC, AudioManager.STREAM_SYSTEM };
            for (int s : streams) {
                try { am.adjustStreamVolume(s, on ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE, 0); } catch (Exception ignored) {}
            }
            muted = on;
        } catch (Exception ignored) {}
    }

    private void state(String status, String reason) {
        JSObject d = new JSObject(); d.put("status", status); if (reason != null) d.put("reason", reason);
        notifyListeners("state", d);
    }

    private void err(int code, String msg) {
        JSObject d = new JSObject(); d.put("code", code); d.put("message", msg);
        notifyListeners("error", d);
    }

    @Override
    protected void handleOnPause() { if (active) main.post(() -> stopInternal("background")); super.handleOnPause(); }

    @Override
    protected void handleOnDestroy() { stopInternal("destroy"); super.handleOnDestroy(); }
}

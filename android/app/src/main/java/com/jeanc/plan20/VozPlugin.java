package com.jeanc.plan20;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Voz de Brújula: lee en voz alta las respuestas del asistente con el motor de voz de Android.
 * Funciona sin internet si hay una voz en español instalada. Avisa a la app cuando termina de hablar
 * (evento "voz" con state=done) para que el modo manos libres vuelva a escuchar.
 */
@CapacitorPlugin(name = "Voz")
public class VozPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;
    private int seq = 0;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            if (ready) pickLocale(null);
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { emit("start", id); }
            @Override public void onDone(String id) { emit("done", id); }
            @Override public void onError(String id) { emit("done", id); }
        });
    }

    private void emit(String state, String id) {
        JSObject o = new JSObject();
        o.put("state", state);
        o.put("id", id);
        notifyListeners("voz", o);
    }

    private boolean pickLocale(String tag) {
        String[] tags = tag != null ? new String[] { tag, "es-US", "es-MX", "es-ES", "es" } : new String[] { "es-US", "es-MX", "es-ES", "es" };
        for (String t : tags) {
            try {
                int r = tts.setLanguage(Locale.forLanguageTag(t));
                if (r >= TextToSpeech.LANG_AVAILABLE) return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", ready);
        call.resolve(r);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (tts == null || !ready) {
            call.reject("La voz del sistema no está lista. Revisa en Ajustes de Android que haya un motor de voz con español instalado.");
            return;
        }
        if (text == null || text.trim().isEmpty()) { call.resolve(); return; }
        pickLocale(call.getString("lang"));
        Float rate = call.getFloat("rate", 1.0f);
        tts.setSpeechRate(rate == null ? 1.0f : Math.max(0.5f, Math.min(2.0f, rate)));
        int max = TextToSpeech.getMaxSpeechInputLength();
        if (text.length() > max) text = text.substring(0, max);
        String id = "v" + (++seq);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id);
        JSObject r = new JSObject();
        r.put("id", id);
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
    }
}

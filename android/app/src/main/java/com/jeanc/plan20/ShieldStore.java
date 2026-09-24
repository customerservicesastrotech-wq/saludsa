package com.jeanc.plan20;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Configuración y registro del Escudo (solo en el dispositivo). Guarda qué app y cuánto rato; nunca contenido. */
final class ShieldStore {
    static final String PREFS = "plan20_shield";
    static final int MAX_LOCK_MIN = 15; // tope de seguridad: ningún bloqueo dura más de 15 min

    private ShieldStore() {}

    static SharedPreferences p(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static JSONObject config(Context c) {
        try { return new JSONObject(p(c).getString("config", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static void saveConfig(Context c, JSONObject cfg) { p(c).edit().putString("config", cfg.toString()).apply(); }

    static boolean enabled(Context c) { return config(c).optBoolean("enabled", false); }

    static long lockUntil(Context c) { return p(c).getLong("lockUntil", 0); }

    static int lockMinutes(JSONObject cfg) { return Math.max(1, Math.min(MAX_LOCK_MIN, cfg.optInt("minutes", 5))); }

    /** "HH:MM" -> minutos desde medianoche; -1 si no es válido. */
    static int hm(String s) {
        try {
            String[] a = s.split(":");
            int h = Integer.parseInt(a[0].trim()), m = Integer.parseInt(a[1].trim());
            if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
            return h * 60 + m;
        } catch (Exception e) { return -1; }
    }

    static boolean inFixed(JSONObject cfg, long now) {
        if (!cfg.optBoolean("fixedOn", true)) return false;
        int a = hm(cfg.optString("start", "22:30")), b = hm(cfg.optString("end", "06:00"));
        if (a < 0 || b < 0 || a == b) return false;
        Calendar k = Calendar.getInstance(); k.setTimeInMillis(now);
        int t = k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE);
        return a < b ? (t >= a && t < b) : (t >= a || t < b); // cruza medianoche
    }

    /** Ventana de riesgo activa (calculada por la app a partir de tu historial). Devuelve su etiqueta o null. */
    static String inRisk(JSONObject cfg, long now) {
        if (!cfg.optBoolean("riskOn", true)) return null;
        JSONArray w = cfg.optJSONArray("riskWindows");
        if (w == null) return null;
        for (int i = 0; i < w.length(); i++) {
            JSONObject o = w.optJSONObject(i);
            if (o != null && now >= o.optLong("from") && now < o.optLong("to")) return o.optString("label", "riesgo");
        }
        return null;
    }

    /** "fixed", "risk" o null. */
    static String activeReason(JSONObject cfg, long now) {
        if (!cfg.optBoolean("enabled", false)) return null;
        if (inFixed(cfg, now)) return "fixed";
        if (inRisk(cfg, now) != null) return "risk";
        return null;
    }

    static boolean listHas(JSONObject cfg, String key, String pkg) {
        if (pkg == null) return false;
        JSONArray a = cfg.optJSONArray(key);
        if (a == null) return false;
        for (int i = 0; i < a.length(); i++) if (pkg.equals(a.optString(i))) return true;
        return false;
    }

    // ---- registro de eventos ----
    static synchronized void addEvent(Context c, JSONObject ev) {
        try {
            JSONArray a = new JSONArray(p(c).getString("events", "[]"));
            a.put(ev);
            while (a.length() > 200) a.remove(0);
            p(c).edit().putString("events", a.toString()).apply();
        } catch (Exception ignored) {}
    }

    static synchronized void updateEvent(Context c, String id, String key, Object val) {
        try {
            JSONArray a = new JSONArray(p(c).getString("events", "[]"));
            for (int i = a.length() - 1; i >= 0; i--) {
                JSONObject o = a.getJSONObject(i);
                if (id.equals(o.optString("id"))) { o.put(key, val); break; }
            }
            p(c).edit().putString("events", a.toString()).apply();
        } catch (Exception ignored) {}
    }

    /** Día "de la noche": de 00:00 a 05:59 cuenta como la noche del día anterior. */
    static String nightKey(long now) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now - 6L * 3600L * 1000L));
    }

    static synchronized void addUsage(Context c, String pkg, long ms) {
        if (pkg == null || ms <= 0) return;
        try {
            JSONObject u = new JSONObject(p(c).getString("usage", "{}"));
            String k = nightKey(System.currentTimeMillis());
            JSONObject d = u.optJSONObject(k);
            if (d == null) { d = new JSONObject(); u.put(k, d); }
            d.put(pkg, d.optLong(pkg, 0) + ms);
            p(c).edit().putString("usage", u.toString()).apply();
        } catch (Exception ignored) {}
    }

    /** Entrega a la app los eventos y minutos acumulados, y los borra de aquí. */
    static synchronized JSONObject pop(Context c) {
        JSONObject r = new JSONObject();
        try {
            r.put("events", new JSONArray(p(c).getString("events", "[]")));
            r.put("usage", new JSONObject(p(c).getString("usage", "{}")));
        } catch (Exception ignored) {}
        // Un evento aún en curso (bloqueo activo) se conserva para completarlo después.
        JSONArray keep = new JSONArray();
        String cur = p(c).getString("lockId", "");
        boolean live = lockUntil(c) > System.currentTimeMillis() || ShieldService.overlayShowing;
        try {
            JSONArray a = r.getJSONArray("events");
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.getJSONObject(i); if (!o.has("end") && live && cur.equals(o.optString("id"))) keep.put(o); }
        } catch (Exception ignored) {}
        p(c).edit().putString("events", keep.toString()).putString("usage", "{}").apply();
        return r;
    }
}

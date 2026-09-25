package com.jeanc.plan20;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.SharedPreferences;
import java.security.MessageDigest;
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

    // ---- modo dormir: la tablet queda cubierta desde la hora de dormir hasta la de despertar ----
    /** Apps de llamadas: no se cubren mientras las usas para una llamada (entrante o de emergencia); cualquier otra app vuelve a quedar cubierta. */
    static final String[] CALL_PKGS = { "com.samsung.android.dialer", "com.samsung.android.incallui", "com.android.dialer", "com.google.android.dialer",
            "com.android.incallui", "com.android.server.telecom", "com.android.phone", "com.samsung.android.app.telephonyui", "com.android.emergency", "com.google.android.apps.safetyhub" };

    static JSONObject sleepCfg(JSONObject cfg) { JSONObject s = cfg.optJSONObject("sleep"); return s != null ? s : new JSONObject(); }
    static long sleepUntil(Context c) { return p(c).getLong("sleepUntil", 0); }
    static long sleepSnooze(Context c) { return p(c).getLong("sleepSnooze", 0); }
    static boolean sleepConfigured(Context c, JSONObject cfg, long now) { return sleepCfg(cfg).optBoolean("on", false) || sleepUntil(c) > now; }

    /** Próxima alarma del reloj de la tablet (Samsung Reloj u otra app de alarmas), o 0. Ignora las de esta app. */
    static long systemNextAlarm(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            AlarmManager.AlarmClockInfo i = am == null ? null : am.getNextAlarmClock();
            if (i == null) return 0;
            PendingIntent pi = i.getShowIntent();
            if (pi != null && c.getPackageName().equals(pi.getCreatorPackage())) return 0;
            return i.getTriggerTime();
        } catch (Exception e) { return 0; }
    }

    static boolean endsWithAlarm(JSONObject cfg) { return "alarm".equals(sleepCfg(cfg).optString("endMode", "fixed")); }

    /** Comienzo de la noche más reciente (la última hora de dormir que ya pasó). */
    static long nightStart(JSONObject cfg, long now) {
        int a = hm(sleepCfg(cfg).optString("start", "22:30"));
        if (a < 0) a = 22 * 60 + 30;
        Calendar k = Calendar.getInstance(); k.setTimeInMillis(now);
        k.set(Calendar.HOUR_OF_DAY, a / 60); k.set(Calendar.MINUTE, a % 60); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0);
        if (k.getTimeInMillis() > now) k.add(Calendar.DAY_OF_MONTH, -1);
        return k.getTimeInMillis();
    }

    /** Hora fija de despertar de la noche que empieza en ns (respaldo cuando no hay alarma). */
    static long fixedEnd(JSONObject cfg, long ns) {
        int b = hm(sleepCfg(cfg).optString("end", "06:30"));
        if (b < 0) b = 390;
        Calendar k = Calendar.getInstance(); k.setTimeInMillis(ns);
        k.set(Calendar.HOUR_OF_DAY, b / 60); k.set(Calendar.MINUTE, b % 60);
        if (k.getTimeInMillis() <= ns) k.add(Calendar.DAY_OF_MONTH, 1);
        return k.getTimeInMillis();
    }

    static final long MAX_NIGHT = 16L * 3600000L;

    /** Fin de la noche que empieza en ns: la alarma de la tablet de esa noche (si "endMode" = alarm) o la hora fija.
     *  La alarma se recuerda en cuanto se ve, porque al sonar el sistema ya informa la del día siguiente. */
    static long nightEnd(Context c, JSONObject cfg, long ns, long now) {
        long fe = fixedEnd(cfg, ns);
        if (!endsWithAlarm(cfg)) return fe;
        SharedPreferences p = p(c);
        // La alarma de esta noche ya sonó: la noche terminó (aunque luego se posponga, no se vuelve a bloquear)
        if (p.getLong("alarmNight", 0) == ns && now >= p.getLong("alarmAt", Long.MAX_VALUE)) return p.getLong("alarmAt", fe);
        long a = systemNextAlarm(c);
        if (a > ns && a - ns <= MAX_NIGHT && a > now) {
            if (p.getLong("alarmNight", 0) != ns || p.getLong("alarmAt", 0) != a) p.edit().putLong("alarmNight", ns).putLong("alarmAt", a).apply();
            return a;
        }
        if (p.getLong("alarmNight", 0) == ns) return p.getLong("alarmAt", fe);
        return fe;
    }

    static boolean nightOnDay(JSONObject cfg, long ns) {
        Calendar k = Calendar.getInstance(); k.setTimeInMillis(ns);
        int dow = k.get(Calendar.DAY_OF_WEEK) - 1;
        JSONArray d = sleepCfg(cfg).optJSONArray("days");
        if (d == null || d.length() == 0) return true;
        for (int i = 0; i < d.length(); i++) if (d.optInt(i, -1) == dow) return true;
        return false;
    }

    /** Dentro de la noche de dormir (desde la hora de dormir hasta la alarma o la hora fija), en uno de los días elegidos. */
    static boolean inSleepWindow(Context c, JSONObject cfg, long now) {
        if (!sleepCfg(cfg).optBoolean("on", false)) return false;
        long ns = nightStart(cfg, now);
        return nightOnDay(cfg, ns) && now < nightEnd(c, cfg, ns, now);
    }

    static boolean sleeping(Context c, JSONObject cfg, long now) {
        if (sleepSnooze(c) > now) return false;
        return sleepUntil(c) > now || inSleepWindow(c, cfg, now);
    }

    /** Cuándo termina el descanso en curso (o el de la próxima noche). */
    static long sleepEndsAt(Context c, JSONObject cfg, long now) {
        long u = sleepUntil(c);
        if (u > now) return u;
        long ns = nightStart(cfg, now), e = nightEnd(c, cfg, ns, now);
        if (e > now) return e;
        Calendar k = Calendar.getInstance(); k.setTimeInMillis(ns); k.add(Calendar.DAY_OF_MONTH, 1);
        return nightEnd(c, cfg, k.getTimeInMillis(), now);
    }

    static boolean sleepAllowed(JSONObject cfg, String pkg) {
        if (pkg == null) return false;
        for (String x : CALL_PKGS) if (x.equals(pkg)) return true;
        return listHas(sleepCfg(cfg), "allow", pkg);
    }

    /** El PIN de la app (mismo hash que usa la app: SHA-256 de "sal:pin"). */
    static boolean checkPin(JSONObject cfg, String pin) {
        JSONObject s = sleepCfg(cfg);
        String h = s.optString("pinHash", ""), salt = s.optString("pinSalt", "");
        if (h.isEmpty() || pin == null || pin.isEmpty()) return false;
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest((salt + ":" + pin).getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format(Locale.US, "%02x", x));
            return sb.toString().equals(h);
        } catch (Exception e) { return false; }
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

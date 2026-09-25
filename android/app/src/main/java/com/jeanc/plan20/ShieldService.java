package com.jeanc.plan20;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Random;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Escudo: vigila qué app está en primer plano (solo el nombre del paquete y el tiempo) durante
 * la franja fija o las ventanas de riesgo. Si abres una app bloqueada, o pasas demasiado rato en
 * una app vigilada, cubre la pantalla con una pausa de N minutos que no se puede cerrar antes.
 */
public class ShieldService extends Service {
    static final String ACTION_LOCK = "com.jeanc.plan20.SHIELD_LOCK";
    static final String ACTION_RELOAD = "com.jeanc.plan20.SHIELD_RELOAD";
    static final String ACTION_SLEEP = "com.jeanc.plan20.SHIELD_SLEEP";
    static final String CHANNEL = "escudo";
    static final int NOTIF_ID = 7020;
    static volatile boolean running = false;
    static volatile boolean overlayShowing = false;

    private final Handler h = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();
    private WindowManager wm;
    private View overlay;
    private TextView tCount, tBreath, tMsg, tTitle, tSub;
    private View circle;
    private ProgressBar bar;
    private LinearLayout endBox;
    private String lockId;
    private long lockStart, lockTotal;
    private int msgIdx;
    private long lastMsgSwap;

    // Modo dormir
    private View sleepView;
    private TextView sClock, sInfo, sMsg, sPinDots, sPinNote;
    private LinearLayout sPinBox;
    private String pinBuf = "";
    private long pinOkAt = 0;
    private int sMsgIdx = 0;
    private long sLastSwap = 0;

    private String fg = null;          // paquete en primer plano
    private long fgSince = 0;          // desde cuándo
    private long lastEventTs = 0;      // último evento leído
    private long lastTick = 0;
    private String lastReason = "init";

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        running = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!goForeground()) { stopSelf(); return START_NOT_STICKY; }
        String a = intent != null ? intent.getAction() : null;
        if (ACTION_LOCK.equals(a)) {
            JSONObject cfg = ShieldStore.config(this);
            int min = intent.getIntExtra("minutes", ShieldStore.lockMinutes(cfg));
            startLock(Math.max(1, Math.min(ShieldStore.MAX_LOCK_MIN, min)), intent.getStringExtra("kind") != null ? intent.getStringExtra("kind") : "manual", null);
        }
        if (ACTION_SLEEP.equals(a)) {
            long until = intent.getLongExtra("until", 0);
            long now = System.currentTimeMillis();
            if (until > now) {
                ShieldStore.p(this).edit().putLong("sleepUntil", until).putLong("sleepSnooze", 0).apply();
                try { JSONObject ev = new JSONObject(); ev.put("id", "s" + now); ev.put("t", now); ev.put("kind", "sleep"); ev.put("until", until); ev.put("done", now); ShieldStore.addEvent(this, ev); } catch (Exception ignored) {}
                goHome();
            }
        }
        h.removeCallbacks(tick);
        h.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        h.removeCallbacksAndMessages(null);
        removeOverlay();
        removeSleep();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ notificación
    private boolean goForeground() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Protección", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
                nm.createNotificationChannel(ch);
            }
            Notification n = buildNotif(null);
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NOTIF_ID, n);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Notification buildNotif(String reason) {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String text = reason == null ? "Protección lista" : "sleep".equals(reason) ? "Modo dormir activo" : ("fixed".equals(reason) ? "Protección nocturna activa" : "Protección activa · franja de riesgo");
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_p20).setContentTitle("Plan 20").setContentText(text).setContentIntent(pi).setOngoing(true).setShowWhen(false);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private void updateNotif(String reason) {
        String key = reason == null ? "none" : reason;
        if (key.equals(lastReason)) return;
        lastReason = key;
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ID, buildNotif(reason)); } catch (Exception ignored) {}
    }

    // ------------------------------------------------------------------ vigilancia
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            long now = System.currentTimeMillis();
            JSONObject cfg = ShieldStore.config(ShieldService.this);
            long until = ShieldStore.lockUntil(ShieldService.this);
            boolean locking = until > now;

            boolean sleepNow = ShieldStore.sleeping(ShieldService.this, cfg, now);
            if (!cfg.optBoolean("enabled", false) && !locking && overlay == null && !sleepNow && sleepView == null
                    && !ShieldStore.sleepConfigured(ShieldService.this, cfg, now)) { stopSelf(); return; }

            // Modo dormir: cubre todo (salvo llamadas y apps permitidas) hasta la hora de despertar
            if (sleepNow) {
                boolean on = isInteractive();
                if (on) {
                    if (hasUsageAccess()) readForeground(now);
                    boolean allow = inCall() || ShieldStore.sleepAllowed(cfg, fg);
                    if (allow) removeSleep();
                    else if (sleepView == null) showSleep();
                    else updateSleep(now);
                }
                updateNotif("sleep");
                h.postDelayed(this, on ? 1000 : 30000);
                return;
            } else if (sleepView != null) {
                removeSleep();
                ShieldStore.p(ShieldService.this).edit().putLong("sleepUntil", 0).apply();
            }

            // Un bloqueo pendiente (p. ej. tras reiniciar la tablet) se reanuda con el tiempo que faltaba.
            if (locking && overlay == null) resumeLock(until);

            String reason = ShieldStore.activeReason(cfg, now);
            updateNotif(reason);
            boolean interactive = isInteractive();
            if (reason != null && interactive && hasUsageAccess()) {
                readForeground(now);
                boolean inOpen = ShieldStore.listHas(cfg, "apps", fg);
                boolean inWatch = ShieldStore.listHas(cfg, "watch", fg);
                if ((inOpen || inWatch) && lastTick > 0) ShieldStore.addUsage(ShieldService.this, fg, Math.min(now - lastTick, 5000));
                if (overlay == null && !locking) {
                    long graceMs = Math.max(0, cfg.optInt("graceMin", 10)) * 60000L;
                    boolean graceOver = now - ShieldStore.p(ShieldService.this).getLong("lastLockEnd", 0) > Math.max(graceMs, 20000L);
                    int watchMin = Math.max(1, cfg.optInt("watchMin", 20));
                    if (graceOver && inOpen) startLock(ShieldStore.lockMinutes(cfg), "open", reason);
                    else if (graceOver && inWatch && now - fgSince >= watchMin * 60000L) startLock(ShieldStore.lockMinutes(cfg), "time", reason);
                }
                lastTick = now;
            } else {
                lastTick = 0;
            }
            h.postDelayed(this, (reason != null && interactive) ? 1500 : (overlay != null ? 1000 : 30000));
        }
    };

    private boolean isInteractive() {
        try { return ((PowerManager) getSystemService(POWER_SERVICE)).isInteractive(); } catch (Exception e) { return true; }
    }

    boolean hasUsageAccess() { return ShieldPlugin.usageGranted(this); }

    private void readForeground(long now) {
        try {
            UsageStatsManager um = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            long from = lastEventTs > 0 ? lastEventTs + 1 : now - 3600000L;
            UsageEvents ev = um.queryEvents(from, now);
            UsageEvents.Event e = new UsageEvents.Event();
            while (ev.hasNextEvent()) {
                ev.getNextEvent(e);
                long ts = e.getTimeStamp();
                if (ts > lastEventTs) lastEventTs = ts;
                int t = e.getEventType();
                if (t == UsageEvents.Event.MOVE_TO_FOREGROUND) { // = ACTIVITY_RESUMED
                    String pk = e.getPackageName();
                    if (!pk.equals(fg)) { fg = pk; fgSince = ts; }
                } else if (Build.VERSION.SDK_INT >= 28 && t == UsageEvents.Event.SCREEN_NON_INTERACTIVE) {
                    fg = null; fgSince = ts;
                }
            }
        } catch (Exception ignored) {}
    }

    // ------------------------------------------------------------------ bloqueo
    private void startLock(int minutes, String kind, String reason) {
        if (!Settings.canDrawOverlays(this)) return;
        long now = System.currentTimeMillis();
        lockId = UUID.randomUUID().toString().substring(0, 8);
        lockStart = now;
        lockTotal = minutes * 60000L;
        ShieldStore.p(this).edit().putLong("lockUntil", now + lockTotal).putString("lockId", lockId).putLong("lockStart", now).putLong("lockTotal", lockTotal).apply();
        try {
            JSONObject ev = new JSONObject();
            ev.put("id", lockId); ev.put("t", now); ev.put("kind", kind); ev.put("minutes", minutes);
            ev.put("reason", reason == null ? "manual" : reason);
            if (!"manual".equals(kind) && fg != null) { ev.put("pkg", fg); ev.put("app", label(fg)); ev.put("inAppMs", now - fgSince); }
            ShieldStore.addEvent(this, ev);
        } catch (Exception ignored) {}
        goHome();
        showOverlay(kind);
    }

    private void resumeLock(long until) {
        if (!Settings.canDrawOverlays(this)) return;
        lockId = ShieldStore.p(this).getString("lockId", "x");
        lockStart = ShieldStore.p(this).getLong("lockStart", System.currentTimeMillis());
        lockTotal = Math.max(until - lockStart, 60000L);
        showOverlay("resume");
    }

    private void goHome() {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(home);
        } catch (Exception ignored) {}
    }

    private String label(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (Exception e) { return pkg; }
    }

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private TextView text(float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        t.setLineSpacing(0, 1.2f);
        return t;
    }

    private void showOverlay(String kind) {
        if (overlay != null) return;
        final int bg = Color.rgb(12, 20, 18), accent = Color.rgb(94, 186, 160), soft = Color.rgb(160, 180, 172);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        root.setClickable(true); // consume todos los toques
        root.setFocusable(true);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(32), dp(24), dp(32), dp(24));
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(dp(640), FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        root.addView(col, clp);

        tTitle = text(14, accent, true);
        tTitle.setLetterSpacing(0.18f);
        tTitle.setText("PLAN 20 · PAUSA");
        col.addView(tTitle);

        tSub = text(16, soft, false);
        JSONObject cfg = ShieldStore.config(this);
        String who = cfg.optString("name", "");
        String sub = "open".equals(kind) ? "Frené esa app. Tómate estos minutos."
                : "time".equals(kind) ? "Llevas rato ahí a esta hora. Hagamos una pausa."
                : "resume".equals(kind) ? "La pausa sigue hasta que termine el tiempo."
                : "Pediste un freno. Aquí estoy.";
        tSub.setText(who.isEmpty() ? sub : who + ", " + Character.toLowerCase(sub.charAt(0)) + sub.substring(1));
        tSub.setPadding(0, dp(6), 0, dp(20));
        col.addView(tSub);

        FrameLayout circleBox = new FrameLayout(this);
        circle = new View(this);
        GradientDrawable gd = new GradientDrawable();
        gd.setShape(GradientDrawable.OVAL);
        gd.setColor(Color.argb(40, 94, 186, 160));
        gd.setStroke(dp(2), accent);
        circle.setBackground(gd);
        circleBox.addView(circle, new FrameLayout.LayoutParams(dp(200), dp(200), Gravity.CENTER));
        tCount = text(54, Color.WHITE, true);
        circleBox.addView(tCount, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        col.addView(circleBox, new LinearLayout.LayoutParams(dp(220), dp(220)));

        tBreath = text(18, accent, true);
        tBreath.setPadding(0, dp(10), 0, dp(18));
        col.addView(tBreath);

        tMsg = text(22, Color.WHITE, false);
        tMsg.setMinHeight(dp(120));
        col.addView(tMsg, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(1000);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(6));
        blp.topMargin = dp(20);
        col.addView(bar, blp);

        endBox = new LinearLayout(this);
        endBox.setOrientation(LinearLayout.VERTICAL);
        endBox.setVisibility(View.GONE);
        endBox.setPadding(0, dp(22), 0, 0);
        endBox.addView(button("Hablar con Plan 20", accent, bg, v -> finish("talk")));
        endBox.addView(button("Ir al inicio", Color.rgb(34, 48, 44), Color.WHITE, v -> finish("home")));
        endBox.addView(button("Dame 5 minutos más", Color.TRANSPARENT, soft, v -> extend()));
        col.addView(endBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_FULLSCREEN,
                PixelFormat.OPAQUE);
        lp.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= 28) lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        try {
            wm.addView(root, lp);
            overlay = root;
            overlayShowing = true;
        } catch (Exception e) {
            overlay = null;
            return;
        }
        msgIdx = rnd.nextInt(Math.max(1, messages().length()));
        lastMsgSwap = 0;
        h.post(frame);
    }

    private Button button(String label, int bg, int fgc, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        b.setTextColor(fgc);
        GradientDrawable g = new GradientDrawable();
        g.setColor(bg);
        g.setCornerRadius(dp(14));
        b.setBackground(g);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(58));
        lp.bottomMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private JSONArray messages() {
        JSONArray a = ShieldStore.config(this).optJSONArray("messages");
        if (a != null && a.length() > 0) return a;
        a = new JSONArray();
        a.put("Tengo un impulso; puedo elegir el siguiente paso.");
        a.put("Deja la tablet en otro lugar. Si estás en la cama, levántate y cambia de espacio.");
        a.put("Nota los pies apoyados. Nombra lo que ves y oyes. Respira de forma cómoda.");
        a.put("Elige algo de unos 10 minutos: tarea doméstica corta, lectura, descanso fuera de la cama o caminar suave.");
        a.put("Los impulsos no necesitan desaparecer para que actúes conforme a tu meta.");
        return a;
    }

    private final Runnable frame = new Runnable() {
        @Override public void run() {
            if (overlay == null) return;
            long now = System.currentTimeMillis();
            long left = ShieldStore.lockUntil(ShieldService.this) - now;
            if (left <= 0) { showEnd(); return; }
            long s = (left + 999) / 1000;
            tCount.setText(String.format(Locale.US, "%d:%02d", s / 60, s % 60));
            bar.setProgress((int) (1000 * (1 - (double) left / Math.max(1, lockTotal))));
            // Respiración 4-4-6: inhala, sostén, exhala.
            long c = ((now - lockStart) / 1000) % 14;
            float scale;
            if (c < 4) { tBreath.setText("Inhala · " + (4 - c)); scale = 0.65f + 0.35f * (c + 1) / 4f; }
            else if (c < 8) { tBreath.setText("Sostén · " + (8 - c)); scale = 1f; }
            else { tBreath.setText("Exhala despacio · " + (14 - c)); scale = 1f - 0.35f * (c - 7) / 6f; }
            circle.animate().scaleX(scale).scaleY(scale).setDuration(950).start();
            if (now - lastMsgSwap > 20000) {
                JSONArray m = messages();
                tMsg.setText(m.optString(msgIdx % m.length()));
                tMsg.setAlpha(0f);
                tMsg.animate().alpha(1f).setDuration(600).start();
                msgIdx++;
                lastMsgSwap = now;
            }
            h.postDelayed(this, 1000);
        }
    };

    private void showEnd() {
        long now = System.currentTimeMillis();
        ShieldStore.p(this).edit().putLong("lockUntil", 0).putLong("lastLockEnd", now).apply();
        tCount.setText("0:00");
        bar.setProgress(1000);
        circle.animate().scaleX(0.8f).scaleY(0.8f).setDuration(600).start();
        tBreath.setText("Lo lograste.");
        tMsg.setText("Pasaron los minutos y sigues aquí. ¿Qué haces ahora?");
        endBox.setVisibility(View.VISIBLE);
        if (lockId != null) ShieldStore.updateEvent(this, lockId, "done", now);
        h.postDelayed(autoClose, 90000); // si no eliges nada, se cierra y vuelve al inicio
    }

    private final Runnable autoClose = () -> finish("timeout");

    private void extend() {
        h.removeCallbacks(autoClose);
        long now = System.currentTimeMillis();
        lockStart = now;
        lockTotal = 5 * 60000L;
        ShieldStore.p(this).edit().putLong("lockUntil", now + lockTotal).putLong("lockStart", now).putLong("lockTotal", lockTotal).apply();
        if (lockId != null) ShieldStore.updateEvent(this, lockId, "extended", true);
        endBox.setVisibility(View.GONE);
        tMsg.setText("Bien. Otros 5 minutos.");
        lastMsgSwap = now;
        h.post(frame);
    }

    private void finish(String choice) {
        h.removeCallbacks(autoClose);
        long now = System.currentTimeMillis();
        if (lockId != null) { ShieldStore.updateEvent(this, lockId, "choice", choice); ShieldStore.updateEvent(this, lockId, "end", now); }
        ShieldStore.p(this).edit().putLong("lastLockEnd", now).apply();
        removeOverlay();
        if ("talk".equals(choice)) {
            try {
                startActivity(new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("shield", "talk"));
            } catch (Exception ignored) {}
        } else {
            goHome();
        }
    }

    private void removeOverlay() {
        h.removeCallbacks(frame);
        if (overlay != null) { try { wm.removeView(overlay); } catch (Exception ignored) {} }
        overlay = null;
        overlayShowing = false;
    }

    // ------------------------------------------------------------------ modo dormir
    private boolean inCall() {
        try {
            int m = ((AudioManager) getSystemService(AUDIO_SERVICE)).getMode();
            return m == AudioManager.MODE_RINGTONE || m == AudioManager.MODE_IN_CALL || m == AudioManager.MODE_IN_COMMUNICATION;
        } catch (Exception e) { return false; }
    }

    private JSONArray sleepMessages() {
        JSONArray a = ShieldStore.sleepCfg(ShieldStore.config(this)).optJSONArray("messages");
        if (a != null && a.length() > 0) return a;
        a = new JSONArray();
        a.put("Hora de descansar. Lo que queda pendiente puede esperar a mañana.");
        a.put("Deja la tablet lejos de la cama y apaga la luz.");
        a.put("Respira lento: inhala 4, sostén 4, exhala 6.");
        return a;
    }

    private void showSleep() {
        if (sleepView != null) return;
        final int bg = Color.rgb(8, 12, 22), accent = Color.rgb(140, 160, 230), soft = Color.rgb(150, 160, 190);
        JSONObject cfg = ShieldStore.config(this);
        JSONObject sc = ShieldStore.sleepCfg(cfg);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        root.setClickable(true);
        root.setFocusable(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(28), dp(20), dp(28), dp(20));
        root.addView(col, new FrameLayout.LayoutParams(dp(560), FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        TextView t = text(14, accent, true);
        t.setLetterSpacing(0.18f);
        t.setText("PLAN 20 · MODO DORMIR");
        col.addView(t);
        sClock = text(76, Color.WHITE, true);
        col.addView(sClock);
        sInfo = text(18, soft, false);
        sInfo.setPadding(0, dp(4), 0, dp(18));
        col.addView(sInfo);
        sMsg = text(21, Color.WHITE, false);
        sMsg.setMinHeight(dp(96));
        col.addView(sMsg, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        // Apps permitidas (p. ej. reloj o música para dormir)
        JSONArray allow = sc.optJSONArray("allow");
        if (allow != null) {
            for (int i = 0; i < Math.min(3, allow.length()); i++) {
                final String pkg = allow.optString(i);
                col.addView(button("Abrir " + label(pkg), Color.rgb(28, 34, 52), Color.WHITE, v -> openApp(pkg)));
            }
        }
        // Emergencia: SIEMPRE disponible
        col.addView(button("Llamada de emergencia", Color.rgb(150, 40, 40), Color.WHITE, v -> emergency()));

        if (sc.optBoolean("pinExit", true) && !sc.optString("pinHash", "").isEmpty()) {
            col.addView(button("Necesito usar la tablet", Color.TRANSPARENT, soft, v -> { sPinBox.setVisibility(sPinBox.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE); pinBuf = ""; pinOkAt = 0; paintPin(); }));
            sPinBox = new LinearLayout(this);
            sPinBox.setOrientation(LinearLayout.VERTICAL);
            sPinBox.setGravity(Gravity.CENTER_HORIZONTAL);
            sPinBox.setVisibility(View.GONE);
            sPinNote = text(16, soft, false);
            sPinNote.setText("Escribe tu PIN de Plan 20");
            sPinBox.addView(sPinNote);
            sPinDots = text(28, Color.WHITE, true);
            sPinBox.addView(sPinDots);
            String[][] keys = { { "1", "2", "3" }, { "4", "5", "6" }, { "7", "8", "9" }, { "⌫", "0", "OK" } };
            for (String[] row : keys) {
                LinearLayout r = new LinearLayout(this);
                r.setOrientation(LinearLayout.HORIZONTAL);
                r.setGravity(Gravity.CENTER);
                for (final String k : row) {
                    Button b = button(k, Color.rgb(28, 34, 52), Color.WHITE, v -> pinKey(k));
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(96), dp(58));
                    lp.setMargins(dp(5), dp(4), dp(5), dp(4));
                    r.addView(b, lp);
                }
                sPinBox.addView(r);
            }
            col.addView(sPinBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_FULLSCREEN,
                PixelFormat.OPAQUE);
        lp.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= 28) lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        try { wm.addView(root, lp); sleepView = root; } catch (Exception e) { sleepView = null; return; }
        sLastSwap = 0;
        updateSleep(System.currentTimeMillis());
    }

    private void updateSleep(long now) {
        if (sleepView == null) return;
        JSONObject cfg = ShieldStore.config(this);
        sClock.setText(hhmm(now));
        sInfo.setText("La tablet descansa hasta las " + hhmm(ShieldStore.sleepEndsAt(this, cfg, now)) + ".");
        if (now - sLastSwap > 20000) {
            JSONArray m = sleepMessages();
            sMsg.setText(m.optString(sMsgIdx % m.length()));
            sMsgIdx++;
            sLastSwap = now;
        }
        if (pinOkAt > 0 && sPinNote != null) {
            int wait = Math.max(0, ShieldStore.sleepCfg(cfg).optInt("wait", 60));
            long left = pinOkAt + wait * 1000L - now;
            if (left <= 0) {
                int snooze = Math.max(5, Math.min(120, ShieldStore.sleepCfg(cfg).optInt("snooze", 15)));
                ShieldStore.p(this).edit().putLong("sleepSnooze", now + snooze * 60000L).apply();
                logSleep("sleep_exit", snooze);
                pinOkAt = 0;
                removeSleep();
            } else {
                sPinNote.setText("Si de verdad la necesitas, espera " + ((left + 999) / 1000) + " s…");
            }
        }
    }

    private void paintPin() {
        if (sPinDots == null) return;
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < pinBuf.length(); i++) b.append("● ");
        sPinDots.setText(b.length() == 0 ? " " : b.toString().trim());
    }

    private void pinKey(String k) {
        if (pinOkAt > 0) return;
        if ("⌫".equals(k)) { if (!pinBuf.isEmpty()) pinBuf = pinBuf.substring(0, pinBuf.length() - 1); }
        else if ("OK".equals(k)) {
            if (ShieldStore.checkPin(ShieldStore.config(this), pinBuf)) { pinOkAt = System.currentTimeMillis(); updateSleep(pinOkAt); }
            else { sPinNote.setText("PIN incorrecto"); }
            pinBuf = "";
        } else if (pinBuf.length() < 6) pinBuf += k;
        paintPin();
    }

    private void emergency() {
        long now = System.currentTimeMillis();
        ShieldStore.p(this).edit().putLong("sleepSnooze", now + 10 * 60000L).apply();
        logSleep("sleep_emergency", 10);
        removeSleep();
        try { startActivity(new Intent(Intent.ACTION_DIAL).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
    }

    private void openApp(String pkg) {
        try {
            Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return;
            // Sin acceso a datos de uso no sabría cuándo sales de esa app: se permite 10 min y vuelve el modo dormir
            if (!hasUsageAccess()) ShieldStore.p(this).edit().putLong("sleepSnooze", System.currentTimeMillis() + 10 * 60000L).apply();
            removeSleep(); fg = pkg; startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) {}
    }

    private void logSleep(String kind, int minutes) {
        try {
            long now = System.currentTimeMillis();
            JSONObject ev = new JSONObject();
            ev.put("id", kind + now); ev.put("t", now); ev.put("kind", kind); ev.put("minutes", minutes); ev.put("done", now);
            ShieldStore.addEvent(this, ev);
        } catch (Exception ignored) {}
    }

    private void removeSleep() {
        if (sleepView != null) { try { wm.removeView(sleepView); } catch (Exception ignored) {} }
        sleepView = null;
        sPinBox = null; sPinDots = null; sPinNote = null;
        pinBuf = ""; pinOkAt = 0;
    }

    static String hhmm(long t) { return new SimpleDateFormat("HH:mm", Locale.US).format(new Date(t)); }
}

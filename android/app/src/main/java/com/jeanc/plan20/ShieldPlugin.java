package com.jeanc.plan20;

import android.app.AppOpsManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

@CapacitorPlugin(name = "Shield")
public class ShieldPlugin extends Plugin {

    static boolean usageGranted(Context c) {
        try {
            AppOpsManager ao = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
            int mode = Build.VERSION.SDK_INT >= 29
                    ? ao.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
                    : ao.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) { return false; }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("usage", usageGranted(c));
        r.put("overlay", Settings.canDrawOverlays(c));
        boolean batt = true;
        try { batt = ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(c.getPackageName()); } catch (Exception ignored) {}
        r.put("battery", batt);
        r.put("running", ShieldService.running);
        r.put("enabled", ShieldStore.enabled(c));
        long now = System.currentTimeMillis();
        String reason = ShieldStore.activeReason(ShieldStore.config(c), now);
        r.put("active", reason != null);
        r.put("reason", reason);
        r.put("locked", ShieldStore.lockUntil(c) > now || ShieldService.overlayShowing);
        r.put("sdk", Build.VERSION.SDK_INT);
        JSONObject cfgNow = ShieldStore.config(c);
        r.put("sleeping", ShieldStore.sleeping(c, cfgNow, now));
        r.put("sleepEnds", ShieldStore.sleepEndsAt(c, cfgNow, now));
        r.put("nextAlarm", ShieldStore.systemNextAlarm(c));
        // DNS privado: el sistema informa el servidor en uso cuando está en modo "nombre de host".
        String dns = null;
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            LinkProperties lp = n != null ? cm.getLinkProperties(n) : null;
            if (lp != null && Build.VERSION.SDK_INT >= 28) dns = lp.getPrivateDnsServerName();
            r.put("online", n != null);
        } catch (Exception ignored) {}
        r.put("privateDns", dns);
        call.resolve(r);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Context c = getContext();
        JSObject cfg = call.getObject("config", new JSObject());
        ShieldStore.saveConfig(c, cfg);
        try {
            if (cfg.optBoolean("enabled", false) || ShieldStore.sleepConfigured(c, cfg, System.currentTimeMillis())) startService(null, 0, null);
            else if (ShieldService.running && ShieldStore.lockUntil(c) <= System.currentTimeMillis()) c.stopService(new Intent(c, ShieldService.class));
            call.resolve(status());
        } catch (Exception e) {
            call.reject("No pude iniciar la protección: " + e.getMessage());
        }
    }

    private JSObject status() {
        JSObject r = new JSObject();
        r.put("usage", usageGranted(getContext()));
        r.put("overlay", Settings.canDrawOverlays(getContext()));
        return r;
    }

    private void startService(String action, int minutes, String kind) {
        Context c = getContext();
        Intent i = new Intent(c, ShieldService.class);
        if (action != null) { i.setAction(action); i.putExtra("minutes", minutes); i.putExtra("kind", kind); }
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    @PluginMethod
    public void lockNow(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) { call.reject("Falta el permiso para mostrarse sobre otras apps.", "OVERLAY"); return; }
        try {
            startService(ShieldService.ACTION_LOCK, call.getInt("minutes", 5), call.getString("kind", "manual"));
            call.resolve();
        } catch (Exception e) { call.reject("No pude activar la pausa: " + e.getMessage()); }
    }

    /** Modo dormir ahora: cubre la tablet hasta la hora indicada (máximo 14 h). */
    @PluginMethod
    public void sleepNow(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) { call.reject("Falta el permiso para mostrarse sobre otras apps.", "OVERLAY"); return; }
        long now = System.currentTimeMillis();
        Double u = call.getDouble("until", 0.0);
        long until = u == null ? 0 : u.longValue();
        if (until <= now) until = ShieldStore.sleepEndsAt(getContext(), ShieldStore.config(getContext()), now);
        until = Math.min(until, now + 14L * 3600000L);
        try {
            Intent i = new Intent(getContext(), ShieldService.class);
            i.setAction(ShieldService.ACTION_SLEEP); i.putExtra("until", until);
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i);
            JSObject r = new JSObject(); r.put("until", until); call.resolve(r);
        } catch (Exception e) { call.reject("No pude activar el modo dormir: " + e.getMessage()); }
    }

    @PluginMethod
    public void popEvents(PluginCall call) {
        JSONObject o = ShieldStore.pop(getContext());
        try { call.resolve(JSObject.fromJSONObject(o)); } catch (Exception e) { call.resolve(new JSObject()); }
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
        JSArray arr = new JSArray();
        Set<String> seen = new HashSet<>();
        String self = getContext().getPackageName();
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.equals(self) || !seen.add(pkg)) continue;
            JSObject o = new JSObject();
            o.put("pkg", pkg);
            o.put("label", ri.loadLabel(pm).toString());
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("apps", arr);
        call.resolve(r);
    }

    private void open(PluginCall call, Intent... tries) {
        for (Intent i : tries) {
            try { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); call.resolve(); return; } catch (Exception ignored) {}
        }
        call.reject("No pude abrir esa pantalla de Ajustes.");
    }

    private Uri pkgUri() { return Uri.parse("package:" + getContext().getPackageName()); }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, pkgUri()), new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri()), new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri()),
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri()));
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri()));
    }

    @PluginMethod
    public void openDnsSettings(PluginCall call) {
        open(call, new Intent("android.settings.PRIVATE_DNS_SETTINGS"), new Intent(Settings.ACTION_WIRELESS_SETTINGS), new Intent(Settings.ACTION_SETTINGS));
    }

    @PluginMethod
    public void copyText(PluginCall call) {
        try {
            ClipboardManager cb = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            cb.setPrimaryClip(ClipData.newPlainText("Plan 20", call.getString("text", "")));
            call.resolve();
        } catch (Exception e) { call.reject("No pude copiar."); }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && intent.hasExtra("shield")) {
            JSObject d = new JSObject(); d.put("action", intent.getStringExtra("shield"));
            notifyListeners("open", d, true);
        }
    }
}

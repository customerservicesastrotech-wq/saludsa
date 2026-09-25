package com.jeanc.plan20;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Vuelve a encender la protección al reiniciar la tablet o al actualizar la app. */
public class ShieldBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        long now = System.currentTimeMillis();
        if (!ShieldStore.enabled(c) && ShieldStore.lockUntil(c) <= now && !ShieldStore.sleepConfigured(c, ShieldStore.config(c), now)) return;
        try {
            Intent i = new Intent(c, ShieldService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) {}
    }
}

package com.jeanc.plan20;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.AlarmClock;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.TimeZone;

/**
 * Puente con las apps de la tablet (Samsung):
 * - Calendario: escribe en el calendario del sistema (CalendarContract), que es el que muestra Samsung Calendar
 *   (cuenta Samsung, Google o "Mi calendario" del dispositivo). Crea, cambia y borra eventos con recordatorio.
 * - Alarmas: pide al reloj del sistema (Samsung Reloj) que cree una alarma (AlarmClock.ACTION_SET_ALARM), sin abrirlo.
 * - Próxima alarma: la hora a la que sonará la siguiente alarma de la tablet (AlarmManager.getNextAlarmClock),
 *   que el modo dormir usa para desbloquear la tablet justo cuando suena.
 */
@CapacitorPlugin(name = "Dispositivo", permissions = { @Permission(strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }, alias = "calendar") })
public class DispositivoPlugin extends Plugin {

    // ------------------------------------------------------------------ permisos
    @PluginMethod
    public void calendarPermission(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) { JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return; }
        requestPermissionForAlias("calendar", call, "calPerm");
    }

    @PermissionCallback
    private void calPerm(PluginCall call) {
        JSObject r = new JSObject(); r.put("granted", getPermissionState("calendar") == PermissionState.GRANTED); call.resolve(r);
    }

    private boolean calOk(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) return true;
        call.reject("Falta el permiso de calendario.", "PERMISSION");
        return false;
    }

    // ------------------------------------------------------------------ calendario
    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!calOk(call)) return;
        JSArray out = new JSArray();
        String[] cols = { CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.IS_PRIMARY, CalendarContract.Calendars.VISIBLE };
        try (Cursor c = getContext().getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cols, null, null, null)) {
            while (c != null && c.moveToNext()) {
                int access = c.getInt(4);
                if (access < CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR) continue; // solo los que se pueden escribir
                JSObject o = new JSObject();
                o.put("id", c.getLong(0)); o.put("name", c.getString(1)); o.put("account", c.getString(2)); o.put("type", c.getString(3));
                o.put("primary", c.getInt(5) == 1); o.put("visible", c.getInt(6) == 1);
                out.put(o);
            }
        } catch (Exception e) { call.reject("No pude leer los calendarios: " + e.getMessage()); return; }
        JSObject r = new JSObject(); r.put("calendars", out); call.resolve(r);
    }

    /** Crea (o, con eventId, actualiza) un evento. start/end en milisegundos; allDay usa UTC como exige Android. */
    @PluginMethod
    public void saveEvent(PluginCall call) {
        if (!calOk(call)) return;
        Long cal = call.getLong("calendarId");
        Double s = call.getDouble("start"), e = call.getDouble("end");
        String title = call.getString("title", "");
        if (cal == null || s == null || title.isEmpty()) { call.reject("Faltan datos del evento."); return; }
        boolean allDay = Boolean.TRUE.equals(call.getBoolean("allDay", false));
        long start = s.longValue(), end = e != null && e > s ? e.longValue() : start + (allDay ? 86400000L : 30 * 60000L);
        ContentValues v = new ContentValues();
        v.put(CalendarContract.Events.CALENDAR_ID, cal);
        v.put(CalendarContract.Events.TITLE, title);
        v.put(CalendarContract.Events.DESCRIPTION, call.getString("notes", "Creado por Plan 20"));
        v.put(CalendarContract.Events.DTSTART, start);
        String rrule = call.getString("rrule", null);
        if (rrule != null && !rrule.isEmpty()) {
            v.put(CalendarContract.Events.RRULE, rrule);
            v.put(CalendarContract.Events.DURATION, allDay ? "P1D" : "PT" + Math.max(1, (end - start) / 60000L) + "M");
            v.putNull(CalendarContract.Events.DTEND);
        } else { v.put(CalendarContract.Events.DTEND, end); v.putNull(CalendarContract.Events.RRULE); v.putNull(CalendarContract.Events.DURATION); }
        v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
        v.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : TimeZone.getDefault().getID());
        Integer rem = call.getInt("reminder", -1);
        v.put(CalendarContract.Events.HAS_ALARM, rem != null && rem >= 0 ? 1 : 0);
        ContentResolver cr = getContext().getContentResolver();
        try {
            long id;
            Long old = call.getLong("eventId");
            if (old != null && old > 0 && cr.update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, old), v, null, null) > 0) {
                id = old;
                cr.delete(CalendarContract.Reminders.CONTENT_URI, CalendarContract.Reminders.EVENT_ID + "=?", new String[] { String.valueOf(id) });
            } else {
                Uri u = cr.insert(CalendarContract.Events.CONTENT_URI, v);
                if (u == null) { call.reject("El calendario no aceptó el evento."); return; }
                id = ContentUris.parseId(u);
            }
            if (rem != null && rem >= 0) {
                ContentValues r = new ContentValues();
                r.put(CalendarContract.Reminders.EVENT_ID, id);
                r.put(CalendarContract.Reminders.MINUTES, rem);
                r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
                cr.insert(CalendarContract.Reminders.CONTENT_URI, r);
            }
            JSObject o = new JSObject(); o.put("eventId", id); call.resolve(o);
        } catch (Exception ex) { call.reject("No pude guardar en el calendario: " + ex.getMessage()); }
    }

    @PluginMethod
    public void deleteEvents(PluginCall call) {
        if (!calOk(call)) return;
        JSArray ids = call.getArray("ids", new JSArray());
        int n = 0;
        try {
            for (int i = 0; i < ids.length(); i++) {
                long id = ids.getLong(i);
                n += getContext().getContentResolver().delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null);
            }
        } catch (Exception ex) { call.reject("No pude borrar del calendario: " + ex.getMessage()); return; }
        JSObject o = new JSObject(); o.put("deleted", n); call.resolve(o);
    }

    // ------------------------------------------------------------------ alarmas (Samsung Reloj)
    /** Crea una alarma en el reloj de la tablet. days: 1 = domingo … 7 = sábado (Calendar.DAY_OF_WEEK), vacío = una sola vez. */
    @PluginMethod
    public void setAlarm(PluginCall call) {
        Integer hour = call.getInt("hour"), minute = call.getInt("minute", 0);
        if (hour == null || hour < 0 || hour > 23 || minute == null || minute < 0 || minute > 59) { call.reject("Hora no válida."); return; }
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
        i.putExtra(AlarmClock.EXTRA_HOUR, hour);
        i.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        i.putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("label", "Plan 20"));
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, !Boolean.FALSE.equals(call.getBoolean("skipUi", true)));
        JSArray days = call.getArray("days", new JSArray());
        if (days.length() > 0) {
            ArrayList<Integer> d = new ArrayList<>();
            try { for (int k = 0; k < days.length(); k++) { int x = days.getInt(k); if (x >= 1 && x <= 7) d.add(x); } } catch (Exception ignored) {}
            if (!d.isEmpty()) i.putExtra(AlarmClock.EXTRA_DAYS, d);
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (i.resolveActivity(getContext().getPackageManager()) == null) { call.reject("No encontré la app de reloj de la tablet.", "NO_CLOCK"); return; }
            getContext().startActivity(i);
            JSObject o = new JSObject(); o.put("ok", true); call.resolve(o);
        } catch (Exception ex) { call.reject("No pude crear la alarma: " + ex.getMessage()); }
    }

    /** Abre la lista de alarmas del reloj (para borrar o cambiar alguna a mano). */
    @PluginMethod
    public void showAlarms(PluginCall call) {
        try { getContext().startActivity(new Intent(AlarmClock.ACTION_SHOW_ALARMS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); call.resolve(); }
        catch (Exception ex) { call.reject("No pude abrir el reloj."); }
    }

    /** Próxima alarma de la tablet (la del reloj de Samsung u otra app de alarmas), en milisegundos, o 0. */
    @PluginMethod
    public void nextAlarm(PluginCall call) {
        JSObject o = new JSObject(); o.put("at", ShieldStore.systemNextAlarm(getContext())); call.resolve(o);
    }
}

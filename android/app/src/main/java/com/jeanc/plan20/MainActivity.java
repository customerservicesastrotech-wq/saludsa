package com.jeanc.plan20;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContinuousSpeechPlugin.class);
        registerPlugin(ShieldPlugin.class);
        super.onCreate(savedInstanceState);
        // Privacidad: oculta el contenido en "recientes" y bloquea capturas de pantalla.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}

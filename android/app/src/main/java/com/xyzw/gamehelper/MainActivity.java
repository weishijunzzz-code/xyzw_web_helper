package com.xyzw.gamehelper;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BinaryHttpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

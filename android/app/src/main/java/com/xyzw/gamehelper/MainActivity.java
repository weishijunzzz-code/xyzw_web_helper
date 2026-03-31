package com.xyzw.gamehelper;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BinaryHttpPlugin.class);
        super.onCreate(savedInstanceState);
        
        // 启用 WebView 调试 (debug 构建自动启用)
        WebView.setWebContentsDebuggingEnabled(true);
    }
}

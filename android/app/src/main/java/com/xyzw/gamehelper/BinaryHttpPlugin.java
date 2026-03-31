package com.xyzw.gamehelper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Base64;
import java.util.Iterator;

import org.json.JSONObject;

@CapacitorPlugin(name = "BinaryHttp")
public class BinaryHttpPlugin extends Plugin {

    @PluginMethod
    public void post(PluginCall call) {
        String url = call.getString("url");
        String base64Data = call.getString("data");
        JSObject headers = call.getObject("headers");

        if (url == null || base64Data == null) {
            call.reject("Missing required parameters: url or data");
            return;
        }

        try {
            // 解码 base64 数据
            byte[] postData = Base64.getDecoder().decode(base64Data);

            // 创建 HTTP 连接
            URL urlObj = new URL(url);
            HttpURLConnection connection = (HttpURLConnection) urlObj.openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setDoInput(true);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(30000);

            // 设置请求头
            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    String value = headers.getString(key);
                    connection.setRequestProperty(key, value);
                }
            }

            // 发送数据
            try (OutputStream os = connection.getOutputStream()) {
                os.write(postData);
                os.flush();
            }

            // 获取响应
            int responseCode = connection.getResponseCode();
            InputStream is;
            if (responseCode >= 200 && responseCode < 300) {
                is = connection.getInputStream();
            } else {
                is = connection.getErrorStream();
            }

            // 读取响应数据
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = is.read(buffer)) != -1) {
                baos.write(buffer, 0, bytesRead);
            }
            byte[] responseData = baos.toByteArray();

            // 将响应数据编码为 base64
            String responseBase64 = Base64.getEncoder().encodeToString(responseData);

            // 返回结果
            JSObject result = new JSObject();
            result.put("status", responseCode);
            result.put("data", responseBase64);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("HTTP request failed: " + e.getMessage(), e);
        }
    }
}

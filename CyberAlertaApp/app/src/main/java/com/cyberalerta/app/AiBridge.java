package com.cyberalerta.app;

import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * CyberAlerta - Puente de IA (Gemini API gratuita o /api/ia del servidor).
 */
public class AiBridge {

    private static final String GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=";
    private static final String SERVER_IA = "https://offlinevideoplayer.vercel.app/api/ia";

    @JavascriptInterface
    public String ask(String historyJson, String system, String key) {
        try {
            JSONArray history = new JSONArray(historyJson == null ? "[]" : historyJson);
            if (key != null && !key.trim().isEmpty()) {
                return gemini(key.trim(), system, history);
            }
            // Sin clave propia → IA del servidor (GEMINI_API_KEY/HF_TOKEN en Vercel)
            if (history.length() > 0) {
                String last = history.getJSONObject(history.length() - 1).optString("content", "");
                String url = SERVER_IA + "?q=" + URLEncoder.encode(last, "UTF-8");
                if (system != null && !system.isEmpty()) {
                    url += "&system=" + URLEncoder.encode(system, "UTF-8");
                }
                JSONObject d = new JSONObject(get(url));
                if (d.optBoolean("ok", false)) return d.optString("respuesta", "");
                return "__ERR__" + d.optString("error", "IA no configurada");
            }
            return "";
        } catch (Exception e) {
            return "__ERR__" + (e.getMessage() == null ? "error" : e.getMessage());
        }
    }

    private String gemini(String key, String system, JSONArray history) throws Exception {
        JSONObject body = new JSONObject();
        body.put("system_instruction", new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", system == null ? "" : system))));
        JSONArray contents = new JSONArray();
        for (int i = 0; i < history.length(); i++) {
            JSONObject h = history.getJSONObject(i);
            String role = "user".equals(h.optString("role", "user")) ? "user" : "model";
            JSONObject c = new JSONObject();
            c.put("role", role);
            c.put("parts", new JSONArray().put(new JSONObject().put("text", h.optString("content", ""))));
            contents.put(c);
        }
        if (contents.length() == 0) {
            contents.put(new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", "Hola"))));
        }
        body.put("contents", contents);

        String resp = post(GEMINI + URLEncoder.encode(key, "UTF-8"), body.toString());
        JSONObject d = new JSONObject(resp);
        JSONArray cands = d.optJSONArray("candidates");
        if (cands != null && cands.length() > 0) {
            JSONObject c0 = cands.getJSONObject(0);
            JSONObject content = c0.optJSONObject("content");
            if (content != null) {
                JSONArray parts = content.optJSONArray("parts");
                if (parts != null && parts.length() > 0) {
                    String txt = parts.getJSONObject(0).optString("text", "").trim();
                    if (!txt.isEmpty()) return txt;
                }
            }
            JSONObject err = c0.optJSONObject("finishReason");
            return "__ERR__" + (c0.has("finishReason") ? "El modelo no generó respuesta (bloqueo de seguridad)" : "Sin respuesta");
        }
        JSONObject err = d.optJSONObject("error");
        return "__ERR__" + (err == null ? "Error de IA" : err.optString("message", "Error"));
    }

    private String post(String urlStr, String jsonBody) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(45000);
        conn.setReadTimeout(45000);
        conn.setDoOutput(true);
        OutputStream os = conn.getOutputStream();
        os.write(jsonBody.getBytes("UTF-8"));
        os.close();
        int code = conn.getResponseCode();
        InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        StringBuilder sb = new StringBuilder();
        if (in != null) {
            BufferedReader br = new BufferedReader(new InputStreamReader(in, "UTF-8"));
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
        }
        conn.disconnect();
        return sb.toString();
    }

    private String get(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestProperty("User-Agent", "CyberAlerta/1.0");
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(12000);
        InputStream in = conn.getInputStream();
        BufferedReader br = new BufferedReader(new InputStreamReader(in, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        conn.disconnect();
        return sb.toString();
    }
}
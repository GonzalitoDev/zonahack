package com.cyberalerta.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private static final String UPDATE_JSON = "https://offlinevideoplayer.vercel.app/cyberalerta_version.json";
    private static final String UPDATE_APK  = "https://offlinevideoplayer.vercel.app/CyberAlerta.apk";

    private WebView webView;
    private long ultimaDescarga = -1;

    private final BroadcastReceiver descargaReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id == ultimaDescarga) {
                instalarApk(id);
            }
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#07090e"));
        getWindow().setNavigationBarColor(Color.parseColor("#07090e"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#07090e"));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        s.setLoadsImagesAutomatically(true);

        webView.addJavascriptInterface(new NewsBridge(), "News");
        webView.addJavascriptInterface(new AiBridge(), "AI");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception e) {}
                    return true;
                }
                return false;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");

        // Auto-actualización: se actualiza sola sin reinstalar
        registerReceiver(descargaReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        checkForUpdates();
    }

    // ─── AUTO-ACTUALIZACIÓN ───
    private void checkForUpdates() {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    String json = get(UPDATE_JSON);
                    JSONObject o = new JSONObject(json);
                    final String nueva = o.optString("version", "");
                    final String apkUrl = o.optString("apk", UPDATE_APK);
                    final String notas = o.optString("notes", "Se actualizó CyberAlerta.");
                    final String actual = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                    if (!nueva.isEmpty() && esMayor(nueva, actual)) {
                        runOnUiThread(new Runnable() { @Override public void run() {
                            mostrarActualizacion(nueva, apkUrl, notas);
                        }});
                    }
                } catch (Exception e) {}
            }
        }).start();
    }

    private void mostrarActualizacion(final String v, final String apkUrl, final String notas) {
        new AlertDialog.Builder(this)
                .setTitle("🛡️ CyberAlerta v" + v + " disponible")
                .setMessage("Hay una versión nueva.\n\n" + notas)
                .setPositiveButton("⬇ Actualizar ahora", (d, w) -> descargarApk(apkUrl))
                .setNegativeButton("Más tarde", null)
                .show();
    }

    private void descargarApk(String apkUrl) {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) return;
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(apkUrl));
            req.setTitle("CyberAlerta");
            req.setDescription("Descargando la actualización…");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "CyberAlerta.apk");
            ultimaDescarga = dm.enqueue(req);
            Toast.makeText(this, "Descargando actualización…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {}
    }

    private void instalarApk(long id) {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) return;
            Uri uri = dm.getUriForDownloadedFile(id);
            if (uri == null) return;
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Tocá el .apk descargado en Descargas para instalar", Toast.LENGTH_LONG).show();
        }
    }

    private boolean esMayor(String nueva, String actual) {
        try {
            String[] a = nueva.split("\\.");
            String[] b = actual.split("\\.");
            int len = Math.max(a.length, b.length);
            for (int i = 0; i < len; i++) {
                int na = i < a.length ? Integer.parseInt(a[i]) : 0;
                int nb = i < b.length ? Integer.parseInt(b[i]) : 0;
                if (na > nb) return true;
                if (na < nb) return false;
            }
            return false;
        } catch (Exception e) { return false; }
    }

    private String get(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestProperty("User-Agent", "CyberAlerta/1.0");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        InputStream in = conn.getInputStream();
        BufferedReader br = new BufferedReader(new InputStreamReader(in, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        conn.disconnect();
        return sb.toString();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        checkForUpdates(); // vuelve a chequear al abrir
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(descargaReceiver); } catch (Exception e) {}
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
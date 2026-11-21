package com.dbxplorer.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private static final String UPDATE_JSON = "https://offlinevideoplayer.vercel.app/dbxplorer_version.json";
    private static final String UPDATE_APK  = "https://offlinevideoplayer.vercel.app/DBXplorer.apk";

    private WebView webView;
    private long ultimaDescarga = -1;

    private final BroadcastReceiver descargaReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id == ultimaDescarga) instalarApk(id);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            crear();
        } catch (Throwable t) {
            mostrarError("No se pudo iniciar la app.\n\n" + (t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage()));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void crear() {
        try {
            getWindow().setStatusBarColor(Color.parseColor("#07090e"));
            getWindow().setNavigationBarColor(Color.parseColor("#07090e"));
        } catch (Throwable e) {}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                getWindow().getAttributes().layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            } catch (Throwable e) {}
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
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadsImagesAutomatically(true);

        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl() == null ? "" : request.getUrl().toString();
                if (url.startsWith("http")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Throwable e) {}
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                try {
                    Toast.makeText(MainActivity.this, "Sin conexión o error de carga", Toast.LENGTH_SHORT).show();
                } catch (Throwable e) {}
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Si el renderer del WebView crashea, no cerramos la app: mostramos un aviso
                runOnUiThread(new Runnable() {
                    @Override public void run() { mostrarError("La interfaz se cayó.\nReiniciá la app o probá de nuevo."); }
                });
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");

        try { registerReceiver(descargaReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)); } catch (Throwable e) {}
        checkForUpdates();
    }

    // Pantalla de error simple: evita que la app se cierre "sola"
    private void mostrarError(String msg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                try { if (webView != null) { webView.stopLoading(); } } catch (Throwable e) {}
                TextView tv = new TextView(MainActivity.this);
                tv.setText("🔎 DBXPLORER\n\n" + msg + "\n\nTocá atrás para cerrar y volvé a abrir.");
                tv.setTextColor(Color.parseColor("#d7e2ef"));
                tv.setGravity(Gravity.CENTER);
                tv.setTextSize(16);
                tv.setPadding(24, 24, 24, 24);
                tv.setBackgroundColor(Color.parseColor("#07090e"));
                setContentView(tv);
            }
        });
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
                    final String notas = o.optString("notes", "Se actualizó DBXplorer.");
                    final String actual = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                    if (!nueva.isEmpty() && esMayor(nueva, actual)) {
                        runOnUiThread(new Runnable() { @Override public void run() {
                            try {
                                new AlertDialog.Builder(MainActivity.this)
                                        .setTitle("🔎 DBXplorer v" + nueva + " disponible")
                                        .setMessage("Hay una versión nueva.\n\n" + notas)
                                        .setPositiveButton("⬇ Actualizar ahora", (d, w) -> descargarApk(apkUrl))
                                        .setNegativeButton("Más tarde", null)
                                        .show();
                            } catch (Throwable e) {}
                        }});
                    }
                } catch (Throwable e) {}
            }
        }).start();
    }

    private void descargarApk(String apkUrl) {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) return;
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(apkUrl));
            req.setTitle("DBXplorer");
            req.setDescription("Descargando la actualización…");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "DBXplorer.apk");
            ultimaDescarga = dm.enqueue(req);
            Toast.makeText(this, "Descargando actualización…", Toast.LENGTH_SHORT).show();
        } catch (Throwable e) {}
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
        } catch (Throwable e) {
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
        } catch (Throwable e) { return false; }
    }

    private String get(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestProperty("User-Agent", "DBXplorer/1.0");
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
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        try { if (webView != null) webView.onResume(); } catch (Throwable e) {}
    }

    @Override
    protected void onPause() {
        super.onPause();
        try { if (webView != null) webView.onPause(); } catch (Throwable e) {}
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(descargaReceiver); } catch (Throwable e) {}
        try { if (webView != null) webView.destroy(); } catch (Throwable e) {}
        super.onDestroy();
    }
}
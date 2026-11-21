package com.zonahack.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {

    private static final String PWA_URL = "https://offlinevideoplayer.vercel.app";
    private static final String APP_HOST = "offlinevideoplayer.vercel.app";
    private static final String INITIAL_URL = "https://offlinevideoplayer.vercel.app/#pelis";

    private FrameLayout root;
    private WebView webView;
    private WebSettings webSettings;
    private ProgressBar progressBar;
    private View splash;
    private View offlineOverlay;
    private LinearLayout topBar, bottomBar;
    private TextView[] navButtons = new TextView[5];
    private int activeNav = -1;
    private TextView connDot, userTxt;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private boolean inFullscreen = false;
    private boolean backPressedOnce = false;
    private boolean loaded = false;
    private boolean barsVisible = true;
    private String lastUrl = PWA_URL;
    private String pendingTab = null;

    private final BroadcastReceiver netReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            updateConnectionUI();
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#0a0a0a"));
        getWindow().setNavigationBarColor(Color.parseColor("#0a0a0a"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0a0a0a"));

        // ─── WebView ───
        webView = createWebView();
        FrameLayout.LayoutParams wv = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        wv.topMargin = dp(50);
        wv.bottomMargin = dp(58);
        root.addView(webView, wv);

        // ─── Barra superior nativa ───
        topBar = buildTopBar();
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(50));
        tp.gravity = Gravity.TOP;
        root.addView(topBar, tp);

        // ─── Barra de progreso ───
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(ColorStateList.valueOf(Color.parseColor("#00ff41")));
        progressBar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#1a1f42")));
        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(3));
        pp.topMargin = dp(50);
        pp.gravity = Gravity.TOP;
        root.addView(progressBar, pp);

        // ─── Barra inferior nativa ───
        bottomBar = buildBottomBar();
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(58));
        bp.gravity = Gravity.BOTTOM;
        root.addView(bottomBar, bp);

        // ─── Splash ───
        splash = buildSplash();
        root.addView(splash, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // ─── Pantalla sin conexión ───
        offlineOverlay = buildOffline();
        root.addView(offlineOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        offlineOverlay.setVisibility(View.GONE);

        // ─── Video HTML5 fullscreen ───
        customViewContainer = new FrameLayout(this);
        customViewContainer.setBackgroundColor(Color.BLACK);
        customViewContainer.setVisibility(View.GONE); // oculto hasta que haya video fullscreen
        root.addView(customViewContainer, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);

        setupWebView(webView);
        NotifHelper.ensureChannel(this);
        scheduleNotifWorker();
        handleNotifIntent(getIntent());
        webView.loadUrl(INITIAL_URL);
        updateConnectionUI();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleNotifIntent(intent);
    }

    private void handleNotifIntent(Intent intent) {
        try {
            if (intent == null) return;
            String u = intent.getStringExtra("url");
            if (u != null && u.length() > 1) {
                String full = "https://offlinevideoplayer.vercel.app" + u;
                if (webView != null) {
                    loaded = false;
                    webView.loadUrl(full);
                }
            }
        } catch (Exception e) {}
    }

    private void scheduleNotifWorker() {
        try {
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(NotifWorker.class, 15, TimeUnit.MINUTES).build();
            WorkManager.getInstance(this).enqueueUniquePeriodicWork("zh_notif_worker", ExistingPeriodicWorkPolicy.KEEP, req);
        } catch (Exception e) {}
    }

    // ─── Crear WebView ───
    private WebView createWebView() {
        WebView w = new WebView(this);
        w.setBackgroundColor(Color.parseColor("#0a0a0a"));
        return w;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView(WebView w) {
        WebSettings s = w.getSettings();
        webSettings = s;
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " ZonaHackApp/5.0");

        // ─── RENDIMIENTO ───
        // Renderizado por hardware: videos y animaciones mucho más fluidos
        w.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // Pre-renderiza la página invisible antes de mostrarla (arranque más rápido)
        s.setOffscreenPreRaster(true);
        // Prioridad alta del renderer mientras se carga
        s.setRenderPriority(WebSettings.RenderPriority.HIGH);
        // Cargar imágenes apenas se pueden
        s.setLoadsImagesAutomatically(true);
        // Habilitar el Service Worker de la PWA (sw.js): cachea la app,
        // segunda apertura casi instantánea y funciona sin internet
        enableServiceWorker();

        w.addJavascriptInterface(new AndroidBridge(), "AndroidApp");

        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                if (newProgress >= 100) {
                    if (!loaded) { loaded = true; hideSplash(); }
                    offlineOverlay.setVisibility(View.GONE);
                }
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                customViewContainer.addView(customView);
                customViewContainer.setVisibility(View.VISIBLE);
                setSystemUi(true);
                // Video en pantalla completa → rotar a horizontal automáticamente
                try { setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE); } catch (Exception e) {}
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                customViewContainer.removeView(customView);
                customView = null;
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                if (customViewCallback != null) customViewCallback.onCustomViewHidden();
                customViewCallback = null;
                setSystemUi(inFullscreen);
                // Restaurar la orientación normal al salir del video
                try { setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED); } catch (Exception e) {}
            }
        });

        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                lastUrl = url;
                if (!loaded) { loaded = true; hideSplash(); }
                offlineOverlay.setVisibility(View.GONE);
                if (pendingTab != null) {
                    String t = pendingTab;
                    pendingTab = null;
                    doTab(t);
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                if (!isOnline()) showOffline();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // El renderer de la WebView crasheó → recreamos la WebView
                if (!detail.didCrash()) {
                    Toast.makeText(MainActivity.this, "El proceso de la WebView terminó", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(MainActivity.this, "Recuperando la app...", Toast.LENGTH_SHORT).show();
                }
                recreateWebView();
                return true;
            }
        });

        w.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimetype, long contentLength) {
                try {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setMimeType(mimetype);
                    req.setTitle(URLUtil.guessFileName(url, contentDisposition, mimetype));
                    req.setDescription("ZonaHack");
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                            URLUtil.guessFileName(url, contentDisposition, mimetype));
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) dm.enqueue(req);
                    Toast.makeText(MainActivity.this, "Descargando...", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception e2) {}
                }
            }
        });
    }

    private void recreateWebView() {
        try {
            if (webView != null) root.removeView(webView);
            webView = createWebView();
            FrameLayout.LayoutParams wv = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
            wv.topMargin = dp(50);
            wv.bottomMargin = dp(58);
            root.addView(webView, 0, wv);
            setupWebView(webView);
            webView.loadUrl(lastUrl);
        } catch (Exception e) {}
    }

    // Activa el Service Worker de la PWA para que cachee la app
    private void enableServiceWorker() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                ServiceWorkerController swc = ServiceWorkerController.getInstance();
                swc.setServiceWorkerClient(new ServiceWorkerClient() {});
            }
        } catch (Exception e) {}
    }

    private boolean handleUrl(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost() == null ? "" : u.getHost();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("tel") || scheme.equals("mailto")) {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
                return true;
            }
            if (host.equals(APP_HOST) || host.endsWith(".vercel.app")) {
                webView.loadUrl(url);
                return true;
            }
            startActivity(new Intent(Intent.ACTION_VIEW, u));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ─── BARRAS NATIVAS ───
    private LinearLayout buildTopBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.parseColor("#0d0f0d"));
        bar.setPadding(dp(10), dp(2), dp(8), dp(2));
        bar.setElevation(dp(4));

        TextView logo = new TextView(this);
        logo.setText("\uD83D\uDC80"); // 💀
        logo.setTextSize(18);
        logo.setLayoutParams(new LinearLayout.LayoutParams(dp(34), dp(34)));
        logo.setGravity(Gravity.CENTER);

        LinearLayout ttlBox = new LinearLayout(this);
        ttlBox.setOrientation(LinearLayout.VERTICAL);
        ttlBox.setPadding(dp(8), 0, dp(8), 0);
        TextView ttl = new TextView(this);
        ttl.setText("ZONAHACK");
        ttl.setTextColor(Color.parseColor("#00ff41"));
        ttl.setTextSize(14);
        ttl.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        ttl.setLetterSpacing(0.06f);
        userTxt = new TextView(this);
        userTxt.setText("");
        userTxt.setTextColor(Color.parseColor("#8a8a8a"));
        userTxt.setTextSize(10);
        userTxt.setTypeface(Typeface.MONOSPACE);
        ttlBox.addView(ttl);
        ttlBox.addView(userTxt);

        connDot = new TextView(this);
        connDot.setText("\uD83D\uDD35"); // 🔵
        connDot.setTextSize(11);

        TextView reload = makeIconBtn("\u21BB");
        reload.setOnClickListener(v -> { if (webView != null) webView.reload(); });

        TextView fs = makeIconBtn("\u26F6");
        fs.setOnClickListener(v -> setFullscreenMode(!inFullscreen));

        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        bar.addView(logo);
        bar.addView(ttlBox, lp1);
        bar.addView(connDot);
        bar.addView(reload);
        bar.addView(fs);
        return bar;
    }

    private TextView makeIconBtn(String icon) {
        TextView b = new TextView(this);
        b.setText(icon);
        b.setTextSize(16);
        b.setTextColor(Color.parseColor("#00ff41"));
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(9), dp(4), dp(9), dp(4));
        return b;
    }

    private LinearLayout buildBottomBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER);
        bar.setBackgroundColor(Color.parseColor("#0d0f0d"));
        bar.setElevation(dp(8));

        String[] icons = {"\uD83C\uDFE0", "\uD83C\uDF7F", "\uD83D\uDCE5", "\u2764\uFE0F", "\u2630\uFE0F"};
        String[] labels = {"Inicio", "Películas", "Offline", "Favoritos", "Más"};

        for (int i = 0; i < 5; i++) {
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER);
            item.setPadding(0, dp(4), 0, dp(2));
            final int idx = i;
            item.setOnClickListener(v -> onNavClick(idx));

            TextView ic = new TextView(this);
            ic.setText(icons[i]);
            ic.setTextSize(17);
            TextView lb = new TextView(this);
            lb.setText(labels[i]);
            lb.setTextSize(9);
            lb.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);

            item.addView(ic);
            item.addView(lb);

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f);
            bar.addView(item, lp);
            if (i == 0) navButtons[0] = lb;
            else if (i == 1) navButtons[1] = lb;
            else if (i == 2) navButtons[2] = lb;
            else if (i == 3) navButtons[3] = lb;
            else navButtons[4] = lb;
        }
        highlightNav(-1);
        return bar;
    }

    private void onNavClick(int idx) {
        switch (idx) {
            case 0: evalTab("buscar"); break;
            case 1: evalTab("pelis"); break;
            case 2: evalTab("offline"); break;
            case 3: evalTab("favoritos"); break;
            case 4: showMoreMenu(); break;
        }
    }

    private void evalTab(String id) {
        if (webView == null) return;
        pendingTab = id;
        if (loaded) doTab(id);
    }

    private void doTab(String id) {
        try {
            webView.evaluateJavascript(
                "try{window.ZHAppTab&&window.ZHAppTab('" + id + "')}catch(e){};" +
                "try{window.location.hash='" + id + "'}catch(e){}", null);
        } catch (Exception e) {}
    }

    private void highlightNav(int idx) {
        activeNav = idx;
        for (int i = 0; i < navButtons.length; i++) {
            if (navButtons[i] == null) continue;
            navButtons[i].setTextColor(i == idx ? Color.parseColor("#00ff41") : Color.parseColor("#7a7a7a"));
        }
    }

    private void showMoreMenu() {
        String[] items = {
                "🎵 Música", "⚔ Militar", "📦 Base de datos",
                "🍥 Anime", "🎮 Juegos", "📺 Historial", "📊 Perfil",
                "🔄 Actualizaciones", "🎫 Soporte", "📱 Descargar APK"
        };
        new AlertDialog.Builder(this)
                .setTitle("Menú ZonaHack")
                .setItems(items, (d, which) -> {
                    switch (which) {
                        case 0: evalTab("musica"); break;
                        case 1: evalTab("militar"); break;
                        case 2: evalTab("database"); break;
                        case 3: openPage("/anime.html"); break;
                        case 4: openPage("/juegos.html"); break;
                        case 5: openPage("/historial.html"); break;
                        case 6: openPage("/perfil.html"); break;
                        case 7: openPage("/actualizaciones.html"); break;
                        case 8: openPage("/soporte.html"); break;
                        case 9: openPage("/descargar_apk.html"); break;
                    }
                    highlightNav(4);
                })
                .setNegativeButton("Cerrar", null)
                .show();
    }

    private void openPage(String path) {
        if (webView == null) return;
        loaded = false;
        webView.loadUrl("https://offlinevideoplayer.vercel.app" + path);
    }

    // ─── PUENTE JS ───
    private class AndroidBridge {
        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void setFullscreen(final boolean on) {
            runOnUiThread(() -> setFullscreenMode(on));
        }

        @JavascriptInterface
        public void setScreenOn(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void setUser(final String name) {
            runOnUiThread(() -> {
                if (userTxt != null) userTxt.setText("@" + (name == null ? "" : name));
            });
        }

        @JavascriptInterface
        public void onTab(final String id) {
            runOnUiThread(() -> {
                if (id == null) { highlightNav(-1); return; }
                switch (id) {
                    case "buscar": highlightNav(0); break;
                    case "pelis": highlightNav(1); break;
                    case "offline": highlightNav(2); break;
                    case "favoritos": highlightNav(3); break;
                    default: highlightNav(4); break;
                }
            });
        }

        @JavascriptInterface
        public String getVersion() {
            return "ZonaHackApp/5.0";
        }

        @JavascriptInterface
        public void showNotification(final String json) {
            runOnUiThread(() -> {
                try {
                    JSONObject o = new JSONObject(json);
                    NotifHelper.post(MainActivity.this,
                            o.optString("title", "ZonaHack"),
                            o.optString("body", ""),
                            o.optString("url", "/"));
                } catch (Exception e) {}
            });
        }
    }

    // ─── SPLASH ───
    private View buildSplash() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundResource(R.drawable.splash_bg);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        int size = dp(110);
        logo.setLayoutParams(new LinearLayout.LayoutParams(size, size));

        TextView titulo = new TextView(this);
        titulo.setText("ZONAHACK");
        titulo.setTextColor(Color.parseColor("#00ff41"));
        titulo.setTextSize(26);
        titulo.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        titulo.setLetterSpacing(0.1f);
        titulo.setGravity(Gravity.CENTER);
        titulo.setShadowLayer(12, 0, 0, Color.parseColor("#6600ff41"));

        TextView sub = new TextView(this);
        sub.setText("PELICULAS · ANIME · OFFLINE");
        sub.setTextColor(Color.parseColor("#55ff41"));
        sub.setTextSize(11);
        sub.setTypeface(Typeface.MONOSPACE);
        sub.setLetterSpacing(0.15f);
        sub.setPadding(0, dp(8), 0, 0);

        box.addView(logo);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tl.setMargins(0, dp(14), 0, 0);
        box.addView(titulo, tl);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        sl.setMargins(0, dp(4), 0, 0);
        box.addView(sub, sl);

        box.setVisibility(View.VISIBLE);
        return box;
    }

    private void hideSplash() {
        if (splash == null || splash.getVisibility() != View.VISIBLE) return;
        splash.animate().alpha(0f).setDuration(350).withEndAction(() -> splash.setVisibility(View.GONE));
    }

    // ─── SIN CONEXIÓN ───
    private View buildOffline() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#e80a0a0a"));

        TextView ic = new TextView(this);
        ic.setText("\uD83D\uDCE1"); // 📡
        ic.setTextSize(40);
        TextView msg = new TextView(this);
        msg.setText("Sin conexión");
        msg.setTextColor(Color.parseColor("#ffffff"));
        msg.setTextSize(16);
        msg.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        TextView sub = new TextView(this);
        sub.setText("Comprobá tu internet e intentá de nuevo");
        sub.setTextColor(Color.parseColor("#9a9a9a"));
        sub.setTextSize(12);

        TextView btn = new TextView(this);
        btn.setText("⟳ Reintentar");
        btn.setTextColor(Color.parseColor("#03140a"));
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(24), dp(12), dp(24), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#00ff41"));
        bg.setCornerRadius(dp(12));
        btn.setBackground(bg);
        btn.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        btn.setOnClickListener(v -> {
            offlineOverlay.setVisibility(View.GONE);
            if (webView != null) webView.reload();
        });

        LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp1.setMargins(0, dp(10), 0, 0);
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp2.setMargins(0, dp(6), 0, 0);
        LinearLayout.LayoutParams lp3 = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp3.setMargins(0, dp(22), 0, 0);

        box.addView(ic);
        box.addView(msg, lp1);
        box.addView(sub, lp2);
        box.addView(btn, lp3);
        return box;
    }

    private void showOffline() {
        if (offlineOverlay != null) offlineOverlay.setVisibility(View.VISIBLE);
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network net = cm.getActiveNetwork();
                if (net == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(net);
                return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    private void updateConnectionUI() {
        boolean on = isOnline();
        if (connDot != null) connDot.setText(on ? "\uD83D\uDFE2" : "\uD83D\uDD34"); // 🟢 / 🔴
        if (!on && loaded) showOffline();
        // Sin internet → usar caché; con internet → red normal (más rápido)
        if (webSettings != null) {
            webSettings.setCacheMode(on ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);
        }
    }

    // ─── PANTALLA COMPLETA ───
    private void setFullscreenMode(boolean on) {
        inFullscreen = on;
        setSystemUi(on);
        if (on) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setBarsVisible(false);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setBarsVisible(true);
        }
    }

    private void setBarsVisible(boolean show) {
        barsVisible = show;
        if (topBar != null) topBar.setVisibility(show ? View.VISIBLE : View.GONE);
        if (bottomBar != null) bottomBar.setVisibility(show ? View.VISIBLE : View.GONE);
        FrameLayout.LayoutParams wv = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        wv.topMargin = show ? dp(50) : 0;
        wv.bottomMargin = show ? dp(58) : 0;
        if (webView != null) webView.setLayoutParams(wv);
    }

    private void setSystemUi(boolean hide) {
        View decor = getWindow().getDecorView();
        if (hide) {
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    // ─── NAVEGACIÓN ───
    @Override
    public void onBackPressed() {
        if (customView != null) {
            webView.getWebChromeClient().onHideCustomView();
            return;
        }
        if (inFullscreen) {
            setFullscreenMode(false);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        if (backPressedOnce) {
            finish();
            return;
        }
        backPressedOnce = true;
        Toast.makeText(this, "Presioná atrás otra vez para salir", Toast.LENGTH_SHORT).show();
        new Handler(Looper.getMainLooper()).postDelayed(() -> backPressedOnce = false, 2000);
    }

    @Override
    protected void onStart() {
        super.onStart();
        try {
            registerReceiver(netReceiver, new IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION));
        } catch (Exception e) {}
    }

    @Override
    protected void onStop() {
        super.onStop();
        try {
            unregisterReceiver(netReceiver);
        } catch (Exception e) {}
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        if (webView != null) webView.restoreState(savedInstanceState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        if (loaded && inFullscreen) setSystemUi(true);
        updateConnectionUI();
        // Verificar novedades al abrir la app (películas, actualizaciones, anuncios)
        try {
            WorkManager.getInstance(this).enqueue(new OneTimeWorkRequest.Builder(NotifWorker.class).build());
        } catch (Exception e) {}
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    // ─── NOTIFICACIONES TIPO WHATSAPP ───
    public static class NotifHelper {
        private static final String CHANNEL = "zh_notif";

        public static void ensureChannel(Context ctx) {
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    NotificationChannel ch = new NotificationChannel(CHANNEL, "ZonaHack",
                            NotificationManager.IMPORTANCE_HIGH);
                    ch.setDescription("Notificaciones de ZonaHack");
                    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.createNotificationChannel(ch);
                }
            } catch (Exception e) {}
        }

        public static void post(Context ctx, String tit, String msg, String url) {
            try {
                ensureChannel(ctx);
                Intent i = new Intent(ctx, MainActivity.class);
                i.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                i.putExtra("url", url == null ? "/" : url);
                PendingIntent pi = PendingIntent.getActivity(ctx, 0, i,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

                Notification.Builder b = Build.VERSION.SDK_INT >= 26
                        ? new Notification.Builder(ctx, CHANNEL)
                        : new Notification.Builder(ctx);
                b.setSmallIcon(R.drawable.ic_launcher_foreground)
                        .setContentTitle(tit)
                        .setContentText(msg)
                        .setStyle(new Notification.BigTextStyle().bigText(msg))
                        .setContentIntent(pi)
                        .setAutoCancel(true)
                        .setPriority(Notification.PRIORITY_HIGH)
                        .setDefaults(Notification.DEFAULT_ALL); // sonido + vibración

                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
                }
            } catch (Exception e) {}
        }
    }

    public static class NotifWorker extends Worker {
        private static final String SUPABASE = "https://xfwolaurpeofysnymqle.supabase.co/rest/v1";
        private static final String KEY = "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";

        public NotifWorker(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            try {
                SharedPreferences sp = getApplicationContext().getSharedPreferences("zh_notif", Context.MODE_PRIVATE);

                // Anuncios oficiales activos
                JSONObject anu = getUltimo("anuncios?select=id,titulo,mensaje,url&activo=eq.true&order=id.desc&limit=1");
                if (anu != null) {
                    long id = anu.optLong("id", 0);
                    if (id > sp.getLong("last_anuncio", 0)) {
                        NotifHelper.post(getApplicationContext(),
                                anu.optString("titulo", "ZonaHack"),
                                anu.optString("mensaje", ""),
                                anu.optString("url", "/"));
                        sp.edit().putLong("last_anuncio", id).apply();
                    }
                }

                // Películas/videos nuevos en la base
                JSONObject vid = getUltimo("videos?select=id,titulo&order=id.desc&limit=1");
                if (vid != null) {
                    long id = vid.optLong("id", 0);
                    if (id > sp.getLong("last_video", 0)) {
                        NotifHelper.post(getApplicationContext(),
                                "🎬 Nueva película",
                                vid.optString("titulo", "Hay una película nueva"),
                                "/#pelis");
                        sp.edit().putLong("last_video", id).apply();
                    }
                }

                // Actualizaciones de la app
                JSONObject act = getUltimo("actualizaciones?select=id,titulo,mensaje&order=id.desc&limit=1");
                if (act != null) {
                    long id = act.optLong("id", 0);
                    if (id > sp.getLong("last_actualizacion", 0)) {
                        NotifHelper.post(getApplicationContext(),
                                "🔄 " + act.optString("titulo", "Nueva actualización"),
                                act.optString("mensaje", "Revisá lo nuevo en ZonaHack"),
                                "/actualizaciones.html");
                        sp.edit().putLong("last_actualizacion", id).apply();
                    }
                }
            } catch (Exception e) {}
            return Result.success();
        }

        private JSONObject getUltimo(String q) {
            try {
                URL u = new URL(SUPABASE + "/" + q);
                HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                conn.setRequestProperty("apikey", KEY);
                conn.setRequestProperty("Authorization", "Bearer " + KEY);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                int code = conn.getResponseCode();
                JSONObject r = null;
                if (code == 200) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    br.close();
                    JSONArray arr = new JSONArray(sb.toString());
                    if (arr.length() > 0) r = arr.getJSONObject(0);
                }
                conn.disconnect();
                return r;
            } catch (Exception e) {
                return null;
            }
        }
    }
}
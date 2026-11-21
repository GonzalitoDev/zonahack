package com.cyberalerta.app;

import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

/**
 * CyberAlerta - Puente de noticias.
 * Trae los feeds RSS/Atom de seguridad y devuelve un JSON a la interfaz (assets/index.html).
 */
public class NewsBridge {

    private static final String[] FEED_NAMES  = {"The Hacker News", "Bleeping Computer", "Krebs on Security", "SecurityWeek", "Threatpost", "Hackplayers", "Unaaldía (HispaSec)", "WeLiveSecurity ES"};
    private static final String[] FEED_COLORS = {"#ff5a5a", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22", "#1abc9c", "#e84393"};
    private static final String[] FEED_URLS   = {
            "https://feeds.feedburner.com/TheHackersNews",
            "https://www.bleepingcomputer.com/feed/",
            "https://krebsonsecurity.com/feed/",
            "https://www.securityweek.com/feed/",
            "https://threatpost.com/feed/",
            "https://www.hackplayers.com/feeds/posts/default?alt=rss",
            "https://unaaldia.hispasec.com/feed",
            "https://www.welivesecurity.com/la-es/feed/"
    };

    public static class Articulo {
        String titulo, link, fecha, resumen, fuente, color, img;
    }

    @JavascriptInterface
    public String getNews() {
        JSONArray out = new JSONArray();
        List<Articulo> lista = new ArrayList<>();
        for (int i = 0; i < FEED_URLS.length; i++) {
            try {
                String xml = descargar(FEED_URLS[i]);
                List<Articulo> items = parsear(xml);
                for (Articulo a : items) {
                    a.fuente = FEED_NAMES[i];
                    a.color = FEED_COLORS[i];
                    lista.add(a);
                }
            } catch (Exception ignored) {}
        }

        // Ordenar por fecha desc
        Collections.sort(lista, new Comparator<Articulo>() {
            @Override
            public int compare(Articulo a, Articulo b) {
                long ta = a.fecha == null ? 0 : safeParse(a.fecha);
                long tb = b.fecha == null ? 0 : safeParse(b.fecha);
                return Long.compare(tb, ta);
            }
        });

        int max = Math.min(lista.size(), 200);
        for (int i = 0; i < max; i++) {
            Articulo a = lista.get(i);
            try {
                JSONObject o = new JSONObject();
                o.put("title", a.titulo == null ? "" : a.titulo);
                o.put("link", a.link == null ? "" : a.link);
                o.put("date", a.fecha == null ? "" : a.fecha);
                o.put("snippet", a.resumen == null ? "" : a.resumen);
                o.put("source", a.fuente);
                o.put("color", a.color);
                o.put("img", a.img == null ? "" : a.img);
                out.put(o);
            } catch (Exception ignored) {}
        }
        return out.toString();
    }

    private long safeParse(String s) {
        try { return java.util.Date.parse(s); } catch (Exception e) { return 0; }
    }

    private String descargar(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestProperty("User-Agent", "CyberAlerta/1.0 (Android)");
        conn.setRequestProperty("Accept", "application/rss+xml, application/xml, text/xml, */*");
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(12000);
        int code = conn.getResponseCode();
        if (code >= 300 && code < 400 && conn.getHeaderField("Location") != null) {
            String loc = conn.getHeaderField("Location");
            conn.disconnect();
            return descargar(loc);
        }
        if (code != 200) { conn.disconnect(); return ""; }
        InputStream in = conn.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
        in.close();
        conn.disconnect();
        return bos.toString("UTF-8");
    }

    private List<Articulo> parsear(String xml) {
        List<Articulo> lista = new ArrayList<>();
        if (xml == null || xml.isEmpty()) return lista;
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setExpandEntityReferences(false);
            DocumentBuilder b = f.newDocumentBuilder();
            Document doc = b.parse(new java.io.ByteArrayInputStream(xml.getBytes("UTF-8")));
            Element root = doc.getDocumentElement();
            if (root == null) return lista;

            boolean atom = root.getTagName().equalsIgnoreCase("feed");
            NodeList items = root.getElementsByTagName(atom ? "entry" : "item");
            for (int i = 0; i < items.getLength(); i++) {
                Node node = items.item(i);
                if (node.getNodeType() != Node.ELEMENT_NODE) continue;
                Element el = (Element) node;
                Articulo a = new Articulo();
                a.titulo = texto(el, "title");
                if (atom) {
                    a.link = attr(el, "link", "href");
                } else {
                    a.link = texto(el, "link");
                }
                a.fecha = !texto(el, "pubDate").isEmpty() ? texto(el, "pubDate")
                        : !texto(el, "updated").isEmpty() ? texto(el, "updated")
                        : texto(el, "published");
                String desc = texto(el, atom ? "summary" : "description");
                a.resumen = limpiar(desc);
                a.img = extraerImg(el, desc);
                if (a.titulo == null || a.titulo.isEmpty() || a.link == null || a.link.isEmpty()) continue;
                lista.add(a);
            }
        } catch (Exception ignored) {}
        return lista;
    }

    private String texto(Element el, String tag) {
        NodeList nl = el.getElementsByTagName(tag);
        if (nl.getLength() == 0) return "";
        return nl.item(0).getTextContent() == null ? "" : nl.item(0).getTextContent().trim();
    }

    private String attr(Element el, String tag, String att) {
        NodeList nl = el.getElementsByTagName(tag);
        for (int i = 0; i < nl.getLength(); i++) {
            Node n = nl.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE) {
                String v = ((Element) n).getAttribute(att);
                if (!v.isEmpty()) return v;
            }
        }
        return "";
    }

    private String limpiar(String html) {
        if (html == null) return "";
        String s = html.replaceAll("(?s)<[^>]*>", " ").replaceAll("\\s+", " ").trim();
        s = s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
             .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ");
        return s.length() > 240 ? s.substring(0, 240) : s;
    }

    private String extraerImg(Element el, String desc) {
        try {
            NodeList media = el.getElementsByTagNameNS("*", "content");
            for (int i = 0; i < media.getLength(); i++) {
                Node n = media.item(i);
                if (n.getNodeType() == Node.ELEMENT_NODE && n.getNodeName().toLowerCase().contains("media")) {
                    String u = ((Element) n).getAttribute("url");
                    if (!u.isEmpty()) return u;
                }
            }
            NodeList enc = el.getElementsByTagName("enclosure");
            if (enc.getLength() > 0) {
                String u = ((Element) enc.item(0)).getAttribute("url");
                if (!u.isEmpty()) return u;
            }
            if (desc != null) {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("<img[^>]+src=\"([^\"]+)\"", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(desc);
                if (m.find()) return m.group(1);
            }
        } catch (Exception e) {}
        return "";
    }
}
/**
 * VideoHub - Sistema Realtime Global v2
 * Conexion unica WebSocket a Supabase Realtime.
 * Requiere que las tablas esten PUBLICADAS en Supabase.
 * 
 * CONFIGURACION EN SUPABASE:
 * https://supabase.com/dashboard/project/xfwolaurpeofysnymqle/realtime/publisher
 * Agregar TODAS las tablas: usuarios, videos, progreso, favoritos, logs,
 * visitas, vip, amigos, insignias, salas, sala_usuarios, sala_mensajes,
 * sala_reacciones, mantenimiento, juegos_puntuaciones
 */
var REALTIME = (function() {
    "use strict";

    var SUPABASE_URL = "https://xfwolaurpeofysnymqle.supabase.co";
    var SUPABASE_KEY = "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";
    var WS_URL = "wss://xfwolaurpeofysnymqle.supabase.co/realtime/v1/websocket?apikey=" + SUPABASE_KEY + "&vsn=1.0.0";

    var ws = null;
    var conectado = false;
    var handlers = {};
    var reconnectTimer = null;
    var reconnectAttempts = 0;
    var heartbeatInterval = null;

    // Todas las tablas que queremos escuchar
    var TABLAS = [
        "usuarios", "videos", "progreso", "favoritos", "logs",
        "visitas", "vip", "amigos", "insignias",
        "salas", "sala_usuarios", "sala_mensajes", "sala_reacciones",
        "mantenimiento", "juegos_puntuaciones",
    ];

    function conectar() {
        if (ws && ws.readyState === WebSocket.OPEN) return;
        if (ws && ws.readyState === WebSocket.CONNECTING) return;

        try {
            ws = new WebSocket(WS_URL);
        } catch (e) {
            programarReconexion();
            return;
        }

        ws.onopen = function() {
            conectado = true;
            reconnectAttempts = 0;
            dispatcar("conexion", {estado: "conectado"});

            // Iniciar heartbeat para mantener conexion viva
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(function() {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({topic: "phoenix", event: "heartbeat", payload: {}, ref: Date.now()}));
                }
            }, 15000);

            // Suscribirse a cambios en cada tabla
            // Formato correcto para Supabase Realtime
            TABLAS.forEach(function(t, i) {
                var msg = {
                    topic: "realtime:" + t,
                    event: "phx_join",
                    payload: {},
                    ref: i + 1,
                };
                ws.send(JSON.stringify(msg));
            });
        };

        ws.onmessage = function(e) {
            try {
                var msg = JSON.parse(e.data);

                // Ignorar respuestas del sistema
                if (msg.event === "phx_reply") return;
                if (msg.event === "heartbeat") return;

                // Eventos de cambios en base de datos
                if (msg.event === "INSERT" || msg.event === "UPDATE" || msg.event === "DELETE") {
                    var tabla = "";
                    if (msg.topic) tabla = msg.topic.replace("realtime:", "");

                    var payload = msg.payload || {};
                    var nuevos = payload.record || {};
                    var viejos = payload.old_record || {};

                    var datos = {
                        evento: msg.event,
                        tabla: tabla,
                        nuevos: nuevos,
                        viejos: viejos,
                        timestamp: Date.now(),
                    };

                    // Evento generico por tabla
                    dispatcar("db:" + tabla, datos);

                    // Eventos especificos
                    dispatcar("db:" + tabla + ":" + msg.event.toLowerCase(), nuevos);
                }
            } catch (err) {
                // Error silencioso
            }
        };

        ws.onclose = function() {
            conectado = false;
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            dispatcar("conexion", {estado: "desconectado"});
            programarReconexion();
        };

        ws.onerror = function() {
            // onclose se dispara automaticamente despues
        };
    }

    function programarReconexion() {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectAttempts++;
        var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 15000);
        dispatcar("reconexion", {intento: reconnectAttempts, delay: delay});
        reconnectTimer = setTimeout(conectar, delay);
    }

    function dispatcar(evento, datos) {
        if (handlers["*"]) {
            handlers["*"].forEach(function(h) {
                try { h(evento, datos); } catch (e) {}
            });
        }
        if (handlers[evento]) {
            handlers[evento].forEach(function(h) {
                try { h(datos); } catch (e) {}
            });
        }
    }

    return {
        iniciar: function() {
            if (!conectado && (!ws || ws.readyState !== WebSocket.CONNECTING)) {
                conectar();
            }
            return this;
        },

        en: function(evento, handler) {
            if (!handlers[evento]) handlers[evento] = [];
            handlers[evento].push(handler);
            return this;
        },

        off: function(evento, handler) {
            if (!handlers[evento]) return;
            if (handler) {
                handlers[evento] = handlers[evento].filter(function(h) { return h !== handler; });
            } else {
                delete handlers[evento];
            }
            return this;
        },

        estado: function() {
            return conectado ? "conectado" : "desconectado";
        },

        cerrar: function() {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            if (ws) { ws.onclose = null; ws.close(); ws = null; }
            conectado = false;
            handlers = {};
        },

        reconectar: function() {
            reconnectAttempts = 0;
            if (ws) { try { ws.close(); } catch (e) {} }
            conectar();
        },
    };
})();

// Iniciar automaticamente
REALTIME.iniciar();

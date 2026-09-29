/**
 * VideoHub - Base de datos Supabase completa
 * Registra usuario, progreso, favoritos y logs automaticamente
 */
const SUPABASE_URL = "https://xfwolaurpeofysnymqle.supabase.co";
const SUPABASE_KEY = "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";

class Database {
    constructor() {
        this.url = SUPABASE_URL;
        this.key = SUPABASE_KEY;
        this.headers = {
            "Content-Type": "application/json",
            "apikey": this.key,
            "Authorization": `Bearer ${this.key}`,
        };
        this._initUsuario();
    }

    _initUsuario() {
        try {
            this.nombreUsuario = localStorage.getItem("vh_usuario") || "";
            if (!this.nombreUsuario) {
                this.nombreUsuario = "user_" + Date.now().toString(36).slice(-4);
                localStorage.setItem("vh_usuario", this.nombreUsuario);
            }
        } catch (e) {
            this.nombreUsuario = "anon";
        }
    }

    getNombreUsuario() {
        return this.nombreUsuario;
    }

    async setNombreUsuario(nombre) {
        this.nombreUsuario = (nombre || "anon").slice(0, 50);
        try { localStorage.setItem("vh_usuario", this.nombreUsuario); } catch (e) {}
        await this.log(null, "registro", "Usuario: " + this.nombreUsuario);
    }

    async _fetch(endpoint, options = {}) {
        try {
            const url = `${this.url}/rest/v1/${endpoint}`;
            const res = await fetch(url, {
                ...options,
                headers: { ...this.headers, ...options.headers },
            });
            if (!res.ok) {
                const err = await res.text();
                console.warn("DB:", err.slice(0, 100));
                return null;
            }
            return await res.json();
        } catch (e) {
            console.warn("DB:", e.message);
            return null;
        }
    }

    // ─── LOGS ─────────────────────────────
    async log(usuarioId, accion, detalle = "", pagina = "") {
        try {
            await this._fetch("logs", {
                method: "POST",
                headers: { "Prefer": "return=minimal" },
                body: JSON.stringify({
                    usuario_id: usuarioId || null,
                    usuario_nombre: this.nombreUsuario,
                    accion: (accion || "").slice(0, 100),
                    detalle: (detalle || "").slice(0, 300),
                    pagina: (pagina || window.location.pathname || "").slice(0, 100),
                    created_at: new Date().toISOString(),
                }),
            });
        } catch (e) {}
    }

    async obtenerLogs(usuarioId = null, limite = 50) {
        let q = `logs?order=created_at.desc&limit=${limite}`;
        if (usuarioId) q += `&usuario_id=eq.${usuarioId}`;
        return this._fetch(q);
    }

    // ─── PROGRESO ─────────────────────────
    async guardarProgreso(usuarioId, videoId, titulo, progreso) {
        const existente = await this._fetch(
            `progreso?select=id&usuario_id=eq.${usuarioId}&video_id=eq.${encodeURIComponent(videoId)}&limit=1`
        );
        if (existente && existente.length > 0) {
            await this._fetch(
                `progreso?usuario_id=eq.${usuarioId}&video_id=eq.${encodeURIComponent(videoId)}`,
                {
                    method: "PATCH",
                    headers: { "Prefer": "return=minimal" },
                    body: JSON.stringify({ progreso: Math.min(progreso || 0, 95), ultima_reproduccion: new Date().toISOString() }),
                }
            );
        } else {
            await this._fetch("progreso", {
                method: "POST",
                headers: { "Prefer": "return=minimal" },
                body: JSON.stringify({
                    usuario_id: usuarioId,
                    video_id: videoId,
                    titulo: (titulo || "").slice(0, 80),
                    progreso: Math.min(progreso || 0, 95),
                }),
            });
        }
        this.log(usuarioId, "progreso", `${progreso}% - ${(titulo||"").slice(0,50)}`);
    }

    async obtenerProgreso(usuarioId, videoId) {
        const res = await this._fetch(
            `progreso?usuario_id=eq.${usuarioId}&video_id=eq.${encodeURIComponent(videoId)}&limit=1`
        );
        return res && res.length > 0 ? res[0] : null;
    }

    async obtenerTodoElProgreso(usuarioId) {
        return this._fetch(`progreso?usuario_id=eq.${usuarioId}&order=ultima_reproduccion.desc`);
    }

    // ─── FAVORITOS ─────────────────────────
    async toggleFavorito(usuarioId, videoId, titulo, thumbnail) {
        const existente = await this._fetch(
            `favoritos?select=id&usuario_id=eq.${usuarioId}&video_id=eq.${encodeURIComponent(videoId)}&limit=1`
        );
        if (existente && existente.length > 0) {
            await this._fetch(
                `favoritos?usuario_id=eq.${usuarioId}&video_id=eq.${encodeURIComponent(videoId)}`,
                { method: "DELETE" }
            );
            this.log(usuarioId, "fav_remove", (titulo||"").slice(0,50));
            return false;
        }
        await this._fetch("favoritos", {
            method: "POST",
            headers: { "Prefer": "return=minimal" },
            body: JSON.stringify({
                usuario_id: usuarioId,
                video_id: videoId,
                titulo: (titulo || "").slice(0, 80),
                thumbnail: thumbnail || "",
            }),
        });
        this.log(usuarioId, "fav_add", (titulo||"").slice(0,50));
        return true;
    }

    async obtenerFavoritos(usuarioId) {
        return this._fetch(`favoritos?usuario_id=eq.${usuarioId}&order=created_at.desc`);
    }
}

const db = new Database();
export default db;

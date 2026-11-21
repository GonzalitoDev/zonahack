#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  ZONAHACK - INSTALADOR DE VPS (Ubuntu/Debian)
#  Convierte tu VPS en el servidor propio de ZonaHack con
#  todas las APIs (search, anime, videohub, db, proxy, etc.)
#
#  USO:
#   1) Subí el proyecto a /opt/zonahack  (ver LEEME.txt)
#   2) Corré:  sudo bash setup.sh
#
#  Después:  sudo certbot --nginx  (para HTTPS gratis)
# ═══════════════════════════════════════════════════════════
set -e

APP_DIR="/opt/zonahack"
PORT="${PORT:-8080}"
DOMAIN="${DOMAIN:-}"

echo "=== 1/5  Actualizando el sistema ==="
apt update -y
apt upgrade -y

echo "=== 2/5  Instalando Python, nginx y dependencias ==="
apt install -y python3 python3-pip python3-venv nginx curl
mkdir -p "$APP_DIR"
cd "$APP_DIR"
if [ ! -d venv ]; then
  python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install requests

echo "=== 3/5  Servicio systemd (arranca solo y se reinicia) ==="
cat > /etc/systemd/system/zonahack.service <<EOF
[Unit]
Description=ZonaHack API + Web (VPS propio)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/venv/bin/python $APP_DIR/local_server.py --port $PORT
Restart=always
RestartSec=3
Environment=PORT=$PORT

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable zonahack

echo "=== 4/5  Nginx como reverse proxy (puede subir archivos grandes) ==="
cat > /etc/nginx/sites-available/zonahack <<'EOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/zonahack /etc/nginx/sites-enabled/zonahack
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx

echo "=== 5/5  Arrancando servicios ==="
systemctl start zonahack
systemctl restart nginx

echo ""
echo "  ═══════════════════════════════════════════════"
echo "   ✔ ZONAHACK INSTALADO EN TU VPS"
echo "   Local:  http://127.0.0.1:$PORT"
echo "   Web:    http://IP-DE-TU-VPS/"
echo "   Logs:   journalctl -u zonahack -f"
echo "   Reiniciar: systemctl restart zonahack"
echo "   ═══════════════════════════════════════════════"
echo "   SIGUIENTE PASO (recomendado): HTTPS gratis"
echo "     sudo certbot --nginx -d TUDOMINIO.com"
echo "     (instalá certbot: sudo apt install certbot python3-certbot-nginx)"
echo ""
echo "   ¿Tenés las APIs gratis? Sí: search, anime, videohub,"
echo "   proxy_youtube, db local, test, y proxy al sitio real."
echo "   ═══════════════════════════════════════════════"
# Arranque en AWS EC2 y Windows CMD

Guía para publicar AquaPlants en una instancia **Ubuntu (AWS EC2)** conectada a
**AWS RDS**, y para ejecutarlo en local desde **Windows CMD**.

Reemplaza los valores entre `<...>`. No escribas contraseñas reales en archivos
que vayan a GitHub; usa `.env` (ignorado) o variables del sistema.

## 1. Preparación de la instancia EC2

- AMI: Ubuntu 24.04 LTS (Python 3.12). Ubuntu 22.04 (Python 3.10) también sirve.
- Security Group de la EC2:
  - Puerto 22: solo tu IP.
  - Puertos 80 y 443: `0.0.0.0/0` (si usarás Nginx/HTTPS).
  - Puerto 8000: solo si vas a probar la API directamente, idealmente tu IP.
- Security Group de **RDS**: permitir tráfico en 5432 **solo desde el Security
  Group de la EC2**. No abras 5432 a Internet.

Conéctate:

```bash
ssh -i <ruta-a-tu-llave.pem> ubuntu@<ip-publica-ec2>
```

Instala dependencias del sistema:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip git nginx
```

## 2. Código y entorno

```bash
cd /home/ubuntu
git clone https://github.com/<usuario>/<repositorio-privado>.git aquaplanst
cd /home/ubuntu/aquaplanst
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
nano .env
```

Valores mínimos en `.env` para RDS:

```dotenv
DB_HOST=<endpoint-rds>
DB_PORT=5432
DB_USER=<usuario>
DB_PASSWORD=<clave>
DB_NAME=<base>
DB_SSLMODE=require
DB_SSLROOTCERT=
SKIP_INIT_DB=1
SECRET_KEY=<48+ caracteres aleatorios>
CORS_ORIGINS=http://<ip-publica-ec2>
FRONTEND_URL=http://<ip-publica-ec2>
API_HOST=0.0.0.0
API_PORT=8000
```

Genera la clave:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Usa `SKIP_INIT_DB=1` cuando el esquema de RDS ya existe. Si la base está vacía,
déjalo en `0` solo para el primer arranque y luego restáuralo a `1`.

## 3. Arranque con start.sh

```bash
chmod +x start.sh
./start.sh
```

`start.sh` fuerza `API_HOST=0.0.0.0`, toma `PORT` o `API_PORT` (8000 por defecto)
y `SKIP_INIT_DB=1`.

Verifica en la misma instancia:

```bash
curl -i http://127.0.0.1:8000/api/health
```

## 4. Servicio permanente con systemd

```bash
sudo tee /etc/systemd/system/aquaplants.service >/dev/null <<'EOF'
[Unit]
Description=AquaPlants API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/aquaplanst
Environment=API_HOST=0.0.0.0
Environment=API_PORT=8000
Environment=SKIP_INIT_DB=1
ExecStart=/home/ubuntu/aquaplanst/.venv/bin/python serve.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aquaplants
sudo systemctl status aquaplants
sudo journalctl -u aquaplants -f
```

## 5. Nginx y HTTPS (recomendado)

Copia solo el frontend a un directorio público (no expongas `.env`, `.git`,
`backend/` ni `scripts/`):

```bash
sudo mkdir -p /var/www/aquaplants
sudo cp -r index.html admin.html encargado.html supervisor.html \
  credentials-helper.html css js pages admin assets simulador \
  /var/www/aquaplants/
sudo tee /etc/nginx/sites-available/aquaplants >/dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    root /var/www/aquaplants;
    index index.html;
    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location /docs { proxy_pass http://127.0.0.1:8000; }
    location /redoc { proxy_pass http://127.0.0.1:8000; }
    location = /openapi.json { proxy_pass http://127.0.0.1:8000; }

    location ~ /\. { deny all; }
    location / { try_files $uri $uri/ =404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/aquaplants /etc/nginx/sites-enabled/aquaplants
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Con Nginx proxy, el frontend y la API comparten origen y `js/config.js` usa
`/api` automáticamente. Ajusta `CORS_ORIGINS` y `FRONTEND_URL` al dominio final.

HTTPS con Let's Encrypt (necesita un dominio apuntando a la IP):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <tu-dominio>
sudo systemctl reload nginx
```

## 6. Windows CMD (local o pruebas)

```cmd
cd /d C:\Users\benja\Desktop\aquaplanst
py -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
copy .env.example .env
notepad .env
set API_HOST=0.0.0.0
set API_PORT=8000
set SKIP_INIT_DB=1
python serve.py
```

Frontend local en otra terminal CMD:

```cmd
cd /d C:\Users\benja\Desktop\aquaplanst
python -m http.server 5500 --bind 127.0.0.1
```

Abre `http://127.0.0.1:5500/`.

## 7. Subir a un repositorio privado de GitHub (CMD)

```cmd
cd /d C:\Users\benja\Desktop\aquaplanst
git add -n .
git check-ignore -v .env
git status
git add .
git commit -m "Preparar AquaPlants para despliegue en la nube"
git remote add origin https://github.com/<usuario>/<repositorio-privado>.git
git push -u origin main
```

Comprueba que no se subieron secretos:

```cmd
git ls-files | findstr /I ".env"
git ls-files | findstr /I "password secret token credential"
```

## 8. Verificación final

```bash
curl -i http://127.0.0.1:8000/api/health
curl -i http://<ip-publica-ec2>/api/health
curl -i http://<ip-publica-ec2>/
```

Inicio de sesión (form-urlencoded, no JSON):

```bash
curl -X POST http://<ip-publica-ec2>/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=<usuario>&password=<clave>"
curl -H "Authorization: Bearer <token>" http://<ip-publica-ec2>/api/auth/me
```

Lista de comprobación:

- [ ] `/api/health` responde `{"status":"ok"}` (conecta a RDS).
- [ ] El login carga y devuelve token.
- [ ] Gestión de usuarios y roles funcionan.
- [ ] Los módulos consultan datos reales.
- [ ] Acceso desde un dispositivo externo.
- [ ] HTTPS activo y sin errores de CORS.
- [ ] `.env`, `.git`, `backend/` y `scripts/` no son accesibles por HTTP.

# Luxury Palace — Guía de despliegue, paso a paso y clic a clic

6 bloques, en este orden. Al final tienes 9 datos (variables de entorno) que
se pegan una sola vez en Netlify.

---

## BLOQUE 1 — Google Sheet (la base de datos)

### 1.1 Crear el Sheet
1. Ve a **sheets.new** (te crea un Sheet nuevo directo).
2. Arriba a la izquierda, donde dice "Hoja de cálculo sin título", escribe:
   `Luxury Palace - Reservas`.

### 1.2 Crear las pestañas y encabezados
3. Abajo a la izquierda verás una pestaña "Hoja 1". Doble clic sobre ella,
   bórrala y escribe `Reservas`. Enter.
4. Clic en el `+` junto a la pestaña para crear una nueva. Nómbrala `Bloqueos`.
5. Entra a la pestaña `Reservas`, clic en la celda A1, y pega esta fila
   completa (Google Sheets la reparte sola en las columnas si pegas con Ctrl+V
   después de copiar esta línea con tabulaciones — si no, escribe cada
   encabezado a mano en A1, B1, C1... hasta T1):

   `ReservaID	Fecha	HoraInicio	HoraFin	ServicioID	ServicioNombre	PersonalID	PersonalNombre	OrdenEnCadena	ClienteNombre	ClienteTelefono	ClienteEmail	MontoServicio	MontoTotalReserva	MontoAbono	ComprobanteURL	Estado	FechaHoraCreacion	RecordatorioMananaEnviado	Recordatorio2hEnviado`

6. Entra a la pestaña `Bloqueos`, celda A1, mismo método:

   `PersonalID	Fecha	HoraInicio	HoraFin	Motivo`

### 1.3 Copiar el SHEET_ID
7. Mira la URL del navegador. Se ve así:
   `https://docs.google.com/spreadsheets/d/ESTO_ES_TU_SHEET_ID/edit`
8. Copia esa parte entre `/d/` y `/edit` — guárdala como **SHEET_ID**.

### 1.4 Crear el proyecto en Google Cloud
9. Ve a **console.cloud.google.com**. Si es tu primera vez te pide aceptar
   términos — acepta.
10. Arriba, junto al logo de Google Cloud, hay un selector de proyecto
    (dice "Select a project" o el nombre del último proyecto). Clic ahí.
11. Clic en **"New Project"** (arriba a la derecha del cuadro que se abre).
12. Nombre del proyecto: `luxury-palace-reservas`. Clic **Create**.
13. Espera unos segundos a que te avise "Project created" y selecciona ese
    proyecto en el mismo selector de arriba.

### 1.5 Habilitar la API de Sheets
14. En el menú de hamburguesa (☰, arriba a la izquierda) ve a
    **"APIs & Services" → "Library"**.
15. En el buscador escribe `Google Sheets API`, clic en el resultado.
16. Clic en el botón azul **"Enable"**.

### 1.6 Crear la Service Account
17. Menú ☰ → **"APIs & Services" → "Credentials"**.
18. Arriba, clic **"+ Create Credentials"** → elige **"Service account"**.
19. Nombre: `reservas-bot`. Clic **"Create and Continue"**.
20. En "Grant this service account access to project" — no elijas ningún rol,
    clic **"Continue"**.
21. En "Grant users access" — déjalo vacío, clic **"Done"**.

### 1.7 Generar la clave (credenciales)
22. En la lista de "Service Accounts" verás `reservas-bot@...iam.gserviceaccount.com`.
    Clic sobre ese email para entrar a su detalle.
23. Ve a la pestaña **"Keys"**.
24. Clic **"Add Key" → "Create new key"**.
25. Elige tipo **JSON**, clic **"Create"**. Se descarga un archivo automáticamente
    (algo como `luxury-palace-reservas-xxxxx.json`).
26. Abre ese archivo con un editor de texto. Adentro vas a ver algo así:
    ```
    "client_email": "reservas-bot@luxury-palace-reservas.iam.gserviceaccount.com",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n",
    ```
27. Copia el valor de `client_email` completo → **GOOGLE_CLIENT_EMAIL**.
28. Copia el valor de `private_key` completo, incluyendo `-----BEGIN...` y
    `-----END...-----\n` → **GOOGLE_PRIVATE_KEY**. (Guarda este archivo JSON
    en un lugar seguro, no lo subas a GitHub.)

### 1.8 Compartir el Sheet con la Service Account
29. Vuelve a tu Google Sheet (el de 1.1).
30. Clic en el botón **"Compartir"** (arriba a la derecha).
31. En el campo de nombres/emails, pega el `client_email` del paso 27.
32. A la derecha del campo, cambia el permiso de "Lector" a **"Editor"**.
33. Desmarca "Notificar a las personas" si aparece (la service account no
    tiene bandeja de entrada).
34. Clic **"Compartir" / "Enviar"**.

---

## BLOQUE 2 — Bot de Telegram (alertas al negocio)

### 2.1 Crear el bot
1. Abre Telegram (celular o web.telegram.org).
2. En el buscador, escribe `BotFather` y entra a la cuenta verificada
   (ícono azul).
3. Escríbele: `/start`
4. Escríbele: `/newbot`
5. Te pregunta el nombre del bot (el que se muestra) — escribe:
   `Luxury Palace Reservas`
6. Te pregunta el username (debe terminar en "bot" y ser único) — prueba con:
   `LuxuryPalaceReservasBot` (si está ocupado, agrega números, ej.
   `LuxuryPalace2026Bot`)

### 2.2 Obtener el token
7. BotFather te responde con un mensaje que incluye una línea como:
   `Use this token to access the HTTP API: 123456789:AAExxxxxxxxxxxxxxxxxxxxx`
8. Copia ese token completo → **TELEGRAM_BOT_TOKEN**.

### 2.3 Obtener el chat_id
9. Busca tu bot por su username (`@LuxuryPalaceReservasBot`) y ábrelo.
10. Clic **"Iniciar" / "Start"**, y mándale cualquier mensaje, ej: `hola`.
    (Si prefieres recibir las alertas en un grupo, crea el grupo, agrégalo
    ahí, y manda el mensaje dentro del grupo en vez de al chat directo.)
11. En una pestaña del navegador, entra a esta URL reemplazando `<TOKEN>` por
    el token del paso 8:
    `https://api.telegram.org/bot<TOKEN>/getUpdates`
12. Verás un texto JSON. Busca la parte que dice `"chat":{"id":XXXXXXXXX,`.
    Ese número (puede ser negativo si es un grupo) es tu **TELEGRAM_CHAT_ID**.
    (Si sale vacío `{"ok":true,"result":[]}`, es que el mensaje del paso 10
    no llegó a tiempo — mándalo de nuevo y recarga la URL.)

---

## BLOQUE 3 — Resend (envío de emails)

### 3.1 Crear cuenta
1. Ve a **resend.com/signup**.
2. Regístrate con tu email (o con Google/GitHub).

### 3.2 Verificar tu dominio
3. En el menú lateral, clic **"Domains"**.
4. Clic **"Add Domain"**.
5. Escribe tu dominio (ej. `luxurypalacequito.com`) y clic **"Add"**.
6. Resend te muestra 3-4 registros DNS (tipo TXT, MX, CNAME) con nombre y
   valor. Tienes que entrar al panel donde compraste ese dominio (GoDaddy,
   Namecheap, Google Domains, etc.), ir a la sección de DNS / Zona DNS, y
   agregar cada registro exactamente como Resend lo muestra.
7. Vuelve a Resend, clic **"Verify DNS Records"**. Puede tardar desde minutos
   hasta un par de horas en propagarse.
8. **Si todavía no tienes dominio propio para Luxury Palace**, puedes seguir
   sin este paso por ahora, pero los emails de confirmación no le van a
   llegar a un cliente real — solo funcionará el modo de pruebas de Resend,
   que envía únicamente al correo con el que te registraste. No lo dejes
   pendiente para el día que abras al público.

### 3.3 Crear la API Key
9. Menú lateral, clic **"API Keys"**.
10. Clic **"Create API Key"**.
11. Nombre: `luxury-palace-produccion`. Permiso: "Full access" o "Sending access"
    (con "Sending access" alcanza). Clic **"Add"**.
12. Se muestra la key UNA sola vez (empieza con `re_`) — cópiala ya →
    **RESEND_API_KEY**.

### 3.4 Definir el remitente
13. **RESEND_FROM** = `Luxury Palace <reservas@tudominio.com>`, usando el
    dominio que verificaste en 3.2.

---

## BLOQUE 4 — GitHub (donde vive el código)

### 4.1 Crear el repositorio
1. Ve a **github.com/new** (si no tienes cuenta, créala primero en github.com).
2. "Repository name": `luxury-palace-reservas`.
3. Marca **"Private"** (no hace falta que sea público).
4. NO marques "Add a README file", ni ".gitignore", ni "license" (para no
   chocar con los archivos que ya tienes).
5. Clic **"Create repository"**.

### 4.2 Subir los archivos (sin usar la terminal)
6. En la página del repo recién creado, verás un link que dice
   **"uploading an existing file"** — clic ahí.
7. Descomprime el ZIP que te envié en tu computador.
8. Arrastra TODO el contenido de la carpeta `luxury-palace-reservas`
   (los archivos y carpetas: `index.html`, `netlify.toml`, `package.json`,
   `README.md`, `SETUP.md`, la carpeta `config/`, la carpeta `netlify/`, la
   carpeta `assets/`) a la zona de arrastre de GitHub.
9. Abajo, en "Commit changes", deja el mensaje por defecto y clic
   **"Commit changes"**.

---

## BLOQUE 5 — Netlify (donde corre el sitio)

### 5.1 Conectar el repo
1. Ve a **app.netlify.com** y crea cuenta / inicia sesión (puedes usar tu
   cuenta de GitHub para entrar directo).
2. Clic **"Add new site" → "Import an existing project"**.
3. Elige **"Deploy with GitHub"**, autoriza el acceso si te lo pide.
4. Busca y selecciona el repo `luxury-palace-reservas`.

### 5.2 Configuración de build
5. "Build command": déjalo **vacío**.
6. "Publish directory": escribe `.` (un punto — ya está en `netlify.toml`,
   pero confírmalo).
7. Clic **"Deploy luxury-palace-reservas"**. Va a fallar o quedar incompleto
   porque faltan las variables de entorno — es normal, sigue al siguiente paso.

### 5.3 Variables de entorno
8. Menú del sitio → **"Site configuration" → "Environment variables"**.
9. Clic **"Add a variable" → "Add a single variable"**, y repite esto 9 veces
   con cada una de estas (nombre exacto a la izquierda, tu valor a la derecha):

   | Nombre exacto | Valor (de qué paso sale) |
   |---|---|
   | `GOOGLE_CLIENT_EMAIL` | Bloque 1, paso 27 |
   | `GOOGLE_PRIVATE_KEY` | Bloque 1, paso 28 (pégala completa, con los `\n`) |
   | `SHEET_ID` | Bloque 1, paso 8 |
   | `TELEGRAM_BOT_TOKEN` | Bloque 2, paso 8 |
   | `TELEGRAM_CHAT_ID` | Bloque 2, paso 12 |
   | `RESEND_API_KEY` | Bloque 3, paso 12 |
   | `RESEND_FROM` | Bloque 3, paso 13 |
   | `CUENTA_NUMERO` | tu número de cuenta Banco Pichincha |
   | `CUENTA_CEDULA` | la cédula de la titular de la cuenta |

### 5.4 Redesplegar con las variables
10. Ve a la pestaña **"Deploys"**.
11. Clic **"Trigger deploy" → "Deploy site"**.
12. Espera a que el círculo de estado se ponga verde ("Published").

### 5.5 Verificar
13. Pestaña **"Functions"** del sitio — deberías ver listadas:
    `disponibilidad`, `reservar`, `recordatorios`.
14. Arriba del todo, Netlify te muestra la URL pública del sitio (algo como
    `https://luxury-palace-reservas-abc123.netlify.app`). Esa es la que le vas
    a compartir a las clientas para reservar.
15. (Opcional) "Domain management" → "Add a domain" si quieres poner tu
    propio dominio en vez del de Netlify.

---

## BLOQUE 6 — Prueba de punta a punta

1. Abre la URL del paso 5.5.14 en el navegador.
2. Toca el splash, elige un servicio de cualquier categoría, con cualquier
   profesional.
3. Elige una fecha y un horario.
4. Llena tus propios datos de contacto.
5. Sube cualquier foto como comprobante (no importa que no sea un pago real,
   es solo para probar que el flujo funciona).
6. Confirma la cita.
7. Revisa los 3 lugares:
   - El Google Sheet → pestaña `Reservas` → debe aparecer una fila nueva.
   - Telegram → el chat/grupo del bot debe recibir el aviso con el
     comprobante adjunto.
   - Tu correo → debe llegar el email de confirmación (revisa spam si usaste
     el remitente de pruebas de Resend).
8. Para probar los recordatorios sin esperar el cron automático: en Netlify,
   `Functions` → clic en `recordatorios` → botón de ejecutar/"Trigger
   function" manualmente (el nombre exacto del botón varía según la versión
   de la interfaz de Netlify).

---

### Si algo falla
- **La función tira error 500**: revisa en Netlify → `Functions` →
  `reservar` o `disponibilidad` → pestaña de logs, ahí sale el mensaje de
  error exacto (casi siempre es una variable de entorno mal copiada).
- **"GOOGLE_PRIVATE_KEY" no funciona**: asegúrate de haber copiado la clave
  completa del JSON, incluyendo las líneas `-----BEGIN PRIVATE KEY-----` y
  `-----END PRIVATE KEY-----`.
- **No llega el Telegram**: repite el paso 2.3 — el chat_id caduca si nunca
  le escribiste al bot primero.
- **No llega el email**: si no verificaste un dominio en Resend (paso 3.2),
  solo te va a llegar a ti mismo, no a un cliente externo.

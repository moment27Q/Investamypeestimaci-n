# Tasador Perú — Tasación automática de propiedades en tiempo real

App web que calcula el valor de venta estimado de una propiedad en Perú **solo con su ubicación** (dirección de Google Maps, coordenadas, un clic en el mapa o tu ubicación GPS). No hay que rellenar formularios largos: los campos de características vienen con valores típicos y el precio se recalcula **en vivo** mientras ajustas lo que conoces.

La novedad principal: **el estimado se ajusta con precios de mercado reales** de los avisos publicados en **Adondevivir** y **Urbania** para el distrito detectado.

## Cómo se calcula (metodología)

Valor = **precio por m² base** × **área** × ajustes hedónicos

1. **Ubicación** → geocodificación gratuita con OpenStreetMap (Nominatim). Se detecta el distrito automáticamente.
2. **Precio por m² = mercado real + base estática (70/30)**:
   - El servidor abre Adondevivir y Urbania, extrae los avisos reales del distrito (hasta ~30 por portal) y calcula la **mediana de S//m²** de la oferta actual.
   - Ese precio de mercado se combina al 70% con la base estática propia (~45 distritos de Lima + 20 ciudades, datos Urbania Index/ASEI/BCRP 2025-2026) para evitar distorsiones por avisos atípicos.
   - Si no se pueden obtener avisos (Cloudflare, sin datos), se usa solo la base estática.
3. **Ajustes (en tiempo real)**: tamaño (los m² pequeños valen más por m²), tipo de inmueble, antigüedad, estado de conservación, piso, zona interna del distrito y obra nueva/usada.
4. **Smart defaults**: si no tocas el área, se auto-rellena con la **mediana del área de los avisos reales** de la zona.
5. Resultado con **rango de confianza (±8%)**, precio en S/ y USD, **panel de avisos de mercado** con la lista de comparables reales, y desglose transparente de cada factor.
6. **Alquiler mensual estimado**: además del valor de venta, la app muestra el **alquiler mensual estimado** (S/ y USD) calculado con la **mediana real de rentas de Urbania y Adondevivir** (S//m²/mes) del distrito, combinada con una base estática de rendimiento, y aplicando los ajustes hedónicos suavizados. Incluye su propio panel de avisos de alquiler con la mediana y el rango por m².
7. **Proyectos nuevos (Nexo Inmobiliario)**: la app extrae los **proyectos nuevos en venta** (departamentos en planos, en construcción y entrega inmediata) publicados en **Nexo Inmobiliario** (nexoinmobiliario.pe, portal de CODIP) para el distrito detectado, con su precio "desde", rango de áreas, dormitorios, etapa y la inmobiliaria. Cada proyecto se puede abrir para ver imágenes y enlace a la publicación original.

## Requisitos

- Node.js ≥ 18.
- Conexión a internet.
- Primera vez: `npm install` (instala Playwright; reutiliza el Chromium cacheado si existe).

## Cómo ejecutar

```bash
npm install
npm start
```

Abre **http://localhost:3000**

> **Importante:** el servidor Node (`npm start`) es obligatorio para el módulo de precios de mercado. Si abres `index.html` directamente (o con `python3 -m http.server`), la tasación sigue funcionando pero solo con la base estática.

## Deploy en Render

Hay un blueprint `render.yaml` listo: **Dashboard → New → Blueprint**, conéctalo al repo y Render creará el servicio. Pasos:

1. **Variables de entorno** (Dashboard → tu servicio → Environment):
   - `GROK_API_KEY`: tu clave de Groq (el módulo "Entorno socioeconómico"). Render ya la marca como secreta (`sync: false`).
   - `GROK_MODEL` (opcional): por defecto `llama-3.3-70b-versatile`.
   - `PORT`: Render la inyecta sola.
2. **Build**: `npm install && npx playwright install --with-deps chromium` (instala Chromium con sus dependencias para el scraping).
3. **Start**: `npm start`. **Health check**: `/healthz`.

Consejos:
- El plan **Free** funciona pero la instancia se duerme a los ~15 min sin tráfico (la primera búsqueda tarda más en "despertar"). Para búsquedas siempre rápidas usa un plan de pago (Starter $7/mes).
- El scraping (Urbania, Adondevivir, Nexo) se hace desde IP de datacenter; algunos portales pueden mostrar desafíos anti-bot. El scraper tiene **stealth + reintentos automáticos** y, si el portal bloquea, la app degrada a la base estática sin romperse.
- La clave de Groq **no va en el código**: se lee de `.env` (local, gitignored) o de la variable de entorno de Render. Copia `.env.example` a `.env` para desarrollo local.

## Cómo usarlo

1. Pega una dirección (ej. *Av. Larco 123, Miraflores, Lima*) y elige en el autocompletado, **o** haz clic en el mapa, **o** pulsa el botón de ubicación GPS.
2. En unos segundos verás el **panel "Precios de mercado en vivo"** con la mediana de S//m² calculada de los avisos de Adondevivir y Urbania.
3. Ajusta solo lo que conozcas (área, dormitorios, antigüedad…). El precio se actualiza al instante.

## Estructura

```
index.html          Interfaz principal (tasación + módulo de mercado/alquiler/proyectos)
proyectos.html      Página dedicada con todos los proyectos nuevos (Nexo) en grilla
css/styles.css      Estilos
js/data.js          Base estática de precios m² por distrito/ciudad
js/valuation.js     Motor de tasación (modelo hedónico + blend de mercado)
js/geocode.js       Geocodificación Nominatim + detección de distrito
js/app.js           Lógica de la interfaz (mapa, autocompletado, comparables, cálculo en vivo)
js/proyectos.js     Lógica de la página de proyectos nuevos (búsqueda + grilla + modal)
scraper.js          Extracción de avisos de Adondevivir, Urbania, RE/MAX y proyectos de Nexo (Playwright) + caché
server.js           Servidor estático + endpoints /api/comparables, /api/rentals y /api/nexo
```

## Endpoint

`GET /api/comparables?district=Miraflores&type=departamento` → `{ count, medianPerM2, medianArea, minPerM2, maxPerM2, sources, listings: [...] }`

`GET /api/rentals?district=Miraflores&type=departamento` → `{ count, medianRent, medianRentPerM2, medianArea, minRent, maxRent, minRentPerM2, maxRentPerM2, sources, listings: [...] }`

`GET /api/nexo?district=Miraflores` (o `?city=Arequipa`) → `{ count, minPrice, maxPrice, projects: [...] }`. Por defecto devuelve hasta 30 proyectos; con `&all=1` devuelve el listado completo (hasta 40).

- La página `proyectos.html` muestra todos los proyectos en grilla con búsqueda por distrito/ciudad; el botón "Proyectos nuevos" de la barra y "Ver todos los proyectos" del módulo navegan a ella arrastrando el distrito actual (`?district=...&city=...`).

- Caché en memoria de 10 minutos por distrito+tipo para no saturar los portales (venta, alquiler y Nexo tienen cachés separadas).
- Resultados que no se pueden scrapear devuelven `count: 0` y la app cae a la base estática.

## Notas legales y técnicas

- El scraping respeta límites: espaciado entre peticiones, caché, y solo consulta cuando el usuario lo solicita. Los portales pueden cambiar su HTML o bloquear el acceso; la app degrada a la base estática sin romperse.
- Es una **estimación referencial**, no una tasación formal certificada (requiere inspección de perito para SUNARP).
- Geocodificación sujeta a la [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/) (1 request/s).

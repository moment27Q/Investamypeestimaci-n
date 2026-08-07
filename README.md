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

## Cómo usarlo

1. Pega una dirección (ej. *Av. Larco 123, Miraflores, Lima*) y elige en el autocompletado, **o** haz clic en el mapa, **o** pulsa el botón de ubicación GPS.
2. En unos segundos verás el **panel "Precios de mercado en vivo"** con la mediana de S//m² calculada de los avisos de Adondevivir y Urbania.
3. Ajusta solo lo que conozcas (área, dormitorios, antigüedad…). El precio se actualiza al instante.

## Estructura

```
index.html          Interfaz
css/styles.css      Estilos
js/data.js          Base estática de precios m² por distrito/ciudad
js/valuation.js     Motor de tasación (modelo hedónico + blend de mercado)
js/geocode.js       Geocodificación Nominatim + detección de distrito
js/app.js           Lógica de la interfaz (mapa, autocompletado, comparables, cálculo en vivo)
scraper.js          Extracción de avisos reales de Adondevivir y Urbania (Playwright) + caché
server.js           Servidor estático + endpoint /api/comparables
```

## Endpoint

`GET /api/comparables?district=Miraflores&type=departamento` → `{ count, medianPerM2, medianArea, minPerM2, maxPerM2, sources, listings: [...] }`

- Caché en memoria de 10 minutos por distrito+tipo para no saturar los portales.
- Resultados que no se pueden scrapear devuelven `count: 0` y la app cae a la base estática.

## Notas legales y técnicas

- El scraping respeta límites: espaciado entre peticiones, caché, y solo consulta cuando el usuario lo solicita. Los portales pueden cambiar su HTML o bloquear el acceso; la app degrada a la base estática sin romperse.
- Es una **estimación referencial**, no una tasación formal certificada (requiere inspección de perito para SUNARP).
- Geocodificación sujeta a la [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/) (1 request/s).

# Tasador Perú — Tasación automática de propiedades en tiempo real

App web que calcula el valor de venta estimado de una propiedad en Perú **solo con su ubicación** (dirección de Google Maps, coordenadas, un clic en el mapa o tu ubicación GPS). No hay que rellenar formularios largos: los campos de características ya vienen con valores típicos y el precio se recalcula **en vivo** mientras ajustas lo que conoces.

## Cómo se calcula (metodología)

Valor = **precio por m² base de la zona** × **área** × ajustes hedónicos

1. **Ubicación** → geocodificación gratuita con OpenStreetMap (Nominatim). Se detecta el distrito automáticamente.
2. **Precio base por m²**: base de datos propia con ~45 distritos de Lima Metropolitana/Callao y ~20 ciudades del país, elaborada con datos de mercado reales (Urbania Index, ASEI, BCRP, 2025–2026).
   - Si el distrito exacto está en la base → se usa directo.
   - Si está en Lima pero el distrito no se identifica → **interpolación por cercanía** (ponderación inversa a la distancia a los distritos con datos).
   - En provincias → precio a nivel ciudad.
   - Además: refuerzo de precio por **proximidad a distritos premium** (efecto borde de distrito).
3. **Ajustes (en tiempo real)**: tamaño (los m² más pequeños valen más por m²), tipo de inmueble, antigüedad, estado de conservación, piso, zona interna del distrito y obra nueva/usada.
4. Resultado con **rango de confianza (±8%)**, precio en S/ y USD, y desglose transparente de cada factor.

## Requisitos

- Node.js (para `npm start`) o cualquier servidor estático (`python3 -m http.server`).
- Conexión a internet (geocodificación y mapas).

## Cómo ejecutar

```bash
npm start
# o
python3 -m http.server 3000
```

Abre **http://localhost:3000**

## Cómo usarlo

1. Pega una dirección (ej. *Av. Larco 123, Miraflores, Lima*) y elige en el autocompletado, **o** haz clic en el mapa, **o** pulsa el botón de ubicación GPS.
2. Ajusta solo los datos que conozcas (área, dormitorios, antigüedad…). El precio se actualiza al instante.
3. Revisa el valor estimado, el rango y el desglose.

## Estructura

```
index.html          Interfaz
css/styles.css      Estilos
js/data.js          Precios m² por distrito/ciudad (datos de mercado)
js/valuation.js     Motor de tasación (modelo hedónico)
js/geocode.js       Geocodificación Nominatim + detección de distrito
js/app.js           Lógica de la interfaz (mapa, autocompletado, cálculo en vivo)
server.js           Servidor estático (sin dependencias)
```

## Notas

- La base de precios está embebida y puede actualizarse en `js/data.js`. Para precios más finos se recomienda actualizarla con los reportes trimestrales de Urbania/BCRP.
- Es una **estimación referencial**, no una tasación formal. Para tasaciones certificadas (peritos, SUNARP) se requieren visitas e inspección.
- Geocodificación sujeta a la [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/) (1 request/s; los usuarios avanzados deben identificarse con un User-Agent).

/*
 * URL pública del backend en Render.
 * Reemplaza este valor con tu URL real antes de subir el frontend al hosting.
 * Ejemplo: "https://tasador-peru.onrender.com"
 */
const API_BASE_URL = "https://tasador-propiedades.onrender.com";

function apiUrl(path) {
  return API_BASE_URL.replace(/\/$/, "") + path;
}
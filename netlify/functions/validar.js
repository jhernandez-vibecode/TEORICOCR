// ============================================================
// netlify/functions/validar.js — Teórico Pro CR v4.0
// Sistema de validación con lista negra via variable de entorno
// ============================================================

const SECRET_KEY = "PuraVida2026_Secure_Refuerzo";

function calcularFirma(datos) {
    let hash = 0;
    const str = datos + SECRET_KEY;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).toUpperCase().substring(0, 4);
}

exports.handler = async function(event) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
    };

    const codigo = (event.queryStringParameters?.codigo || "").trim().toUpperCase();

    if (!codigo) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Ingresá un PIN." }) };
    }

    // ── PASO 1: Verificar estructura del PIN (5 partes) ──
    const partes = codigo.split("-");
    if (partes.length !== 5) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "PIN inválido. Verificá que lo copiaste completo." }) };
    }

    const [prefix, dateStr, initials, cedula, firma] = partes;

    // ── PASO 2: Verificar firma digital ──
    const firmaEsperada = calcularFirma(dateStr + initials + cedula);
    if (firma !== firmaEsperada) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "PIN inválido. La firma no coincide." }) };
    }

    // ── PASO 3: Verificar fecha de expiración ──
    const anio  = parseInt(dateStr.substring(0, 4));
    const mes   = parseInt(dateStr.substring(4, 6)) - 1;
    const dia   = parseInt(dateStr.substring(6, 8));
    const expiry = new Date(anio, mes, dia);
    const hoy    = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (hoy > expiry) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Este PIN ya venció. Contactá al administrador para renovar tu acceso." }) };
    }

    const diasRestantes = Math.ceil((expiry - hoy) / (1000 * 60 * 60 * 24));

    // ── PASO 4: Verificar lista negra (BANNED_PINS) ──
    // Para anular un PIN: en Netlify → Site Settings → Environment Variables
    // Agregar variable: BANNED_PINS = "PIN1,PIN2,PIN3"
    // Separar múltiples PINs con comas, sin espacios
    const bannedRaw = process.env.BANNED_PINS || "";
    if (bannedRaw) {
        const bannedList = bannedRaw.split(",").map(p => p.trim().toUpperCase());
        if (bannedList.includes(codigo)) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ error: "Este PIN ha sido anulado. Contactá al administrador." })
            };
        }
    }

    // ── PASO 5: Verificar plan válido ──
    const planesValidos = ["B1", "A2", "PRO", "DEMO"];
    if (!planesValidos.includes(prefix)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Tipo de plan desconocido." }) };
    }

    // ── Todo OK ──
    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            plan: prefix,
            dias: diasRestantes,
            vence: expiry.toLocaleDateString("es-CR")
        })
    };
};

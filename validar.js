// ============================================================
// netlify/functions/validar.js
// Teórico Pro CR – Validador de PINs con control en Google Sheets
// ============================================================

const SECRET_KEY = "PuraVida2026_Secure_Refuerzo";

// Google Sheet ID y nombre de hoja
const SHEET_ID   = "1AQaVYvSrEZhDs5v6llbZc-k_VvgSjoP-bT7Dxj1axVc";
const SHEET_NAME = "CONTROL DE TOKENS";

// ── Recalcula la firma del PIN para verificar que es auténtico ──
function calcularFirma(datos) {
    let hash = 0;
    const str = datos + SECRET_KEY;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).toUpperCase().substring(0, 4);
}

// ── Consulta el Sheet y devuelve la fila del PIN (o null si no existe) ──
async function buscarPinEnSheet(pin) {
    // Usamos la API pública de Google Sheets (el Sheet debe ser "cualquiera con el enlace puede ver")
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}!A:F?key=${process.env.GOOGLE_SHEETS_API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const rows = data.values || [];

    // Fila 0 = encabezados (PIN | PLAN | DIAS | FECHA_VENCE | NOMBRE | ESTADO)
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] && rows[i][0].trim().toUpperCase() === pin.toUpperCase()) {
            return {
                pin:        rows[i][0] || "",
                plan:       rows[i][1] || "",
                dias:       rows[i][2] || "",
                fechaVence: rows[i][3] || "",
                nombre:     rows[i][4] || "",
                estado:     rows[i][5] || "ACTIVO",
                rowIndex:   i + 1  // base 1 para referencia futura
            };
        }
    }
    return null;
}

exports.handler = async function(event) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
    };

    // Leer el PIN de la query string
    const codigo = (event.queryStringParameters?.codigo || "").trim().toUpperCase();
    if (!codigo) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Ingresá un PIN." }) };
    }

    // ── PASO 1: Verificar estructura y firma del PIN ──
    // Formato esperado: PLAN-FECHA-INI-CED-FIRMA  (5 partes separadas por -)
    const partes = codigo.split("-");
    if (partes.length !== 5) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "PIN inválido. Verificá que lo copiaste completo." }) };
    }

    const [prefix, dateStr, initials, cedula, firma] = partes;

    // Recalcular firma esperada
    const firmaEsperada = calcularFirma(dateStr + initials + cedula);
    if (firma !== firmaEsperada) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "PIN inválido. La firma no coincide." }) };
    }

    // ── PASO 2: Verificar fecha de expiración ──
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

    // ── PASO 3: Verificar en Google Sheets si está ANULADO ──
    // Solo consultamos el Sheet si tenemos la API key configurada
    if (process.env.GOOGLE_SHEETS_API_KEY) {
        try {
            const registro = await buscarPinEnSheet(codigo);

            if (registro) {
                const estado = registro.estado.toUpperCase().trim();

                if (estado === "ANULADO") {
                    return {
                        statusCode: 403,
                        headers,
                        body: JSON.stringify({ error: "Este PIN ha sido anulado. Contactá al administrador." })
                    };
                }

                if (estado === "SUSPENDIDO") {
                    return {
                        statusCode: 403,
                        headers,
                        body: JSON.stringify({ error: "Este PIN está suspendido temporalmente. Contactá al administrador." })
                    };
                }
                // Si está ACTIVO o cualquier otro estado → continúa normalmente
            }
            // Si no está en el Sheet → el PIN es matemáticamente válido, se permite
            // (PINs generados antes de implementar el Sheet siguen funcionando)
        } catch (err) {
            // Si falla la consulta al Sheet, no bloqueamos al usuario
            // El PIN matemáticamente válido sigue funcionando
            console.error("Error consultando Sheet:", err.message);
        }
    }

    // ── PASO 4: Todo OK → devolver plan y días restantes ──
    const planesValidos = ["B1", "A2", "PRO", "DEMO"];
    if (!planesValidos.includes(prefix)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Tipo de plan desconocido." }) };
    }

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

// Esta es tu Bóveda. Nadie en internet puede ver este código ni la SECRET_KEY.
const SECRET_KEY = "PuraVida2026_Secure_Refuerzo";

function generarFirma(datos) {
    let hash = 0;
    let string = datos + SECRET_KEY;
    for (let i = 0; i < string.length; i++) {
        hash = ((hash << 5) - hash) + string.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).toUpperCase().substring(0, 4);
}

exports.handler = async function(event, context) {
    // 1. Recibimos el PIN que la página HTML nos manda a preguntar
    const pin = event.queryStringParameters.codigo;
    
    if (!pin) {
        return { statusCode: 400, body: JSON.stringify({ error: "Por favor ingresa un PIN." }) };
    }

    const partes = pin.split('-');
    const planesValidos = ["B1", "A2", "PRO", "DEMO"];

    // 2. Validar formato (5 partes) y Prefijo
    if (partes.length !== 5 || !planesValidos.includes(partes[0])) {
        return { statusCode: 400, body: JSON.stringify({ error: "Formato Incorrecto. Verifica tu código." }) };
    }

    // 3. Validar la Firma Digital (Cálculo matemático secreto)
    const firmaEsperada = generarFirma(partes[1] + partes[2] + partes[3]);
    if (partes[4] !== firmaEsperada) {
        return { statusCode: 401, body: JSON.stringify({ error: "PIN Alterado o Inválido." }) };
    }

    // 4. Validar la Fecha de Expiración
    const fechaExpiracion = new Date(
        parseInt(partes[1].substring(0,4)), 
        parseInt(partes[1].substring(4,6))-1, 
        parseInt(partes[1].substring(6,8)), 
        23, 59, 59
    );

    if (new Date() > fechaExpiracion) {
        return { statusCode: 401, body: JSON.stringify({ error: "Este PIN ya expiró." }) };
    }

    // 5. Calcular días restantes
    const diasRestantes = Math.ceil(Math.abs(fechaExpiracion - new Date()) / (1000 * 60 * 60 * 24));

    // 6. ¡Todo en orden! Respondemos a la página web que lo deje pasar
    return {
        statusCode: 200,
        body: JSON.stringify({
            valido: true,
            plan: partes[0],
            dias: diasRestantes
        })
    };
};

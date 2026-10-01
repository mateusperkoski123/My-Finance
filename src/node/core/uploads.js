// REVISAR (seguranca): validacao estrita de imagens por magic number (PNG, JPEG, WebP, GIF). Recusa SVG, HTML e arquivos maliciosos.

/**
 * Valida o buffer de uma imagem inspecionando os primeiros bytes (magic number).
 * @param {Buffer} buffer
 * @param {string} [mimeDeclarado]
 * @returns {{ ok: boolean, mime: string|null, motivo: string|null }}
 */
function validarImagem(buffer, mimeDeclarado) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { ok: false, mime: null, motivo: 'flash.comunidade_imagem_invalida' };
    }

    // Limite maximo de 2 MB (2 * 1024 * 1024 bytes)
    if (buffer.length > 2 * 1024 * 1024) {
        return { ok: false, mime: null, motivo: 'flash.comunidade_imagem_grande' };
    }

    // Verificacao de magic numbers
    let mimeDetectado = null;

    // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a &&
        buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
        mimeDetectado = 'image/png';
    }
    // 2. JPEG: FF D8 FF
    else if (
        buffer.length >= 3 &&
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ) {
        mimeDetectado = 'image/jpeg';
    }
    // 3. GIF: GIF87a ou GIF89a (47 49 46 38 37 61 / 47 49 46 38 39 61)
    else if (
        buffer.length >= 6 &&
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
        buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39) &&
        buffer[5] === 0x61
    ) {
        mimeDetectado = 'image/gif';
    }
    // 4. WebP: RIFF (bytes 0..3) + WEBP (bytes 8..11)
    else if (
        buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
        mimeDetectado = 'image/webp';
    }

    if (!mimeDetectado) {
        return { ok: false, mime: null, motivo: 'flash.comunidade_imagem_invalida' };
    }

    // Trava adicional contra injecao de SVG/HTML disfarçado
    const inicioTexto = buffer.toString('utf8', 0, Math.min(buffer.length, 512)).toLowerCase();
    if (inicioTexto.includes('<svg') || inicioTexto.includes('<html') || inicioTexto.includes('<script') || inicioTexto.includes('<?xml')) {
        return { ok: false, mime: null, motivo: 'flash.comunidade_imagem_invalida' };
    }

    return { ok: true, mime: mimeDetectado, motivo: null };
}

module.exports = { validarImagem };

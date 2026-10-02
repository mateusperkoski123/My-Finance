// Midia do Chat IA: fotos (lidas pela Claude) e audios (transcritos por um servico a parte, porque a API da Claude nao recebe audio).
// Nada e gravado em disco nem no banco: foto e audio sao processados em memoria e descartados.
const { AUDIO_TOKENS_POR_SEGUNDO } = require('./ia_precos');

const MAX_IMAGENS = 3;
const MAX_BYTES_IMAGEM = 5 * 1024 * 1024;
const MAX_BYTES_AUDIO = 6 * 1024 * 1024;
const MAX_SEGUNDOS_AUDIO = 90;

// ---------- Imagem ----------
// Dimensoes lidas do cabecalho do arquivo (PNG, JPEG, GIF, WebP). Devolve null se nao conseguir.
function dimensoesImagem(b) {
    try {
        if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
        if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
        if (b[0] === 0xff && b[1] === 0xd8) {
            let i = 2;
            while (i + 9 < b.length) {
                if (b[i] !== 0xff) { i++; continue; }
                const m = b[i + 1];
                if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
                if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
                i += 2 + b.readUInt16BE(i + 2);
            }
            return null;
        }
        if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
            const tipo = b.toString('ascii', 12, 16);
            if (tipo === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
            if (tipo === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
            if (tipo === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
        }
    } catch (e) { /* cabecalho truncado */ }
    return null;
}

// Estimativa dos tokens de uma imagem: ~1 token por bloco de 28x28 px, limitada a 2576 px no lado maior (maximo ~4.784 tokens).
function tokensImagem(buffer) {
    const d = dimensoesImagem(buffer);
    if (!d || !d.w || !d.h) return Math.min(4784, Math.max(300, Math.round(buffer.length / 700)));
    const escala = Math.min(1, 2576 / Math.max(d.w, d.h));
    return Math.min(4784, Math.max(1, Math.ceil((d.w * escala * d.h * escala) / 784)));
}

// ---------- Audio ----------
// Tipo real pelos primeiros bytes (nao confia no mimetype do navegador).
function tipoAudio(b) {
    if (b.length < 12) return null;
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
    if (b.toString('ascii', 4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
    if (b.toString('ascii', 0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
    if (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
    return null;
}

const sttConfigurado = () => Boolean(process.env.OPENAI_API_KEY);
const modeloStt = () => process.env.STT_MODELO || 'gpt-4o-mini-transcribe';

// Transcreve com a API da OpenAI (/v1/audio/transcriptions). Devolve { texto, tokens, segundos, modelo }.
async function transcrever({ buffer, tipo, segundos, idioma }) {
    const chave = process.env.OPENAI_API_KEY;
    if (!chave) { const e = new Error('stt_nao_configurado'); e.codigo = 'stt_nao_configurado'; throw e; }
    const modelo = modeloStt();
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: tipo.mime }), `audio.${tipo.ext}`);
    form.append('model', modelo);
    form.append('response_format', 'json');
    const iso = String(idioma || '').slice(0, 2).toLowerCase();
    if (['pt', 'es', 'en'].includes(iso)) form.append('language', iso);

    const r = await fetch(process.env.STT_URL || 'https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(45000)
    });
    if (!r.ok) {
        const e = new Error(`stt_http_${r.status}`); e.codigo = 'stt_falhou'; e.status = r.status; throw e;
    }
    const j = await r.json();
    const u = j.usage || {};
    const segProvedor = u.type === 'duration' ? Number(u.seconds) : null;
    const seg = Math.max(1, Math.round(segProvedor || segundos || 1));
    const tokens = u.type === 'tokens' && Number(u.total_tokens) > 0 ? Number(u.total_tokens) : seg * AUDIO_TOKENS_POR_SEGUNDO;
    return { texto: String(j.text || '').trim(), tokens, segundos: seg, modelo };
}

module.exports = { MAX_IMAGENS, MAX_BYTES_IMAGEM, MAX_BYTES_AUDIO, MAX_SEGUNDOS_AUDIO, dimensoesImagem, tokensImagem, tipoAudio, sttConfigurado, modeloStt, transcrever };

// Precos para estimar o custo do Chat IA (USD por milhao de tokens). Sao ESTIMATIVAS: o valor oficial esta no console da Anthropic / do provedor de transcricao.
// "micro" = milionesimos de dolar (token x preco por milhao = micro-USD exatos), para somar sem erro de ponto flutuante.
const CLAUDE = {
    'claude-sonnet-5-5': { entrada: 2, saida: 10, cacheLeitura: 0.2, cacheEscrita: 2.5 },
    'claude-sonnet-5': { entrada: 2, saida: 10, cacheLeitura: 0.2, cacheEscrita: 2.5 },
    'claude-opus-5-5': { entrada: 4, saida: 20, cacheLeitura: 0.2, cacheEscrita: 5 },
    'claude-opus-5': { entrada: 5, saida: 25, cacheLeitura: 0.5, cacheEscrita: 6.25 },
    'claude-haiku-4-5': { entrada: 1, saida: 5, cacheLeitura: 0.1, cacheEscrita: 1.25 }
};
const PADRAO = CLAUDE['claude-sonnet-5-5'];

// Transcricao de audio: USD por minuto de audio.
const STT_POR_MINUTO = { 'gpt-4o-mini-transcribe': 0.003, 'gpt-4o-transcribe': 0.006, 'whisper-1': 0.006 };

// Gemini (USD por milhao de tokens). Na camada gratuita o custo real e zero; aqui fica o preco da camada paga (estimativa conservadora).
const GEMINI = {
    'gemini-3.8-flash': { audio: 0.75, saida: 3.75 },
    'gemini-3.7-flash': { audio: 0.75, saida: 3.75 },
    'gemini-3.6-flash': { audio: 0.75, saida: 3.75 },
    'gemini-3.5-flash': { audio: 0.75, saida: 3.75 },
    'gemini-3.5-flash-lite': { audio: 0.3, saida: 2.5 },
    'gemini-2.5-flash-lite': { audio: 0.3, saida: 0.4 }
};

function custoGeminiMicro({ tokensAudio = 0, tokensSaida = 0 }, modelo) {
    const p = GEMINI[modelo] || GEMINI['gemini-3.8-flash'];
    const pa = Number(process.env.GEMINI_PRECO_AUDIO) || p.audio;
    const ps = Number(process.env.GEMINI_PRECO_SAIDA) || p.saida;
    return Math.round(tokensAudio * pa + tokensSaida * ps);
}

// Estimativa de tokens de audio quando o provedor nao informa (aprox. 10 por segundo).
const AUDIO_TOKENS_POR_SEGUNDO = 10;

const precoClaude = (modelo) => CLAUDE[modelo] || PADRAO;

function custoClaudeMicro({ entrada = 0, cacheLeitura = 0, cacheEscrita = 0, saida = 0 }, modelo) {
    const p = precoClaude(modelo);
    return Math.round(entrada * p.entrada + cacheLeitura * p.cacheLeitura + cacheEscrita * p.cacheEscrita + saida * p.saida);
}

function custoAudioMicro(segundos, modeloStt) {
    const porMin = Number(process.env.STT_PRECO_MINUTO) || STT_POR_MINUTO[modeloStt] || 0.003;
    return Math.round((segundos / 60) * porMin * 1e6);
}

// Dia "de uso" no fuso do negocio (o servidor da hospedagem costuma rodar em UTC).
function hojeUso(data = new Date()) {
    const tz = process.env.IA_TIMEZONE || 'America/Asuncion';
    try { return data.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return data.toISOString().slice(0, 10); }
}

module.exports = { GEMINI, custoGeminiMicro, CLAUDE, STT_POR_MINUTO, AUDIO_TOKENS_POR_SEGUNDO, precoClaude, custoClaudeMicro, custoAudioMicro, hojeUso };

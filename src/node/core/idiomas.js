// Idiomas suportados pelo sistema.
const IDIOMAS = {
    'pt-BR': 'Português (Brasil)',
    'es-PY': 'Español (Paraguay)',
    'en-US': 'English (US)'
};

// Aceita 'pt-BR', 'pt', 'es-PY', 'es', 'en-US', 'en'...; devolve o codigo oficial ou null.
function normalizarIdioma(v) {
    const s = String(v || '').trim();
    if (IDIOMAS[s]) return s;
    const l = s.toLowerCase();
    if (l.startsWith('pt')) return 'pt-BR';
    if (l.startsWith('es')) return 'es-PY';
    if (l.startsWith('en')) return 'en-US';
    return null;
}

// Idioma sugerido pelo navegador do visitante (cabecalho Accept-Language); null se nao der para saber.
function detectarIdioma(req) {
    try {
        const achado = req.acceptsLanguages ? req.acceptsLanguages('pt', 'es', 'en') : null;
        return achado ? normalizarIdioma(achado) : null;
    } catch (e) {
        return null;
    }
}

module.exports = { IDIOMAS, normalizarIdioma, detectarIdioma };

/**
 * Helper para formatação de tempo relativo traduzido ("há X dias", "hace Xd", etc.)
 * @param {Date|string|number} dataInput
 * @param {Function} t - Função de tradução req.t / res.locals.t
 * @returns {string}
 */
function formatarTempoRelativo(dataInput, t) {
    if (!dataInput) return '';
    const data = new Date(dataInput);
    if (isNaN(data.getTime())) return '';

    const agora = new Date();
    const diffSegundos = Math.max(0, Math.floor((agora.getTime() - data.getTime()) / 1000));

    if (diffSegundos < 60) {
        return t('comunidade.tempo.agora');
    }
    const diffMinutos = Math.floor(diffSegundos / 60);
    if (diffMinutos < 60) {
        return t('comunidade.tempo.minutos', { n: diffMinutos });
    }
    const diffHoras = Math.floor(diffMinutos / 60);
    if (diffHoras < 24) {
        return t('comunidade.tempo.horas', { n: diffHoras });
    }
    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias < 30) {
        return t('comunidade.tempo.dias', { n: diffDias });
    }
    const diffMeses = Math.floor(diffDias / 30);
    if (diffMeses < 12) {
        return t('comunidade.tempo.meses', { n: diffMeses });
    }
    const diffAnos = Math.floor(diffDias / 365);
    return t('comunidade.tempo.anos', { n: diffAnos });
}

module.exports = { formatarTempoRelativo };

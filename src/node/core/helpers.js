function moeda(valor, codigoMoeda = 'PYG') {
    const num = parseFloat(valor) || 0;
    
    // Int currencies
    if (codigoMoeda === 'PYG') {
        const intVal = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `Gs. ${intVal}`;
    }
    if (codigoMoeda === 'BRL') {
        const parts = num.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `R$ ${parts.join(',')}`;
    }
    if (codigoMoeda === 'USD') {
        const parts = num.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return `$ ${parts.join('.')}`;
    }
    if (codigoMoeda === 'EUR') {
        const parts = num.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `€ ${parts.join(',')}`;
    }
    if (codigoMoeda === 'ARS') {
        const parts = num.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `$ ${parts.join('.')}`;
    }

    const parts = num.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${codigoMoeda} ${parts.join(',')}`;
}

function parseMoeda(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    
    let s = String(str).trim();
    // Remove currency prefixes/suffixes
    s = s.replace(/(Gs\.|R\$|\$|€|Gs)/gi, '').trim();

    // Check if there are dots and no comma (e.g., 100.000 or 1.500.000)
    if (s.includes('.') && !s.includes(',')) {
        const parts = s.split('.');
        const lastPart = parts[parts.length - 1];
        if (parts.length > 2 || lastPart.length === 3) {
            s = parts.join('');
        }
    } else if (s.includes(',') && !s.includes('.')) {
        s = s.replace(',', '.');
    } else if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    }

    // Strip remaining non-numeric except minus and dot
    s = s.replace(/[^0-9.-]/g, '');
    return parseFloat(s) || 0;
}

function formatDate(dateStr, formatStr = 'YYYY-MM-DD') {
    if (!dateStr) return '';
    // 'YYYY-MM-DD' puro e interpretado como UTC por new Date(); formata direto para nao voltar 1 dia no fuso local.
    const iso = typeof dateStr === 'string' && dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const d = iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    if (formatStr === 'DD/MM/YYYY' || formatStr === 'd/m/Y') {
        return `${day}/${month}/${year}`;
    }
    return `${year}-${month}-${day}`;
}

function truncarTexto(str, max = 45) {
    if (!str) return '';
    const s = String(str).trim();
    if (s.length > max) {
        return s.substring(0, max) + '...';
    }
    return s;
}

function toLocalYMD(d = new Date()) {
    if (!d) return '';
    const dateObj = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return String(d);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Soma meses a uma data 'YYYY-MM-DD' mantendo o dia (limitado ao ultimo dia do mes destino).
function addMonthsYMD(ymd, n) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const alvo = new Date(y, m - 1 + n, 1);
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    alvo.setDate(Math.min(d, ultimo));
    return toLocalYMD(alvo);
}

module.exports = {
    addMonthsYMD,
    moeda,
    parseMoeda,
    formatDate,
    truncarTexto,
    toLocalYMD
};

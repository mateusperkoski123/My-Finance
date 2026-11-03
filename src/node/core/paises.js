// Pais da conta (escolhido no cadastro e em Configuracoes, independente do idioma): define a moeda inicial, o fuso do
// "hoje", o DDI sugerido no telefone e qual versao dos Termos/Politica vale (a lei do pais).
const PAISES_CONTA = {
    PY: { nome: { pt: 'Paraguai', es: 'Paraguay', en: 'Paraguay' }, bandeira: '🇵🇾', moeda: 'PYG', fuso: 'America/Asuncion', ddi: '+595' },
    BR: { nome: { pt: 'Brasil', es: 'Brasil', en: 'Brazil' }, bandeira: '🇧🇷', moeda: 'BRL', fuso: 'America/Sao_Paulo', ddi: '+55' },
    AR: { nome: { pt: 'Argentina', es: 'Argentina', en: 'Argentina' }, bandeira: '🇦🇷', moeda: 'ARS', fuso: 'America/Argentina/Buenos_Aires', ddi: '+54' }
};

// Contas criadas antes do campo existir e quem nao informa o pais: Paraguai (o mercado inicial).
const PAIS_PADRAO = 'PY';

function normalizarPais(v) {
    const s = String(v || '').trim().toUpperCase();
    return PAISES_CONTA[s] ? s : null;
}

const dadosPais = (v) => PAISES_CONTA[normalizarPais(v) || PAIS_PADRAO];

module.exports = { PAISES_CONTA, PAIS_PADRAO, normalizarPais, dadosPais };

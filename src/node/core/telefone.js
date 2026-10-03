// Telefone de contato: paises disponiveis no seletor e validacao do numero.
// Para liberar outro pais, basta acrescentar uma linha em PAISES (digitos do numero SEM o zero inicial).
const PAISES = [
    { codigo: '+595', iso: 'PY', bandeira: '🇵🇾', nome: { pt: 'Paraguai', es: 'Paraguay', en: 'Paraguay' }, min: 8, max: 9, exemplo: '981 123 456' },
    { codigo: '+55', iso: 'BR', bandeira: '🇧🇷', nome: { pt: 'Brasil', es: 'Brasil', en: 'Brazil' }, min: 10, max: 11, exemplo: '11 91234 5678' },
    { codigo: '+54', iso: 'AR', bandeira: '🇦🇷', nome: { pt: 'Argentina', es: 'Argentina', en: 'Argentina' }, min: 10, max: 11, exemplo: '11 1234 5678' }
];

const idiomaCurto = (lang) => { const l = String(lang || '').toLowerCase(); return l.startsWith('es') ? 'es' : l.startsWith('en') ? 'en' : 'pt'; };

// Devolve { codigo, numero } validos ou null. Aceita espacos, tracos e parenteses; tira o zero inicial.
function normalizar(codigo, numero) {
    const pais = PAISES.find((p) => p.codigo === String(codigo || '').trim());
    if (!pais) return null;
    const digitos = String(numero || '').replace(/\D/g, '').replace(/^0+/, '');
    if (digitos.length < pais.min || digitos.length > pais.max) return null;
    return { codigo: pais.codigo, numero: digitos };
}

// "+595 981123456" (para exibir) e numero so com digitos para links (wa.me / tel:).
const formatar = (codigo, numero) => (codigo && numero ? `${codigo} ${numero}` : '');
const soDigitos = (codigo, numero) => (codigo && numero ? String(codigo).replace(/\D/g, '') + String(numero).replace(/\D/g, '') : '');

module.exports = { PAISES, idiomaCurto, normalizar, formatar, soDigitos };

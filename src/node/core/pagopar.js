// Integracao com o Pagopar (API de comercios 2.0): cria o pedido, consulta o estado e valida o aviso (webhook).
// Sem PAGOPAR_PUBLIC_KEY / PAGOPAR_PRIVATE_KEY no .env o recurso fica desligado e a contratacao segue manual.
const crypto = require('crypto');
const db = require('../config/db');

const PUBLICA = process.env.PAGOPAR_PUBLIC_KEY || '';
const PRIVADA = process.env.PAGOPAR_PRIVATE_KEY || '';
const API = (process.env.PAGOPAR_API_URL || 'https://api.pagopar.com/api').replace(/\/+$/, '');
const PAGAR_URL = process.env.PAGOPAR_PAGAR_URL || 'https://www.pagopar.com/pagos';
const VALIDADE_DIAS = 3;

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const disponivel = () => Boolean(PUBLICA && PRIVADA);

function igual(a, b) {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// O aviso do Pagopar traz token = sha1(chave privada + hash do pedido).
const tokenValido = (hash, token) => Boolean(hash) && igual(token, sha1(PRIVADA + hash));

function dataHora(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function chamar(caminho, corpo) {
    const resp = await fetch(`${API}/${caminho}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(20000)
    });
    const json = await resp.json().catch(() => null);
    if (!json) throw new Error(`Pagopar respondeu ${resp.status} sem JSON.`);
    return json;
}

// Cria o pedido no Pagopar e devolve { hash, url } (a pessoa paga na pagina do Pagopar).
async function criarPedido({ pedidoId, valor, descricao, usuario, documento, telefone }) {
    const corpo = {
        token: sha1(PRIVADA + String(pedidoId) + String(valor)),
        public_key: PUBLICA,
        monto_total: valor,
        tipo_pedido: 'VENTA-COMERCIO',
        id_pedido_comercio: String(pedidoId),
        descripcion_resumen: descricao,
        fecha_maxima_pago: dataHora(Date.now() + VALIDADE_DIAS * 24 * 3600 * 1000),
        comprador: {
            ruc: documento, documento, tipo_documento: 'CI',
            nombre: usuario.nome, email: usuario.email, telefono: telefone,
            ciudad: '1', direccion: '', direccion_referencia: '', coordenadas: '', razon_social: usuario.nome
        },
        compras_items: [{
            ciudad: '1', nombre: descricao, cantidad: 1, categoria: '909', public_key: PUBLICA,
            url_imagen: '', descripcion: descricao, id_producto: String(pedidoId), precio_total: valor,
            vendedor_telefono: '', vendedor_direccion: '', vendedor_direccion_referencia: '', vendedor_direccion_coordenadas: ''
        }]
    };
    const r = await chamar('comercios/2.0/iniciar-transaccion', corpo);
    const item = r && r.respuesta === true && Array.isArray(r.resultado) ? r.resultado[0] : null;
    if (!item || !item.data) throw new Error('Pagopar recusou o pedido: ' + (typeof r.resultado === 'string' ? r.resultado : JSON.stringify(r).slice(0, 300)));
    return { hash: String(item.data), url: `${PAGAR_URL}/${item.data}` };
}

// Consulta no Pagopar se o pedido foi pago (usada no retorno da pagina e para conferir o webhook).
async function consultarPago(hash) {
    const r = await chamar('pedidos/1.1/traer', { hash_pedido: hash, token: sha1(PRIVADA + 'CONSULTA'), token_publico: PUBLICA });
    const item = r && r.respuesta === true && Array.isArray(r.resultado) ? r.resultado[0] : null;
    return { pago: Boolean(item && item.pagado === true), cancelado: Boolean(item && item.cancelado === true), valor: item ? Number(item.monto) : null };
}

const Pedido = {
    async criar(userId, planoCodigo, ciclo, valor) {
        const [r] = await db.query('INSERT INTO pagopar_pedidos (user_id, plano_codigo, ciclo, valor) VALUES (?, ?, ?, ?)', [userId, planoCodigo, ciclo, valor]);
        return r.insertId;
    },
    async definirHash(id, hash) { await db.query('UPDATE pagopar_pedidos SET hash_pedido = ? WHERE id = ?', [hash, id]); },
    async falhou(id) { await db.query("UPDATE pagopar_pedidos SET estado = 'falhou' WHERE id = ? AND estado = 'pendente'", [id]); },
    async porHash(hash) {
        const [rows] = await db.query('SELECT * FROM pagopar_pedidos WHERE hash_pedido = ? LIMIT 1', [hash]);
        return rows[0] || null;
    },
    // Marca como pago uma unica vez: devolve true so para quem conseguiu a virada (evita ativar o plano duas vezes).
    async marcarPago(id) {
        const [r] = await db.query("UPDATE pagopar_pedidos SET estado = 'pago', pago_em = NOW() WHERE id = ? AND estado <> 'pago'", [id]);
        return r.affectedRows === 1;
    },
    async desmarcarPago(id) { await db.query("UPDATE pagopar_pedidos SET estado = 'pendente', pago_em = NULL WHERE id = ?", [id]); }
};

module.exports = { disponivel, tokenValido, criarPedido, consultarPago, Pedido };

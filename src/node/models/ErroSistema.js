// Erros do servidor guardados no banco: o log da hospedagem zera a cada deploy, entao sem isto um erro de ontem some.
// Erros iguais (mesma mensagem, numeros ignorados, e mesmo ponto do codigo) viram uma linha com o numero de ocorrencias.
// Aparecem em Admin > Erros. Registrar nunca lanca erro (um problema aqui nao pode derrubar a resposta ao usuario).
const crypto = require('crypto');
const db = require('../config/db');

const DIAS_GUARDADOS = 60;

// Primeira linha do stack que e codigo do app (nao de node_modules nem do Node).
function pontoDoCodigo(stack) {
    const linhas = String(stack || '').split('\n').slice(1).map((l) => l.trim());
    return linhas.find((l) => l && !l.includes('node_modules') && !l.includes('node:')) || linhas[0] || '';
}

// Rota sem query string e sem tokens (links de redefinir senha, verificar e-mail, Pagopar).
function rotaSegura(req) {
    if (!req) return null;
    const caminho = String(req.originalUrl || req.url || '').split('?')[0];
    return caminho.replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:token').slice(0, 255);
}

async function registrar(erro, req) {
    try {
        const mensagem = String((erro && erro.message) || erro || 'erro sem mensagem').slice(0, 500);
        const stack = erro && erro.stack ? String(erro.stack).slice(0, 8000) : null;
        const assinatura = crypto.createHash('sha1').update(mensagem.replace(/\d+/g, '#') + '|' + pontoDoCodigo(stack)).digest('hex');
        const userId = req && req.user ? req.user.id : (req && req.session && req.session.user_id) || null;
        await db.query(
            `INSERT INTO erros_sistema (assinatura, mensagem, stack, metodo, rota, user_id)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ocorrencias = ocorrencias + 1, ultimo_em = NOW(), mensagem = VALUES(mensagem),
                stack = VALUES(stack), metodo = VALUES(metodo), rota = VALUES(rota), user_id = VALUES(user_id)`,
            [assinatura, mensagem, stack, req ? String(req.method || '').slice(0, 10) : null, rotaSegura(req), userId]
        );
        if (Math.random() < 0.05) await db.query('DELETE FROM erros_sistema WHERE ultimo_em < NOW() - INTERVAL ? DAY', [DIAS_GUARDADOS]);
    } catch (e) {
        console.error('[ErroSistema] nao foi possivel registrar o erro:', e.message);
    }
}

async function listar() {
    const [rows] = await db.query(
        `SELECT e.*, u.email AS user_email
         FROM erros_sistema e LEFT JOIN users u ON u.id = e.user_id
         ORDER BY e.ultimo_em DESC LIMIT 200`);
    return rows;
}

async function apagar(id) { await db.query('DELETE FROM erros_sistema WHERE id = ?', [id]); }
async function limpar() { await db.query('DELETE FROM erros_sistema'); }

module.exports = { registrar, listar, apagar, limpar, DIAS_GUARDADOS };

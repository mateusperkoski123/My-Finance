// Runner de migrations para o app Node. Usa a mesma tabela `migrations` (arquivo)
// do runner PHP (database/migrate.php), entao os dois sao compativeis.
//
// - Aplica, em ordem, os .sql de database/migrations que ainda nao constam na tabela.
// - Tolerante a estados parciais: erros de "ja existe" (coluna, indice, tabela, FK) sao
//   ignorados, para funcionar tanto em bancos antigos criados na mao quanto em bancos novos.
// - Trava global (GET_LOCK) evita que varias instancias (pm2 cluster) migrem ao mesmo tempo.
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const DIR = path.join(__dirname, '../../../database/migrations');
const LOCK = 'gf_migrations';

// Codigos de erro MySQL/MariaDB que significam "isso ja existe" (idempotencia).
const JA_EXISTE = new Set([1050, 1060, 1061, 1826, 1022]);

function dividirStatements(sql) {
    const semComentarios = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    return semComentarios.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
}

function ehDuplicidade(err) {
    if (JA_EXISTE.has(err.errno)) return true;
    // FK duplicada em MariaDB/MySQL 5.x aparece como 1005 com errno 121.
    return err.errno === 1005 && /errno: 121|duplicate/i.test(err.message || '');
}

async function migrar() {
    const conn = await db.getConnection();
    try {
        const [[lock]] = await conn.query('SELECT GET_LOCK(?, 120) AS ok', [LOCK]);
        if (!lock.ok) throw new Error('Nao foi possivel obter a trava de migrations.');

        await conn.query(
            `CREATE TABLE IF NOT EXISTS migrations (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                arquivo VARCHAR(190) NOT NULL UNIQUE,
                aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        );
        const [aplicadas] = await conn.query('SELECT arquivo FROM migrations');
        const feitas = new Set(aplicadas.map((r) => r.arquivo));

        const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
        const novas = [];
        for (const arquivo of arquivos) {
            if (feitas.has(arquivo)) continue;
            const sql = fs.readFileSync(path.join(DIR, arquivo), 'utf8');
            for (const stmt of dividirStatements(sql)) {
                try {
                    await conn.query(stmt);
                } catch (err) {
                    if (!ehDuplicidade(err)) {
                        err.message = `Migration ${arquivo} falhou: ${err.message}`;
                        throw err;
                    }
                }
            }
            await conn.query('INSERT INTO migrations (arquivo) VALUES (?)', [arquivo]);
            novas.push(arquivo);
        }
        return novas;
    } finally {
        try { await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]); } catch (e) { /* conexao ja caiu */ }
        conn.release();
    }
}

// Promove a admin os e-mails listados em ADMIN_EMAILS (separados por virgula).
async function promoverAdmins() {
    const lista = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!lista.length) return 0;
    const [r] = await db.query(
        `UPDATE users SET role = 'admin' WHERE LOWER(email) IN (${lista.map(() => '?').join(',')}) AND role <> 'admin'`,
        lista
    );
    return r.affectedRows;
}

module.exports = { migrar, promoverAdmins, dividirStatements };

const db = require('../config/db');

// Registro de exclusoes para a sincronizacao do app: as tabelas principais apagam de verdade
// (todas as consultas do sistema continuam validas), e o app descobre o que sumiu por aqui.
class SyncExclusao {
    // Copia (tabela, id, client_id) das linhas que serao apagadas. `onde` e um trecho SQL fixo do chamador.
    static async registrar(tabela, onde, params, conn = db) {
        if (!['lancamentos', 'contas', 'categorias'].includes(tabela)) throw new Error('tabela_invalida');
        await conn.query(
            `INSERT INTO sync_exclusoes (user_id, tabela, registro_id, client_id, excluido_em)
             SELECT user_id, '${tabela}', id, client_id, NOW(3) FROM ${tabela} WHERE ${onde}`,
            params
        );
    }

    // Exclusoes do usuario depois do cursor (id crescente); o app apaga o registro local.
    static async desde(userId, ultimoId, limite) {
        const [rows] = await db.query(
            'SELECT id, tabela, registro_id, client_id FROM sync_exclusoes WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT ?',
            [userId, ultimoId, limite]
        );
        return rows;
    }
}

module.exports = SyncExclusao;

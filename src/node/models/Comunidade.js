const db = require('../config/db');

// REVISAR (seguranca): formatacao de nome de usuario sem expor email ou senha.
function formatarNomeUsuario(user) {
    if (!user) {
        return { id: null, nome: 'Usuário', iniciais: 'U', ehEquipe: false };
    }
    if (user.role === 'admin') {
        return { id: user.id, nome: 'Equipe MyFinance', iniciais: 'MF', ehEquipe: true };
    }
    const nomeBruto = String(user.nome || '').trim();
    if (!nomeBruto) {
        return { id: user.id, nome: 'Usuário', iniciais: 'U', ehEquipe: false };
    }
    const partes = nomeBruto.split(/\s+/);
    if (partes.length === 1) {
        return { id: user.id, nome: partes[0], iniciais: partes[0].charAt(0).toUpperCase(), ehEquipe: false };
    }
    const primeiroNome = partes[0];
    const inicialSobrenome = partes[partes.length - 1].charAt(0).toUpperCase();
    const exibid = `${primeiroNome} ${inicialSobrenome}.`;
    const iniciais = (primeiroNome.charAt(0) + inicialSobrenome).toUpperCase();
    return { id: user.id, nome: exibid, iniciais, ehEquipe: false };
}

class Comunidade {
    // REVISAR (seguranca): consultas parametrizadas e sanitizacao de busca LIKE.
    static async buscarPosts({ orden = 'top', categoria = '', q = '', pagina = 1, limite = 15, minhasUserId = null, usuarioLogadoId = null, ehAdmin = false }) {
        pagina = Math.max(1, parseInt(pagina, 10) || 1);
        limite = Math.max(1, Math.min(50, parseInt(limite, 10) || 15));
        const offset = (pagina - 1) * limite;

        const whereConds = [];
        const params = [];

        if (!ehAdmin) {
            whereConds.push('p.oculto = 0');
        }

        if (categoria && ['sugestao', 'bug'].includes(categoria)) {
            whereConds.push('p.categoria = ?');
            params.push(categoria);
        }

        if (minhasUserId) {
            whereConds.push('p.user_id = ?');
            params.push(minhasUserId);
        }

        if (q && q.trim().length > 0) {
            const qEscapado = '%' + q.trim().replace(/[%_\\]/g, '\\$&') + '%';
            whereConds.push('(p.titulo LIKE ? OR p.descricao LIKE ?)');
            params.push(qEscapado, qEscapado);
        }

        const whereClause = whereConds.length ? 'WHERE ' + whereConds.join(' AND ') : '';

        // Ordenacao estrita (whitelist)
        let orderBy = 'ORDER BY p.votos DESC, p.created_at DESC';
        let selectPontos = '';
        if (orden === 'novo') {
            orderBy = 'ORDER BY p.created_at DESC';
        } else if (orden === 'tendencia') {
            selectPontos = `, ((SELECT COUNT(*) FROM comunidade_votos v WHERE v.post_id = p.id AND v.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) +
                             (SELECT COUNT(*) FROM comunidade_comentarios c WHERE c.post_id = p.id AND c.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))) AS pontos_tendencia`;
            orderBy = 'ORDER BY pontos_tendencia DESC, p.votos DESC, p.created_at DESC';
        }

        const countSql = `SELECT COUNT(*) AS total FROM comunidade_posts p ${whereClause}`;
        const [[{ total }]] = await db.query(countSql, params);

        const sql = `
            SELECT p.*,
                   u.nome AS autor_nome, u.role AS autor_role ${selectPontos}
            FROM comunidade_posts p
            LEFT JOIN users u ON p.user_id = u.id
            ${whereClause}
            ${orderBy}
            LIMIT ? OFFSET ?
        `;

        const queryParams = [...params, limite, offset];
        const [rows] = await db.query(sql, queryParams);

        // Se usuario estiver logado, buscar votos do usuario de uma vez
        let votosSet = new Set();
        if (usuarioLogadoId && rows.length > 0) {
            const postIds = rows.map(r => r.id);
            const [votosRows] = await db.query(
                `SELECT post_id FROM comunidade_votos WHERE user_id = ? AND post_id IN (${postIds.map(() => '?').join(',')})`,
                [usuarioLogadoId, ...postIds]
            );
            votosRows.forEach(v => votosSet.add(v.post_id));
        }

        const items = rows.map(row => {
            const autor = formatarNomeUsuario({ id: row.user_id, nome: row.autor_nome, role: row.autor_role });
            return {
                id: row.id,
                user_id: row.user_id,
                categoria: row.categoria,
                titulo: row.titulo,
                descricao: row.descricao,
                esperado: row.esperado,
                status: row.status,
                oculto: Boolean(row.oculto),
                votos: row.votos,
                comentarios: row.comentarios,
                resolvido_em: row.resolvido_em,
                created_at: row.created_at,
                autor,
                jaVotou: votosSet.has(row.id)
            };
        });

        const totalPaginas = Math.ceil(total / limite) || 1;

        return {
            items,
            total,
            pagina,
            limite,
            totalPaginas
        };
    }

    // REVISAR (seguranca): confirma que a postagem existe e que o usuario pode interagir com ela (oculta so para admin).
    static async postAcessivel(postId, ehAdmin) {
        if (!postId) return false;
        const [rows] = await db.query(`SELECT oculto FROM comunidade_posts WHERE id = ?`, [postId]);
        if (!rows.length) return false;
        return ehAdmin || !rows[0].oculto;
    }

    static async buscarSimilares(q) {
        if (!q || q.trim().length < 4) return [];
        const qEscapado = '%' + q.trim().replace(/[%_\\]/g, '\\$&') + '%';
        const [rows] = await db.query(
            `SELECT id, titulo, categoria, status FROM comunidade_posts WHERE oculto = 0 AND titulo LIKE ? ORDER BY created_at DESC LIMIT 5`,
            [qEscapado]
        );
        return rows;
    }

    static async buscarPostPorId(id, usuarioLogadoId = null, ehAdmin = false) {
        const [rows] = await db.query(
            `SELECT p.*, u.nome AS autor_nome, u.role AS autor_role
             FROM comunidade_posts p
             LEFT JOIN users u ON p.user_id = u.id
             WHERE p.id = ?`,
            [id]
        );
        if (!rows.length) return null;
        const post = rows[0];

        if (post.oculto && !ehAdmin) {
            return null;
        }

        const autor = formatarNomeUsuario({ id: post.user_id, nome: post.autor_nome, role: post.autor_role });

        let jaVotou = false;
        let nivelImportancia = null;
        let jaSeguiu = false;

        if (usuarioLogadoId) {
            const [[voto]] = await db.query(`SELECT id FROM comunidade_votos WHERE post_id = ? AND user_id = ?`, [id, usuarioLogadoId]);
            jaVotou = Boolean(voto);

            const [[imp]] = await db.query(`SELECT nivel FROM comunidade_importancia WHERE post_id = ? AND user_id = ?`, [id, usuarioLogadoId]);
            nivelImportancia = imp ? imp.nivel : null;

            const [[insc]] = await db.query(`SELECT id FROM comunidade_inscricoes WHERE post_id = ? AND user_id = ?`, [id, usuarioLogadoId]);
            jaSeguiu = Boolean(insc);
        }

        // Anexos do post (comentario_id IS NULL)
        const [anexosRows] = await db.query(
            `SELECT id, nome_original, mime, tamanho, created_at FROM comunidade_anexos WHERE post_id = ? AND comentario_id IS NULL ORDER BY id ASC`,
            [id]
        );

        // Comentarios
        const [comentariosRows] = await db.query(
            `SELECT c.*, u.nome AS autor_nome, u.role AS autor_role
             FROM comunidade_comentarios c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.post_id = ?
             ORDER BY c.created_at ASC`,
            [id]
        );

        // Anexos dos comentarios
        const comentarioIds = comentariosRows.map(c => c.id);
        let comentAnexosMap = {};
        if (comentarioIds.length > 0) {
            const [anexosComentRows] = await db.query(
                `SELECT id, comentario_id, nome_original, mime, tamanho FROM comunidade_anexos WHERE comentario_id IN (${comentarioIds.map(() => '?').join(',')})`,
                comentarioIds
            );
            anexosComentRows.forEach(a => {
                if (!comentAnexosMap[a.comentario_id]) comentAnexosMap[a.comentario_id] = [];
                comentAnexosMap[a.comentario_id].push(a);
            });
        }

        const comentarios = comentariosRows.map(c => {
            const cAutor = formatarNomeUsuario({ id: c.user_id, nome: c.autor_nome, role: c.da_equipe ? 'admin' : c.autor_role });
            return {
                id: c.id,
                post_id: c.post_id,
                user_id: c.user_id,
                corpo: c.corpo,
                da_equipe: Boolean(c.da_equipe),
                created_at: c.created_at,
                autor: cAutor,
                anexos: comentAnexosMap[c.id] || []
            };
        });

        // Atividades
        const [atividadesRows] = await db.query(
            `SELECT a.*, u.nome AS autor_nome, u.role AS autor_role
             FROM comunidade_atividades a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.post_id = ?
             ORDER BY a.created_at DESC`,
            [id]
        );

        const atividades = atividadesRows.map(a => {
            const aAutor = formatarNomeUsuario({ id: a.user_id, nome: a.autor_nome, role: a.autor_role });
            return {
                id: a.id,
                tipo: a.tipo,
                detalhe: a.detalhe,
                created_at: a.created_at,
                autor: aAutor
            };
        });

        return {
            id: post.id,
            user_id: post.user_id,
            categoria: post.categoria,
            titulo: post.titulo,
            descricao: post.descricao,
            esperado: post.esperado,
            contexto_url: post.contexto_url,
            contexto_ua: post.contexto_ua,
            status: post.status,
            oculto: Boolean(post.oculto),
            votos: post.votos,
            comentarios_count: post.comentarios,
            resolvido_em: post.resolvido_em,
            created_at: post.created_at,
            updated_at: post.updated_at,
            autor,
            jaVotou,
            nivelImportancia,
            jaSeguiu,
            anexos: anexosRows,
            comentarios,
            atividades
        };
    }

    // REVISAR (seguranca): transacao para insercao atomica de post, anexos, atividade e inscricao.
    static async criarPost({ userId, categoria, titulo, descricao, esperado = null, contextoUrl = null, contextoUa = null, arquivos = [] }) {
        if (!['sugestao', 'bug'].includes(categoria)) categoria = 'sugestao';
        titulo = String(titulo || '').trim();
        descricao = String(descricao || '').trim();
        esperado = esperado ? String(esperado).trim().slice(0, 1000) : null;
        contextoUrl = contextoUrl ? String(contextoUrl).trim().slice(0, 255) : null;
        contextoUa = contextoUa ? String(contextoUa).trim().slice(0, 255) : null;

        if (titulo.length < 5 || titulo.length > 120) {
            throw new Error('flash.comunidade_titulo_tamanho');
        }
        if (descricao.length < 10 || descricao.length > 5000) {
            throw new Error('flash.comunidade_descricao_tamanho');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [res] = await conn.query(
                `INSERT INTO comunidade_posts (user_id, categoria, titulo, descricao, esperado, contexto_url, contexto_ua, status, oculto, votos, comentarios)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'novo', 0, 0, 0)`,
                [userId, categoria, titulo, descricao, esperado, contextoUrl, contextoUa]
            );
            const postId = res.insertId;

            // Anexos (max 4)
            if (arquivos && arquivos.length > 0) {
                const limitados = arquivos.slice(0, 4);
                for (const file of limitados) {
                    await conn.query(
                        `INSERT INTO comunidade_anexos (post_id, user_id, nome_original, mime, tamanho, dados) VALUES (?, ?, ?, ?, ?, ?)`,
                        [postId, userId, file.originalname ? file.originalname.slice(0, 190) : 'imagem', file.mimeDetectado || file.mimetype, file.buffer.length, file.buffer]
                    );
                }
            }

            // Inscrição automática do autor
            await conn.query(
                `INSERT INTO comunidade_inscricoes (post_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=id`,
                [postId, userId]
            );

            // Registro de atividade
            await conn.query(
                `INSERT INTO comunidade_atividades (post_id, user_id, tipo) VALUES (?, ?, 'criado')`,
                [postId, userId]
            );

            await conn.commit();
            return postId;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // REVISAR (seguranca): transacao para alternar voto e atualizar contador denormalizado.
    static async alternarVoto({ postId, userId }) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [[voto]] = await conn.query(`SELECT id FROM comunidade_votos WHERE post_id = ? AND user_id = ? FOR UPDATE`, [postId, userId]);

            let votou = false;
            if (voto) {
                await conn.query(`DELETE FROM comunidade_votos WHERE id = ?`, [voto.id]);
                await conn.query(`UPDATE comunidade_posts SET votos = GREATEST(0, votos - 1) WHERE id = ?`, [postId]);
                votou = false;
            } else {
                await conn.query(`INSERT INTO comunidade_votos (post_id, user_id) VALUES (?, ?)`, [postId, userId]);
                await conn.query(`UPDATE comunidade_posts SET votos = votos + 1 WHERE id = ?`, [postId]);
                votou = true;
            }

            const [[p]] = await conn.query(`SELECT votos FROM comunidade_posts WHERE id = ?`, [postId]);

            await conn.commit();
            return { votou, votos: p ? p.votos : 0 };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async definirImportancia({ postId, userId, nivel }) {
        nivel = parseInt(nivel, 10);
        if (![1, 2, 3, 4].includes(nivel)) {
            throw new Error('Nível de importância inválido.');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [[imp]] = await conn.query(`SELECT id, nivel FROM comunidade_importancia WHERE post_id = ? AND user_id = ? FOR UPDATE`, [postId, userId]);

            let novoNivel = null;
            if (imp && imp.nivel === nivel) {
                await conn.query(`DELETE FROM comunidade_importancia WHERE id = ?`, [imp.id]);
                novoNivel = null;
            } else if (imp) {
                await conn.query(`UPDATE comunidade_importancia SET nivel = ? WHERE id = ?`, [nivel, imp.id]);
                novoNivel = nivel;
            } else {
                await conn.query(`INSERT INTO comunidade_importancia (post_id, user_id, nivel) VALUES (?, ?, ?)`, [postId, userId, nivel]);
                novoNivel = nivel;
            }

            await conn.commit();
            return { nivel: novoNivel };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async alternarInscricao({ postId, userId }) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [[insc]] = await conn.query(`SELECT id FROM comunidade_inscricoes WHERE post_id = ? AND user_id = ? FOR UPDATE`, [postId, userId]);

            let seguiu = false;
            if (insc) {
                await conn.query(`DELETE FROM comunidade_inscricoes WHERE id = ?`, [insc.id]);
                seguiu = false;
            } else {
                await conn.query(`INSERT INTO comunidade_inscricoes (post_id, user_id) VALUES (?, ?)`, [postId, userId]);
                seguiu = true;
            }

            await conn.commit();
            return { seguiu };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // REVISAR (seguranca): transacao para comentario atomico.
    static async criarComentario({ postId, userId, daEquipe = false, corpo, arquivos = [] }) {
        corpo = String(corpo || '').trim();
        if (corpo.length < 1 || corpo.length > 2000) {
            throw new Error('flash.comunidade_comentario_tamanho');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [res] = await conn.query(
                `INSERT INTO comunidade_comentarios (post_id, user_id, corpo, da_equipe) VALUES (?, ?, ?, ?)`,
                [postId, userId, corpo, daEquipe ? 1 : 0]
            );
            const comentarioId = res.insertId;

            // Anexos (max 2)
            if (arquivos && arquivos.length > 0) {
                const limitados = arquivos.slice(0, 2);
                for (const file of limitados) {
                    await conn.query(
                        `INSERT INTO comunidade_anexos (comentario_id, user_id, nome_original, mime, tamanho, dados) VALUES (?, ?, ?, ?, ?, ?)`,
                        [comentarioId, userId, file.originalname ? file.originalname.slice(0, 190) : 'imagem', file.mimeDetectado || file.mimetype, file.buffer.length, file.buffer]
                    );
                }
            }

            await conn.query(`UPDATE comunidade_posts SET comentarios = comentarios + 1 WHERE id = ?`, [postId]);
            await conn.query(`INSERT INTO comunidade_atividades (post_id, user_id, tipo) VALUES (?, ?, 'comentario')`, [postId, userId]);

            await conn.commit();
            return comentarioId;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // REVISAR (seguranca): autorizacao estrita no server para exclusao de postagem.
    static async excluirPost({ postId, userId, ehAdmin }) {
        const [[post]] = await db.query(`SELECT * FROM comunidade_posts WHERE id = ?`, [postId]);
        if (!post) throw new Error('flash.comunidade_nao_encontrada');

        if (!ehAdmin) {
            if (post.user_id !== userId) {
                throw new Error('flash.comunidade_sem_permissao');
            }
            if (post.status === 'resolvido') {
                throw new Error('flash.comunidade_sem_permissao');
            }
            // Verificar comentarios de terceiros
            const [[{ n }]] = await db.query(
                `SELECT COUNT(*) AS n FROM comunidade_comentarios WHERE post_id = ? AND (user_id IS NULL OR user_id != ?)`,
                [postId, userId]
            );
            if (n > 0) {
                throw new Error('flash.comunidade_sem_permissao');
            }
        }

        await db.query(`DELETE FROM comunidade_posts WHERE id = ?`, [postId]);
        return true;
    }

    // REVISAR (seguranca): autorizacao estrita no server para exclusao de comentario.
    static async excluirComentario({ comentarioId, userId, ehAdmin }) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [[coment]] = await conn.query(`SELECT * FROM comunidade_comentarios WHERE id = ? FOR UPDATE`, [comentarioId]);
            if (!coment) throw new Error('flash.comunidade_nao_encontrada');

            if (!ehAdmin && coment.user_id !== userId) {
                throw new Error('flash.comunidade_sem_permissao');
            }

            await conn.query(`DELETE FROM comunidade_comentarios WHERE id = ?`, [comentarioId]);
            await conn.query(`UPDATE comunidade_posts SET comentarios = GREATEST(0, comentarios - 1) WHERE id = ?`, [coment.post_id]);

            await conn.commit();
            return { postId: coment.post_id };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Ações de Admin
    static async alterarStatus({ postId, userId, novoStatus }) {
        const permitidos = ['novo', 'em_analise', 'planejado', 'em_andamento', 'resolvido', 'recusado'];
        if (!permitidos.includes(novoStatus)) {
            throw new Error('Status inválido.');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const resolvidoEm = novoStatus === 'resolvido' ? new Date() : null;
            await conn.query(
                `UPDATE comunidade_posts SET status = ?, resolvido_em = ? WHERE id = ?`,
                [novoStatus, resolvidoEm, postId]
            );

            await conn.query(
                `INSERT INTO comunidade_atividades (post_id, user_id, tipo, detalhe) VALUES (?, ?, 'status', ?)`,
                [postId, userId, novoStatus]
            );

            await conn.commit();
            return true;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async alterarCategoria({ postId, userId, novaCategoria }) {
        if (!['sugestao', 'bug'].includes(novaCategoria)) {
            throw new Error('Categoria inválida.');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            await conn.query(`UPDATE comunidade_posts SET categoria = ? WHERE id = ?`, [novaCategoria, postId]);
            await conn.query(
                `INSERT INTO comunidade_atividades (post_id, user_id, tipo, detalhe) VALUES (?, ?, 'categoria', ?)`,
                [postId, userId, novaCategoria]
            );

            await conn.commit();
            return true;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async alternarOculto({ postId, userId }) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [[post]] = await conn.query(`SELECT oculto FROM comunidade_posts WHERE id = ? FOR UPDATE`, [postId]);
            if (!post) throw new Error('flash.comunidade_nao_encontrada');

            const novoOculto = post.oculto ? 0 : 1;
            await conn.query(`UPDATE comunidade_posts SET oculto = ? WHERE id = ?`, [novoOculto, postId]);
            await conn.query(
                `INSERT INTO comunidade_atividades (post_id, user_id, tipo, detalhe) VALUES (?, ?, 'ocultado', ?)`,
                [postId, userId, novoOculto ? 'oculto' : 'visivel']
            );

            await conn.commit();
            return Boolean(novoOculto);
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // REVISAR (seguranca): busca de anexo com validacao de visibilidade da postagem.
    static async buscarAnexo(anexoId, userId, ehAdmin) {
        const [rows] = await db.query(
            `SELECT a.*, p.oculto AS post_oculto
             FROM comunidade_anexos a
             LEFT JOIN comunidade_posts p ON (a.post_id = p.id OR (a.comentario_id IS NOT NULL AND p.id = (SELECT post_id FROM comunidade_comentarios WHERE id = a.comentario_id)))
             WHERE a.id = ?`,
            [anexoId]
        );
        if (!rows.length) return null;
        const anexo = rows[0];

        if (anexo.post_oculto && !ehAdmin) {
            return null;
        }

        return anexo;
    }

    static async buscarContagensImportancia(postId) {
        const [rows] = await db.query(
            `SELECT nivel, COUNT(*) AS total FROM comunidade_importancia WHERE post_id = ? GROUP BY nivel`,
            [postId]
        );
        const res = { 1: 0, 2: 0, 3: 0, 4: 0 };
        rows.forEach(r => {
            if (res[r.nivel] !== undefined) res[r.nivel] = r.total;
        });
        return res;
    }

    static async buscarMinhasPostagens(userId, limite = 5) {
        if (!userId) return [];
        const [rows] = await db.query(
            `SELECT id, titulo, status, categoria, created_at FROM comunidade_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
            [userId, limite]
        );
        return rows;
    }

    static async buscarCategoriasContagem() {
        const [rows] = await db.query(
            `SELECT categoria, COUNT(*) AS total FROM comunidade_posts WHERE oculto = 0 GROUP BY categoria`
        );
        const res = { sugestao: 0, bug: 0 };
        rows.forEach(r => {
            if (res[r.categoria] !== undefined) res[r.categoria] = r.total;
        });
        return res;
    }
}

module.exports = Comunidade;

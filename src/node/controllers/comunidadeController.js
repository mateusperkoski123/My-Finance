const Comunidade = require('../models/Comunidade');
const { validarImagem } = require('../core/uploads');
const { formatarTempoRelativo } = require('../core/tempoRelativo');

const comunidadeController = {
    async index(req, res) {
        // Ha novidade que o usuario ainda nao viu e nenhuma lista foi pedida: abre pelas Novidades.
        if (res.locals.novidadesNovas > 0 && !Object.keys(req.query).length) return res.redirect('/comunidade/novidades');
        const orden = ['top', 'novo', 'tendencia'].includes(req.query.orden) ? req.query.orden : 'top';
        const categoria = ['sugestao', 'bug'].includes(req.query.categoria) ? req.query.categoria : '';
        const q = String(req.query.q || '').slice(0, 120);
        const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
        const minhas = req.query.minhas === '1';

        const userId = req.user ? req.user.id : null;
        const ehAdmin = Boolean(req.ehAdmin);

        const dados = await Comunidade.buscarPosts({
            orden,
            categoria,
            q,
            pagina,
            limite: 15,
            minhasUserId: minhas ? userId : null,
            usuarioLogadoId: userId,
            ehAdmin
        });

        // Formatar tempo relativo para cada post
        dados.items.forEach(p => {
            p.tempoRelativo = formatarTempoRelativo(p.created_at, req.t);
        });

        const minhasPostagens = await Comunidade.buscarMinhasPostagens(userId, 5);
        const contagemCategorias = await Comunidade.buscarCategoriasContagem();

        res.render('comunidade/index', {
            title: req.t('comunidade.titulo'),
            posts: dados.items,
            paginacao: {
                pagina: dados.pagina,
                totalPaginas: dados.totalPaginas,
                total: dados.total
            },
            filtros: {
                orden,
                categoria,
                q,
                minhas
            },
            minhasPostagens,
            contagemCategorias,
            formatarTempoRelativo: (d) => formatarTempoRelativo(d, req.t)
        });
    },

    async similares(req, res) {
        const q = String(req.query.q || '').slice(0, 120);
        if (q.trim().length < 4) {
            return res.json([]);
        }
        const similares = await Comunidade.buscarSimilares(q);
        return res.json(similares);
    },

    // REVISAR (seguranca): servir anexo com cabecalhos estritos de seguranca.
    async servirAnexo(req, res) {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(404).render('404', { title: req.t('erro404.titulo') });

        const anexo = await Comunidade.buscarAnexo(id, req.user ? req.user.id : null, Boolean(req.ehAdmin));
        if (!anexo || !anexo.dados) {
            return res.status(404).render('404', { title: req.t('erro404.titulo') });
        }

        res.setHeader('Content-Type', anexo.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline; filename="imagem"');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");

        return res.send(anexo.dados);
    },

    async detalhe(req, res) {
        const id = parseInt(req.params.id, 10);
        if (!id) {
            if (req.query.parcial) return res.status(404).send(req.t('flash.comunidade_nao_encontrada'));
            return res.status(404).render('404', { title: req.t('erro404.titulo') });
        }

        const userId = req.user ? req.user.id : null;
        const ehAdmin = Boolean(req.ehAdmin);

        const post = await Comunidade.buscarPostPorId(id, userId, ehAdmin);
        if (!post) {
            if (req.query.parcial) return res.status(404).send(req.t('flash.comunidade_nao_encontrada'));
            return res.status(404).render('404', { title: req.t('erro404.titulo') });
        }

        post.tempoRelativo = formatarTempoRelativo(post.created_at, req.t);
        post.comentarios.forEach(c => {
            c.tempoRelativo = formatarTempoRelativo(c.created_at, req.t);
        });
        post.atividades.forEach(a => {
            a.tempoRelativo = formatarTempoRelativo(a.created_at, req.t);
        });

        let estatisticasImportancia = null;
        if (ehAdmin) {
            estatisticasImportancia = await Comunidade.buscarContagensImportancia(id);
        }

        if (req.query.parcial === '1') {
            return res.render('comunidade/_detalhe', {
                layout: false,
                post,
                ehAdmin,
                estatisticasImportancia,
                formatarTempoRelativo: (d) => formatarTempoRelativo(d, req.t)
            });
        }

        return res.render('comunidade/detalhe', {
            title: post.titulo + ' - ' + req.t('comunidade.titulo'),
            post,
            ehAdmin,
            estatisticasImportancia,
            formatarTempoRelativo: (d) => formatarTempoRelativo(d, req.t)
        });
    },

    async criar(req, res) {
        const { categoria, titulo, descricao, esperado, contexto_url, contexto_ua } = req.body;
        const arquivosBrutos = req.files || [];

        // Validar cada arquivo enviado pelo multer usando a skill de uploads (magic numbers)
        const arquivosValidados = [];
        for (const file of arquivosBrutos) {
            const v = validarImagem(file.buffer, file.mimetype);
            if (!v.ok) {
                const msg = req.t(v.motivo);
                if (req.xhr || req.headers.accept?.includes('json')) {
                    return res.status(400).json({ sucesso: false, erro: msg });
                }
                req.session.flash = { tipo: 'erro', mensagem: msg };
                return res.redirect('/comunidade');
            }
            file.mimeDetectado = v.mime;
            arquivosValidados.push(file);
        }

        try {
            const postId = await Comunidade.criarPost({
                userId: req.user.id,
                categoria,
                titulo,
                descricao,
                esperado,
                contextoUrl: contexto_url,
                contextoUa: contexto_ua,
                arquivos: arquivosValidados
            });

            const msgSucesso = req.t('flash.comunidade_criada');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ sucesso: true, id: postId, url: '/comunidade/' + postId, mensagem: msgSucesso });
            }

            req.session.flash = { tipo: 'sucesso', mensagem: msgSucesso };
            return res.redirect('/comunidade/' + postId);
        } catch (err) {
            const msgErro = req.t(err.message.startsWith('flash.') ? err.message : 'flash.comunidade_descricao_tamanho');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade');
        }
    },

    async votar(req, res) {
        const id = parseInt(req.params.id, 10);
        try {
            if (!(await Comunidade.postAcessivel(id, Boolean(req.ehAdmin)))) {
                return res.status(404).json({ sucesso: false, erro: req.t('flash.comunidade_nao_encontrada') });
            }
            const resVoto = await Comunidade.alternarVoto({ postId: id, userId: req.user.id });
            return res.json({ sucesso: true, ...resVoto });
        } catch (err) {
            return res.status(400).json({ sucesso: false, erro: req.t('flash.comunidade_sem_permissao') });
        }
    },

    async importancia(req, res) {
        const id = parseInt(req.params.id, 10);
        const nivel = req.body.nivel;
        try {
            if (!(await Comunidade.postAcessivel(id, Boolean(req.ehAdmin)))) {
                return res.status(404).json({ sucesso: false, erro: req.t('flash.comunidade_nao_encontrada') });
            }
            const resImp = await Comunidade.definirImportancia({ postId: id, userId: req.user.id, nivel });
            return res.json({ sucesso: true, ...resImp });
        } catch (err) {
            return res.status(400).json({ sucesso: false, erro: req.t('flash.comunidade_sem_permissao') });
        }
    },

    async seguir(req, res) {
        const id = parseInt(req.params.id, 10);
        try {
            if (!(await Comunidade.postAcessivel(id, Boolean(req.ehAdmin)))) {
                return res.status(404).json({ sucesso: false, erro: req.t('flash.comunidade_nao_encontrada') });
            }
            const resInsc = await Comunidade.alternarInscricao({ postId: id, userId: req.user.id });
            return res.json({ sucesso: true, ...resInsc });
        } catch (err) {
            return res.status(400).json({ sucesso: false, erro: req.t('flash.comunidade_sem_permissao') });
        }
    },

    async comentar(req, res) {
        const id = parseInt(req.params.id, 10);
        const { corpo } = req.body;
        const arquivosBrutos = req.files || [];

        if (!(await Comunidade.postAcessivel(id, Boolean(req.ehAdmin)))) {
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(404).json({ sucesso: false, erro: req.t('flash.comunidade_nao_encontrada') });
            }
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.comunidade_nao_encontrada') };
            return res.redirect('/comunidade');
        }

        const arquivosValidados = [];
        for (const file of arquivosBrutos) {
            const v = validarImagem(file.buffer, file.mimetype);
            if (!v.ok) {
                const msg = req.t(v.motivo);
                if (req.xhr || req.headers.accept?.includes('json')) {
                    return res.status(400).json({ sucesso: false, erro: msg });
                }
                req.session.flash = { tipo: 'erro', mensagem: msg };
                return res.redirect('/comunidade/' + id);
            }
            file.mimeDetectado = v.mime;
            arquivosValidados.push(file);
        }

        try {
            const comentId = await Comunidade.criarComentario({
                postId: id,
                userId: req.user.id,
                daEquipe: req.ehAdmin,
                corpo,
                arquivos: arquivosValidados
            });

            const postAtualizado = await Comunidade.buscarPostPorId(id, req.user.id, req.ehAdmin);
            const comentNovo = postAtualizado.comentarios.find(c => c.id === comentId);
            if (comentNovo) {
                comentNovo.tempoRelativo = formatarTempoRelativo(comentNovo.created_at, req.t);
            }

            if (req.xhr || req.headers.accept?.includes('json')) {
                let htmlFragmento = '';
                if (comentNovo) {
                    htmlFragmento = await new Promise((resolve, reject) => {
                        res.render('comunidade/_comentario', { layout: false, comentario: comentNovo, post: postAtualizado, ehAdmin: req.ehAdmin }, (err, html) => {
                            if (err) reject(err);
                            else resolve(html);
                        });
                    });
                }
                return res.json({
                    sucesso: true,
                    comentarioId: comentId,
                    totalComentarios: postAtualizado.comentarios_count,
                    html: htmlFragmento
                });
            }

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.comunidade_comentario_criado') };
            return res.redirect('/comunidade/' + id);
        } catch (err) {
            const msgErro = req.t(err.message.startsWith('flash.') ? err.message : 'flash.comunidade_comentario_tamanho');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade/' + id);
        }
    },

    async excluir(req, res) {
        const id = parseInt(req.params.id, 10);
        try {
            await Comunidade.excluirPost({ postId: id, userId: req.user.id, ehAdmin: req.ehAdmin });
            const msg = req.t('flash.comunidade_excluida');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ sucesso: true, mensagem: msg, redirect: '/comunidade' });
            }
            req.session.flash = { tipo: 'sucesso', mensagem: msg };
            return res.redirect('/comunidade');
        } catch (err) {
            const msgErro = req.t(err.message.startsWith('flash.') ? err.message : 'flash.comunidade_sem_permissao');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(403).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade/' + id);
        }
    },

    async excluirComentario(req, res) {
        const id = parseInt(req.params.id, 10);
        try {
            const { postId } = await Comunidade.excluirComentario({ comentarioId: id, userId: req.user.id, ehAdmin: req.ehAdmin });
            const msg = req.t('flash.comunidade_comentario_excluido');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ sucesso: true, mensagem: msg, comentarioId: id });
            }
            req.session.flash = { tipo: 'sucesso', mensagem: msg };
            return res.redirect('/comunidade/' + postId);
        } catch (err) {
            const msgErro = req.t(err.message.startsWith('flash.') ? err.message : 'flash.comunidade_sem_permissao');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(403).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade');
        }
    },

    // Handlers de Administrador
    async alterarEstado(req, res) {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;
        try {
            await Comunidade.alterarStatus({ postId: id, userId: req.user.id, novoStatus: status });
            const msg = req.t('flash.comunidade_status_atualizado');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ sucesso: true, mensagem: msg });
            }
            req.session.flash = { tipo: 'sucesso', mensagem: msg };
            return res.redirect('/comunidade/' + id);
        } catch (err) {
            const msgErro = err.message.startsWith('flash.') ? req.t(err.message) : req.t('flash.comunidade_sem_permissao');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade/' + id);
        }
    },

    async alterarCategoria(req, res) {
        const id = parseInt(req.params.id, 10);
        const { categoria } = req.body;
        try {
            await Comunidade.alterarCategoria({ postId: id, userId: req.user.id, novaCategoria: categoria });
            const msg = req.t('flash.comunidade_categoria_atualizada');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ sucesso: true, mensagem: msg });
            }
            req.session.flash = { tipo: 'sucesso', mensagem: msg };
            return res.redirect('/comunidade/' + id);
        } catch (err) {
            const msgErro = err.message.startsWith('flash.') ? req.t(err.message) : req.t('flash.comunidade_sem_permissao');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade/' + id);
        }
    },

    async ocultar(req, res) {
        const id = parseInt(req.params.id, 10);
        try {
            const oculto = await Comunidade.alternarOculto({ postId: id, userId: req.user.id });
            const msg = req.t('flash.comunidade_oculto_atualizado');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ sucesso: true, oculto, mensagem: msg });
            }
            req.session.flash = { tipo: 'sucesso', mensagem: msg };
            return res.redirect('/comunidade/' + id);
        } catch (err) {
            const msgErro = err.message.startsWith('flash.') ? req.t(err.message) : req.t('flash.comunidade_sem_permissao');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade/' + id);
        }
    },

    async excluirAdmin(req, res) {
        const id = parseInt(req.params.id, 10);
        try {
            await Comunidade.excluirPost({ postId: id, userId: req.user.id, ehAdmin: true });
            const msg = req.t('flash.comunidade_excluida');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.json({ sucesso: true, mensagem: msg, redirect: '/comunidade' });
            }
            req.session.flash = { tipo: 'sucesso', mensagem: msg };
            return res.redirect('/comunidade');
        } catch (err) {
            const msgErro = err.message.startsWith('flash.') ? req.t(err.message) : req.t('flash.comunidade_sem_permissao');
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ sucesso: false, erro: msgErro });
            }
            req.session.flash = { tipo: 'erro', mensagem: msgErro };
            return res.redirect('/comunidade');
        }
    }
};

module.exports = comunidadeController;

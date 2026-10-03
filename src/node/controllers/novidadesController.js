const Novidade = require('../models/Novidade');
const Comunidade = require('../models/Comunidade');
const { fmt } = require('../core/legal');

const texto = (v, max) => String(v || '').trim().slice(0, max);

// Dados do formulario do admin (titulo e texto nos tres idiomas).
function lerFormulario(body) {
    const postId = parseInt(body.post_id, 10);
    return {
        tipo: Novidade.TIPOS.includes(body.tipo) ? body.tipo : 'novidade',
        titulo_pt: texto(body.titulo_pt, 140), titulo_es: texto(body.titulo_es, 140), titulo_en: texto(body.titulo_en, 140),
        texto_pt: texto(body.texto_pt, 2000), texto_es: texto(body.texto_es, 2000), texto_en: texto(body.texto_en, 2000),
        post_id: postId > 0 ? postId : null
    };
}

const novidadesController = {
    // ---- Usuario ----
    async index(req, res) {
        const novidades = await Novidade.listarPublicadas(req.user.id, req.lang);
        // Quem abre a aba "viu": o selinho do menu some a partir daqui (a contagem desta pagina ainda mostra o que era novo).
        const desde = new Date(req.user.novidades_vistas_em || req.user.created_at || 0).getTime();
        novidades.forEach((n) => { n.nova = new Date(n.publicada_em).getTime() > desde; });
        await Novidade.marcarVistas(req.user.id);
        res.locals.novidadesNovas = 0;
        res.render('comunidade/novidades', { title: req.t('comunidade.titulo'), novidades, aba: 'novidades' });
    },

    async reagir(req, res) {
        const valor = req.body.valor === 'gostei' ? 1 : req.body.valor === 'nao_gostei' ? -1 : 0;
        const r = await Novidade.reagir(parseInt(req.params.id, 10), req.user.id, valor);
        if (!r) return res.status(404).json({ sucesso: false, erro: req.t('flash.comunidade_nao_encontrada') });
        res.json({ sucesso: true, ...r });
    },

    // ---- Admin ----
    async admin(req, res) {
        const novidades = await Novidade.listarAdmin();
        res.render('admin/novidades', { title: req.t('admin.titulo'), novidades, aba: 'novidades' });
    },

    async formulario(req, res) {
        const id = parseInt(req.params.id, 10);
        const novidade = id ? await Novidade.buscar(id) : null;
        if (id && !novidade) return res.redirect('/admin/novidades');
        const dados = req.session.novidadeRascunho || novidade || { tipo: 'novidade' };
        delete req.session.novidadeRascunho;
        res.render('admin/novidade_form', { title: req.t('admin.titulo'), novidade: dados, id: novidade ? novidade.id : 0, tipos: Novidade.TIPOS, aba: 'novidades', fmt });
    },

    async salvar(req, res) {
        const id = parseInt(req.params.id, 10) || 0;
        const dados = lerFormulario(req.body);
        const publicar = req.body.acao === 'publicar';
        if (!dados.titulo_pt && !dados.titulo_es && !dados.titulo_en) {
            req.session.novidadeRascunho = dados;
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.novidade_sem_titulo') };
            return res.redirect(id ? `/admin/novidades/${id}/editar` : '/admin/novidades/nova');
        }
        if (dados.post_id && !(await Comunidade.postAcessivel(dados.post_id, true))) dados.post_id = null;
        const novoId = await Novidade.salvar(id, dados);
        if (publicar) {
            const faltando = Novidade.idiomasFaltando(dados);
            if (faltando.length) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.novidade_idiomas', { idiomas: faltando.map((i) => i.toUpperCase()).join(', ') }) };
                return res.redirect(`/admin/novidades/${novoId}/editar`);
            }
            await Novidade.publicar(novoId);
            // Veio de uma sugestao da comunidade: ela passa a "resolvida".
            if (dados.post_id) await Comunidade.alterarStatus({ postId: dados.post_id, userId: req.user.id, novoStatus: 'resolvido' }).catch(() => {});
        } else {
            Novidade.invalidar();
        }
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(publicar ? 'flash.novidade_publicada' : 'flash.novidade_salva') };
        res.redirect('/admin/novidades');
    },

    async publicar(req, res) {
        const id = parseInt(req.params.id, 10);
        const n = await Novidade.buscar(id);
        if (!n) return res.redirect('/admin/novidades');
        const faltando = Novidade.idiomasFaltando(n);
        if (faltando.length) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.novidade_idiomas', { idiomas: faltando.map((i) => i.toUpperCase()).join(', ') }) };
            return res.redirect(`/admin/novidades/${id}/editar`);
        }
        await Novidade.publicar(id);
        if (n.post_id) await Comunidade.alterarStatus({ postId: n.post_id, userId: req.user.id, novoStatus: 'resolvido' }).catch(() => {});
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.novidade_publicada') };
        res.redirect('/admin/novidades');
    },

    async despublicar(req, res) {
        await Novidade.despublicar(parseInt(req.params.id, 10));
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.novidade_despublicada') };
        res.redirect('/admin/novidades');
    },

    async excluir(req, res) {
        await Novidade.excluir(parseInt(req.params.id, 10));
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.novidade_excluida') };
        res.redirect('/admin/novidades');
    }
};

module.exports = novidadesController;

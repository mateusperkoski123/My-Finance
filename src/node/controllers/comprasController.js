const Compra = require('../models/Compra');
const Conta = require('../models/Conta');
const Ia = require('../models/Ia');
const iaCore = require('../core/ia');
const iaController = require('./iaController');
const midia = require('../core/ia_midia');
const notaCore = require('../core/compras_nota');
const { validarImagem } = require('../core/uploads');
const { dataValida, parseMoeda, hojeLocal, toLocalYMD, normalizarMoeda } = require('../core/helpers');

const hoje = () => toLocalYMD(hojeLocal());
const inteiro = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const avisar = (req, tipo, mensagem) => { req.session.flash = { tipo, mensagem }; };
const querJson = (req) => Boolean(req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')));

async function listaDoUsuario(req, res) {
    const lista = await Compra.buscarLista(inteiro(req.params.id), req.user.id);
    if (!lista) res.status(404).render('404', { title: req.t('erro404.titulo') });
    return lista;
}

const comprasController = {
    // Todas as listas da cliente, com a estimativa de cada uma.
    index: async (req, res) => {
        const arquivadas = req.query.aba === 'arquivadas';
        const [listas, categorias, contas] = await Promise.all([
            Compra.listas(req.user.id, arquivadas),
            Compra.categoriasDespesa(req.user.id),
            Conta.buscarPorUsuario(req.user.id, false)
        ]);
        const acabando = arquivadas ? [] : await Compra.avisos(req.user.id, hoje());
        res.render('compras/index', { title: req.t('compras.titulo'), menuAtivo: 'compras', listas, categorias, contas, arquivadas, acabando });
    },

    criarLista: async (req, res) => {
        const nome = String(req.body.nome || '').trim();
        if (!nome) { avisar(req, 'erro', req.t('compras.erro_nome')); return res.redirect('/compras'); }
        try {
            const id = await Compra.criarLista(req.user.id, { nome, categoria_id: inteiro(req.body.categoria_id) || null, conta_id: inteiro(req.body.conta_id) || null });
            avisar(req, 'sucesso', req.t('compras.flash_lista_criada'));
            res.redirect(`/compras/${id}`);
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t('compras.erro_vinculo'));
            res.redirect('/compras');
        }
    },

    atualizarLista: async (req, res) => {
        const id = inteiro(req.params.id);
        const nome = String(req.body.nome || '').trim();
        if (!nome) { avisar(req, 'erro', req.t('compras.erro_nome')); return res.redirect(`/compras/${id}`); }
        try {
            const ok = await Compra.atualizarLista(id, req.user.id, { nome, categoria_id: inteiro(req.body.categoria_id) || null, conta_id: inteiro(req.body.conta_id) || null });
            avisar(req, ok ? 'sucesso' : 'erro', req.t(ok ? 'compras.flash_lista_salva' : 'compras.erro_lista'));
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t('compras.erro_vinculo'));
        }
        res.redirect(`/compras/${id}`);
    },

    arquivarLista: async (req, res) => {
        const restaurar = req.body.acao === 'restaurar';
        const ok = await Compra.definirStatusLista(inteiro(req.params.id), req.user.id, !restaurar);
        avisar(req, ok ? 'sucesso' : 'erro', req.t(!ok ? 'compras.erro_lista' : restaurar ? 'compras.flash_lista_restaurada' : 'compras.flash_lista_arquivada'));
        res.redirect(restaurar ? '/compras?aba=arquivadas' : '/compras');
    },

    // A lista em si: checklist, estimativa e atalho para fechar a compra.
    lista: async (req, res) => {
        const lista = await listaDoUsuario(req, res);
        if (!lista) return;
        const [itens, estimativa, categorias, contas, sugestoes, acabando] = await Promise.all([
            Compra.itens(lista.id, req.user.id),
            Compra.estimativa(lista.id, req.user.id),
            Compra.categoriasDespesa(req.user.id),
            Conta.buscarPorUsuario(req.user.id, false),
            Compra.sugestoes(req.user.id),
            Compra.avisos(req.user.id, hoje())
        ]);
        res.render('compras/lista', { title: lista.nome, menuAtivo: 'compras', lista, itens, estimativa, categorias, contas, sugestoes, acabando });
    },

    adicionarItem: async (req, res) => {
        const lista = await listaDoUsuario(req, res);
        if (!lista) return;
        // Varios itens de uma vez: um por linha ou separados por virgula/ponto e virgula.
        const nomes = String(req.body.nome || '').split(/[\n;,]+/).map((n) => n.trim()).filter(Boolean).slice(0, 50);
        for (const nome of nomes) await Compra.adicionarItem(req.user.id, lista.id, nome);
        res.redirect(`/compras/${lista.id}#novo-item`);
    },

    // Marcar/desmarcar um item. Responde JSON quando vem do JavaScript da tela (sem recarregar a pagina).
    marcarItem: async (req, res) => {
        const item = await Compra.buscarItem(inteiro(req.params.itemId), req.user.id);
        if (!item) return querJson(req) ? res.status(404).json({ ok: false }) : res.redirect('/compras');
        await Compra.marcarItem(item.id, req.user.id, req.body.marcado === '1');
        if (querJson(req)) return res.json({ ok: true, estimativa: await Compra.estimativa(item.lista_id, req.user.id) });
        res.redirect(`/compras/${item.lista_id}`);
    },

    marcarTodos: async (req, res) => {
        const lista = await listaDoUsuario(req, res);
        if (!lista) return;
        await Compra.marcarTodos(lista.id, req.user.id, req.body.marcado === '1');
        res.redirect(`/compras/${lista.id}`);
    },

    definirPreco: async (req, res) => {
        const item = await Compra.buscarItem(inteiro(req.params.itemId), req.user.id);
        if (!item) return querJson(req) ? res.status(404).json({ ok: false }) : res.redirect('/compras');
        await Compra.definirPreco(item.id, req.user.id, parseMoeda(req.body.preco));
        if (querJson(req)) return res.json({ ok: true, estimativa: await Compra.estimativa(item.lista_id, req.user.id) });
        res.redirect(`/compras/${item.lista_id}`);
    },

    excluirItem: async (req, res) => {
        const item = await Compra.buscarItem(inteiro(req.params.itemId), req.user.id);
        if (!item) return res.redirect('/compras');
        await Compra.excluirItem(item.id, req.user.id);
        res.redirect(`/compras/${item.lista_id}`);
    },

    // Tela de fechar a compra: total pago, categoria, conta e preco dos itens marcados.
    fecharPagina: async (req, res) => {
        const lista = await listaDoUsuario(req, res);
        if (!lista) return;
        const [itens, estimativa, categorias, contas] = await Promise.all([
            Compra.itens(lista.id, req.user.id),
            Compra.estimativa(lista.id, req.user.id),
            Compra.categoriasDespesa(req.user.id),
            Conta.buscarPorUsuario(req.user.id, false)
        ]);
        const padrao = lista.conta_id ? null : await Conta.buscarPadrao(req.user.id);
        const nota = await estadoLeituraNota(req);
        res.render('compras/fechar', {
            nota,
            title: req.t('compras.fechar_titulo'), menuAtivo: 'compras', lista, itens, estimativa, categorias, contas,
            contaSugerida: lista.conta_id || (padrao && padrao.id) || (contas[0] && contas[0].id) || 0, hoje: hoje()
        });
    },

    fechar: async (req, res) => {
        const lista = await listaDoUsuario(req, res);
        if (!lista) return;
        const voltar = `/compras/${lista.id}/fechar`;
        const total = parseMoeda(req.body.total);
        const contaId = inteiro(req.body.conta_id), categoriaId = inteiro(req.body.categoria_id);
        if (!(total > 0)) { avisar(req, 'erro', req.t('compras.erro_total')); return res.redirect(voltar); }
        if (!contaId || !categoriaId) { avisar(req, 'erro', req.t('compras.erro_conta_categoria')); return res.redirect(voltar); }
        const precos = {};
        // Campos preco_<id> (nao preco[<id>]: o parser de formularios transforma indices pequenos em lista e embaralha os ids).
        Object.entries(req.body).forEach(([campo, v]) => {
            const m = /^preco_(\d+)$/.exec(campo);
            const n = m ? parseMoeda(v) : 0;
            if (n > 0) precos[parseInt(m[1], 10)] = n;
        });
        // Itens que a leitura da nota reconheceu (comprou_<id>) e o que foi comprado fora da lista (extra_nome_<n> + extra_preco_<n>).
        const comprouIds = [];
        const extras = [];
        Object.entries(req.body).forEach(([campo, v]) => {
            const c = /^comprou_(\d+)$/.exec(campo);
            if (c && v === '1') comprouIds.push(parseInt(c[1], 10));
            const e = /^extra_nome_(\d+)$/.exec(campo);
            if (e && extras.length < 80) extras.push({ nome: String(v || ''), preco: parseMoeda(req.body['extra_preco_' + e[1]]) });
        });
        try {
            const r = await Compra.fechar(req.user.id, lista, {
                total, data: dataValida(req.body.data) ? req.body.data : hoje(), contaId, categoriaId, precos, comprouIds, extras,
                descartarRestantes: req.body.restantes === 'descartar'
            });
            avisar(req, 'sucesso', req.t('compras.flash_fechada', { itens: r.comprados }));
            res.redirect(`/compras/${lista.id}`);
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t('compras.erro_vinculo'));
            res.redirect(voltar);
        }
    }
,

    // "Agora nao" (esconde o aviso por um ciclo) ou "Nao preciso mais" (para de avisar deste produto).
    dispensarAviso: async (req, res) => {
        const modo = req.body.modo === 'nunca' ? 'nunca' : 'ciclo';
        await Compra.dispensarAviso(req.user.id, inteiro(req.params.produtoId), modo, hoje());
        const lista = inteiro(req.body.lista);
        res.redirect(lista ? `/compras/${lista}` : '/compras');
    },

    // Le a foto de uma nota ou recibo e devolve total, data e itens (JSON). Nada e gravado: a cliente confere e so ao salvar a compra os dados valem.
    lerNota: async (req, res) => {
        const erro = (status, mensagem, extra = {}) => res.status(status).json({ sucesso: false, erro: mensagem, ...extra });
        const userId = req.user.id;
        const lista = await Compra.buscarLista(inteiro(req.params.id), userId);
        if (!lista) return erro(404, req.t('compras.erro_lista'));
        if (!req.ehAdmin) {
            const cota = await iaController.cotaMidia(req);
            if (cota && !cota.liberada) return erro(403, req.t('ia.erro_plano_midia'), { cota_midia: cota });
            if (cota && cota.esgotada) return erro(429, iaController.textoCotaEsgotada(req, cota), { cota_midia: cota });
        }
        if (!req.file) return erro(400, req.t('compras.nota_erro_arquivo'));
        const v = validarImagem(req.file.buffer, req.file.mimetype, midia.MAX_BYTES_IMAGEM);
        if (!v.ok) return erro(400, req.t(v.motivo === 'flash.comunidade_imagem_grande' ? 'ia.erro_imagem_grande' : 'ia.erro_imagem'));
        if (!iaCore.obterCliente()) return erro(503, req.t('ia.erro_nao_configurada'));

        const itens = await Compra.itens(lista.id, userId);
        const moeda = normalizarMoeda(lista.conta_moeda || req.user.moeda);
        let r;
        try {
            r = await notaCore.lerNota({
                imagem: { mime: v.mime, base64: req.file.buffer.toString('base64'), tokens: midia.tokensImagem(req.file.buffer) },
                itensLista: itens, moeda, hoje: hoje()
            });
        } catch (err) {
            console.error('Compras: falha ao ler a nota:', err.status || '', err.message);
            const parcial = err.uso || {};
            if (parcial.chamadas > 0) {
                try { await iaController.registrarConsumo(userId, parcial, { imagens: 1, modelo: err.modelo }); } catch (e) { console.error('Compras: falha ao registrar consumo parcial:', e.message); }
            }
            const ocupada = err.status === 429 || err.status === 529 || err.status >= 500;
            return erro(502, req.t(ocupada ? 'ia.erro_ocupada' : 'ia.erro_generico'));
        }
        await iaController.registrarConsumo(userId, r.uso, { imagens: 1, modelo: r.modelo });
        // Foto que nao e nota nao gasta a cota de fotos da cliente.
        if (!r.nota.eNota) return erro(422, req.t('compras.nota_nao_e_nota'));
        if (!req.ehAdmin) await Ia.consumirMidia(userId, 0, 1);
        res.json({ sucesso: true, nota: r.nota, cota_midia: req.ehAdmin ? null : await iaController.cotaMidia(req) });
    }
};

// Estado do botao "Ler nota": ok | plano (o plano nao inclui) | esgotada (acabou a cota do mes) | indisponivel (IA nao configurada).
async function estadoLeituraNota(req) {
    const plano = (req.assinatura && req.assinatura.plano) || {};
    if (!iaCore.obterCliente()) return { estado: 'indisponivel' };
    if (!req.ehAdmin && !(req.user.ia_habilitada && plano.rec_ia)) return { estado: 'plano' };
    const cota = req.ehAdmin ? null : await iaController.cotaMidia(req);
    if (cota && !cota.liberada) return { estado: 'plano', cota };
    if (cota && cota.esgotada) return { estado: 'esgotada', cota };
    return { estado: 'ok', cota };
}

module.exports = comprasController;

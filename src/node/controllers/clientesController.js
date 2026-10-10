const Cliente = require('../models/Cliente');
const Conta = require('../models/Conta');
const regras = require('../core/clientes_regras');
const importacao = require('../core/clientes_import');
const { dataValida, parseMoeda, hojeLocal, toLocalYMD } = require('../core/helpers');
const { caminhoLocal } = require('../middleware/authMiddleware');

const POR_PAGINA = 30;
const ESTADOS = ['todas', 'pagas', 'pendentes', 'vencidas'];

const hoje = () => toLocalYMD(hojeLocal());
const inteiro = (v, padrao = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : padrao; };

// Volta para a pagina de origem (so enderecos do proprio modulo), senao para o padrao.
function voltarPara(req, padrao) {
    const v = caminhoLocal(req.body && req.body.voltar);
    return v && (v === '/clientes' || v.startsWith('/clientes/') || v.startsWith('/clientes?')) ? v : padrao;
}

function avisar(req, tipo, mensagem) {
    req.session.flash = { tipo, mensagem };
}

// Mes pedido (?mes=2026-10) ou o atual, com os links do mes anterior e do seguinte.
function periodoDoMes(pedido, hojeYmd) {
    // "todos": todos os meses juntos (usado para ver tudo o que esta vencido e nao foi pago).
    if (pedido === 'todos') return { mes: 'todos', ano: 0, numero: 0, inicio: '1900-01-01', fim: '2999-12-31', atual: hojeYmd.slice(0, 7) };
    const m = /^(\d{4})-(\d{2})$/.exec(String(pedido || ''));
    let ano = parseInt(hojeYmd.slice(0, 4), 10), mes = parseInt(hojeYmd.slice(5, 7), 10);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 2000 && +m[1] <= 2100) { ano = +m[1]; mes = +m[2]; }
    const chave = (a, n) => { const d = new Date(Date.UTC(a, n - 1, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
    return {
        mes: chave(ano, mes), ano, numero: mes,
        inicio: `${chave(ano, mes)}-01`, fim: `${chave(ano, mes)}-${String(regras.ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`,
        anterior: chave(ano, mes - 1), proximo: chave(ano, mes + 1), atual: hojeYmd.slice(0, 7)
    };
}

function paginar(total, pagina) {
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    return { pagina: Math.min(Math.max(1, pagina), paginas), paginas, total };
}

const clientesController = {
    // ---------- Painel de cobranzas ----------
    painel: async (req, res) => {
        const h = hoje();
        const userId = req.user.id;
        // Contratos sem prazo: garante as cuotas dos proximos meses (uma vez por dia por sessao; o agendador tambem faz).
        if (req.session.clientesRenovado !== h) {
            await Cliente.renovarContratos(userId);
            req.session.clientesRenovado = h;
        }
        const diaPedido = dataValida(req.query.dia) ? req.query.dia : null;
        const periodo = periodoDoMes(diaPedido ? diaPedido.slice(0, 7) : req.query.mes, h);
        const estado = ESTADOS.includes(req.query.estado) ? req.query.estado : 'todas';
        const servicoId = inteiro(req.query.servico);
        const q = String(req.query.q || '').trim().slice(0, 80);
        const filtro = { inicio: periodo.inicio, fim: periodo.fim, estado, servicoId, q, dia: diaPedido };
        const pedida = inteiro(req.query.pagina, 1);

        const [resumo, acumulado, totais, servicos, primeira] = await Promise.all([
            Cliente.resumoPeriodo(userId, periodo.inicio, periodo.fim, servicoId),
            Cliente.vencidoAcumulado(userId),
            Cliente.totaisClientes(userId),
            Cliente.listarServicos(userId),
            Cliente.cuotasDoPeriodo(userId, filtro, pedida, POR_PAGINA)
        ]);
        const pag = paginar(primeira.total, pedida);
        const lista = pag.pagina === pedida ? primeira : await Cliente.cuotasDoPeriodo(userId, filtro, pag.pagina, POR_PAGINA);

        const base = { mes: periodo.mes, estado: estado === 'todas' ? '' : estado, servico: servicoId || '', q, dia: diaPedido || '' };
        const link = (extra = {}) => {
            const p = new URLSearchParams();
            Object.entries({ ...base, ...extra }).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.set(k, v); });
            const s = p.toString();
            return '/clientes' + (s ? `?${s}` : '');
        };
        res.render('clientes/index', {
            title: req.t('clientes.titulo'), menuAtivo: 'clientes', aba: 'cobrancas',
            periodo, resumo, acumulado, totais, servicos, hoje: h,
            cuotas: lista.cuotas, filtro: { estado, servico: servicoId, q, dia: diaPedido },
            ...pag, link
        });
    },

    // Pagar com a data de hoje (ou a escolhida) e desfazer o pagamento.
    pagarCuota: async (req, res) => {
        const id = inteiro(req.params.id);
        const voltar = voltarPara(req, '/clientes');
        if (req.body.acao === 'desfazer') {
            const ok = await Cliente.desfazerPagamento(req.user.id, id);
            avisar(req, ok ? 'sucesso' : 'erro', req.t(ok ? 'clientes.flash_pago_desfeito' : 'clientes.erro_cuota'));
            return res.redirect(voltar);
        }
        const data = dataValida(req.body.data_pagamento) ? req.body.data_pagamento : hoje();
        const ok = await Cliente.pagarCuota(req.user.id, id, data);
        avisar(req, ok ? 'sucesso' : 'erro', req.t(ok ? 'clientes.flash_pago' : 'clientes.erro_cuota'));
        res.redirect(voltar);
    },

    // ---------- Clientes ----------
    lista: async (req, res) => {
        const status = ['ativo', 'inativo'].includes(req.query.status) ? req.query.status : 'ativo';
        const q = String(req.query.q || '').trim().slice(0, 80);
        const pedida = inteiro(req.query.pagina, 1);
        const r = await Cliente.listarClientes(req.user.id, { q, status }, pedida, POR_PAGINA);
        const pag = paginar(r.total, pedida);
        const lista = pag.pagina === pedida ? r : await Cliente.listarClientes(req.user.id, { q, status }, pag.pagina, POR_PAGINA);
        const totais = await Cliente.totaisClientes(req.user.id);
        res.render('clientes/lista', {
            title: req.t('clientes.aba_clientes'), menuAtivo: 'clientes', aba: 'clientes',
            clientes: lista.clientes, status, q, totais, ...pag
        });
    },

    criarCliente: async (req, res) => {
        const dados = Cliente.dadosCliente(req.body);
        if (!dados.nome) {
            avisar(req, 'erro', req.t('clientes.erro_nome'));
            return res.redirect(voltarPara(req, '/clientes/lista'));
        }
        const repetido = await Cliente.cedulaExistente(req.user.id, dados.cedula);
        const id = await Cliente.criarCliente(req.user.id, dados);
        avisar(req, 'sucesso', repetido
            ? req.t('clientes.flash_criado_cedula_repetida', { nome: repetido.nome })
            : req.t('clientes.flash_criado'));
        res.redirect(`/clientes/${id}`);
    },

    ficha: async (req, res) => {
        const id = inteiro(req.params.id);
        const cliente = await Cliente.buscarCliente(id, req.user.id);
        if (!cliente) return res.status(404).render('404', { title: req.t('erro404.titulo') });
        const [contratos, servicos, contas] = await Promise.all([
            Cliente.contratosDoCliente(req.user.id, id),
            Cliente.listarServicos(req.user.id),
            Conta.buscarPorUsuario(req.user.id, false)
        ]);
        res.render('clientes/ficha', {
            title: cliente.nome, menuAtivo: 'clientes', aba: 'clientes', cliente, contratos, servicos, contas, hoje: hoje()
        });
    },

    atualizarCliente: async (req, res) => {
        const id = inteiro(req.params.id);
        const dados = Cliente.dadosCliente(req.body);
        if (!dados.nome) {
            avisar(req, 'erro', req.t('clientes.erro_nome'));
            return res.redirect(`/clientes/${id}`);
        }
        const repetido = await Cliente.cedulaExistente(req.user.id, dados.cedula, id);
        const ok = await Cliente.atualizarCliente(req.user.id, id, dados);
        if (!ok) return res.status(404).render('404', { title: req.t('erro404.titulo') });
        avisar(req, 'sucesso', repetido
            ? req.t('clientes.flash_atualizado_cedula_repetida', { nome: repetido.nome })
            : req.t('clientes.flash_atualizado'));
        res.redirect(`/clientes/${id}`);
    },

    definirEstado: async (req, res) => {
        const id = inteiro(req.params.id);
        const inativar = req.body.estado === 'inativo';
        await Cliente.definirStatusCliente(req.user.id, id, inativar ? 'inativo' : 'ativo');
        avisar(req, 'sucesso', req.t(inativar ? 'clientes.flash_inativado' : 'clientes.flash_reativado'));
        res.redirect(`/clientes/${id}`);
    },

    excluirCliente: async (req, res) => {
        const id = inteiro(req.params.id);
        const r = await Cliente.excluirCliente(req.user.id, id);
        if (r.temPagas) {
            avisar(req, 'erro', req.t('clientes.erro_excluir_pagas'));
            return res.redirect(`/clientes/${id}`);
        }
        avisar(req, r.ok ? 'sucesso' : 'erro', req.t(r.ok ? 'clientes.flash_excluido' : 'clientes.erro_cliente'));
        res.redirect('/clientes/lista');
    },

    // ---------- Contratos ----------
    criarContrato: async (req, res) => {
        const clienteId = inteiro(req.params.id);
        const volta = `/clientes/${clienteId}`;
        const b = req.body;
        const v = regras.validarContrato({
            valor: b.valor, periodicidade: b.periodicidade, prazo: b.prazo, dia: b.dia, inicio: b.inicio || hoje()
        });
        if (!v.ok) {
            avisar(req, 'erro', req.t('clientes.erro_' + v.erro));
            return res.redirect(volta);
        }
        try {
            const r = await Cliente.criarContrato(req.user.id, {
                clienteId, servicoId: inteiro(b.servico_id), contaId: inteiro(b.conta_id), dados: v.dados
            });
            avisar(req, 'sucesso', req.t('clientes.flash_contrato_criado', { n: r.cuotas }));
        } catch (err) {
            if (err.codigo !== 'referencia_invalida') throw err;
            avisar(req, 'erro', req.t('clientes.erro_referencia'));
        }
        res.redirect(volta);
    },

    atualizarContrato: async (req, res) => {
        const id = inteiro(req.params.id);
        const k = await Cliente.buscarContrato(id, req.user.id);
        if (!k) return res.status(404).render('404', { title: req.t('erro404.titulo') });
        const volta = `/clientes/${k.cliente_id}`;
        const v = regras.validarContrato({ valor: req.body.valor, periodicidade: k.periodicidade, prazo: k.prazo_meses, dia: req.body.dia, inicio: '2000-01-01' });
        if (!v.ok) {
            avisar(req, 'erro', req.t('clientes.erro_' + v.erro));
            return res.redirect(volta);
        }
        const r = await Cliente.atualizarContrato(req.user.id, id, { valor: v.dados.valor, dia: v.dados.dia });
        avisar(req, r.ok ? 'sucesso' : 'erro', req.t(r.ok ? 'clientes.flash_contrato_atualizado' : 'clientes.erro_contrato', { n: r.atualizadas || 0 }));
        res.redirect(volta);
    },

    cancelarContrato: async (req, res) => {
        const id = inteiro(req.params.id);
        const k = await Cliente.buscarContrato(id, req.user.id);
        if (!k) return res.status(404).render('404', { title: req.t('erro404.titulo') });
        const r = await Cliente.cancelarContrato(req.user.id, id, req.body.motivo);
        avisar(req, r.ok ? 'sucesso' : 'erro', req.t(r.ok ? 'clientes.flash_contrato_cancelado' : 'clientes.erro_contrato', { n: r.removidas || 0 }));
        res.redirect(`/clientes/${k.cliente_id}`);
    },

    // ---------- Servicos ----------
    servicos: async (req, res) => {
        const arquivados = req.query.aba === 'arquivados';
        const servicos = await Cliente.listarServicos(req.user.id, { arquivados });
        res.render('clientes/servicos', {
            title: req.t('clientes.aba_servicos'), menuAtivo: 'clientes', aba: 'servicos', servicos, arquivados
        });
    },

    _dadosServico(req) {
        const nome = String(req.body.nome || '').trim().slice(0, 120);
        const valor = req.body.valor ? parseMoeda(req.body.valor) : 0;
        const dia = inteiro(req.body.dia);
        return { nome, valor: valor > 0 ? valor : 0, dia: dia >= 1 && dia <= 31 ? dia : null };
    },

    criarServico: async (req, res) => {
        const d = clientesController._dadosServico(req);
        if (!d.nome) { avisar(req, 'erro', req.t('clientes.erro_servico_nome')); return res.redirect('/clientes/servicos'); }
        const r = await Cliente.criarServico(req.user.id, d);
        avisar(req, r.duplicado ? 'erro' : 'sucesso', req.t(r.duplicado ? 'clientes.erro_servico_duplicado' : 'clientes.flash_servico_criado'));
        res.redirect('/clientes/servicos');
    },

    atualizarServico: async (req, res) => {
        const d = clientesController._dadosServico(req);
        if (!d.nome) { avisar(req, 'erro', req.t('clientes.erro_servico_nome')); return res.redirect('/clientes/servicos'); }
        const r = await Cliente.atualizarServico(req.user.id, inteiro(req.params.id), d);
        if (r.naoEncontrado) return res.status(404).render('404', { title: req.t('erro404.titulo') });
        avisar(req, r.duplicado ? 'erro' : 'sucesso', req.t(r.duplicado ? 'clientes.erro_servico_duplicado' : 'clientes.flash_servico_atualizado'));
        res.redirect('/clientes/servicos');
    },

    arquivarServico: async (req, res) => {
        const arquivar = req.body.acao !== 'restaurar';
        await Cliente.definirStatusServico(req.user.id, inteiro(req.params.id), arquivar ? 'arquivado' : 'ativo');
        avisar(req, 'sucesso', req.t(arquivar ? 'clientes.flash_servico_arquivado' : 'clientes.flash_servico_restaurado'));
        res.redirect('/clientes/servicos');
    },

    // ---------- Importacao ----------
    importarPagina: async (req, res) => {
        res.render('clientes/importar', { title: req.t('clientes.aba_importar'), menuAtivo: 'clientes', aba: 'importar' });
    },

    modelo: async (req, res) => {
        const formato = req.params.formato === 'csv' ? 'csv' : 'xlsx';
        const nome = `${req.t('clientes.imp.arquivo_modelo')}.${formato}`;
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
        if (formato === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            return res.send(importacao.modeloCsv(req.lang));
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(Buffer.from(await importacao.modeloXlsx(req.lang)));
    },

    importarEnviar: async (req, res) => {
        if (!req.file) {
            avisar(req, 'erro', req.t('clientes.imp.erro_sem_arquivo'));
            return res.redirect('/clientes/importar');
        }
        const lido = await importacao.lerArquivo(req.file.buffer, req.file.originalname);
        if (lido.erro) {
            avisar(req, 'erro', req.t('clientes.imp.erro_' + lido.erro, { max: 2000 }));
            return res.redirect('/clientes/importar');
        }
        const r = await importacao.validar(req.user.id, lido.linhas);
        // A planilha validada fica no banco (sao centenas de linhas); a sessao guarda so o numero.
        req.session.clientesImportId = await Cliente.guardarImportacao(req.user.id, String(req.file.originalname).slice(0, 120), {
            validas: r.validas, resumo: r.resumo, novosServicos: r.novosServicos,
            erros: r.erros.slice(0, importacao.MAX_ERROS_NA_TELA), duplicadas: r.duplicadas.slice(0, importacao.MAX_ERROS_NA_TELA)
        });
        // Grava a sessao antes de redirecionar: o navegador nao pode chegar na proxima tela sem enxerga-la.
        req.session.save(() => res.redirect('/clientes/importar/previa'));
    },

    importarPrevia: async (req, res) => {
        const imp = await Cliente.buscarImportacao(req.user.id, req.session.clientesImportId);
        if (!imp) return res.redirect('/clientes/importar');
        const contas = await Conta.buscarPorUsuario(req.user.id, false);
        res.render('clientes/importar_previa', {
            title: req.t('clientes.imp.previa_titulo'), menuAtivo: 'clientes', aba: 'importar', imp, contas
        });
    },

    importarConfirmar: async (req, res) => {
        const imp = await Cliente.buscarImportacao(req.user.id, req.session.clientesImportId);
        if (!imp) return res.redirect('/clientes/importar');
        if (!imp.validas.length) {
            avisar(req, 'erro', req.t('clientes.imp.erro_nada'));
            return res.redirect('/clientes/importar/previa');
        }
        try {
            const r = await importacao.aplicar(req.user.id, inteiro(req.body.conta_id), imp.validas);
            await Cliente.apagarImportacao(req.user.id);
            delete req.session.clientesImportId;
            avisar(req, 'sucesso', req.t('clientes.imp.flash_ok', { clientes: r.clientes, contratos: r.contratos, cuotas: r.cuotas }));
            res.redirect('/clientes');
        } catch (err) {
            if (err.codigo !== 'conta_invalida') throw err;
            avisar(req, 'erro', req.t('clientes.erro_conta'));
            res.redirect('/clientes/importar/previa');
        }
    },

    importarCancelar: async (req, res) => {
        await Cliente.apagarImportacao(req.user.id);
        delete req.session.clientesImportId;
        res.redirect('/clientes/importar');
    }
};

module.exports = clientesController;

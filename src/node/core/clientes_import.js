// Importacao de clientes por planilha (.xlsx ou .csv): modelo para baixar, leitura tolerante dos cabecalhos
// (portugues, espanhol ou ingles), validacao linha a linha e gravacao em uma unica transacao.
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { t } = require('./i18n');
const regras = require('./clientes_regras');
const Cliente = require('../models/Cliente');
const { parseMoeda, hojeLocal, toLocalYMD } = require('./helpers');

const MAX_LINHAS = 2000;
const MAX_ERROS_NA_TELA = 100;

// Colunas do modelo, na ordem. `k` = chave interna; `chaveI18n` = rotulo no idioma da conta.
const COLUNAS = [
    { k: 'nome', i18n: 'clientes.imp.col_nome', ex: ['María Gómez', 'Juan Pérez', 'Comercial Sol S.A.'], largura: 28 },
    { k: 'celular', i18n: 'clientes.imp.col_celular', ex: ['0981 123 456', '0971 654 321', ''], largura: 16 },
    { k: 'cedula', i18n: 'clientes.imp.col_cedula', ex: ['1.234.567', '2.345.678', ''], largura: 14 },
    { k: 'ruc', i18n: 'clientes.imp.col_ruc', ex: ['', '', '80012345-6'], largura: 14 },
    { k: 'email', i18n: 'clientes.imp.col_email', ex: ['maria@correo.com', '', 'contacto@sol.com.py'], largura: 26 },
    { k: 'observacoes', i18n: 'clientes.imp.col_obs', ex: ['', 'Paga por transferencia', ''], largura: 28 },
    { k: 'servico', i18n: 'clientes.imp.col_servicio', ex: ['Hosting', 'Hosting', 'Soporte'], largura: 18 },
    { k: 'valor', i18n: 'clientes.imp.col_valor', ex: [150000, 150000, 400000], largura: 16 },
    { k: 'prazo', i18n: 'clientes.imp.col_plazo', ex: [12, 6, ''], largura: 14 },
    { k: 'dia', i18n: 'clientes.imp.col_dia', ex: [10, 15, 5], largura: 14 },
    { k: 'inicio', i18n: 'clientes.imp.col_inicio', ex: ['2026-08-10', '2026-09-15', '2026-10-05'], largura: 16, data: true },
    { k: 'pagadas', i18n: 'clientes.imp.col_pagadas', ex: [2, 1, 0], largura: 14 },
    { k: 'periodicidade', i18n: 'clientes.imp.col_period', ex: ['', '', ''], largura: 14 },
    { k: 'estado', i18n: 'clientes.imp.col_estado', ex: ['', '', ''], largura: 12 }
];

// Nomes aceitos para cada coluna (ja sem acentos/pontuacao: ver regras.chave), nos tres idiomas.
const ALIAS = {
    nome: ['nombre', 'nome', 'name', 'cliente', 'nombrecompleto', 'razonsocial', 'nomecompleto'],
    celular: ['celular', 'telefono', 'telefone', 'phone', 'movil', 'whatsapp', 'tel', 'mobile'],
    cedula: ['cedula', 'ci', 'cedulaci', 'cedulaidentidad', 'documento', 'idnumber', 'cedulaidentidade'],
    ruc: ['ruc'],
    email: ['email', 'correo', 'correoelectronico', 'mail', 'emailcorreo'],
    observacoes: ['observaciones', 'observacoes', 'obs', 'notas', 'notes', 'comentarios'],
    servico: ['servicio', 'servico', 'service', 'plan'],
    valor: ['valordelacuota', 'valordacuota', 'valor', 'monto', 'importe', 'cuota', 'installmentamount', 'amount', 'value', 'montocuota'],
    prazo: ['plazomeses', 'prazomeses', 'plazo', 'prazo', 'termmonths', 'term', 'meses', 'months'],
    dia: ['diadevencimiento', 'diadevencimento', 'diavencimiento', 'dueday', 'dia', 'vencimiento', 'vencimento'],
    inicio: ['fechadeinicio', 'datadeinicio', 'fechainicio', 'datainicio', 'startdate', 'inicio', 'start'],
    pagadas: ['cuotaspagadas', 'cuotaspagas', 'parcelaspagas', 'paidinstallments', 'pagadas', 'pagas', 'paid'],
    periodicidade: ['periodicidad', 'periodicidade', 'periodicity', 'frecuencia', 'frequency'],
    estado: ['estado', 'situacao', 'situacion', 'status']
};
const ALIAS_INVERSO = {};
Object.entries(ALIAS).forEach(([k, lista]) => lista.forEach((a) => { ALIAS_INVERSO[a] = k; }));

// ---------- Modelo para baixar ----------
function cabecalhos(lang) {
    return COLUNAS.map((c) => t(c.i18n, {}, lang));
}

async function modeloXlsx(lang) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MyFinance';
    const ws = wb.addWorksheet(t('clientes.imp.hoja_clientes', {}, lang));
    ws.columns = COLUNAS.map((c, i) => ({ header: cabecalhos(lang)[i], key: c.k, width: c.largura }));
    for (let i = 0; i < 3; i++) {
        const linha = {};
        COLUNAS.forEach((c) => {
            const v = c.ex[i];
            linha[c.k] = c.data && v ? new Date(`${v}T00:00:00Z`) : (v === '' ? null : v);
        });
        ws.addRow(linha);
    }
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    COLUNAS.forEach((c, i) => { if (c.data) ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy'; });
    ws.getColumn(8).numFmt = '#,##0';

    const ins = wb.addWorksheet(t('clientes.imp.hoja_instrucciones', {}, lang));
    ins.getColumn(1).width = 26;
    ins.getColumn(2).width = 100;
    ins.addRow([t('clientes.imp.instr_titulo', {}, lang)]).font = { bold: true, size: 13 };
    ins.addRow([]);
    COLUNAS.forEach((c, i) => {
        const r = ins.addRow([cabecalhos(lang)[i], t('clientes.imp.ayuda_' + c.k, {}, lang)]);
        r.getCell(1).font = { bold: true };
        r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    });
    ins.addRow([]);
    [1, 2, 3, 4, 5].forEach((n) => ins.addRow(['', t('clientes.imp.nota_' + n, {}, lang)]).getCell(2).alignment = { wrapText: true });
    return wb.xlsx.writeBuffer();
}

function modeloCsv(lang) {
    const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const filas = [cabecalhos(lang)];
    for (let i = 0; i < 3; i++) filas.push(COLUNAS.map((c) => c.ex[i]));
    // BOM para o Excel abrir os acentos; ponto e virgula como separador (padrao do Excel em espanhol e portugues).
    return String.fromCharCode(0xFEFF) + filas.map((f) => f.map(esc).join(';')).join('\r\n') + '\r\n';
}

// ---------- Leitura ----------
function textoDaCelula(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('');
        if (v.result !== undefined) return textoDaCelula(v.result);
        if (v.text !== undefined) return String(v.text);
        if (v.error) return '';
    }
    return typeof v === 'string' ? v.trim() : v;
}

function paraLinhas(matriz) {
    // Cabecalho = primeira linha (nas 10 primeiras) em que alguma coluna e reconhecida como "nome".
    let h = -1;
    for (let i = 0; i < Math.min(matriz.length, 10); i++) {
        if (matriz[i].some((c) => ALIAS_INVERSO[regras.chave(c)] === 'nome')) { h = i; break; }
    }
    if (h < 0) return null;
    const mapa = {};
    matriz[h].forEach((c, idx) => {
        const k = ALIAS_INVERSO[regras.chave(c)];
        if (k && mapa[k] === undefined) mapa[k] = idx;
    });
    const linhas = [];
    for (let i = h + 1; i < matriz.length; i++) {
        const cru = matriz[i];
        const obj = {};
        let algum = false;
        Object.entries(mapa).forEach(([k, idx]) => {
            const v = cru[idx] === undefined ? '' : cru[idx];
            obj[k] = v;
            if (v !== '' && v !== null) algum = true;
        });
        if (algum) linhas.push({ linha: i + 1, ...obj });
    }
    return linhas;
}

function lerCsv(texto) {
    const limpo = texto.replace(/^﻿/, '');
    const primeira = limpo.split(/\r?\n/, 1)[0] || '';
    const cont = (ch) => primeira.split(ch).length - 1;
    const delim = cont(';') >= cont(',') && cont(';') >= cont('\t') ? ';' : (cont('\t') > cont(',') ? '\t' : ',');
    const matriz = [];
    let fila = [], campo = '', aspas = false;
    for (let i = 0; i < limpo.length; i++) {
        const ch = limpo[i];
        if (aspas) {
            if (ch === '"') { if (limpo[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch;
        } else if (ch === '"') aspas = true;
        else if (ch === delim) { fila.push(campo.trim()); campo = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && limpo[i + 1] === '\n') i++;
            fila.push(campo.trim()); campo = '';
            if (fila.some((c) => c !== '')) matriz.push(fila);
            else matriz.push([]);
            fila = [];
        } else campo += ch;
    }
    if (campo !== '' || fila.length) { fila.push(campo.trim()); matriz.push(fila); }
    return matriz;
}

// Retorna { linhas } ou { erro: 'formato' | 'sem_cabecalho' | 'vazio' | 'muitas' }.
async function lerArquivo(buffer, nome) {
    const ext = String(nome || '').toLowerCase().split('.').pop();
    let matriz;
    try {
        if (ext === 'csv' || ext === 'txt') {
            matriz = lerCsv(buffer.toString('utf8'));
        } else if (ext === 'xlsx') {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buffer);
            for (const ws of wb.worksheets) {
                const m = [];
                ws.eachRow({ includeEmpty: true }, (row, n) => {
                    const cel = [];
                    for (let c = 1; c <= Math.max(row.cellCount, COLUNAS.length); c++) cel.push(textoDaCelula(row.getCell(c).value));
                    m[n - 1] = cel;
                });
                for (let i = 0; i < m.length; i++) if (!m[i]) m[i] = [];
                if (paraLinhas(m)) { matriz = m; break; }
            }
            if (!matriz) return { erro: 'sem_cabecalho' };
        } else {
            return { erro: 'formato' };
        }
    } catch (e) {
        return { erro: 'formato' };
    }
    const linhas = paraLinhas(matriz);
    if (!linhas) return { erro: 'sem_cabecalho' };
    if (!linhas.length) return { erro: 'vazio' };
    if (linhas.length > MAX_LINHAS) return { erro: 'muitas' };
    return { linhas };
}

// ---------- Interpretacao dos valores ----------
const str = (v) => (v === null || v === undefined ? '' : (v instanceof Date ? '' : String(v).trim()));

function paraData(v) {
    if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    if (typeof v === 'number' && v > 20000 && v < 80000) return paraData(new Date(Date.UTC(1899, 11, 30) + v * 86400000));
    const s = str(v);
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s ? 'invalida' : '';
}

function numeroInteiro(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
    const s = str(v);
    if (!s) return null;
    const m = /^(\d+)\b/.exec(s);
    return m ? parseInt(m[1], 10) : NaN;
}

// ---------- Validacao ----------
// Retorna { validas, erros, duplicadas, avisos, resumo }.
async function validar(userId, linhas) {
    const hoje = toLocalYMD(hojeLocal());
    const cedulasUsadas = await Cliente.cedulasCadastradas(userId);
    const servicosExistentes = {};
    (await Cliente.listarServicos(userId)).concat(await Cliente.listarServicos(userId, { arquivados: true }))
        .forEach((s) => { servicosExistentes[regras.chave(s.nome)] = s; });

    const validas = [], erros = [], duplicadas = [], novosServicos = new Map();
    let cuotasTotal = 0, cuotasPagas = 0, cuotasVencidas = 0, contratos = 0, semPagadas = 0;

    for (const l of linhas) {
        const nome = str(l.nome);
        const falha = (codigo, extra = {}) => erros.push({ linha: l.linha, nome, codigo, ...extra });
        if (!nome) { falha('nome'); continue; }

        const cedula = str(l.cedula);
        const kc = regras.chave(cedula);
        if (kc && cedulasUsadas.has(kc)) { duplicadas.push({ linha: l.linha, nome, cedula }); continue; }

        const cliente = {
            nome, celular: str(l.celular), cedula, ruc: str(l.ruc), email: str(l.email), observacoes: str(l.observacoes),
            status: /^(inactiv|inativ|inactive)/i.test(str(l.estado)) ? 'inativo' : 'ativo'
        };
        let contrato = null;
        const nomeServico = str(l.servico);
        if (nomeServico) {
            const existente = servicosExistentes[regras.chave(nomeServico)];
            const valorLinha = typeof l.valor === 'number' ? l.valor : parseMoeda(str(l.valor));
            const valor = valorLinha > 0 ? valorLinha : (existente ? Number(existente.valor_padrao) : 0);
            const inicio = paraData(l.inicio) || hoje;
            if (inicio === 'invalida') { falha('inicio'); continue; }
            const diaLinha = numeroInteiro(l.dia);
            if (Number.isNaN(diaLinha)) { falha('dia'); continue; }
            const dia = diaLinha || (existente && existente.dia_vencimento) || parseInt(inicio.slice(8, 10), 10);
            const prazoTxt = str(l.prazo);
            const prazoNum = numeroInteiro(l.prazo);
            if (prazoTxt && Number.isNaN(prazoNum)) {
                if (!/^(sin|sem|indef|no|none|n\/a|-)/i.test(prazoTxt)) { falha('prazo'); continue; }
            }
            const periodicidade = /^(anual|annual|yearly|ano|año)/i.test(str(l.periodicidade)) ? 'anual' : 'mensal';
            const v = regras.validarContrato({ valor, periodicidade, prazo: Number.isNaN(prazoNum) ? '' : (prazoNum || ''), dia, inicio });
            if (!v.ok) { falha(v.erro); continue; }
            if (v.dados.prazoMeses === null && regras.somarMeses(inicio, 60) < hoje) { falha('inicio_antigo'); continue; }
            const primeiro = regras.primeiroVencimento(inicio, v.dados.dia);
            const lista = regras.cuotasAGerar({ primeiro, periodicidade, dia: v.dados.dia, total: v.dados.cuotasTotal, hoje });
            const pagadasTxt = str(l.pagadas);
            const pagadas = pagadasTxt ? numeroInteiro(l.pagadas) : 0;
            if (Number.isNaN(pagadas)) { falha('pagadas'); continue; }
            if (pagadas > lista.length) { falha('pagadas_excede', { max: lista.length }); continue; }
            const vencidas = lista.filter((c) => c.data < hoje).length;
            if (!pagadasTxt && vencidas > 0) semPagadas++;
            contratos++;
            cuotasTotal += lista.length;
            cuotasPagas += pagadas;
            cuotasVencidas += Math.max(0, vencidas - pagadas);
            if (!existente && !novosServicos.has(regras.chave(nomeServico))) {
                novosServicos.set(regras.chave(nomeServico), { nome: nomeServico.slice(0, 120), valor: v.dados.valor, dia: v.dados.dia });
            }
            contrato = { servico: nomeServico.slice(0, 120), dados: v.dados, pagadas, cuotas: lista.length };
        }
        if (kc) cedulasUsadas.add(kc);
        validas.push({ linha: l.linha, cliente, contrato });
    }
    return {
        validas, erros, duplicadas,
        novosServicos: Array.from(novosServicos.values()),
        resumo: {
            lidas: linhas.length, clientes: validas.length, contratos, cuotasTotal, cuotasPagas,
            cuotasVencidas, semPagadas, duplicadas: duplicadas.length, erros: erros.length
        }
    };
}

// ---------- Gravacao ----------
// Grava tudo em uma transacao: ou entra tudo, ou nada. Retorna os contadores.
async function aplicar(userId, contaId, validas) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[conta]] = await conn.query("SELECT id FROM contas WHERE id = ? AND user_id = ? AND status = 'ativa' LIMIT 1", [contaId, userId]);
        if (!conta) throw Object.assign(new Error('conta_invalida'), { codigo: 'conta_invalida' });
        const servicos = {};
        (await conn.query('SELECT id, nome FROM cliente_servicos WHERE user_id = ?', [userId]))[0]
            .forEach((s) => { servicos[regras.chave(s.nome)] = s.id; });
        const cedulas = await Cliente.cedulasCadastradas(userId);
        let clientes = 0, contratos = 0, cuotas = 0, puladas = 0;
        for (const v of validas) {
            const kc = regras.chave(v.cliente.cedula);
            if (kc && cedulas.has(kc)) { puladas++; continue; } // alguem cadastrou entre a previa e a confirmacao
            const clienteId = await Cliente.criarCliente(userId, v.cliente, conn);
            if (kc) cedulas.add(kc);
            clientes++;
            if (!v.contrato) continue;
            const ks = regras.chave(v.contrato.servico);
            if (!servicos[ks]) {
                const r = await Cliente.criarServico(userId, { nome: v.contrato.servico, valor: v.contrato.dados.valor, dia: v.contrato.dados.dia }, conn);
                if (r.duplicado) {
                    const ex = await Cliente.buscarServicoPorNome(userId, v.contrato.servico, conn);
                    servicos[ks] = ex.id;
                } else servicos[ks] = r.id;
            }
            const r = await Cliente.criarContrato(userId, {
                clienteId, servicoId: servicos[ks], contaId, dados: v.contrato.dados, pagas: v.contrato.pagadas
            }, conn);
            contratos++;
            cuotas += r.cuotas;
        }
        await conn.commit();
        return { clientes, contratos, cuotas, puladas };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { COLUNAS, MAX_ERROS_NA_TELA, modeloXlsx, modeloCsv, lerArquivo, lerCsv, validar, aplicar, paraData };

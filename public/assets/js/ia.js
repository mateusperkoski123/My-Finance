// Chat IA: conversa, historico por usuario e cartoes de confirmacao de lancamentos.
(function () {
  'use strict';
  var T = window.IA_T || {};
  var CFG = window.IA_CFG || { moeda: 'PYG' };
  var elMsgs = document.getElementById('ia-mensagens');
  var elLista = document.getElementById('ia-lista');
  var elForm = document.getElementById('ia-form');
  var elTexto = document.getElementById('ia-texto');
  var elBtn = document.getElementById('ia-enviar');
  var elContador = document.getElementById('ia-contador');
  if (!elMsgs || !elForm) return;

  var conversaId = null;
  var enviando = false;

  function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? m.getAttribute('content') : ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(url, corpo) {
    return fetch(url, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {})
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }

  // ---- Markdown minimo e seguro: tudo e escapado antes de virar HTML ----
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s;
  }
  function celulas(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  var reTab = /^\s*\|.*\|\s*$/;
  var reSep = /^\s*\|[\s:|-]+\|\s*$/;
  var reUl = /^\s*[-*]\s+/;
  var reOl = /^\s*\d+[.)]\s+/;
  var reH = /^(#{1,4})\s+(.*)$/;
  function especial(l) { return reTab.test(l) || reUl.test(l) || reOl.test(l) || reH.test(l); }
  function md(src) {
    var linhas = String(src || '').replace(/\r/g, '').split('\n');
    var out = [];
    var i = 0;
    while (i < linhas.length) {
      var l = linhas[i];
      if (reTab.test(l) && i + 1 < linhas.length && reSep.test(linhas[i + 1])) {
        var cab = celulas(l);
        i += 2;
        var h = '<div class="ia-tabela"><table><thead><tr>' + cab.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        while (i < linhas.length && reTab.test(linhas[i])) {
          h += '<tr>' + celulas(linhas[i]).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          i++;
        }
        out.push(h + '</tbody></table></div>');
        continue;
      }
      if (reUl.test(l) || reOl.test(l)) {
        var ord = reOl.test(l);
        var re = ord ? reOl : reUl;
        var itens = [];
        while (i < linhas.length && re.test(linhas[i])) { itens.push('<li>' + inline(linhas[i].replace(re, '')) + '</li>'); i++; }
        out.push('<' + (ord ? 'ol' : 'ul') + '>' + itens.join('') + '</' + (ord ? 'ol' : 'ul') + '>');
        continue;
      }
      var hm = l.match(reH);
      if (hm) { out.push('<h4>' + inline(hm[2]) + '</h4>'); i++; continue; }
      if (!l.trim()) { i++; continue; }
      var par = [];
      while (i < linhas.length && linhas[i].trim() && !especial(linhas[i])) { par.push(linhas[i]); i++; }
      out.push('<p>' + par.map(inline).join('<br>') + '</p>');
    }
    return out.join('');
  }

  function dinheiro(v) {
    var n = Number(v) || 0;
    var m = CFG.moeda;
    if (m === 'PYG') return 'Gs. ' + Math.round(n).toLocaleString('de-DE');
    if (m === 'BRL') return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dataBr(ymd) { var p = String(ymd || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }

  // ---- Plano do Nivel 2: um cartao com o panorama de tudo que vai mudar ----
  function linhaDePara(rotulo, de, para, fmt) {
    var f = fmt || function (x) { return x; };
    return '<li><span class="ia-plano__campo">' + esc(rotulo) + '</span> <span class="ia-de">' + esc(f(de)) + '</span> <i class="ph ph-arrow-right"></i> <strong>' + esc(f(para)) + '</strong></li>';
  }
  function opHtml(op) {
    var h = '';
    var t = T;
    if (op.op === 'lancamento') {
      var rec = op.tipo === 'receita';
      h = '<div class="ia-op__titulo">' + esc(rec ? t.opLancReceita : t.opLancDespesa) + ' <strong>' + (rec ? '+' : '-') + ' ' + esc(dinheiro(op.valor)) + '</strong></div>' +
        '<div class="ia-op__det">' + esc(op.descricao) + ' · ' + esc(op.conta_nome) + ' · ' + esc(op.categoria_nome) + ' · ' + esc(dataBr(op.data_competencia)) + ' · ' + esc(op.status === 'pago' ? t.pago : t.pendente) + '</div>';
    } else if (op.op === 'status') {
      h = '<div class="ia-op__titulo">' + esc(op.status === 'pago' ? t.opStatusPago : t.opStatusPendente) + ' (' + op.itens.length + ')' +
        (op.status === 'pago' && op.data_pagamento ? ' · ' + esc(dataBr(op.data_pagamento)) : '') + '</div><ul class="ia-op__itens">' +
        op.itens.map(function (i) { return '<li>' + esc(i.descricao) + ' <span class="muted">' + esc(i.conta_nome) + ' · ' + esc(dataBr(i.data)) + '</span> <strong>' + esc(dinheiro(i.valor)) + '</strong></li>'; }).join('') + '</ul>';
    } else if (op.op === 'editar') {
      var m = op.mudancas || {};
      h = '<div class="ia-op__titulo">' + esc(t.opEditar) + ': ' + esc(op.descricao_atual) + '</div><ul class="ia-op__itens">';
      if (m.descricao) h += linhaDePara(t.cDescricao, m.descricao.de, m.descricao.para);
      if (m.valor) h += linhaDePara(t.cValor, m.valor.de, m.valor.para, dinheiro);
      if (m.data) h += linhaDePara(t.cData, m.data.de, m.data.para, dataBr);
      if (m.categoria) h += linhaDePara(t.cCategoria, m.categoria.de, m.categoria.para);
      if (m.conta) h += linhaDePara(t.cConta, m.conta.de, m.conta.para);
      h += '</ul>';
      if (op.serie) h += '<div class="ia-op__escopo"><i class="ph ph-repeat"></i> ' + esc(op.escopo === 'toda_serie' ? t.escToda : (op.escopo === 'esta_e_proximas' ? t.escProximas : t.escApenas)) + '</div>';
    } else if (op.op === 'categoria_criar') {
      h = '<div class="ia-op__titulo">' + esc(op.pai_id ? t.opSubCriar : t.opCatCriar) + ': <strong>' + esc(op.nome) + '</strong>' +
        (op.pai_nome ? ' <span class="muted">' + esc(t.emPai.replace('__P__', op.pai_nome)) + '</span>' : '') + '</div>';
    } else if (op.op === 'categoria_renomear') {
      h = '<div class="ia-op__titulo">' + esc(op.eh_sub ? t.opSubRenomear : t.opCatRenomear) + ': <span class="ia-de">' + esc(op.de) + '</span> <i class="ph ph-arrow-right"></i> <strong>' + esc(op.para) + '</strong></div>';
    } else if (op.op === 'transferencia') {
      var rep = op.repeticao === 'fixa' ? ' · ' + t.repFixa : (op.repeticao === 'repetir' ? ' · ' + t.repRepetir.replace('__N__', op.quantidade) : '');
      h = '<div class="ia-op__titulo">' + esc(op.agendada ? t.opTransfAgendada : t.opTransf) + ' <strong>' + esc(dinheiro(op.valor)) + '</strong></div>' +
        '<div class="ia-op__det">' + esc(t.paraConta.replace('__A__', op.origem_nome).replace('__B__', op.destino_nome)) + ' · ' + esc(dataBr(op.data)) + esc(rep) + (op.descricao ? ' · ' + esc(op.descricao) : '') + '</div>';
    }
    return h;
  }
  function planoHtml(c) {
    var res = c.resultados;
    var falhou = res && res.some(function (r) { return !r.ok; });
    var itens = c.operacoes.map(function (op, i) {
      var r = res ? res[i] : null;
      var marca = r ? (r.ok ? '<i class="ph-fill ph-check-circle ia-ok"></i>' : '<i class="ph-fill ph-warning-circle ia-falha"></i>') : '<span class="ia-plano__n">' + (i + 1) + '</span>';
      return '<li class="ia-op' + (r && !r.ok ? ' is-falha' : '') + '">' + marca + '<div class="ia-op__corpo">' + opHtml(op) + (r && !r.ok ? '<div class="ia-op__erro">' + esc(r.erro) + '</div>' : '') + '</div></li>';
    }).join('');
    var rodape;
    if (c.status === 'pendente') {
      rodape = '<div class="ia-cartao__acoes"><button type="button" class="btn btn-outline btn-sm" data-acao="cancelar" data-id="' + c.id + '">' + esc(T.cancelar) + '</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-acao="confirmar" data-id="' + c.id + '"><i class="ph ph-check"></i> ' + esc(T.confirmarTudo) + '</button></div>';
    } else if (c.status === 'confirmada') {
      rodape = '<div class="ia-cartao__estado ' + (falhou ? 'ia-parcial' : 'ia-ok') + '"><i class="ph-fill ' + (falhou ? 'ph-warning' : 'ph-check-circle') + '"></i> ' + esc(falhou ? T.resParcial : T.resOk) + '</div>';
    } else {
      rodape = '<div class="ia-cartao__estado"><i class="ph ph-x-circle"></i> ' + esc(T.cancelado) + '</div>';
    }
    return '<div class="ia-cartao ia-plano" data-cartao="' + c.id + '"><div class="ia-cartao__topo"><span>' + esc(T.plano) + '</span><strong>' + c.operacoes.length + '</strong></div><ol class="ia-plano__lista">' + itens + '</ol>' + rodape + '</div>';
  }

  // ---- Cartao de confirmacao ----
  function cartaoHtml(c) {
    if (c.plano) return planoHtml(c);
    var receita = c.tipo === 'receita';
    var rodape;
    if (c.status === 'pendente') {
      rodape = '<div class="ia-cartao__acoes"><button type="button" class="btn btn-outline btn-sm" data-acao="cancelar" data-id="' + c.id + '">' + esc(T.cancelar) + '</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-acao="confirmar" data-id="' + c.id + '"><i class="ph ph-check"></i> ' + esc(T.confirmar) + '</button></div>';
    } else if (c.status === 'confirmada') {
      rodape = '<div class="ia-cartao__estado ia-ok"><i class="ph-fill ph-check-circle"></i> ' + esc(T.registrado) + '</div>';
    } else {
      rodape = '<div class="ia-cartao__estado"><i class="ph ph-x-circle"></i> ' + esc(T.cancelado) + '</div>';
    }
    return '<div class="ia-cartao ' + (receita ? 'is-receita' : 'is-despesa') + '" data-cartao="' + c.id + '">' +
      '<div class="ia-cartao__topo"><span>' + esc(receita ? T.receita : T.despesa) + '</span><strong>' + (receita ? '+' : '-') + ' ' + esc(dinheiro(c.valor)) + '</strong></div>' +
      '<div class="ia-cartao__desc">' + esc(c.descricao) + '</div>' +
      '<dl class="ia-cartao__det"><div><dt>' + esc(T.conta) + '</dt><dd>' + esc(c.conta) + '</dd></div>' +
      '<div><dt>' + esc(T.categoria) + '</dt><dd>' + esc(c.categoria) + '</dd></div>' +
      '<div><dt>' + esc(T.data) + '</dt><dd>' + esc(dataBr(c.data)) + ' · ' + esc(c.pago ? T.pago : T.pendente) + '</dd></div></dl>' + rodape + '</div>';
  }

  function rolarFim() { elMsgs.scrollTop = elMsgs.scrollHeight; }
  function limparBoasVindas() { var b = document.getElementById('ia-boasvindas'); if (b) b.remove(); }

  function addMsg(papel, texto, acoes) {
    limparBoasVindas();
    var d = document.createElement('div');
    d.className = 'ia-msg ia-msg--' + papel;
    var corpo = papel === 'user' ? '<p>' + esc(texto).replace(/\n/g, '<br>') + '</p>' : md(texto);
    d.innerHTML = '<div class="ia-bolha">' + corpo + '</div>' + (acoes || []).map(cartaoHtml).join('');
    elMsgs.appendChild(d);
    rolarFim();
    return d;
  }

  function addPensando() {
    limparBoasVindas();
    var d = document.createElement('div');
    d.className = 'ia-msg ia-msg--assistant';
    d.innerHTML = '<div class="ia-bolha ia-pensando"><span class="ia-pontos"><i></i><i></i><i></i></span> ' + esc(T.pensando) + '</div>';
    elMsgs.appendChild(d);
    rolarFim();
    return d;
  }

  function limparTela() {
    elMsgs.innerHTML = '';
    conversaId = null;
    marcarAtiva(null);
  }

  function marcarAtiva(id) {
    elLista.querySelectorAll('.ia-conversa').forEach(function (c) { c.classList.toggle('is-active', id != null && Number(c.getAttribute('data-id')) === Number(id)); });
  }

  function novoChat() {
    limparTela();
    elMsgs.innerHTML = document.getElementById('ia-boasvindas-modelo') ? document.getElementById('ia-boasvindas-modelo').innerHTML : '';
    if (!elMsgs.innerHTML) window.location.reload();
    elTexto.focus();
  }

  function abrirConversa(id) {
    fetch('/ia/conversas/' + id, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.sucesso) return;
        elMsgs.innerHTML = '';
        conversaId = d.conversa.id;
        marcarAtiva(conversaId);
        d.mensagens.forEach(function (m) { addMsg(m.papel, m.texto, m.acoes); });
        rolarFim();
      });
  }

  function adicionarNaLista(id, titulo) {
    var vazio = document.getElementById('ia-vazio'); if (vazio) vazio.remove();
    var d = document.createElement('div');
    d.className = 'ia-conversa';
    d.setAttribute('data-id', id);
    d.innerHTML = '<button type="button" class="ia-conversa__abrir" data-abrir="' + id + '">' + esc(titulo || T.novo) + '</button>' +
      '<button type="button" class="ia-conversa__excluir" data-excluir="' + id + '" aria-label="Excluir"><i class="ph ph-trash"></i></button>';
    elLista.insertBefore(d, elLista.firstChild);
  }

  function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || enviando) return;
    enviando = true;
    elBtn.disabled = true;
    addMsg('user', texto);
    elTexto.value = '';
    elContador.textContent = '0/600';
    var pensando = addPensando();

    api('/ia/mensagem', { texto: texto, conversa_id: conversaId }).then(function (d) {
      pensando.remove();
      if (d.conversa_id && !conversaId) {
        conversaId = d.conversa_id;
        adicionarNaLista(conversaId, d.titulo);
        marcarAtiva(conversaId);
      }
      if (d.sucesso) addMsg('assistant', d.mensagem.texto, d.mensagem.acoes);
      else addMsg('assistant', '⚠️ ' + (d.erro || T.erro));
    }).catch(function () {
      pensando.remove();
      addMsg('assistant', '⚠️ ' + T.erro);
    }).then(function () {
      enviando = false;
      elBtn.disabled = false;
      elTexto.focus();
    });
  }

  function tratarAcao(btn) {
    var id = btn.getAttribute('data-id');
    var acao = btn.getAttribute('data-acao');
    var cartao = btn.closest('.ia-cartao');
    cartao.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    api('/ia/acoes/' + id + '/' + (acao === 'confirmar' ? 'confirmar' : 'cancelar')).then(function (d) {
      var novo = d.cartao;
      if (novo) { var tmp = document.createElement('div'); tmp.innerHTML = cartaoHtml(novo); cartao.replaceWith(tmp.firstChild); }
      else { cartao.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); }
      if (!d.sucesso && d.erro) window.alert(d.erro);
    }).catch(function () { cartao.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); window.alert(T.erro); });
  }

  // ---- Eventos ----
  elForm.addEventListener('submit', function (e) { e.preventDefault(); enviar(elTexto.value); });
  elTexto.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(elTexto.value); }
  });
  elTexto.addEventListener('input', function () { elContador.textContent = elTexto.value.length + '/600'; });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-abrir],[data-excluir],[data-sugestao],[data-acao],#ia-novo');
    if (!el) return;
    if (el.id === 'ia-novo') { novoChat(); return; }
    if (el.hasAttribute('data-abrir')) { abrirConversa(el.getAttribute('data-abrir')); return; }
    if (el.hasAttribute('data-sugestao')) { enviar(el.getAttribute('data-sugestao')); return; }
    if (el.hasAttribute('data-acao')) { tratarAcao(el); return; }
    if (el.hasAttribute('data-excluir')) {
      if (!window.confirm(T.excluirConfirm)) return;
      var id = el.getAttribute('data-excluir');
      api('/ia/conversas/' + id + '/excluir').then(function (d) {
        if (!d.sucesso) return;
        var item = elLista.querySelector('.ia-conversa[data-id="' + id + '"]'); if (item) item.remove();
        if (Number(id) === Number(conversaId)) novoChat();
      });
    }
  });

  // Guarda o bloco de boas-vindas para o botao "Novo chat".
  var bv = document.getElementById('ia-boasvindas');
  if (bv) { var modelo = document.createElement('template'); modelo.id = 'ia-boasvindas-modelo'; modelo.innerHTML = bv.outerHTML; document.body.appendChild(modelo); }
})();

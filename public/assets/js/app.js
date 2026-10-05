// Textos traduzidos injetados pelo layout (window.GF_T); fallback vazio evita erro em paginas sem layout.
var GF_T = window.GF_T || {};
// Comportamentos globais e leves da interface.
document.addEventListener('DOMContentLoaded', function () {
  // A mensagem de retorno (sucesso/erro de uma ação) some sozinha depois de alguns segundos. Só ela (data-flash):
  // as faixas da conta (teste grátis, confirmar e-mail, somente leitura), os avisos do aplicativo (atualizar, instalar)
  // e os avisos fixos das telas continuam na página. O erro fica mais tempo, para dar tempo de ler.
  document.querySelectorAll('.alert[data-flash]').forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity .4s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    }, el.classList.contains('alert-erro') ? 10000 : 5000);
  });

  // Modais genéricos: qualquer botão com data-modal-open="id" abre o
  // <div id="id" data-modal>; data-modal-close ou clique no fundo fecha.
  // O clique no fundo só fecha se começou no fundo: arrastar para selecionar um texto e soltar fora
  // do formulário não pode fechar o modal e perder o que foi digitado.
  var inicioDoClique = null;
  document.addEventListener('mousedown', function (evento) { inicioDoClique = evento.target; }, true);
  document.addEventListener('touchstart', function (evento) { inicioDoClique = evento.target; }, { capture: true, passive: true });

  document.addEventListener('click', function (evento) {
    const abrir = evento.target.closest('[data-modal-open]');
    if (abrir) {
      const modal = document.getElementById(abrir.getAttribute('data-modal-open'));
      if (modal) {
        modal.classList.add('is-open');
        // No computador o cursor já entra no primeiro campo; no celular não (o teclado cobriria o formulário).
        if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          const campo = modal.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
          if (campo) setTimeout(function () { campo.focus(); }, 30);
        }
      }
      return;
    }

    const fechar = evento.target.closest('[data-modal-close]');
    if (fechar) {
      fechar.closest('.modal-backdrop, [data-modal]')?.classList.remove('is-open');
      return;
    }

    if (evento.target.matches('.modal-backdrop.is-open, [data-modal].is-open') && (!inicioDoClique || inicioDoClique === evento.target)) {
      evento.target.classList.remove('is-open');
    }
  });

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.is-open, [data-modal].is-open').forEach(function (modal) {
        modal.classList.remove('is-open');
      });
    }
  });

  // Selects dependentes Categoria -> Subcategoria (modais de lançamento do
  // Painel Inicial). window.gfCategoriasArvore é embutido uma única vez na
  // página (views/dashboard/index.php) com a árvore de categorias ativas.
  var gfBinders = [];
  window.gfBind = function (root) { gfBinders.forEach(function (b) { b(root || document); }); };
  var categoriasArvore = window.gfCategoriasArvore || [];
  function gfPopularSubcategorias(selectCategoria, selectSubcategoria, subcategoriaSelecionada) {
    var categoriaId = parseInt(selectCategoria.value, 10);
    var categoria = categoriasArvore.find(function (c) { return c.id === categoriaId; });
    var subcategorias = categoria ? categoria.subcategorias : [];

    var placeholder = selectSubcategoria.options[0];
    selectSubcategoria.innerHTML = '';
    selectSubcategoria.appendChild(placeholder);

    subcategorias.forEach(function (sub) {
      var opcao = document.createElement('option');
      opcao.value = sub.id;
      opcao.textContent = sub.nome;
      if (subcategoriaSelecionada && parseInt(subcategoriaSelecionada, 10) === sub.id) {
        opcao.selected = true;
      }
      selectSubcategoria.appendChild(opcao);
    });

    selectSubcategoria.disabled = subcategorias.length === 0;

    // Texto do campo e dica coerentes com o estado (evita "Selecione uma categoria" com categoria já escolhida).
    var temCategoria = !!categoria;
    placeholder.textContent = !temCategoria ? GF_T.sel_cat_primeiro
      : (subcategorias.length ? GF_T.sem_subcategoria : GF_T.categoria_sem_sub);
    var grupo = selectSubcategoria.parentElement;
    var dica = grupo.querySelector('.sub-dica');
    if (temCategoria && subcategorias.length === 0) {
      if (!dica) {
        dica = document.createElement('small');
        dica.className = 'sub-dica';
        dica.innerHTML = GF_T.dica_sub_html;
        grupo.appendChild(dica);
      }
    } else if (dica) {
      dica.remove();
    }
  }

  gfBinders.push(function (root) {
    root.querySelectorAll('[data-gf-categoria-select]').forEach(function (selectCategoria) {
      if (selectCategoria.getAttribute('data-gf-bound') === '1') return;
      selectCategoria.setAttribute('data-gf-bound', '1');
    var linha = selectCategoria.closest('.form-row') || selectCategoria.closest('.form');
    var selectSubcategoria = linha ? linha.querySelector('[data-gf-subcategoria-select]') : null;
    if (!selectSubcategoria) return;

    var subcategoriaAtual = selectCategoria.getAttribute('data-subcategoria-atual') || '';
    if (selectCategoria.value) {
      gfPopularSubcategorias(selectCategoria, selectSubcategoria, subcategoriaAtual);
    }

    selectCategoria.addEventListener('change', function () {
      gfPopularSubcategorias(selectCategoria, selectSubcategoria, null);
    });
    });
  });

  // Criar categoria/subcategoria sem sair do modal de lançamento (botão "+" ao lado de cada select).
  function gfCsrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? m.getAttribute('content') : ''; }
  function gfSelectsCategoria() { return document.querySelectorAll('[data-gf-categoria-select]'); }
  var GF_CORES = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];
  function gfCriarRapido(nome, paiId, cor) {
    var corpo = new URLSearchParams({ nome: nome });
    if (cor) corpo.set('cor', cor);
    if (paiId) corpo.set('categoria_pai_id', paiId);
    return fetch('/categorias/rapida', {
      method: 'POST',
      headers: { 'X-CSRF-Token': gfCsrf(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { if (!d.sucesso) throw new Error(d.erro || GF_T.cat_erro); return d.categoria; });
  }
  function gfAdicionarBotaoNovo(select, rotulo, aoCriar) {
    var grupo = select.parentElement;
    var label = grupo.querySelector('label');
    if (!label || label.querySelector('.cat-rapida-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-rapida-btn';
    btn.innerHTML = '<i class="ph-bold ph-plus"></i> ';
    btn.appendChild(document.createTextNode(rotulo));
    label.appendChild(btn);

    btn.addEventListener('click', function () {
      if (grupo.querySelector('.cat-rapida-form')) return;
      var form = document.createElement('div');
      form.className = 'cat-rapida-form';
      var input = document.createElement('input');
      input.type = 'text'; input.className = 'input'; input.maxLength = 100; input.placeholder = GF_T.cat_nome_ph;

      // Seletor de cor: paleta rapida + cor personalizada.
      var cor = GF_CORES[Math.floor(Math.random() * GF_CORES.length)];
      var cores = document.createElement('div');
      cores.className = 'cat-rapida-cores';
      var picker = document.createElement('input');
      picker.type = 'color'; picker.className = 'cat-rapida-picker'; picker.value = cor; picker.title = GF_T.cat_cor;
      function marcarCor(c) {
        cor = c; picker.value = c;
        cores.querySelectorAll('.cat-rapida-cor').forEach(function (b) { b.classList.toggle('is-active', b.dataset.cor.toLowerCase() === c.toLowerCase()); });
      }
      GF_CORES.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'cat-rapida-cor'; b.dataset.cor = c; b.style.background = c; b.setAttribute('aria-label', c);
        b.addEventListener('click', function () { marcarCor(c); });
        cores.appendChild(b);
      });
      picker.addEventListener('input', function () { marcarCor(picker.value); });
      cores.appendChild(picker);

      var acoes = document.createElement('div');
      acoes.className = 'cat-rapida-acoes';
      var ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'btn btn-primary btn-sm'; ok.textContent = GF_T.cat_salvar;
      var cancelar = document.createElement('button');
      cancelar.type = 'button'; cancelar.className = 'btn btn-outline btn-sm'; cancelar.textContent = GF_T.cat_cancelar;
      acoes.appendChild(cancelar); acoes.appendChild(ok);
      var erro = document.createElement('small');
      erro.className = 'cat-rapida-erro';
      form.appendChild(input); form.appendChild(cores); form.appendChild(acoes); form.appendChild(erro);
      grupo.appendChild(form);
      marcarCor(cor);
      input.focus();

      function fechar() { form.remove(); }
      function salvar() {
        var nome = input.value.trim();
        if (!nome) { input.focus(); return; }
        ok.disabled = true;
        aoCriar(nome, cor).then(fechar).catch(function (e) { erro.textContent = e.message || GF_T.cat_erro; ok.disabled = false; });
      }
      ok.addEventListener('click', salvar);
      cancelar.addEventListener('click', fechar);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); salvar(); }
        else if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); }
      });
    });
  }
  gfBinders.push(function (root) {
    root.querySelectorAll('[data-gf-categoria-select]').forEach(function (selectCategoria) {
      if (selectCategoria.getAttribute('data-gf-novo-bound') === '1') return;
      selectCategoria.setAttribute('data-gf-novo-bound', '1');
      var linha = selectCategoria.closest('.form-row') || selectCategoria.closest('.form');
      var selectSub = linha ? linha.querySelector('[data-gf-subcategoria-select]') : null;

      gfAdicionarBotaoNovo(selectCategoria, GF_T.cat_nova, function (nome, cor) {
        return gfCriarRapido(nome, null, cor).then(function (cat) {
          categoriasArvore.push({ id: cat.id, nome: cat.nome, parent_id: null, subcategorias: [] });
          gfSelectsCategoria().forEach(function (s) {
            var o = document.createElement('option'); o.value = cat.id; o.textContent = cat.nome; s.appendChild(o);
          });
          selectCategoria.value = cat.id;
          selectCategoria.dispatchEvent(new Event('change'));
        });
      });

      if (selectSub) {
        gfAdicionarBotaoNovo(selectSub, GF_T.sub_nova, function (nome, cor) {
          var paiId = parseInt(selectCategoria.value, 10);
          if (!paiId) return Promise.reject(new Error(GF_T.cat_escolha));
          return gfCriarRapido(nome, paiId, cor).then(function (sub) {
            var pai = categoriasArvore.find(function (c) { return c.id === paiId; });
            if (pai) pai.subcategorias.push({ id: sub.id, nome: sub.nome, parent_id: paiId });
            gfPopularSubcategorias(selectCategoria, selectSub, sub.id);
            selectSub.value = sub.id;
          });
        });
      }
    });
  });

  // Toggle "Repetir Transação": mostra/esconde o campo de quantidade.
  gfBinders.push(function (root) {
    root.querySelectorAll('[data-gf-toggle-repetir]').forEach(function (toggle) {
      if (toggle.getAttribute('data-gf-bound') === '1') return;
      toggle.setAttribute('data-gf-bound', '1');
    var form = toggle.closest('form');
    var alvo = form ? form.querySelector('[data-gf-repetir-alvo]') : null;
    if (!alvo) return;

    var atualizar = function () { alvo.hidden = !toggle.checked; };
    toggle.addEventListener('change', atualizar);
    atualizar();
    });
  });

  // "Fixa" e "Repetir" são excludentes: ligar um desliga o outro.
  gfBinders.push(function (root) {
    root.querySelectorAll('form').forEach(function (form) {
      var fixo = form.querySelector('input[name="e_fixo"]');
      var repetir = form.querySelector('input[name="repetir"]');
      if (!fixo || !repetir || form.getAttribute('data-gf-excl') === '1') return;
      form.setAttribute('data-gf-excl', '1');
      fixo.addEventListener('change', function () {
        if (fixo.checked && repetir.checked) { repetir.checked = false; repetir.dispatchEvent(new Event('change')); }
      });
      repetir.addEventListener('change', function () {
        if (repetir.checked && fixo.checked) { fixo.checked = false; }
      });
    });
  });

  // Toggle dinâmico de Status (Não Foi Recebida/Foi Recebida e Não Foi Pago/Foi Pago)
  gfBinders.push(function (root) {
    root.querySelectorAll('[data-gf-status-toggle]').forEach(function (toggle) {
      if (toggle.getAttribute('data-gf-bound') === '1') return;
      toggle.setAttribute('data-gf-bound', '1');
    var container = toggle.closest('.modal') || toggle.closest('form');
    if (!container) return;

    var ehReceita = toggle.getAttribute('data-tipo') === 'receita';
    var titleEl = container.querySelector('[data-status-title]');
    var iconBox = container.querySelector('[data-status-icon-box]');
    var iconEl = container.querySelector('[data-status-icon]');
    var dateLabelEl = container.querySelector('[data-status-date-label]');

    // O formulário tem uma data só: com o interruptor ligado ela é o dia do pagamento/recebimento;
    // desligado, é o dia do vencimento (o lançamento fica pendente até ser marcado como pago).
    var atualizarStatusUI = function () {
      var estaMarcado = toggle.checked; // ON = Foi Recebida / Foi Pago
      if (titleEl) {
        titleEl.textContent = estaMarcado ? (ehReceita ? GF_T.foi_recebida : GF_T.foi_pago) : (ehReceita ? GF_T.nao_foi_recebida : GF_T.nao_foi_pago);
      }
      if (dateLabelEl) {
        dateLabelEl.textContent = estaMarcado ? (ehReceita ? GF_T.data_recebimento : GF_T.data_pagamento) : GF_T.data_vencimento;
      }
      if (iconBox) iconBox.classList.toggle('is-pago', estaMarcado);
      if (iconEl) iconEl.className = estaMarcado ? 'ph ph-check-circle' : 'ph ph-clock';
    };

    toggle.addEventListener('change', atualizarStatusUI);
    atualizarStatusUI();
    });
  });

  // Demonstrativo Anual (Relatórios): expande/recolhe as linhas de
  // subcategoria de uma categoria ao clicar na linha de topo.
  document.addEventListener('click', function (evento) {
    var linha = evento.target.closest('[data-anual-toggle]');
    if (!linha) return;

    var chave = linha.getAttribute('data-anual-toggle');
    var expandido = linha.classList.toggle('is-expandido');
    document.querySelectorAll('[data-anual-pai="' + chave + '"]').forEach(function (sub) {
      sub.hidden = !expandido;
    });
  });

  // Formatação ao vivo dos campos de valor monetário (input[data-money]):
  // exibe com separador de milhar e símbolo da moeda atual enquanto o
  // usuário digita (ex.: "10000" -> "Gs. 10.000", "1500,5" -> "R$ 1.500,5").
  // window.gfMoeda é embutido em views/layout.ejs com a moeda do usuário
  // (símbolo, casas decimais e separadores). O servidor (parseMoeda, em
  // src/node/core/helpers.js) lê de volta qualquer valor formatado assim.
  // Formato de cada moeda (um campo de valor pode estar numa moeda diferente da tela, ex.: conta em dolar).
  var GF_CFG_MOEDAS = {
    PYG: { simbolo: 'Gs.', decimais: 0, milhar: '.', decimal: ',' },
    BRL: { simbolo: 'R$', decimais: 2, milhar: '.', decimal: ',' },
    USD: { simbolo: '$', decimais: 2, milhar: ',', decimal: '.' },
    EUR: { simbolo: '€', decimais: 2, milhar: '.', decimal: ',' },
    ARS: { simbolo: '$', decimais: 2, milhar: '.', decimal: ',' }
  };

  function gfCfgMoeda(cod) {
    if (cod && GF_CFG_MOEDAS[cod]) return GF_CFG_MOEDAS[cod];
    var rawCfg = window.gfMoeda || {};
    return {
      simbolo: rawCfg.simbolo !== undefined ? rawCfg.simbolo : '',
      decimais: rawCfg.decimais !== undefined ? rawCfg.decimais : (rawCfg.temCentavos === false ? 0 : 2),
      milhar: rawCfg.milhar || rawCfg.separadorMilhar || '.',
      decimal: rawCfg.decimal || rawCfg.separadorDecimal || ','
    };
  }

  // Moeda do campo (atributo data-moeda-cod); sem ele vale a da tela.
  function gfCfgDoCampo(input) { return gfCfgMoeda(input && input.getAttribute ? input.getAttribute('data-moeda-cod') : null); }

  function gfSoDigitos(texto) { return String(texto).replace(/[^0-9]/g, ''); }

  // Monta o texto do campo a partir da parte inteira (só dígitos) e da parte
  // decimal (só dígitos, ou null quando o usuário ainda não digitou o separador).
  function gfMontarValor(cfg, negativo, inteiros, decimais) {
    inteiros = inteiros.replace(/^0+(?=\d)/, '');
    if (cfg.decimais === 0) decimais = null;
    if (inteiros === '' && decimais === null) return '';
    if (inteiros === '') inteiros = '0';
    var texto = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.milhar);
    if (decimais !== null) texto += cfg.decimal + decimais.slice(0, cfg.decimais);
    return (negativo ? '-' : '') + cfg.simbolo + ' ' + texto;
  }

  // Formata um valor para exibir no campo.
  //  - número (ou texto no formato de número, "1500.5"): valor pronto, sai com todas as casas ("R$ 1.500,50");
  //  - texto no formato da moeda do usuário ("R$ 1.500,5"): o separador decimal da moeda divide, os de milhar são ignorados.
  function gfFormatarValorMoeda(bruto, cod) {
    var cfg = gfCfgMoeda(cod);
    if (bruto === null || bruto === undefined || bruto === '') return '';

    if (typeof bruto === 'string' && /^\s*-?\d+\.\d{1,2}\s*$/.test(bruto)) bruto = Number(bruto);
    if (typeof bruto === 'number') {
      if (!isFinite(bruto)) return '';
      var partes = Math.abs(bruto).toFixed(cfg.decimais).split('.');
      return gfMontarValor(cfg, bruto < 0, partes[0], partes.length > 1 ? partes[1] : null);
    }

    bruto = String(bruto);
    var negativo = bruto.indexOf('-') !== -1;
    var posDecimal = cfg.decimais > 0 ? bruto.lastIndexOf(cfg.decimal) : -1;
    if (posDecimal === -1) return gfMontarValor(cfg, negativo, gfSoDigitos(bruto), null);
    return gfMontarValor(cfg, negativo, gfSoDigitos(bruto.slice(0, posDecimal)), gfSoDigitos(bruto.slice(posDecimal + 1)));
  }

  window.gfFormatarValorMoeda = gfFormatarValorMoeda;

  // Troca a moeda de um campo de valor (ex.: ao escolher outra conta): reescreve o numero no formato da nova moeda.
  window.gfDefinirMoedaCampo = function (input, cod) {
    var R = window.AppRegras;
    var numero = R && input.value ? R.parseMoeda(input.value) : 0;
    if (cod) input.setAttribute('data-moeda-cod', cod); else input.removeAttribute('data-moeda-cod');
    var cfg = gfCfgMoeda(cod);
    input.placeholder = cfg.decimais === 0 ? '0' : '0' + cfg.decimal + '00';
    input.value = numero ? gfFormatarValorMoeda(numero, cod) : '';
    input._gfAntes = input.value;
  };

  // Cotacao para mostrar no campo: sem zeros sobrando, com os separadores da tela.
  window.gfFormatarCotacao = function (n) {
    if (!isFinite(n) || n <= 0) return '';
    var cfg = gfCfgMoeda();
    var partes = n.toFixed(n >= 100 ? 2 : 4).split('.');
    var dec = partes[1].replace(/0+$/, '');
    return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, cfg.milhar) + (dec ? cfg.decimal + dec : '');
  };

  // Valor colado de outro lugar ("1.500,50", "1,500.50", "1500.5"): o separador que aparece por último é o decimal;
  // um separador sozinho seguido de exatamente 3 dígitos é de milhar. Mesma leitura do servidor (parseMoeda).
  function gfLerValorColado(texto) {
    var s = String(texto).replace(/[^0-9.,-]/g, '');
    var temPonto = s.indexOf('.') !== -1, temVirgula = s.indexOf(',') !== -1;
    if (temPonto && temVirgula) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (temPonto || temVirgula) {
      var partes = s.split(temPonto ? '.' : ',');
      s = (partes.length > 2 || partes[partes.length - 1].length === 3) ? partes.join('') : partes.join('.');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // Quantos caracteres "que contam" (dígitos e o separador decimal da moeda) existem no texto.
  function gfContam(texto, cfg) {
    var n = 0;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if ((c >= '0' && c <= '9') || (cfg.decimais > 0 && c === cfg.decimal)) n++;
    }
    return n;
  }

  // Posição logo após o N-ésimo caractere "que conta" (dígito ou o separador decimal) - recoloca o cursor
  // no lugar certo depois de reformatar. Com N = 0 o cursor fica antes do primeiro dígito (depois do símbolo).
  function gfPosApos(texto, n, cfg) {
    var contados = 0;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      var conta = (c >= '0' && c <= '9') || (cfg.decimais > 0 && c === cfg.decimal);
      if (!conta) continue;
      if (n <= 0) return i;
      contados++;
      if (contados === n) return i + 1;
    }
    return texto.length;
  }

  // Reformata o campo depois de uma edição do usuário. Compara com o texto anterior para saber o que foi digitado:
  // vírgula ou ponto digitados viram o separador decimal da moeda (o teclado do celular nem sempre tem os dois).
  function gfAoEditarValor(input) {
    var cfg = gfCfgDoCampo(input);
    var codCampo = input.getAttribute('data-moeda-cod');
    var antes = input._gfAntes || '';
    var agora = input.value;
    var cursor = input.selectionStart == null ? agora.length : input.selectionStart;

    // Trecho inserido nesta edição: o que sobra entre o começo e o fim que não mudaram.
    var ini = 0;
    var limite = Math.min(antes.length, agora.length);
    while (ini < limite && antes[ini] === agora[ini]) ini++;
    var fim = 0;
    while (fim < limite - ini && antes[antes.length - 1 - fim] === agora[agora.length - 1 - fim]) fim++;
    var inserido = agora.slice(ini, agora.length - fim);

    var negativo = agora.indexOf('-') !== -1;
    var novo, contam;

    if (cfg.decimais > 0 && inserido.length === 1 && (inserido === ',' || inserido === '.')) {
      if (antes.indexOf(cfg.decimal) !== -1) {
        // Já existe separador decimal: o segundo é ignorado e o cursor fica onde estava.
        novo = antes;
        contam = gfContam(antes.slice(0, ini), cfg);
      } else {
        // Separador decimal digitado: o que está à esquerda é a parte inteira, à direita os centavos.
        var esquerda = gfSoDigitos(agora.slice(0, ini));
        novo = gfMontarValor(cfg, negativo, esquerda, gfSoDigitos(agora.slice(ini + 1)));
        contam = (esquerda.replace(/^0+(?=\d)/, '').length || 1) + 1;
      }
    } else if (inserido.length > 1 && /[.,]/.test(inserido)) {
      // Valor colado já formatado.
      var colado = gfLerValorColado(agora);
      novo = colado === null ? '' : gfFormatarValorMoeda(colado, codCampo);
      contam = novo.length;
    } else {
      // Dígitos digitados ou algo apagado.
      novo = gfFormatarValorMoeda(agora, codCampo);
      var antesDoCursor = agora.slice(0, cursor);
      contam = gfContam(antesDoCursor, cfg);
      // zeros à esquerda somem ao reformatar ("05" vira "5"): não contam para a posição
      var posDecimal = cfg.decimais > 0 ? agora.lastIndexOf(cfg.decimal) : -1;
      var inteirosBrutos = gfSoDigitos(posDecimal === -1 ? agora : agora.slice(0, posDecimal));
      var zeros = inteirosBrutos.length - inteirosBrutos.replace(/^0+(?=\d)/, '').length;
      if (zeros > 0) contam = Math.max(contam - Math.min(zeros, gfSoDigitos(antesDoCursor).length), 0);
    }

    input.value = novo;
    input._gfAntes = novo;
    var pos = gfPosApos(novo, contam, cfg);
    try { input.setSelectionRange(pos, pos); } catch (e) { /* ignora se o navegador nao suportar aqui */ }
    gfValidarValor(input);
  }

  // Campos que exigem valor maior que zero (data-money-positivo): o próprio navegador avisa no campo antes de enviar,
  // em vez de o servidor recusar depois e o formulário fechar.
  function gfValidarValor(input) {
    if (!input.hasAttribute('data-money-positivo')) return;
    var zerado = input.value !== '' && (gfSoDigitos(input.value).replace(/^0+/, '') === '' || input.value.indexOf('-') !== -1);
    input.setCustomValidity(zerado ? (GF_T.valor_invalido || 'Valor inválido') : '');
  }
  window.gfValidarValor = gfValidarValor;

  // Ao sair do campo, completa os centavos ("R$ 12,5" vira "R$ 12,50").
  function gfCompletarCentavos(input) {
    var cfg = gfCfgDoCampo(input);
    if (cfg.decimais === 0 || !input.value) return;
    var pos = input.value.lastIndexOf(cfg.decimal);
    if (pos === -1) return;
    var centavos = gfSoDigitos(input.value.slice(pos + 1));
    while (centavos.length < cfg.decimais) centavos += '0';
    input.value = gfMontarValor(cfg, input.value.indexOf('-') !== -1, gfSoDigitos(input.value.slice(0, pos)), centavos);
    input._gfAntes = input.value;
  }

  gfBinders.push(function (root) {
    root.querySelectorAll('[data-money]').forEach(function (input) {
      if (input.getAttribute('data-gf-bound') === '1') return;
      input.setAttribute('data-gf-bound', '1');
      var cfg = gfCfgDoCampo(input);
      // Teclado numérico no celular (o saldo inicial pode ser negativo, então fica com o teclado completo).
      if (!input.hasAttribute('inputmode') && input.name !== 'saldo_inicial') input.setAttribute('inputmode', cfg.decimais === 0 ? 'numeric' : 'decimal');
      input.setAttribute('autocomplete', 'off');
      input.placeholder = cfg.decimais === 0 ? '0' : '0' + cfg.decimal + '00';
      input.value = gfFormatarValorMoeda(input.value, input.getAttribute('data-moeda-cod')); // formata o valor inicial (ex.: modais de edição)
      input._gfAntes = input.value;
      // O valor pode ter sido trocado por código (modal de edição, limpar formulário): o ponto de partida é o que está no campo ao focar.
      input.addEventListener('focus', function () { input._gfAntes = input.value; gfValidarValor(input); });
      input.addEventListener('input', function () { gfAoEditarValor(input); });
      input.addEventListener('blur', function () { gfCompletarCentavos(input); gfValidarValor(input); });
    });
  });

  // Formularios com valor e conta: o campo de valor fala a moeda da conta escolhida (conta em dolar, em real...).
  gfBinders.push(function (root) {
    root.querySelectorAll('form').forEach(function (form) {
      var sel = form.querySelector('select[name="conta_id"]');
      var valor = form.querySelector('input[name="valor"][data-money]');
      if (!sel || !valor || sel.getAttribute('data-gf-moeda') === '1') return;
      sel.setAttribute('data-gf-moeda', '1');
      var aplicar = function () {
        var op = sel.options[sel.selectedIndex];
        var cod = op ? op.getAttribute('data-moeda') : null;
        if (cod && cod !== valor.getAttribute('data-moeda-cod')) window.gfDefinirMoedaCampo(valor, cod);
      };
      sel.addEventListener('change', aplicar);
      aplicar();
    });
  });

  window.gfBind(document);
});


/* ==========================================================================
   Interacoes globais v2: confirmacao, envio sem recarregar (data-ajax),
   protecao contra duplo clique e menu de acoes "⋮".
   ========================================================================== */
(function () {
  function toast(msg, tipo) {
    var el = document.createElement('div');
    el.className = 'gf-toast gf-toast--' + (tipo || 'sucesso');
    el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-visivel'); });
    // Erro fica mais tempo na tela: precisa ser lido.
    setTimeout(function () { el.classList.remove('is-visivel'); setTimeout(function () { el.remove(); }, 300); }, tipo === 'erro' ? 7500 : 4200);
  }
  window.gfToast = toast;

  function travar(form, sim) {
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function (b) {
      b.disabled = !!sim;
      b.classList.toggle('is-loading', !!sim);
    });
  }

  // Troca so o conteudo principal pelo da pagina recarregada em segundo plano.
  function atualizarConteudo(doc) {
    var novo = doc.querySelector('main.container'), atual = document.querySelector('main.container');
    if (!novo || !atual) return false;
    // A mensagem de retorno aparece como aviso flutuante (toast): nao fica tambem parada no topo da pagina.
    novo.querySelectorAll('.alert[data-flash]').forEach(function (el) { el.remove(); });
    var aberto = document.querySelector('.modal-backdrop.is-open');
    var y = window.scrollY;
    // Grupos (acordeoes por categoria etc.) mantem aberto/fechado como o usuario deixou.
    var grupos = {};
    atual.querySelectorAll('details[data-grupo]').forEach(function (d) { grupos[d.getAttribute('data-grupo')] = d.open; });
    atual.innerHTML = novo.innerHTML;
    atual.querySelectorAll('details[data-grupo]').forEach(function (d) {
      var k = d.getAttribute('data-grupo');
      if (Object.prototype.hasOwnProperty.call(grupos, k)) d.open = grupos[k];
    });
    // Reexecuta scripts inline do conteudo novo (graficos, filtros)
    atual.querySelectorAll('script').forEach(function (antigo) {
      var s = document.createElement('script');
      if (antigo.src) { return; }
      s.textContent = antigo.textContent;
      antigo.replaceWith(s);
    });
    if (window.gfBind) window.gfBind(atual);
    if (aberto && aberto.id) { var m = document.getElementById(aberto.id); if (m) m.classList.add('is-open'); }
    window.scrollTo(0, y);
    return true;
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || e.defaultPrevented) return;

    var pergunta = form.getAttribute('data-confirm');
    if (pergunta && !window.confirm(pergunta)) { e.preventDefault(); return; }

    if (form.hasAttribute('data-ajax') && window.fetch && window.DOMParser) {
      e.preventDefault();
      travar(form, true);
      fetch(form.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'fetch' }
      }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        if (r.redirected && /\/login/.test(r.url)) { window.location.href = r.url; return null; }
        return r.text();
      }).then(function (html) {
        if (html === null) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        // A mensagem de retorno desta acao (so ela: os outros avisos da pagina tambem usam a classe "alert").
        var flash = doc.querySelector('main .alert[data-flash]');
        var mensagem = flash ? flash.textContent.trim() : '';
        var recusado = !!flash && /alert-erro/.test(flash.className);
        var modalDoForm = form.closest('.modal-backdrop');
        if (recusado && modalDoForm) {
          // O servidor recusou (ex.: categoria invalida): o formulario continua aberto com o que foi digitado.
          travar(form, false);
          toast(mensagem, 'erro');
          return;
        }
        // Formulario dentro de um modal (editar/novo): fecha o modal para nao reabrir junto com o conteudo novo.
        if (modalDoForm) modalDoForm.classList.remove('is-open');
        var ok = atualizarConteudo(doc);
        if (!ok) { window.location.reload(); return; }
        if (mensagem) toast(mensagem, recusado ? 'erro' : 'sucesso');
      }).catch(function () {
        travar(form, false);
        toast(GF_T.erro_acao, 'erro');
      });
      return;
    }

    // Envio normal: evita duplo clique (pagamentos/lancamentos duplicados)
    setTimeout(function () { travar(form, true); }, 0);
  });

  window.addEventListener('pageshow', function () {
    document.querySelectorAll('form').forEach(function (f) { travar(f, false); });
  });

  // Menu de acoes "⋮": lista fixa (nao e cortada pelo overflow da tabela)
  function fecharMenus(exceto) {
    document.querySelectorAll('details.menu-acoes[open]').forEach(function (d) { if (d !== exceto) d.removeAttribute('open'); });
  }
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!(d instanceof HTMLElement) || !d.matches('details.menu-acoes') || !d.open) return;
    fecharMenus(d);
    var lista = d.querySelector('.menu-acoes__lista'), r = d.getBoundingClientRect();
    lista.style.visibility = 'hidden';
    requestAnimationFrame(function () {
      var w = lista.offsetWidth, h = lista.offsetHeight;
      var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
      var top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
      lista.style.left = left + 'px'; lista.style.top = top + 'px'; lista.style.visibility = '';
    });
  }, true);
  document.addEventListener('click', function (e) {
    var dentro = e.target.closest('details.menu-acoes');
    if (!dentro) fecharMenus(null);
    else if (e.target.closest('.menu-acoes__lista button')) dentro.removeAttribute('open');
  });
  window.addEventListener('scroll', function () { fecharMenus(null); }, { passive: true });
})();

// Atalhos do app instalado (?action=despesa|receita): abre o formulario correspondente no painel.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var acao = new URLSearchParams(location.search).get('action');
    var alvo = { despesa: 'modal-novo-despesa', receita: 'modal-novo-receita' }[acao];
    var modal = alvo && document.getElementById(alvo);
    if (modal) modal.classList.add('is-open');
  });
})();

// Editar lancamento: o mesmo formulario do cadastro (um modal por tipo), preenchido a partir do botao [data-editar-lanc].
// Transacao avulsa pode virar fixa ou repetida (parcelas); transacao de uma serie escolhe quais ocorrencias alterar.
(function () {
  function disparar(el, nome) { el.dispatchEvent(new Event(nome, { bubbles: true })); }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-editar-lanc]');
    if (!btn) return;
    var d;
    try { d = JSON.parse(btn.getAttribute('data-editar-lanc')); } catch (e) { return; }
    var modal = document.getElementById('modal-editar-' + d.tipo);
    var form = modal && modal.querySelector('[data-editar-form]');
    if (!form) return;

    var menu = btn.closest('details');
    if (menu) menu.removeAttribute('open');

    form.action = '/lancamentos/' + d.id + '/atualizar';
    form.elements.descricao.value = d.descricao || '';
    var valor = form.elements.valor;
    var selConta = form.elements.conta_id;
    selConta.value = d.conta_id;
    disparar(selConta, 'change'); // o campo de valor passa para a moeda da conta
    var opConta = selConta.options[selConta.selectedIndex];
    var codConta = opConta ? opConta.getAttribute('data-moeda') : null;
    valor.value = window.gfFormatarValorMoeda ? window.gfFormatarValorMoeda(Number(d.valor) || 0, codConta) : String(d.valor);
    valor._gfAntes = valor.value;
    valor.setCustomValidity('');

    // Categoria/subcategoria: o lancamento guarda so um id (da subcategoria quando existe); acha o pai na arvore.
    var arvore = window.gfCategoriasArvore || [];
    var catId = '', subId = '';
    arvore.forEach(function (c) {
      if (c.id === d.categoria_id) catId = c.id;
      (c.subcategorias || []).forEach(function (s) { if (s.id === d.categoria_id) { catId = c.id; subId = s.id; } });
    });
    var selCat = form.elements.categoria_id, selSub = form.elements.subcategoria_id;
    selCat.value = catId;
    disparar(selCat, 'change');
    if (subId) selSub.value = subId;

    form.elements.conta_id.value = d.conta_id;
    form.elements.data_competencia.value = d.data_competencia || '';

    var status = form.elements.status;
    status.checked = d.status === 'pago';
    disparar(status, 'change');

    // Fixa/Repetir: so para transacao avulsa; em serie aparece a escolha do escopo.
    var fixo = form.elements.e_fixo, repetir = form.elements.repetir;
    fixo.checked = false;
    repetir.checked = false;
    disparar(repetir, 'change');
    form.elements.quantidade_repeticoes.value = 12;
    if (form.elements.periodicidade) form.elements.periodicidade.value = 'mensal';
    var novo = form.querySelector('[data-ed-novo-serie]'), serie = form.querySelector('[data-ed-serie]');
    novo.hidden = !!d.serie;
    serie.hidden = !d.serie;
    var apenas = form.querySelector('input[name="escopo_serie"][value="apenas_esta"]');
    if (apenas) apenas.checked = true;

    modal.classList.add('is-open');
  });
})();

// Editar transferencia entre contas: valor, data e situacao (as duas pernas juntas), a partir do botao [data-editar-transf].
(function () {
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-editar-transf]');
    if (!btn) return;
    var d;
    try { d = JSON.parse(btn.getAttribute('data-editar-transf')); } catch (e) { return; }
    var modal = document.getElementById('modal-editar-transferencia');
    var form = modal && modal.querySelector('[data-editar-form]');
    if (!form) return;
    var menu = btn.closest('details');
    if (menu) menu.removeAttribute('open');

    form.action = '/lancamentos/' + d.id + '/atualizar-transferencia';
    modal.querySelector('[data-transf-descricao]').textContent = d.descricao || '';
    // Moedas diferentes: a perna negativa e a que sai; o formulario mostra o valor que sai e o que entra.
    var cruzada = !!(d.par_moeda && d.moeda && d.par_moeda !== d.moeda);
    var saiu = Number(d.valor_assinado) < 0;
    var simb = { PYG: 'Gs.', BRL: 'R$', USD: 'US$', EUR: '€', ARS: 'AR$' };
    var valSaida = cruzada && !saiu ? Math.abs(Number(d.par_valor)) : Number(d.valor);
    var valEntrada = cruzada ? (saiu ? Math.abs(Number(d.par_valor)) : Number(d.valor)) : 0;
    var moedaSaida = cruzada ? (saiu ? d.moeda : d.par_moeda) : (d.moeda || null);
    var moedaEntrada = cruzada ? (saiu ? d.par_moeda : d.moeda) : null;
    var campoValor = form.elements.valor, campoEntrada = form.elements.valor_entrada;
    var grupoEntrada = form.querySelector('[data-transf-entrada]');
    if (moedaSaida) campoValor.setAttribute('data-moeda-cod', moedaSaida); else campoValor.removeAttribute('data-moeda-cod');
    campoValor.value = window.gfFormatarValorMoeda ? window.gfFormatarValorMoeda(valSaida || 0, moedaSaida) : String(valSaida);
    campoValor._gfAntes = campoValor.value;
    campoValor.setCustomValidity('');
    var rotuloValor = form.querySelector('[data-transf-valor-rotulo]');
    if (rotuloValor) rotuloValor.textContent = cruzada ? rotuloValor.getAttribute('data-t-sai').replace('{moeda}', simb[moedaSaida] || moedaSaida) : rotuloValor.getAttribute('data-t-valor');
    if (grupoEntrada && campoEntrada) {
      grupoEntrada.hidden = !cruzada;
      campoEntrada.required = cruzada;
      if (cruzada) {
        campoEntrada.setAttribute('data-moeda-cod', moedaEntrada);
        campoEntrada.value = window.gfFormatarValorMoeda(valEntrada || 0, moedaEntrada);
        campoEntrada._gfAntes = campoEntrada.value;
        grupoEntrada.querySelector('label').textContent = grupoEntrada.getAttribute('data-t-entra').replace('{moeda}', simb[moedaEntrada] || moedaEntrada);
      } else {
        campoEntrada.value = '';
      }
    }
    form.elements.data_competencia.value = d.data_competencia || '';
    var status = form.elements.status;
    status.checked = d.status === 'pago';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    var serie = form.querySelector('[data-ed-serie]');
    serie.hidden = !d.serie;
    var apenas = form.querySelector('input[name="escopo_serie"][value="apenas_esta"]');
    if (apenas) apenas.checked = true;
    modal.classList.add('is-open');
  });
})();

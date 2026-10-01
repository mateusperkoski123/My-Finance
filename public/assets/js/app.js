// Textos traduzidos injetados pelo layout (window.GF_T); fallback vazio evita erro em paginas sem layout.
var GF_T = window.GF_T || {};
// Comportamentos globais e leves da interface.
document.addEventListener('DOMContentLoaded', function () {
  // Some sozinho os alertas de sucesso/erro depois de alguns segundos.
  document.querySelectorAll('.alert').forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity .4s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    }, 4000);
  });

  // Modais genéricos: qualquer botão com data-modal-open="id" abre o
  // <div id="id" data-modal>; data-modal-close ou clique no fundo fecha.
  document.addEventListener('click', function (evento) {
    const abrir = evento.target.closest('[data-modal-open]');
    if (abrir) {
      const modal = document.getElementById(abrir.getAttribute('data-modal-open'));
      if (modal) modal.classList.add('is-open');
      return;
    }

    const fechar = evento.target.closest('[data-modal-close]');
    if (fechar) {
      fechar.closest('.modal-backdrop, [data-modal]')?.classList.remove('is-open');
      return;
    }

    if (evento.target.matches('.modal-backdrop.is-open, [data-modal].is-open')) {
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

    var atualizarStatusUI = function () {
      var estaMarcado = toggle.checked; // ON = Foi Recebida / Foi Pago
      if (estaMarcado) {
        if (titleEl) titleEl.textContent = ehReceita ? GF_T.foi_recebida : GF_T.foi_pago;
        if (dateLabelEl) dateLabelEl.textContent = ehReceita ? GF_T.data_recebimento : GF_T.data_pagamento;
        if (iconBox) iconBox.style.background = 'var(--green-bg)';
        if (iconEl) {
          iconEl.className = 'ph ph-trend-up';
          iconEl.style.color = 'var(--green)';
        }
      } else {
        if (titleEl) titleEl.textContent = ehReceita ? GF_T.nao_foi_recebida : GF_T.nao_foi_pago;
        if (dateLabelEl) dateLabelEl.textContent = GF_T.data_vencimento;
        if (iconBox) iconBox.style.background = 'var(--red-bg)';
        if (iconEl) {
          iconEl.className = 'ph ph-trend-down';
          iconEl.style.color = 'var(--red)';
        }
      }
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
  // usuário digita (ex.: "10000" -> "₲ 10.000"). window.gfMoeda é embutido
  // uma vez em views/layout.php com a config da moeda do usuário logado
  // (símbolo/casas decimais/separadores - ver App\Core\Money::configParaJs).
  // O servidor (App\Core\Money::paraFloat) sabe interpretar de volta
  // qualquer valor formatado assim, então nenhuma mudança é necessária no
  // "name"/submissão do campo.
  function gfFormatarValorMoeda(bruto) {
    var rawCfg = window.gfMoeda || {};
    var cfg = {
      simbolo: rawCfg.simbolo !== undefined ? rawCfg.simbolo : '',
      decimais: rawCfg.decimais !== undefined ? rawCfg.decimais : (rawCfg.temCentavos === false ? 0 : 2),
      milhar: rawCfg.milhar || rawCfg.separadorMilhar || '.',
      decimal: rawCfg.decimal || rawCfg.separadorDecimal || ','
    };
    if (bruto === null || bruto === undefined || bruto === '') return '';

    if (typeof bruto === 'number') {
      bruto = bruto.toFixed(cfg.decimais);
    }
    bruto = String(bruto);

    var negativo = /^\s*-/.test(bruto);

    if (cfg.decimais === 0) {
      var digitos = bruto.replace(/[^0-9]/g, '');
      if (digitos === '') return '';
      digitos = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.milhar);
      return (negativo ? '-' : '') + cfg.simbolo + ' ' + digitos;
    }

    var limpo = bruto.split('').filter(function (c) {
      return (c >= '0' && c <= '9') || c === cfg.decimal || c === '.';
    }).join('');

    if (cfg.decimal !== '.' && limpo.indexOf('.') !== -1 && limpo.indexOf(cfg.decimal) === -1) {
      limpo = limpo.replace('.', cfg.decimal);
    }

    var ultima = limpo.lastIndexOf(cfg.decimal);

    var parteInteira, parteDecimal;
    if (ultima === -1) {
      parteInteira = limpo;
      parteDecimal = null;
    } else {
      parteInteira = limpo.slice(0, ultima).split(cfg.decimal).join('');
      parteDecimal = limpo.slice(ultima + cfg.decimal.length).slice(0, cfg.decimais);
    }

    if (parteInteira === '' && parteDecimal === null) return '';
    parteInteira = parteInteira.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.milhar);
    var resultado = parteInteira || '0';
    if (parteDecimal !== null) resultado += cfg.decimal + parteDecimal;
    return (negativo ? '-' : '') + cfg.simbolo + ' ' + resultado;
  }

  window.gfFormatarValorMoeda = gfFormatarValorMoeda;

  function gfContarDigitos(texto) {
    return (texto.match(/[0-9]/g) || []).length;
  }

  // Acha a posição (índice) logo após o N-ésimo dígito de um texto - usado
  // pra recolocar o cursor no lugar certo depois de reformatar o valor.
  function gfPosApos(texto, nDigitos) {
    if (nDigitos <= 0) return 0;
    var contados = 0;
    for (var i = 0; i < texto.length; i++) {
      if (texto[i] >= '0' && texto[i] <= '9') {
        contados++;
        if (contados === nDigitos) return i + 1;
      }
    }
    return texto.length;
  }

  function gfAplicarFormatacaoMoeda(input) {
    var cursorAntes = input.selectionStart == null ? input.value.length : input.selectionStart;
    var digitosAntesCursor = gfContarDigitos(input.value.slice(0, cursorAntes));

    input.value = gfFormatarValorMoeda(input.value);

    var novaPos = gfPosApos(input.value, digitosAntesCursor);
    try { input.setSelectionRange(novaPos, novaPos); } catch (e) { /* ignora se o navegador nao suportar aqui */ }
  }

  gfBinders.push(function (root) {
    root.querySelectorAll('[data-money]').forEach(function (input) {
      if (input.getAttribute('data-gf-bound') === '1') return;
      input.setAttribute('data-gf-bound', '1');
    gfAplicarFormatacaoMoeda(input); // formata o valor inicial (ex.: modais de edição)
    input.addEventListener('input', function () { gfAplicarFormatacaoMoeda(input); });
    });
  });

  // Intercepta envio de formulário de edição de transação repetida para exibir o submodal (Image 5)
  document.addEventListener('submit', function (evento) {
    var form = evento.target;
    if (form.matches('[data-eh-serie="1"]')) {
      if (form.getAttribute('data-submodal-confirmado') === '1') {
        return; // Já confirmado, deixa o submit prosseguir normalmente
      }
      evento.preventDefault();
      var submodalId = form.getAttribute('data-submodal-id');
      var submodal = document.getElementById(submodalId);
      if (submodal) {
        submodal.classList.add('is-open');
      }
    }
  });

  // Fechamento e escolha de opção nos submodais de série (Image 5)
  document.addEventListener('click', function (evento) {
    var fecharSubmodal = evento.target.closest('[data-submodal-close]');
    if (fecharSubmodal) {
      fecharSubmodal.closest('.modal-backdrop')?.classList.remove('is-open');
      return;
    }

    var btnOpcao = evento.target.closest('.btn-escopo-opcao');
    if (btnOpcao) {
      var escopoVal = btnOpcao.getAttribute('data-escopo-val');
      var formId = btnOpcao.getAttribute('data-form-id');
      var form = document.getElementById(formId);
      if (form) {
        var inputEscopo = form.querySelector('[name="escopo_edicao"]');
        if (inputEscopo) {
          inputEscopo.value = escopoVal;
        }
        form.setAttribute('data-submodal-confirmado', '1');
        btnOpcao.closest('.modal-backdrop')?.classList.remove('is-open');
        form.submit();
      }
    }

    var btnSinal = evento.target.closest('.btn-toggle-ajuste-sinal');
    if (btnSinal) {
      var contaId = btnSinal.getAttribute('data-conta-id');
      var inputTipo = document.getElementById('tipo-ajuste-' + contaId);
      var icon = document.getElementById('icon-ajustar-sinal-' + contaId);
      var btnSubmit = document.getElementById('btn-ajustar-submit-' + contaId);

      if (inputTipo && icon) {
        if (inputTipo.value === 'somar') {
          inputTipo.value = 'subtrair';
          btnSinal.style.background = 'var(--red-bg)';
          icon.className = 'ph ph-minus';
          icon.style.color = 'var(--red)';
          if (btnSubmit) btnSubmit.textContent = GF_T.subtrair_saldo;
        } else {
          inputTipo.value = 'somar';
          btnSinal.style.background = 'var(--green-bg)';
          icon.className = 'ph ph-plus';
          icon.style.color = 'var(--green)';
          if (btnSubmit) btnSubmit.textContent = GF_T.adicionar_saldo;
        }
      }
    }
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
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-visivel'); });
    setTimeout(function () { el.classList.remove('is-visivel'); setTimeout(function () { el.remove(); }, 300); }, 4200);
  }
  window.gfToast = toast;

  function travar(form, sim) {
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(function (b) {
      b.disabled = !!sim;
      b.classList.toggle('is-loading', !!sim);
    });
  }

  // Troca so o conteudo principal pelo da pagina recarregada em segundo plano.
  function atualizarConteudo(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var novo = doc.querySelector('main.container'), atual = document.querySelector('main.container');
    if (!novo || !atual) return false;
    var aberto = document.querySelector('.modal-backdrop.is-open');
    var y = window.scrollY;
    atual.innerHTML = novo.innerHTML;
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
        var flash = new DOMParser().parseFromString(html, 'text/html').querySelector('main .alert');
        var ok = atualizarConteudo(html);
        if (!ok) { window.location.reload(); return; }
        // A mensagem de retorno veio no conteudo novo (alert); tambem mostra toast para nao passar despercebida.
        if (flash) toast(flash.textContent.trim(), /alert-erro/.test(flash.className) ? 'erro' : 'sucesso');
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

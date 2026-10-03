/* Graficos de analise (Relatorios > Graficos): receitas e despesas por categoria e por subcategoria.
   - A situacao (Todos / Pagos-Recebidos / Pendentes) e filtrada no navegador, card a card.
   - Clicar numa fatia (ou no item da legenda) abre o Estado financeiro com as transacoes daquela categoria/subcategoria.
   - Os cards podem ser reordenados arrastando a alca; a ordem fica salva neste navegador. */
(function () {
  var cfg = window.GF_GRAF;
  var grade = document.getElementById('gfGrafGrid');
  if (!cfg || !grade || !window.GFCharts) return;
  var CHAVE_ORDEM = 'gf_graficos_ordem';

  function agregar(tipo, nivel, situacao) {
    var mapa = {};
    cfg.dados.forEach(function (d) {
      if (d.tipo !== tipo) return;
      if (situacao !== 'todos' && d.status !== situacao) return;
      if (nivel === 'sub' && !d.subId) return;
      var id = nivel === 'sub' ? 's' + d.subId : 'c' + (d.catId || 0);
      var item = mapa[id];
      if (!item) {
        item = mapa[id] = {
          catId: d.catId, subId: nivel === 'sub' ? d.subId : null,
          nome: nivel === 'sub' ? d.subNome : (d.catNome || cfg.t.semCategoria),
          sub: nivel === 'sub' ? (d.catNome || cfg.t.semCategoria) : '',
          cor: nivel === 'sub' ? (d.subCor || d.catCor) : d.catCor, valor: 0
        };
      }
      item.valor += Number(d.total) || 0;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; });
  }

  // Estado financeiro filtrado pela categoria/subcategoria do item, no mesmo periodo.
  function destino(tipo, item) {
    var p = new URLSearchParams(cfg.per);
    p.set('aba', 'demonstrativo');
    p.set('tipo', tipo);
    if (item.catId) p.set('categoria_id', item.catId);
    if (item.subId) p.set('subcategoria_id', item.subId);
    return '/relatorios?' + p.toString();
  }

  function periodoCurto(ini, fim) {
    var f = function (s) {
      var q = s.split('-');
      return new Date(Number(q[0]), Number(q[1]) - 1, Number(q[2])).toLocaleDateString(cfg.lang || undefined, { day: 'numeric', month: 'short' });
    };
    return f(ini) + ' – ' + f(fim);
  }

  function desenhar(card) {
    var tipo = card.getAttribute('data-tipo'), nivel = card.getAttribute('data-nivel');
    var situacao = card.querySelector('.gf-card__filtro').value;
    var itens = agregar(tipo, nivel, situacao).filter(function (i) { return i.valor > 0; });
    itens.forEach(function (i) { i.href = destino(tipo, i); });
    var corpo = card.querySelector('.gf-card__corpo');
    var vazio = card.querySelector('.grafico-vazio');
    var roscaWrap = card.querySelector('.gf-card__rosca');
    var legenda = card.querySelector('.gf-leg');
    var canvas = card.querySelector('canvas');
    var antigo = window.Chart && Chart.getChart(canvas);
    if (antigo) antigo.destroy();
    if (!itens.length) {
      roscaWrap.hidden = true; legenda.hidden = true; vazio.hidden = false; legenda.innerHTML = '';
      return;
    }
    roscaWrap.hidden = false; legenda.hidden = false; vazio.hidden = true;
    GFCharts.rosca(canvas, legenda, itens, {
      rotulo: cfg.t.total,
      aoClicar: function (item) { window.location.href = item.href; }
    });
  }

  // ---- inicializa os cards ----
  var cards = Array.prototype.slice.call(grade.querySelectorAll('.gf-card'));
  cards.forEach(function (card) {
    var per = card.querySelector('.gf-card__periodo');
    var ab = (per.getAttribute('data-periodo') || '').split('|');
    if (ab.length === 2) per.textContent = periodoCurto(ab[0], ab[1]);
    card.querySelector('.gf-card__filtro').addEventListener('change', function () { desenhar(card); });
    desenhar(card);
  });

  // ---- reordenar arrastando (alca) ----
  try {
    var salva = JSON.parse(localStorage.getItem(CHAVE_ORDEM) || '[]');
    salva.forEach(function (id) {
      var c = grade.querySelector('[data-card="' + id + '"]');
      if (c) grade.appendChild(c);
    });
  } catch (e) { /* sem armazenamento: ordem padrao */ }

  var arrastando = null;
  cards.forEach(function (card) {
    var alca = card.querySelector('.gf-card__alca');
    alca.addEventListener('mousedown', function () { card.draggable = true; });
    alca.addEventListener('touchstart', function () { card.draggable = true; }, { passive: true });
    card.addEventListener('dragstart', function (e) {
      arrastando = card;
      card.classList.add('is-arrastando');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.getAttribute('data-card')); }
    });
    card.addEventListener('dragend', function () {
      card.draggable = false;
      card.classList.remove('is-arrastando');
      grade.querySelectorAll('.gf-card.is-alvo').forEach(function (c) { c.classList.remove('is-alvo'); });
      arrastando = null;
      try {
        localStorage.setItem(CHAVE_ORDEM, JSON.stringify(Array.prototype.map.call(grade.querySelectorAll('.gf-card'), function (c) { return c.getAttribute('data-card'); })));
      } catch (e) { /* ignora */ }
    });
    card.addEventListener('dragover', function (e) {
      if (!arrastando || arrastando === card) return;
      e.preventDefault();
      var r = card.getBoundingClientRect();
      // Solta antes ou depois conforme o ponteiro esteja na primeira ou na segunda metade do card.
      var depois = (e.clientY - r.top) > r.height / 2 && (e.clientX - r.left) > r.width / 2 ? true : (e.clientY - r.top) > r.height * 0.75;
      grade.insertBefore(arrastando, depois ? card.nextSibling : card);
    });
  });
})();

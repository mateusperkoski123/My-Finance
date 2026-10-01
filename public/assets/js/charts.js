/* Graficos do sistema (Chart.js) - visual moderno, cores validadas e tema claro/escuro.
   Regras: cor segue a entidade (categoria), marcas finas com cantos arredondados,
   grade discreta, legenda sempre presente, tooltip com valor completo. */
(function () {
  var FALLBACK = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  var FALLBACK_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

  function css(nome, padrao) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return v || padrao;
  }
  function escuro() { return document.documentElement.getAttribute('data-tema') === 'escuro'; }
  function paleta() { return escuro() ? FALLBACK_DARK : FALLBACK; }
  function corReceita() { return escuro() ? '#199e70' : '#1baf7a'; }
  function corDespesa() { return escuro() ? '#e66767' : '#e34948'; }

  function moeda(v) {
    var m = window.gfMoeda || { decimais: 0, simbolo: 'Gs.', milhar: '.', decimal: ',' };
    var n = Math.abs(Number(v) || 0);
    var partes = n.toFixed(m.decimais).split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, m.milhar);
    return (v < 0 ? '-' : '') + m.simbolo + ' ' + partes.join(m.decimal);
  }
  function compacto(v) {
    var n = Math.abs(v), s = v < 0 ? '-' : '';
    if (n >= 1e6) return s + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' mi';
    if (n >= 1e3) return s + Math.round(n / 1e3) + ' mil';
    return s + n;
  }
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  function tooltipBase() {
    return {
      backgroundColor: escuro() ? '#0b0d12' : '#16181d',
      titleColor: '#ffffff', bodyColor: '#e7e9ee',
      padding: 10, cornerRadius: 10, displayColors: true, boxWidth: 8, boxHeight: 8, boxPadding: 4,
      usePointStyle: true, borderColor: 'rgba(255,255,255,.08)', borderWidth: 1
    };
  }

  // Plugin: total no centro da rosca
  var centro = {
    id: 'gfCentro',
    afterDraw: function (chart, args, opts) {
      if (!opts || !opts.texto) return;
      var a = chart.chartArea, ctx = chart.ctx, cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = css('--muted', '#6b7280'); ctx.font = '600 11px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(opts.rotulo || (window.GF_T && window.GF_T.total) || 'Total', cx, cy - 12);
      ctx.fillStyle = css('--text', '#16181d'); ctx.font = '800 15px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(opts.texto, cx, cy + 8);
      ctx.restore();
    }
  };

  /* itens: [{nome, cor, valor}] -> rosca + legenda em lista com barra de proporcao */
  function rosca(canvasId, legendaId, itens, opcoes) {
    opcoes = opcoes || {};
    var canvas = document.getElementById(canvasId), legenda = document.getElementById(legendaId);
    if (!canvas) return;
    itens = itens.filter(function (i) { return i.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
    var total = itens.reduce(function (a, i) { return a + i.valor; }, 0);
    var pal = paleta();
    itens.forEach(function (i, idx) { i.cor = i.cor || pal[idx % pal.length]; });

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: itens.map(function (i) { return i.nome; }),
        datasets: [{
          data: itens.map(function (i) { return i.valor; }),
          backgroundColor: itens.map(function (i) { return i.cor; }),
          borderColor: css('--card', '#ffffff'), borderWidth: 3, borderRadius: 6, hoverOffset: 6
        }]
      },
      options: {
        cutout: '74%', responsive: true, maintainAspectRatio: true, animation: { duration: 500 },
        layout: { padding: 6 },
        plugins: {
          legend: { display: false },
          gfCentro: { texto: moeda(total), rotulo: opcoes.rotulo || (window.GF_T && window.GF_T.total) || 'Total' },
          tooltip: Object.assign(tooltipBase(), {
            callbacks: {
              label: function (c) {
                var pct = total ? (c.parsed / total * 100).toFixed(1).replace('.', ',') : '0';
                return ' ' + c.label + ': ' + moeda(c.parsed) + ' (' + pct + '%)';
              }
            }
          })
        }
      },
      plugins: [centro]
    });

    if (legenda) {
      legenda.innerHTML = itens.map(function (i) {
        var pct = total ? i.valor / total * 100 : 0;
        return '<li class="gf-leg__item">' +
          '<span class="gf-leg__linha"><span class="gf-leg__dot" style="background:' + esc(i.cor) + '"></span>' +
          '<span class="gf-leg__nome">' + esc(i.nome) + '</span>' +
          '<span class="gf-leg__valor">' + esc(moeda(i.valor)) + '</span>' +
          '<span class="gf-leg__pct">' + pct.toFixed(1).replace('.', ',') + '%</span></span>' +
          '<span class="gf-leg__barra"><span style="width:' + pct.toFixed(1) + '%;background:' + esc(i.cor) + '"></span></span></li>';
      }).join('');
    }
  }

  /* dados: [{data:'YYYY-MM-DD', receitas, despesas}] -> colunas agrupadas */
  function frequencia(canvasId, dados) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var grade = css('--border', '#e5e7eb'), muted = css('--muted', '#6b7280');
    var rot = dados.map(function (d) { var p = String(d.data).split('T')[0].split('-'); return p[2] + '/' + p[1]; });
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rot,
        datasets: [
          { label: (window.GF_T && window.GF_T.receitas) || 'Receitas', data: dados.map(function (d) { return Number(d.receitas) || 0; }), backgroundColor: corReceita(), borderRadius: 5, borderSkipped: 'bottom', maxBarThickness: 14 },
          { label: (window.GF_T && window.GF_T.despesas) || 'Despesas', data: dados.map(function (d) { return Number(d.despesas) || 0; }), backgroundColor: corDespesa(), borderRadius: 5, borderSkipped: 'bottom', maxBarThickness: 14 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        categoryPercentage: 0.7, barPercentage: 0.9,
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: grade, lineWidth: 1 }, ticks: { color: muted, font: { size: 11 }, maxTicksLimit: 5, callback: function (v) { return compacto(v); } } }
        },
        plugins: {
          legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, color: css('--text', '#16181d'), font: { size: 12, weight: '600' } } },
          tooltip: Object.assign(tooltipBase(), { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + moeda(c.parsed.y); } } })
        }
      }
    });
  }


  /* dados: [{data:'YYYY-MM-DD', saldo}] -> linha 2px com lavado de 10% e ponto final */
  function evolucao(canvasId, dados) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var cor = escuro() ? '#3987e5' : '#2a78d6', grade = css('--border', '#e5e7eb'), muted = css('--muted', '#6b7280');
    var rot = dados.map(function (d) { var p = String(d.data).split('T')[0].split('-'); return p[2] + '/' + p[1]; });
    var ultimo = dados.length - 1;
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: rot,
        datasets: [{
          label: (window.GF_T && window.GF_T.saldo) || 'Saldo', data: dados.map(function (d) { return Number(d.saldo) || 0; }),
          borderColor: cor, backgroundColor: cor + '1a', fill: true, borderWidth: 2, tension: 0, stepped: 'before',
          pointRadius: dados.map(function (d, i) { return i === ultimo ? 5 : 0; }), pointHoverRadius: 6,
          pointBackgroundColor: cor, pointBorderColor: css('--card', '#ffffff'), pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { border: { display: false }, grid: { color: grade, lineWidth: 1 }, ticks: { color: muted, font: { size: 11 }, maxTicksLimit: 5, callback: function (v) { return compacto(v); } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign(tooltipBase(), { callbacks: { label: function (c) { return ' Saldo: ' + moeda(c.parsed.y); } } })
        }
      }
    });
  }

  window.GFCharts = { rosca: rosca, frequencia: frequencia, evolucao: evolucao, moeda: moeda };
})();

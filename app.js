'use strict';

/* ========== Utilitários ========== */
const $ = (s) => document.querySelector(s);
const fmtR = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtN = (v) => new Intl.NumberFormat('pt-BR').format(v || 0);
const fmtK = (v) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)} mi` : v >= 1e3 ? `R$ ${(v / 1e3).toFixed(0)} mil` : `R$ ${v.toFixed(0)}`;
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const FAIXAS = ['Sem atraso', '1 a 5', '6 a 12', '13 a 24', '25 a 48', 'Mais de 48'];
const faixaOf = (n) => n <= 0 ? FAIXAS[0] : n <= 5 ? FAIXAS[1] : n <= 12 ? FAIXAS[2] : n <= 24 ? FAIXAS[3] : n <= 48 ? FAIXAS[4] : FAIXAS[5];
const IDADES = ['Até 30 dias', '31 a 90 dias', '91 a 180 dias', '181 dias a 1 ano', '1 a 2 anos', '2 a 5 anos', 'Mais de 5 anos', 'Sem data', 'Sem débito'];
const idadeOf = (d) => d <= 30 ? IDADES[0] : d <= 90 ? IDADES[1] : d <= 180 ? IDADES[2] : d <= 365 ? IDADES[3] : d <= 730 ? IDADES[4] : d <= 1825 ? IDADES[5] : IDADES[6];
const CONTATOS = ['Com celular', 'Só telefone fixo', 'Sem telefone'];
const ORDERS = { faixa: FAIXAS, idade: IDADES, contato: CONTATOS };
const isLigado = (s) => /^\s*LIGAD/i.test(s); // evita casar "DESLIGADO"
const isCliente = (s) => /^\s*(LIGAD|CORTAD)/i.test(s); // exclui potencial, factível e suprimido
const fmtPhone = (p) => p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : p.length === 10 ? `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}` : '';

// Dimensões filtráveis (checkbox + clique nos gráficos)
const DIMS = [
  { key: 'city', label: 'Município' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'category', label: 'Categoria principal' },
  { key: 'status', label: 'Situação da água' },
  { key: 'esgoto', label: 'Situação do esgoto' },
  { key: 'hidrometro', label: 'Hidrômetro' },
  { key: 'faixa', label: 'Faixa de atraso (contas)' },
  { key: 'contato', label: 'Telefone para contato' },
  { key: 'negativ', label: 'Negativação (Serasa)' },
  { key: 'cobranca', label: 'Situação da cobrança' },
  { key: 'pessoa', label: 'Tipo de pessoa' },
  { key: 'idade', label: 'Idade da dívida' },
];
let hasPhoneCol = false; // só mostra o filtro se a base tiver coluna de telefone
const DIM_LABEL = Object.fromEntries(DIMS.map((d) => [d.key, d.label]));

/* ========== Estado ========== */
let rawData = [], filtered = [], counts = {}, maxTs = 0, dupInfo = { n: 0, debt: 0 };
const charts = {};
const S = { sel: {}, q: '', minDebt: 0, minBills: 0, cutMin: 3, days: 0, onlyDebt: false, sort: { k: 'debt', dir: -1 } };
DIMS.forEach((d) => (S.sel[d.key] = new Set()));

/* ========== 1. Carga e limpeza do CSV ========== */
function parseBRL(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // formato BR
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDate(dateStr, refStr) {
  if (dateStr) {
    const p = dateStr.split(/[\/\-\s]/);
    if (p.length >= 3) {
      const a = +p[0], b = +p[1], c = +p[2];
      const d = a > 31 ? new Date(a, b - 1, c) : new Date(c, b - 1, a);
      if (!isNaN(d)) return d;
    }
  }
  if (/^\d{6}$/.test(refStr || '')) return new Date(+refStr.slice(0, 4), +refStr.slice(4, 6) - 1, 1);
  if (refStr) {
    const p = refStr.split(/[\/\-]/);
    if (p.length === 2) { const d = new Date(+p[1], +p[0] - 1, 1); if (!isNaN(d)) return d; }
  }
  return null;
}

function loadFile(file) {
  $('#loading-overlay').classList.replace('hidden', 'flex');
  const run = (encoding) => Papa.parse(file, {
    header: true, skipEmptyLines: true, encoding,
    delimitersToGuess: [';', ',', '\t'],
    transformHeader: (h) => h.trim().toUpperCase(),
    complete: (res) => {
      // Se os cabeçalhos vieram quebrados (acentos), tenta de novo em Latin-1
      if (!res.meta.fields?.includes('MATRICULA') && encoding === 'UTF-8') return run('ISO-8859-1');
      buildData(res.data);
    },
    error: (err) => { alert('Erro ao ler o arquivo: ' + err.message); hideLoading(); },
  });
  run('UTF-8');
}
const hideLoading = () => $('#loading-overlay').classList.replace('flex', 'hidden');

function buildData(rows) {
  rawData = []; maxTs = 0; dupInfo = { n: 0, debt: 0 };
  const seen = new Set();
  // colunas de telefone (celular primeiro)
  const phoneKeys = Object.keys(rows[0] || {}).filter((k) => /TEL|FONE|CELULAR|CONTATO|WHATS/.test(k)).sort((a, b) => /CELULAR/.test(b) - /CELULAR/.test(a));
  hasPhoneCol = phoneKeys.length > 0;
  for (const r of rows) {
    const id = (r['MATRICULA'] || '').toString().trim();
    if (!id) continue;
    const debt = parseBRL(r['VALOR TOTAL DEVIDO']);
    if (seen.has(id)) { dupInfo.n++; dupInfo.debt += debt; continue; } // matrícula repetida: mantém a primeira
    seen.add(id);
    // telefones: várias numerações por célula separadas por "|"; celular = 11 dígitos com 9 após o DDD; fixo = 10 dígitos iniciando em 2-5
    let cel = '', fixo = '';
    for (const k of phoneKeys) for (const part of String(r[k] || '').split('|')) {
      const t = part.replace(/\D/g, '');
      if (t.length === 11 && t[2] === '9') cel = cel || t;
      else if (t.length === 10 && '2345'.includes(t[2])) fixo = fixo || t;
    }
    const city = r['MUNICIPIO'] || 'Não informado';
    const bairro = r['BAIRRO'] || 'Não informado';
    const hid = (r['NR HID.'] || r['NR HID'] || '').toString().trim();
    const date = parseDate(r['MAIOR VENCIMENTO'] || r['DATA VENCIMENTO'] || '', r['MAIOR REFERENCIA DEVIDO'] || '');
    const dmin = parseDate(r['MENOR VENCIMENTO'] || '', r['MENOR REFERENCIA DEVIDO'] || '');
    const ts = date ? date.getTime() : 0;
    if (ts > maxTs) maxTs = ts;
    const bills = parseInt(r['QTD. CONTAS DEVIDO'], 10) || 0;
    const tp = r['TIPO DE PESSOA'] || '';
    rawData.push({
      id, city, bairro,
      category: (r['CATEGORIA PRINCIPAL'] || 'Outros').replace(/^\d+\s*-\s*/, ''),
      status: r['SITUACAO AGUA'] || 'Não informado',
      esgoto: r['SITUACAO ESGOTO'] || r['SITUACAO DO ESGOTO'] || 'Não informado',
      hidrometro: hid && hid !== '-' && hid !== '0' ? 'Com hidrômetro' : 'Sem hidrômetro',
      pessoa: /JURID/i.test(tp) ? 'Pessoa jurídica' : /FISIC/i.test(tp) ? 'Pessoa física' : 'Não informado',
      negativ: r['SIT. COBRANCA SERASA'] ? 'Negativado' : 'Não negativado',
      cobranca: r['SIT. ESPECIAL DE COBRANCA'] ? 'Cobrança paralisada' : 'Cobrança normal',
      contato: cel ? CONTATOS[0] : fixo ? CONTATOS[1] : CONTATOS[2], phone: cel || fixo,
      ts, minTs: dmin ? dmin.getTime() : 0, bills, faixa: faixaOf(bills),
      debt, interest: parseBRL(r['VALOR TOTAL COM JUROS']), review: parseBRL(r['VALOR TOTAL EM REVISAO']),
      search: `${id} ${bairro} ${city}`.toLowerCase(),
    });
  }
  hideLoading();
  if (!rawData.length) return alert('Nenhum registro válido encontrado. Confira se a coluna MATRICULA existe.');
  if (!maxTs) maxTs = Date.now();
  // idade da dívida = dias entre o menor vencimento em aberto e o vencimento mais recente da base
  for (const d of rawData) d.idade = d.debt <= 0 ? 'Sem débito' : d.minTs ? idadeOf(Math.max(0, (maxTs - d.minTs) / 864e5)) : 'Sem data';
  $('#empty-state').classList.add('hidden');
  buildFilters();
  resetAll();
}

/* ========== 2. Filtros (facetados: contagem respeita os outros filtros) ========== */
function buildFilters() {
  const box = $('#filters'); box.innerHTML = '';
  for (const { key, label } of DIMS) {
    if (key === 'contato' && !hasPhoneCol) continue;
    let vals = [...new Set(rawData.map((d) => d[key]))];
    vals = ORDERS[key] ? ORDERS[key].filter((f) => vals.includes(f)) : vals.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const g = document.createElement('div'); g.className = 'fgroup'; g.dataset.dim = key;
    g.innerHTML = `
      <div class="fgroup-head"><span>${label}</span><button type="button" data-clear="${key}">limpar</button></div>
      ${vals.length > 8 ? `<input class="fsearch" data-fsearch="${key}" type="search" placeholder="Buscar em ${label.toLowerCase()}…">` : ''}
      <div class="fopts filter-scroll">${vals.map((v) => `
        <label class="fopt" data-v="${esc(v.toLowerCase())}"><input type="checkbox" data-dim="${key}" value="${esc(v)}">
        <span class="truncate" title="${esc(v)}">${esc(v)}</span><span class="n">0</span></label>`).join('')}
      </div>`;
    box.appendChild(g);
  }
}

function syncFilterUI() {
  document.querySelectorAll('#filters .fopt').forEach((el) => {
    const cb = el.querySelector('input'), dim = cb.dataset.dim;
    cb.checked = S.sel[dim].has(cb.value);
    const n = counts[dim]?.[cb.value] || 0;
    el.querySelector('.n').textContent = fmtN(n);
    el.classList.toggle('zero', n === 0 && !cb.checked);
  });
}

/* Uma única passada: filtra e calcula contagens facetadas */
function compute() {
  const lim = S.days ? maxTs - S.days * 864e5 : 0, q = S.q.trim().toLowerCase();
  filtered = []; counts = {}; DIMS.forEach((x) => (counts[x.key] = {}));
  for (const d of rawData) {
    let fails = 0, failKey = null;
    for (const { key } of DIMS) {
      const s = S.sel[key];
      if (s.size && !s.has(d[key])) { if (++fails > 1) break; failKey = key; }
    }
    if (fails > 1) continue;
    if ((S.onlyDebt && d.debt <= 0) || d.debt < S.minDebt || d.bills < S.minBills || (lim && d.ts < lim) || (q && !d.search.includes(q))) continue;
    if (fails === 0) {
      filtered.push(d);
      for (const { key } of DIMS) counts[key][d[key]] = (counts[key][d[key]] || 0) + 1;
    } else counts[failKey][d[failKey]] = (counts[failKey][d[failKey]] || 0) + 1;
  }
}

function toggle(dim, value) {
  const s = S.sel[dim];
  s.has(value) ? s.delete(value) : s.add(value);
  refresh();
}
function syncInputs() {
  $('#f-search').value = S.q; $('#f-min').value = S.minDebt || ''; $('#f-bills').value = S.minBills || '';
  $('#f-days').value = String(S.days); $('#f-only').checked = S.onlyDebt; $('#f-cut').value = S.cutMin;
}
function resetAll() {
  DIMS.forEach((d) => S.sel[d.key].clear());
  Object.assign(S, { q: '', minDebt: 0, minBills: 0, days: 0, onlyDebt: false });
  syncInputs();
  refresh();
}

function renderChips() {
  const chips = [];
  for (const { key } of DIMS) for (const v of S.sel[key]) chips.push([`${DIM_LABEL[key]}: ${v}`, `data-dim="${key}" data-v="${esc(v)}"`]);
  if (S.q) chips.push([`Busca: ${S.q}`, 'data-x="q"']);
  if (S.minDebt) chips.push([`Dívida ≥ ${fmtR(S.minDebt)}`, 'data-x="min"']);
  if (S.minBills) chips.push([`Contas em atraso ≥ ${S.minBills}`, 'data-x="bills"']);
  if (S.days) chips.push([`Último vencimento nos últimos ${S.days} dias`, 'data-x="days"']);
  if (S.onlyDebt) chips.push(['Só inadimplentes', 'data-x="only"']);
  $('#chips').innerHTML = chips.map(([t, a]) => `<span class="chip">${esc(t)}<button type="button" ${a} aria-label="Remover filtro">✕</button></span>`).join('');
  $('#btn-reset').disabled = !chips.length;
}

/* ========== 3. KPIs e insights ========== */
function stats() {
  const sum = (arr, f) => arr.reduce((a, c) => a + f(c), 0);
  const debtors = filtered.filter((d) => d.debt > 0).sort((a, b) => b.debt - a.debt);
  const total = sum(debtors, (d) => d.debt);
  const clientes = filtered.filter((d) => isCliente(d.status));
  const topN = Math.max(1, Math.floor(debtors.length * 0.1));
  const ligados = debtors.filter((d) => isLigado(d.status));
  const cut = ligados.filter((d) => d.bills >= S.cutMin && d.cobranca === 'Cobrança normal');
  const old = debtors.filter((d) => d.idade === IDADES[6]);
  return {
    total, debtors, ligados, cut, old, topN, clientes: clientes.length,
    devClientes: clientes.filter((d) => d.debt > 0).length,
    interest: sum(debtors, (d) => d.interest),
    topDebt: sum(debtors.slice(0, topN), (d) => d.debt), topThreshold: debtors[topN - 1]?.debt || 0,
    bills: sum(debtors, (d) => d.bills),
    ligadoDebt: sum(ligados, (d) => d.debt), cutDebt: sum(cut, (d) => d.debt), oldDebt: sum(old, (d) => d.debt),
    neg: debtors.filter((d) => d.negativ === 'Negativado'),
    review: sum(filtered, (d) => d.review),
    semFone: ligados.filter((d) => d.contato === CONTATOS[2]),
  };
}

function renderKPIs(st) {
  const nd = st.debtors.length;
  const k = [
    ['Valor total devido', fmtR(st.total), `${fmtN(nd)} matrículas devedoras`, 'fa-file-invoice-dollar', '#f43f5e'],
    ['Com multas e juros', fmtR(st.interest), st.total ? `+${((st.interest / st.total - 1) * 100).toFixed(1)}% sobre o principal` : '', 'fa-chart-line', '#f97316'],
    ['Taxa de inadimplência', pct(st.devClientes, st.clientes), `${fmtN(st.devClientes)} de ${fmtN(st.clientes)} clientes ligados/cortados`, 'fa-percent', '#0ea5e9'],
    ['Ticket médio da dívida', fmtR(nd ? st.total / nd : 0), `${(nd ? st.bills / nd : 0).toFixed(1)} contas em atraso em média`, 'fa-receipt', '#8b5cf6'],
    ['Dívida com +5 anos', fmtR(st.oldDebt), `${pct(st.oldDebt, st.total)} do total · ${fmtN(st.old.length)} matrículas`, 'fa-hourglass-end', '#64748b'],
    ['Devedores ligados', fmtN(st.ligados.length), `${pct(st.ligadoDebt, st.total)} da dívida`, 'fa-faucet-drip', '#e11d48'],
    ['Candidatos a corte', fmtN(st.cut.length), `ligados, ${S.cutMin}+ contas, cobrança ativa · ${fmtN(st.cut.filter((d) => d.contato === CONTATOS[0]).length)} com celular`, 'fa-scissors', '#be123c'],
    ['Negativados (Serasa)', fmtN(st.neg.length), `${pct(st.neg.length, nd)} dos devedores`, 'fa-ban', '#b45309'],
    ['Em revisão (fora do devido)', fmtR(st.review), 'contas contestadas, não somadas acima', 'fa-scale-balanced', '#0d9488'],
    ['Concentração (top 10%)', pct(st.topDebt, st.total), `${fmtN(st.topN)} matrículas`, 'fa-bullseye', '#10b981'],
  ];
  $('#kpis').innerHTML = k.map(([l, v, s, ic, c]) => `
    <div class="glass-card kpi" style="--c:${c}"><div class="ic"><i class="fa-solid ${ic}"></i></div>
    <div class="min-w-0"><div class="l">${l}</div><div class="v truncate" title="${esc(v)}">${v}</div><div class="s">${esc(s)}</div></div></div>`).join('');
}

function renderInsights(st) {
  const ins = [];
  if (st.total > 0) {
    if (st.cut.length) ins.push({ c: '#be123c', t: 'Candidatos a corte', d: `<strong>${fmtN(st.cut.length)}</strong> ligações ativas com ${S.cutMin}+ contas somam <strong>${fmtR(st.cutDebt)}</strong>; ${fmtN(st.cut.filter((d) => d.contato === CONTATOS[0]).length)} têm celular para aviso prévio.`, a: 'Filtrar candidatos a corte', act: 'cut' });
    if (st.old.length) ins.push({ c: '#64748b', t: 'Dívida muito antiga', d: `<strong>${pct(st.oldDebt, st.total)}</strong> do valor (${fmtR(st.oldDebt)}) tem mais de 5 anos. Vale avaliar com o jurídico a cobrabilidade desse estoque.`, a: 'Ver dívidas com +5 anos', act: 'old' });
    if (st.semFone.length) ins.push({ c: '#f59e0b', t: 'Devedores sem contato', d: `<strong>${fmtN(st.semFone.length)}</strong> devedores ligados não têm telefone válido (${fmtR(st.semFone.reduce((a, d) => a + d.debt, 0))}). Atualizar o cadastro em campo.`, a: 'Listar devedores sem telefone', act: 'nofone' });
    ins.push({ c: '#0ea5e9', t: 'Princípio de Pareto', d: `<strong>${fmtN(st.topN)} matrículas (10%)</strong> concentram ${fmtR(st.topDebt)}, ${pct(st.topDebt, st.total)} do total.`, a: 'Isolar o top 10%', act: 'top' });
    const byCity = {};
    filtered.forEach((d) => { if (d.debt > 0) byCity[d.city] = (byCity[d.city] || 0) + d.debt; });
    const topCity = Object.entries(byCity).sort((a, b) => b[1] - a[1])[0];
    if (topCity) ins.push({ c: '#10b981', t: `Foco em ${esc(topCity[0])}`, d: `Maior passivo: <strong>${fmtR(topCity[1])}</strong> (${pct(topCity[1], st.total)} da seleção).`, a: 'Filtrar este município', act: 'city', v: topCity[0] });
    const nDev = {}, nCli = {};
    filtered.forEach((d) => { if (!isCliente(d.status)) return; nCli[d.bairro] = (nCli[d.bairro] || 0) + 1; if (d.debt > 0) nDev[d.bairro] = (nDev[d.bairro] || 0) + 1; });
    const worst = Object.keys(nDev).filter((b) => nCli[b] >= 30).map((b) => [b, nDev[b] / nCli[b], nDev[b]]).sort((a, b) => b[1] - a[1])[0];
    if (worst) ins.push({ c: '#8b5cf6', t: `Bairro mais crítico: ${esc(worst[0])}`, d: `<strong>${(worst[1] * 100).toFixed(1)}%</strong> dos clientes estão inadimplentes (${fmtN(worst[2])} de ${fmtN(nCli[worst[0]])}).`, a: 'Filtrar este bairro', act: 'bairro', v: worst[0] });
  }
  $('#insights').innerHTML = ins.length ? ins.map((i, n) => `
    <div class="glass-card insight" style="--c:${i.c}"><div><h4>${i.t}</h4><p>${i.d}</p></div>
    <button type="button" data-ins="${n}">${i.a}</button></div>`).join('')
    : '<p class="text-sm text-slate-500">Sem dívida na seleção atual para gerar insights.</p>';
  renderInsights.list = ins; renderInsights.st = st;
}

function runInsight(i) {
  const ins = renderInsights.list[i], st = renderInsights.st;
  const ligados = () => new Set([...new Set(rawData.map((d) => d.status))].filter(isLigado));
  if (ins.act === 'cut') { S.sel.status = ligados(); S.sel.cobranca = new Set(['Cobrança normal']); S.minBills = S.cutMin; S.onlyDebt = true; }
  else if (ins.act === 'old') S.sel.idade = new Set([IDADES[6]]);
  else if (ins.act === 'nofone') { S.sel.status = ligados(); S.sel.contato = new Set([CONTATOS[2]]); S.onlyDebt = true; }
  else if (ins.act === 'top') S.minDebt = Math.floor(st.topThreshold);
  else if (ins.act === 'city') S.sel.city = new Set([ins.v]);
  else if (ins.act === 'bairro') S.sel.bairro = new Set([ins.v]);
  syncInputs();
  refresh();
}

/* ========== 4. Gráficos interativos (clique = filtro) ========== */
const group = (keyFn, valFn, top) => {
  const m = {};
  filtered.forEach((d) => { const k = keyFn(d); if (k != null) m[k] = (m[k] || 0) + valFn(d); });
  const e = Object.entries(m).sort((a, b) => b[1] - a[1]);
  return top ? e.slice(0, top) : e;
};

function drawChart(id, type, dim, entries, color, opts = {}) {
  const labels = entries.map((e) => e[0]), data = entries.map((e) => e[1]);
  const sel = dim ? S.sel[dim] : null;
  const palette = Array.isArray(color) ? color : null;
  const bg = labels.map((l, i) => {
    const base = palette ? palette[i % palette.length] : color;
    return sel && sel.size && !sel.has(l) ? base + '4d' : base; // esmaece o que não está selecionado
  });
  let ch = charts[id];
  if (!ch) {
    ch = charts[id] = new Chart($('#' + id), {
      type,
      data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: type === 'bar' ? 4 : 0, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        indexAxis: opts.horizontal ? 'y' : 'x', cutout: type === 'doughnut' ? '65%' : undefined,
        plugins: {
          legend: { display: type === 'doughnut', position: 'right' },
          tooltip: { callbacks: { label: (c) => ` ${fmtR(c.raw)}` } },
        },
        scales: type === 'doughnut' ? {} : {
          [opts.horizontal ? 'x' : 'y']: { grid: { borderDash: [4, 4] }, ticks: { callback: (v) => fmtK(v) } },
          [opts.horizontal ? 'y' : 'x']: { grid: { display: false } },
        },
        onClick: (_, els, chart) => { if (dim && els.length) toggle(dim, chart.data.labels[els[0].index]); },
        onHover: (e, els) => { e.native.target.style.cursor = dim && els.length ? 'pointer' : 'default'; },
      },
    });
  }
  ch.data.labels = labels;
  ch.data.datasets[0].data = data;
  ch.data.datasets[0].backgroundColor = bg;
  if (opts.line) { Object.assign(ch.data.datasets[0], { borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.15)', fill: true, tension: .3, pointRadius: 2 }); }
  ch.update();
}

function renderCharts() {
  const debt = (d) => d.debt;
  drawChart('chartCity', 'bar', 'city', group((d) => d.city, debt, 10), '#0ea5e9', { horizontal: true });
  drawChart('chartBairro', 'bar', 'bairro', group((d) => d.bairro, debt, 10), '#8b5cf6', { horizontal: true });
  drawChart('chartStatus', 'doughnut', 'status', group((d) => d.status, debt), ['#f43f5e', '#f59e0b', '#10b981', '#64748b', '#0ea5e9']);
  drawChart('chartCategory', 'doughnut', 'category', group((d) => d.category, debt), ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#14b8a6']);
  const ag = Object.fromEntries(FAIXAS.map((f) => [f, 0])); filtered.forEach((d) => (ag[d.faixa] += d.debt));
  drawChart('chartAging', 'bar', 'faixa', FAIXAS.map((f) => [f, ag[f]]), '#f59e0b');
  const ida = Object.fromEntries(IDADES.map((f) => [f, 0])); filtered.forEach((d) => { if (d.debt > 0) ida[d.idade] += d.debt; });
  drawChart('chartTrend', 'bar', 'idade', IDADES.filter((f) => ida[f] > 0).map((f) => [f, ida[f]]), '#64748b');
}

/* ========== 5. Tabela ordenável ========== */
const COLS = [
  ['id', 'Matrícula'], ['city', 'Município / Bairro'], ['status', 'Situação'],
  ['bills', 'Contas'], ['debt', 'Dívida'], ['interest', 'Com juros'], ['contato', 'Contato'],
];
function renderTable() {
  const { k, dir } = S.sort;
  $('#thead').innerHTML = COLS.map(([c, l]) => `<th class="sortable ${['bills', 'debt', 'interest'].includes(c) ? 'text-right' : ''}" data-sort="${c}">${l}${k === c ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const rows = [...filtered].sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k], 'pt-BR') : a[k] - b[k]) * dir).slice(0, 50);
  $('#tbody').innerHTML = rows.map((d) => `
    <tr class="hover:bg-slate-50">
      <td><div class="font-medium">#${esc(d.id)}</div><div class="text-xs text-slate-400">${esc(d.category)}</div></td>
      <td><div>${esc(d.city)}</div><div class="text-xs text-slate-400">${esc(d.bairro)}</div></td>
      <td><span class="tag ${isLigado(d.status) && d.debt > 0 ? 'on' : ''}">${esc(d.status)}</span></td>
      <td class="text-right tabular-nums">${d.bills}</td>
      <td class="text-right font-bold text-rose-600 tabular-nums">${fmtR(d.debt)}</td>
      <td class="text-right text-slate-500 tabular-nums">${fmtR(d.interest)}</td>
      <td><span class="tag">${esc(d.contato)}</span>${d.negativ === 'Negativado' ? ' <span class="tag on" title="Negativado no Serasa">Serasa</span>' : ''}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="text-center text-slate-400 py-8">Nenhuma matrícula neste filtro.</td></tr>';
  $('#table-info').textContent = `Mostrando ${Math.min(50, filtered.length)} de ${fmtN(filtered.length)} — clique no cabeçalho para ordenar`;
}

/* ========== 6. Exportação (respeita filtros) ========== */
function exportData() {
  if (!filtered.length) return alert('Não há dados para exportar neste filtro.');
  const num = (v) => v.toFixed(2).replace('.', ',');
  const csv = Papa.unparse(filtered.map((d) => ({
    'MATRICULA': d.id, 'MUNICIPIO': d.city, 'BAIRRO': d.bairro, 'CATEGORIA PRINCIPAL': d.category,
    'SITUACAO AGUA': d.status, 'SITUACAO ESGOTO': d.esgoto, 'HIDROMETRO': d.hidrometro,
    'TELEFONE': fmtPhone(d.phone), 'CONTATO': d.contato, 'NEGATIVACAO': d.negativ, 'COBRANCA': d.cobranca, 'TIPO DE PESSOA': d.pessoa, 'IDADE DA DIVIDA': d.idade, 'QTD CONTAS ATRASO': d.bills, 'VALOR TOTAL DEVIDO (R$)': num(d.debt), 'VALOR TOTAL C/ JUROS (R$)': num(d.interest),
  })), { delimiter: ';' });
  const url = URL.createObjectURL(new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' }));
  Object.assign(document.createElement('a'), { href: url, download: `relatorio_${Date.now()}.csv` }).click();
  URL.revokeObjectURL(url);
}

/* ========== Orquestração ========== */
function refresh() {
  if (!rawData.length) return;
  compute();
  const st = stats();
  renderKPIs(st); renderInsights(st); renderCharts(); renderTable(); renderChips(); syncFilterUI();
  $('#subtitle-info').textContent = filtered.length === rawData.length
    ? `Base completa: ${fmtN(rawData.length)} matrículas.`
    : `Filtro ativo: ${fmtN(filtered.length)} de ${fmtN(rawData.length)} matrículas.`;
  if (dupInfo.n) $('#subtitle-info').textContent += ` ${fmtN(dupInfo.n)} matrículas duplicadas removidas (${fmtR(dupInfo.debt)}).`;
  if (!hasPhoneCol) $('#subtitle-info').textContent += ' (Nenhuma coluna de telefone encontrada: filtro de contato indisponível.)';
}

window.addEventListener('DOMContentLoaded', () => {
  $('#csv-file').addEventListener('change', (e) => e.target.files[0] && loadFile(e.target.files[0]));
  $('#btn-reset').addEventListener('click', resetAll);
  $('#btn-export').addEventListener('click', exportData);
  $('#f-search').addEventListener('input', debounce((e) => { S.q = e.target.value; refresh(); }));
  $('#f-min').addEventListener('input', debounce((e) => { S.minDebt = Math.max(0, +e.target.value || 0); refresh(); }));
  $('#f-bills').addEventListener('input', debounce((e) => { S.minBills = Math.max(0, +e.target.value || 0); refresh(); }));
  $('#f-cut').addEventListener('input', debounce((e) => { S.cutMin = Math.max(1, +e.target.value || 1); refresh(); }));
  $('#f-days').addEventListener('change', (e) => { S.days = +e.target.value; refresh(); });
  $('#f-only').addEventListener('change', (e) => { S.onlyDebt = e.target.checked; refresh(); });

  $('#filters').addEventListener('change', (e) => { if (e.target.dataset.dim) toggle(e.target.dataset.dim, e.target.value); });
  $('#filters').addEventListener('click', (e) => { const k = e.target.dataset.clear; if (k) { S.sel[k].clear(); refresh(); } });
  $('#filters').addEventListener('input', (e) => {
    const k = e.target.dataset.fsearch; if (!k) return;
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(`.fgroup[data-dim="${k}"] .fopt`).forEach((o) => o.classList.toggle('hide', !o.dataset.v.includes(q)));
  });
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dim) S.sel[b.dataset.dim].delete(b.dataset.v);
    else if (b.dataset.x === 'q') { S.q = ''; $('#f-search').value = ''; }
    else if (b.dataset.x === 'min') { S.minDebt = 0; $('#f-min').value = ''; }
    else if (b.dataset.x === 'bills') { S.minBills = 0; $('#f-bills').value = ''; }
    else if (b.dataset.x === 'days') { S.days = 0; $('#f-days').value = '0'; }
    else if (b.dataset.x === 'only') { S.onlyDebt = false; $('#f-only').checked = false; }
    refresh();
  });
  $('#insights').addEventListener('click', (e) => { const b = e.target.closest('[data-ins]'); if (b) runInsight(+b.dataset.ins); });
  $('#thead').addEventListener('click', (e) => {
    const c = e.target.closest('[data-sort]')?.dataset.sort; if (!c) return;
    S.sort = { k: c, dir: S.sort.k === c ? -S.sort.dir : -1 };
    renderTable();
  });
  Chart.defaults.font.family = 'Inter'; Chart.defaults.color = '#64748b';
});

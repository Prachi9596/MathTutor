(() => {
  const $ = (selector) => document.querySelector(selector);
  const expressionInput = $('#expressionInput');
  const resultState = $('#resultState');
  const solutionOutput = $('#solutionOutput');
  const historyList = $('#historyList');
  const mistakeList = $('#mistakeList');
  const STORAGE = { history: 'mathtutor-question-history-v1', mistakes: 'mathtutor-mistake-notebook-v1', attempts: 'mathtutor-answer-attempts-v1' };
  let history = load(STORAGE.history, []);
  let mistakes = load(STORAGE.mistakes, []);
  let answerAttempts = load(STORAGE.attempts, []);
  let currentResult = null;
  let currentExpression = '';
  let selectedStudyTopic = null;
  let symbolicAnswerCheck = null;
  let activeSymbolicAnswerCheck = null;
  let mistakeFilter = 'all';
  let angle = 'rad';
  let calcMode = 'standard';
  let lastAnswer = '0';
  let problemImageUrl = null;
  let answerImageUrl = null;
  let checkerQuestionImageUrl = null;
  let studentWorkImageUrl = null;
  let lastCalculusGraph = null;

  const pageForHash = (hash) => ({
    '#workspace': 'workspace', '#imageInputCard': 'workspace', '#latexInput': 'workspace', '#expressionInput': 'workspace',
    '#calculator': 'calculator', '#progressTitle': 'progress', '#history': 'history', '#mistakes': 'mistakes', '#top': 'home',
  }[hash] || 'home');
  function setPage(page) {
    document.body.dataset.page = page;
    document.querySelectorAll('.primary-nav a').forEach((link) => {
      const active = link.dataset.pageLink === page;
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const toggle = $('#menuToggle'), nav = $('#primaryNav');
    if (toggle && nav) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open navigation'); nav.classList.remove('is-open'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
    const hash = link.getAttribute('href');
    if (!['#workspace', '#imageInputCard', '#latexInput', '#expressionInput', '#calculator', '#progressTitle', '#history', '#mistakes', '#top'].includes(hash)) return;
    event.preventDefault();
    const page = pageForHash(hash);
    const routeHash = page === 'home' ? '#top' : ({ workspace: '#workspace', calculator: '#calculator', progress: '#progressTitle', history: '#history', mistakes: '#mistakes' }[page]);
    if (window.location.hash !== routeHash) window.history.pushState({ page }, '', routeHash);
    setPage(page);
  }));
  window.addEventListener('popstate', () => setPage(pageForHash(window.location.hash)));
  setPage(pageForHash(window.location.hash));

  document.querySelectorAll('[data-entry-mode]').forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.entryMode;
    document.querySelectorAll('[data-entry-mode]').forEach((tab) => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-pressed', String(active)); });
    $('#imageProblemFlow').hidden = mode !== 'image';
    $('#typedProblemFlow').hidden = mode !== 'type';
  }));

  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function addText(parent, tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; node.textContent = text; parent.appendChild(node); return node; }
  function clean(n) { if (!Number.isFinite(n)) return String(n); return String(Number(n.toPrecision(9))); }
  function topicFor(expression) {
    const value = String(expression || '').toLowerCase();
    if (/\\int|\bintegrat|\bdefint|\bintegral/.test(value)) return 'Integration';
    if (/d\s*\/\s*d|\(?\s*d\s*\)?\s*\/\s*\(?\s*d\s*\*?\s*[a-z]|\\frac\s*\{\s*d|\\partial|\bderivative|\bdiff\b/.test(value)) return 'Differentiation';
    if (/(?:\^|\*\*)\s*(?:\{?\s*)?[2-9]/.test(value) || /\b(?:x|y|z)\s*\^/.test(value)) return 'Polynomials';
    return 'Equations';
  }
  const studyMaterials = {
    Equations: {
      summary: 'Strengthen the balance method and the inverse operations used to isolate a variable.',
      points: ['Undo addition and subtraction before multiplication or division.', 'Whatever you do to one side, do to the other.', 'Check by substituting your answer into the original equation.'],
      example: '2x + 3 = 11',
    },
    Polynomials: {
      summary: 'Review terms, coefficients, degree, like terms, and the order of operations with powers.',
      points: ['Combine only like terms (same variables and exponents).', 'Use exponent rules carefully when multiplying powers.', 'Check polynomial degree from the largest exponent.'],
      example: '2x^2 + 3x - 2 = 0',
    },
    Differentiation: {
      summary: 'Review the power rule first, then identify when product, quotient, or chain rules apply.',
      points: ['Power rule: d(x^n)/dx = n x^(n-1).', 'For products and compositions, choose the rule from the structure before simplifying.', 'Differentiate constants to zero and check signs and exponents.'],
      example: 'x^3 + 2x',
    },
    Integration: {
      summary: 'Review integration as reverse differentiation, including the constant of integration.',
      points: ['Power rule: integral x^n dx = x^(n+1)/(n+1) + C for n ≠ -1.', 'Integrate each term separately and retain + C for indefinite integrals.', 'For definite integrals, evaluate the antiderivative at the upper and lower bounds.'],
      example: 'x^2 + 2x',
    },
  };
  function showStudyMaterial(topic, score, isWeakest = false) {
    const material = studyMaterials[topic] || studyMaterials.Equations;
    const materials = $('#studyMaterialContent');
    $('#studyTitle').textContent = `${isWeakest ? 'Focus on' : 'Study'} ${topic}`;
    $('#studySummary').textContent = score
      ? `${material.summary} Current accuracy: ${Math.round(100 * score.correct / score.total)}% across ${score.total} ${score.total === 1 ? 'check' : 'checks'}.`
      : material.summary;
    materials.replaceChildren();
    const points = document.createElement('ul');
    material.points.forEach((text) => addText(points, 'li', '', text));
    materials.appendChild(points);
    addText(materials, 'p', 'study-example', `Try next: ${material.example}`);
    const practice = addText(materials, 'button', 'study-practice-button', `Practice ${topic.toLowerCase()}`);
    practice.type = 'button';
    practice.addEventListener('click', () => {
      if (topic === 'Differentiation' || topic === 'Integration') {
        $('#calcInput').value = material.example;
        $('#calculusOperation').value = topic === 'Differentiation' ? 'diff' : 'integrate';
        updateBounds();
        setMode('calculus');
        window.history.pushState({ page: 'calculator' }, '', '#calculator');
        setPage('calculator');
        $('#calcInput').focus();
        return;
      }
      document.querySelector('[data-entry-mode="type"]').click();
      expressionInput.value = material.example;
      hideSolution();
      window.history.pushState({ page: 'workspace' }, '', '#workspace');
      setPage('workspace');
      expressionInput.focus();
    });
  }
  function renderProgress() {
    const attempts = answerAttempts;
    $('#statAttempts').textContent = String(attempts.length);
    $('#statAccuracy').textContent = attempts.length ? `${Math.round(100 * attempts.filter((item) => item.correct).length / attempts.length)}%` : '—';
    const topics = new Map();
    attempts.forEach((item) => {
      const topic = topicFor(item.expression);
      const count = topics.get(topic) || { correct: 0, total: 0 };
      count.total += 1; if (item.correct) count.correct += 1;
      topics.set(topic, count);
    });
    $('#statTopics').textContent = String(topics.size);
    const weakest = [...topics.entries()].sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total) || b[1].total - a[1].total)[0];
    $('#statWeakTopic').textContent = weakest ? weakest[0] : '—';
    const recent = attempts.slice(0, 5), previous = attempts.slice(5, 10);
    const trend = $('#dashboardTrend');
    if (recent.length === 5 && previous.length === 5) {
      const delta = Math.round(100 * (recent.filter((item) => item.correct).length / 5 - previous.filter((item) => item.correct).length / 5));
      trend.textContent = `Recent accuracy ${delta > 0 ? `improved by ${delta}` : delta < 0 ? `fell by ${Math.abs(delta)}` : 'is unchanged'} percentage points compared with the 5 checks before it.`;
      trend.className = `dashboard-trend ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`;
    } else {
      trend.textContent = 'Check 10 answers to compare your latest 5 with the 5 before them.';
      trend.className = 'dashboard-trend';
    }
    const list = $('#topicProgress'); list.replaceChildren();
    const materials = $('#studyMaterialContent');
    materials.replaceChildren();
    if (!attempts.length) {
      addText(list, 'p', 'dashboard-empty', 'Your topic accuracy will appear after you check a few answers.');
      $('#studyTitle').textContent = 'Start with the foundations';
      $('#studySummary').textContent = 'Check answers as you practice. The dashboard will use those results to surface a topic-specific review plan.';
      const starter = document.createElement('ul');
      ['Equations: balance both sides and isolate the variable.', 'Polynomials: identify like terms and use exponent rules.', 'Calculus: review the power rule for derivatives and integrals.'].forEach((text) => addText(starter, 'li', '', text));
      materials.appendChild(starter);
      return;
    }
    [...topics.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([topic, score]) => {
      const percent = Math.round(100 * score.correct / score.total);
      const isWeakest = topic === weakest[0];
      const row = document.createElement('div'); row.className = `topic-row${isWeakest ? ' is-weakest' : ''}${topic === selectedStudyTopic ? ' is-selected' : ''}`;
      row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-pressed', String(topic === selectedStudyTopic));
      row.setAttribute('aria-label', `Show study material for ${topic}; ${percent}% accuracy across ${score.total} checks`);
      const selectTopic = () => { selectedStudyTopic = topic; list.querySelectorAll('.topic-row').forEach((item) => item.setAttribute('aria-pressed', String(item === row))); list.querySelectorAll('.topic-row').forEach((item) => item.classList.toggle('is-selected', item === row)); showStudyMaterial(topic, score, isWeakest); };
      row.addEventListener('click', selectTopic);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTopic(); } });
      const topicName = addText(row, 'span', 'topic-name', topic);
      if (isWeakest) addText(topicName, 'span', 'weak-topic-badge', 'FOCUS');
      const track = document.createElement('div'); track.className = 'topic-track'; track.setAttribute('role', 'img'); track.setAttribute('aria-label', `${topic}: ${percent}% accuracy`);
      const fill = document.createElement('div'); fill.className = 'topic-fill'; fill.style.width = `${percent}%`; track.appendChild(fill); row.appendChild(track);
      addText(row, 'span', 'topic-score', `${percent}% · ${score.total} ${score.total === 1 ? 'check' : 'checks'}`); list.appendChild(row);
    });
    const topicToShow = topics.has(selectedStudyTopic) ? selectedStudyTopic : weakest[0];
    selectedStudyTopic = topicToShow;
    showStudyMaterial(topicToShow, topics.get(topicToShow), topicToShow === weakest[0]);
  }

  window.mathTutorRegisterSymbolicAnswer = (context) => { symbolicAnswerCheck = context; };

  // Linear equation parser: each subexpression is represented as ax + b.
  function parseLinear(source) {
    const compact = source.replace(/\s+/g, '').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
    const tokens = compact.match(/\d+(?:\.\d+)?|[A-Za-z]|[()+\-*/]/g) || [];
    if (!compact || tokens.join('') !== compact) throw new Error('Use numbers, x, +, −, ×, ÷, and parentheses.');
    let i = 0; const peek = () => tokens[i];
    const factorStart = (t) => t === '(' || t === 'x' || /^\d/.test(t || '');
    function primary() {
      const t = peek();
      if (t === '+') { i++; return primary(); }
      if (t === '-') { i++; const v = primary(); return { a: -v.a, b: -v.b }; }
      if (t === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('Add a closing parenthesis.'); i++; return v; }
      if (t === 'x') { i++; return { a: 1, b: 0 }; }
      if (/^\d/.test(t || '')) { i++; return { a: 0, b: Number(t) }; }
      throw new Error('The expression is incomplete or contains an unsupported symbol.');
    }
    function term() {
      let v = primary();
      while (true) {
        let op = peek(); if (op === '*' || op === '/') i++; else if (factorStart(op)) op = '*'; else break;
        const w = primary();
        if (op === '*') { if (v.a && w.a) throw new Error('The equation solver currently supports linear equations only.'); v = { a: v.a * w.b + w.a * v.b, b: v.b * w.b }; }
        else { if (w.a || !w.b) throw new Error('Division by zero or a variable expression is not supported.'); v = { a: v.a / w.b, b: v.b / w.b }; }
      }
      return v;
    }
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const sign = tokens[i++] === '+' ? 1 : -1, w = term(); v = { a: v.a + sign * w.a, b: v.b + sign * w.b }; } return v; }
    const value = expr(); if (i !== tokens.length) throw new Error(`Unexpected symbol “${peek()}”.`); return value;
  }

  function solveExpression(source) {
    const parts = source.split('=');
    if (parts.length > 2) throw new Error('Use only one equals sign.');
    if (parts.length === 1) {
      const v = parseLinear(source); if (v.a) throw new Error('Add “= something” to solve for x.');
      return { kind: 'value', answer: clean(v.b), numeric: v.b, steps: [['01', `Evaluate ${source.trim()}`], ['02', `Result: ${clean(v.b)}`]] };
    }
    const left = parseLinear(parts[0]), right = parseLinear(parts[1]);
    const coefficient = left.a - right.a, constant = right.b - left.b;
    if (Math.abs(coefficient) < 1e-12) throw new Error(Math.abs(constant) < 1e-12 ? 'Both sides are equal for every value of x.' : 'This equation has no solution.');
    const value = constant / coefficient;
    return { kind: 'equation', answer: `x = ${clean(value)}`, numeric: value, steps: [['01', `Start with ${source.trim()}`], ['02', `Collect x terms: ${clean(coefficient)}x = ${clean(constant)}`], ['03', `Divide both sides by ${clean(coefficient)}`], ['04', `Therefore, x = ${clean(value)}`]] };
  }

  function hideSolution() { resultState.hidden = false; solutionOutput.hidden = true; solutionOutput.replaceChildren(); $('#workspaceActions').hidden = true; $('#plotControls').hidden = true; $('#plotChartWrap').hidden = true; currentResult = null; }
  function renderSolution(result, expression, save = true) {
    currentResult = result; currentExpression = expression; resultState.hidden = true; solutionOutput.replaceChildren();
    const row = document.createElement('div'); row.className = 'solution-answer'; addText(row, 'span', '', result.kind === 'equation' ? 'SOLUTION' : 'RESULT'); addText(row, 'strong', '', result.answer); solutionOutput.appendChild(row);
    result.steps.forEach(([n, line]) => { const step = document.createElement('div'); step.className = 'solution-step'; addText(step, 'b', '', n); addText(step, 'span', '', line); solutionOutput.appendChild(step); });
    solutionOutput.hidden = false; $('#workspaceActions').hidden = false; $('#plotControls').hidden = false; $('#plotChartWrap').hidden = true;
    $('#plotStatus').textContent = 'Plot the expression or compare both sides of an equation.';
    if (save) addHistory(expression, result.answer);
  }
  function drawEquationPlot(plotData, svg = $('#equationPlot'), legend = $('#plotLegend')) {
    const NS = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs = {}, text = '') => {
      const element = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
      if (text) element.textContent = text;
      return element;
    };
    svg.replaceChildren(); legend.replaceChildren();
    const width = 720, height = 390, left = 58, right = 20, top = 18, bottom = 42;
    const chartWidth = width - left - right, chartHeight = height - top - bottom;
    const xMin = plotData.x[0], xMax = plotData.x[plotData.x.length - 1];
    const finiteValues = plotData.series.flatMap((curve) => curve.values.filter(Number.isFinite)).sort((a, b) => a - b);
    let yMin = finiteValues[Math.floor((finiteValues.length - 1) * 0.03)];
    let yMax = finiteValues[Math.ceil((finiteValues.length - 1) * 0.97)];
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const padding = (yMax - yMin) * 0.08;
    yMin -= padding; yMax += padding;
    const xPos = (x) => left + (x - xMin) / (xMax - xMin) * chartWidth;
    const yPos = (y) => top + (yMax - y) / (yMax - yMin) * chartHeight;
    for (let index = 0; index <= 4; index++) {
      const x = left + chartWidth * index / 4;
      const y = top + chartHeight * index / 4;
      const xValue = xMin + (xMax - xMin) * index / 4;
      const yValue = yMax - (yMax - yMin) * index / 4;
      svg.append(make('line', { x1: x, y1: top, x2: x, y2: height - bottom, class: 'plot-gridline' }));
      svg.append(make('line', { x1: left, y1: y, x2: width - right, y2: y, class: 'plot-gridline' }));
      svg.append(make('text', { x, y: height - 15, 'text-anchor': 'middle', class: 'plot-tick' }, Number(xValue.toPrecision(3)).toString()));
      svg.append(make('text', { x: left - 9, y: y + 3, 'text-anchor': 'end', class: 'plot-tick' }, Number(yValue.toPrecision(3)).toString()));
    }
    if (xMin <= 0 && xMax >= 0) svg.append(make('line', { x1: xPos(0), y1: top, x2: xPos(0), y2: height - bottom, class: 'plot-axis' }));
    if (yMin <= 0 && yMax >= 0) svg.append(make('line', { x1: left, y1: yPos(0), x2: width - right, y2: yPos(0), class: 'plot-axis' }));
    const colors = ['#365fce', '#df795d'];
    plotData.series.forEach((curve, curveIndex) => {
      let path = '', drawing = false;
      curve.values.forEach((value, index) => {
        if (!Number.isFinite(value)) { drawing = false; return; }
        const x = xPos(plotData.x[index]);
        const y = yPos(Math.max(yMin, Math.min(yMax, value)));
        path += `${drawing ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
        drawing = true;
      });
      svg.append(make('path', { d: path.trim(), fill: 'none', stroke: colors[curveIndex % colors.length], 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const item = document.createElement('span'); item.className = 'plot-legend-item';
      const swatch = document.createElement('i'); swatch.style.backgroundColor = colors[curveIndex % colors.length];
      const label = document.createElement('span'); label.textContent = curve.label;
      item.append(swatch, label); legend.appendChild(item);
    });
    svg.setAttribute('aria-label', plotData.series.length === 2 ? 'Graph comparing the two sides of the equation' : `Graph of ${plotData.series[0].label}`);
  }
  function drawContourPlot(plotData) {
    const svg = $('#equationPlot'), legend = $('#plotLegend');
    const NS = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs = {}, text = '') => { const node = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value))); if (text) node.textContent = text; return node; };
    svg.replaceChildren(); legend.replaceChildren();
    const width = 720, height = 390, left = 55, right = 20, top = 18, bottom = 42;
    const chartWidth = width - left - right, chartHeight = height - top - bottom;
    const xValues = plotData.x, yValues = plotData.y, zValues = plotData.z;
    const xMin = xValues[0], xMax = xValues.at(-1), yMin = yValues[0], yMax = yValues.at(-1);
    const xPos = (x) => left + (x - xMin) / (xMax - xMin) * chartWidth;
    const yPos = (y) => top + (yMax - y) / (yMax - yMin) * chartHeight;
    const magnitudes = zValues.flat().filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
    const scale = magnitudes[Math.floor((magnitudes.length - 1) * .95)] || 1;
    const color = (value) => {
      if (!Number.isFinite(value)) return '#e4e4df';
      const intensity = Math.min(1, Math.abs(value) / scale);
      const target = value < 0 ? [54, 95, 206] : [218, 113, 85];
      const base = [246, 245, 238];
      return `rgb(${base.map((channel, index) => Math.round(channel + (target[index] - channel) * intensity)).join(',')})`;
    };
    for (let row = 0; row < yValues.length - 1; row++) {
      for (let col = 0; col < xValues.length - 1; col++) {
        const values = [zValues[row][col], zValues[row][col + 1], zValues[row + 1][col + 1], zValues[row + 1][col]];
        const x = xPos(xValues[col]), y = yPos(yValues[row + 1]);
        const cellWidth = xPos(xValues[col + 1]) - x + .5, cellHeight = yPos(yValues[row]) - y + .5;
        const finite = values.filter(Number.isFinite);
        svg.append(make('rect', { x, y, width: cellWidth, height: cellHeight, fill: finite.length ? color(finite.reduce((sum, value) => sum + value, 0) / finite.length) : '#e4e4df' }));
        if (plotData.is_equation && values.every(Number.isFinite)) {
          const points = [
            [xValues[col], yValues[row], values[0]], [xValues[col + 1], yValues[row], values[1]],
            [xValues[col + 1], yValues[row + 1], values[2]], [xValues[col], yValues[row + 1], values[3]],
          ];
          const edges = [[0, 1], [1, 2], [2, 3], [3, 0]], crossings = [];
          edges.forEach(([a, b]) => {
            const va = points[a][2], vb = points[b][2];
            if ((va < 0 && vb > 0) || (va > 0 && vb < 0) || (va === 0 && vb !== 0) || (vb === 0 && va !== 0)) {
              const t = va === 0 ? 0 : vb === 0 ? 1 : va / (va - vb);
              crossings.push([points[a][0] + t * (points[b][0] - points[a][0]), points[a][1] + t * (points[b][1] - points[a][1])]);
            }
          });
          const pairs = crossings.length === 4 ? [[0, 1], [2, 3]] : crossings.length === 2 ? [[0, 1]] : [];
          pairs.forEach(([a, b]) => svg.append(make('line', { x1: xPos(crossings[a][0]), y1: yPos(crossings[a][1]), x2: xPos(crossings[b][0]), y2: yPos(crossings[b][1]), class: 'contour-zero' })));
        }
      }
    }
    for (let tick = 0; tick <= 4; tick++) {
      const xv = xMin + (xMax - xMin) * tick / 4, yv = yMin + (yMax - yMin) * tick / 4;
      svg.append(make('text', { x: xPos(xv), y: height - 14, 'text-anchor': 'middle', class: 'plot-tick' }, Number(xv.toPrecision(3)).toString()));
      svg.append(make('text', { x: left - 8, y: yPos(yv) + 3, 'text-anchor': 'end', class: 'plot-tick' }, Number(yv.toPrecision(3)).toString()));
    }
    svg.append(make('text', { x: width - right, y: height - 14, 'text-anchor': 'end', class: 'plot-axis-label' }, plotData.x_variable));
    svg.append(make('text', { x: left, y: top - 5, 'text-anchor': 'start', class: 'plot-axis-label' }, plotData.y_variable));
    const caption = document.createElement('span'); caption.className = 'plot-legend-item';
    const swatch = document.createElement('i'); swatch.className = 'plot-color-scale';
    const label = document.createElement('span'); label.textContent = plotData.is_equation ? `Color shows ${plotData.label}; dark contour is the zero set` : plotData.label;
    caption.append(swatch, label); legend.appendChild(caption);
    svg.setAttribute('aria-label', `Two-variable contour plot of ${plotData.label}`);
  }
  $('#plotMode').addEventListener('change', () => {
    document.querySelectorAll('.plot-y-control').forEach((control) => { control.hidden = $('#plotMode').value !== 'contour'; });
    $('#plotStatus').textContent = $('#plotMode').value === 'contour'
      ? 'Two-variable expressions show as a contour map; equations show their zero contour.'
      : 'Expressions plot as curves; equation sides are shown for comparison.';
  });
  $('#plotButton').addEventListener('click', async () => {
    const button = $('#plotButton');
    const expression = expressionInput.value.trim();
    if (!expression) { $('#plotStatus').textContent = 'Enter and solve an expression first.'; return; }
    button.disabled = true; $('#plotStatus').textContent = 'Plotting with SymPy…';
    try {
      const contour = $('#plotMode').value === 'contour';
      const response = await fetch(contour ? '/plot-surface' : '/plot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contour
          ? { expression, x_variable: $('#plotVariable').value.trim() || 'x', y_variable: $('#plotYVariable').value.trim() || 'y', x_min: Number($('#plotXMin').value), x_max: Number($('#plotXMax').value), y_min: Number($('#plotYMin').value), y_max: Number($('#plotYMax').value), samples: 41 }
          : { expression, variable: $('#plotVariable').value.trim() || 'x', x_min: Number($('#plotXMin').value), x_max: Number($('#plotXMax').value), samples: 241 }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || `Plot failed (${response.status}).`);
      if (contour) drawContourPlot(result); else drawEquationPlot(result);
      $('#plotChartWrap').hidden = false;
      $('#plotStatus').textContent = contour
        ? result.is_equation ? 'The dark contour marks points where both sides are equal.' : 'Color indicates the relative expression value across x and y.'
        : result.series.length === 2 ? 'Both sides are plotted; their intersections are solutions.' : 'Expression plotted over the selected x-range.';
    } catch (error) {
      $('#plotChartWrap').hidden = true;
      $('#plotStatus').textContent = error.message || 'Could not plot this expression.';
    } finally { button.disabled = false; }
  });
  async function solve() {
    const expression = expressionInput.value.trim();
    if (!expression) { resultState.hidden = false; resultState.querySelector('p').textContent = 'Enter a question to see its solution.'; return; }
    try {
      renderSolution(solveExpression(expression), expression);
      return;
    } catch (_) {
      // Keep the local line-by-line method for basic equations; send broader
      // polynomial and multivariable systems to the local SymPy engine.
    }
    try {
      const response = await fetch('/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression, operation: 'solve' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || `Solver request failed (${response.status}).`);
      const steps = (result.steps || []).map((line, index) => [String(index + 1).padStart(2, '0'), line]);
      renderSolution({ kind: 'equation', answer: result.text, steps }, expression);
    } catch (error) {
      resultState.hidden = true;
      solutionOutput.replaceChildren();
      addText(solutionOutput, 'p', 'solution-error', error.message || 'Could not solve this expression.');
      solutionOutput.hidden = false;
      $('#workspaceActions').hidden = true;
      $('#plotControls').hidden = true; $('#plotChartWrap').hidden = true;
    }
  }
  window.mathTutorSolve = solve;
  $('#solveButton').addEventListener('click', () => {
    if (!$('#typedProblemFlow').hidden) {
      // Older mistake entries can contain a derivative in the calculator's
      // internal notation. Route it through the calculus transcription solver.
      const derivativeLatex = savedDerivativeToLatex(expressionInput.value.trim());
      if (derivativeLatex) {
        document.querySelector('[data-entry-mode="image"]').click();
        $('#latexInput').value = derivativeLatex;
        $('#latexInput').dispatchEvent(new Event('input', { bubbles: true }));
        if (window.mathTutorSolveTranscription) window.mathTutorSolveTranscription();
        else $('#recognizerStatus').textContent = 'The calculus solver is still loading. Try again in a moment.';
        return;
      }
      solve();
      return;
    }
    if (!$('#latexInput').value.trim()) {
      $('#recognizerStatus').textContent = 'Upload and read a problem image first.';
      return;
    }
    if (window.mathTutorSolveTranscription) window.mathTutorSolveTranscription();
    else $('#recognizerStatus').textContent = 'The transcription solver is still loading. Try again in a moment.';
  });
  expressionInput.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') solve(); });
  document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => { expressionInput.value = button.dataset.example; expressionInput.focus(); hideSolution(); }));

  const imagePicker = $('#problemImageInput');
  $('#uploadProblemImage').addEventListener('click', () => imagePicker.click());
  imagePicker.addEventListener('change', () => {
    const file = imagePicker.files && imagePicker.files[0]; if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { imagePicker.value = ''; window.alert('Choose a PNG, JPG, or WEBP image.'); return; }
    if (file.size > 12 * 1024 * 1024) { imagePicker.value = ''; window.alert('Choose an image smaller than 12 MB.'); return; }
    if (problemImageUrl) URL.revokeObjectURL(problemImageUrl);
    problemImageUrl = URL.createObjectURL(file);
    $('#problemImagePreview').src = problemImageUrl;
    $('#imageFileName').textContent = file.name;
    $('#imagePreview').hidden = false;
    $('#imageInputCard').classList.add('has-image');
  });
  $('#removeProblemImage').addEventListener('click', () => {
    if (problemImageUrl) URL.revokeObjectURL(problemImageUrl);
    problemImageUrl = null; imagePicker.value = ''; $('#problemImagePreview').removeAttribute('src');
    $('#imagePreview').hidden = true; $('#imageInputCard').classList.remove('has-image');
  });

  function formatSigned(value) { return value < 0 ? ' − ' + Math.abs(value) : ' + ' + value; }
  function polynomialDegree(source) {
    const powers = [...source.matchAll(/x\s*(?:\^|\*\*)\s*\{?\s*(\d+)/gi)].map((match) => Number(match[1]));
    if (/x³/i.test(source)) powers.push(3);
    if (/x²/i.test(source)) powers.push(2);
    return powers.length ? Math.max(...powers) : 0;
  }
  function makePolynomialPractice(sourceDegree, level) {
    const degree = Math.min(3, Math.max(sourceDegree, level >= 3 ? 3 : 2));
    const minRoot = level === 1 ? 1 : level === 2 ? -4 : -8;
    const maxRoot = level === 1 ? 5 : level === 2 ? 7 : 10;
    const roots = [];
    while (roots.length < degree) {
      const root = minRoot + Math.floor(Math.random() * (maxRoot - minRoot + 1));
      if (!roots.includes(root)) roots.push(root);
    }
    const coefficients = degree === 2
      ? [1, -(roots[0] + roots[1]), roots[0] * roots[1]]
      : [
          1,
          -roots.reduce((sum, root) => sum + root, 0),
          roots.reduce((sum, root, index) => sum + roots.slice(index + 1).reduce((pairs, next) => pairs + root * next, 0), 0),
          -roots.reduce((product, root) => product * root, 1),
        ];
    let expression = `x^${degree}`;
    for (let index = 1; index < coefficients.length; index++) {
      const coefficient = coefficients[index];
      if (!coefficient) continue;
      const power = degree - index;
      expression += formatSigned(coefficient) + (power === 0 ? '' : power === 1 ? 'x' : `x^${power}`);
    }
    return `${expression} = 0`;
  }
  $('#generatePractice').addEventListener('click', async (event) => {
    const generateButton = event.currentTarget;
    generateButton.disabled = true;
    let recommendation = { difficulty: 1, message: 'Starting with level 1 practice.' };
    const attempts = history.filter((item) => item.checked).map((item) => ({
      expression: item.expression,
      correct: /correct/i.test(item.checked) && !/incorrect/i.test(item.checked),
    }));
    try {
      const response = await fetch('/learning/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempts }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Recommendation unavailable.');
      recommendation = payload;
    } catch (_) {
      recommendation.message = 'Personalized practice is unavailable right now; starting with an easier question.';
    } finally {
      generateButton.disabled = false;
    }
    const level = Math.min(3, Math.max(1, Number(recommendation.difficulty) || 1));
    const source = expressionInput.value.trim() || history[0]?.expression || '';
    const sourceDegree = polynomialDegree(source);
    let question;
    if (sourceDegree >= 2) {
      question = makePolynomialPractice(sourceDegree, level);
    } else {
      let keepOffset = true;
      try {
        if (source.includes('=')) keepOffset = Math.abs(parseLinear(source.split('=')[0]).b) > 1e-9;
      } catch (_) { /* Use a standard linear-equation practice item for unsupported input. */ }
      const coefficient = 2 + Math.floor(Math.random() * 8);
      const solution = 1 + Math.floor(Math.random() * 12);
      const offset = keepOffset ? (Math.random() < .5 ? -1 : 1) * (1 + Math.floor(Math.random() * 12)) : 0;
      const right = coefficient * solution + offset;
      const offsetText = offset === 0 ? '' : ` ${offset < 0 ? '−' : '+'} ${Math.abs(offset)}`;
      question = `${coefficient}x${offsetText} = ${right}`;
      if (level === 2) {
        const leftCoefficient = 2 + Math.floor(Math.random() * 7);
        let rightCoefficient = 1 + Math.floor(Math.random() * 8);
        while (rightCoefficient === leftCoefficient) rightCoefficient = 1 + Math.floor(Math.random() * 8);
        const leftOffset = Math.floor(Math.random() * 13) - 6;
        const rightOffset = (leftCoefficient - rightCoefficient) * solution + leftOffset;
        question = leftCoefficient + 'x' + formatSigned(leftOffset) + ' = ' + rightCoefficient + 'x' + formatSigned(rightOffset);
      } else if (level === 3) {
        const fractionCoefficient = 2 + Math.floor(Math.random() * 8);
        const denominator = 2 + Math.floor(Math.random() * 4);
        const fractionRight = 1 + Math.floor(Math.random() * 12);
        const fractionOffset = denominator * fractionRight - fractionCoefficient * solution;
        question = '(' + fractionCoefficient + 'x' + formatSigned(fractionOffset) + ') / ' + denominator + ' = ' + fractionRight;
      }
    }
    expressionInput.value = question; hideSolution();
    document.querySelector('[data-entry-mode="type"]').click();
    $('#practiceMessage').textContent = recommendation.message + ' Solve the new question and check your answer to update the learning sequence.';
    $('#answerAttempt').value = '';
    expressionInput.focus();
  });

  function addHistory(expression, answer, checked = '') {
    if (!expression) return;
    const duplicate = history.findIndex((item) => item.expression === expression);
    if (duplicate >= 0) history.splice(duplicate, 1);
    history.unshift({ id: Date.now() + Math.random(), expression, answer, checked, date: new Date().toISOString() });
    history = history.slice(0, 60); persist(STORAGE.history, history); renderHistory();
  }
  function savedDerivativeToLatex(source) {
    const compact = source.replace(/\s+/g, '');
    const match = compact.match(/^\(?d\)?\/\(?d\*?([A-Za-z])\)?(?:\[([\s\S]+)\]|\(([\s\S]+)\))$/);
    if (!match) return null;
    let operand = match[2] || match[3];
    const greek = { alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', theta: '\\theta', lambda: '\\lambda', mu: '\\mu', omega: '\\omega' };
    Object.entries(greek).forEach(([name, command]) => { operand = operand.replace(new RegExp(`\\b${name}\\b`, 'g'), command); });
    operand = operand.replace(/\*\*\(([^()]+)\)/g, '^{$1}').replace(/\*\*([A-Za-z0-9]+)/g, '^{$1}');
    operand = operand.replace(/sqrt\(([^()]*)\)/g, '\\sqrt{$1}').replace(/\*/g, ' ');
    return `\\frac{d}{d${match[1]}}\\left[${operand}\\right]`;
  }
  function reviewSavedQuestion(expression) {
    if (window.location.hash !== '#workspace') window.history.pushState({ page: 'workspace' }, '', '#workspace');
    setPage('workspace');
    const derivativeLatex = savedDerivativeToLatex(expression);
    const questionSource = derivativeLatex || expression;
    const needsMathFlow = !!derivativeLatex || /\\frac\s*\{\s*d\b|\b(?:sin|cos|tan|asin|acos|atan|sqrt|log|ln|exp)\s*\(/i.test(questionSource);
    if (needsMathFlow) {
      document.querySelector('[data-entry-mode="image"]').click();
      symbolicAnswerCheck = null; activeSymbolicAnswerCheck = null; currentResult = null;
      $('#latexInput').value = questionSource;
      $('#latexInput').dispatchEvent(new Event('input', { bubbles: true }));
      $('#recognizerStatus').textContent = 'Reopening this saved math question…';
      $('#workspace').scrollIntoView({ behavior: 'smooth' });
      if (window.mathTutorSolveTranscription) window.mathTutorSolveTranscription();
      else $('#recognizerStatus').textContent = 'The transcription solver is still loading. Try again in a moment.';
      return;
    }
    document.querySelector('[data-entry-mode="type"]').click();
    expressionInput.value = expression;
    $('#workspace').scrollIntoView({ behavior: 'smooth' });
    solve();
  }
  function renderHistory() {
    historyList.replaceChildren();
    if (!history.length) { addText(historyList, 'p', 'history-empty', 'Your solved questions will appear here.'); return; }
    history.forEach((item, index) => {
      const row = document.createElement('article'); row.className = 'history-row';
      addText(row, 'span', 'history-row-number', String(index + 1).padStart(2, '0'));
      const content = document.createElement('div'); addText(content, 'div', 'history-row-expression', item.expression); addText(content, 'div', 'history-row-answer', `${item.answer}${item.checked ? ` · ${item.checked}` : ''}`); row.appendChild(content);
      const reopen = document.createElement('button'); reopen.type = 'button'; reopen.className = 'history-reopen'; reopen.setAttribute('aria-label', `Reopen ${item.expression}`); reopen.textContent = '↗'; reopen.addEventListener('click', () => reviewSavedQuestion(item.expression)); row.appendChild(reopen); historyList.appendChild(row);
    });
  }
  $('#clearHistory').addEventListener('click', () => { history = []; answerAttempts = []; persist(STORAGE.history, history); persist(STORAGE.attempts, answerAttempts); renderHistory(); renderProgress(); });

  function addMistake(expression, answer, attempted = '', learned = false) {
    if (!expression) return;
    const found = mistakes.find((m) => m.expression === expression);
    if (found) { found.answer = answer; found.attempted = attempted || found.attempted; found.learned = learned ? true : false; found.updatedAt = new Date().toISOString(); }
    else mistakes.unshift({ id: Date.now() + Math.random(), expression, answer, attempted, learned, updatedAt: new Date().toISOString() });
    mistakes = mistakes.slice(0, 80); persist(STORAGE.mistakes, mistakes); renderMistakes();
  }
  function renderMistakes() {
    mistakeList.replaceChildren();
    const shown = mistakes.filter((m) => mistakeFilter === 'all' || (mistakeFilter === 'learned' ? m.learned : !m.learned));
    if (!shown.length) { addText(mistakeList, 'p', 'history-empty', mistakes.length ? 'Nothing in this filter yet.' : 'Questions you want to revisit will collect here.'); return; }
    shown.forEach((item) => {
      const card = document.createElement('article'); card.className = `mistake-card${item.learned ? ' is-learned' : ''}`;
      addText(card, 'div', 'mistake-expression', item.expression); addText(card, 'div', 'mistake-answer', `Answer: ${item.answer}`);
      if (item.attempted) addText(card, 'div', 'mistake-attempt', `Your attempt: ${item.attempted}`);
      const actions = document.createElement('div'); actions.className = 'mistake-actions';
      const open = addText(actions, 'button', 'mistake-action', 'Review question'); open.type = 'button'; open.addEventListener('click', () => reviewSavedQuestion(item.expression));
      const learn = addText(actions, 'button', 'mistake-action', item.learned ? 'Mark to review' : 'Mark reviewed'); learn.type = 'button'; learn.addEventListener('click', () => { item.learned = !item.learned; persist(STORAGE.mistakes, mistakes); renderMistakes(); });
      const remove = addText(actions, 'button', 'mistake-action mistake-remove', 'Remove'); remove.type = 'button'; remove.addEventListener('click', () => { mistakes = mistakes.filter((m) => m.id !== item.id); persist(STORAGE.mistakes, mistakes); renderMistakes(); });
      card.appendChild(actions); mistakeList.appendChild(card);
    });
  }
  $('#clearMistakes').addEventListener('click', () => { mistakes = []; persist(STORAGE.mistakes, mistakes); renderMistakes(); });
  document.querySelectorAll('.mistake-filter').forEach((button) => button.addEventListener('click', () => { mistakeFilter = button.dataset.filter; document.querySelectorAll('.mistake-filter').forEach((b) => b.classList.toggle('is-active', b === button)); renderMistakes(); }));

  const answerKeys = [
    ['√', '\\sqrt{}', 6], ['a⁄b', '\\frac{}{}', 6], ['xⁿ', '^{}', 2], ['xₙ', '_{}', 2],
    ['sin', '\\sin()', 5], ['cos', '\\cos()', 5], ['tan', '\\tan()', 5], ['log', '\\log()', 5], ['ln', '\\ln()', 4],
    ['∫', '\\int '], ['d/dx', '\\frac{d}{dx}'], ['π', '\\pi '], ['+', '+'], ['−', '-'], ['×', '\\times '], ['÷', '\\div '],
    ['(', '('], [')', ')'], ['=', '='], ['x', 'x'], ['y', 'y'],
    ...Array.from({ length: 10 }, (_, index) => [String(index), String(index)]), ['.', '.'],
  ];
  const answerCorrectionGrid = $('#answerCorrectionGrid');
  const questionCorrectionGrid = $('#questionCorrectionGrid');
  function renderLatexPreview(source, preview, emptyLabel) {
    preview.classList.remove('has-preview-error');
    preview.replaceChildren();
    if (!source.trim()) { addText(preview, 'span', '', emptyLabel); return; }
    if (window.katex) {
      try { window.katex.render(source, preview, { throwOnError: true, displayMode: true }); }
      catch (_) { preview.textContent = 'Check the LaTeX syntax.'; preview.classList.add('has-preview-error'); return; }
    } else preview.textContent = source;
  }
  function updateAnswerPreview() {
    renderLatexPreview($('#answerAttempt').value, $('#answerLatexPreview'), 'Live answer preview');
  }
  function populateCorrectionKeys(grid, input, refresh) {
    answerKeys.forEach(([label, value, caret]) => {
      const key = document.createElement('button'); key.type = 'button'; key.textContent = label;
      key.addEventListener('click', () => {
        const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
        input.setRangeText(value, start, end, 'end');
        if (caret !== undefined) input.setSelectionRange(start + caret, start + caret);
        input.focus(); input.dispatchEvent(new Event('input', { bubbles: true }));
        if (refresh) refresh();
      });
      grid.appendChild(key);
    });
  }
  populateCorrectionKeys(answerCorrectionGrid, $('#answerAttempt'));
  populateCorrectionKeys(questionCorrectionGrid, $('#checkerQuestionLatex'), () => updateQuestionPreview());
  $('#answerAttempt').addEventListener('input', updateAnswerPreview);
  function updateQuestionPreview() {
    renderLatexPreview($('#checkerQuestionLatex').value, $('#checkerQuestionPreview'), 'Live question preview');
  }
  $('#checkerQuestionLatex').addEventListener('input', updateQuestionPreview);
  updateAnswerPreview();

  const modal = $('#checkerModal');
  async function deriveImageSymbolicAnswer(question) {
    if (!window.mathTutorLatexToExpression) return null;
    let expression;
    try { expression = window.mathTutorLatexToExpression(question); } catch (_) { return null; }
    const definition = expression.match(/^\s*(?:y|[A-Za-z]\s*\(\s*([A-Za-z])\s*\))\s*=\s*(.+)$/i);
    if (!definition) return null;
    const variable = definition[1] || 'x';
    const differentiand = definition[2].split('=').map((part) => part.trim()).filter(Boolean).at(-1);
    try {
      const response = await fetch('/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: differentiand, operation: 'diff', variable }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return null;
      return {
        question,
        expected: result.text,
        answer: result.text,
        answerLatex: result.latex,
        steps: [
          { title: `Differentiate the right-hand side with respect to ${variable}.`, math: `\\frac{d}{d${variable}}\\left(${differentiand}\\right)` },
          { title: 'Apply the differentiation rules and simplify.', math: `=${result.latex}` },
        ],
      };
    } catch (_) { return null; }
  }

  async function openChecker(options = {}) {
    const imageMode = !$('#imageProblemFlow').hidden;
    const recognizedQuestion = $('#latexInput').value.trim();
    const typedQuestion = expressionInput.value.trim();
    const displayedQuestion = imageMode
      ? recognizedQuestion || typedQuestion || symbolicAnswerCheck?.question || ''
      : typedQuestion || recognizedQuestion || symbolicAnswerCheck?.question || '';
    activeSymbolicAnswerCheck = symbolicAnswerCheck &&
      (symbolicAnswerCheck.question === displayedQuestion || (!recognizedQuestion && !typedQuestion))
      ? symbolicAnswerCheck
      : null;
    if (imageMode && displayedQuestion && !activeSymbolicAnswerCheck) {
      $('#checkerQuestionLatex').value = displayedQuestion;
      updateQuestionPreview();
      $('#checkerFeedback').textContent = 'Preparing the answer checker from this transcription…';
      $('#checkerFeedback').className = 'checker-feedback';
      $('#submitAttempt').disabled = true;
      $('#modalShowSolution').disabled = true;
      $('#modalSolution').hidden = true;
      if (!modal.open) modal.showModal();
      activeSymbolicAnswerCheck = await deriveImageSymbolicAnswer(displayedQuestion);
      if (activeSymbolicAnswerCheck) symbolicAnswerCheck = activeSymbolicAnswerCheck;
      if (!modal.open) return;
    }
    let expression = expressionInput.value.trim();
    if (imageMode && displayedQuestion && window.mathTutorLatexToExpression) {
      try { expression = window.mathTutorLatexToExpression(displayedQuestion); } catch (_) { expression = ''; }
    }
    if (activeSymbolicAnswerCheck) {
      currentResult = null;
      currentExpression = expression || displayedQuestion;
    } else if (expression && (!currentResult || currentExpression !== expression)) {
      try { currentResult = solveExpression(expression); currentExpression = expression; }
      catch (_) { currentResult = null; currentExpression = expression; }
    } else if (!expression) {
      currentResult = null;
      currentExpression = '';
    }
    if (!options.preserveAnswer) {
      if (answerImageUrl) URL.revokeObjectURL(answerImageUrl);
      answerImageUrl = null; answerImageInput.value = ''; $('#answerImagePreviewImg').removeAttribute('src'); $('#answerImagePreview').hidden = true;
      $('#answerImageStatus').textContent = '';
      $('#answerAttempt').value = '';
      $('#answerAttempt').dispatchEvent(new Event('input', { bubbles: true }));
    }
    $('#checkerQuestionLatex').value = displayedQuestion || expression || '';
    updateQuestionPreview();
    const canCheckNumerically = Number.isFinite(currentResult?.numeric);
    const canCheckSymbolically = !canCheckNumerically && !!activeSymbolicAnswerCheck;
    $('#submitAttempt').disabled = !(canCheckNumerically || canCheckSymbolically);
    $('#modalShowSolution').disabled = !currentResult && !activeSymbolicAnswerCheck;
    $('#checkerFeedback').textContent = canCheckSymbolically
      ? 'Enter an equivalent final expression, such as atan(2x) + 2x/(1 + 4x^2), or upload a photo.'
      : canCheckNumerically
        ? 'Enter your final answer or upload a photo to transcribe it.'
      : currentResult
        ? 'Automatic checking is available for numeric results in this prototype. Review the worked solution for this question.'
        : displayedQuestion
          ? 'This question is not supported by automatic answer checking yet. Review the solution or enter a supported equation in Workspace.'
          : 'No question is selected. Close this checker, enter or recognize a problem in Workspace, then open Check my answer.';
    $('#checkerFeedback').className = 'checker-feedback'; $('#modalSolution').hidden = true;
    if (!modal.open) modal.showModal();
    $('#answerAttempt').focus();
  }
  $('#openChecker').addEventListener('click', openChecker); $('#workspaceCheck').addEventListener('click', openChecker);
  $('#applyQuestionCorrection').addEventListener('click', async () => {
    const latex = $('#checkerQuestionLatex').value.trim();
    const feedback = $('#checkerQuestionImageStatus');
    if (!latex) { feedback.textContent = 'Enter or upload a question first.'; return; }
    const button = $('#applyQuestionCorrection'); button.disabled = true;
    $('#submitAttempt').disabled = true; $('#modalShowSolution').disabled = true;
    feedback.textContent = 'Recalculating from the corrected question…';
    try {
      setPage('workspace');
      document.querySelector('[data-entry-mode="image"]').click();
      $('#latexInput').value = latex;
      $('#latexInput').dispatchEvent(new Event('input', { bubbles: true }));
      symbolicAnswerCheck = null; activeSymbolicAnswerCheck = null; currentResult = null;
      if (!window.mathTutorSolveTranscription) throw new Error('The solver is still loading. Try again in a moment.');
      await window.mathTutorSolveTranscription();
      const solveError = $('#solutionOutput .solution-error');
      if (solveError) throw new Error(solveError.textContent);
      feedback.textContent = 'Corrected question applied.';
      await openChecker({ preserveAnswer: true });
    } catch (error) {
      feedback.textContent = error.message || 'Could not solve the corrected question.';
      $('#checkerFeedback').textContent = feedback.textContent;
      $('#submitAttempt').disabled = true; $('#modalShowSolution').disabled = true;
    } finally { button.disabled = false; }
  });
  function showModalSolution() {
    const box = $('#modalSolution'); box.replaceChildren();
    if (activeSymbolicAnswerCheck) {
      const answer = document.createElement('strong');
      if (window.katex && activeSymbolicAnswerCheck.answerLatex) window.katex.render(`\\text{Worked answer: }${activeSymbolicAnswerCheck.answerLatex}`, answer, { throwOnError: false });
      else answer.textContent = `Worked answer: ${activeSymbolicAnswerCheck.answer}`;
      box.appendChild(answer);
      activeSymbolicAnswerCheck.steps.forEach((step, index) => {
        const item = typeof step === 'string' ? { title: step } : step;
        const row = addText(box, 'div', 'modal-solution-step', `${String(index + 1).padStart(2, '0')}  ${item.title}`);
        if (item.math) {
          const math = addText(box, 'div', 'modal-solution-math', '');
          if (window.katex) window.katex.render(item.math, math, { throwOnError: false, displayMode: true });
          else math.textContent = item.math;
          row.appendChild(math);
        }
      });
    } else if (currentResult) {
      addText(box, 'strong', '', `Worked answer: ${currentResult.answer}`);
      currentResult.steps.forEach((step, index) => addText(box, 'div', 'modal-solution-step', `${String(index + 1).padStart(2, '0')}  ${step[1]}`));
    } else return;
    box.hidden = false;
    requestAnimationFrame(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }
  $('#modalShowSolution').addEventListener('click', showModalSolution);
  $('#submitAttempt').addEventListener('click', () => {
    checkAttempt();
  });
  async function checkAttempt() {
    const numericCheck = !activeSymbolicAnswerCheck && Number.isFinite(currentResult?.numeric);
    if (!numericCheck && !activeSymbolicAnswerCheck) { $('#checkerFeedback').textContent = 'This result cannot be compared automatically yet. Review the worked solution.'; return; }
    const input = $('#answerAttempt').value.trim(); if (!input) { $('#checkerFeedback').textContent = 'Enter or upload an answer first.'; return; }
    const button = $('#submitAttempt'); button.disabled = true;
    let attempt = NaN;
    let requestStarted = false;
    try {
      let expression = window.mathTutorLatexToExpression ? window.mathTutorLatexToExpression(input) : input;
      if (expression.includes('=')) expression = expression.slice(expression.lastIndexOf('=') + 1).trim();
      const payload = numericCheck
        ? { expression, operation: 'evaluate' }
        : { expected: activeSymbolicAnswerCheck.expected, actual: expression };
      requestStarted = true;
      const response = await fetch(numericCheck ? '/calculate' : '/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 422) throw new Error(result.detail || `Could not check your answer (${response.status}).`);
      if (response.status === 422) {
        attempt = 0;
      } else if (numericCheck && result.numeric !== null && result.numeric !== undefined) {
        attempt = Number(result.numeric);
      } else if (!numericCheck) attempt = result.equivalent ? 1 : 0;
    } catch (error) {
      if (requestStarted) {
        $('#checkerFeedback').textContent = error.message || 'The answer checker is unavailable. Please try again.';
        button.disabled = false;
        return;
      }
      // A non-empty expression the parser cannot understand is still not a
      // correct answer; let the normal incorrect-answer feedback handle it.
    }
    button.disabled = false;
    const expectedNumeric = currentResult?.numeric;
    const correct = numericCheck
      ? Number.isFinite(attempt) && Number.isFinite(expectedNumeric) && Math.abs(attempt - expectedNumeric) <= 1e-6 * Math.max(1, Math.abs(expectedNumeric))
      : attempt === 1;
    const feedback = $('#checkerFeedback'); feedback.className = `checker-feedback ${correct ? 'is-correct' : 'is-incorrect'}`;
    const checkedQuestion = activeSymbolicAnswerCheck?.question || currentExpression || '';
    const expectedAnswer = currentResult?.answer ?? activeSymbolicAnswerCheck?.answer ?? 'the worked solution';
    answerAttempts.unshift({ id: Date.now() + Math.random(), expression: checkedQuestion, correct, date: new Date().toISOString() });
    answerAttempts = answerAttempts.slice(0, 300); persist(STORAGE.attempts, answerAttempts); renderProgress();
    if (correct) { feedback.textContent = 'Correct. Your answer matches the worked result.'; addHistory(checkedQuestion, expectedAnswer, 'Your answer: correct'); }
    else {
      feedback.textContent = 'Incorrect. Your answer does not match. Try again, or choose Review solution to see the worked steps.';
      $('#modalSolution').hidden = true;
      addHistory(checkedQuestion, expectedAnswer, 'Needs review');
      addMistake(checkedQuestion, expectedAnswer, input);
    }
    if (correct) showModalSolution();
  }
  $('#checkStepsButton').addEventListener('click', async () => {
    const feedback = $('#stepCheckFeedback');
    const writtenWork = $('#studentWork').value.trim();
    if (/(?:\\frac\s*\{\s*d|\bd\s*\)?\s*\/\s*\(?\s*d|\\int|\\partial|\b(?:differentiate|integrate)\b)/i.test(writtenWork)) {
      feedback.className = 'step-check-feedback is-incorrect';
      feedback.textContent = 'This photo contains calculus notation. The current step checker can only validate one-variable linear-equation steps; it cannot check this derivative rule yet.';
      return;
    }
    let problem = expressionInput.value.trim();
    if (!$('#imageProblemFlow').hidden) {
      const latex = $('#latexInput').value.trim();
      try { problem = window.mathTutorLatexToExpression ? window.mathTutorLatexToExpression(latex) : latex; }
      catch (_) { problem = latex; }
    }
    if (!problem) { feedback.className = 'step-check-feedback is-incorrect'; feedback.textContent = 'The photo was transcribed, but no original question is loaded. Enter or recognize a one-variable linear equation in Workspace first.'; return; }
    feedback.className = 'step-check-feedback'; feedback.textContent = 'Checking your equation steps…';
    const button = $('#checkStepsButton'); button.disabled = true;
    try {
      const response = await fetch('/check-steps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problem, work: $('#studentWork').value }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || `Step check failed (${response.status}).`);
      feedback.className = `step-check-feedback ${result.correct ? 'is-correct' : 'is-incorrect'}`;
      feedback.textContent = result.message;
    } catch (error) {
      feedback.className = 'step-check-feedback is-incorrect'; feedback.textContent = error.message || 'Could not check these steps.';
    } finally { button.disabled = false; }
  });
  const studentWorkImageInput = $('#studentWorkImageInput');
  $('#chooseStudentWorkImage').addEventListener('click', () => studentWorkImageInput.click());
  studentWorkImageInput.addEventListener('change', async () => {
    const file = studentWorkImageInput.files?.[0];
    if (!file) return;
    const status = $('#studentWorkImageStatus');
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      status.textContent = 'Choose a PNG, JPG, or WEBP image.';
      studentWorkImageInput.value = '';
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      status.textContent = 'Choose an image smaller than 12 MB.';
      studentWorkImageInput.value = '';
      return;
    }
    if (studentWorkImageUrl) URL.revokeObjectURL(studentWorkImageUrl);
    studentWorkImageUrl = URL.createObjectURL(file);
    $('#studentWorkImagePreviewImg').src = studentWorkImageUrl;
    $('#studentWorkImagePreview').hidden = false;
    const uploadButton = $('#chooseStudentWorkImage');
    uploadButton.disabled = true;
    status.textContent = 'Reading your handwritten working…';
    const body = new FormData();
    body.append('image', file, file.name);
    try {
      const response = await fetch('/recognize', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Recognition failed (${response.status}).`);
      const latex = String(payload.latex || '').trim();
      if (!latex || latex.toUpperCase() === 'NONE') throw new Error('No math was recognized. Try a clearer photo of the written steps.');
      const rows = latex
        .replace(/\\(?:begin|end)\{(?:aligned|align\*?|array|gathered)\}(?:\{[^}]*\})?/g, '')
        .split(/\\\\|\\newline|\r?\n/)
        .map((line) => line.replace(/&/g, '').trim())
        .filter(Boolean);
      const transcription = rows.map((line) => {
        try { return window.mathTutorLatexToExpression ? window.mathTutorLatexToExpression(line) : line; }
        catch (_) { return line; }
      }).join('\n');
      $('#studentWork').value = transcription;
      $('#stepCheckFeedback').className = 'step-check-feedback';
      const calculusWork = /(?:\\frac\s*\{\s*d|\bd\s*\)?\s*\/\s*\(?\s*d|\\int|\\partial)/i.test(latex);
      $('#stepCheckFeedback').textContent = calculusWork
        ? 'Transcribed. This appears to be calculus notation; the current step checker handles only one-variable linear equations.'
        : 'Working transcribed. Review or edit each line above, then check the steps.';
      $('#studentWork').focus();
      status.textContent = 'Photo transcribed.';
    } catch (error) {
      status.textContent = error.message || 'Could not read that photo. You can type the steps above.';
    } finally {
      uploadButton.disabled = false;
      studentWorkImageInput.value = '';
    }
  });
  $('#removeStudentWorkImage').addEventListener('click', () => {
    if (studentWorkImageUrl) URL.revokeObjectURL(studentWorkImageUrl);
    studentWorkImageUrl = null;
    studentWorkImageInput.value = '';
    $('#studentWorkImagePreviewImg').removeAttribute('src');
    $('#studentWorkImagePreview').hidden = true;
    $('#studentWorkImageStatus').textContent = '';
  });
  const answerImageInput = $('#answerImageInput');
  $('#chooseAnswerImage').addEventListener('click', () => answerImageInput.click());
  answerImageInput.addEventListener('change', async () => {
    const file = answerImageInput.files?.[0]; if (!file) return;
    const imageStatus = $('#answerImageStatus');
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { answerImageInput.value = ''; imageStatus.textContent = 'Choose a PNG, JPG, or WEBP image.'; return; }
    if (file.size > 12 * 1024 * 1024) { answerImageInput.value = ''; imageStatus.textContent = 'Choose an image smaller than 12 MB.'; return; }
    if (answerImageUrl) URL.revokeObjectURL(answerImageUrl);
    answerImageUrl = URL.createObjectURL(file); $('#answerImagePreviewImg').src = answerImageUrl; $('#answerImagePreview').hidden = false;
    imageStatus.textContent = 'Reading your handwritten answer…';
    const body = new FormData(); body.append('image', file, file.name);
    try {
      const response = await fetch('/recognize', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Recognition failed (${response.status}).`);
      const recognizedAnswer = (payload.latex || '').trim();
      $('#answerAttempt').value = recognizedAnswer.toUpperCase() === 'NONE' ? '' : recognizedAnswer;
      $('#answerAttempt').dispatchEvent(new Event('input', { bubbles: true }));
      imageStatus.textContent = recognizedAnswer && recognizedAnswer.toUpperCase() !== 'NONE' ? 'Answer read. Review or edit it above, then check it.' : 'No answer was recognized. Enter it above or try another image.';
      $('#answerAttempt').focus();
    } catch (error) { imageStatus.textContent = error.message || 'Could not read that image. Enter your answer manually.'; }
  });
  $('#removeAnswerImage').addEventListener('click', () => {
    if (answerImageUrl) URL.revokeObjectURL(answerImageUrl);
    answerImageUrl = null; answerImageInput.value = ''; $('#answerImagePreviewImg').removeAttribute('src'); $('#answerImagePreview').hidden = true;
    $('#answerImageStatus').textContent = '';
  });
  const checkerQuestionImageInput = $('#checkerQuestionImageInput');
  $('#chooseCheckerQuestionImage').addEventListener('click', () => checkerQuestionImageInput.click());
  checkerQuestionImageInput.addEventListener('change', async () => {
    const file = checkerQuestionImageInput.files?.[0]; if (!file) return;
    const status = $('#checkerQuestionImageStatus');
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { checkerQuestionImageInput.value = ''; status.textContent = 'Choose a PNG, JPG, or WEBP image.'; return; }
    if (file.size > 12 * 1024 * 1024) { checkerQuestionImageInput.value = ''; status.textContent = 'Choose an image smaller than 12 MB.'; return; }
    if (checkerQuestionImageUrl) URL.revokeObjectURL(checkerQuestionImageUrl);
    checkerQuestionImageUrl = URL.createObjectURL(file);
    $('#checkerQuestionImagePreviewImg').src = checkerQuestionImageUrl;
    $('#checkerQuestionImagePreview').hidden = false;
    status.textContent = 'Reading the question…';
    $('#submitAttempt').disabled = true; $('#modalShowSolution').disabled = true;
    const body = new FormData(); body.append('image', file, file.name);
    try {
      const response = await fetch('/recognize', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Recognition failed (${response.status}).`);
      const latex = String(payload.latex || '').trim();
      if (!latex || latex.toUpperCase() === 'NONE') throw new Error('No math was recognized. Try a clearer, tightly cropped question photo.');
      setPage('workspace');
      document.querySelector('[data-entry-mode="image"]').click();
      $('#latexInput').value = latex;
      $('#latexInput').dispatchEvent(new Event('input', { bubbles: true }));
      $('#recognizerStatus').textContent = 'Question photo transcribed. Preparing its solution…';
      symbolicAnswerCheck = null; activeSymbolicAnswerCheck = null; currentResult = null;
      if (!window.mathTutorSolveTranscription) throw new Error('The equation solver is still loading. Try again in a moment.');
      await window.mathTutorSolveTranscription();
      status.textContent = 'Question recognized. Review the transcription in Workspace if needed.';
      await openChecker({ preserveAnswer: true });
    } catch (error) {
      status.textContent = error.message || 'Could not read this question photo.';
      $('#checkerFeedback').textContent = status.textContent;
      $('#submitAttempt').disabled = true; $('#modalShowSolution').disabled = true;
    }
  });
  $('#removeCheckerQuestionImage').addEventListener('click', () => {
    if (checkerQuestionImageUrl) URL.revokeObjectURL(checkerQuestionImageUrl);
    checkerQuestionImageUrl = null; checkerQuestionImageInput.value = '';
    $('#checkerQuestionImagePreviewImg').removeAttribute('src'); $('#checkerQuestionImagePreview').hidden = true;
    $('#checkerQuestionImageStatus').textContent = '';
  });
  $('#saveMistake').addEventListener('click', () => { if (currentResult) { addMistake(currentExpression, currentResult.answer); $('#mistakes').scrollIntoView({ behavior: 'smooth' }); } });

  // Calculator keypad. The local SymPy service evaluates expressions and calculus.
  const keys = [
    ['AC','clear','utility'],['DEL','delete','utility'],['(', '(','utility'],[')',' )','utility'],['÷','/','operator'],
    ['7','7'],['8','8'],['9','9'],['×','*','operator'],['√','sqrt(','function'],
    ['4','4'],['5','5'],['6','6'],['−','-','operator'],['x²','^2','function'],
    ['1','1'],['2','2'],['3','3'],['+','+','operator'],['π','pi','constant'],
    ['0','0'],['.','.'],['Ans','Ans','constant'],['x','x','constant'],['=','equals','equals'],
    ['sin','sin(','function','scientific'],['cos','cos(','function','scientific'],['tan','tan(','function','scientific'],['log','log10(','function','scientific'],['ln','log(','function','scientific'],
    ['asin','asin(','function','scientific'],['acos','acos(','function','scientific'],['atan','atan(','function','scientific'],['!','!','function','scientific'],['e','e','constant','scientific'],
    ['abs','abs(','function','scientific'],['exp','exp(','function','scientific'],['^','^','operator','scientific'],['%','%','operator','scientific'],['∫','integral','function','calculus'],['d/dx','diff','function','calculus'],['∫ₐᵇ','defint','function','calculus']
  ];
  const keypad = $('#calcKeypad');
  keys.forEach(([label, value, type = '', mode = '']) => { const b = document.createElement('button'); b.type = 'button'; b.className = `calc-key ${type ? `key-${type}` : ''}`; b.textContent = label; b.dataset.value = value.trim(); if (mode) b.dataset.keyMode = mode; b.addEventListener('click', () => keyPress(value.trim())); keypad.appendChild(b); });
  function keyPress(value) {
    const input = $('#calcInput'); input.focus();
    if (value === 'clear') { input.value = ''; $('#calcOutput').textContent = '0'; $('#calcStatus').textContent = calcMode.toUpperCase() + ' MODE'; return; }
    if (value === 'delete') { input.value = input.value.slice(0, -1); return; }
    if (value === 'equals') { evaluateCalc(); return; }
    if (value === 'Ans') value = lastAnswer;
    if (value === 'integral') { setMode('calculus'); $('#calculusOperation').value = 'integrate'; calcExpressionToVariable(); return; }
    if (value === 'diff') { setMode('calculus'); $('#calculusOperation').value = 'diff'; calcExpressionToVariable(); return; }
    if (value === 'defint') { setMode('calculus'); $('#calculusOperation').value = 'defint'; updateBounds(); calcExpressionToVariable(); return; }
    input.value += value;
  }
  let expressionKeypadMode = 'standard';
  const expressionKeypad = $('#expressionKeypad');
  function renderExpressionKeypad() {
    expressionKeypad.replaceChildren();
    expressionKeypad.dataset.mode = expressionKeypadMode;
    keys.forEach(([label, value, type = '', mode = '']) => {
      if ((expressionKeypadMode === 'calculus') !== (mode === 'calculus') || ['Ans', '!', '%'].includes(label) || (expressionKeypadMode === 'standard' && mode) || (expressionKeypadMode === 'standard' && ['√', 'x²', 'π'].includes(label))) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = `expression-key ${type ? `key-${type}` : ''}`; button.textContent = label; button.dataset.expressionValue = value.trim();
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        const start = expressionInput.selectionStart ?? expressionInput.value.length;
        const end = expressionInput.selectionEnd ?? start;
        const insertion = button.dataset.expressionValue;
        if (mode === 'calculus') {
          const source = expressionInput.value.trim();
          if (source) $('#calcInput').value = source;
          setMode('calculus');
          $('#calculusOperation').value = insertion === 'integral' ? 'integrate' : insertion === 'diff' ? 'diff' : 'defint';
          updateBounds();
          $('#calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
          $('#calcInput').focus();
          return;
        }
        if (insertion === 'clear') expressionInput.setRangeText('', 0, expressionInput.value.length, 'end');
        else if (insertion === 'delete') {
          const from = start === end ? Math.max(0, start - 1) : start;
          expressionInput.setRangeText('', from, end, 'end');
          expressionInput.setSelectionRange(from, from);
        } else {
          const valueToInsert = insertion === 'equals' ? '=' : insertion === 'Ans' ? lastAnswer : insertion;
          expressionInput.setRangeText(valueToInsert, start, end, 'end');
        }
        expressionInput.focus(); hideSolution();
      });
      expressionKeypad.appendChild(button);
    });
    if (expressionKeypadMode !== 'calculus') {
      ['y', 'z', 'w'].forEach((variable) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'expression-key key-constant'; button.textContent = variable; button.dataset.expressionValue = variable;
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => { const start = expressionInput.selectionStart ?? expressionInput.value.length; const end = expressionInput.selectionEnd ?? start; expressionInput.setRangeText(variable, start, end, 'end'); expressionInput.focus(); hideSolution(); });
        expressionKeypad.appendChild(button);
      });
    }
  }
  document.querySelectorAll('[data-expression-mode]').forEach((button) => button.addEventListener('click', () => {
    expressionKeypadMode = button.dataset.expressionMode;
    document.querySelectorAll('[data-expression-mode]').forEach((tab) => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-pressed', String(active)); });
    renderExpressionKeypad();
  }));
  renderExpressionKeypad();
  function setMode(mode) { calcMode = mode; document.querySelectorAll('.calc-mode').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode)); $('#calculusControls').hidden = mode !== 'calculus'; document.querySelectorAll('.calc-key').forEach((b) => { b.hidden = !!b.dataset.keyMode && b.dataset.keyMode !== mode; }); $('#calcStatus').textContent = mode.toUpperCase() + ' MODE'; }
  document.querySelectorAll('.calc-mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  function calcExpressionToVariable() { const input = $('#calcInput'); if (!input.value.trim()) input.value = 'x^2 + 3x'; $('#calculator').scrollIntoView({ behavior: 'smooth' }); }
  $('#angleToggle').addEventListener('click', () => { angle = angle === 'rad' ? 'deg' : 'rad'; $('#angleToggle').textContent = angle === 'rad' ? 'Radians' : 'Degrees'; $('#angleMode').textContent = angle.toUpperCase(); });
  $('#calcInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); calcMode === 'calculus' ? runCalculus() : evaluateCalc(); } });
  function normalizeCalc(expr) { return expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√\s*\(/g, 'sqrt(').replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)').replace(/(\d)(x|pi|e|\()/gi, '$1*$2').replace(/(\d)(sin|cos|tan|sqrt|log10|log|ln|abs|exp|asin|acos|atan)\b/gi, '$1*$2').replace(/\bx\s*(\()/g, 'x*$1').replace(/(\d+|\))!/g, 'factorial($1)'); }
  function angleAdjusted(expr) { if (angle !== 'deg') return expr; return expr.replace(/\b(sin|cos|tan)\(([^()]*)\)/g, (_, fn, arg) => `${fn}((${arg})*pi/180)`).replace(/\b(asin|acos|atan)\(([^()]*)\)/g, (_, fn, arg) => `(${fn}(${arg})*180/pi)`); }
  async function calculateLocally(payload) {
    const response = await fetch('/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || `Calculation failed (${response.status}).`);
    return result;
  }
  function showCalcResult(result, status) {
    const output = $('#calcOutput');
    if (window.katex) window.katex.render(result.latex, output, { throwOnError: false });
    else output.textContent = result.text;
    lastAnswer = result.text;
    $('#calcStatus').textContent = status;
  }
  async function evaluateCalc() {
    const expression = $('#calcInput').value.trim(); if (!expression) return;
    try {
      const result = await calculateLocally({ expression: angleAdjusted(normalizeCalc(expression)), operation: 'evaluate' });
      showCalcResult(result, 'CALCULATED');
    } catch (err) { $('#calcOutput').textContent = err.message || 'Could not evaluate'; $('#calcStatus').textContent = 'CHECK EXPRESSION'; }
  }
  function updateBounds() { const definite = $('#calculusOperation').value === 'defint'; document.querySelectorAll('.bound-field').forEach((el) => { el.hidden = !definite; }); }
  $('#calculusOperation').addEventListener('change', updateBounds);
  async function runCalculus() {
    const expr = normalizeCalc($('#calcInput').value.trim()), variable = $('#calcVariable').value.trim() || 'x', op = $('#calculusOperation').value;
    if (!expr) { $('#calcOutput').textContent = 'Enter an expression first.'; return; }
    lastCalculusGraph = null;
    $('#calculusPlotPanel').hidden = true;
    try {
      const result = await calculateLocally({ expression: angleAdjusted(expr), variable, operation: op, lower: $('#calcLower').value, upper: $('#calcUpper').value });
      showCalcResult(result, op === 'diff' ? 'DERIVATIVE' : 'INTEGRAL');
      lastCalculusGraph = { expression: angleAdjusted(expr), result: result.text, variable, operation: op };
      $('#calculusPlotPanel').hidden = false;
      $('#calculusPlotChartWrap').hidden = true;
      $('#calculusPlotStatus').textContent = op === 'defint'
        ? 'Plot the integrand over the chosen x-range.'
        : `Plot the original function alongside its ${op === 'diff' ? 'derivative' : 'antiderivative'}.`;
    } catch (err) { $('#calcOutput').textContent = err.message || 'Could not calculate'; $('#calcStatus').textContent = 'CHECK EXPRESSION'; }
  }
  $('#runCalculus').addEventListener('click', runCalculus);
  $('#plotCalculusButton').addEventListener('click', async () => {
    if (!lastCalculusGraph) return;
    const button = $('#plotCalculusButton'), status = $('#calculusPlotStatus');
    button.disabled = true; status.textContent = 'Plotting the calculus result…';
    try {
      const min = Number($('#calculusPlotXMin').value), max = Number($('#calculusPlotXMax').value);
      const requestCurve = async (expression) => {
        const response = await fetch('/plot', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression, variable: lastCalculusGraph.variable, x_min: min, x_max: max, samples: 241 }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || `Plot failed (${response.status}).`);
        return payload;
      };
      const original = await requestCurve(lastCalculusGraph.expression);
      let combined = { ...original, series: [{ ...original.series[0], label: lastCalculusGraph.operation === 'defint' ? 'Integrand' : 'Original function' }] };
      if (lastCalculusGraph.operation !== 'defint') {
        const result = await requestCurve(lastCalculusGraph.result);
        combined.series.push({ ...result.series[0], label: lastCalculusGraph.operation === 'diff' ? 'Derivative' : 'Antiderivative' });
      }
      drawEquationPlot(combined, $('#calculusPlot'), $('#calculusPlotLegend'));
      $('#calculusPlotChartWrap').hidden = false;
      status.textContent = lastCalculusGraph.operation === 'defint'
        ? 'The integrand is plotted; the definite integral value remains shown above.'
        : 'Compare the original function with its calculus result over the selected range.';
    } catch (error) {
      $('#calculusPlotChartWrap').hidden = true;
      status.textContent = error.message || 'Could not plot the calculus result.';
    } finally { button.disabled = false; }
  });

  const menuToggle = $('#menuToggle'), nav = $('#primaryNav');
  menuToggle.addEventListener('click', () => { const open = menuToggle.getAttribute('aria-expanded') !== 'true'; menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); nav.classList.toggle('is-open', open); });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', 'Open navigation'); nav.classList.remove('is-open'); }));
  renderHistory(); renderMistakes(); renderProgress(); setMode('standard');
  if ('IntersectionObserver' in window) { const observer = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); observer.unobserve(e.target); } }), { threshold: .12 }); document.querySelectorAll('.reveal,.method-steps').forEach((el) => observer.observe(el)); } else document.querySelectorAll('.reveal,.method-steps').forEach((el) => el.classList.add('is-visible'));
})();

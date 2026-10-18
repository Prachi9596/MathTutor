(() => {
  const fileInput = document.querySelector('#problemImageInput');
  const recognizeButton = document.querySelector('#recognizeButton');
  const latexInput = document.querySelector('#latexInput');
  const preview = document.querySelector('#latexPreview');
  const status = document.querySelector('#recognizerStatus');
  const expressionInput = document.querySelector('#expressionInput');
  const solveButton = document.querySelector('#solveButton');
  let selectedFile = null;

  function normalizeOcrLatex(input) {
    return input
      .replace(/\\y\s*\^\s*\{\s*i\s*\}/g, 'y^{\\prime}')
      .replace(/\\y\s*\^\s*i\b/g, 'y^{\\prime}')
      .replace(/\\y\b/g, 'y')
      .replace(/\\ln\s+\\pi\s*x\b/g, '\\ln{\\pi x}')
      .replace(/\\begin\s*\{\s*array\s*\}\s*\{\s*[^{}]*?\s*\}/g, '')
      .replace(/\\end\s*\{\s*array\s*\}/g, '')
      .replace(/\\\\\s*(?=\\right\b)/g, '');
  }

  function renderPreview() {
    const original = latexInput.value.trim();
    preview.replaceChildren();
    preview.classList.remove('has-preview-error');
    if (!original) {
      const empty = document.createElement('span');
      empty.className = 'preview-empty';
      empty.textContent = 'Live math preview';
      preview.appendChild(empty);
      return;
    }
    try {
      let source = original;
      if ((source.startsWith('\\[') && source.endsWith('\\]')) || (source.startsWith('$$') && source.endsWith('$$'))) source = source.slice(2, -2).trim();
      else if (source.startsWith('\\(') && source.endsWith('\\)')) source = source.slice(2, -2).trim();
      else if (source.startsWith('$') && source.endsWith('$')) source = source.slice(1, -1).trim();
      source = normalizeOcrLatex(source).replace(/\\a\b/g, 'a');
      preview.innerHTML = window.katex.renderToString(source, { displayMode: true, throwOnError: true, strict: 'warn', trust: false });
    } catch (error) {
      preview.textContent = `LaTeX preview error: ${error.message}`;
      preview.classList.add('has-preview-error');
    }
  }

  function readGroup(source, start) {
    while (/\s/.test(source[start] || '')) start++;
    if (source[start] !== '{') throw new Error('Expected a braced LaTeX group.');
    let depth = 1;
    for (let i = start + 1; i < source.length; i++) {
      if (source[i] === '{') depth++;
      if (source[i] === '}' && --depth === 0) return [source.slice(start + 1, i), i + 1];
    }
    throw new Error('A LaTeX brace is not closed.');
  }

  function latexToExpression(input) {
    let source = normalizeOcrLatex(input.trim());
    if (source.toUpperCase() === 'NONE') throw new Error('Pix2Text did not detect math in the image.');
    if ((source.startsWith('\\[') && source.endsWith('\\]')) || (source.startsWith('$$') && source.endsWith('$$'))) source = source.slice(2, -2);
    else if (source.startsWith('\\(') && source.endsWith('\\)')) source = source.slice(2, -2);
    else if (source.startsWith('$') && source.endsWith('$')) source = source.slice(1, -1);
    source = source.replace(/\\begin\{(?:cases|aligned|array)\}|\\end\{(?:cases|aligned|array)\}/g, '').replace(/\\\\/g, ';').replace(/&/g, '');
    source = source.replace(/([A-Za-z])\s*\^\s*\{\s*((?:\\prime\s*)+)\}/g, (_, name, primes) => name + 'prime'.repeat((primes.match(/\\prime/g) || []).length));
    source = source.replace(/\\frac\s*\{\s*d\s*([A-Za-z])\s*\}\s*\{\s*d\s*([A-Za-z])\s*\}/g, '$1prime($2)');
    source = source.replace(/\\(sin|cos|tan)\s*\^\s*\{\s*-\s*1\s*\}\s*(\{[^{}]+\}|\d+(?:\.\d+)?\s*[A-Za-z])/g, (_, fn, arg) => `\\arc${fn}{${arg[0] === '{' ? arg.slice(1, -1) : arg}}`);
    source = source.replace(/\\(sin|cos|tan)\s*\^\s*\{\s*(\d+)\s*\}\s*(\{[^{}]+\}|\([^()]+\)|[A-Za-z])/g, (_, fn, power, arg) => {
      const argument = arg[0] === '{' ? arg.slice(1, -1) : arg[0] === '(' ? arg.slice(1, -1) : arg;
      return `(\\${fn}{${argument}})^{${power}}`;
    });
    source = source.replace(/\\left\b|\\right\b|\\displaystyle\b|\\,|\\;|\\quad\b|\\!/g, '');
    let output = '';
    let insideAbsoluteValue = false;
    for (let i = 0; i < source.length;) {
      if (source[i] === '\\') {
        const match = source.slice(i).match(/^\\([A-Za-z]+)/);
        if (!match) { i++; continue; }
        const command = match[1];
        i += match[0].length;
        if (['frac', 'dfrac', 'tfrac'].includes(command)) {
          const [numerator, afterNumerator] = readGroup(source, i);
          const [denominator, afterDenominator] = readGroup(source, afterNumerator);
          output += `( ${latexToExpression(numerator)} ) / ( ${latexToExpression(denominator)} )`;
          i = afterDenominator;
        } else if (command === 'sqrt') {
          let index = i;
          while (/\s/.test(source[index] || '')) index++;
          if (source[index] === '[') {
            const close = source.indexOf(']', index + 1);
            if (close < 0) throw new Error('The root index is not closed.');
            const degree = latexToExpression(source.slice(index + 1, close));
            const [radicand, after] = readGroup(source, close + 1);
            output += `( ${latexToExpression(radicand)} )^(1/(${degree}))`;
            i = after;
          } else {
            const [radicand, after] = readGroup(source, index);
            output += `sqrt(${latexToExpression(radicand)})`;
            i = after;
          }
        } else {
          const functions = { sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', arcsin: 'asin', arccos: 'acos', arctan: 'atan', asin: 'asin', acos: 'acos', atan: 'atan', asinh: 'asinh', acosh: 'acosh', atanh: 'atanh', log: 'log', ln: 'ln', exp: 'exp', abs: 'abs' };
          const replacements = { times: '*', cdot: '*', div: '/', pi: 'pi', a: 'a', alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', theta: 'theta', lambda: 'lambda', mu: 'mu', omega: 'omega', infinity: 'oo' };
          let subscriptPosition = i;
          while (/\s/.test(source[subscriptPosition] || '')) subscriptPosition++;
          if (command === 'log' && source[subscriptPosition] === '_') {
            let base;
            let afterBase;
            let baseStart = subscriptPosition + 1;
            while (/\s/.test(source[baseStart] || '')) baseStart++;
            if (source[baseStart] === '{') {
              [base, afterBase] = readGroup(source, baseStart);
            } else {
              const baseToken = source.slice(baseStart).match(/^[A-Za-z0-9]+/);
              if (!baseToken) throw new Error('A logarithm base needs a value, like log_2(x).');
              base = baseToken[0];
              afterBase = baseStart + base.length;
            }
            let argumentStart = afterBase;
            while (/\s/.test(source[argumentStart] || '')) argumentStart++;
            if (source[argumentStart] === '{') {
              const [argument, afterArgument] = readGroup(source, argumentStart);
              output += `log(${latexToExpression(argument)},${latexToExpression(base)})`;
              i = afterArgument;
            } else {
              const argument = source.slice(argumentStart).match(/^(?:\d+(?:\.\d+)?\s*[A-Za-z]|[A-Za-z])/);
              if (!argument) throw new Error('A logarithm base needs an argument, like log_2(x).');
              output += `log(${latexToExpression(argument[0])},${latexToExpression(base)})`;
              i = argumentStart + argument[0].length;
            }
          } else if (functions[command]) {
            let argumentStart = i;
            while (/\s/.test(source[argumentStart] || '')) argumentStart++;
            if (source[argumentStart] === '{') {
              const [argument, after] = readGroup(source, argumentStart);
              output += `${functions[command]}(${latexToExpression(argument)})`;
              i = after;
            } else if (source[argumentStart] === '(') {
              output += functions[command];
              i = argumentStart;
            } else {
              const argument = source.slice(argumentStart).match(/^(?:[+-]?\d+(?:\.\d+)?\s*[A-Za-z]|[+-]?\d+(?:\.\d+)?|[A-Za-z])/);
              if (!argument) output += functions[command];
              else {
                output += `${functions[command]}(${latexToExpression(argument[0])})`;
                i = argumentStart + argument[0].length;
              }
            }
          } else output += replacements[command] ?? `\\${command}`;
        }
        continue;
      }
      const char = source[i++];
      if (char === '{') output += '(';
      else if (char === '}') output += ')';
      else if (char === '×' || char === '⋅') output += '*';
      else if (char === '÷') output += '/';
      else if (char === '−' || char === '–') output += '-';
      else if (char === '|') { output += insideAbsoluteValue ? ')' : 'abs('; insideAbsoluteValue = !insideAbsoluteValue; }
      else output += char;
    }
    if (/\\[A-Za-z]+/.test(output)) throw new Error('This notation is not supported by the current equation solver. Try editing it to use numbers, x, +, −, ×, ÷, and parentheses.');
    return output
      .replace(/\b([A-Za-z][A-Za-z0-9_]*)\s+(?=[A-Za-z][A-Za-z0-9_]*\b)/g, '$1*')
      .replace(/(\d)\s+([A-Za-z])/g, '$1*$2')
      .replace(/(\d)([A-Za-z])/g, '$1*$2')
      .replace(/\)\s*(?=[A-Za-z])/g, ')*')
      .replace(/([A-Za-z0-9)])\s+(?=(?:asin|acos|atan|sin|cos|tan|sqrt|log|ln)\s*\()/g, '$1*')
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.mathTutorLatexToExpression = latexToExpression;

  function readIntegralTranscription(input) {
    let source = input.trim();
    if (source.startsWith('\\[') && source.endsWith('\\]')) source = source.slice(2, -2).trim();
    else if (source.startsWith('\\(') && source.endsWith('\\)')) source = source.slice(2, -2).trim();
    const match = source.match(/^\\int\s*(?:_\s*\{([^{}]+)\})?\s*(?:\^\s*\{([^{}]+)\})?\s*([\s\S]+)$/);
    if (!match) return null;
    const tail = match[3];
    const differential = tail.match(/(?:\\,)?\s*d\s*([A-Za-z])\s*$/);
    if (!differential) return null;
    const integrand = tail.slice(0, differential.index).replace(/\\left\b|\\right\b|\\displaystyle\b/g, '').trim();
    if (!integrand) return null;
    return { integrand, variable: differential[1], lower: match[1] || null, upper: match[2] || null };
  }

  function readDerivativeTranscription(input) {
    let source = input.trim();
    if (source.startsWith('\\[') && source.endsWith('\\]')) source = source.slice(2, -2).trim();
    else if (source.startsWith('\\(') && source.endsWith('\\)')) source = source.slice(2, -2).trim();
    if (!source.startsWith('\\frac')) return null;
    const numeratorStart = source.indexOf('\\frac') + '\\frac'.length;
    const [numerator, afterNumerator] = readGroup(source, numeratorStart);
    const [denominator, afterDenominator] = readGroup(source, afterNumerator);
    const top = numerator.replace(/\s+/g, '').match(/^d(?:\^(\d+))?$/);
    const bottom = denominator.replace(/\s+/g, '').match(/^d([A-Za-z])(?:\^(\d+))?$/);
    if (!top || !bottom) return null;
    if (top[1] && bottom[2] && top[1] !== bottom[2]) throw new Error('The derivative orders in the numerator and denominator do not match.');
    const order = Number(top[1] || bottom[2] || 1);
    let statement = source.slice(afterDenominator).replace(/\\left\b|\\right\b|\\displaystyle\b/g, '').trim();
    const equalsAt = statement.indexOf('=');
    const expression = (equalsAt < 0 ? statement : statement.slice(0, equalsAt)).trim();
    const claimedResult = equalsAt < 0 ? null : statement.slice(equalsAt + 1).trim();
    let operand = expression;
    if ((operand.startsWith('[') && operand.endsWith(']')) || (operand.startsWith('(') && operand.endsWith(')'))) {
      operand = operand.slice(1, -1).trim();
    }
    return operand ? { expression: operand, claimedResult, variable: bottom[1], order } : null;
  }

  function renderCalculation(labelText, answerLatex, steps) {
    const resultState = document.querySelector('#resultState');
    const solutionOutput = document.querySelector('#solutionOutput');
    resultState.hidden = true;
    solutionOutput.replaceChildren();
    const answer = document.createElement('div');
    answer.className = 'solution-answer';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    if (window.katex) window.katex.render(answerLatex, value, { throwOnError: false });
    else value.textContent = answerLatex;
    answer.append(label, value);
    solutionOutput.appendChild(answer);
    steps.forEach((item, index) => {
      const step = document.createElement('div');
      step.className = 'solution-step';
      const number = document.createElement('b');
      number.textContent = String(index + 1).padStart(2, '0');
      const description = document.createElement('span');
      description.textContent = item.title;
      step.append(number, description);
      if (item.math) {
        const formula = document.createElement('span');
        formula.className = 'step-math';
        if (window.katex) window.katex.render(item.math, formula, { throwOnError: false });
        else formula.textContent = item.math;
        step.appendChild(formula);
      }
      solutionOutput.appendChild(step);
    });
    solutionOutput.hidden = false;
    document.querySelector('#workspaceActions').hidden = true;
    document.querySelector('#plotControls').hidden = false;
    document.querySelector('#plotChartWrap').hidden = true;
    document.querySelector('#plotStatus').textContent = 'Plot the recognized expression over the selected range.';
  }

  async function solveTranscription() {
    try {
      const normalizedTranscription = normalizeOcrLatex(latexInput.value);
      if (normalizedTranscription !== latexInput.value) {
        latexInput.value = normalizedTranscription;
        renderPreview();
      }
      const derivative = readDerivativeTranscription(latexInput.value);
      if (derivative) {
        const derivativeExpression = latexToExpression(derivative.expression);
        const displayDerivativeExpression = derivative.expression.replace(/\\a\b/g, 'a');
        const displayClaimedResult = derivative.claimedResult?.replace(/\\a\b/g, 'a');
        expressionInput.value = derivativeExpression;
        status.textContent = `Recognized a ${derivative.order}-order derivative with respect to ${derivative.variable}. Calculating…`;
        const response = await fetch('/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: derivativeExpression, operation: 'diff', variable: derivative.variable, order: derivative.order }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || `Calculation failed (${response.status}).`);
        const notation = derivative.order === 1 ? `\\frac{d}{d${derivative.variable}}` : `\\frac{d^{${derivative.order}}}{d${derivative.variable}^{${derivative.order}}}`;
        const derivativeSteps = [
          { title: `Differentiate ${derivative.order} time(s) with respect to ${derivative.variable}.`, math: `${notation}\\left(${displayDerivativeExpression}\\right)` },
          { title: 'Apply the differentiation rules, then simplify.', math: `=${result.latex}` },
        ];
        let answerLatex = `${notation}\\left(${displayDerivativeExpression}\\right)=${result.latex}`;
        let statusMessage = 'Derivative calculated. Review the result and confirm the transcription.';
        if (derivative.claimedResult) {
          let comparison;
          try {
            const claimedExpression = latexToExpression(derivative.claimedResult).replace(/\^/g, '**');
            const checkResponse = await fetch('/calculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ expression: `${result.text} = ${claimedExpression}`, operation: 'solve' }),
            });
            const check = await checkResponse.json().catch(() => ({}));
            if (checkResponse.ok) comparison = check.text === 'Every value of the listed variables is a solution.' ||
              check.text === 'The equation is an identity.';
          } catch (_) {
            // Keep the derivative result even if OCR makes the claimed side unparsable.
          }
          if (comparison === true) {
            derivativeSteps.push({ title: 'The stated right-hand side matches the calculated derivative.', math: `${result.latex}=${displayClaimedResult}` });
            answerLatex = `${notation}\\left(${displayDerivativeExpression}\\right)=${result.latex}=${displayClaimedResult}`;
            statusMessage = 'Derivative identity checked. Review the result and transcription.';
          } else if (comparison === false) {
            derivativeSteps.push({ title: 'The stated right-hand side does not match the derivative as transcribed.', math: `${result.latex}\\ne ${displayClaimedResult}` });
            statusMessage = 'Derivative calculated. The stated right-hand side differs as transcribed; check for an OCR symbol error.';
          } else {
            derivativeSteps.push({ title: 'The derivative was calculated, but the handwritten right-hand side could not be compared. Check its transcription.', math: `${result.latex}\\quad\\text{claimed: }${displayClaimedResult}` });
            statusMessage = 'Derivative calculated. The right-hand side could not be checked; review the transcription for OCR errors.';
          }
        }
        window.mathTutorRegisterSymbolicAnswer?.({
          question: latexInput.value.trim(),
          expected: result.text,
          answer: result.text,
          answerLatex: result.latex,
          steps: derivativeSteps,
        });
        renderCalculation('DERIVATIVE', answerLatex, derivativeSteps);
        document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
        status.textContent = statusMessage;
        return;
      }
      const integral = readIntegralTranscription(latexInput.value);
      if (integral) {
        const integrand = latexToExpression(integral.integrand);
        const isDefinite = integral.lower !== null && integral.upper !== null;
        const lower = isDefinite ? latexToExpression(integral.lower) : null;
        const upper = isDefinite ? latexToExpression(integral.upper) : null;
        expressionInput.value = integrand;
        status.textContent = `Recognized an ${isDefinite ? 'definite' : 'indefinite'} integral. Calculating…`;
        const response = await fetch('/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: integrand, operation: isDefinite ? 'defint' : 'integrate', variable: integral.variable, lower, upper }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || `Calculation failed (${response.status}).`);
        const differential = `\\,d${integral.variable}`;
        const integralTex = isDefinite
          ? `\\int_{${lower}}^{${upper}} ${integral.integrand}${differential}`
          : `\\int ${integral.integrand}${differential}`;
        const answerLatex = isDefinite ? `${integralTex}=${result.latex}` : `${integralTex}=${result.latex}+C`;
        const integralSteps = isDefinite
          ? [{ title: 'Evaluate the antiderivative at the upper and lower bounds.', math: answerLatex }]
          : [
              { title: 'Find an antiderivative and include the constant of integration.', math: answerLatex },
              { title: 'Check it by differentiating.', math: `\\frac{d}{d${integral.variable}}\\left[${result.latex}+C\\right]=${integrand}` },
            ];
        renderCalculation(isDefinite ? 'DEFINITE INTEGRAL' : 'ANTIDERIVATIVE', answerLatex, integralSteps);
        document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
        status.textContent = isDefinite ? 'Definite integral evaluated.' : 'Antiderivative found. C is the constant of integration.';
        return;
      }
      const expression = latexToExpression(latexInput.value);
      expressionInput.value = expression;
      const odeDefinition = expression.match(/^\s*([A-Za-z])prime\s*=\s*(.+)$/i);
      const derivativeDefinition = expression.match(/^\s*([A-Za-z])((?:prime)+)\s*(?:\(\s*([A-Za-z])\s*\))?\s*=\s*(.+)$/i);
      if (derivativeDefinition && !odeDefinition) {
        const functionName = derivativeDefinition[1];
        const order = (derivativeDefinition[2].match(/prime/g) || []).length;
        const variable = derivativeDefinition[3] || 'x';
        const derivativeExpression = derivativeDefinition[4].split('=').map((part) => part.trim()).at(-1);
        status.textContent = `Recognized ${functionName}${'′'.repeat(order)}(${variable}). Integrating with respect to ${variable}…`;
        const response = await fetch('/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: derivativeExpression, operation: 'integrate', variable, order }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || `Calculation failed (${response.status}).`);

        const resultState = document.querySelector('#resultState');
        const solutionOutput = document.querySelector('#solutionOutput');
        const workspaceActions = document.querySelector('#workspaceActions');
        resultState.hidden = true;
        solutionOutput.replaceChildren();
        const answer = document.createElement('div');
        answer.className = 'solution-answer';
        const label = document.createElement('span');
        label.textContent = 'ANTIDERIVATIVE';
        const value = document.createElement('strong');
        const integrationConstants = order === 1 ? 'C' : Array.from({ length: order }, (_, index) => {
          const degree = order - index - 1;
          if (degree === 0) return `C_${index + 1}`;
          if (degree === 1) return `C_${index + 1}${variable}`;
          return `\\frac{C_${index + 1}${variable}^{${degree}}}{${degree}!}`;
        }).join('+');
        if (window.katex) window.katex.render(`${functionName}(${variable})=${result.latex}+${integrationConstants}`, value, { throwOnError: false });
        else value.textContent = `${functionName}(${variable}) = ${result.text} + ${integrationConstants}`;
        answer.append(label, value);
        solutionOutput.appendChild(answer);

        const compactDerivative = derivativeExpression.replace(/\s+/g, '').replace(/\^/g, '**');
        let powerTerm = order === 1 && variable === 'x' ? compactDerivative.match(/^([+-]?\d+(?:\.\d+)?)\*x\*\*\((-?\d+)\/(\d+)\)$/) : null;
        if (order === 1 && !powerTerm) {
          const groupedFractionPower = compactDerivative.match(/^([+-]?\d+(?:\.\d+)?)\*x\*\*\((-?)\((\d+)\)\/\((\d+)\)\)$/);
          if (groupedFractionPower) powerTerm = [groupedFractionPower[0], groupedFractionPower[1], `${groupedFractionPower[2]}${groupedFractionPower[3]}`, groupedFractionPower[4]];
        }
        const steps = [];
        if (powerTerm && Number(powerTerm[2]) + Number(powerTerm[3]) !== 0) {
          const coefficient = Number(powerTerm[1]);
          const exponentNumerator = Number(powerTerm[2]);
          const exponentDenominator = Number(powerTerm[3]);
          const integratedExponentNumerator = exponentNumerator + exponentDenominator;
          const divisor = (a, b) => b ? divisor(b, a % b) : Math.abs(a);
          const commonFactor = divisor(integratedExponentNumerator, exponentDenominator) || 1;
          const reducedNumerator = integratedExponentNumerator / commonFactor;
          const reducedDenominator = exponentDenominator / commonFactor;
          const exponentLatex = (numerator, denominator) => {
            const sign = numerator < 0 ? '-' : '';
            return denominator === 1 ? `${sign}${Math.abs(numerator)}` : `${sign}\\frac{${Math.abs(numerator)}}{${denominator}}`;
          };
          const oldPower = exponentLatex(exponentNumerator, exponentDenominator);
          const newPower = exponentLatex(reducedNumerator, reducedDenominator);
          const integratedCoefficient = String(Number((coefficient * exponentDenominator / integratedExponentNumerator).toPrecision(8)));
          steps.push(
            { title: 'Use the reverse power rule: ∫axⁿ dx = a·xⁿ⁺¹/(n+1) + C.', math: `\\int ${coefficient}${variable}^{${oldPower}}\\,d${variable}=\\frac{${coefficient}}{${exponentNumerator}/${exponentDenominator}+1}${variable}^{${oldPower}+1}+C` },
            { title: 'Increase the exponent by 1 and divide by the new exponent.', math: `${functionName}(${variable})=${integratedCoefficient}${variable}^{${newPower}}+C` },
            { title: 'Differentiate to check the antiderivative.', math: `\\frac{d}{d${variable}}\\left[${integratedCoefficient}${variable}^{${newPower}}+C\\right]=${coefficient}${variable}^{${oldPower}}` },
          );
        } else {
          steps.push({ title: `Integrate the given ${order === 1 ? 'derivative' : `${order}th derivative ${order} times`} and include the integration constants.`, math: `${functionName}(${variable})=${result.latex}+${integrationConstants}` });
        }
        steps.forEach((item, index) => {
          const step = document.createElement('div');
          step.className = 'solution-step';
          const number = document.createElement('b');
          number.textContent = String(index + 1).padStart(2, '0');
          const description = document.createElement('span');
          description.textContent = item.title;
          const formula = document.createElement('span');
          formula.className = 'step-math';
          if (window.katex) window.katex.render(item.math, formula, { throwOnError: false });
          else formula.textContent = item.math;
          step.append(number, description, formula);
          solutionOutput.appendChild(step);
        });
        solutionOutput.hidden = false;
        workspaceActions.hidden = true;
        document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
        status.textContent = 'Recovered the original function by integration. The constant C represents any constant of integration.';
        return;
      }
      const functionDefinition = expression.match(/^\s*(y|[A-Za-z]\s*\(\s*x\s*\))\s*=\s*(.+)$/i);
      if (functionDefinition) {
        const functionName = functionDefinition[1].match(/[A-Za-z]/)[0];
        const isY = functionName.toLowerCase() === 'y' && !functionDefinition[1].includes('(');
        const alternatives = functionDefinition[2].split('=').map((part) => part.trim()).filter(Boolean);
        const differentiand = alternatives[alternatives.length - 1];
        expressionInput.value = differentiand;
        const derivativeNotation = isY ? '\\frac{dy}{dx}' : `${functionName}'(x)`;
        status.textContent = `Recognized ${functionDefinition[1]}. Differentiating the right-hand side with respect to x…`;
        const response = await fetch('/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: differentiand, operation: 'diff', variable: 'x' }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || `Calculation failed (${response.status}).`);

        const resultState = document.querySelector('#resultState');
        const solutionOutput = document.querySelector('#solutionOutput');
        const workspaceActions = document.querySelector('#workspaceActions');
        resultState.hidden = true;
        solutionOutput.replaceChildren();
        const answer = document.createElement('div');
        answer.className = 'solution-answer';
        const label = document.createElement('span');
        label.textContent = 'DERIVATIVE';
        const value = document.createElement('strong');
        if (window.katex) window.katex.render(`${derivativeNotation} = ${result.latex}`, value, { throwOnError: false });
        else value.textContent = `${isY ? 'dy/dx' : `${functionName}'(x)`} = ${result.text}`;
        answer.append(label, value);
        solutionOutput.appendChild(answer);
        const compactDifferentiand = differentiand.replace(/\s+/g, '');
        const inverseTangentProduct = compactDifferentiand.match(/^x\*atan\(([+-]?\d+(?:\.\d+)?)\*x\)$/);
        const powerTerm = compactDifferentiand.replace(/\^/g, '**').match(/^([+-]?\d+(?:\.\d+)?)\*x\*\*\((-?\d+)\/(\d+)\)$/);
        let workedSteps;
        if (powerTerm) {
          const coefficient = Number(powerTerm[1]);
          const exponentNumerator = Number(powerTerm[2]);
          const exponentDenominator = Number(powerTerm[3]);
          const derivativeCoefficient = coefficient * exponentNumerator / exponentDenominator;
          const derivativeExponentNumerator = exponentNumerator - exponentDenominator;
          const divisor = (a, b) => b ? divisor(b, a % b) : Math.abs(a);
          const commonFactor = divisor(derivativeExponentNumerator, exponentDenominator) || 1;
          const reducedNumerator = derivativeExponentNumerator / commonFactor;
          const reducedDenominator = exponentDenominator / commonFactor;
          const exponentLatex = (numerator, denominator) => {
            const sign = numerator < 0 ? '-' : '';
            const magnitude = Math.abs(numerator);
            return denominator === 1 ? `${sign}${magnitude}` : `${sign}\\frac{${magnitude}}{${denominator}}`;
          };
          const powerLatex = exponentLatex(reducedNumerator, reducedDenominator);
          const originalPowerLatex = exponentLatex(exponentNumerator, exponentDenominator);
          const derivativeCoefficientText = String(Number(derivativeCoefficient.toPrecision(8)));
          workedSteps = [];
          if (alternatives.length > 1) {
            workedSteps.push({
              title: 'Rewrite the equivalent expression using powers.',
              math: latexInput.value.trim(),
            });
          }
          workedSteps.push(
            { title: 'Use the power rule: d/dx(axⁿ) = anxⁿ⁻¹.', math: `\\frac{d}{dx}[${coefficient}x^{${originalPowerLatex}}]=${coefficient}\\left(${exponentNumerator}/${exponentDenominator}\\right)x^{${powerLatex}}` },
            { title: 'Substitute the coefficient and exponent.', math: `${derivativeNotation}=${derivativeCoefficientText}x^{${powerLatex}}` },
            { title: 'Write the result in simplified form.', math: `${derivativeNotation}=${derivativeCoefficientText < 0 ? '-' : ''}\\frac{${Math.abs(derivativeCoefficient)}}{x^{${reducedDenominator === 1 ? Math.abs(reducedNumerator) : `\\frac{${Math.abs(reducedNumerator)}}{${reducedDenominator}}`}}}` },
          );
        } else if (inverseTangentProduct) {
          const coefficient = inverseTangentProduct[1];
          const squaredCoefficient = String(Number(coefficient) ** 2);
          const inner = `${coefficient}x`;
          workedSteps = [
            {
              title: 'Use the product rule: (uv)′ = u′v + uv′.',
              math: `\\frac{d}{dx}\\left[x\\tan^{-1}(${inner})\\right]=\\tan^{-1}(${inner})+x\\frac{d}{dx}\\left[\\tan^{-1}(${inner})\\right]`,
            },
            {
              title: 'Use the chain rule for inverse tangent.',
              math: `\\frac{d}{dx}\\tan^{-1}(${inner})=\\frac{${coefficient}}{1+(${inner})^2}=\\frac{${coefficient}}{1+${squaredCoefficient}x^2}`,
            },
            {
              title: 'Substitute the chain-rule result into the product rule.',
              math: `${derivativeNotation}=\\tan^{-1}(${inner})+x\\cdot\\frac{${coefficient}}{1+${squaredCoefficient}x^2}`,
            },
            {
              title: 'Simplify.',
              math: `${derivativeNotation}=\\tan^{-1}(${inner})+\\frac{${coefficient}x}{1+${squaredCoefficient}x^2}`,
            },
          ];
        } else {
          workedSteps = [
            { title: `Differentiate ${functionDefinition[1]} with respect to x.`, math: null },
            { title: 'Apply the differentiation rules, then simplify the result.', math: `${derivativeNotation}=${result.latex}` },
          ];
        }
        window.mathTutorRegisterSymbolicAnswer?.({
          question: latexInput.value.trim(),
          expected: result.text,
          answer: result.text,
          answerLatex: result.latex,
          steps: workedSteps,
        });
        workedSteps.forEach((item, index) => {
          const step = document.createElement('div');
          step.className = 'solution-step';
          const number = document.createElement('b');
          number.textContent = String(index + 1).padStart(2, '0');
          const description = document.createElement('span');
          description.textContent = item.title;
          step.append(number, description);
          if (item.math) {
            const formula = document.createElement('span');
            formula.className = 'step-math';
            if (window.katex) window.katex.render(item.math, formula, { throwOnError: false });
            else formula.textContent = item.math;
            step.appendChild(formula);
          }
          solutionOutput.appendChild(step);
        });
        solutionOutput.hidden = false;
        workspaceActions.hidden = true;
        document.querySelector('#plotVariable').value = 'x';
        document.querySelector('#plotMode').value = 'curve';
        document.querySelectorAll('.plot-y-control').forEach((control) => { control.hidden = true; });
        document.querySelector('#plotControls').hidden = false;
        document.querySelector('#plotChartWrap').hidden = true;
        document.querySelector('#plotStatus').textContent = 'Plot the recognized function over the selected range.';
        document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
        status.textContent = 'Function differentiated with respect to x. Review the worked steps, then edit the LaTeX if needed.';
        return;
      }
      const odeExpression = latexToExpression(latexInput.value).replace(/\^/g, '**');
      const odeMatch = odeExpression.match(/^\s*([A-Za-z])prime\s*=\s*(.+)$/);
      if (odeMatch) {
        const dependentVariable = odeMatch[1];
        const reserved = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'exp', 'abs', 'pi', 'e']);
        const independentVariable = (odeMatch[2].match(/[A-Za-z][A-Za-z0-9_]*/g) || []).find((name) => name !== dependentVariable && !reserved.has(name)) || 'x';
        status.textContent = 'Recognized a first-order differential equation. Solving…';
        const response = await fetch('/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: odeExpression, operation: 'ode', variable: independentVariable }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.detail || `Calculation failed (${response.status}).`);
        const answerLatex = `${dependentVariable}(${independentVariable})=${result.latex}`;
        window.mathTutorRegisterSymbolicAnswer?.({
          question: latexInput.value.trim(), expected: result.text, answer: result.answer,
          answerLatex, steps: result.steps,
        });
        // A general solution contains arbitrary integration constants. Plot a
        // representative curve with those constants set to 1.
        expressionInput.value = result.text.replace(/\bC\d*\b/g, '1');
        document.querySelector('#plotVariable').value = independentVariable;
        document.querySelector('#plotMode').value = 'curve';
        document.querySelectorAll('.plot-y-control').forEach((control) => { control.hidden = true; });
        renderCalculation('GENERAL SOLUTION', answerLatex, result.steps);
        document.querySelector('#plotStatus').textContent = 'Plot shows one representative solution with arbitrary constants set to 1.';
        document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
        status.textContent = 'Solved the first-order differential equation. Review the separation and integration steps.';
        return;
      }
      if (window.mathTutorSolve) await window.mathTutorSolve();
      else solveButton.click();
      document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const solverError = document.querySelector('#solutionOutput .solution-error');
      status.textContent = solverError
        ? `Recognized, but the current solver could not solve this form: ${solverError.textContent}`
        : 'Transcription solved. Edit the LaTeX or expression if needed.';
    } catch (error) {
      const solutionOutput = document.querySelector('#solutionOutput');
      solutionOutput.replaceChildren();
      const message = document.createElement('p');
      message.className = 'solution-error';
      message.textContent = error.message;
      solutionOutput.appendChild(message);
      solutionOutput.hidden = false;
      document.querySelector('#resultState').hidden = true;
      document.querySelector('#workspaceActions').hidden = true;
      status.textContent = error.message;
    }
  }
  window.mathTutorSolveTranscription = solveTranscription;

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files?.[0] || null;
    recognizeButton.disabled = !selectedFile;
    status.textContent = selectedFile ? `${selectedFile.name} is ready.` : '';
  });
  document.querySelector('#removeProblemImage').addEventListener('click', () => {
    selectedFile = null;
    recognizeButton.disabled = true;
    status.textContent = '';
  });
  latexInput.addEventListener('input', renderPreview);
  document.querySelectorAll('.latex-keypad [data-latex-insert]').forEach((key) => {
    key.addEventListener('pointerdown', (event) => event.preventDefault());
    key.addEventListener('click', () => {
      const hasEditorFocus = document.activeElement === latexInput;
      const start = hasEditorFocus ? latexInput.selectionStart : Number(latexInput.dataset.lastCaret ?? latexInput.value.length);
      const end = hasEditorFocus ? latexInput.selectionEnd : start;
      latexInput.setRangeText(key.dataset.latexInsert || '', start, end, 'end');
      const caretOffset = Number(key.dataset.caret);
      if (Number.isInteger(caretOffset)) {
        const caret = start + caretOffset;
        latexInput.setSelectionRange(caret, caret);
      }
      latexInput.focus();
      latexInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  ['click', 'keyup', 'select', 'input'].forEach((eventName) => latexInput.addEventListener(eventName, () => {
    latexInput.dataset.lastCaret = String(latexInput.selectionStart ?? latexInput.value.length);
  }));
  recognizeButton.addEventListener('click', async () => {
    if (!selectedFile) return;
    recognizeButton.disabled = true;
    recognizeButton.querySelector('span').textContent = 'Reading handwriting…';
    status.textContent = 'Recognizing handwriting…';
    const body = new FormData();
    body.append('image', selectedFile, selectedFile.name);
    try {
      const response = await fetch('/recognize', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status}).`);
      latexInput.value = normalizeOcrLatex(payload.latex || 'NONE');
      renderPreview();
      status.textContent = 'Review or correct the transcription, then solve.';
    } catch (error) {
      status.textContent = error.message.includes('Failed to fetch')
        ? 'Could not reach MathTutor. Check that the app is running, then try again.'
        : error.message;
    } finally {
      recognizeButton.disabled = !selectedFile;
      recognizeButton.querySelector('span').textContent = 'Read handwritten problem';
    }
  });

  renderPreview();
})();

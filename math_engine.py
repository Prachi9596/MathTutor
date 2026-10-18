

from __future__ import annotations

import ast
import math
import re
from typing import Any

import sympy as sp

MAX_EXPRESSION_LENGTH = 400
MAX_EXPRESSION_OPERATIONS = 120
FUNCTIONS = {
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "cot": sp.cot,
    "sec": sp.sec,
    "csc": sp.csc,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "acot": sp.acot,
    "asec": sp.asec,
    "acsc": sp.acsc,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "asinh": sp.asinh,
    "acosh": sp.acosh,
    "atanh": sp.atanh,
    "sqrt": sp.sqrt,
    "exp": sp.exp,
    "log": sp.log,
    "ln": sp.log,
    "abs": sp.Abs,
    "factorial": sp.factorial,
    # SymPy's sstr output uses capitalized Abs in antiderivatives such as
    # integral(1/x) = log(Abs(x)); accept that output for plotting too.
    "Abs": sp.Abs,
    "sign": sp.sign,
}


def _log10(value: sp.Expr) -> sp.Expr:
    return sp.log(value, 10)


FUNCTIONS["log10"] = _log10


def _normalize(source: str) -> str:
    if not source or len(source) > MAX_EXPRESSION_LENGTH:
        raise ValueError("Enter an expression with at most 400 characters.")
    normalized = (
        source.replace("×", "*")
        .replace("⋅", "*")
        .replace("÷", "/")
        .replace("−", "-")
        .replace("–", "-")
        .replace("^", "**")
        .replace("π", "pi")
    )
    # Recover inverse-trig notation if OCR-to-expression conversion preserved
    # the spaced superscript form, e.g. `tan ^ ( - 1 ) 2*x`.
    inverse_names = {"sin": "asin", "cos": "acos", "tan": "atan"}

    def recover_inverse_trig(match: re.Match[str]) -> str:
        function = inverse_names[match.group(1)]
        argument = re.sub(r"\s+", "", match.group(2))
        return f"{function}({argument})"

    normalized = re.sub(
        r"\b(sin|cos|tan)\s*\*{1,2}\s*\(\s*-\s*1\s*\)\s*(\d+(?:\.\d+)?\s*\*?\s*[A-Za-z])",
        recover_inverse_trig,
        normalized,
    )
    # Handwritten-formula OCR commonly omits multiplication signs (for example,
    # `2x` and `x atan(2x)`). Make those products explicit before AST parsing.
    normalized = re.sub(r"(?<=\d)\s+(?=[A-Za-z])", "*", normalized)
    normalized = re.sub(r"(?<=\d)(?=[A-Za-z])", "*", normalized)
    normalized = re.sub(r"(?<=[xyzw])(?=[xyzw])", "*", normalized)
    normalized = re.sub(r"(?<=[xyzw])\s+(?=[xyzw]\b)", "*", normalized)
    normalized = re.sub(
        r"(?<=[A-Za-z0-9)])\s+(?=(?:asin|acos|atan|sin|cos|tan|cot|sec|csc|sqrt|log10|log|ln|abs|exp)\s*\()",
        "*",
        normalized,
    )
    normalized = re.sub(r"(?<=[A-Za-z0-9)])\s+(?=[A-Za-z]\b)", "*", normalized)
    return normalized


def _parse(source: str, symbols: dict[str, sp.Symbol]) -> sp.Expr:
    normalized = _normalize(source)
    try:
        tree = ast.parse(normalized, mode="eval")
    except (SyntaxError, ValueError) as error:
        raise ValueError("I couldn't parse that expression. Check the operators and parentheses.") from error
    if sum(1 for _ in ast.walk(tree)) > MAX_EXPRESSION_OPERATIONS:
        raise ValueError("That expression is too complex for this prototype.")

    names: dict[str, Any] = {**symbols, **FUNCTIONS, "pi": sp.pi, "e": sp.E, "oo": sp.oo}

    def visit(node: ast.AST) -> sp.Expr:
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            if isinstance(node.value, float) and not math.isfinite(node.value):
                raise ValueError("Use a finite number in the expression.")
            return sp.Rational(str(node.value))
        if isinstance(node, ast.Name) and node.id in names:
            value = names[node.id]
            if isinstance(value, sp.Symbol) or value in (sp.pi, sp.E, sp.oo):
                return value
            raise ValueError(f"Use {node.id} with parentheses, like {node.id}(x).")
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = visit(node.operand)
            return value if isinstance(node.op, ast.UAdd) else -value
        if isinstance(node, ast.BinOp):
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.Pow):
                return left**right
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCTIONS:
            if node.keywords or len(node.args) not in ({1, 2} if node.func.id in {"log", "ln"} else {1}):
                raise ValueError(f"{node.func.id} has an unsupported number of arguments.")
            arguments = [visit(argument) for argument in node.args]
            return FUNCTIONS[node.func.id](*arguments)
        raise ValueError("Use numbers, the selected variable, arithmetic operators, and supported math functions.")

    return visit(tree)


def _symbols_in(expressions: list[str], extra: set[str] | None = None) -> dict[str, sp.Symbol]:
    names = set(extra or ())
    reserved = set(FUNCTIONS) | {"pi", "e", "oo"}
    for expression in expressions:
        try:
            tree = ast.parse(_normalize(expression), mode="eval")
        except (SyntaxError, ValueError) as error:
            raise ValueError("I couldn't parse that expression. Check the operators and parentheses.") from error
        names.update(node.id for node in ast.walk(tree) if isinstance(node, ast.Name) and node.id not in reserved)
    names -= reserved
    if len(names) > 4:
        raise ValueError("Use at most four variables in one problem.")
    for name in names:
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", name):
            raise ValueError("Variable names must start with a letter and contain only letters or digits.")
    return {name: sp.Symbol(name, real=True) for name in sorted(names)}


def _solve(expression: str) -> dict[str, str | bool | list[str]]:
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise ValueError("Enter an expression with at most 400 characters.")
    equation_sources = [part.strip() for part in re.split(r"[;\n]+", expression) if part.strip()]
    if not equation_sources:
        raise ValueError("Enter one equation or a system of equations.")
    sides: list[tuple[str, str]] = []
    for line in equation_sources:
        parts = line.split("=")
        if len(parts) == 1:
            sides.append((parts[0], "0"))
        elif len(parts) == 2 and all(part.strip() for part in parts):
            sides.append((parts[0], parts[1]))
        else:
            raise ValueError("Write one equation per line, with one equals sign per equation.")

    symbol_table = _symbols_in([side for pair in sides for side in pair])
    variables = [symbol_table[name] for name in sorted(symbol_table)]
    equations = [sp.Eq(_parse(left, symbol_table), _parse(right, symbol_table), evaluate=False) for left, right in sides]
    if sum(sp.count_ops(equation) for equation in equations) > MAX_EXPRESSION_OPERATIONS:
        raise ValueError("That equation system is too complex for this prototype.")
    if not variables:
        truth = all(sp.simplify(equation.lhs - equation.rhs) == 0 for equation in equations)
        if truth:
            return {"kind": "equation", "text": "The equation is an identity.", "latex": r"\text{Identity}", "steps": ["Both sides simplify to the same value."]}
        return {"kind": "equation", "text": "No solution.", "latex": r"\text{No solution}", "steps": ["The equation is false for every value."]}

    try:
        solutions = sp.solve(equations, variables, dict=True, simplify=True)
    except Exception as error:
        raise ValueError("SymPy could not solve this equation or system in closed form.") from error
    if not solutions:
        differences = [sp.simplify(equation.lhs - equation.rhs) for equation in equations]
        if all(difference == 0 for difference in differences):
            return {"kind": "equation", "text": "Every value of the listed variables is a solution.", "latex": r"\text{All values}", "steps": ["Each equation is an identity."]}
        return {"kind": "equation", "text": "No solution.", "latex": r"\text{No solution}", "steps": ["The equations have no common solution."]}

    rendered_solutions: list[str] = []
    latex_solutions: list[str] = []
    for solution in solutions:
        entries = [f"{symbol} = {sp.sstr(sp.simplify(solution[symbol]))}" for symbol in variables if symbol in solution]
        free = [str(symbol) for symbol in variables if symbol not in solution]
        if free:
            entries.append(f"free: {', '.join(free)}")
        rendered_solutions.append(", ".join(entries) if entries else "all values")
        latex_solutions.append(",\\quad ".join(f"{sp.latex(symbol)}={sp.latex(sp.simplify(solution[symbol]))}" for symbol in variables if symbol in solution) or r"\text{all values}")
    text = "; ".join(rendered_solutions)
    latex = r";\quad ".join(latex_solutions)
    variable_names = ", ".join(str(symbol) for symbol in variables)
    steps = [
        f"Rearrange {len(equations)} equation(s) and collect terms in {variable_names}.",
    ]
    try:
        matrix, vector = sp.linear_eq_to_matrix(equations, variables)
        augmented = matrix.row_join(vector)
        reduced, _ = augmented.rref()
        steps.append(f"Row-reduce the augmented matrix: {sp.sstr(augmented)} → {sp.sstr(reduced)}.")
    except Exception:
        steps.append("Apply symbolic polynomial-solving rules to the equation system.")
    steps.append(f"Therefore: {text}.")
    if any(any(symbol not in solution for symbol in variables) for solution in solutions):
        steps.append("Variables marked free are parameters, so the system has infinitely many solutions.")
    return {"kind": "equation", "text": text, "latex": latex, "steps": steps}


def check_work_steps(problem: str, work: str) -> dict[str, Any]:
    """Check consecutive one-variable linear equations for equivalent solutions."""
    lines = [line.strip() for line in work.splitlines() if line.strip()]
    if not problem.strip() or not lines:
        raise ValueError("Enter the original equation and at least one line of working.")
    if len(lines) > 20:
        raise ValueError("Enter no more than 20 lines of working.")

    def equation_parts(source: str) -> tuple[str, str]:
        parts = source.split("=")
        if len(parts) != 2 or not all(part.strip() for part in parts):
            raise ValueError("Write every line as an equation, for example 2x + 3 = 11.")
        return parts[0].strip(), parts[1].strip()

    all_parts = [equation_parts(problem)] + [equation_parts(line) for line in lines]
    symbol_table = _symbols_in([part for pair in all_parts for part in pair])
    if len(symbol_table) != 1:
        raise ValueError("Step checking currently supports one-variable equations.")
    variable = next(iter(symbol_table.values()))

    def solution(source_parts: tuple[str, str]) -> tuple[str, sp.Expr | None]:
        left, right = (_parse(side, symbol_table) for side in source_parts)
        difference = sp.expand(left - right)
        try:
            polynomial = sp.Poly(difference, variable)
        except sp.PolynomialError as error:
            raise ValueError("Step checking currently supports polynomial linear equations only.") from error
        if polynomial.degree() > 1:
            raise ValueError("Step checking currently supports linear equations only.")
        if polynomial.is_zero:
            return ("all", None)
        if polynomial.degree() == 0:
            return ("none", None)
        roots = sp.solve(sp.Eq(left, right), variable)
        return ("one", sp.simplify(roots[0])) if roots else ("none", None)

    reference = solution(all_parts[0])
    previous = all_parts[0]
    for index, current in enumerate(all_parts[1:], start=1):
        current_solution = solution(current)
        if current_solution != reference:
            prior = solution(previous)
            correction = None
            if prior[0] == "one":
                correction = f"A solution-preserving next line is {variable} = {sp.sstr(prior[1])}."
            elif prior[0] == "all":
                correction = "The previous line is true for every value; recheck why the next line restricts it."
            else:
                correction = "The previous line has no solution; recheck the transformation that followed it."
            return {
                "correct": False,
                "first_incorrect_step": index,
                "message": f"Step {index} changes the solution set. {correction}",
                "checked_steps": len(lines),
            }
        previous = current
    return {
        "correct": True,
        "first_incorrect_step": None,
        "message": "Each written equation keeps the same solution set as the original.",
        "checked_steps": len(lines),
    }


def expressions_equivalent(expected: str, actual: str) -> bool:
    """Return whether two safe-parser expressions are symbolically identical."""
    if len(expected) > MAX_EXPRESSION_LENGTH or len(actual) > MAX_EXPRESSION_LENGTH:
        raise ValueError("Enter expressions with at most 400 characters each.")
    symbols = _symbols_in([expected, actual])
    expected_expr = _parse(expected, symbols)
    actual_expr = _parse(actual, symbols)
    difference = sp.simplify(sp.together(expected_expr - actual_expr))
    if difference == 0:
        return True
    return difference.equals(0) is True


def plot_expression(
    expression: str,
    variable: str = "x",
    x_min: float = -10,
    x_max: float = 10,
    samples: int = 241,
) -> dict[str, Any]:
    """Return safe, sampled SVG-ready data for a one-variable expression/equation."""
    if not re.fullmatch(r"[A-Za-z]", variable):
        raise ValueError("Choose one letter as the graph variable.")
    if not (math.isfinite(x_min) and math.isfinite(x_max) and x_min < x_max):
        raise ValueError("Choose a finite x-range with the minimum below the maximum.")
    if x_max - x_min > 2000:
        raise ValueError("Choose an x-range no wider than 2000 units.")
    if not 20 <= samples <= 1000:
        raise ValueError("Choose between 20 and 1000 graph samples.")

    sides = expression.split("=")
    if len(sides) > 2 or not all(side.strip() for side in sides):
        raise ValueError("Enter one expression or a single equation to graph.")
    symbols = _symbols_in(sides)
    if any(name != variable for name in symbols):
        raise ValueError("Graphing currently supports one variable at a time. Choose a single-variable expression.")
    symbols.setdefault(variable, sp.Symbol(variable, real=True))
    variable_symbol = symbols[variable]
    parsed = [_parse(side, symbols) for side in sides]
    if any(item.count_ops() > MAX_EXPRESSION_OPERATIONS for item in parsed):
        raise ValueError("That expression is too complex to graph.")

    step = (x_max - x_min) / (samples - 1)
    x_values = [x_min + index * step for index in range(samples)]
    curves = []
    if len(parsed) == 2:
        curves.append(("Left side", parsed[0]))
        curves.append(("Right side", parsed[1]))
    else:
        curves.append((f"y = {sp.sstr(parsed[0])}", parsed[0]))

    series = []
    for label, formula in curves:
        values = []
        for x_value in x_values:
            try:
                value = sp.N(formula.subs(variable_symbol, x_value), 14)
                if value.is_real is not True:
                    values.append(None)
                    continue
                number = float(value)
                values.append(number if math.isfinite(number) and abs(number) < 1e12 else None)
            except (TypeError, ValueError, OverflowError, ZeroDivisionError):
                values.append(None)
        series.append({"label": label, "values": values})
    if not any(value is not None for curve in series for value in curve["values"]):
        raise ValueError("No real graph values were found in this x-range. Try a different range.")
    return {"x": x_values, "series": series, "variable": variable}


def plot_surface(
    expression: str,
    x_variable: str = "x",
    y_variable: str = "y",
    x_min: float = -5,
    x_max: float = 5,
    y_min: float = -5,
    y_max: float = 5,
    samples: int = 41,
) -> dict[str, Any]:
    """Sample a two-variable function for an in-browser contour plot."""
    if not re.fullmatch(r"[A-Za-z]", x_variable) or not re.fullmatch(r"[A-Za-z]", y_variable) or x_variable == y_variable:
        raise ValueError("Choose two different single-letter graph variables.")
    if not all(math.isfinite(value) for value in (x_min, x_max, y_min, y_max)):
        raise ValueError("Graph ranges must be finite numbers.")
    if x_min >= x_max or y_min >= y_max:
        raise ValueError("Each graph minimum must be below its maximum.")
    if x_max - x_min > 200 or y_max - y_min > 200:
        raise ValueError("Choose x- and y-ranges no wider than 200 units.")
    if not 15 <= samples <= 81:
        raise ValueError("Choose between 15 and 81 samples per variable.")

    sides = expression.split("=")
    if len(sides) > 2 or not all(side.strip() for side in sides):
        raise ValueError("Enter one expression or a single equation to graph.")
    symbols = _symbols_in(sides)
    allowed = {x_variable, y_variable}
    if any(name not in allowed for name in symbols):
        raise ValueError("This graph can use only the selected two variables.")
    symbols.setdefault(x_variable, sp.Symbol(x_variable, real=True))
    symbols.setdefault(y_variable, sp.Symbol(y_variable, real=True))
    if len(sides) == 2:
        formula = _parse(sides[0], symbols) - _parse(sides[1], symbols)
        label = f"{sides[0].strip()} = {sides[1].strip()} (zero contour)"
        is_equation = True
    else:
        formula = _parse(sides[0], symbols)
        label = f"z = {sides[0].strip()}"
        is_equation = False
    if formula.count_ops() > MAX_EXPRESSION_OPERATIONS:
        raise ValueError("That expression is too complex to graph.")

    x_values = [x_min + index * (x_max - x_min) / (samples - 1) for index in range(samples)]
    y_values = [y_min + index * (y_max - y_min) / (samples - 1) for index in range(samples)]
    grid: list[list[float | None]] = []
    for y_value in y_values:
        row = []
        for x_value in x_values:
            try:
                value = sp.N(formula.subs({symbols[x_variable]: x_value, symbols[y_variable]: y_value}), 12)
                if value.is_real is not True:
                    row.append(None)
                    continue
                number = float(value)
                row.append(number if math.isfinite(number) and abs(number) < 1e12 else None)
            except (TypeError, ValueError, OverflowError, ZeroDivisionError):
                row.append(None)
        grid.append(row)
    if not any(value is not None for row in grid for value in row):
        raise ValueError("No real graph values were found in these ranges. Try a different range.")
    return {
        "x": x_values,
        "y": y_values,
        "z": grid,
        "x_variable": x_variable,
        "y_variable": y_variable,
        "label": label,
        "is_equation": is_equation,
    }


def _solve_homogeneous_first_order_ode(expression: str, variable: str) -> dict[str, Any]:
    """Solve the separable first-order form y' = g(x)y."""
    match = re.fullmatch(r"\s*([A-Za-z])prime\s*=\s*(.+)\s*", expression)
    if not match:
        raise ValueError("For now, differential-equation solving supports y' = g(x)y form.")
    dependent_name, right_side = match.groups()
    if dependent_name == variable:
        raise ValueError("Choose different dependent and independent variables.")
    symbols = _symbols_in([right_side], {variable})
    dependent = symbols.get(dependent_name)
    if dependent is None:
        raise ValueError("The right side must contain the dependent function, such as y in y' = g(x)y.")
    if any(name not in {variable, dependent_name} for name in symbols):
        raise ValueError("This differential-equation solver supports one independent variable and one dependent function.")
    rhs = _parse(right_side, symbols)
    coefficient = sp.simplify(rhs / dependent)
    if dependent in coefficient.free_symbols:
        raise ValueError("The right side must be a function of the independent variable multiplied by y.")
    x = symbols[variable]
    integrated = sp.integrate(coefficient, x)
    if integrated.has(sp.Integral):
        raise ValueError("SymPy could not integrate this coefficient to solve the differential equation.")
    function = sp.Function(dependent_name)
    solution = sp.dsolve(sp.Eq(sp.diff(function(x), x), coefficient * function(x)), function(x))
    if not isinstance(solution, sp.Equality) or solution.rhs.has(sp.Integral):
        raise ValueError("SymPy could not find a closed-form solution for this differential equation.")
    answer = sp.simplify(solution.rhs)
    steps = [
        {
            "title": "Separate the dependent function from the x-dependent coefficient.",
            "math": rf"\frac{{{dependent_name}'}}{{{dependent_name}}}={sp.latex(coefficient)}",
        },
        {
            "title": "Integrate both sides with respect to x.",
            "math": rf"\ln|{dependent_name}|={sp.latex(integrated)}+C",
        },
        {
            "title": "Exponentiate and include the arbitrary constant in the general solution.",
            "math": sp.latex(sp.Eq(function(x), answer)),
        },
    ]
    return {
        "text": sp.sstr(answer),
        "latex": sp.latex(answer),
        "answer": f"{dependent_name}({variable}) = {sp.sstr(answer)}",
        "steps": steps,
        "verified": True,
        "operation": "ode",
    }


def calculate(
    expression: str,
    operation: str,
    variable: str = "x",
    lower: str | None = None,
    upper: str | None = None,
    order: int = 1,
) -> dict[str, Any]:
    """Compute supported exact symbolic arithmetic, calculus, or equation solutions."""
    if operation == "solve":
        return _solve(expression)
    if operation == "ode":
        if not re.fullmatch(r"[A-Za-z]", variable):
            raise ValueError("Use one letter as the independent variable.")
        return _solve_homogeneous_first_order_ode(expression, variable)
    if not re.fullmatch(r"[A-Za-z]", variable):
        raise ValueError("Use one letter as the differentiation variable.")
    if not isinstance(order, int) or not 1 <= order <= 4:
        raise ValueError("Choose a derivative or repeated integral order from 1 to 4.")
    symbol_table = _symbols_in([expression], {variable} if operation in {"diff", "integrate", "defint"} else set())
    x = symbol_table.get(variable, sp.Symbol(variable, real=True))
    expr = _parse(expression, symbol_table)
    if expr.count_ops() > MAX_EXPRESSION_OPERATIONS:
        raise ValueError("That expression is too complex for this prototype.")

    if operation == "evaluate":
        if expr.free_symbols:
            raise ValueError("A numerical expression cannot contain an unassigned variable.")
        result = sp.simplify(expr)
        verified = True
    elif operation == "diff":
        result = sp.diff(expr, x, order)
        verified = sp.simplify(sp.diff(expr, x, order) - result) == 0
    elif operation == "integrate":
        result = expr
        for _ in range(order):
            result = sp.integrate(result, x)
        verified = not result.has(sp.Integral) and sp.simplify(sp.diff(result, x, order) - expr) == 0
    elif operation == "defint":
        if order != 1:
            raise ValueError("Definite integrals use one integration operation at a time.")
        if lower is None or upper is None:
            raise ValueError("Enter both integration bounds.")
        lo = _parse(lower, {})
        hi = _parse(upper, {})
        if lo.free_symbols or hi.free_symbols:
            raise ValueError("Integration bounds must be numeric expressions without variables.")
        result = sp.integrate(expr, (x, lo, hi))
        verified = not result.has(sp.Integral)
    else:
        raise ValueError("Choose differentiate, integrate, or definite integral.")

    if not verified or result.has(sp.Integral):
        raise ValueError("SymPy could not find a supported symbolic result for this expression.")
    if result.has(sp.nan, sp.zoo) or result.is_finite is False:
        raise ValueError("The result is undefined or does not converge for these bounds.")

    exact = sp.simplify(result)
    numeric_value = None
    if operation == "evaluate" and exact.is_real is True:
        try:
            candidate = float(sp.N(exact))
            if math.isfinite(candidate):
                numeric_value = candidate
        except (TypeError, ValueError, OverflowError):
            pass
    return {
        "latex": sp.latex(exact),
        "text": sp.sstr(exact),
        "numeric": numeric_value,
        "verified": True,
        "operation": operation,
        "order": order,
    }

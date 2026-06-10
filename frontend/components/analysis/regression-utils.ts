import type { MarketBar } from "@/types";

export type RegressionModel =
  | "linear"
  | "quadratic"
  | "exponential"
  | "logarithmic";

export type RegressionPoint = {
  timestamp: string;
  t: number;
  close: number;
  fitted: number;
  residual: number;
  residualPct: number | null;
};

export type RegressionResult = {
  model: RegressionModel;
  formula: string;
  r2: number;
  rmse: number;
  mae: number;
  fittedChangePct: number | null;
  points: RegressionPoint[];
};

type SourcePoint = {
  timestamp: string;
  t: number;
  close: number;
};

const MIN_POINTS = 3;

export function fitRegression(
  bars: MarketBar[],
  model: RegressionModel
): RegressionResult | null {
  const points = regressionSourcePoints(bars);
  if (points.length < MIN_POINTS) return null;

  switch (model) {
    case "linear":
      return fitBasisModel(points, model, [() => 1, (p) => p.t]);
    case "quadratic":
      return fitBasisModel(points, model, [
        () => 1,
        (p) => p.t,
        (p) => p.t * p.t,
      ]);
    case "logarithmic":
      return fitBasisModel(points, model, [() => 1, (p) => Math.log1p(p.t)]);
    case "exponential":
      return fitExponentialModel(points);
  }
}

export function regressionSourcePoints(bars: MarketBar[]): SourcePoint[] {
  return bars
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((bar, index) => ({
      timestamp: bar.timestamp,
      t: index,
      close: bar.close,
    }));
}

function fitBasisModel(
  points: SourcePoint[],
  model: Exclude<RegressionModel, "exponential">,
  basisFns: Array<(point: SourcePoint) => number>
): RegressionResult | null {
  const coefficients = solveLeastSquares(points, basisFns, (point) => point.close);
  if (!coefficients) return null;

  const rows = points.map((point) => {
    const basis = basisFns.map((fn) => fn(point));
    const fitted = dot(coefficients, basis);
    return pointResult(point, fitted);
  });

  return buildResult(model, rows, formulaForModel(model, coefficients));
}

function fitExponentialModel(points: SourcePoint[]): RegressionResult | null {
  const positivePoints = points.filter((point) => point.close > 0);
  if (positivePoints.length < MIN_POINTS) return null;

  const coefficients = solveLeastSquares(
    positivePoints,
    [() => 1, (point) => point.t],
    (point) => Math.log(point.close)
  );
  if (!coefficients) return null;

  const [alpha, b] = coefficients;
  const a = Math.exp(alpha);
  const rows = positivePoints.map((point) =>
    pointResult(point, a * Math.exp(b * point.t))
  );

  return buildResult("exponential", rows, formulaForModel("exponential", [a, b]));
}

function solveLeastSquares(
  points: SourcePoint[],
  basisFns: Array<(point: SourcePoint) => number>,
  valueForPoint: (point: SourcePoint) => number
): number[] | null {
  const size = basisFns.length;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const vector = Array(size).fill(0);

  for (const point of points) {
    const basis = basisFns.map((fn) => fn(point));
    const value = valueForPoint(point);
    if (!Number.isFinite(value) || basis.some((item) => !Number.isFinite(item))) {
      return null;
    }

    for (let row = 0; row < size; row += 1) {
      vector[row] += basis[row] * value;
      for (let col = 0; col < size; col += 1) {
        matrix[row][col] += basis[row] * basis[col];
      }
    }
  }

  return solveLinearSystem(matrix, vector);
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let bestRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[bestRow][pivot])) {
        bestRow = row;
      }
    }

    if (Math.abs(augmented[bestRow][pivot]) < 1e-12) {
      return null;
    }

    [augmented[pivot], augmented[bestRow]] = [augmented[bestRow], augmented[pivot]];

    const pivotValue = augmented[pivot][pivot];
    for (let col = pivot; col <= size; col += 1) {
      augmented[pivot][col] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let col = pivot; col <= size; col += 1) {
        augmented[row][col] -= factor * augmented[pivot][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function pointResult(point: SourcePoint, fitted: number): RegressionPoint {
  const residual = point.close - fitted;
  return {
    ...point,
    fitted,
    residual,
    residualPct: point.close === 0 ? null : (residual / point.close) * 100,
  };
}

function buildResult(
  model: RegressionModel,
  points: RegressionPoint[],
  formula: string
): RegressionResult | null {
  if (points.length < MIN_POINTS || points.some((point) => !Number.isFinite(point.fitted))) {
    return null;
  }

  const mean = points.reduce((sum, point) => sum + point.close, 0) / points.length;
  const ssRes = points.reduce((sum, point) => sum + point.residual ** 2, 0);
  const ssTot = points.reduce((sum, point) => sum + (point.close - mean) ** 2, 0);
  const absResidual = points.reduce((sum, point) => sum + Math.abs(point.residual), 0);
  const firstFitted = points[0]?.fitted;
  const lastFitted = points[points.length - 1]?.fitted;

  return {
    model,
    formula,
    r2: ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot,
    rmse: Math.sqrt(ssRes / points.length),
    mae: absResidual / points.length,
    fittedChangePct:
      firstFitted && Number.isFinite(firstFitted) && Number.isFinite(lastFitted)
        ? ((lastFitted - firstFitted) / Math.abs(firstFitted)) * 100
        : null,
    points,
  };
}

function formulaForModel(model: RegressionModel, coefficients: number[]): string {
  switch (model) {
    case "linear":
      return `y = ${term(coefficients[0])} ${signedTerm(coefficients[1])}t`;
    case "quadratic":
      return `y = ${term(coefficients[0])} ${signedTerm(coefficients[1])}t ${signedTerm(coefficients[2])}t^2`;
    case "logarithmic":
      return `y = ${term(coefficients[0])} ${signedTerm(coefficients[1])}ln(t + 1)`;
    case "exponential":
      return `y = ${term(coefficients[0])}e^(${term(coefficients[1])}t)`;
  }
}

function dot(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function signedTerm(value: number) {
  return value < 0 ? `- ${term(Math.abs(value))}` : `+ ${term(value)}`;
}

function term(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toPrecision(5)).toString();
}

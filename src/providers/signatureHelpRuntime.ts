import * as vscode from 'vscode';

type Param = { label: string; documentation?: string };

type Sig = {
  label: string;
  documentation?: string;
  parameters: Param[];
};

type SigMap = Record<string, Sig[]>;

const intrinsics: SigMap = {
  mul: [
    {
      label: 'mul(a, b)',
      documentation: 'Multiplies two values (vector/matrix).',
      parameters: [
        { label: 'a' },
        { label: 'b' }
      ]
    }
  ],
  normalize: [
    {
      label: 'normalize(x)',
      documentation: 'Returns a normalized vector.',
      parameters: [{ label: 'x' }]
    }
  ],
  dot: [
    {
      label: 'dot(a, b)',
      documentation: 'Dot product.',
      parameters: [{ label: 'a' }, { label: 'b' }]
    }
  ],
  cross: [
    {
      label: 'cross(a, b)',
      documentation: 'Cross product (float3).',
      parameters: [{ label: 'a' }, { label: 'b' }]
    }
  ],
  lerp: [
    {
      label: 'lerp(a, b, s)',
      documentation: 'Linear interpolation.',
      parameters: [{ label: 'a' }, { label: 'b' }, { label: 's' }]
    }
  ],
  saturate: [
    {
      label: 'saturate(x)',
      documentation: 'Clamps x to [0..1].',
      parameters: [{ label: 'x' }]
    }
  ],
  clamp: [
    {
      label: 'clamp(x, minVal, maxVal)',
      documentation: 'Clamps x to [minVal..maxVal].',
      parameters: [{ label: 'x' }, { label: 'minVal' }, { label: 'maxVal' }]
    }
  ],
  min: [
    {
      label: 'min(a, b)',
      documentation: 'Minimum of a and b.',
      parameters: [{ label: 'a' }, { label: 'b' }]
    }
  ],
  max: [
    {
      label: 'max(a, b)',
      documentation: 'Maximum of a and b.',
      parameters: [{ label: 'a' }, { label: 'b' }]
    }
  ],
  abs: [
    {
      label: 'abs(x)',
      documentation: 'Absolute value.',
      parameters: [{ label: 'x' }]
    }
  ],
  pow: [
    {
      label: 'pow(x, y)',
      documentation: 'x raised to the power y.',
      parameters: [{ label: 'x' }, { label: 'y' }]
    }
  ],
  floor: [
    {
      label: 'floor(x)',
      documentation: 'Largest integer less than or equal to x.',
      parameters: [{ label: 'x' }]
    }
  ],
  ceil: [
    {
      label: 'ceil(x)',
      documentation: 'Smallest integer greater than or equal to x.',
      parameters: [{ label: 'x' }]
    }
  ],
  round: [
    {
      label: 'round(x)',
      documentation: 'Rounds to nearest integer.',
      parameters: [{ label: 'x' }]
    }
  ],
  frac: [
    {
      label: 'frac(x)',
      documentation: 'Fractional part of x.',
      parameters: [{ label: 'x' }]
    }
  ],
  sin: [
    { label: 'sin(x)', documentation: 'Sine.', parameters: [{ label: 'x' }] }
  ],
  cos: [
    { label: 'cos(x)', documentation: 'Cosine.', parameters: [{ label: 'x' }] }
  ],
  sqrt: [
    { label: 'sqrt(x)', documentation: 'Square root.', parameters: [{ label: 'x' }] }
  ],
  fmod: [
    { label: 'fmod(x, y)', documentation: 'Floating-point remainder.', parameters: [{ label: 'x' }, { label: 'y' }] }
  ],
  ddx: [
    { label: 'ddx(x)', documentation: 'Derivative in screen-space x direction.', parameters: [{ label: 'x' }] }
  ],
  ddy: [
    { label: 'ddy(x)', documentation: 'Derivative in screen-space y direction.', parameters: [{ label: 'x' }] }
  ]
};

const methods: SigMap = {
  Sample: [
    {
      label: 'Sample(sampler, location)',
      documentation: 'Samples a texture at location.',
      parameters: [{ label: 'sampler' }, { label: 'location' }]
    }
  ],
  SampleLevel: [
    {
      label: 'SampleLevel(sampler, location, lod)',
      documentation: 'Samples a texture at explicit LOD.',
      parameters: [{ label: 'sampler' }, { label: 'location' }, { label: 'lod' }]
    }
  ],
  SampleBias: [
    {
      label: 'SampleBias(sampler, location, bias)',
      documentation: 'Samples a texture with LOD bias.',
      parameters: [{ label: 'sampler' }, { label: 'location' }, { label: 'bias' }]
    }
  ],
  SampleGrad: [
    {
      label: 'SampleGrad(sampler, location, ddx, ddy)',
      documentation: 'Samples a texture with explicit gradients.',
      parameters: [{ label: 'sampler' }, { label: 'location' }, { label: 'ddx' }, { label: 'ddy' }]
    }
  ],
  SampleCmp: [
    {
      label: 'SampleCmp(sampler, location, compareValue)',
      documentation: 'Samples a comparison texture.',
      parameters: [{ label: 'sampler' }, { label: 'location' }, { label: 'compareValue' }]
    }
  ],
  SampleCmpLevelZero: [
    {
      label: 'SampleCmpLevelZero(sampler, location, compareValue)',
      documentation: 'Samples a comparison texture at LOD 0.',
      parameters: [{ label: 'sampler' }, { label: 'location' }, { label: 'compareValue' }]
    }
  ],
  GetDimensions: [
    {
      label: 'GetDimensions(out width, out height)',
      documentation: 'Returns texture dimensions.',
      parameters: [{ label: 'width' }, { label: 'height' }]
    },
    {
      label: 'GetDimensions(mipLevel, out width, out height, out numberOfLevels)',
      documentation: 'Returns texture dimensions for mipLevel.',
      parameters: [{ label: 'mipLevel' }, { label: 'width' }, { label: 'height' }, { label: 'numberOfLevels' }]
    }
  ]
};

function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function parseCallContext(text: string, offset: number): { name: string; activeParam: number } | null {
  let i = offset - 1;
  let depthParen = 0;
  let depthBracket = 0;
  let depthCurly = 0;
  let inString: '"' | "'" | null = null;
  let activeParam = 0;

  while (i >= 0) {
    const ch = text[i] ?? '';

    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') {
        inString = null;
      }
      i--;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch as '"' | "'";
      i--;
      continue;
    }

    if (ch === ')') depthParen++;
    else if (ch === '(') {
      if (depthParen === 0 && depthBracket === 0 && depthCurly === 0) {
        break;
      }
      depthParen = Math.max(0, depthParen - 1);
    } else if (ch === ']') depthBracket++;
    else if (ch === '[') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === '}') depthCurly++;
    else if (ch === '{') depthCurly = Math.max(0, depthCurly - 1);
    else if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthCurly === 0) {
      activeParam++;
    }

    i--;
  }

  if (i < 0) return null;

  // i is at '('
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j] ?? '')) j--;
  if (j < 0) return null;

  // read identifier backwards
  let end = j;
  while (j >= 0 && isIdentChar(text[j] ?? '')) j--;
  const name = text.slice(j + 1, end + 1);
  if (!name) return null;

  return { name, activeParam };
}

function buildSignatureHelp(name: string, activeParam: number): vscode.SignatureHelp | null {
  const sigs = intrinsics[name] ?? methods[name];
  if (!sigs || sigs.length === 0) return null;

  const help = new vscode.SignatureHelp();
  help.activeSignature = 0;

  for (const s of sigs) {
    const si = new vscode.SignatureInformation(s.label, s.documentation);
    si.parameters = s.parameters.map(p => new vscode.ParameterInformation(p.label, p.documentation));
    help.signatures.push(si);
  }

  const first = help.signatures[0];
  help.activeParameter = Math.max(0, Math.min(activeParam, Math.max(0, (first?.parameters?.length ?? 1) - 1)));

  return help;
}

export function provideSignatureHelp(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  context: vscode.SignatureHelpContext
): vscode.SignatureHelp | null {
  if (token.isCancellationRequested) return null;

  const text = document.getText();
  const offset = document.offsetAt(position);
  const call = parseCallContext(text, offset);
  if (!call) return null;

  return buildSignatureHelp(call.name, call.activeParam);
}

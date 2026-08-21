# Testing AZSL Basic

AZSL Basic is a TypeScript/VS Code extension. Its executable code cannot be
loaded by O3DE's C++ AzTest/GoogleTest runner, so the repository uses Vitest and
V8 coverage. Atom's shader sources are used as a real-world compatibility
corpus. AzTest remains appropriate for C++ contracts inside O3DE, but adding a
C++ test binary here would not exercise the extension.

## Commands

```powershell
npm ci
npm run compile
npm test
npm run test:differential
npm run test:coverage
```

The HTML coverage report is written to `coverage/index.html`.

To run the optional real-corpus test on Windows, provide one or more roots using
the platform path delimiter (`;` on Windows):

```powershell
$env:AZSL_TEST_CORPUS_ROOTS = 'D:\O3DE\Engines\development\o3de\Gems\Atom;D:\O3DE\ShaderKit-O3DE-main'
$env:AZSL_ATOM_GEM_PATH = 'D:\O3DE\Engines\development\o3de\Gems\Atom'
$env:AZSL_SHADERKIT_PATH = 'D:\O3DE\ShaderKit-O3DE-main'
npm run test:corpus
```

The corpus test is skipped when `AZSL_TEST_CORPUS_ROOTS` is absent, so a clean
checkout remains portable and CI does not depend on an external O3DE checkout.

## Baseline audit (2026-08-21)

The baseline run used Atom from the local O3DE `development` checkout and the
provided ShaderKit library:

| Corpus | Files | Macros | Atom methods | SRGs | Structs | Functions | Options |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Atom `development` | 450 | 885 | 32 | 127 | 191 | 1,079 | 118 |
| ShaderKit | 16 | 8 | 0 | 11 | 21 | 50 | 6 |

The current baseline has 119 passing tests when the eighteen corpus cases are
enabled (101 portable tests otherwise). Overall source coverage is 54.29%
lines. The indexer parsers reach 86.83% lines / 81.45% branches, while the pure
diagnostics modules reach 93.98% lines / 86.16% branches.

The low overall number is useful: it exposes the areas that still have no
executable specification.

| Area | Baseline | Risk / next test layer |
| --- | ---: | --- |
| `diagnosticsRuntime.ts` | 72.35% | Reduced from 2,032 to about 1,350 lines. Function scopes, member access, calls, and source syntax are extracted; continue with type-flow and ODR validation. |
| `completionRuntime.ts` | 0% | Add expression/member completion tables and tests for Atom SRGs, user structs, texture methods, and cancellation. |
| definitions / hover / code actions | 0% | Add mocked-provider tests, then a small VS Code Extension Host suite for registration and virtual documents. |
| semantic tokens | 0% | Add golden token snapshots for modern Unlit, Wireframe geometry attributes, SRGs, options, and preprocessor forms. |
| activation/configuration | 0% | Add Extension Host tests for activation, reindex, configuration changes, and disposal. |
| TextMate grammar | not measured | Add grammar scope snapshots; runtime coverage cannot validate JSON syntax highlighting. |

## Problems found by the initial tests

The characterization suite found and now guards these defects:

- guarded macros were indexed twice;
- `static option` declarations were skipped;
- user-defined and `enum class` option types from Atom were skipped;
- global functions after next-line-brace classes were lost;
- Atom `Surface` methods leaked beyond the closing class brace;
- SRG and struct members leaked beyond a same-line opening brace;
- document symbols used the option type (`bool`) instead of the option variable;
- unrelated non-static options from the global Atom index triggered fallback errors in every `.azsl` file;
- valid geometry/loop attributes such as `[maxvertexcount]` and `[unroll]` were reported as undeclared;
- typed SRG textures such as `Texture2D<float4>` were absent from the diagnostic type model;
- raw brace counting treated braces in comments, strings and preprocessor directives as real scopes;
- function-scope inference did not model `void` geometry entry points or `triangle`/stream parameters robustly;
- multiline geometry parameters were treated as undeclared names;
- missing local struct members and invalid vector swizzles were not diagnosed;
- local function arity, unknown calls, and `TriangleStream.Append` element types were not checked;
- include-provided functions and fallback SRGs were invisible to diagnostics;
- default parameters, array struct members, SRG sampler blocks, and multiline expressions caused false positives;
- the initial test dependency version contained a critical advisory and was
  upgraded to Vitest 3.2.6; `npm audit` now reports zero vulnerabilities.

## Reference-shader observations

ShaderKit's modern Unlit shader is a good baseline for includes, shared option
declarations, Atom `ForwardPassOutput`, and helper functions. Wireframe expands
the required surface with a geometry stage, `[maxvertexcount]`,
`TriangleStream`, `fwidth`, and `clip`. The corpus test proves the files do not
crash the indexers, but it does not prove that diagnostics, completion, hover,
or semantic tokens are correct. Those features need the provider and Extension
Host tests listed above.

All 16 ShaderKit AZSL/AZSLI files now have diagnostic regression tests backed by
an index of the 450 Atom `development` shader files. They currently produce zero
extension diagnostics. This includes PSX, StylizedWater, Hologram, every Unlit
pass and UnlitShared, Toon, and Wireframe. Negative fixtures separately verify
that invalid SRG members, missing variant-fallback SRGs, malformed member access,
and invalid calls are still reported.

The differential corpus in `tests/fixtures/differential` adds twenty intentional
failures and matching `.shader` descriptors. The extension currently reports
16/20 with no false positives for multiline geometry parameters; Asset
Processor reports all twenty (nineteen errors and one DXC conversion warning).
See the corpus README for the per-marker matrix and AP environment notes.

The second differential corpus in `tests/fixtures/differential-round2` adds
twenty independent jobs ranging from unterminated include quotes and missing
delimiters to ODR, return-type, array-bound, geometry-attribute, preprocessor,
and shader-option failures. The extension now reports 8/20: both malformed
include forms, a missing semicolon, three unbalanced-delimiter cases, a missing
`#endif`, and a fixed-arity macro mismatch. Asset Processor rejects all 20/20
at the preprocessor, AZSLc, DXC, or Shader Builder layer. The remaining misses
are explicitly preserved as characterization expectations.

Regex-based parsing also remains vulnerable to other multiline declarations,
preprocessor token pasting such as `prefix##o_name`, nested comments/strings,
and ambiguous include basenames. Longer-term work should share one lightweight
lexer between indexing, diagnostics, symbols, and semantic tokens instead of
maintaining independent regular-expression grammars.

# AZSL diagnostics differential corpus, round 2

This corpus contains twenty independent shader jobs, labelled `AZERR21` through
`AZERR40`. Each `.azsl` source has its own `.shader` descriptor so one parser or
compiler failure cannot hide another. The comparison used O3DE 26.05 Asset
Processor with AZSLc 1.8.20 and DXC on 2026-08-21.

## Result

| Marker | Intended defect | Extension | Asset Processor primary result |
|---|---|---|---|
| AZERR21 | Missing closing quote in `#include` | Error | Preprocessor: unterminated string literal |
| AZERR22 | Missing closing `>` in `#include` | Error | Preprocessor: unterminated header name |
| AZERR23 | Missing semicolon | Error | AZSLc syntax error: missing `;` at `return` |
| AZERR24 | Missing closing call parenthesis | Error | AZSLc syntax error: missing `)` at `;` |
| AZERR25 | Missing closing function brace | Error | AZSLc syntax error: unexpected EOF |
| AZERR26 | Unexpected closing brace | Error | AZSLc syntax error: extraneous `}` |
| AZERR27 | Unknown type | Miss | DXC error: unknown type name |
| AZERR28 | Duplicate struct member | Miss | AZSLc ODR error: member redeclaration |
| AZERR29 | Duplicate identical function | Miss | AZSLc ODR error: function already defined |
| AZERR30 | Too few `float4` constructor components | Miss | DXC error: expected 4 elements, got 2 |
| AZERR31 | Assignment between incompatible structs | Miss | DXC error: cannot implicitly convert struct type |
| AZERR32 | Returning a value from `void` | Miss | DXC return-type error |
| AZERR33 | Missing value in non-void `return` | Miss | DXC return-type error |
| AZERR34 | Assignment to a `const` local | Miss | DXC error: cannot assign to const-qualified variable |
| AZERR35 | Constant array index out of bounds | Miss | DXC error: array index 3 is out of bounds |
| AZERR36 | Unsupported fragment output semantic | Miss | Shader Builder error: unsupported output semantic |
| AZERR37 | Negative geometry `maxvertexcount` | Miss | AZSLc syntax error at negative attribute argument |
| AZERR38 | Missing `#endif` | Error | Preprocessor: end of input inside `#if` |
| AZERR39 | Too few macro arguments | Error | Preprocessor: fewer than required arguments |
| AZERR40 | Invalid default for `option bool` | Miss | ShaderOption error: invalid default value `2` |

The extension reports 8/20, up from 0/20; Asset Processor rejects 20/20. The
new source-syntax pass covers malformed includes, conditional-directive nesting,
balanced `()[]{}`, fixed-arity local macro calls, and the simple missing-`;`
case. It masks comments, quoted text, and preprocessor bodies before delimiter
analysis, avoiding false braces from macros and comments. The remaining misses
are primarily ODR, type-flow, return, constant-assignment, array-bound, semantic,
geometry-attribute, and shader-option checks.

## Asset Processor notes

- The final run used `LANG=C`, `LC_ALL=C`, and `LC_CTYPE=C`.
- Full results are in per-job logs under the DevTest project's
  `user/log/JobLogs/Assets/AzslDifferentialRound2` directory; batch stdout stops
  printing complete details after enough failures.
- Generated `*.azsl.dx12.prepend` locations are shifted from fixture lines by
  the builder's prepended source.
- The SDK logs a missing development `DevTest.dll`; shader compilation still
  runs, so this is unrelated environment noise.
- Earlier trial forms of AZERR35, AZERR37, and AZERR40 exposed secondary builder
  failures. They were isolated and rerun until the final logs reached the
  intended array-bound, geometry-attribute, and option-default defects.

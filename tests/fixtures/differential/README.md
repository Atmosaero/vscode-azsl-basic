# AZSL diagnostics differential corpus

This corpus characterizes the difference between the extension diagnostics and
the O3DE 26.05 Shader Asset Builder pipeline (`AZSLc 1.8.20` plus DXC). It is
based on modern Unlit and Wireframe geometry-stage patterns. The source comments
label the twenty intended defects as `AZERR01` through `AZERR20`.

## Result

| Marker | Intended defect | Extension | Asset Processor |
|---|---|---|---|
| AZERR01 | Missing struct member | Error | DXC error |
| AZERR02 | Out-of-bounds vector swizzle | Error | DXC error |
| AZERR03 | Undeclared value | Error | DXC error |
| AZERR04 | Missing SRG member | Error | AZSLc emitter error |
| AZERR05 | Duplicate local declaration | Miss | AZSLc ODR error |
| AZERR06 | Unknown SRG/name | Miss | DXC error |
| AZERR07 | Too few function arguments | Error | DXC error |
| AZERR08 | Unknown function | Error | DXC error |
| AZERR09 | Implicit `float4` to `float3` truncation | Miss | DXC warning |
| AZERR10 | Member missing after `.` | Error | AZSLc syntax error |
| AZERR11 | Doubled `.` | Error | AZSLc syntax error |
| AZERR12 | Member missing after `::` | Error | AZSLc syntax error |
| AZERR13 | Unknown sampler property | Error | AZSLc syntax error |
| AZERR14 | Invalid sampler enum | Error | AZSLc syntax error |
| AZERR15 | Missing sampler value | Error | AZSLc syntax error |
| AZERR16 | Missing geometry input member | Error | DXC error |
| AZERR17 | Wrong `TriangleStream.Append` type | Error | DXC error |
| AZERR18 | Missing modern Unlit input member | Error | DXC error |
| AZERR19 | Invalid modern Unlit swizzle | Error | DXC error |
| AZERR20 | Undeclared modern Unlit value | Miss | DXC error |

The extension reports 16/20 intended defects, up from 8/20, and emits no false
positives for the multiline geometry parameters in `06-geometry-errors.azsl`.
Asset Processor reports all twenty intended issues: nineteen errors and one
conversion warning.

## Asset Processor observations

- Run with `LANG=C`, `LC_ALL=C`, and `LC_CTYPE=C`. With `C.UTF-8`, the bundled
  preprocessor emits `Unknown encoding: C.UTF-8`; several parallel jobs then
  fail before AZSLc without a shader diagnostic.
- Diagnostics refer to a generated `*.azsl.dx12.prepend` file. In this run its
  line numbers were shifted by 17 lines from the fixture source.
- The duplicate-declaration diagnostic correctly identifies the redeclaration,
  but its `first seen line 68` location is not the original or simply shifted
  source location.
- Batch stdout suppresses detailed logs after enough failures. The complete
  diagnostics remain in the per-job logs under the project's `user/log/JobLogs`.
- The SDK Asset Builder also logs a missing development-build `DevTest.dll`.
  Shader builders still run, so this is unrelated noise rather than the cause
  of the expected fixture failures.

The `.shader` descriptors are kept beside the `.azsl` sources so the corpus can
be copied into an O3DE project's `Assets` directory for a repeatable AP run.

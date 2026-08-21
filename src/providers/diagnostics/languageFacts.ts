export const builtinIdentifiers = new Set([
  'max', 'min', 'saturate', 'clamp', 'smoothstep', 'normalize', 'length', 'dot', 'cross',
  'pow', 'floor', 'ceil', 'frac', 'lerp', 'step', 'ddx', 'ddy', 'fwidth', 'abs', 'mul', 'round',
  'sin', 'cos', 'sqrt', 'fmod', 'clip', 'ddx_fine', 'ddy_fine', 'rcp', 'exp', 'transpose',
  'branch', 'unroll', 'loop', 'flatten', 'allow_uav_condition', 'maxvertexcount', 'numthreads',
  'domain', 'partitioning', 'outputtopology', 'outputcontrolpoints', 'patchconstantfunc', 'maxtessfactor',
  'Sample', 'SampleCmp', 'GetDimensions',
  'float', 'float2', 'float3', 'float4', 'float2x2', 'float3x3', 'float4x4',
  'real', 'real2', 'real3', 'real4', 'real3x3', 'real3x4', 'real4x4',
  'int', 'int2', 'int3', 'int4', 'uint', 'uint2', 'uint3', 'uint4', 'bool',
  'half', 'double', 'matrix', 'void',
  'Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 'RWTexture2D',
  'Sampler', 'SamplerState', 'SamplerComparisonState',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
  'true', 'false',
  'struct', 'cbuffer', 'tbuffer', 'namespace', 'class', 'static', 'const', 'groupshared',
  'uniform', 'volatile', 'option', 'noperspective', 'inline',
  'POSITION', 'NORMAL', 'TEXCOORD0', 'TEXCOORD1', 'TEXCOORD2', 'TEXCOORD3', 'TEXCOORD4', 'TEXCOORD5', 'TEXCOORD6',
  'UV0', 'UV1', 'UV2', 'UV3',
  'SV_Position', 'SV_Target', 'SV_Target0', 'SV_InstanceID', 'SV_VertexID',
  'COLOR0', 'COLOR1', 'TANGENT', 'BINORMAL'
]);

export const samplerPropertyNames = new Set([
  'MinFilter', 'MagFilter', 'MipFilter', 'AddressU', 'AddressV', 'AddressW', 'MaxAnisotropy',
  'ReductionType', 'ComparisonFunc', 'MinLOD', 'MaxLOD', 'MipLODBias', 'BorderColor'
]);

export const samplerPropertyEnumValues: Record<string, string[]> = {
  MinFilter: ['Point', 'Linear'], MagFilter: ['Point', 'Linear'], MipFilter: ['Point', 'Linear'],
  AddressU: ['Wrap', 'Mirror', 'Clamp', 'Border', 'MirrorOnce'],
  AddressV: ['Wrap', 'Mirror', 'Clamp', 'Border', 'MirrorOnce'],
  AddressW: ['Wrap', 'Mirror', 'Clamp', 'Border', 'MirrorOnce'],
  ReductionType: ['Filter', 'Comparison', 'Minimum', 'Maximum'],
  ComparisonFunc: ['Never', 'Less', 'Equal', 'LessEqual', 'Greater', 'NotEqual', 'GreaterEqual', 'Always'],
  BorderColor: ['OpaqueBlack', 'TransparentBlack', 'OpaqueWhite']
};

export const samplerPropertyNumericKind: Record<string, 'int' | 'float'> = {
  MaxAnisotropy: 'int', MinLOD: 'float', MaxLOD: 'float', MipLODBias: 'float'
};

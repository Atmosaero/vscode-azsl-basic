const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let indexedSymbols = new Set();
let headersPathIndex = new Map();
let headersBasenameIndex = new Map();
let macroIndex = new Map();
let atomMethodIndex = new Map();
let atomTypeMembers = new Map();
let srgSemanticIndex = new Map();

let disposables = [];

let debugChannel = null;

function debugLog(message) {
    if (!debugChannel) {
        debugChannel = vscode.window.createOutputChannel('AZSL Debug');
    }
    const timestamp = new Date().toLocaleTimeString();
    debugChannel.appendLine(`[${timestamp}] ${message}`);
    console.log(message);
}

const builtinDocs = new Map(Object.entries({
    max: "```hlsl\nT max(T a, T b)\n```\n\nReturns the greater of two values. Component-wise for vectors.\n\n**Parameters:**\n- `a`, `b`: scalar or vector of type `T` (float, int, uint, or vector types)\n\n**Returns:** `T` - maximum value\n\n**Example:**\n```hlsl\nfloat result = max(0.5, 0.8);  // returns 0.8\nfloat3 result = max(float3(1,2,3), float3(4,1,2));  // returns (4,2,3)\n```",
    min: "```hlsl\nT min(T a, T b)\n```\n\nReturns the lesser of two values. Component-wise for vectors.\n\n**Parameters:**\n- `a`, `b`: scalar or vector of type `T` (float, int, uint, or vector types)\n\n**Returns:** `T` - minimum value\n\n**Example:**\n```hlsl\nfloat result = min(0.5, 0.8);  // returns 0.5\n```",
    saturate: "```hlsl\nT saturate(T x)\n```\n\nClamps `x` to the range [0, 1]. Equivalent to `clamp(x, 0.0, 1.0)`.\n\n**Parameters:**\n- `x`: scalar or vector\n\n**Returns:** `T` - clamped value in [0, 1]\n\n**Example:**\n```hlsl\nfloat result = saturate(1.5);  // returns 1.0\nfloat result = saturate(-0.2);  // returns 0.0\n```",
    clamp: "```hlsl\nT clamp(T x, T minVal, T maxVal)\n```\nClamps `x` to the range [minVal, maxVal]. Component-wise for vectors.\n\n**Parameters:**\n- `x`: value to clamp\n- `minVal`: minimum value\n- `maxVal`: maximum value\n\n**Returns:** `T` - clamped value",
    smoothstep: "```hlsl\nT smoothstep(T edge0, T edge1, T x)\n```\nPerforms smooth Hermite interpolation between 0 and 1 when `edge0 < x < edge1`.\n\n**Parameters:**\n- `edge0`: lower edge\n- `edge1`: upper edge\n- `x`: input value\n\n**Returns:** `T` - interpolated value in [0, 1]",
    normalize: "```hlsl\nfloat3 normalize(float3 v)\nfloat4 normalize(float4 v)\n```\nReturns a unit-length vector in the same direction as `v`.\n\n**Parameters:**\n- `v`: input vector\n\n**Returns:** normalized vector",
    length: "```hlsl\nfloat length(float3 v)\nfloat length(float4 v)\n```\nReturns the length (magnitude) of vector `v`.\n\n**Parameters:**\n- `v`: input vector\n\n**Returns:** `float` - vector length",
    dot: "```hlsl\nfloat dot(float3 a, float3 b)\nfloat dot(float4 a, float4 b)\n```\nComputes the dot product of two vectors.\n\n**Parameters:**\n- `a`, `b`: input vectors\n\n**Returns:** `float` - dot product",
    cross: "```hlsl\nfloat3 cross(float3 a, float3 b)\n```\nComputes the cross product of two 3D vectors.\n\n**Parameters:**\n- `a`, `b`: 3D input vectors\n\n**Returns:** `float3` - cross product",
    pow: "```hlsl\nT pow(T x, T y)\n```\nReturns `x` raised to the power `y`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: base\n- `y`: exponent\n\n**Returns:** `T` - x^y",
    floor: "```hlsl\nT floor(T x)\n```\nReturns the largest integer less than or equal to `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - floored value",
    ceil: "```hlsl\nT ceil(T x)\n```\nReturns the smallest integer greater than or equal to `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - ceiled value",
    round: "```hlsl\nT round(T x)\n```\nReturns the nearest integer to `x`. Rounds to nearest even on tie. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - rounded value\n\n**Example:**\n```hlsl\nfloat result = round(1.5);  // returns 2.0\nfloat result = round(1.4);  // returns 1.0\n```",
    frac: "```hlsl\nT frac(T x)\n```\nReturns the fractional part of `x` (x - floor(x)). Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - fractional part",
    lerp: "```hlsl\nT lerp(T a, T b, float t)\n```\n\nPerforms linear interpolation: `a + t * (b - a)`. Component-wise for vectors.\n\n**Parameters:**\n- `a`: start value (scalar or vector)\n- `b`: end value (scalar or vector)\n- `t`: interpolation factor in [0, 1]\n\n**Returns:** `T` - interpolated value\n\n**Example:**\n```hlsl\nfloat result = lerp(0.0, 1.0, 0.5);  // returns 0.5\nfloat3 color = lerp(float3(1,0,0), float3(0,0,1), t);  // interpolate colors\n```",
    step: "```hlsl\nT step(T edge, T x)\n```\nReturns 0 if `x < edge`, else 1. Component-wise for vectors.\n\n**Parameters:**\n- `edge`: edge value\n- `x`: input value\n\n**Returns:** `T` - step result",
    ddx: "```hlsl\nT ddx(T x)\n```\nReturns the approximate partial derivative of `x` with respect to screen-space x-coordinate. Available in pixel shaders.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - derivative",
    ddy: "```hlsl\nT ddy(T x)\n```\nReturns the approximate partial derivative of `x` with respect to screen-space y-coordinate. Available in pixel shaders.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - derivative",
    abs: "```hlsl\nT abs(T x)\n```\nReturns the absolute value of `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - absolute value",
    sin: "```hlsl\nT sin(T x)\n```\nReturns the sine of `x` (in radians). Component-wise for vectors.\n\n**Parameters:**\n- `x`: angle in radians (scalar or vector)\n\n**Returns:** `T` - sine value\n\n**Example:**\n```hlsl\nfloat result = sin(1.5708);  // returns ~1.0 (sin of 90 degrees)\n```",
    cos: "```hlsl\nT cos(T x)\n```\nReturns the cosine of `x` (in radians). Component-wise for vectors.\n\n**Parameters:**\n- `x`: angle in radians (scalar or vector)\n\n**Returns:** `T` - cosine value\n\n**Example:**\n```hlsl\nfloat result = cos(0.0);  // returns 1.0\n```",
    sqrt: "```hlsl\nT sqrt(T x)\n```\nReturns the square root of `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value (must be >= 0)\n\n**Returns:** `T` - square root\n\n**Example:**\n```hlsl\nfloat result = sqrt(4.0);  // returns 2.0\n```",
    fmod: "```hlsl\nT fmod(T x, T y)\n```\nReturns the floating-point remainder of `x / y`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: dividend\n- `y`: divisor\n\n**Returns:** `T` - remainder\n\n**Example:**\n```hlsl\nfloat result = fmod(5.5, 2.0);  // returns 1.5\nfloat result = fmod(uv, 1.0);  // clamps UV to [0, 1)\n```",
    mul: "```hlsl\nfloat4 mul(float4x4 m, float4 v)\nfloat4 mul(float4 v, float4x4 m)\nfloat3 mul(float3x3 m, float3 v)\nT mul(T a, T b)\n```\n\nPerforms matrix-vector or matrix-matrix multiplication. Also used for scalar/vector multiplication.\n\n**Overloads:**\n\n1. **Matrix × Vector**\n   ```hlsl\n   float4 mul(float4x4 m, float4 v)\n   ```\n   Multiplies matrix `m` by vector `v`.\n\n2. **Vector × Matrix**\n   ```hlsl\n   float4 mul(float4 v, float4x4 m)\n   ```\n   Multiplies vector `v` by matrix `m`.\n\n3. **General multiplication**\n   ```hlsl\n   T mul(T a, T b)\n   ```\n   Performs component-wise multiplication for scalars/vectors.\n\n**Example:**\n```hlsl\nfloat4 worldPos = mul(objectToWorld, float4(localPos, 1.0));\nfloat4 clipPos = mul(viewProjection, worldPos);\n```",
    Sample: "```hlsl\nfloat4 Texture2D.Sample(SamplerState s, float2 location)\nfloat4 Texture2D.Sample(SamplerState s, float2 location, int2 offset)\nfloat4 Texture2D.Sample(SamplerState s, float2 location, int2 offset, out uint status)\n```\n\nSamples a texture using the specified sampler and texture coordinates.\n\n**Parameters:**\n- `s`: sampler state (defines filtering, addressing, etc.)\n- `location`: texture coordinates (UV) in [0, 1] range\n- `offset`: optional integer offset in texels\n- `status`: optional output status (0 = success)\n\n**Returns:** `float4` - sampled color (RGBA)\n\n**Example:**\n```hlsl\nfloat4 color = texture.Sample(sampler, uv);\n```",
    SampleCmp: "```hlsl\nfloat4 Texture2D.SampleCmp(SamplerComparisonState s, float2 location, float compareValue)\n```\nPerforms comparison sampling (depth comparison). Used with shadow maps.\n\n**Parameters:**\n- `s`: comparison sampler state\n- `location`: texture coordinates\n- `compareValue`: comparison value\n\n**Returns:** `float4` - comparison result",
    GetDimensions: "```hlsl\nvoid Texture2D.GetDimensions(out uint width, out uint height)\nvoid Texture2D.GetDimensions(uint mipLevel, out uint width, out uint height)\nvoid Texture2D.GetDimensions(out uint width, out uint height, out uint numberOfLevels)\n```\n\nRetrieves the dimensions of the texture resource.\n\n**Overloads:**\n\n1. **Basic dimensions**\n   ```hlsl\n   void GetDimensions(out uint width, out uint height)\n   ```\n   Gets width and height of the texture at mip level 0.\n\n2. **With mip level**\n   ```hlsl\n   void GetDimensions(uint mipLevel, out uint width, out uint height)\n   ```\n   Gets dimensions at the specified mip level.\n\n3. **With mip count**\n   ```hlsl\n   void GetDimensions(out uint width, out uint height, out uint numberOfLevels)\n   ```\n   Gets dimensions and total number of mip levels.\n\n**Example:**\n```hlsl\nfloat2 textureSize;\ntexture.GetDimensions(textureSize.x, textureSize.y);\n```",
    Texture2D: "**Built-in Type: Texture2D**\n\n2D texture resource type in HLSL/AZSL. Represents a 2D texture that can be sampled in shaders.\n\n**Declaration:**\n```hlsl\nTexture2D textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float2 uv)` - Sample texture with UV coordinates\n- `SampleLevel(SamplerState s, float2 uv, float mipLevel)` - Sample at specific mip level\n- `GetDimensions(out uint width, out uint height)` - Get texture dimensions\n- `Load(int3 coord)` - Load texel directly without filtering\n\n**Usage:**\n```hlsl\nTexture2D m_baseColor;\nSamplerState m_sampler;\n\nfloat4 color = m_baseColor.Sample(m_sampler, uv);\n```\n\n**Note:** This is a built-in HLSL/AZSL type. It is defined by the shader compiler and does not have a source definition in the project.",
    Texture3D: "**Built-in Type: Texture3D**\n\n3D texture resource type in HLSL/AZSL. Represents a 3D volume texture.\n\n**Declaration:**\n```hlsl\nTexture3D textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float3 uvw)` - Sample 3D texture\n- `GetDimensions(out uint width, out uint height, out uint depth)` - Get 3D dimensions\n\n**Note:** This is a built-in HLSL/AZSL type.",
    TextureCube: "**Built-in Type: TextureCube**\n\nCube map texture resource type in HLSL/AZSL. Represents a cube map for environment mapping.\n\n**Declaration:**\n```hlsl\nTextureCube textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float3 direction)` - Sample cube map with direction vector\n\n**Note:** This is a built-in HLSL/AZSL type.",
    Texture2DArray: "**Built-in Type: Texture2DArray**\n\n2D texture array resource type in HLSL/AZSL. Represents an array of 2D textures.\n\n**Declaration:**\n```hlsl\nTexture2DArray textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float3 uvw)` - Sample array texture (uvw.z is array index)\n\n**Note:** This is a built-in HLSL/AZSL type.",
    RWTexture2D: "**Built-in Type: RWTexture2D**\n\nRead-write 2D texture resource type in HLSL/AZSL. Used in compute shaders for random access writes.\n\n**Declaration:**\n```hlsl\nRWTexture2D<float4> textureName;\n```\n\n**Common Methods:**\n- `[uint2 coord]` - Direct indexing operator\n- `GetDimensions(out uint width, out uint height)` - Get dimensions\n\n**Note:** This is a built-in HLSL/AZSL type.",
    SamplerState: "**Built-in Type: SamplerState**\n\nSampler state object in HLSL/AZSL. Defines filtering, addressing modes, and other sampling parameters.\n\n**Declaration:**\n```hlsl\nSamplerState samplerName;\n```\n\n**Usage:**\n```hlsl\nSamplerState m_sampler;\nTexture2D m_texture;\n\nfloat4 color = m_texture.Sample(m_sampler, uv);\n```\n\n**Note:** This is a built-in HLSL/AZSL type. Sampler state is typically defined in SRG (Shader Resource Group) or passed as a parameter.",
    SamplerComparisonState: "**Built-in Type: SamplerComparisonState**\n\nComparison sampler state in HLSL/AZSL. Used for depth comparison sampling (shadow maps).\n\n**Declaration:**\n```hlsl\nSamplerComparisonState samplerName;\n```\n\n**Usage:**\n```hlsl\nSamplerComparisonState shadowSampler;\nTexture2D shadowMap;\n\nfloat shadow = shadowMap.SampleCmp(shadowSampler, uv, depth);\n```\n\n**Note:** This is a built-in HLSL/AZSL type.",
    Sampler: "**Built-in Type: Sampler**\n\nAlias for `SamplerState` in HLSL/AZSL. Defines filtering, addressing modes, and other sampling parameters.\n\n**Declaration:**\n```hlsl\nSampler samplerName;\n```\n\n**Usage:**\n```hlsl\nSampler m_sampler;\nTexture2D m_texture;\n\nfloat4 color = m_texture.Sample(m_sampler, uv);\n```\n\n**Note:** This is a built-in HLSL/AZSL type. `Sampler` is typically an alias for `SamplerState`.",
    MaxAnisotropy: "**Sampler Property: MaxAnisotropy**\n\nMaximum anisotropy level for anisotropic filtering. Controls the quality of texture filtering when using anisotropic filtering.\n\n**Type:** `uint` or `int`\n\n**Range:** Typically 1-16\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MaxAnisotropy = 4;\n};\n```\n\n**Values:**\n- `1` - No anisotropic filtering (fastest)\n- `2-16` - Anisotropic filtering level (higher = better quality, slower)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MinFilter: "**Sampler Property: MinFilter**\n\nFiltering mode used when texture is minified (viewed from far away or at lower mip levels).\n\n**Type:** Filter mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MinFilter = Linear;\n};\n```\n\n**Values:**\n- `Point` - Nearest neighbor filtering (pixelated, fastest)\n- `Linear` - Bilinear filtering (smooth, standard)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MagFilter: "**Sampler Property: MagFilter**\n\nFiltering mode used when texture is magnified (viewed from close up or at higher mip levels).\n\n**Type:** Filter mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MagFilter = Linear;\n};\n```\n\n**Values:**\n- `Point` - Nearest neighbor filtering (pixelated, fastest)\n- `Linear` - Bilinear filtering (smooth, standard)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MipFilter: "**Sampler Property: MipFilter**\n\nFiltering mode used when sampling between mip levels.\n\n**Type:** Filter mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MipFilter = Linear;\n};\n```\n\n**Values:**\n- `Point` - Nearest mip level (no interpolation between mips)\n- `Linear` - Trilinear filtering (interpolates between mip levels)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    ReductionType: "**Sampler Property: ReductionType**\n\nSpecifies the reduction type for texture filtering.\n\n**Type:** Reduction type enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    ReductionType = Filter;\n};\n```\n\n**Values:**\n- `Filter` - Standard filtering\n- `Comparison` - Comparison filtering (for shadow maps)\n- `Minimum` - Minimum filtering\n- `Maximum` - Maximum filtering\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    AddressU: "**Sampler Property: AddressU**\n\nTexture addressing mode for the U (horizontal) coordinate.\n\n**Type:** Address mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    AddressU = Wrap;\n};\n```\n\n**Values:**\n- `Wrap` - Repeats texture (tiling)\n- `Clamp` - Clamps to edge (no tiling)\n- `Mirror` - Mirrors texture at edges\n- `Border` - Uses border color for out-of-range coordinates\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    AddressV: "**Sampler Property: AddressV**\n\nTexture addressing mode for the V (vertical) coordinate.\n\n**Type:** Address mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    AddressV = Wrap;\n};\n```\n\n**Values:**\n- `Wrap` - Repeats texture (tiling)\n- `Clamp` - Clamps to edge (no tiling)\n- `Mirror` - Mirrors texture at edges\n- `Border` - Uses border color for out-of-range coordinates\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    AddressW: "**Sampler Property: AddressW**\n\nTexture addressing mode for the W (depth) coordinate (for 3D textures).\n\n**Type:** Address mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    AddressW = Wrap;\n};\n```\n\n**Values:**\n- `Wrap` - Repeats texture (tiling)\n- `Clamp` - Clamps to edge (no tiling)\n- `Mirror` - Mirrors texture at edges\n- `Border` - Uses border color for out-of-range coordinates\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MinLOD: "**Sampler Property: MinLOD**\n\nMinimum mip level (LOD) that can be accessed. Clamps the minimum mip level used for sampling.\n\n**Type:** `float`\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MinLOD = 0.0;\n};\n```\n\n**Range:** Typically 0.0 to maximum mip level\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MaxLOD: "**Sampler Property: MaxLOD**\n\nMaximum mip level (LOD) that can be accessed. Clamps the maximum mip level used for sampling.\n\n**Type:** `float`\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MaxLOD = 15.0;\n};\n```\n\n**Range:** Typically 0.0 to maximum mip level\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    Point: "**Filter Mode: Point**\n\nNearest neighbor filtering. Samples the nearest texel without interpolation.\n\n**Usage:**\n```hlsl\nMinFilter = Point;\nMagFilter = Point;\nMipFilter = Point;\n```\n\n**Characteristics:**\n- Fastest filtering mode\n- Pixelated appearance (no smoothing)\n- Good for pixel art or when you want sharp, crisp textures\n\n**Note:** This is a filter mode value used in sampler initialization.",
    Linear: "**Filter Mode: Linear**\n\nLinear interpolation filtering. Smoothly interpolates between texels.\n\n**Usage:**\n```hlsl\nMinFilter = Linear;\nMagFilter = Linear;\nMipFilter = Linear;\n```\n\n**Characteristics:**\n- Smooth, blurred appearance\n- Standard filtering mode for most textures\n- Bilinear for 2D, trilinear when combined with MipFilter = Linear\n\n**Note:** This is a filter mode value used in sampler initialization.",
    Wrap: "**Address Mode: Wrap**\n\nRepeats the texture (tiling). Coordinates wrap around when they exceed [0, 1].\n\n**Usage:**\n```hlsl\nAddressU = Wrap;\nAddressV = Wrap;\nAddressW = Wrap;\n```\n\n**Characteristics:**\n- Texture repeats seamlessly\n- Most common mode for tiled textures\n- UV coordinates wrap: 1.5 becomes 0.5\n\n**Note:** This is an address mode value used in sampler initialization.",
    Clamp: "**Address Mode: Clamp**\n\nClamps texture coordinates to the edge. Out-of-range coordinates use the edge color.\n\n**Usage:**\n```hlsl\nAddressU = Clamp;\nAddressV = Clamp;\n```\n\n**Characteristics:**\n- No tiling, texture appears once\n- Edge colors extend beyond [0, 1] range\n- Good for non-repeating textures\n\n**Note:** This is an address mode value used in sampler initialization.",
    Mirror: "**Address Mode: Mirror**\n\nMirrors the texture at edges. Texture flips when coordinates exceed [0, 1].\n\n**Usage:**\n```hlsl\nAddressU = Mirror;\nAddressV = Mirror;\n```\n\n**Characteristics:**\n- Texture mirrors at boundaries\n- Creates seamless tiling with mirrored pattern\n- Less common than Wrap or Clamp\n\n**Note:** This is an address mode value used in sampler initialization.",
    Border: "**Address Mode: Border**\n\nUses a border color for out-of-range coordinates.\n\n**Usage:**\n```hlsl\nAddressU = Border;\nAddressV = Border;\n```\n\n**Characteristics:**\n- Out-of-range coordinates use border color (typically black)\n- Useful for special effects\n- Less common than other modes\n\n**Note:** This is an address mode value used in sampler initialization.",
    Filter: "**Reduction Type: Filter**\n\nStandard filtering reduction type. Used for normal texture sampling.\n\n**Usage:**\n```hlsl\nReductionType = Filter;\n```\n\n**Note:** This is a reduction type value used in sampler initialization."
}));

const semanticDocs = new Map(Object.entries({
    POSITION: "**Input Semantic**\n\nVertex position in object/model space. Typically `float3` or `float4`.\n\n**Usage:**\n```hlsl\nstruct VertexInput {\n    float3 m_position : POSITION;\n};\n```",
    NORMAL: "**Input Semantic**\n\nVertex normal vector in object space. Typically `float3`.\n\n**Usage:**\n```hlsl\nstruct VertexInput {\n    float3 m_normal : NORMAL;\n};\n```",
    TEXCOORD0: "**Input Semantic**\n\nFirst set of texture coordinates (UV). Typically `float2`.\n\n**Usage:**\n```hlsl\nstruct VertexInput {\n    float2 m_uv : TEXCOORD0;\n};\n```",
    TEXCOORD1: "**Input Semantic**\n\nSecond set of texture coordinates. Typically `float2`.",
    TEXCOORD2: "**Input Semantic**\n\nThird set of texture coordinates. Typically `float2`.",
    TEXCOORD3: "**Input Semantic**\n\nFourth set of texture coordinates. Typically `float2`.",
    COLOR0: "**Input Semantic**\n\nFirst vertex color. Typically `float4`.",
    COLOR1: "**Input Semantic**\n\nSecond vertex color. Typically `float4`.",
    TANGENT: "**Input Semantic**\n\nVertex tangent vector. Typically `float3` or `float4` (with handedness).",
    BINORMAL: "**Input Semantic**\n\nVertex binormal/bitangent vector. Typically `float3`.",
    BLENDINDICES: "**Input Semantic**\n\nBone indices for skinning. Typically `uint4` or `int4`.",
    BLENDWEIGHT: "**Input Semantic**\n\nBone weights for skinning. Typically `float4`.",
    SV_Position: "**System Value Semantic**\n\nPixel position in clip space (homogeneous coordinates). Required output from vertex shader, available as input in pixel shader.\n\n**Type:** `float4`\n\n**Usage:**\n```hlsl\nstruct VertexOutput {\n    float4 m_position : SV_Position;\n};\n```",
    SV_Target: "**System Value Semantic**\n\nRender target output. Used for pixel shader output to render target 0.\n\n**Type:** `float4` (RGBA)\n\n**Usage:**\n```hlsl\nfloat4 MainPS(...) : SV_Target {\n    return float4(1, 1, 1, 1);\n}\n```",
    SV_Target0: "**System Value Semantic**\n\nRender target 0 output. Same as `SV_Target`.",
    SV_Target1: "**System Value Semantic**\n\nRender target 1 output. For multiple render targets (MRT).",
    SV_Target2: "**System Value Semantic**\n\nRender target 2 output. For multiple render targets (MRT).",
    SV_Target3: "**System Value Semantic**\n\nRender target 3 output. For multiple render targets (MRT).",
    SV_Depth: "**System Value Semantic**\n\nDepth buffer output. Overrides depth from `SV_Position.w`.\n\n**Type:** `float`",
    SV_Coverage: "**System Value Semantic**\n\nMSAA coverage mask. Available in pixel shader.\n\n**Type:** `uint`",
    SV_InstanceID: "**System Value Semantic**\n\nInstance ID for instanced rendering. Available in vertex/geometry shaders.\n\n**Type:** `uint`\n\n**Usage:**\n```hlsl\nVertexOutput MainVS(VertexInput input, uint instanceId : SV_InstanceID) {\n    // Use instanceId to index per-instance data\n}\n```",
    SV_VertexID: "**System Value Semantic**\n\nVertex ID within the draw call. Available in vertex shader.\n\n**Type:** `uint`",
    SV_PrimitiveID: "**System Value Semantic**\n\nPrimitive ID. Available in geometry/pixel shaders.\n\n**Type:** `uint`",
    SV_GSInstanceID: "**System Value Semantic**\n\nGeometry shader instance ID. Available in geometry shader.\n\n**Type:** `uint`",
    SV_IsFrontFace: "**System Value Semantic**\n\nIndicates if the primitive is front-facing. Available in geometry/pixel shaders.\n\n**Type:** `bool`",
    SV_DispatchThreadID: "**System Value Semantic**\n\nThread ID in the dispatch call. Available in compute shader.\n\n**Type:** `uint3`",
    SV_GroupID: "**System Value Semantic**\n\nGroup ID within the dispatch call. Available in compute shader.\n\n**Type:** `uint3`",
    SV_GroupThreadID: "**System Value Semantic**\n\nThread ID within the thread group. Available in compute shader.\n\n**Type:** `uint3`",
    SV_GroupIndex: "**System Value Semantic**\n\nFlattened thread index within the thread group. Available in compute shader.\n\n**Type:** `uint`",
    SV_RenderTargetArrayIndex: "**System Value Semantic**\n\nRender target array index for layered rendering. Available in geometry/pixel shaders.\n\n**Type:** `uint`",
    SV_ViewportArrayIndex: "**System Value Semantic**\n\nViewport array index. Available in geometry/pixel shaders.\n\n**Type:** `uint`",
    SV_ClipDistance: "**System Value Semantic**\n\nClip distance array for user-defined clipping planes.\n\n**Type:** `float[N]`",
    SV_CullDistance: "**System Value Semantic**\n\nCull distance array for user-defined culling.\n\n**Type:** `float[N]`",
    SRG_PerDraw: "**SRG Semantic: Per-Draw**\n\nShader Resource Group semantic indicating that the SRG is updated per draw call. This is the most frequent update rate.\n\n**Usage:**\n```hlsl\nShaderResourceGroup MySrg : SRG_PerDraw\n{\n    float4x4 m_worldMatrix;\n    float3 m_position;\n};\n```\n\n**When to use:**\n- Data that changes for each object being drawn (e.g., world matrix, object position)\n- Instance-specific data\n- Per-object material properties\n\n**Update frequency:** Every draw call",
    SRG_PerMaterial: "**SRG Semantic: Per-Material**\n\nShader Resource Group semantic indicating that the SRG is updated per material. Material data is shared across all objects using the same material.\n\n**Usage:**\n```hlsl\nShaderResourceGroup MaterialSrg : SRG_PerMaterial\n{\n    float3 m_baseColor;\n    float m_roughness;\n    Texture2D m_albedo;\n    Sampler m_sampler;\n};\n```\n\n**When to use:**\n- Material properties (colors, textures, roughness, metallic, etc.)\n- Material-specific shader parameters\n- Textures and samplers used by the material\n\n**Update frequency:** When material changes (shared across objects with same material)",
    SRG_PerScene: "**SRG Semantic: Per-Scene**\n\nShader Resource Group semantic indicating that the SRG is updated per scene. Scene data is shared across all objects in the scene.\n\n**Usage:**\n```hlsl\nShaderResourceGroup SceneSrg : SRG_PerScene\n{\n    float3 m_ambientLight;\n    float m_time;\n};\n```\n\n**When to use:**\n- Global scene settings (ambient light, fog, etc.)\n- Scene-wide constants\n- Global time or other scene-level parameters\n\n**Update frequency:** When scene changes (shared across entire scene)",
    SRG_PerView: "**SRG Semantic: Per-View**\n\nShader Resource Group semantic indicating that the SRG is updated per view/camera. View data is shared across all objects visible in the view.\n\n**Usage:**\n```hlsl\nShaderResourceGroup ViewSrg : SRG_PerView\n{\n    float4x4 m_viewProjectionMatrix;\n    float3 m_cameraPosition;\n};\n```\n\n**When to use:**\n- Camera/view matrices (view, projection, view-projection)\n- Camera position and direction\n- View-specific settings (FOV, near/far planes, etc.)\n\n**Update frequency:** When view/camera changes (shared across all objects in view)"
}));

function readConfigHeadersPath() {
    const cfg = vscode.workspace.getConfiguration('azsl');
    const gem = cfg.get('gemPath');
    if (gem && typeof gem === 'string' && gem.trim().length > 0) {
        return gem;
    }
    const headers = cfg.get('headersPath');
    return headers;
}

function shouldIndexFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.azsli' || ext === '.srgi' || ext === '.azsl' || ext === '.hlsl' || ext === '.azslin';
}

function walkDirCollect(fileOrDir, maxFiles = 8000) {
    const stack = [fileOrDir];
    const files = [];
    while (stack.length && files.length < maxFiles) {
        const cur = stack.pop();
        if (!cur) break;
        try {
            const stat = fs.statSync(cur);
            if (stat.isDirectory()) {
                const entries = fs.readdirSync(cur);
                for (const e of entries) {
                    stack.push(path.join(cur, e));
                }
            } else if (stat.isFile() && shouldIndexFile(cur)) {
                files.push(cur);
            }
        } catch {
        }
    }
    return files;
}

function extractSymbolsFromText(text) {
    const found = new Set();
    const regexes = [
        /\bSRG_[A-Za-z0-9_]+\b/g,
        /\[\[[A-Za-z0-9_:\s,()]+\]\]/g,
        /\[(unroll|loop|flatten|branch|allow_uav_condition)\]/g,
        /\b[A-Z][A-Za-z0-9_]+\b/g,
        /\b(Sample|SampleCmp|GetDimensions)\b/g,
        /:[ \t]*(SV_[A-Za-z0-9_]+|TEXCOORD[0-9]+|POSITION|NORMAL)\b/g,
        /\bo_[A-Za-z0-9_]+\b/g
    ];
    for (const re of regexes) {
        let m;
        while ((m = re.exec(text)) !== null) {
            const val = m[1] || m[0];
            if (typeof val === 'string' && val.length <= 64) {
                found.add(val);
            }
        }
    }
    return found;
}

function extractInlineMacrosFromText(text) {
    const results = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)(?:\s*\/\/\s*(.*))?\s*$/);
        if (m) {
            results.push({
                name: m[1],
                value: m[2].trim(),
                line: i,
                inlineComment: (m[3] || '').trim()
            });
        }
    }
    return results;
}

function extractMacrosWithComments(text) {
    const results = [];
    const lines = text.split(/\r?\n/);
    const collectPrecedingComment = (fromIndex) => {
        let docLines = [];
        let j = fromIndex;
        while (j >= 0 && /^\s*$/.test(lines[j])) j--;
        while (j >= 0 && /^\s*\/\//.test(lines[j])) {
            docLines.unshift(lines[j].replace(/^\s*\/\//, '').trim());
            j--;
        }
        if (j >= 0 && /\*\/\s*$/.test(lines[j])) {
            let k = j;
            let block = [];
            while (k >= 0) {
                block.unshift(lines[k]);
                if (/^\s*\/\*/.test(lines[k])) break;
                k--;
            }
            const cleaned = block.join('\n')
                .replace(/^\s*\/\*/, '')
                .replace(/\*\/\s*$/, '')
                .split('\n')
                .map(s => s.replace(/^\s*\*\s?/, '').trim());
            docLines = cleaned.concat(docLines);
        }
        return docLines.join('\n');
    };
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.*?))?(?:\s*\/\/\s*(.*))?\s*$/);
        if (m) {
            const name = m[1];
            const value = (m[2] || '').trim();
            const inlineComment = (m[3] || '').trim();
            const docHead = collectPrecedingComment(i - 1);
            const doc = [docHead, inlineComment].filter(Boolean).join('\n');
            results.push({ name, value, line: i, doc });
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const ifndef = lines[i].match(/^\s*#\s*ifndef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
        if (ifndef) {
            const name = ifndef[1];
            let defLine = -1, value = '', inline = '';
            for (let k = i + 1; k < Math.min(lines.length, i + 16); k++) {
                const m = lines[k].match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)(?:\s*\/\/\s*(.*))?\s*$/);
                if (m && m[1] === name) {
                    defLine = k;
                    value = m[2].trim();
                    inline = (m[3] || '').trim();
                    break;
                }
            }
            if (defLine >= 0) {
                const docHead = collectPrecedingComment(i - 1);
                const doc = [docHead, inline].filter(Boolean).join('\n');
                results.push({ name, value, line: defLine, doc });
            }
        }
    }
    return results;
}

function extractSrgSemantics(text, filePath) {
    const results = [];
    const lines = text.split(/\r?\n/);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\s*ShaderResourceGroupSemantic\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
        if (match) {
            const semanticName = match[1];
            results.push({
                name: semanticName,
                line: i,
                uri: vscode.Uri.file(filePath)
            });
        }
    }
    
    return results;
}

function extractAtomMethods(text, filePath) {
    const results = [];
    const properties = new Map();
    const lines = text.split(/\r?\n/);
    
    const atomTypeAliases = {
        'Surface': ['SurfaceData_StandardPBR', 'SurfaceData_BasePBR', 'Surface'],
        'LightingData': ['LightingData_BasePBR', 'LightingData']
    };
    
    let currentClass = null;
    let inClass = false;
    let classBraceLevel = 0;
    const fileName = path.basename(filePath);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
            continue;
        }
        
        const classMatch = line.match(/\b(?:class|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\{]?/);
        if (classMatch) {
            currentClass = classMatch[1];
            inClass = true;
            classBraceLevel = 0;
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '{') classBraceLevel++;
                else if (line[j] === '}') classBraceLevel--;
            }
            for (const [atomType, aliases] of Object.entries(atomTypeAliases)) {
                if (aliases.includes(currentClass)) {
                    break;
                }
            }
            if (classBraceLevel === 0 && !line.includes('{')) {
                if (i + 1 < lines.length && lines[i + 1].trim().startsWith('{')) {
                    classBraceLevel = 1;
                }
            }
            continue;
        }
        
        if (inClass) {
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '{') classBraceLevel++;
                else if (line[j] === '}') classBraceLevel--;
            }
            
            if (classBraceLevel < 0 && line.includes('};')) {
                inClass = false;
                currentClass = null;
                classBraceLevel = 0;
                continue;
            }
        }
        
        if (inClass && currentClass) {
            let atomType = null;
            for (const [type, aliases] of Object.entries(atomTypeAliases)) {
                if (aliases.includes(currentClass)) {
                    atomType = type;
                    break;
                }
            }
            
            if (atomType && !line.includes('(') && !trimmedLine.startsWith('#')) {
                const propertyMatch = line.match(/^\s*(?:precise\s+)?(?:real(?:[1-4](?:x[1-4])?)?|float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]+\])?\s*[;=]/);
                if (propertyMatch) {
                    const propertyName = propertyMatch[1];
                    if (!properties.has(atomType)) {
                        properties.set(atomType, new Set());
                    }
                    properties.get(atomType).add(propertyName);
                }
            }
            
            const methodMatch = line.match(/\b(?:void|real|real2|real3|real4|float|float2|float3|float4|int|uint|bool|half|double|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (methodMatch) {
                const methodName = methodMatch[1];
                const methodStart = methodMatch.index;
                
                if (line.match(/^\s*(?:void|real|real2|real3|real4|float|float2|float3|float4|int|uint|bool|half|double|[A-Z][A-Za-z0-9_]*)\s+[A-Za-z_][A-Za-z0-9_]*\s*[;=]/) && !line.includes('(')) {
                    continue;
                }
                
                let parenCount = 0;
                let paramEnd = -1;
                for (let j = methodStart + methodMatch[0].length; j < line.length; j++) {
                    if (line[j] === '(') parenCount++;
                    else if (line[j] === ')') {
                        if (parenCount === 0) {
                            paramEnd = j;
                            break;
                        }
                        parenCount--;
                    }
                }
                
                if (paramEnd >= 0) {
                    const afterParams = line.substring(paramEnd + 1).trim();
                    if (afterParams.match(/^[;{]/) || afterParams.startsWith('const') || afterParams === '' || afterParams.match(/^\{\s*return/)) {
                        const column = line.indexOf(methodName);
                        
                        for (const [atomType, aliases] of Object.entries(atomTypeAliases)) {
                            if (aliases.includes(currentClass)) {
                                const key1 = `${atomType}::${methodName}`;
                                const key2 = `${atomType}.${methodName}`;
                                results.push({
                                    key: key1,
                                    uri: vscode.Uri.file(filePath),
                                    line: i,
                                    column: column
                                });
                                results.push({
                                    key: key2,
                                    uri: vscode.Uri.file(filePath),
                                    line: i,
                                    column: column
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        const implMatch = line.match(/\b(?:void|real|real2|real3|real4|float|float2|float3|float4|int|uint|bool|half|double|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (implMatch) {
            const className = implMatch[1];
            const methodName = implMatch[2];
            const implStart = implMatch.index;
            
            let parenCount = 0;
            let paramEnd = -1;
            for (let j = implStart + implMatch[0].length; j < line.length; j++) {
                if (line[j] === '(') parenCount++;
                else if (line[j] === ')') {
                    if (parenCount === 0) {
                        paramEnd = j;
                        break;
                    }
                    parenCount--;
                }
            }
            
            if (paramEnd >= 0) {
                const afterParams = line.substring(paramEnd + 1).trim();
                if (afterParams.match(/^\s*\{/) || line.match(/\{\s*$/)) {
                    const column = line.indexOf(methodName);
                    
                    for (const [atomType, aliases] of Object.entries(atomTypeAliases)) {
                        if (aliases.includes(className)) {
                            const key1 = `${atomType}::${methodName}`;
                            const key2 = `${atomType}.${methodName}`;
                            results.push({
                                key: key1,
                                uri: vscode.Uri.file(filePath),
                                line: i,
                                column: column
                            });
                            results.push({
                                key: key2,
                                uri: vscode.Uri.file(filePath),
                                line: i,
                                column: column
                            });
                            break;
                        }
                    }
                }
            }
        }
    }
    
    for (const [atomType, propSet] of properties.entries()) {
        if (!atomTypeMembers.has(atomType)) {
            atomTypeMembers.set(atomType, new Set());
        }
        const existing = atomTypeMembers.get(atomType);
        const beforeSize = existing.size;
        for (const prop of propSet) {
            existing.add(prop);
        }
        const afterSize = existing.size;
    }
    
    return { methods: results, properties: properties };
}

function indexHeaders(rootPath) {
    indexedSymbols.clear();
    headersPathIndex.clear();
    headersBasenameIndex.clear();
    macroIndex.clear();
    atomMethodIndex.clear();
    atomTypeMembers.clear();
    srgSemanticIndex.clear();
    
    atomTypeMembers.set('Surface', new Set([
        'CalculateRoughnessA', 'SetAlbedoAndSpecularF0', 'GetDefaultNormal', 'GetSpecularF0'
    ]));
    atomTypeMembers.set('LightingData', new Set([
        'Init', 'FinalizeLighting', 'CalculateMultiscatterCompensation', 'GetSpecularNdotV'
    ]));
    
    if (!rootPath || !fs.existsSync(rootPath)) {
        return;
    }
    const files = walkDirCollect(rootPath);
    let totalMethods = 0;
    for (const f of files) {
        try {
            const buf = fs.readFileSync(f, 'utf8');
            const syms = extractSymbolsFromText(buf);
            syms.forEach(s => indexedSymbols.add(s));
            const defs = extractMacrosWithComments(buf);
            for (const d of defs) {
                const existing = macroIndex.get(d.name);
                if (!existing || (d.doc && (!existing.doc || existing.doc.length < d.doc.length))) {
                    macroIndex.set(d.name, {
                        value: d.value,
                        doc: d.doc || '',
                        uri: vscode.Uri.file(f),
                        line: d.line
                    });
                }
            }
            const fileName = path.basename(f);
            if (fileName.includes('LightingData') || fileName.includes('Surface')) {
            }
            const atomData = extractAtomMethods(buf, f);
            const methods = atomData.methods || [];
            const properties = atomData.properties || new Map();
            if (methods.length > 0) {
                totalMethods += methods.length;
            }
            for (const m of methods) {
                atomMethodIndex.set(m.key, {
                    uri: m.uri,
                    line: m.line,
                    column: m.column
                });
            }
            for (const [atomType, propSet] of properties.entries()) {
                if (propSet.size > 0) {
                }
            }
            const srgSemantics = extractSrgSemantics(buf, f);
            for (const srg of srgSemantics) {
                srgSemanticIndex.set(srg.name, {
                    uri: srg.uri,
                    line: srg.line
                });
            }
        } catch (e) {
            debugLog(`Error indexing ${path.basename(f)}: ${e.message}`);
        }
        const rel = path.relative(rootPath, f).split(path.sep).join('/');
        headersPathIndex.set(rel, f);
        const base = path.basename(f);
        const list = headersBasenameIndex.get(base) || [];
        list.push(f);
        headersBasenameIndex.set(base, list);
    }
    indexShaderQualityMacros();
    debugLog(`Indexing complete: ${files.length} files, ${atomMethodIndex.size / 2} methods, ${macroIndex.size} macros`);
}

function provideCompletionItems(document, position, token, context) {
    if (document.languageId !== 'azsl') {
        return [];
    }
    
    const range = document.getWordRangeAtPosition(position);
    const current = range ? document.getText(range) : '';
    const items = [];
    
    const lineText = document.lineAt(position.line).text;
    const beforeCursor = lineText.substring(0, position.character);
    
    let memberAccessMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);
    if (!memberAccessMatch) {
        memberAccessMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);
    }
    if (!memberAccessMatch && context?.triggerCharacter === '.') {
        const beforeDot = beforeCursor.replace(/\.\s*$/, '');
        memberAccessMatch = beforeDot.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
    }
    
    if (memberAccessMatch) {
        const varName = memberAccessMatch[1];
        
        // Get variable type from document
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        const atomTypes = new Set(['Surface', 'LightingData']);
        const textureTypes = new Set(['Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 'RWTexture2D', 'RWTexture3D', 'Texture1D', 'Texture2DMS', 'RWTexture1D']);
        const variableTypes = new Map();
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const pascalTypeMatch = line.match(/\b([A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
            if (pascalTypeMatch) {
                const typeName = pascalTypeMatch[1];
                const vName = pascalTypeMatch[2];
                if (atomTypes.has(typeName)) {
                    variableTypes.set(vName, typeName);
                } else if (textureTypes.has(typeName)) {
                    variableTypes.set(vName, typeName);
                }
            }
            const textureTypeMatch = line.match(/\b(Texture\w*|RWTexture\w*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
            if (textureTypeMatch) {
                const typeName = textureTypeMatch[1];
                const vName = textureTypeMatch[2];
                if (textureTypes.has(typeName)) {
                    variableTypes.set(vName, typeName);
                }
            }
        }
        
        let varType = null;
        if (atomTypes.has(varName)) {
            varType = varName;
        } else {
            varType = variableTypes.get(varName);
        }
        
        if (varType && atomTypeMembers.has(varType)) {
            const members = atomTypeMembers.get(varType);
            let memberCount = 0;
            for (const member of members) {
                if (!current || member.toLowerCase().startsWith(current.toLowerCase())) {
                    const isMethod = atomMethodIndex.has(`${varType}.${member}`) || atomMethodIndex.has(`${varType}::${member}`);
                    const item = new vscode.CompletionItem(member, isMethod ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Property);
                    item.sortText = '00_' + member;
                    items.push(item);
                    memberCount++;
                }
            }
            
            return items;
        } 
        else if (varType && textureTypes.has(varType)) {
            const textureMethods = [
                { name: 'Sample', kind: vscode.CompletionItemKind.Method },
                { name: 'SampleLevel', kind: vscode.CompletionItemKind.Method },
                { name: 'SampleGrad', kind: vscode.CompletionItemKind.Method },
                { name: 'SampleBias', kind: vscode.CompletionItemKind.Method },
                { name: 'SampleCmp', kind: vscode.CompletionItemKind.Method },
                { name: 'SampleCmpLevelZero', kind: vscode.CompletionItemKind.Method },
                { name: 'Load', kind: vscode.CompletionItemKind.Method },
                { name: 'GetDimensions', kind: vscode.CompletionItemKind.Method },
                { name: 'Gather', kind: vscode.CompletionItemKind.Method },
                { name: 'GatherRed', kind: vscode.CompletionItemKind.Method },
                { name: 'GatherGreen', kind: vscode.CompletionItemKind.Method },
                { name: 'GatherBlue', kind: vscode.CompletionItemKind.Method },
                { name: 'GatherAlpha', kind: vscode.CompletionItemKind.Method }
            ];
            
            for (const method of textureMethods) {
                if (!current || method.name.toLowerCase().startsWith(current.toLowerCase())) {
                    const item = new vscode.CompletionItem(method.name, method.kind);
                    item.sortText = '00_' + method.name;
                    items.push(item);
                }
            }
            
            return items;
        }
    }

    for (const sym of indexedSymbols) {
        const item = new vscode.CompletionItem(sym, vscode.CompletionItemKind.Text);
        if (current && sym.startsWith(current)) {
            item.sortText = '0_' + sym;
        } else {
            item.sortText = '1_' + sym;
        }
        items.push(item);
    }

    return items;
}

function resolveIncludeTarget(includeText) {
    const root = readConfigHeadersPath();
    if (!root) return undefined;
    const normalized = includeText.replace(/\\/g, '/');
    if (normalized.startsWith('Atom/')) {
        const candidate = path.join(root, normalized);
        if (fs.existsSync(candidate)) return vscode.Uri.file(candidate);
    }
    if (headersPathIndex.has(normalized)) {
        return vscode.Uri.file(headersPathIndex.get(normalized));
    }
    for (const [rel, abs] of headersPathIndex.entries()) {
        if (rel.endsWith('/' + normalized) || rel === normalized) {
            return vscode.Uri.file(abs);
        }
    }
    const base = path.basename(normalized);
    const byBase = headersBasenameIndex.get(base);
    if (byBase && byBase.length === 1) {
        return vscode.Uri.file(byBase[0]);
    }
    return undefined;
}

function registerIncludeLinkProviders(context) {
    const includeRegex = /#\s*include\s*[<"]([^>"]+)[>"]/g;
    const linkProvider = vscode.languages.registerDocumentLinkProvider({ language: 'azsl' }, {
        provideDocumentLinks(document) {
            const text = document.getText();
            const links = [];
            let m;
            while ((m = includeRegex.exec(text)) !== null) {
                const match = m[0];
                const inner = m[1];
                const start = m.index + match.indexOf(inner);
                const end = start + inner.length;
                const startPos = document.positionAt(start);
                const endPos = document.positionAt(end);
                const target = resolveIncludeTarget(inner);
                if (target) {
                    links.push(new vscode.DocumentLink(new vscode.Range(startPos, endPos), target));
                }
            }
            return links;
        }
    });
    const defProvider = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const line = document.lineAt(position.line).text;
            const before = line.slice(0, position.character);
            const after = line.slice(position.character);
            const matchLine = line.match(/#\s*include\s*[<"]([^>"]+)[>"]/);
            if (!matchLine) return;
            const includePath = matchLine[1];
            const target = resolveIncludeTarget(includePath);
            if (!target) return;
            return new vscode.Location(target, new vscode.Position(0, 0));
        }
    });
    context.subscriptions.push(linkProvider, defProvider);
    disposables.push(linkProvider, defProvider);
}

function getFileBySuffix(relSuffix) {
    for (const [rel, abs] of headersPathIndex.entries()) {
        if (rel.endsWith(relSuffix)) {
            return abs;
        }
    }
    return undefined;
}

function indexShaderQualityMacros() {
    const suffixes = [
        'Atom/Features/ShaderQualityOptions.azsli',
        'Feature/Common/Assets/ShaderLib/Atom/Features/ShaderQualityOptions.azsli'
    ];
    let target;
    for (const s of suffixes) {
        const found = getFileBySuffix(s);
        if (found) { target = found; break; }
    }
    if (!target) {
        const byBase = headersBasenameIndex.get('ShaderQualityOptions.azsli');
        if (byBase && byBase.length > 0) {
            target = byBase[0];
        }
    }
    if (!target) return;
    try {
        const text = fs.readFileSync(target, 'utf8');
        const lines = text.split(/\r?\n/);
        const collectPrecedingComment = (fromIndex) => {
            let docLines = [];
            let j = fromIndex;
            while (j >= 0 && /^\s*$/.test(lines[j])) j--;
            while (j >= 0 && /^\s*\/\//.test(lines[j])) {
                docLines.unshift(lines[j].replace(/^\s*\/\//, '').trim());
                j--;
            }
            if (j >= 0 && /\*\/\s*$/.test(lines[j])) {
                let k = j;
                let block = [];
                while (k >= 0) {
                    block.unshift(lines[k]);
                    if (/^\s*\/\*/.test(lines[k])) break;
                    k--;
                }
                const cleaned = block.join('\n')
                    .replace(/^\s*\/\*/, '')
                    .replace(/\*\/\s*$/, '')
                    .split('\n')
                    .map(s => s.replace(/^\s*\*\s?/, '').trim());
                docLines = cleaned.concat(docLines);
            }
            return docLines;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const defineMatch = line.match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)(?:\s*\/\/\s*(.*))?\s*$/);
            if (defineMatch) {
                const name = defineMatch[1];
                const value = defineMatch[2].trim();
                const inlineComment = (defineMatch[3] || '').trim();
                const docLines = collectPrecedingComment(i - 1);
                const doc = [ ...docLines, inlineComment ].filter(Boolean).join('\n');
                const existing = macroIndex.get(name);
                if (!existing || (doc && (!existing.doc || existing.doc.length < doc.length))) {
                    macroIndex.set(name, {
                        value,
                        doc,
                        uri: vscode.Uri.file(target),
                        line: i
                    });
                }
            }
        }
        for (let i = 0; i < lines.length; i++) {
            const ifndef = lines[i].match(/^\s*#\s*ifndef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
            if (ifndef) {
                const name = ifndef[1];
                let defLine = -1, value = '';
                for (let k = i + 1; k < Math.min(lines.length, i + 12); k++) {
                    const m = lines[k].match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)(?:\s*\/\/\s*(.*))?\s*$/);
                    if (m && m[1] === name) {
                        defLine = k;
                        value = m[2].trim();
                        const inlineComment = (m[3] || '').trim();
                        const docLines = collectPrecedingComment(i - 1);
                        const doc = [ ...docLines, inlineComment ].filter(Boolean).join('\n');
                        if (!macroIndex.has(name) || (doc && macroIndex.get(name).doc.length === 0)) {
                            macroIndex.set(name, {
                                value,
                                doc,
                                uri: vscode.Uri.file(target),
                                line: defLine
                            });
                        }
                        break;
                    }
                }
            }
        }
    } catch {
    }
}

function indexDocumentMacros(document) {
    if (document.languageId !== 'azsl') return;
    try {
        const text = document.getText();
        const defs = extractMacrosWithComments(text);
        for (const d of defs) {
            const existing = macroIndex.get(d.name);
            if (!existing || document.uri.toString() === existing.uri.toString() || 
                (d.doc && (!existing.doc || existing.doc.length < d.doc.length))) {
                macroIndex.set(d.name, {
                    value: d.value,
                    doc: d.doc || '',
                    uri: document.uri,
                    line: d.line
                });
            }
        }
    } catch (e) {
        debugLog(`Error indexing macros: ${e.message}`);
    }
}

function activate(context) {
    if (!debugChannel) {
        debugChannel = vscode.window.createOutputChannel('AZSL Debug');
    }
    debugChannel.show(true);
    debugLog(`AZSL extension activated`);
    try {
        indexHeaders(readConfigHeadersPath());
        debugLog(`Initial indexing: ${indexedSymbols.size} symbols, ${macroIndex.size} macros, ${atomMethodIndex.size / 2} methods`);
    } catch (e) {
        debugLog(`Initial indexing failed: ${e.message}`);
    }

    const cmd = vscode.commands.registerCommand('azsl.reindex', async () => {
        indexHeaders(readConfigHeadersPath());
        vscode.workspace.textDocuments.forEach(doc => indexDocumentMacros(doc));
        vscode.window.showInformationMessage(`AZSL: Reindexed. Symbols: ${indexedSymbols.size}, Macros: ${macroIndex.size}, Atom Methods: ${atomMethodIndex.size / 2}`);
    });
    context.subscriptions.push(cmd);

    const setGemCmd = vscode.commands.registerCommand('azsl.setGemPath', async () => {
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Atom Gem directory'
        });
        if (!picked || picked.length === 0) return;
        const chosen = picked[0].fsPath;
        try {
            await vscode.workspace.getConfiguration('azsl').update('gemPath', chosen, vscode.ConfigurationTarget.Global);
            indexHeaders(chosen);
            vscode.window.showInformationMessage(`AZSL: Gem Path set. Reindexed. Macros: ${macroIndex.size}, Atom Methods: ${atomMethodIndex.size / 2}`);
        } catch {
            vscode.window.showErrorMessage('AZSL: Failed to set Gem Path');
        }
    });
    context.subscriptions.push(setGemCmd);

    const provider = vscode.languages.registerCompletionItemProvider(
        { language: 'azsl', scheme: 'file' },
        {
            provideCompletionItems
        },
        '.', ':', '[', '_'
    );
    context.subscriptions.push(provider);
    disposables.push(provider, cmd);
    
    registerIncludeLinkProviders(context);
    const hover = vscode.languages.registerHoverProvider({ language: 'azsl' }, {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const word = document.getText(range);
            
            const lineText = document.lineAt(position.line).text;
            const memberStart = range.start.character;
            const beforeMember = lineText.substring(0, memberStart);
            const memberAccessMatch = beforeMember.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);
            
            if (memberAccessMatch) {
                const varName = memberAccessMatch[1];
                const atomTypes = new Set(['Surface', 'LightingData']);
                const textureTypes = new Set(['Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 'RWTexture2D', 'RWTexture3D', 'Texture1D', 'Texture2DMS', 'RWTexture1D']);
                
                let varType = null;
                if (atomTypes.has(varName)) {
                    varType = varName;
                } else if (textureTypes.has(varName)) {
                    varType = varName;
                } else {
                    const text = document.getText();
                    const lines = text.split(/\r?\n/);
                    const variableTypes = new Map();
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const pascalTypeMatch = line.match(/\b([A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
                        if (pascalTypeMatch) {
                            const typeName = pascalTypeMatch[1];
                            const vName = pascalTypeMatch[2];
                            if (atomTypes.has(typeName) || textureTypes.has(typeName)) {
                                variableTypes.set(vName, typeName);
                            }
                        }
                        const textureTypeMatch = line.match(/\b(Texture\w*|RWTexture\w*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
                        if (textureTypeMatch) {
                            const typeName = textureTypeMatch[1];
                            const vName = textureTypeMatch[2];
                            if (textureTypes.has(typeName)) {
                                variableTypes.set(vName, typeName);
                            }
                        }
                    }
                    varType = variableTypes.get(varName);
                }
                
                if (varType && atomTypes.has(varType) && atomTypeMembers.has(varType)) {
                    const members = atomTypeMembers.get(varType);
                    if (members.has(word)) {
                        const key1 = `${varType}.${word}`;
                        const key2 = `${varType}::${word}`;
                        const methodInfo = atomMethodIndex.get(key1) || atomMethodIndex.get(key2);
                        
                        if (methodInfo) {
                            try {
                                const methodFileContent = fs.readFileSync(methodInfo.uri.fsPath, 'utf8');
                                const methodLines = methodFileContent.split(/\r?\n/);
                                if (methodInfo.line < methodLines.length) {
                                    let methodLine = methodLines[methodInfo.line].trim();
                                    if (methodLine.endsWith('{')) {
                                        methodLine = methodLine.substring(0, methodLine.length - 1).trim();
                                    }
                                    
                                    const md = new vscode.MarkdownString();
                                    md.isTrusted = false;
                                    md.appendCodeblock(methodLine, 'hlsl');
                                    md.appendMarkdown(`\n**Member of** \`${varType}\`\n\nDefined in: \`${path.basename(methodInfo.uri.fsPath)}\``);
                                    return new vscode.Hover(md, range);
                                }
                            } catch (e) {
                            }
                            
                            const md = new vscode.MarkdownString();
                            md.isTrusted = false;
                            md.appendCodeblock(`${varType}.${word}(...)`, 'hlsl');
                            md.appendMarkdown(`\n**Method of** \`${varType}\``);
                            return new vscode.Hover(md, range);
                        } else {
                            const md = new vscode.MarkdownString();
                            md.isTrusted = false;
                            md.appendCodeblock(`${varType}.${word}`, 'hlsl');
                            md.appendMarkdown(`\n**Property of** \`${varType}\``);
                            return new vscode.Hover(md, range);
                        }
                    }
                }
                else if (varType && textureTypes.has(varType)) {
                    const textureMethodDocs = builtinDocs.get(word);
                    if (textureMethodDocs) {
                        const md = new vscode.MarkdownString();
                        md.isTrusted = false;
                        md.appendMarkdown(textureMethodDocs);
                        md.appendMarkdown(`\n\n**Method of** \`${varType}\``);
                        return new vscode.Hover(md, range);
                    }
                }
            }
            
            const info = macroIndex.get(word);
            if (info) {
                const md = new vscode.MarkdownString();
                md.isTrusted = false;
                md.appendCodeblock(`#define ${word} ${info.value}`, 'c');
                if (info.doc) {
                    md.appendMarkdown('\n');
                    md.appendMarkdown(info.doc);
                }
                return new vscode.Hover(md, range);
            } else {
            }
            const builtin = builtinDocs.get(word);
            if (builtin) {
                const md = new vscode.MarkdownString();
                md.isTrusted = false;
                md.appendMarkdown(builtin);
                return new vscode.Hover(md, range);
            }
            const semantic = semanticDocs.get(word);
            if (semantic) {
                const md = new vscode.MarkdownString();
                md.isTrusted = false;
                md.appendMarkdown(semantic);
                return new vscode.Hover(md, range);
            }
            if (word.startsWith('SRG_')) {
                const srgSemantic = semanticDocs.get(word);
                if (srgSemantic) {
                    const md = new vscode.MarkdownString();
                    md.isTrusted = false;
                    md.appendMarkdown(srgSemantic);
                    return new vscode.Hover(md, range);
                }
            }
            return;
        }
    });
    context.subscriptions.push(hover);
    disposables.push(hover);
    const macroDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const word = document.getText(range);
            const info = macroIndex.get(word);
            if (info) {
                return new vscode.Location(info.uri, new vscode.Position(info.line, 0));
            } else {
            }
            return null;
        }
    });
    context.subscriptions.push(macroDef);
    disposables.push(macroDef);
    
    const builtinTypeDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const word = document.getText(range);
            
            const textureTypes = new Set(['Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 
                'RWTexture2D', 'RWTexture3D', 'RWTexture1D', 'Texture1D', 'Texture2DMS']);
            const samplerTypes = new Set(['Sampler', 'SamplerState', 'SamplerComparisonState']);
            const samplerProperties = new Set(['MaxAnisotropy', 'MinFilter', 'MagFilter', 'MipFilter', 
                'ReductionType', 'AddressU', 'AddressV', 'AddressW', 'MinLOD', 'MaxLOD']);
            const samplerValues = new Set(['Point', 'Linear', 'Wrap', 'Clamp', 'Mirror', 'Border', 'Filter']);
            
            if (textureTypes.has(word) || samplerTypes.has(word) || samplerProperties.has(word) || samplerValues.has(word)) {
                const doc = builtinDocs.get(word);
                if (doc) {
                    const virtualUri = vscode.Uri.parse(`azsl-builtin://documentation/${word}.azsli`);
                    
                    return new vscode.Location(virtualUri, new vscode.Position(0, 0));
                } else {
                }
            }
            
            return null;
        }
    });
    context.subscriptions.push(builtinTypeDef);
    disposables.push(builtinTypeDef);
    
    const srgSemanticDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const word = document.getText(range);
            
            if (word.startsWith('SRG_')) {
                const info = srgSemanticIndex.get(word);
                if (info) {
                    return new vscode.Location(info.uri, new vscode.Position(info.line, 0));
                } else {
                }
            }
            
            return null;
        }
    });
    context.subscriptions.push(srgSemanticDef);
    disposables.push(srgSemanticDef);
    
    // Text document content provider for built-in type documentation
    const builtinDocProvider = vscode.workspace.registerTextDocumentContentProvider('azsl-builtin', {
        provideTextDocumentContent(uri) {
            const typeName = path.basename(uri.path, '.azsli');
            const doc = builtinDocs.get(typeName);
            if (doc) {
                let content = `/*\n * Built-in HLSL/AZSL Type: ${typeName}\n *\n`;
                
                const lines = doc.split('\n');
                let inCodeBlock = false;
                let codeBlockContent = [];
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    if (line.trim().startsWith('```')) {
                        if (!inCodeBlock) {
                            inCodeBlock = true;
                            codeBlockContent = [];
                        } else {
                            inCodeBlock = false;
                            if (codeBlockContent.length > 0) {
                                content += ' *\n';
                                for (const codeLine of codeBlockContent) {
                                    content += ` * ${codeLine}\n`;
                                }
                                content += ' *\n';
                            }
                            codeBlockContent = [];
                        }
                        continue;
                    }
                    
                    if (inCodeBlock) {
                        codeBlockContent.push(line);
                        continue;
                    }
                    
                    if (line.trim() === '') {
                        content += ' *\n';
                    } else {
                        let cleanLine = line
                            .replace(/\*\*([^*]+)\*\*/g, '$1')
                            .replace(/`([^`]+)`/g, '$1')
                            .replace(/^#+\s*/, '')
                            .trim();
                        
                        if (cleanLine.match(/^[-*]\s/)) {
                            cleanLine = cleanLine.replace(/^[-*]\s/, '  - ');
                        }
                        
                        if (cleanLine) {
                            content += ` * ${cleanLine}\n`;
                        }
                    }
                }
                
                if (inCodeBlock && codeBlockContent.length > 0) {
                    content += ' *\n';
                    for (const codeLine of codeBlockContent) {
                        content += ` * ${codeLine}\n`;
                    }
                    content += ' *\n';
                }
                
                content += ' */\n\n';
                
                content += `// Example usage:\n`;
                if (typeName.startsWith('Texture')) {
                    if (typeName === 'RWTexture2D') {
                        content += `${typeName}<float4> m_texture;\n`;
                    } else {
                        content += `${typeName} m_texture;\n`;
                    }
                } else if (typeName.startsWith('Sampler')) {
                    content += `${typeName} m_sampler;\n`;
                } else if (['MaxAnisotropy', 'MinFilter', 'MagFilter', 'MipFilter', 'ReductionType', 
                    'AddressU', 'AddressV', 'AddressW', 'MinLOD', 'MaxLOD'].includes(typeName)) {
                    content += `Sampler m_sampler\n{\n    ${typeName} = `;
                    if (typeName === 'MaxAnisotropy') {
                        content += `4;\n`;
                    } else if (typeName === 'MinLOD' || typeName === 'MaxLOD') {
                        content += `0.0;\n`;
                    } else if (['MinFilter', 'MagFilter', 'MipFilter'].includes(typeName)) {
                        content += `Linear;\n`;
                    } else if (['AddressU', 'AddressV', 'AddressW'].includes(typeName)) {
                        content += `Wrap;\n`;
                    } else if (typeName === 'ReductionType') {
                        content += `Filter;\n`;
                    }
                    content += `};\n`;
                } else if (['Point', 'Linear'].includes(typeName)) {
                    content += `MinFilter = ${typeName};\nMagFilter = ${typeName};\nMipFilter = ${typeName};\n`;
                } else if (['Wrap', 'Clamp', 'Mirror', 'Border'].includes(typeName)) {
                    content += `AddressU = ${typeName};\nAddressV = ${typeName};\n`;
                } else if (typeName === 'Filter') {
                    content += `ReductionType = ${typeName};\n`;
                } else {
                    content += `${typeName} m_resource;\n`;
                }
                
                return content;
            }
            return `// Built-in type: ${typeName}\n// No documentation available.`;
        }
    });
    context.subscriptions.push(builtinDocProvider);
    disposables.push(builtinDocProvider);
    
    const tokenTypes = ['type', 'function', 'variable', 'parameter', 'property', 'method', 'modifier', 'macro'];
    const tokenModifiers = ['declaration', 'definition', 'readonly', 'static'];
    const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
    
    const TOKEN_TYPE = 0;
    const TOKEN_FUNCTION = 1;
    const TOKEN_VARIABLE = 2;
    const TOKEN_PARAMETER = 3;
    const TOKEN_PROPERTY = 4;
    const TOKEN_METHOD = 5;
    const TOKEN_MODIFIER = 6;
    const TOKEN_MACRO = 7;
    
    const semanticTokensProvider = {
        provideDocumentSemanticTokens(document) {
            const builder = new vscode.SemanticTokensBuilder(legend);
            const text = document.getText();
            const lines = text.split(/\r?\n/);
            
            const builtinTypes = new Set([
                'float', 'float2', 'float3', 'float4', 'float2x2', 'float3x3', 'float4x4',
                'int', 'int2', 'int3', 'int4', 'uint', 'uint2', 'uint3', 'uint4',
                'bool', 'half', 'double', 'void', 'matrix',
                'Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 'RWTexture2D',
                'Sampler', 'SamplerState', 'SamplerComparisonState'
            ]);
            
            const macroTypes = new Set();
            for (const [macroName, macroInfo] of macroIndex.entries()) {
                const value = macroInfo.value.trim();
                if (builtinTypes.has(value) || 
                    /^(float|int|uint|bool|half|double|real)([1-4](x[1-4])?)?$/.test(value)) {
                    macroTypes.add(macroName);
                }
            }
            
            const userTypes = new Set();
            for (const line of lines) {
                const structMatch = line.match(/\b(?:struct|class)\s+([A-Z][A-Za-z0-9_]*)\b/);
                if (structMatch) {
                    userTypes.add(structMatch[1]);
                }
                const typeMatch = line.match(/\b([A-Z][A-Za-z0-9_]+)\s+[A-Za-z_][A-Za-z0-9_]*\s*[;=,\[\(]/);
                if (typeMatch && !builtinTypes.has(typeMatch[1]) && !macroTypes.has(typeMatch[1])) {
                    userTypes.add(typeMatch[1]);
                }
            }
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineNumber = i;
                
                let processedLine = line;
                processedLine = processedLine.replace(/\/\/.*$/g, '');
                processedLine = processedLine.replace(/\/\*[\s\S]*?\*\//g, '');
                processedLine = processedLine.replace(/"[^"]*"/g, '""');
                
                for (const type of macroTypes) {
                    const regex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
                    let match;
                    while ((match = regex.exec(processedLine)) !== null) {
                        const before = processedLine.substring(0, match.index);
                        const after = processedLine.substring(match.index + match[0].length);
                        if (after.match(/^\s+[A-Za-z_]/) || 
                            before.match(/(?:^|\s|\(|,|\[|::|\.)$/) ||
                            (before.trim() === '' && after.match(/^\s*[A-Za-z_]/))) {
                            builder.push(lineNumber, match.index, match[0].length, 0);
                        }
                    }
                }
                
                for (const type of userTypes) {
                    const regex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
                    let match;
                    while ((match = regex.exec(processedLine)) !== null) {
                        const before = processedLine.substring(0, match.index);
                        const after = processedLine.substring(match.index + match[0].length);
                        if (after.match(/^\s+[A-Za-z_]/) || 
                            before.match(/(?:^|\s|\(|,|\[|::|\.)$/) ||
                            (before.trim() === '' && after.match(/^\s*[A-Za-z_]/))) {
                            builder.push(lineNumber, match.index, match[0].length, 0);
                        }
                    }
                }
                
                // Highlight attributes (semantics) in square brackets: [unroll], [branch], [flatten], [loop], [numthreads(...)], etc.
                // Match: [identifier] or [identifier(...)]
                const attributeRegex = /\[([a-zA-Z_][a-zA-Z0-9_]*)(?:\([^)]*\))?\]/g;
                let attrMatch;
                while ((attrMatch = attributeRegex.exec(processedLine)) !== null) {
                    const attrName = attrMatch[1];
                    // Common HLSL/AZSL attributes
                    const knownAttributes = new Set([
                        'unroll', 'branch', 'flatten', 'loop', 'fastopt', 'allow_uav_condition',
                        'numthreads', 'domain', 'partitioning', 'outputtopology', 'outputcontrolpoints',
                        'patchconstantfunc', 'maxtessfactor', 'instance', 'maxvertexcount',
                        'earlydepthstencil', 'conservative', 'precise', 'groupshared', 'static',
                        'row_major', 'column_major', 'packoffset', 'register', 'in', 'out', 'inout'
                    ]);
                    
                    const beforeBracket = processedLine.substring(0, attrMatch.index).trim();
                    const afterBracket = processedLine.substring(attrMatch.index + attrMatch[0].length).trim();
                    
                    let nextLineAfterBracket = '';
                    if (i + 1 < lines.length && processedLine.trim().endsWith(']')) {
                        const nextLine = lines[i + 1];
                        const nextProcessed = nextLine.replace(/\/\/.*$/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
                        nextLineAfterBracket = nextProcessed;
                    }
                    
                    const isArraySize = beforeBracket.match(/\b[A-Za-z_][A-Za-z0-9_]*\s*$/);
                    
                    const isAttribute = afterBracket.match(/^(for|while|if|else|switch|return|void|float|int|uint|real|bool|half|double|Texture|Sampler|[A-Z][A-Za-z0-9_]*\s+[A-Za-z_])/) ||
                                       nextLineAfterBracket.match(/^(for|while|if|else|switch|return|void|float|int|uint|real|bool|half|double|Texture|Sampler|[A-Z][A-Za-z0-9_]*\s+[A-Za-z_])/);
                    
                    const isKnownAttribute = knownAttributes.has(attrName.toLowerCase());
                    
                    if ((isAttribute || isKnownAttribute) && !isArraySize) {
                        const attrStart = attrMatch.index + 1;
                        builder.push(lineNumber, attrStart, attrName.length, TOKEN_FUNCTION);
                    } else if (isArraySize && !isKnownAttribute) {
                        if (macroIndex.has(attrName) || /^[A-Z_][A-Z0-9_]*$/.test(attrName)) {
                            const attrStart = attrMatch.index + 1;
                            builder.push(lineNumber, attrStart, attrName.length, TOKEN_VARIABLE);
                        }
                    } else if (isKnownAttribute && isArraySize) {
                        const attrStart = attrMatch.index + 1;
                        builder.push(lineNumber, attrStart, attrName.length, TOKEN_FUNCTION);
                    }
                }
            }
            
            return builder.build();
        }
    };
    
    const semanticTokens = vscode.languages.registerDocumentSemanticTokensProvider(
        { language: 'azsl' },
        semanticTokensProvider,
        legend
    );
    context.subscriptions.push(semanticTokens);
    disposables.push(semanticTokens);
    
    const atomMethodDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const methodName = document.getText(range);
            
            const lineText = document.lineAt(position.line).text;
            const methodStart = range.start.character;
            const beforeMethod = lineText.substring(0, methodStart);
            
            const memberAccessMatch = beforeMethod.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]\s*$/);
            if (!memberAccessMatch) {
                return;
            }
            
            const varName = memberAccessMatch[1];
            
            const atomTypes = new Set(['Surface', 'LightingData']);
            
            let varType = null;
            if (atomTypes.has(varName)) {
                varType = varName;
            } else {
                const text = document.getText();
                const lines = text.split(/\r?\n/);
                
                const variableTypes = new Map();
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const varDeclMatch = line.match(/\b(?:float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|([A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
                    if (varDeclMatch && varDeclMatch[1] && varDeclMatch[2]) {
                        const typeName = varDeclMatch[1];
                        const vName = varDeclMatch[2];
                        if (atomTypes.has(typeName)) {
                            variableTypes.set(vName, typeName);
                        }
                    }
                }
                
                varType = variableTypes.get(varName);
                if (!varType) {
                    return;
                }
            }
            
            const key1 = `${varType}.${methodName}`;
            const key2 = `${varType}::${methodName}`;
            
            const methodInfo = atomMethodIndex.get(key1) || atomMethodIndex.get(key2);
            if (!methodInfo) {
                return;
            }
            return new vscode.Location(methodInfo.uri, new vscode.Position(methodInfo.line, methodInfo.column));
        }
    });
    context.subscriptions.push(atomMethodDef);
    disposables.push(atomMethodDef);
    
    const cfgWatcher = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('azsl.headersPath') || e.affectsConfiguration('azsl.gemPath')) {
            indexHeaders(readConfigHeadersPath());
            vscode.workspace.textDocuments.forEach(doc => indexDocumentMacros(doc));
            vscode.window.showInformationMessage(`AZSL: Reindexed (settings changed). Macros: ${macroIndex.size}, Atom Methods: ${atomMethodIndex.size / 2}`);
        }
    });
    context.subscriptions.push(cfgWatcher);
    disposables.push(cfgWatcher);
    const openWatcher = vscode.workspace.onDidOpenTextDocument(doc => indexDocumentMacros(doc));
    const changeWatcher = vscode.workspace.onDidChangeTextDocument(e => indexDocumentMacros(e.document));
    vscode.workspace.textDocuments.forEach(doc => indexDocumentMacros(doc));
    context.subscriptions.push(openWatcher, changeWatcher);
    disposables.push(openWatcher, changeWatcher);
    
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('azsl');
    context.subscriptions.push(diagnosticCollection);
    
    const builtinIdentifiers = new Set([
        'max', 'min', 'saturate', 'clamp', 'smoothstep', 'normalize', 'length', 'dot', 'cross',
        'pow', 'floor', 'ceil', 'frac', 'lerp', 'step', 'ddx', 'ddy', 'abs', 'mul', 'round',
        'sin', 'cos', 'sqrt', 'fmod',
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
    
    function extractDeclarations(text) {
        const declarations = new Set();
        const lines = text.split(/\r?\n/);
        const knownStructs = new Set();
        
        for (const line of lines) {
            const structMatch = line.match(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
            if (structMatch) {
                declarations.add(structMatch[1]);
                knownStructs.add(structMatch[1]);
            }
            
            const patterns = [
                /\bconst\s+(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]\s*)?[;=]/,
                /\b(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]\s*)?[;=]/
            ];
            for (const pattern of patterns) {
                const match = line.match(pattern);
                if (match && match[1]) {
                    declarations.add(match[1]);
                }
            }
            
            const funcMatch = line.match(/\b(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|void|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{?/);
            if (funcMatch) {
                const funcName = funcMatch[1];
                declarations.add(funcName);
                const paramsStr = funcMatch[2];
                if (paramsStr && paramsStr.trim()) {
                    const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);
                    for (const param of params) {
                        const paramMatch = param.match(/^(?:(?:in|out|inout)\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:|$)/);
                        if (paramMatch && paramMatch[1]) {
                            declarations.add(paramMatch[1]);
                        }
                    }
                }
            }
            
            const srgMatch = line.match(/\bShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
            if (srgMatch) declarations.add(srgMatch[1]);
        }
        
        let inSrg = false;
        let currentSrg = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const srgStart = line.match(/\bShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
            if (srgStart) {
                inSrg = true;
                currentSrg = srgStart[1];
            }
            if (line.includes('}') && inSrg) {
                inSrg = false;
                currentSrg = '';
            }
            if (inSrg && currentSrg) {
                const memberMatch = line.match(/^\s*(?:float|int|uint|bool|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;{]/);
                if (memberMatch) {
                    declarations.add(`${currentSrg}::${memberMatch[1]}`);
                }
            }
        }
        
        for (const line of lines) {
            const macroMatch = line.match(/#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (macroMatch) declarations.add(macroMatch[1]);
        }
        
        let inStruct = false;
        let currentStruct = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const structStart = line.match(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
            if (structStart && knownStructs.has(structStart[1])) {
                inStruct = true;
                currentStruct = structStart[1];
            }
            if (line.includes('}') && inStruct) {
                inStruct = false;
                currentStruct = '';
            }
            if (inStruct && currentStruct) {
                const memberMatch = line.match(/^\s*(?:float|int|uint|bool|half|double|noperspective|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
                if (memberMatch) {
                    declarations.add(`${currentStruct}.${memberMatch[1]}`);
                }
            }
        }
        
        const classMembers = new Map();
        let inClass = false;
        let currentClass = '';
        let braceDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const classStart = line.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
            if (classStart) {
                inClass = true;
                currentClass = classStart[1];
                knownStructs.add(currentClass);
                braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                if (!classMembers.has(currentClass)) {
                    classMembers.set(currentClass, new Set());
                }
            }
            if (inClass && currentClass) {
                if (!/^\s*#/.test(line)) {
                    braceDepth += (line.match(/\{/g) || []).length;
                    braceDepth -= (line.match(/\}/g) || []).length;
                }
                
                const memberMatch = line.match(/^\s*(?:precise\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=\(]/);
                if (memberMatch) {
                    const memberName = memberMatch[1];
                    classMembers.get(currentClass).add(memberName);
                }
                
                if (braceDepth <= 0 && line.includes('}')) {
                    inClass = false;
                    currentClass = '';
                    braceDepth = 0;
                }
            }
        }
        
        return { declarations, knownStructs, classMembers };
    }
    
    function validateDocument(document) {
        if (document.languageId !== 'azsl') return;
        
        const fileName = document.fileName.split(/[/\\]/).pop();
        const text = document.getText();
        
        const { declarations, knownStructs, classMembers } = extractDeclarations(text);
        const diagnostics = [];
        const lines = text.split(/\r?\n/);
        
        for (const sym of builtinIdentifiers) declarations.add(sym);
        for (const sym of indexedSymbols) declarations.add(sym);
        for (const name of macroIndex.keys()) declarations.add(name);
        
        const pascalCaseTypes = new Set();
        for (const line of lines) {
            const typeMatch = line.match(/\b([A-Z][A-Za-z0-9_]+)\s+[A-Za-z_][A-Za-z0-9_]*\s*[;=,\[\(]/);
            if (typeMatch && !builtinIdentifiers.has(typeMatch[1])) {
                pascalCaseTypes.add(typeMatch[1]);
            }
            const funcTypeMatch = line.match(/\b([A-Z][A-Za-z0-9_]+)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/);
            if (funcTypeMatch && !builtinIdentifiers.has(funcTypeMatch[1])) {
                pascalCaseTypes.add(funcTypeMatch[1]);
            }
        }
        for (const t of pascalCaseTypes) declarations.add(t);
        
        const atomTypes = new Set([
            'ForwardPassOutput', 'Surface', 'LightingData',
            'DirectionalLight', 'SimplePointLight', 'PointLight', 'SimpleSpotLight', 'DiskLight',
            'ViewSrg', 'SceneSrg', 'ObjectSrg'
        ]);
        for (const t of atomTypes) declarations.add(t);
        
        if (!atomTypeMembers.has('Surface')) {
            atomTypeMembers.set('Surface', new Set([
                'position', 'normal', 'vertexNormal', 'metallic', 'roughnessLinear',
                'opacityAffectsSpecularFactor', 'opacityAffectsEmissiveFactor',
                'albedo', 'roughnessA',
                'CalculateRoughnessA', 'SetAlbedoAndSpecularF0', 'GetDefaultNormal', 'GetSpecularF0'
            ]));
        }
        if (!atomTypeMembers.has('LightingData')) {
            atomTypeMembers.set('LightingData', new Set([
                'diffuseResponse', 'specularResponse', 'diffuseLighting', 'specularLighting',
                'diffuseAmbientOcclusion', 'specularOcclusion',
                'Init', 'FinalizeLighting'
            ]));
        }
        
        
        const variableTypes = new Map();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const constVarDeclMatch = line.match(/\bconst\s+(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|([A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
            if (constVarDeclMatch && constVarDeclMatch[1]) {
                const typeName = constVarDeclMatch[1];
                const varName = constVarDeclMatch[2];
                if (knownStructs.has(typeName) || atomTypes.has(typeName) || pascalCaseTypes.has(typeName)) {
                    variableTypes.set(varName, typeName);
                }
            }
            const varDeclMatch = line.match(/\b(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|([A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
            if (varDeclMatch && varDeclMatch[1] && varDeclMatch[2]) {
                const typeName = varDeclMatch[1];
                const varName = varDeclMatch[2];
                if (knownStructs.has(typeName) || atomTypes.has(typeName) || pascalCaseTypes.has(typeName)) {
                    variableTypes.set(varName, typeName);
                }
            }
        }
        
        const methodClassContext = new Map();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const methodMatch = line.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (methodMatch) {
                const className = methodMatch[1];
                const methodName = methodMatch[2];
                if (classMembers.has(className)) {
                    let braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                    let methodStart = i;
                    if (braceDepth === 0 && !line.includes('{')) {
                        methodStart = i + 1;
                    }
                    for (let j = methodStart; j < lines.length; j++) {
                        const methodLine = lines[j];
                        if (!/^\s*#/.test(methodLine)) {
                            braceDepth += (methodLine.match(/\{/g) || []).length;
                            braceDepth -= (methodLine.match(/\}/g) || []).length;
                        }
                        if (j >= methodStart) {
                            methodClassContext.set(j, className);
                        }
                        if (braceDepth <= 0 && methodLine.includes('}')) {
                            break;
                        }
                    }
                }
            }
        }
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (/^\s*\/\//.test(line) || /^\s*#/.test(line)) {
                continue;
            }
            
            if (methodClassContext.has(i)) {
                const className = methodClassContext.get(i);
                if (classMembers.has(className)) {
                    const members = classMembers.get(className);
                    for (const member of members) {
                        declarations.add(member);
                    }
                }
            }
            
            let lineWithoutStrings = line;
            lineWithoutStrings = lineWithoutStrings.replace(/"[^"]*"/g, '""');
            
            lineWithoutStrings = lineWithoutStrings.replace(/\/\*[\s\S]*?\*\//g, '');
            lineWithoutStrings = lineWithoutStrings.replace(/\/\/.*$/g, '');
            
            const identifierRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            let matchCount = 0;
            while ((match = identifierRegex.exec(lineWithoutStrings)) !== null) {
                matchCount++;
                const identifier = match[1];
                const pos = match.index;
                const beforeMatch = lineWithoutStrings.substring(0, pos);
                const afterMatch = lineWithoutStrings.substring(pos + identifier.length);
                
                if (builtinIdentifiers.has(identifier)) {
                    continue;
                }
                
                if (declarations.has(identifier)) {
                    continue;
                }
                
                if (/^\s*\(/.test(afterMatch) && declarations.has(identifier)) {
                    continue;
                }
                
                if (/\.\s*$/.test(beforeMatch) || /::\s*$/.test(beforeMatch)) {
                    const beforeAccess = beforeMatch.trim();
                    const varMatch = beforeAccess.match(/([A-Za-z_][A-Za-z0-9_]*)\s*[\.:]+\s*$/);
                    if (varMatch) {
                        const varName = varMatch[1];
                        let varType = null;
                        
                        if (variableTypes.has(varName)) {
                            varType = variableTypes.get(varName);
                        }
                        else if (atomTypes.has(varName) || pascalCaseTypes.has(varName) || knownStructs.has(varName)) {
                            varType = varName;
                        }
                        
                        if (varType && atomTypeMembers.has(varType)) {
                            if (atomTypeMembers.get(varType).has(identifier)) {
                                continue;
                            }
                            const range = new vscode.Range(i, pos, i, pos + identifier.length);
                            diagnostics.push(new vscode.Diagnostic(
                                range,
                                `no member named '${identifier}' in type '${varType}'`,
                                vscode.DiagnosticSeverity.Error
                            ));
                            continue;
                        }
                        continue;
                    }
                }
                
                if (/^[A-Z]/.test(identifier) && (pascalCaseTypes.has(identifier) || atomTypes.has(identifier))) {
                    continue;
                }
                
                const trimmedBefore = beforeMatch.trim();
                if (/:\s*$/.test(beforeMatch)) {
                    continue;
                }
                if (/\b(?:struct|ShaderResourceGroup|cbuffer|tbuffer|namespace|class)\s+$/.test(trimmedBefore)) {
                    continue;
                }
                if (/\b(?:float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|void|matrix|Texture\w*|Sampler\w*)\s+$/.test(trimmedBefore)) {
                    continue;
                }
                if (/\b[A-Z][A-Za-z0-9_]*\s+$/.test(trimmedBefore)) {
                    continue;
                }
                
                
                if (/\([^)]*$/.test(beforeMatch) && /\)/.test(afterMatch)) {
                    continue;
                }
                
                // Skip if it's part of SRG::member pattern
                const srgMemberMatch = line.substring(Math.max(0, pos - 50), pos + identifier.length).match(/([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)/);
                if (srgMemberMatch && srgMemberMatch[2] === identifier) {
                    const fullSrgMember = `${srgMemberMatch[1]}::${srgMemberMatch[2]}`;
                    if (declarations.has(fullSrgMember)) {
                        continue;
                    }
                    if (atomTypes.has(srgMemberMatch[1]) || declarations.has(srgMemberMatch[1])) {
                        continue;
                    }
                }
                
                let foundSrgMember = false;
                for (const decl of declarations) {
                    if (decl.includes('::') && decl.endsWith(`::${identifier}`)) {
                        foundSrgMember = true;
                        break;
                    }
                }
                if (foundSrgMember) {
                    continue;
                }
                
                if (/[\d.eE+-]\s*$/.test(beforeMatch)) {
                    continue;
                }
                
                if (/<[^>]*$/.test(beforeMatch) || /"[^"]*$/.test(beforeMatch)) {
                    continue;
                }
                
                const atomFunctions = ['GetObjectToWorldMatrix', 'GetObjectToWorldMatrixInverseTranspose', 
                                      'ApplyIblForward', 'ComputeShadowIndex', 'EncodeNormalSignedOctahedron',
                                      'GetVisibility', 'Init', 'FinalizeLighting', 'CalculateRoughnessA',
                                      'SetAlbedoAndSpecularF0', 'GetSpecularF0', 'GetDefaultNormal'];
                if (atomFunctions.includes(identifier)) {
                    continue;
                }
                
                const namespaceFuncMatch = line.substring(Math.max(0, pos - 50), pos + identifier.length).match(/([A-Z][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)/);
                if (namespaceFuncMatch && namespaceFuncMatch[2] === identifier) {
                    continue;
                }
                
                if (/^[A-Z]/.test(identifier)) {
                    continue;
                }
                
                if (/\?/.test(beforeMatch) || /:/.test(afterMatch.substring(0, 5))) {
                    continue;
                }
                
                const followedBySemicolon = /^\s*;/.test(afterMatch);
                const followedByOperator = /^\s*[+\-*\/%<>!&|=]/.test(afterMatch);
                const followedByParen = /^\s*\(/.test(afterMatch);
                const followedByBracket = /^\s*\[/.test(afterMatch);
                const followedByComma = /^\s*,/.test(afterMatch);
                const followedByClosing = /^\s*[\)\]]/.test(afterMatch);
                
                const isUsage = followedBySemicolon || followedByOperator || followedByParen || 
                               followedByBracket || followedByComma || followedByClosing;
                
                if (!isUsage) {
                    continue;
                }
                
                if (/^[a-z_]/.test(identifier)) {
                    const range = new vscode.Range(i, pos, i, pos + identifier.length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `use of undeclared identifier '${identifier}'`,
                        vscode.DiagnosticSeverity.Error
                    ));
                } else if (identifier === 'undefinedVar') {
                }
            }
            
        }
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            const incompleteDotMatch = trimmedLine.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/);
            if (incompleteDotMatch) {
                const varName = incompleteDotMatch[1];
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    if (/^(float|int|uint|bool|half|double|void|matrix|Texture|Sampler|struct|class|namespace|ShaderResourceGroup|cbuffer|tbuffer|#|\/\/|\/\*)/.test(nextLine) ||
                        /^[A-Z][A-Za-z0-9_]*\s+[A-Za-z_]/.test(nextLine)) {
                        const dotPos = line.lastIndexOf('.');
                        const range = new vscode.Range(i, dotPos, i, dotPos + 1);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `incomplete member access`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                } else {
                    const dotPos = line.lastIndexOf('.');
                    const range = new vscode.Range(i, dotPos, i, dotPos + 1);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `incomplete member access`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
            
            const incompleteColonMatch = trimmedLine.match(/([A-Za-z_][A-Za-z0-9_]*)\s*::\s*$/);
            if (incompleteColonMatch) {
                const varName = incompleteColonMatch[1];
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    if (/^(float|int|uint|bool|half|double|void|matrix|Texture|Sampler|struct|class|namespace|ShaderResourceGroup|cbuffer|tbuffer|#|\/\/|\/\*)/.test(nextLine) ||
                        /^[A-Z][A-Za-z0-9_]*\s+[A-Za-z_]/.test(nextLine)) {
                        const colonPos = line.lastIndexOf('::');
                        const range = new vscode.Range(i, colonPos, i, colonPos + 2);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `incomplete member access`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                } else {
                    const colonPos = line.lastIndexOf('::');
                    const range = new vscode.Range(i, colonPos, i, colonPos + 2);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `incomplete member access`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
        
        diagnosticCollection.set(document.uri, diagnostics);
    }
    
    const docChangeWatcher = vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.languageId === 'azsl') {
            validateDocument(e.document);
        }
    });
    const docOpenWatcher = vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId === 'azsl') {
            validateDocument(doc);
        }
    });
    context.subscriptions.push(docChangeWatcher, docOpenWatcher);
    disposables.push(docChangeWatcher, docOpenWatcher);
    
    vscode.workspace.textDocuments.forEach(doc => {
        if (doc.languageId === 'azsl') {
            validateDocument(doc);
        }
    });
}

function deactivate() {
    for (const d of disposables) {
        try { d.dispose(); } catch {}
    }
    disposables = [];
}

module.exports = {
    activate,
    deactivate
};



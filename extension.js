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
let srgMembers = new Map();
let srgMemberIndex = new Map();
let srgIndex = new Map();
let structIndex = new Map();
let structMembers = new Map();
let functionIndex = new Map();
let optionIndex = new Map();

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
    Filter: "**Reduction Type: Filter**\n\nStandard filtering reduction type. Used for normal texture sampling.\n\n**Usage:**\n```hlsl\nReductionType = Filter;\n```\n\n**Note:** This is a reduction type value used in sampler initialization.",
    StructuredBuffer: "**Built-in Type: StructuredBuffer<T>**\n\nStructured buffer resource type in HLSL/AZSL. Represents a buffer containing an array of structured data (structs).\n\n**Declaration:**\n```hlsl\nStructuredBuffer<StructType> bufferName;\n```\n\n**Common Usage:**\n```hlsl\nstruct MyStruct {\n    float3 position;\n    float4 color;\n};\n\nStructuredBuffer<MyStruct> m_instances;\n\nMyStruct instance = m_instances[index];\n```\n\n**Access:**\n- `buffer[index]` - Access element at index\n- `buffer.Load(index)` - Load element at index\n- `buffer.GetDimensions(out uint count)` - Get number of elements\n\n**Note:** This is a built-in HLSL/AZSL type. Used for reading structured data arrays in shaders.",
    Buffer: "**Built-in Type: Buffer<T>**\n\nBuffer resource type in HLSL/AZSL. Represents a typed buffer containing scalar or vector data.\n\n**Declaration:**\n```hlsl\nBuffer<Type> bufferName;\n```\n\n**Common Usage:**\n```hlsl\nBuffer<float4> m_colors;\nBuffer<uint> m_indices;\n\nfloat4 color = m_colors[index];\nuint idx = m_indices[i];\n```\n\n**Access:**\n- `buffer[index]` - Access element at index\n- `buffer.Load(index)` - Load element at index\n- `buffer.GetDimensions(out uint count)` - Get number of elements\n\n**Note:** This is a built-in HLSL/AZSL type. Used for reading typed data arrays in shaders."
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

function extractSrgDeclarations(text, filePath) {
    const results = new Map();
    const memberLocations = new Map();
    const lines = text.split(/\r?\n/);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\s*(?:partial\s+)?ShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[A-Za-z_][A-Za-z0-9_]*)?/);
        if (match) {
            const srgName = match[1];
            let startLine = i;
            let braceDepth = 0;
            
            if (line.includes('{')) {
                braceDepth = 1;
            } else if (i + 1 < lines.length && lines[i + 1].trim().startsWith('{')) {
                startLine = i + 1;
                braceDepth = 1;
            } else {
                continue;
            }
            
            if (!results.has(srgName)) {
                results.set(srgName, {
                    name: srgName,
                    uri: vscode.Uri.file(filePath),
                    line: i,
                    members: new Set()
                });
                debugLog(`Found SRG: ${srgName} at ${path.basename(filePath)}:${i + 1}`);
            }
            let inString = false;
            let inComment = false;
            let commentType = null;
            
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '"' && (j === 0 || line[j-1] !== '\\')) {
                    inString = !inString;
                }
                if (!inString) {
                    if (line[j] === '/' && j + 1 < line.length && line[j+1] === '/') {
                        break;
                    }
                    if (line[j] === '/' && j + 1 < line.length && line[j+1] === '*') {
                        inComment = true;
                        commentType = 'block';
                        j++;
                        continue;
                    }
                    if (inComment && commentType === 'block' && line[j] === '*' && j + 1 < line.length && line[j+1] === '/') {
                        inComment = false;
                        commentType = null;
                        j++;
                        continue;
                    }
                    if (!inComment) {
                        if (line[j] === '{') braceDepth++;
                        else if (line[j] === '}') braceDepth--;
                    }
                }
            }
            
            for (let j = startLine + 1; j < lines.length && braceDepth > 0; j++) {
                const srgLine = lines[j];
                let lineBraceDepth = 0;
                inString = false;
                inComment = false;
                commentType = null;
                
                for (let k = 0; k < srgLine.length; k++) {
                    if (srgLine[k] === '"' && (k === 0 || srgLine[k-1] !== '\\')) {
                        inString = !inString;
                    }
                    if (!inString) {
                        if (srgLine[k] === '/' && k + 1 < srgLine.length && srgLine[k+1] === '/') {
                            break;
                        }
                        if (srgLine[k] === '/' && k + 1 < srgLine.length && srgLine[k+1] === '*') {
                            inComment = true;
                            commentType = 'block';
                            k++;
                            continue;
                        }
                        if (inComment && commentType === 'block' && srgLine[k] === '*' && k + 1 < srgLine.length && srgLine[k+1] === '/') {
                            inComment = false;
                            commentType = null;
                            k++;
                            continue;
                        }
                        if (!inComment) {
                            if (srgLine[k] === '{') lineBraceDepth++;
                            else if (srgLine[k] === '}') lineBraceDepth--;
                        }
                    }
                }
                
                braceDepth += lineBraceDepth;
                
                if (braceDepth > 0 && !inComment) {
                    const trimmed = srgLine.trim();
                    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
                        let angleDepth = 0;
                        let lastSpaceAfterTemplate = -1;
                        let foundMember = false;
                        for (let i = 0; i < trimmed.length; i++) {
                            if (trimmed[i] === '<') {
                                angleDepth++;
                            } else if (trimmed[i] === '>') {
                                angleDepth--;
                                if (angleDepth === 0) {
                                    lastSpaceAfterTemplate = -1;
                                }
                            } else if (angleDepth === 0) {
                                if (trimmed[i] === ' ' || trimmed[i] === '\t') {
                                    lastSpaceAfterTemplate = i;
                                } else if (trimmed[i] === ';' || trimmed[i] === '=' || trimmed[i] === '(' || trimmed[i] === '[' || trimmed[i] === '{') {
                                    if (lastSpaceAfterTemplate >= 0) {
                                        const memberName = trimmed.substring(lastSpaceAfterTemplate + 1, i).trim();
                                        if (memberName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(memberName)) {
                                            if (memberName !== 'ShaderResourceGroup' && memberName !== 'partial' && memberName !== 'static' && memberName !== 'const') {
                                                results.get(srgName).members.add(memberName);
                                                const memberKey = `${srgName}::${memberName}`;
                                                if (!memberLocations.has(memberKey)) {
                                                    memberLocations.set(memberKey, {
                                                        uri: vscode.Uri.file(filePath),
                                                        line: j,
                                                        srgName: srgName,
                                                        memberName: memberName
                                                    });
                                                    debugLog(`Found SRG member: ${srgName}::${memberName} at ${path.basename(filePath)}:${j + 1}`);
                                                }
                                                foundMember = true;
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                        // Check if line ends with a variable name and next line starts with {
                        if (!foundMember && lastSpaceAfterTemplate >= 0 && j + 1 < lines.length) {
                            const nextLine = lines[j + 1];
                            const nextTrimmed = nextLine.trim();
                            if (nextTrimmed.startsWith('{')) {
                                const memberName = trimmed.substring(lastSpaceAfterTemplate + 1).trim();
                                if (memberName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(memberName)) {
                                    if (memberName !== 'ShaderResourceGroup' && memberName !== 'partial' && memberName !== 'static' && memberName !== 'const') {
                                        results.get(srgName).members.add(memberName);
                                        const memberKey = `${srgName}::${memberName}`;
                                        if (!memberLocations.has(memberKey)) {
                                            memberLocations.set(memberKey, {
                                                uri: vscode.Uri.file(filePath),
                                                line: j,
                                                srgName: srgName,
                                                memberName: memberName
                                            });
                                            debugLog(`Found SRG member (multiline): ${srgName}::${memberName} at ${path.basename(filePath)}:${j + 1}`);
                                        }
                                    }
                                }
                            }
                        }
                        
                        const funcMatch = trimmed.match(/^\s*(?:[A-Za-z_][A-Za-z0-9_<>,\s]*\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
                        if (funcMatch) {
                            const funcName = funcMatch[1];
                            if (funcName !== 'ShaderResourceGroup' && funcName !== 'partial' && funcName !== 'static' && funcName !== 'const') {
                                results.get(srgName).members.add(funcName);
                                const memberKey = `${srgName}::${funcName}`;
                                if (!memberLocations.has(memberKey)) {
                                    memberLocations.set(memberKey, {
                                        uri: vscode.Uri.file(filePath),
                                        line: j,
                                        srgName: srgName,
                                        memberName: funcName
                                    });
                                    debugLog(`Found SRG function: ${srgName}::${funcName} at ${path.basename(filePath)}:${j + 1}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    return { srgInfo: results, memberLocations: memberLocations };
}

function extractStructDeclarations(text, filePath) {
    const results = new Map();
    const structMembersMap = new Map();
    const lines = text.split(/\r?\n/);
    
    debugLog(`[extractStructDeclarations] Parsing file: ${path.basename(filePath)}, ${lines.length} lines`);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match struct, class, and typedef declarations
        let match = line.match(/^\s*(?:struct|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[A-Za-z_][A-Za-z0-9_]*)?/);
        if (!match) {
            // Try typedef: typedef struct/class Name { ... } AliasName;
            // or: typedef ExistingType AliasName;
            match = line.match(/^\s*typedef\s+(?:struct|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[A-Za-z_][A-Za-z0-9_]*)?/);
            if (!match) {
                // Simple typedef: typedef ExistingType AliasName;
                match = line.match(/^\s*typedef\s+[A-Za-z_][A-Za-z0-9_<>,\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
            }
        }
        if (match) {
            const structName = match[1];
            debugLog(`[extractStructDeclarations] Found struct/class declaration: ${structName} at line ${i + 1}, line="${line.trim()}"`);
            let startLine = i;
            let braceDepth = 0;
            let typedefAliasAfterBrace = null;
            
            // Check if this is a typedef with alias after closing brace: typedef struct { ... } AliasName;
            if (line.includes('typedef')) {
                const aliasMatch = line.match(/}\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
                if (aliasMatch) {
                    typedefAliasAfterBrace = aliasMatch[1];
                }
            }
            
            let isSingleLineStruct = false;
            if (line.includes('{')) {
                braceDepth = 1;
                debugLog(`[extractStructDeclarations] Struct ${structName} has { on same line`);
                // Check if this is a single-line struct: struct Name { ... };
                if (line.includes('}') && line.includes(';')) {
                    isSingleLineStruct = true;
                    braceDepth = 0; // Will be set back to 1 for processing
                    debugLog(`[extractStructDeclarations] Struct ${structName} is single-line`);
                }
            } else if (i + 1 < lines.length && lines[i + 1].trim().startsWith('{')) {
                debugLog(`[extractStructDeclarations] Struct ${structName} has { on next line (${i + 2})`);
                startLine = i + 1;
                braceDepth = 1;
            } else if (typedefAliasAfterBrace) {
                // For typedef with alias after brace, we need to find the closing brace
                // This will be handled in the brace matching loop below
                continue;
            } else {
                // For simple typedef without braces, add it directly
                if (line.includes('typedef') && !line.includes('struct') && !line.includes('class')) {
                    if (!results.has(structName)) {
                        results.set(structName, {
                            name: structName,
                            uri: vscode.Uri.file(filePath),
                            line: i
                        });
                        debugLog(`Found typedef: ${structName} at ${path.basename(filePath)}:${i + 1}`);
                    }
                }
                continue;
            }
            
            if (!results.has(structName)) {
                results.set(structName, {
                    name: structName,
                    uri: vscode.Uri.file(filePath),
                    line: i
                });
                structMembersMap.set(structName, new Set());
                debugLog(`[extractStructDeclarations] Found struct/class: ${structName} at ${path.basename(filePath)}:${i + 1}, line="${line.trim()}"`);
            } else {
                debugLog(`[extractStructDeclarations] Struct ${structName} already in results, skipping duplicate at line ${i + 1}`);
            }
            
            const currentMembers = structMembersMap.get(structName);
            
            // Handle single-line struct: extract members from the same line
            if (isSingleLineStruct) {
                braceDepth = 1; // Set to 1 to process the line
                const trimmed = line.trim();
                // Extract content between { and }
                const braceStart = trimmed.indexOf('{');
                const braceEnd = trimmed.indexOf('}');
                if (braceStart >= 0 && braceEnd > braceStart) {
                    const structContent = trimmed.substring(braceStart + 1, braceEnd).trim();
                    debugLog(`[extractStructDeclarations] Single-line struct content for ${structName}: '${structContent}'`);
                    // Split by semicolon to get individual member declarations
                    const memberDecls = structContent.split(';').filter(s => s.trim().length > 0);
                    for (const memberDecl of memberDecls) {
                        const memberTrimmed = memberDecl.trim();
                        debugLog(`[extractStructDeclarations] Processing member declaration: '${memberTrimmed}'`);
                        // Match member: precise type name : semantic or type name;
                        // Support precise, noperspective modifiers
                        let memberMatch = memberTrimmed.match(/^\s*(?:precise\s+|noperspective\s+)*(?:precise\s+|noperspective\s+)?(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_<>,\s]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]?/);
                        if (!memberMatch) {
                            // Try a more permissive pattern
                            memberMatch = memberTrimmed.match(/^\s*(?:precise\s+|noperspective\s+)*(?:precise\s+|noperspective\s+)?([A-Za-z_][A-Za-z0-9_<>,\s]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]?/);
                        }
                        if (memberMatch && !memberTrimmed.includes('(') && !memberTrimmed.includes(')') && !memberTrimmed.includes('enum') && !memberTrimmed.includes('struct') && !memberTrimmed.includes('class')) {
                            const memberName = memberMatch[memberMatch.length - 1];
                            currentMembers.add(memberName);
                            debugLog(`Found single-line struct member: ${structName}::${memberName} at ${path.basename(filePath)}:${i + 1}`);
                        } else {
                            debugLog(`[extractStructDeclarations] No match for member: '${memberTrimmed}'`);
                        }
                    }
                }
                braceDepth = 0; // Done processing
            }
            
            let inString = false;
            let inComment = false;
            let commentType = null;
            
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '"' && (j === 0 || line[j-1] !== '\\')) {
                    inString = !inString;
                }
                if (!inString) {
                    if (line[j] === '/' && j + 1 < line.length && line[j+1] === '/') {
                        break;
                    }
                    if (line[j] === '/' && j + 1 < line.length && line[j+1] === '*') {
                        inComment = true;
                        commentType = 'block';
                        j++;
                        continue;
                    }
                    if (inComment && commentType === 'block' && line[j] === '*' && j + 1 < line.length && line[j+1] === '/') {
                        inComment = false;
                        commentType = null;
                        j++;
                        continue;
                    }
                    if (!inComment) {
                        if (line[j] === '{') braceDepth++;
                        else if (line[j] === '}') braceDepth--;
                    }
                }
            }
            
            // Skip multi-line processing if this is a single-line struct (already processed above)
            if (!isSingleLineStruct) {
                for (let j = startLine + 1; j < lines.length && braceDepth > 0; j++) {
                    const structLine = lines[j];
                let lineBraceDepth = 0;
                inString = false;
                inComment = false;
                commentType = null;
                
                // Check if this line contains typedef alias after closing brace
                if (braceDepth === 1 && structLine.includes('}')) {
                    const aliasMatch = structLine.match(/}\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
                    if (aliasMatch) {
                        const aliasName = aliasMatch[1];
                        if (!results.has(aliasName)) {
                            results.set(aliasName, {
                                name: aliasName,
                                uri: vscode.Uri.file(filePath),
                                line: i
                            });
                            debugLog(`Found typedef alias: ${aliasName} at ${path.basename(filePath)}:${i + 1}`);
                        }
                    }
                }
                
                for (let k = 0; k < structLine.length; k++) {
                    if (structLine[k] === '"' && (k === 0 || structLine[k-1] !== '\\')) {
                        inString = !inString;
                    }
                    if (!inString) {
                        if (structLine[k] === '/' && k + 1 < structLine.length && structLine[k+1] === '/') {
                            break;
                        }
                        if (structLine[k] === '/' && k + 1 < structLine.length && structLine[k+1] === '*') {
                            inComment = true;
                            commentType = 'block';
                            k++;
                            continue;
                        }
                        if (inComment && commentType === 'block' && structLine[k] === '*' && k + 1 < structLine.length && structLine[k+1] === '/') {
                            inComment = false;
                            commentType = null;
                            k++;
                            continue;
                        }
                        if (!inComment) {
                            if (structLine[k] === '{') lineBraceDepth++;
                            else if (structLine[k] === '}') lineBraceDepth--;
                        }
                    }
                }
                
                braceDepth += lineBraceDepth;
                
                // Extract struct members (variables declared inside the struct)
                if (braceDepth > 0) {
                    const trimmed = structLine.trim();
                    // Skip comments and empty lines
                    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.length === 0) {
                        // Continue to next iteration
                    } else {
                        // Match member declarations: type name; or type name : semantic;
                        // Support various types: float, float2, float3, float4, float4x4, int, uint, uint3, bool, Texture2D, Sampler, etc.
                        // Pattern: (type) (name) [;:]
                        // Types can be: float[1-4][x1-4]?, real[1-4][x1-4]?, int[1-4]?, uint[1-4]?, bool, half, double, matrix[1-4]x[1-4]?, Texture*, Sampler*, or PascalCase type
                        // Also support modifiers like "noperspective" before the type
                        let memberMatch = trimmed.match(/^\s*(?:noperspective\s+)?(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_<>,\s]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]/);
                        if (!memberMatch) {
                            // Try a more permissive pattern for edge cases (e.g., uint3, float4x4, noperspective)
                            memberMatch = trimmed.match(/^\s*(?:noperspective\s+)?([A-Za-z_][A-Za-z0-9_<>,\s]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;:]/);
                        }
                        if (memberMatch && !trimmed.includes('{') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
                            const memberName = memberMatch[memberMatch.length - 1]; // Last capture group is the member name
                            // Skip if it looks like a function call, enum, struct, or other non-member declaration
                            if (!trimmed.includes('(') && !trimmed.includes(')') && !trimmed.includes('enum') && !trimmed.includes('struct') && !trimmed.includes('class')) {
                                currentMembers.add(memberName);
                                debugLog(`Found struct member: ${structName}::${memberName} at ${path.basename(filePath)}:${j + 1}`);
                            }
                        }
                    }
                }
                
                // Check if braceDepth becomes 0 and there's a typedef alias after the closing brace
                if (braceDepth === 0 && line.includes('typedef')) {
                    const aliasMatch = structLine.match(/}\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
                    if (aliasMatch) {
                        const aliasName = aliasMatch[1];
                        if (!results.has(aliasName)) {
                            results.set(aliasName, {
                                name: aliasName,
                                uri: vscode.Uri.file(filePath),
                                line: i
                            });
                            // Copy members from struct to typedef alias
                            structMembersMap.set(aliasName, new Set(currentMembers));
                            debugLog(`Found typedef alias (after brace): ${aliasName} at ${path.basename(filePath)}:${i + 1}`);
                        }
                    }
                }
                }
            } // End of !isSingleLineStruct check
        }
    }
    
    debugLog(`[extractStructDeclarations] Finished parsing ${path.basename(filePath)}: found ${results.size} structs: ${Array.from(results.keys()).join(', ')}`);
    return { structs: results, members: structMembersMap };
}

function extractFunctionDeclarations(text, filePath) {
    const results = new Map();
    const lines = text.split(/\r?\n/);
    let braceDepth = 0;
    let inStructOrClass = false;
    let structClassDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
            continue;
        }
        
        // Track brace depth
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceDepth += openBraces - closeBraces;
        
        // Track struct/class scope
        const structClassMatch = line.match(/\b(?:struct|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\{]?/);
        if (structClassMatch) {
            inStructOrClass = true;
            structClassDepth = braceDepth;
        }
        if (inStructOrClass && braceDepth < structClassDepth) {
            inStructOrClass = false;
        }
        
        // Skip if inside struct/class (those are methods, not functions)
        if (inStructOrClass) {
            continue;
        }
        
        // Match function declarations: ReturnType FunctionName(parameters)
        // Pattern: (return type) (function name) (
        const funcMatch = line.match(/^\s*(?:static\s+)?(?:inline\s+)?(?:void|real(?:[1-4](?:x[1-4])?)?|float(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_<>,\s]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (funcMatch) {
            const funcName = funcMatch[1];
            // Skip keywords that might match
            if (funcName === 'ShaderResourceGroup' || funcName === 'partial' || funcName === 'static' || funcName === 'const' || funcName === 'if' || funcName === 'for' || funcName === 'while') {
                continue;
            }
            
            // Find column position
            const funcStart = line.indexOf(funcName);
            if (funcStart >= 0) {
                if (!results.has(funcName)) {
                    results.set(funcName, {
                        uri: vscode.Uri.file(filePath),
                        line: i,
                        column: funcStart
                    });
                    debugLog(`Indexed function: ${funcName} -> ${path.basename(filePath)}:${i + 1}`);
                }
            }
        }
    }
    
    return results;
}

function extractOptionDeclarations(text, filePath) {
    const results = new Map();
    const lines = text.split(/\r?\n/);
    let inMultiLineComment = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Handle multi-line comments
        if (inMultiLineComment) {
            const commentEnd = line.indexOf('*/');
            if (commentEnd !== -1) {
                inMultiLineComment = false;
                line = line.substring(commentEnd + 2);
            } else {
                continue; // Still inside multi-line comment
            }
        }
        
        // Check for start of multi-line comment
        const multiLineStart = line.indexOf('/*');
        if (multiLineStart !== -1) {
            const commentEnd = line.indexOf('*/', multiLineStart + 2);
            if (commentEnd !== -1) {
                line = line.substring(0, multiLineStart) + line.substring(commentEnd + 2);
            } else {
                inMultiLineComment = true;
                line = line.substring(0, multiLineStart);
            }
        }
        
        // Remove single-line comments
        const singleLineComment = line.indexOf('//');
        if (singleLineComment !== -1) {
            line = line.substring(0, singleLineComment);
        }
        
        const processedLine = line.trim();
        
        // Skip empty lines
        if (!processedLine) {
            continue;
        }
        
        // Match: option [static] bool/int/uint name = value;
        const optionMatch = processedLine.match(/^\s*option\s+(?:static\s+)?(bool|int|uint)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=;]/);
        if (optionMatch) {
            const isStatic = processedLine.includes('static');
            const optionName = optionMatch[2];
            if (!results.has(optionName)) {
                results.set(optionName, {
                    name: optionName,
                    isStatic: isStatic,
                    uri: vscode.Uri.file(filePath),
                    line: i
                });
            }
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
                    // Exclude properties that are only in specific Surface variants, not in all Surface types
                    if (atomType === 'Surface' && (propertyName === 'alpha' || propertyName === 'transmission')) {
                        continue;
                    }
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
    srgMembers.clear();
    srgMemberIndex.clear();
    srgIndex.clear();
    structIndex.clear();
    structMembers.clear();
    optionIndex.clear();
    
    // Built-in SRG semantics (defined by O3DE compiler)
    const builtinSrgSemantics = [
        'SRG_PerDraw',
        'SRG_PerMaterial',
        'SRG_PerPass',
        'SRG_PerPass_WithFallback',
        'SRG_PerScene',
        'SRG_PerView',
        'SRG_PerSubMesh',
        'SRG_RayTracingGlobal',
        'SRG_RayTracingLocal'
    ];
    for (const semantic of builtinSrgSemantics) {
        srgSemanticIndex.set(semantic, {
            uri: vscode.Uri.parse('azsl-builtin://srg-semantics'),
            line: 0
        });
    }
    
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
    let srgiCount = 0;
    for (const f of files) {
        try {
            if (f.toLowerCase().endsWith('.srgi')) {
                srgiCount++;
                debugLog(`Processing .srgi file: ${path.relative(rootPath, f)}`);
            }
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
                debugLog(`Indexed SRG semantic: ${srg.name} -> ${path.basename(f)}:${srg.line + 1}`);
            }
            const srgDecls = extractSrgDeclarations(buf, f);
            for (const [srgName, srgInfo] of srgDecls.srgInfo.entries()) {
                if (!srgIndex.has(srgName)) {
                    srgIndex.set(srgName, {
                        uri: srgInfo.uri,
                        line: srgInfo.line
                    });
                    debugLog(`Indexed SRG: ${srgName} -> ${path.basename(f)}:${srgInfo.line + 1}`);
                }
                if (!srgMembers.has(srgName)) {
                    srgMembers.set(srgName, new Set());
                }
                const existingMembers = srgMembers.get(srgName);
                for (const member of srgInfo.members) {
                    existingMembers.add(member);
                }
            }
            for (const [memberKey, memberInfo] of srgDecls.memberLocations.entries()) {
                if (!srgMemberIndex.has(memberKey)) {
                    srgMemberIndex.set(memberKey, memberInfo);
                    debugLog(`Indexed SRG member: ${memberKey} -> ${path.basename(f)}:${memberInfo.line + 1}`);
                }
            }
            const structDecls = extractStructDeclarations(buf, f);
            for (const [structName, structInfo] of structDecls.structs.entries()) {
                if (!structIndex.has(structName)) {
                    structIndex.set(structName, {
                        uri: structInfo.uri,
                        line: structInfo.line
                    });
                    debugLog(`Indexed struct: ${structName} -> ${path.basename(f)}:${structInfo.line + 1}`);
                }
                // Store struct members
                if (!structMembers.has(structName)) {
                    structMembers.set(structName, new Set());
                }
                const existingMembers = structMembers.get(structName);
                const members = structDecls.members.get(structName);
                if (members) {
                    for (const member of members) {
                        existingMembers.add(member);
                    }
                    debugLog(`Indexed ${members.size} members for struct: ${structName}`);
                }
            }
            const funcDecls = extractFunctionDeclarations(buf, f);
            for (const [funcName, funcInfo] of funcDecls.entries()) {
                if (!functionIndex.has(funcName)) {
                    functionIndex.set(funcName, {
                        uri: funcInfo.uri,
                        line: funcInfo.line,
                        column: funcInfo.column
                    });
                    debugLog(`Indexed function: ${funcName} -> ${path.basename(f)}:${funcInfo.line + 1}`);
                }
            }
            const optionDecls = extractOptionDeclarations(buf, f);
            for (const [optionName, optionInfo] of optionDecls.entries()) {
                if (!optionIndex.has(optionName)) {
                    optionIndex.set(optionName, {
                        uri: optionInfo.uri,
                        line: optionInfo.line,
                        isStatic: optionInfo.isStatic
                    });
                    debugLog(`Indexed option: ${optionName} (static: ${optionInfo.isStatic}) -> ${path.basename(f)}:${optionInfo.line + 1}`);
                }
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
    debugLog(`Indexing complete: ${files.length} files (${srgiCount} .srgi files), ${atomMethodIndex.size / 2} methods, ${macroIndex.size} macros`);
    debugLog(`SRG indexing: ${srgIndex.size} SRGs, ${srgMemberIndex.size} members`);
    for (const [srgName, srgInfo] of srgIndex.entries()) {
        const members = srgMembers.get(srgName);
        debugLog(`  ${srgName}: ${members ? members.size : 0} members`);
    }
}

// Helper function to get function return type and first parameter type at a given position
function getFunctionReturnTypeAtPosition(document, lineNum) {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const functionScopes = [];
    let braceDepth = 0;
    let currentFunctionStart = -1;
    let currentFunctionReturnType = null;
    let currentFunctionFirstParamType = null;
    
    // Parse function signatures and track scopes
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prevBraceDepth = braceDepth;
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;
        const currentBraceDepth = braceDepth;
        
        // Check for function signature
        const funcMatch = line.match(/^\s*((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (funcMatch) {
            currentFunctionStart = i;
            currentFunctionReturnType = funcMatch[1].trim();
            
            // Extract first parameter type
            const funcParams = line.match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/);
            if (funcParams) {
                const paramMatch = funcParams[0].match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/);
                if (paramMatch) {
                    currentFunctionFirstParamType = paramMatch[1];
                }
            }
        }
        
        if (currentFunctionStart >= 0 && prevBraceDepth === 0 && currentBraceDepth > 0) {
            // Function body started
            const existingScope = functionScopes.find(s => s.startLine === currentFunctionStart);
            if (!existingScope) {
                functionScopes.push({
                    startLine: currentFunctionStart,
                    returnType: currentFunctionReturnType,
                    firstParamType: currentFunctionFirstParamType,
                    endLine: null
                });
            }
        }
        
        if (currentFunctionStart >= 0 && prevBraceDepth === 1 && currentBraceDepth === 0) {
            // Function ended
            const scope = functionScopes.find(s => s.startLine === currentFunctionStart);
            if (scope) {
                scope.endLine = i;
            }
            currentFunctionStart = -1;
            currentFunctionReturnType = null;
            currentFunctionFirstParamType = null;
        }
    }
    
    // Find the innermost function scope containing the given line
    for (let j = functionScopes.length - 1; j >= 0; j--) {
        const scope = functionScopes[j];
        if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
            return scope.returnType;
        }
    }
    
    return null;
}

function getFunctionParameterTypeAtPosition(document, lineNum) {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const functionScopes = [];
    let braceDepth = 0;
    let currentFunctionStart = -1;
    let currentFunctionReturnType = null;
    let currentFunctionFirstParamType = null;
    
    // Parse function signatures and track scopes
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prevBraceDepth = braceDepth;
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;
        const currentBraceDepth = braceDepth;
        
        // Check for function signature
        const funcMatch = line.match(/^\s*((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (funcMatch) {
            currentFunctionStart = i;
            currentFunctionReturnType = funcMatch[1].trim();
            
            // Extract first parameter type
            const funcParams = line.match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/);
            if (funcParams) {
                const paramMatch = funcParams[0].match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/);
                if (paramMatch) {
                    currentFunctionFirstParamType = paramMatch[1];
                }
            }
        }
        
        if (currentFunctionStart >= 0 && prevBraceDepth === 0 && currentBraceDepth > 0) {
            // Function body started
            const existingScope = functionScopes.find(s => s.startLine === currentFunctionStart);
            if (!existingScope) {
                functionScopes.push({
                    startLine: currentFunctionStart,
                    returnType: currentFunctionReturnType,
                    firstParamType: currentFunctionFirstParamType,
                    endLine: null
                });
            }
        }
        
        if (currentFunctionStart >= 0 && prevBraceDepth === 1 && currentBraceDepth === 0) {
            // Function ended
            const scope = functionScopes.find(s => s.startLine === currentFunctionStart);
            if (scope) {
                scope.endLine = i;
            }
            currentFunctionStart = -1;
            currentFunctionReturnType = null;
            currentFunctionFirstParamType = null;
        }
    }
    
    // Find the innermost function scope containing the given line
    for (let j = functionScopes.length - 1; j >= 0; j--) {
        const scope = functionScopes[j];
        if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
            return scope.firstParamType;
        }
    }
    
    return null;
}

function getVariableTypeAtPosition(document, varName, lineNum) {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const atomTypes = new Set(['Surface', 'LightingData', 'DirectionalLight', 'SimplePointLight', 'PointLight', 'SimpleSpotLight', 'DiskLight', 'ForwardPassOutput', 'VertexShaderOutput', 'VertexShaderInput']);
    const textureTypes = new Set(['Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 'RWTexture2D', 'RWTexture3D', 'Texture1D', 'Texture2DMS', 'RWTexture1D']);
    
    // Track variable declarations with their scope (braceDepth and line number)
    const variableDeclarations = new Map(); // varName -> Array<{type, line, braceDepth}>
    const variableTypes = new Map();
    let braceDepth = 0;
    
    // Parse all variable declarations with their scope
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceDepth += openBraces - closeBraces;
        
        // Match variable declarations: TypeName varName;
        const varDeclMatch = line.match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|RWTexture\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
        if (varDeclMatch) {
            const fullType = varDeclMatch[1];
            const vName = varDeclMatch[2];
            
            // Store declaration with scope information
            if (!variableDeclarations.has(vName)) {
                variableDeclarations.set(vName, []);
            }
            variableDeclarations.get(vName).push({type: fullType, line: i, braceDepth: braceDepth});
            
            // Also store in variableTypes for fallback - check all possible type sources
            if (atomTypes.has(fullType) || textureTypes.has(fullType) || structIndex.has(fullType) || structMembers.has(fullType)) {
                variableTypes.set(vName, fullType);
            }
        }
    }
    
    // Find the most recent declaration that is in scope at lineNum
    if (variableDeclarations.has(varName)) {
        const declarations = variableDeclarations.get(varName);
        // Calculate brace depth at lineNum
        let targetBraceDepth = 0;
        for (let i = 0; i <= lineNum && i < lines.length; i++) {
            const openBraces = (lines[i].match(/{/g) || []).length;
            const closeBraces = (lines[i].match(/}/g) || []).length;
            targetBraceDepth += openBraces - closeBraces;
        }
        
        // Find the most recent declaration that is in scope
        let bestMatch = null;
        let bestBraceDepth = -1;
        for (const decl of declarations) {
            if (decl.line <= lineNum && decl.braceDepth <= targetBraceDepth) {
                if (decl.braceDepth > bestBraceDepth) {
                    bestBraceDepth = decl.braceDepth;
                    bestMatch = decl;
                } else if (decl.braceDepth === bestBraceDepth && decl.line > (bestMatch ? bestMatch.line : -1)) {
                    bestMatch = decl;
                }
            }
        }
        if (bestMatch) {
            return bestMatch.type;
        }
    }
    
    // Fallback to variableTypes
    if (variableTypes.has(varName)) {
        return variableTypes.get(varName);
    }
    
    return null;
}

// Helper function to check if a type is a vector type
function isVectorType(type) {
    if (!type) return false;
    return /^(float|int|uint|bool|real|half)[2-4]$/.test(type);
}

// Helper function to get swizzle properties for a vector type
function getSwizzleProperties(type) {
    const props = new Set();
    
    const dimMatch = type.match(/(\d)$/);
    if (!dimMatch) return [];
    const dim = parseInt(dimMatch[1]);
    
    const components = ['x', 'y', 'z', 'w'];
    const colorComponents = ['r', 'g', 'b', 'a'];
    
    for (let i = 0; i < dim; i++) {
        props.add(components[i]);
        props.add(colorComponents[i]);
    }
    
    for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
            if (i !== j) {
                props.add(components[i] + components[j]);
                props.add(colorComponents[i] + colorComponents[j]);
            }
        }
    }
    
    if (dim >= 3) {
        for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) {
                for (let k = 0; k < dim; k++) {
                    if (i !== j && j !== k && i !== k) {
                        props.add(components[i] + components[j] + components[k]);
                        props.add(colorComponents[i] + colorComponents[j] + colorComponents[k]);
                    }
                }
            }
        }
    }
    
    if (dim === 4) {
        for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) {
                for (let k = 0; k < dim; k++) {
                    for (let l = 0; l < dim; l++) {
                        if (i !== j && j !== k && k !== l && i !== k && i !== l && j !== l) {
                            props.add(components[i] + components[j] + components[k] + components[l]);
                            props.add(colorComponents[i] + colorComponents[j] + colorComponents[k] + colorComponents[l]);
                        }
                    }
                }
            }
        }
    }
    
    return Array.from(props).sort();
}

// Helper function to extract function call arguments, handling nested parentheses
function extractFunctionCallArgs(text, funcName) {
    const funcPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    let match;
    let lastMatch = null;
    
    while ((match = funcPattern.exec(text)) !== null) {
        lastMatch = match;
    }
    
    if (!lastMatch) return null;
    
    const startPos = lastMatch.index + lastMatch[0].length;
    let depth = 1;
    let pos = startPos;
    let argStart = startPos;
    const args = [];
    
    while (pos < text.length && depth > 0) {
        if (text[pos] === '(') depth++;
        else if (text[pos] === ')') depth--;
        else if (text[pos] === ',' && depth === 1) {
            args.push(text.substring(argStart, pos).trim());
            argStart = pos + 1;
        }
        pos++;
    }
    
    if (depth === 0) {
        args.push(text.substring(argStart, pos - 1).trim());
        return args;
    }
    
    return null;
}

// Helper function to determine expression type (e.g., mul() result)
function getExpressionType(document, expression, lineNum) {
    if (!expression) return null;
    
    const trimmedExpr = expression.trim();
    
    // Check for mul(matrix, vector) pattern
    const mulMatch = trimmedExpr.match(/\bmul\s*\(/);
    if (mulMatch) {
        debugLog(`[getExpressionType] Found mul() in expression: '${trimmedExpr}'`);
        const args = extractFunctionCallArgs(trimmedExpr, 'mul');
        debugLog(`[getExpressionType] Extracted args: ${args ? JSON.stringify(args) : 'null'}`);
        if (args && args.length >= 2) {
            const secondArg = args[1].trim();
            debugLog(`[getExpressionType] Second arg: '${secondArg}'`);
            // Check if second argument is a vector type constructor (e.g., float4(...))
            const vectorMatch = secondArg.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
            if (vectorMatch) {
                const resultType = vectorMatch[1] + vectorMatch[2];
                debugLog(`[getExpressionType] mul() with vector constructor: ${resultType}`);
                return resultType;
            }
            // Check if it's a variable of vector type
            const varMatch = secondArg.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
            if (varMatch) {
                const varType = getVariableTypeAtPosition(document, varMatch[1], lineNum);
                if (varType && isVectorType(varType)) {
                    debugLog(`[getExpressionType] mul() with vector variable: ${varType}`);
                    return varType;
                }
            }
            // Check for member access in second argument (e.g., IN.m_position)
            const memberMatch = secondArg.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/);
            if (memberMatch) {
                const varName = memberMatch[1];
                const memberName = memberMatch[2];
                const varType = getVariableTypeAtPosition(document, varName, lineNum);
                if (varType && structMembers.has(varType)) {
                    // For now, assume member access returns a vector type if it's a known member
                    // This is a simplified check - in real implementation, we'd parse struct definitions
                    debugLog(`[getExpressionType] mul() with member access: ${varName}.${memberName}, varType=${varType}`);
                }
            }
        }
    }
    
    // Check for vector type constructors directly (e.g., float4(...))
    const vectorConstructorMatch = trimmedExpr.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
    if (vectorConstructorMatch) {
        const resultType = vectorConstructorMatch[1] + vectorConstructorMatch[2];
        debugLog(`[getExpressionType] Vector constructor: ${resultType}`);
        return resultType;
    }
    
    return null;
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
    
    // First, check if this is a function call expression (e.g., mul(...).xyz)
    // This should be checked before looking for variable names
    const dotIndex = beforeCursor.lastIndexOf('.');
    if (dotIndex >= 0) {
        const expressionBeforeDot = beforeCursor.substring(0, dotIndex).trim();
        debugLog(`[provideCompletionItems] Checking expression before dot: '${expressionBeforeDot}'`);
        // Check if expression ends with ) indicating a function call
        if (expressionBeforeDot.endsWith(')')) {
            const exprType = getExpressionType(document, expressionBeforeDot, position.line);
            debugLog(`[provideCompletionItems] Expression type result: ${exprType}`);
            if (exprType && isVectorType(exprType)) {
                debugLog(`[provideCompletionItems] Found expression type: ${exprType} for '${expressionBeforeDot}'`);
                // Provide swizzle completion for vector types
                const swizzleProps = getSwizzleProperties(exprType);
                debugLog(`[provideCompletionItems] Swizzle properties for ${exprType}: ${swizzleProps.length} items`);
                for (const prop of swizzleProps) {
                    if (!current || prop.toLowerCase().startsWith(current.toLowerCase())) {
                        const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
                        item.sortText = '00_' + prop;
                        items.push(item);
                    }
                }
                if (items.length > 0) {
                    debugLog(`[provideCompletionItems] Returning ${items.length} swizzle completion items`);
                    return items;
                }
            }
        }
    }
    
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
        
        let varType = null;
        
        // Special handling for OUT variable: use function return type from current context
        if (varName === 'OUT' || varName === 'out') {
            const funcReturnType = getFunctionReturnTypeAtPosition(document, position.line);
            if (funcReturnType) {
                varType = funcReturnType;
            }
        }
        
        // Special handling for IN variable: use function first parameter type from current context
        if (!varType && (varName === 'IN' || varName === 'in')) {
            const funcParamType = getFunctionParameterTypeAtPosition(document, position.line);
            if (funcParamType) {
                varType = funcParamType;
            }
        }
        
        // Get variable type considering scope
        if (!varType) {
            varType = getVariableTypeAtPosition(document, varName, position.line);
        }
        
        // Fallback to atomTypes
        const atomTypes = new Set(['Surface', 'LightingData', 'DirectionalLight', 'SimplePointLight', 'PointLight', 'SimpleSpotLight', 'DiskLight']);
        if (!varType && atomTypes.has(varName)) {
            varType = varName;
        }
        
        debugLog(`[provideCompletionItems] Variable '${varName}' has type: ${varType}`);
        if (varType) {
            debugLog(`[provideCompletionItems] structMembers.has('${varType}'): ${structMembers.has(varType)}`);
            if (structMembers.has(varType)) {
                const members = structMembers.get(varType);
                debugLog(`[provideCompletionItems] Found ${members.size} members for type '${varType}': ${Array.from(members).join(', ')}`);
            }
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
        } else if (varType && atomTypeMembers.has(varType)) {
            // Provide completion for atom type members (e.g., ForwardPassOutput)
            const members = atomTypeMembers.get(varType);
            for (const member of members) {
                if (!current || member.toLowerCase().startsWith(current.toLowerCase())) {
                    const item = new vscode.CompletionItem(member, vscode.CompletionItemKind.Property);
                    item.sortText = '00_' + member;
                    items.push(item);
                }
            }
            return items;
        } else if (varType && structMembers.has(varType)) {
            // Provide completion for struct members (works for both indexed and local structs)
            const members = structMembers.get(varType);
            for (const member of members) {
                if (!current || member.toLowerCase().startsWith(current.toLowerCase())) {
                    const item = new vscode.CompletionItem(member, vscode.CompletionItemKind.Property);
                    item.sortText = '00_' + member;
                    items.push(item);
                }
            }
            return items;
        } else if (varType && isVectorType(varType)) {
            // Provide swizzle completion for vector types (float2, float3, float4, etc.)
            const swizzleProps = getSwizzleProperties(varType);
            for (const prop of swizzleProps) {
                if (!current || prop.toLowerCase().startsWith(current.toLowerCase())) {
                    const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
                    item.sortText = '00_' + prop;
                    items.push(item);
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
    if (!root) {
        debugLog(`resolveIncludeTarget: no root path configured`);
        return undefined;
    }
    let normalized = includeText.replace(/\\/g, '/');
    debugLog(`resolveIncludeTarget: trying to resolve "${normalized}" (root: ${root})`);
    
    if (normalized.startsWith('Atom/')) {
        const withoutAtom = normalized.substring(5);
        const candidate = path.join(root, withoutAtom);
        debugLog(`resolveIncludeTarget: checking Atom/ path (without prefix): ${candidate}`);
        if (fs.existsSync(candidate)) {
            debugLog(`resolveIncludeTarget: found via Atom/ prefix: ${candidate}`);
            return vscode.Uri.file(candidate);
        }
        debugLog(`resolveIncludeTarget: file does not exist: ${candidate}`);
        
        if (headersPathIndex.has(withoutAtom)) {
            const found = headersPathIndex.get(withoutAtom);
            debugLog(`resolveIncludeTarget: found in headersPathIndex (without Atom/): ${found}`);
            return vscode.Uri.file(found);
        }
        
        for (const [rel, abs] of headersPathIndex.entries()) {
            if (rel.endsWith('/' + withoutAtom) || rel === withoutAtom) {
                debugLog(`resolveIncludeTarget: found via suffix match (without Atom/): ${abs} (rel: ${rel})`);
                return vscode.Uri.file(abs);
            }
        }
    }
    
    if (headersPathIndex.has(normalized)) {
        const found = headersPathIndex.get(normalized);
        debugLog(`resolveIncludeTarget: found in headersPathIndex: ${found}`);
        return vscode.Uri.file(found);
    }
    
    for (const [rel, abs] of headersPathIndex.entries()) {
        if (rel.endsWith('/' + normalized) || rel === normalized) {
            debugLog(`resolveIncludeTarget: found via suffix match: ${abs} (rel: ${rel})`);
            return vscode.Uri.file(abs);
        }
    }
    
    const base = path.basename(normalized);
    const byBase = headersBasenameIndex.get(base);
    if (byBase && byBase.length === 1) {
        debugLog(`resolveIncludeTarget: found via basename: ${byBase[0]}`);
        return vscode.Uri.file(byBase[0]);
    }
    
    if (byBase && byBase.length > 1) {
        for (const candidate of byBase) {
            const candidateRel = path.relative(root, candidate).replace(/\\/g, '/');
            if (candidateRel.endsWith(normalized) || candidateRel === normalized) {
                debugLog(`resolveIncludeTarget: found via basename with path match: ${candidate}`);
                return vscode.Uri.file(candidate);
            }
            if (normalized.startsWith('Atom/')) {
                const withoutAtom = normalized.substring(5);
                if (candidateRel.endsWith(withoutAtom) || candidateRel === withoutAtom) {
                    debugLog(`resolveIncludeTarget: found via basename with path match (without Atom/): ${candidate}`);
                    return vscode.Uri.file(candidate);
                }
            }
        }
    }
    
    debugLog(`resolveIncludeTarget: could not resolve "${normalized}"`);
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
            const includeRegex = /#\s*include\s*[<"]([^>"]+)[>"]/;
            const matchLine = line.match(includeRegex);
            if (!matchLine) {
                return;
            }
            
            const includePath = matchLine[1];
            const matchIndex = matchLine.index || 0;
            const fullMatch = matchLine[0];
            
            const openChar = fullMatch.includes('<') ? '<' : '"';
            const closeChar = fullMatch.includes('>') ? '>' : '"';
            const quoteStart = fullMatch.indexOf(openChar);
            const quoteEnd = fullMatch.lastIndexOf(closeChar);
            
            const pathStart = matchIndex + quoteStart + 1;
            const pathEnd = matchIndex + quoteEnd;
            
            debugLog(`defProvider: line="${line.trim()}", matchIndex=${matchIndex}, pathStart=${pathStart}, pathEnd=${pathEnd}, cursor=${position.character}, includePath="${includePath}"`);
            
            if (position.character < pathStart || position.character > pathEnd) {
                return;
            }
            
            const target = resolveIncludeTarget(includePath);
            if (!target) {
                debugLog(`defProvider: Could not resolve include: ${includePath}`);
                return;
            }
            debugLog(`defProvider: Resolved include: ${includePath} -> ${target.fsPath}`);
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

function provideCodeActions(document, range, context, token) {
    const actions = [];
    
    debugLog(`[provideCodeActions] Called with ${context.diagnostics.length} diagnostics, range: ${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`);
    
    for (const diagnostic of context.diagnostics) {
        debugLog(`[provideCodeActions] Checking diagnostic: "${diagnostic.message}" at ${diagnostic.range.start.line}:${diagnostic.range.start.character}`);
        
        // Check if range intersects with diagnostic range
        const rangeIntersects = range.intersection(diagnostic.range) !== undefined;
        debugLog(`[provideCodeActions] Range intersects: ${rangeIntersects}`);
        
        // Quick Fix for ShaderVariantFallback error
        // Check for exact error message: "If you have non-static options, one SRG must be designated as the default ShaderVariantFallback"
        const isShaderVariantFallbackError = diagnostic.message.includes('ShaderVariantFallback') || 
            (diagnostic.message.includes('non-static options') && diagnostic.message.includes('SRG must be designated'));
        
        debugLog(`[provideCodeActions] Diagnostic message: "${diagnostic.message}"`);
        debugLog(`[provideCodeActions] isShaderVariantFallbackError=${isShaderVariantFallbackError}`);
        
        if (isShaderVariantFallbackError) {
            debugLog(`[provideCodeActions] Matched ShaderVariantFallback error`);
            
            // For global errors on line 0, we should still provide Quick Fix
            // VS Code may call provideCodeActions even when cursor is not exactly on line 0
            if (!rangeIntersects && diagnostic.range.start.line !== 0) {
                debugLog(`[provideCodeActions] Skipping: range doesn't intersect and not line 0`);
                continue;
            }
            
            const text = document.getText();
            
            // Check if SRG already exists (not commented out)
            // First, remove comments to check for actual SRG declarations
            const lines = text.split(/\r?\n/);
            let hasVariantFallback = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                // Skip commented lines
                if (line.startsWith('//') || line.startsWith('/*')) {
                    continue;
                }
                // Check for SRG with SRG_PerDraw semantic
                if (line.match(/ShaderResourceGroup\s+\w+\s*:\s*SRG_PerDraw/)) {
                    hasVariantFallback = true;
                    debugLog(`[provideCodeActions] Found existing SRG with SRG_PerDraw at line ${i + 1}`);
                    break;
                }
            }
            
            if (hasVariantFallback) {
                debugLog(`[provideCodeActions] Skipping: SRG with SRG_PerDraw already exists`);
                continue; // Already has a fallback SRG
            }
            
            debugLog(`[provideCodeActions] No existing SRG with SRG_PerDraw found, creating Quick Fix`);
            
            const action = new vscode.CodeAction(
                'Add ShaderVariantFallback SRG',
                vscode.CodeActionKind.QuickFix
            );
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            action.edit = new vscode.WorkspaceEdit();
            
            // Find a good place to insert the SRG (after includes, before other SRGs)
            const linesForInsert = text.split(/\r?\n/);
            let insertLine = 0;
            
            // Find last include line
            for (let i = 0; i < linesForInsert.length; i++) {
                const line = linesForInsert[i].trim();
                // Skip commented lines when looking for insertion point
                if (line.startsWith('//') || line.startsWith('/*')) {
                    continue;
                }
                if (line.startsWith('#include')) {
                    insertLine = i + 1;
                } else if (line.startsWith('ShaderResourceGroup') || 
                          line.startsWith('struct') ||
                          line.startsWith('option')) {
                    break;
                }
            }
            
            debugLog(`[provideCodeActions] Inserting SRG at line ${insertLine}`);
            const srgCode = `\nShaderResourceGroup VariantFallbackSrg : SRG_PerDraw\n{\n}\n`;
            const position = new vscode.Position(insertLine, 0);
            action.edit.insert(document.uri, position, srgCode);
            actions.push(action);
            debugLog(`[provideCodeActions] Created Quick Fix action: Add ShaderVariantFallback SRG at line ${insertLine}, actions.length=${actions.length}`);
        }
        
        // Quick Fix for undefined semantic error
        if (diagnostic.message.includes('Declaration for semantic') && diagnostic.message.includes('was not found')) {
            const semanticMatch = diagnostic.message.match(/semantic\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (semanticMatch) {
                const wrongSemantic = semanticMatch[1];
                const line = document.lineAt(diagnostic.range.start.line);
                const lineText = line.text;
                
                // Try to find similar semantic (common typos)
                const commonSemantics = ['SRG_PerDraw', 'SRG_PerMaterial', 'SRG_PerPass', 'SRG_PerPass_WithFallback', 'SRG_PerScene', 'SRG_PerView'];
                for (const correctSemantic of commonSemantics) {
                    // Check if it's a typo (missing characters at the end)
                    if (correctSemantic.startsWith(wrongSemantic) && wrongSemantic.length < correctSemantic.length) {
                        const action = new vscode.CodeAction(
                            `Change to ${correctSemantic}`,
                            vscode.CodeActionKind.QuickFix
                        );
                        action.diagnostics = [diagnostic];
                        action.isPreferred = true;
                        action.edit = new vscode.WorkspaceEdit();
                        
                        // Find the semantic in the line and replace it
                        const semanticRegex = new RegExp(`:\\s*${wrongSemantic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
                        const match = lineText.match(semanticRegex);
                        if (match) {
                            const startPos = lineText.indexOf(match[0]) + match[0].indexOf(wrongSemantic);
                            const endPos = startPos + wrongSemantic.length;
                            const range = new vscode.Range(diagnostic.range.start.line, startPos, diagnostic.range.start.line, endPos);
                            action.edit.replace(document.uri, range, correctSemantic);
                            actions.push(action);
                        }
                        break;
                    }
                }
            }
        }
    }
    
    debugLog(`[provideCodeActions] Returning ${actions.length} actions`);
    return actions;
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
            const afterMember = lineText.substring(range.end.character);
            
            // Check if this is a function call (not a method call)
            // Function call should not have . or :: before it, and should have ( after it
            if (!beforeMember.match(/[A-Za-z_][A-Za-z0-9_]*\s*[\.:]\s*$/) && afterMember.trim().startsWith('(')) {
                const funcInfo = functionIndex.get(word);
                if (funcInfo) {
                    try {
                        const funcFileContent = fs.readFileSync(funcInfo.uri.fsPath, 'utf8');
                        const funcLines = funcFileContent.split(/\r?\n/);
                        if (funcInfo.line < funcLines.length) {
                            let funcLine = funcLines[funcInfo.line].trim();
                            // Get the full function signature (might span multiple lines)
                            let fullSignature = funcLine;
                            if (funcLine.includes('(') && !funcLine.includes(')')) {
                                // Function signature spans multiple lines
                                for (let i = funcInfo.line + 1; i < funcLines.length && i < funcInfo.line + 10; i++) {
                                    funcLine = funcLines[i].trim();
                                    fullSignature += ' ' + funcLine;
                                    if (funcLine.includes(')')) {
                                        break;
                                    }
                                }
                            }
                            if (fullSignature.endsWith('{')) {
                                fullSignature = fullSignature.substring(0, fullSignature.length - 1).trim();
                            }
                            
                            const md = new vscode.MarkdownString();
                            md.isTrusted = false;
                            md.appendCodeblock(fullSignature, 'hlsl');
                            md.appendMarkdown(`\n\nDefined in: \`${path.basename(funcInfo.uri.fsPath)}\``);
                            return new vscode.Hover(md, range);
                        }
                    } catch (e) {
                        debugLog(`Error reading function file: ${e.message}`);
                    }
                    
                    const md = new vscode.MarkdownString();
                    md.isTrusted = false;
                    md.appendCodeblock(`${word}(...)`, 'hlsl');
                    md.appendMarkdown(`\n**Function**\n\nDefined in: \`${path.basename(funcInfo.uri.fsPath)}\``);
                    return new vscode.Hover(md, range);
                }
            }
            
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
            
            const srgMemberMatch = lineText.substring(Math.max(0, range.start.character - 50), range.end.character).match(/([A-Za-z_][A-Za-z0-9_]*)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)/);
            if (srgMemberMatch && srgMemberMatch[2] === word) {
                const srgName = srgMemberMatch[1];
                if (srgMembers.has(srgName)) {
                    const members = srgMembers.get(srgName);
                    if (members.has(word)) {
                        const md = new vscode.MarkdownString();
                        md.isTrusted = false;
                        md.appendCodeblock(`${srgName}::${word}`, 'hlsl');
                        md.appendMarkdown(`\n**Member of** \`${srgName}\`\n\nShaderResourceGroup member from O3DE Atom engine.`);
                        return new vscode.Hover(md, range);
                    }
                }
            }
            
            // Check if this is a struct/type - first check current document, then structIndex
            let structInfo = null;
            
            // First, check if the struct is defined in the current document
            const text = document.getText();
            const currentDocStructs = extractStructDeclarations(text, document.uri.fsPath);
            if (currentDocStructs.structs.has(word)) {
                const localStructInfo = currentDocStructs.structs.get(word);
                structInfo = {
                    uri: document.uri,
                    line: localStructInfo.line
                };
            } else if (structIndex.has(word)) {
                // Fall back to structIndex if not found in current document
                structInfo = structIndex.get(word);
            }
            
            if (structInfo) {
                try {
                    const structFileContent = fs.readFileSync(structInfo.uri.fsPath, 'utf8');
                    const structLines = structFileContent.split(/\r?\n/);
                    if (structInfo.line < structLines.length) {
                        // Get the struct definition (might span multiple lines)
                        let structLine = structLines[structInfo.line].trim();
                        let fullDefinition = structLine;
                        
                        // If it's a struct/class declaration, try to get the full definition
                        if (structLine.match(/\b(?:struct|class|typedef)\s+/)) {
                            // Find the opening brace
                            let braceCount = 0;
                            let foundBrace = false;
                            for (let i = structInfo.line; i < structLines.length && i < structInfo.line + 50; i++) {
                                const line = structLines[i];
                                for (const char of line) {
                                    if (char === '{') {
                                        braceCount++;
                                        foundBrace = true;
                                    } else if (char === '}') {
                                        braceCount--;
                                        if (foundBrace && braceCount === 0) {
                                            // Found closing brace
                                            const definitionLines = structLines.slice(structInfo.line, i + 1);
                                            fullDefinition = definitionLines.join('\n').trim();
                                            break;
                                        }
                                    }
                                }
                                if (foundBrace && braceCount === 0) break;
                            }
                            
                            // If we didn't find a full definition, just use the declaration line
                            if (!foundBrace || braceCount !== 0) {
                                fullDefinition = structLine;
                            }
                        }
                        
                        const md = new vscode.MarkdownString();
                        md.isTrusted = false;
                        md.appendCodeblock(fullDefinition, 'hlsl');
                        md.appendMarkdown(`\n\n**Type**\n\nDefined in: \`${path.basename(structInfo.uri.fsPath)}\``);
                        return new vscode.Hover(md, range);
                    }
                } catch (e) {
                    debugLog(`Error reading struct file: ${e.message}`);
                }
                
                // Fallback if file reading fails
                const md = new vscode.MarkdownString();
                md.isTrusted = false;
                md.appendCodeblock(`struct ${word}`, 'hlsl');
                md.appendMarkdown(`\n\n**Type**\n\nDefined in: \`${path.basename(structInfo.uri.fsPath)}\``);
                return new vscode.Hover(md, range);
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
            const bufferTypes = new Set(['StructuredBuffer', 'Buffer', 'RWStructuredBuffer', 'RWBuffer']);
            const samplerProperties = new Set(['MaxAnisotropy', 'MinFilter', 'MagFilter', 'MipFilter', 
                'ReductionType', 'AddressU', 'AddressV', 'AddressW', 'MinLOD', 'MaxLOD']);
            const samplerValues = new Set(['Point', 'Linear', 'Wrap', 'Clamp', 'Mirror', 'Border', 'Filter']);
            
            if (textureTypes.has(word) || samplerTypes.has(word) || bufferTypes.has(word) || samplerProperties.has(word) || samplerValues.has(word)) {
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
    
    const srgMemberDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const word = document.getText(range);
            
            const line = document.lineAt(position.line).text;
            const beforeCursor = line.substring(0, position.character);
            const afterWord = line.substring(range.end.character);
            
            debugLog(`SRG definition lookup: word="${word}", before="${beforeCursor}", afterWord="${afterWord}"`);
            debugLog(`srgIndex has keys: ${Array.from(srgIndex.keys()).join(', ')}`);
            debugLog(`srgMemberIndex has keys: ${Array.from(srgMemberIndex.keys()).slice(0, 10).join(', ')}...`);
            
            const srgMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)\s*::\s*$/);
            
            if (srgMatch) {
                const srgName = srgMatch[1];
                debugLog(`SRG member access detected: ${srgName}::${word}`);
                const memberKey = `${srgName}::${word}`;
                const memberInfo = srgMemberIndex.get(memberKey);
                if (memberInfo) {
                    debugLog(`Found member in index: ${memberKey}`);
                    return new vscode.Location(memberInfo.uri, new vscode.Position(memberInfo.line, 0));
                }
                if (srgMembers.has(srgName)) {
                    const members = srgMembers.get(srgName);
                    if (members.has(word)) {
                        debugLog(`Found member in srgMembers: ${memberKey}`);
                        const virtualUri = vscode.Uri.parse(`azsl-builtin://srg/${srgName}/${word}.azsli`);
                        return new vscode.Location(virtualUri, new vscode.Position(0, 0));
                    }
                }
                debugLog(`Member not found: ${memberKey}`);
            }
            
            const srgNameMatch = afterWord.match(/^\s*::/);
            if (srgNameMatch && srgIndex.has(word)) {
                debugLog(`SRG name before :: detected: ${word}`);
                const srgInfo = srgIndex.get(word);
                return new vscode.Location(srgInfo.uri, new vscode.Position(srgInfo.line, 0));
            }
            
            if (srgIndex.has(word) && !beforeCursor.match(/[A-Za-z0-9_]$/) && !afterWord.match(/^\s*::/)) {
                debugLog(`Standalone SRG name detected: ${word}`);
                const srgInfo = srgIndex.get(word);
                return new vscode.Location(srgInfo.uri, new vscode.Position(srgInfo.line, 0));
            }
            
            debugLog(`No SRG definition found for: ${word}`);
            return null;
        }
    });
    context.subscriptions.push(srgMemberDef);
    disposables.push(srgMemberDef);
    
    const structDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const word = document.getText(range);
            
            if (word === 'StructuredBuffer' || word === 'Buffer' || word === 'RWStructuredBuffer' || word === 'RWBuffer') {
                return null;
            }
            
            const line = document.lineAt(position.line).text;
            const beforeWord = line.substring(0, range.start.character);
            const afterWord = line.substring(range.end.character);
            
            debugLog(`[structDef] ===== Struct definition lookup =====`);
            debugLog(`[structDef] word="${word}"`);
            debugLog(`[structDef] document: ${path.basename(document.uri.fsPath)}`);
            debugLog(`[structDef] position: line ${position.line + 1}, char ${position.character}`);
            debugLog(`[structDef] beforeWord="${beforeWord}", afterWord="${afterWord}"`);
            
            // First, check if the struct is defined in the current document
            const text = document.getText();
            debugLog(`[structDef] Extracting structs from current document: ${path.basename(document.uri.fsPath)}`);
            const currentDocStructs = extractStructDeclarations(text, document.uri.fsPath);
            debugLog(`[structDef] Current document structs found: ${Array.from(currentDocStructs.structs.keys()).join(', ')}`);
            debugLog(`[structDef] Checking if "${word}" is in current document structs: ${currentDocStructs.structs.has(word)}`);
            
            if (currentDocStructs.structs.has(word)) {
                const localStructInfo = currentDocStructs.structs.get(word);
                debugLog(`[structDef] ✓ Found struct in current document: ${word} -> ${path.basename(document.uri.fsPath)}:${localStructInfo.line + 1}`);
                debugLog(`[structDef] Returning location: ${document.uri.fsPath}:${localStructInfo.line + 1}`);
                return new vscode.Location(document.uri, new vscode.Position(localStructInfo.line, 0));
            }
            
            debugLog(`[structDef] ✗ Struct "${word}" NOT found in current document, will check structIndex`);
            
            debugLog(`[structDef] Struct "${word}" not found in current document, checking structIndex...`);
            debugLog(`[structDef] structIndex.has("${word}"): ${structIndex.has(word)}`);
            if (structIndex.has(word)) {
                const structInfo = structIndex.get(word);
                debugLog(`[structDef] structIndex entry for "${word}": ${path.basename(structInfo.uri.fsPath)}:${structInfo.line + 1}`);
            }
            
            const structuredBufferMatch = beforeWord.match(/StructuredBuffer\s*<\s*$/);
            const bufferMatch = beforeWord.match(/\bBuffer\s*<\s*$/);
            
            if (structuredBufferMatch || bufferMatch) {
                debugLog(`[structDef] Template type detected: ${word} in ${structuredBufferMatch ? 'StructuredBuffer' : 'Buffer'}`);
                const structInfo = structIndex.get(word);
                if (structInfo) {
                    debugLog(`[structDef] Found struct in index: ${word} -> ${structInfo.uri.fsPath}:${structInfo.line + 1}`);
                    return new vscode.Location(structInfo.uri, new vscode.Position(structInfo.line, 0));
                }
                debugLog(`[structDef] Struct not found in index: ${word}`);
            }
            
            if (structIndex.has(word)) {
                debugLog(`[structDef] Standalone struct name detected: ${word}`);
                const structInfo = structIndex.get(word);
                debugLog(`[structDef] Returning definition from structIndex: ${path.basename(structInfo.uri.fsPath)}:${structInfo.line + 1}`);
                return new vscode.Location(structInfo.uri, new vscode.Position(structInfo.line, 0));
            }
            
            debugLog(`[structDef] No definition found for "${word}"`);
            return null;
        }
    });
    context.subscriptions.push(structDef);
    disposables.push(structDef);
    
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
    
    const srgMemberDocProvider = vscode.workspace.registerTextDocumentContentProvider('azsl-builtin', {
        provideTextDocumentContent(uri) {
            if (uri.path.startsWith('/srg/')) {
                const parts = uri.path.split('/');
                if (parts.length >= 4) {
                    const srgName = parts[2];
                    const memberName = path.basename(parts[3], '.azsli');
                    
                    if (srgMembers.has(srgName) && srgMembers.get(srgName).has(memberName)) {
                        let content = `/*\n * ${srgName}::${memberName}\n *\n`;
                        content += ` * Member of ShaderResourceGroup: ${srgName}\n */\n\n`;
                        content += `// Example usage:\n`;
                        content += `${srgName}::${memberName};\n`;
                        return content;
                    }
                }
            }
            return null;
        }
    });
    context.subscriptions.push(srgMemberDocProvider);
    disposables.push(srgMemberDocProvider);
    
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
                'Sampler', 'SamplerState', 'SamplerComparisonState',
                'StructuredBuffer', 'Buffer', 'RWStructuredBuffer', 'RWBuffer'
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
            // Also check structIndex for types from Gem headers
            for (const structName of structIndex.keys()) {
                if (!builtinTypes.has(structName) && !macroTypes.has(structName)) {
                    userTypes.add(structName);
                }
            }
            for (const line of lines) {
                const structMatch = line.match(/\b(?:struct|class)\s+([A-Z][A-Za-z0-9_]*)\b/);
                if (structMatch && !builtinTypes.has(structMatch[1]) && !macroTypes.has(structMatch[1])) {
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
                
                // Don't highlight basic types (bool, float, int, uint, etc.) as semantic tokens
                // They should use default textmate grammar highlighting only
                // Only highlight complex builtin types like Texture2D, Sampler, etc.
                const complexBuiltinTypes = new Set([
                    'Texture2D', 'Texture3D', 'TextureCube', 'Texture2DArray', 'RWTexture2D', 'RWTexture3D',
                    'Texture1D', 'Texture2DMS', 'RWTexture1D', 'RWTextureCube', 'RWTexture2DArray',
                    'Sampler', 'SamplerState', 'SamplerComparisonState',
                    'StructuredBuffer', 'Buffer', 'RWStructuredBuffer', 'RWBuffer'
                ]);
                
                for (const type of complexBuiltinTypes) {
                    const regex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
                    let match;
                    while ((match = regex.exec(processedLine)) !== null) {
                        const before = processedLine.substring(0, match.index);
                        const after = processedLine.substring(match.index + match[0].length);
                        if (after.match(/^\s*[<\(]/) || 
                            after.match(/^\s+[A-Za-z_]/) || 
                            before.match(/(?:^|\s|\(|,|\[|::|\.)$/) ||
                            (before.trim() === '' && after.match(/^\s*[A-Za-z_]/))) {
                            builder.push(lineNumber, match.index, match[0].length, TOKEN_TYPE);
                        }
                    }
                }
                
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
                
                // Highlight template arguments inside <...>
                // Parse template arguments with proper bracket matching
                let pos = 0;
                while (pos < processedLine.length) {
                    const openBracket = processedLine.indexOf('<', pos);
                    if (openBracket === -1) break;
                    
                    // Find matching closing bracket
                    let depth = 0;
                    let closeBracket = -1;
                    for (let i = openBracket; i < processedLine.length; i++) {
                        if (processedLine[i] === '<') depth++;
                        else if (processedLine[i] === '>') {
                            depth--;
                            if (depth === 0) {
                                closeBracket = i;
                                break;
                            }
                        }
                    }
                    
                    if (closeBracket === -1) break;
                    
                    const templateContent = processedLine.substring(openBracket + 1, closeBracket);
                    const templateStart = openBracket + 1;
                    
                    // Find types inside template arguments
                    // Exclude basic types (uint, int, float, etc.) from highlighting in templates
                    const basicTypes = new Set(['uint', 'int', 'float', 'bool', 'half', 'double', 'void', 
                                                'uint2', 'uint3', 'uint4', 'int2', 'int3', 'int4',
                                                'float2', 'float3', 'float4', 'real', 'real2', 'real3', 'real4']);
                    
                    // Include struct types from structIndex
                    const structTypes = new Set();
                    for (const structName of structIndex.keys()) {
                        structTypes.add(structName);
                    }
                    
                    // Types to highlight in templates: user types, struct types, complex builtin types (not basic)
                    const templateTypes = new Set([...macroTypes, ...userTypes, ...structTypes]);
                    for (const type of builtinTypes) {
                        if (!basicTypes.has(type)) {
                            templateTypes.add(type);
                        }
                    }
                    
                    for (const type of templateTypes) {
                        const typeRegex = new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
                        let typeMatch;
                        while ((typeMatch = typeRegex.exec(templateContent)) !== null) {
                            const beforeInTemplate = templateContent.substring(0, typeMatch.index);
                            const afterInTemplate = templateContent.substring(typeMatch.index + typeMatch[0].length);
                            // Check if it's a type (not part of a larger word)
                            if (beforeInTemplate.match(/(?:^|\s|,)$/) && 
                                afterInTemplate.match(/^\s*(?:,|>|$)/)) {
                                const absolutePos = templateStart + typeMatch.index;
                                builder.push(lineNumber, absolutePos, typeMatch[0].length, TOKEN_TYPE);
                            }
                        }
                    }
                    
                    pos = closeBracket + 1;
                }
                
                // Highlight keywords like 'precise' as modifiers
                const keywordRegex = /\b(precise|groupshared|static|const|uniform|extern|inline|noinline)\b/g;
                let keywordMatch;
                while ((keywordMatch = keywordRegex.exec(processedLine)) !== null) {
                    const before = processedLine.substring(0, keywordMatch.index);
                    const after = processedLine.substring(keywordMatch.index + keywordMatch[0].length);
                    // Check if it's used as a keyword/modifier (before a type or variable)
                    if (after.match(/^\s+(?:float|int|uint|bool|half|double|real|Texture|Sampler|[A-Z][A-Za-z0-9_]*|[a-z_][a-zA-Z0-9_]*)/)) {
                        builder.push(lineNumber, keywordMatch.index, keywordMatch[0].length, TOKEN_FUNCTION);
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
    
    const functionDef = vscode.languages.registerDefinitionProvider({ language: 'azsl' }, {
        provideDefinition(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!range) return;
            const funcName = document.getText(range);
            
            const lineText = document.lineAt(position.line).text;
            const funcStart = range.start.character;
            const beforeFunc = lineText.substring(0, funcStart);
            
            // Check if this is a function call (not a method call)
            // Function call should not have . or :: before it
            if (beforeFunc.match(/[A-Za-z_][A-Za-z0-9_]*\s*[\.:]\s*$/)) {
                return; // This is a method call, not a function call
            }
            
            // Check if it's followed by ( to confirm it's a function call
            const afterFunc = lineText.substring(range.end.character);
            if (!afterFunc.trim().startsWith('(')) {
                return; // Not a function call
            }
            
            const funcInfo = functionIndex.get(funcName);
            if (funcInfo) {
                return new vscode.Location(funcInfo.uri, new vscode.Position(funcInfo.line, funcInfo.column || 0));
            }
            
            return null;
        }
    });
    
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
    context.subscriptions.push(functionDef);
    disposables.push(functionDef);
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
    
    // Register Code Action Provider for Quick Fix
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        { language: 'azsl' },
        {
            provideCodeActions
        },
        {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        }
    );
    context.subscriptions.push(codeActionProvider);
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
        const variableTypes = new Map();
        
        for (const line of lines) {
            const structMatch = line.match(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
            if (structMatch) {
                declarations.add(structMatch[1]);
                knownStructs.add(structMatch[1]);
            }
            
            const patterns = [
                /\bconst\s+(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]\s*)?[;=]/,
                /\b(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]\s*)?[;=]/
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
                // Try to match member declaration with ; or { on same line
                let memberMatch = line.match(/^\s*(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|(Texture\w*)|(Sampler(?:State|ComparisonState|\w*)?)|([A-Z][A-Za-z0-9_]*)))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;{]/);
                // If no match, try to match member declaration without ; or { (for multiline declarations like Sampler name { ... })
                if (!memberMatch && i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    if (nextLine.trim().startsWith('{')) {
                        memberMatch = line.match(/^\s*(?:(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|(Texture\w*)|(Sampler(?:State|ComparisonState|\w*)?)|([A-Z][A-Za-z0-9_]*)))\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
                    }
                }
                if (memberMatch) {
                    const memberName = memberMatch[4];
                    declarations.add(`${currentSrg}::${memberName}`);
                    const textureType = memberMatch[1];
                    const samplerType = memberMatch[2];
                    const typeName = memberMatch[3];
                    if (textureType) {
                        variableTypes.set(`${currentSrg}::${memberName}`, textureType);
                    } else if (samplerType) {
                        // Normalize sampler type (Sampler -> SamplerState, SamplerState -> SamplerState, etc.)
                        const normalizedSamplerType = samplerType === 'Sampler' ? 'SamplerState' : samplerType;
                        variableTypes.set(`${currentSrg}::${memberName}`, normalizedSamplerType);
                    } else if (typeName) {
                        variableTypes.set(`${currentSrg}::${memberName}`, typeName);
                    }
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
                
                const memberMatch = line.match(/^\s*(?:precise\s+)?(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|Texture\w*|Sampler(?:State|ComparisonState|\w*)?|[A-Z][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=\(]/);
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
        
        return { declarations, knownStructs, classMembers, variableTypes };
    }
    
    function validateDocument(document) {
        if (document.languageId !== 'azsl') return;
        
        const fileName = document.fileName.split(/[/\\]/).pop();
        const text = document.getText();
        
        const { declarations, knownStructs, classMembers, variableTypes: extractedVariableTypes } = extractDeclarations(text);
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
        
        // Extract struct declarations from current document to ensure local structs are indexed
        // But only if they are not already found in indexed files (gems)
        // This ensures that go-to-definition prioritizes definitions from gems
        const currentDocStructs = extractStructDeclarations(text, document.uri.fsPath);
        for (const [structName, structInfo] of currentDocStructs.structs.entries()) {
            // Only add local struct if it's not already in the index (from indexed files)
            // This ensures that go-to-definition prioritizes definitions from gems
            if (!structIndex.has(structName)) {
                structIndex.set(structName, {
                    uri: structInfo.uri,
                    line: structInfo.line
                });
                debugLog(`[validateDocument] Added local struct to index: ${structName} at line ${structInfo.line + 1}`);
            } else {
                // If struct is already in index (from gem), don't override it
                // This ensures go-to-definition goes to gem definition, not local
                debugLog(`[validateDocument] Struct ${structName} already indexed from gem at ${path.basename(structIndex.get(structName).uri.fsPath)}:${structIndex.get(structName).line + 1}, skipping local definition`);
            }
            // Store struct members (always merge with existing if any)
            // This allows local overrides/extensions to work for members
            if (!structMembers.has(structName)) {
                structMembers.set(structName, new Set());
            }
            const existingMembers = structMembers.get(structName);
            const members = currentDocStructs.members.get(structName);
            if (members) {
                for (const member of members) {
                    existingMembers.add(member);
                    debugLog(`[validateDocument] Local struct ${structName} has member: ${member}`);
                }
            }
        }
        
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
        if (!atomTypeMembers.has('ForwardPassOutput')) {
            atomTypeMembers.set('ForwardPassOutput', new Set([
                'm_color', 'm_diffuseColor', 'm_specularColor', 'm_albedo', 
                'm_specularF0', 'm_normal', 'm_scatterDistance', 'm_depth'
            ]));
        }
        // Also ensure ForwardPassOutput members are in structMembers for validation
        if (!structMembers.has('ForwardPassOutput')) {
            structMembers.set('ForwardPassOutput', new Set([
                'm_color', 'm_diffuseColor', 'm_specularColor', 'm_albedo', 
                'm_specularF0', 'm_normal', 'm_scatterDistance', 'm_depth'
            ]));
        }
        // Ensure DirectionalLight members are indexed
        if (!structMembers.has('DirectionalLight')) {
            structMembers.set('DirectionalLight', new Set([
                'm_direction', 'm_angularRadius', 'm_rgbIntensityLux', 
                'm_affectsGIFactor', 'm_affectsGI', 'm_lightingChannelMask', 'm_padding'
            ]));
            debugLog(`[validateDocument] Added DirectionalLight members to structMembers: ${Array.from(structMembers.get('DirectionalLight')).join(', ')}`);
        } else {
            debugLog(`[validateDocument] DirectionalLight already in structMembers with ${structMembers.get('DirectionalLight').size} members: ${Array.from(structMembers.get('DirectionalLight')).join(', ')}`);
        }
        
        
        const variableTypes = new Map(extractedVariableTypes);
        // Track variable declarations with their scope (braceDepth and line number)
        const variableDeclarations = new Map(); // varName -> Array<{type, line, braceDepth}>
        // Track function return types and scopes
        const functionReturnTypes = new Map(); // line number -> return type
        const functionScopes = []; // stack of {startLine, endLine, returnType, firstParamType}
        let braceDepth = 0;
        
        // Helper function to get variable type at a specific line, considering scope
        const getVariableTypeAtLine = (varName, lineNum, currentBraceDepth) => {
            if (!variableDeclarations.has(varName)) {
                // Fallback to old variableTypes map
                if (variableTypes.has(varName)) {
                    return variableTypes.get(varName);
                }
                return null;
            }
            const declarations = variableDeclarations.get(varName);
            // Find the most recent declaration that is in scope at lineNum
            // A declaration is in scope if its braceDepth <= currentBraceDepth and its line <= lineNum
            let bestMatch = null;
            let bestBraceDepth = -1;
            for (const decl of declarations) {
                if (decl.line <= lineNum && decl.braceDepth <= currentBraceDepth) {
                    if (decl.braceDepth > bestBraceDepth) {
                        bestBraceDepth = decl.braceDepth;
                        bestMatch = decl;
                    } else if (decl.braceDepth === bestBraceDepth && decl.line > (bestMatch ? bestMatch.line : -1)) {
                        bestMatch = decl;
                    }
                }
            }
            if (bestMatch) {
                debugLog(`[getVariableTypeAtLine] Found ${varName} at line ${lineNum + 1}, braceDepth ${currentBraceDepth}: type=${bestMatch.type} (declared at line ${bestMatch.line + 1}, braceDepth ${bestMatch.braceDepth})`);
                return bestMatch.type;
            }
            // Fallback to old variableTypes map
            if (variableTypes.has(varName)) {
                debugLog(`[getVariableTypeAtLine] Using fallback variableTypes for ${varName} at line ${lineNum + 1}`);
                return variableTypes.get(varName);
            }
            debugLog(`[getVariableTypeAtLine] No declaration found for ${varName} at line ${lineNum + 1}, braceDepth ${currentBraceDepth}`);
            return null;
        };
        let currentFunctionStart = -1;
        let currentFunctionReturnType = null;
        let currentFunctionFirstParamType = null;
        
        // First pass: parse function signatures and track scopes
        let currentBraceDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match function signatures: TypeName funcName(TypeName paramName, ...)
            const funcSigMatch = line.match(/^\s*((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (funcSigMatch && !line.trim().startsWith('//')) {
                const returnType = funcSigMatch[1];
                const funcName = funcSigMatch[2];
                currentFunctionStart = i;
                currentFunctionReturnType = returnType;
                
                // Extract first parameter type from function signature
                // Match patterns like: VertexShaderInput IN, uint instanceId : SV_InstanceID
                const funcParams = line.match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/);
                if (funcParams) {
                    const paramMatch = funcParams[0].match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/);
                    if (paramMatch) {
                        currentFunctionFirstParamType = paramMatch[1];
                        debugLog(`[validateDocument] Found function ${funcName} with return type ${returnType} and first param type ${currentFunctionFirstParamType} at line ${i+1}`);
                    } else {
                        debugLog(`[validateDocument] Found function ${funcName} with return type ${returnType} at line ${i+1}`);
                    }
                } else {
                    debugLog(`[validateDocument] Found function ${funcName} with return type ${returnType} at line ${i+1}`);
                }
            }
            
            // Track brace depth to determine function scope
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            const prevBraceDepth = currentBraceDepth;
            currentBraceDepth += openBraces - closeBraces;
            
            // Check if function body started (opening brace found after function signature)
            // This handles both cases: opening brace on same line or next line
            if (currentFunctionStart >= 0 && prevBraceDepth === 0 && currentBraceDepth > 0) {
                // Function body started
                const existingScope = functionScopes.find(s => s.startLine === currentFunctionStart);
                if (!existingScope) {
                    functionScopes.push({
                        startLine: currentFunctionStart,
                        returnType: currentFunctionReturnType,
                        firstParamType: currentFunctionFirstParamType,
                        endLine: null
                    });
                    debugLog(`[validateDocument] Function body started at line ${i+1}, return type: ${currentFunctionReturnType}, first param type: ${currentFunctionFirstParamType}, startLine: ${currentFunctionStart + 1}`);
                }
            }
            
            // Check if function ended
            if (currentFunctionStart >= 0 && prevBraceDepth === 1 && currentBraceDepth === 0) {
                // Function ended
                const scope = functionScopes.find(s => s.startLine === currentFunctionStart);
                if (scope) {
                    scope.endLine = i;
                    functionReturnTypes.set(scope.startLine, scope.returnType);
                    debugLog(`[validateDocument] Function ended at line ${i+1}, startLine: ${currentFunctionStart + 1}, returnType: ${scope.returnType}`);
                }
                currentFunctionStart = -1;
                currentFunctionReturnType = null;
                currentFunctionFirstParamType = null;
            }
        }
        
        debugLog(`[validateDocument] Total functions found: ${functionScopes.length}`);
        for (const scope of functionScopes) {
            debugLog(`[validateDocument] Function scope: startLine=${scope.startLine + 1}, endLine=${scope.endLine ? scope.endLine + 1 : 'null'}, returnType=${scope.returnType}, firstParamType=${scope.firstParamType || 'null'}`);
        }
        
        // Check for non-static options and ShaderVariantFallback requirement
        // Only check in .azsl files, not in .azsli header files
        const isAzslFile = fileName.endsWith('.azsl') && !fileName.endsWith('.azsli');
        
        const nonStaticOptions = [];
        let hasShaderVariantFallback = false;
        // Semantics that have ShaderVariantFallback property
        const variantFallbackSemantics = new Set(['SRG_PerDraw', 'SRG_PerPass_WithFallback', 'SRG_RayTracingGlobal']);
        
        // Only check for options in .azsl files
        if (isAzslFile) {
            // First, collect non-static options from indexed files (include files)
            for (const [optionName, optionInfo] of optionIndex.entries()) {
                if (!optionInfo.isStatic) {
                    nonStaticOptions.push({ name: optionName, line: -1, fromIndex: true });
                    debugLog(`[validateDocument] Found non-static option from index: ${optionName}`);
                }
            }
        }
        
        // Track multi-line comment state
        let inMultiLineComment = false;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const trimmedLine = line.trim();
            
            // Handle multi-line comments
            if (inMultiLineComment) {
                const commentEnd = line.indexOf('*/');
                if (commentEnd !== -1) {
                    inMultiLineComment = false;
                    line = line.substring(commentEnd + 2);
                } else {
                    continue; // Still inside multi-line comment
                }
            }
            
            // Check for start of multi-line comment
            const multiLineStart = line.indexOf('/*');
            if (multiLineStart !== -1) {
                const commentEnd = line.indexOf('*/', multiLineStart + 2);
                if (commentEnd !== -1) {
                    // Comment ends on same line
                    line = line.substring(0, multiLineStart) + line.substring(commentEnd + 2);
                } else {
                    // Comment continues to next line
                    inMultiLineComment = true;
                    line = line.substring(0, multiLineStart);
                }
            }
            
            // Remove single-line comments
            const singleLineComment = line.indexOf('//');
            if (singleLineComment !== -1) {
                line = line.substring(0, singleLineComment);
            }
            
            const processedLine = line.trim();
            
            // Skip empty lines
            if (!processedLine) {
                continue;
            }
            
            // Check for non-static option declarations in current file
            // Match: option bool/int/uint name = value; (without static keyword)
            const optionMatch = processedLine.match(/^\s*option\s+(?:bool|int|uint)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=;]/);
            if (optionMatch) {
                // Check if it's not static
                if (!processedLine.includes('static')) {
                    const optionName = optionMatch[1];
                    // Only add if not already in list (from index)
                    if (!nonStaticOptions.some(o => o.name === optionName)) {
                        nonStaticOptions.push({ name: optionName, line: i, fromIndex: false });
                        debugLog(`[validateDocument] Found non-static option in current file: ${optionName} at line ${i + 1}`);
                    }
                }
            }
            
            // Check for ShaderResourceGroup using a semantic
            // Match: ShaderResourceGroup name : SemanticName (also handle "partial ShaderResourceGroup")
            const srgMatch = processedLine.match(/(?:partial\s+)?ShaderResourceGroup\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/);
            if (srgMatch) {
                const srgName = srgMatch[1];
                const semanticName = srgMatch[2];
                
                // Check if semantic is declared
                if (!srgSemanticIndex.has(semanticName)) {
                    const errorMessage = `Declaration for semantic ${semanticName} used in SRG ${srgName} was not found`;
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(i, 0, i, lines[i].length),
                        errorMessage,
                        vscode.DiagnosticSeverity.Error
                    ));
                    debugLog(`[validateDocument] Error: Semantic ${semanticName} used in SRG ${srgName} at line ${i + 1} was not found`);
                }
                
                // Check for ShaderVariantFallback
                if (variantFallbackSemantics.has(semanticName)) {
                    hasShaderVariantFallback = true;
                    debugLog(`[validateDocument] Found SRG with ShaderVariantFallback semantic: ${srgName} : ${semanticName} at line ${i + 1}`);
                }
            }
        }
        
        // If there are non-static options but no ShaderVariantFallback SRG, report global error
        // Only check in .azsl files
        if (isAzslFile) {
            debugLog(`[validateDocument] ShaderVariantFallback check: nonStaticOptions=${nonStaticOptions.length}, hasShaderVariantFallback=${hasShaderVariantFallback}`);
            if (nonStaticOptions.length > 0 && !hasShaderVariantFallback) {
                // Report as global error on first line of document (like compiler does)
                const errorMessage = `If you have non-static options, one SRG must be designated as the default ShaderVariantFallback`;
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, lines[0] ? lines[0].length : 0),
                    errorMessage,
                    vscode.DiagnosticSeverity.Error
                ));
                debugLog(`[validateDocument] Global error: Found ${nonStaticOptions.length} non-static option(s) (${nonStaticOptions.map(o => o.name).join(', ')}) but no SRG with ShaderVariantFallback semantic`);
            }
        }
        
        // Find current function scope for each line
        const getCurrentFunctionReturnType = (lineNum) => {
            debugLog(`[getCurrentFunctionReturnType] Checking line ${lineNum + 1}, functionScopes.length = ${functionScopes.length}`);
            for (let j = functionScopes.length - 1; j >= 0; j--) {
                const scope = functionScopes[j];
                debugLog(`[getCurrentFunctionReturnType] Scope ${j}: startLine=${scope.startLine + 1}, endLine=${scope.endLine ? scope.endLine + 1 : 'null'}, returnType=${scope.returnType}`);
                if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
                    debugLog(`[getCurrentFunctionReturnType] Found matching scope, returnType=${scope.returnType}`);
                    return scope.returnType;
                }
            }
            debugLog(`[getCurrentFunctionReturnType] No matching scope found for line ${lineNum + 1}`);
            return null;
        };
        
        const getCurrentFunctionParameterType = (lineNum) => {
            debugLog(`[getCurrentFunctionParameterType] Checking line ${lineNum + 1}, functionScopes.length = ${functionScopes.length}`);
            for (let j = functionScopes.length - 1; j >= 0; j--) {
                const scope = functionScopes[j];
                debugLog(`[getCurrentFunctionParameterType] Scope ${j}: startLine=${scope.startLine + 1}, endLine=${scope.endLine ? scope.endLine + 1 : 'null'}, firstParamType=${scope.firstParamType || 'null'}`);
                if (scope.startLine <= lineNum && (!scope.endLine || lineNum <= scope.endLine)) {
                    debugLog(`[getCurrentFunctionParameterType] Found matching scope, firstParamType=${scope.firstParamType || 'null'}`);
                    return scope.firstParamType;
                }
            }
            debugLog(`[getCurrentFunctionParameterType] No matching scope found for line ${lineNum + 1}`);
            return null;
        };
        
        // Second pass: parse function parameters and set OUT variable types
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match function signatures: TypeName funcName(TypeName paramName, ...)
            if (line.includes('(') && !line.trim().startsWith('//')) {
                // Match patterns like: VertexShaderOutput IN, uint instanceId : SV_InstanceID
                const funcParams = line.match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:[,:)]|$)/g);
                if (funcParams) {
                    for (const param of funcParams) {
                        const paramMatch = param.match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)/);
                        if (paramMatch) {
                            const fullType = paramMatch[1];
                            const varName = paramMatch[2];
                            debugLog(`[validateDocument] Found function param: ${varName} : ${fullType} on line ${i+1}`);
                            if (/^Texture/.test(fullType)) {
                                variableTypes.set(varName, fullType);
                                debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Texture param)`);
                            } else if (/^Sampler/.test(fullType)) {
                                variableTypes.set(varName, fullType);
                                debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Sampler param)`);
                            } else if (/^(float|int|uint|real|half|double)([2-4])?$/.test(fullType)) {
                                variableTypes.set(varName, fullType);
                                debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (vector/scalar param)`);
                            } else if (knownStructs.has(fullType) || atomTypes.has(fullType) || pascalCaseTypes.has(fullType) || structIndex.has(fullType) || structMembers.has(fullType)) {
                                variableTypes.set(varName, fullType);
                                debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (struct/type param)`);
                            }
                        }
                    }
                }
            }
        }
        
        // Track brace depth for variable declarations
        let varBraceDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            varBraceDepth += openBraces - closeBraces;
            
            const constVarDeclMatch = line.match(/\bconst\s+((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
            if (constVarDeclMatch) {
                const fullType = constVarDeclMatch[1];
                const varName = constVarDeclMatch[2];
                if (!variableDeclarations.has(varName)) {
                    variableDeclarations.set(varName, []);
                }
                variableDeclarations.get(varName).push({type: fullType, line: i, braceDepth: varBraceDepth});
                if (/^Texture/.test(fullType)) {
                    variableTypes.set(varName, fullType);
                } else if (/^Sampler/.test(fullType)) {
                    variableTypes.set(varName, fullType);
                } else if (/^(float|int|uint|real|half|double)([2-4])?$/.test(fullType)) {
                    variableTypes.set(varName, fullType);
                } else if (knownStructs.has(fullType) || atomTypes.has(fullType) || pascalCaseTypes.has(fullType) || structIndex.has(fullType) || structMembers.has(fullType)) {
                    variableTypes.set(varName, fullType);
                }
            }
            const varDeclMatch = line.match(/\b((?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix|Texture\w*|Sampler\w*|[A-Z][A-Za-z0-9_]*))\s+([A-Za-z_][A-Za-z0-9_]*)\s*[;=]/);
            if (varDeclMatch) {
                let fullType = varDeclMatch[1];
                const varName = varDeclMatch[2];
                
                // Special handling for OUT variable: use function return type
                if (varName === 'OUT' || varName === 'out') {
                    const funcReturnType = getCurrentFunctionReturnType(i);
                    if (funcReturnType) {
                        fullType = funcReturnType;
                        debugLog(`[validateDocument] OUT variable at line ${i+1} - using function return type: ${fullType} (was: ${varDeclMatch[1]})`);
                    } else {
                        debugLog(`[validateDocument] OUT variable at line ${i+1} - no function return type found, keeping original type: ${fullType}`);
                    }
                }
                
                // Special handling for IN variable: use function first parameter type
                if (varName === 'IN' || varName === 'in') {
                    const funcParamType = getCurrentFunctionParameterType(i);
                    if (funcParamType) {
                        fullType = funcParamType;
                        debugLog(`[validateDocument] IN variable at line ${i+1} - using function first param type: ${fullType} (was: ${varDeclMatch[1]})`);
                    } else {
                        debugLog(`[validateDocument] IN variable at line ${i+1} - no function param type found, keeping original type: ${fullType}`);
                    }
                }
                
                debugLog(`[validateDocument] Found var decl: ${varName} : ${fullType} on line ${i+1}, braceDepth=${varBraceDepth}`);
                // Store declaration with scope information
                if (!variableDeclarations.has(varName)) {
                    variableDeclarations.set(varName, []);
                }
                variableDeclarations.get(varName).push({type: fullType, line: i, braceDepth: varBraceDepth});
                
                if (/^Texture/.test(fullType)) {
                    variableTypes.set(varName, fullType);
                    debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Texture)`);
                } else if (/^Sampler/.test(fullType)) {
                    variableTypes.set(varName, fullType);
                    debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (Sampler)`);
                } else if (/^(float|int|uint|real|half|double)([2-4])?$/.test(fullType)) {
                    variableTypes.set(varName, fullType);
                    debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (vector/scalar)`);
                } else if (knownStructs.has(fullType) || atomTypes.has(fullType) || pascalCaseTypes.has(fullType) || structIndex.has(fullType) || structMembers.has(fullType)) {
                    // Check both structIndex (for indexed structs) and structMembers (for local structs)
                    variableTypes.set(varName, fullType);
                    debugLog(`[validateDocument] Set variableTypes[${varName}] = ${fullType} (struct/type) - knownStructs=${knownStructs.has(fullType)}, atomTypes=${atomTypes.has(fullType)}, structIndex=${structIndex.has(fullType)}, structMembers=${structMembers.has(fullType)}`);
                } else {
                    debugLog(`[validateDocument] Skipped variableTypes[${varName}] = ${fullType} (unknown type) - knownStructs=${knownStructs.has(fullType)}, atomTypes=${atomTypes.has(fullType)}, structIndex=${structIndex.has(fullType)}, structMembers=${structMembers.has(fullType)}`);
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
        
        // Track brace depth during validation
        let validationBraceDepth = 0;
        // Track if we're inside a block comment
        let inBlockComment = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Update brace depth
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            validationBraceDepth += openBraces - closeBraces;
            
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
            
            // Track block comment state
            const blockCommentStart = lineWithoutStrings.indexOf('/*');
            const blockCommentEnd = lineWithoutStrings.indexOf('*/');
            
            // If we find /* on this line
            if (blockCommentStart >= 0) {
                // Check if */ is also on this line (after /*)
                if (blockCommentEnd >= 0 && blockCommentEnd > blockCommentStart) {
                    // Both markers on same line, comment is closed on this line
                    inBlockComment = false;
                } else {
                    // Only /* found, we're entering a block comment
                    inBlockComment = true;
                }
            } else if (blockCommentEnd >= 0 && inBlockComment) {
                // We found */ and we were in a block comment, so exit it
                inBlockComment = false;
            }
            
            // Check if line has comments BEFORE removing them
            const originalHasComment = /\/\//.test(line) || /\/\*/.test(line) || inBlockComment;
            
            // Remove comments BEFORE checking for syntax errors
            // First remove block comments
            lineWithoutStrings = lineWithoutStrings.replace(/\/\*[\s\S]*?\*\//g, '');
            // Then remove single-line comments (including //!< style)
            lineWithoutStrings = lineWithoutStrings.replace(/\/\/.*$/g, '');
            
            // Check for syntax error: identifier.;
            // Only check if line is not empty after removing comments
            const trimmedAfterComments = lineWithoutStrings.trim();
            if (trimmedAfterComments.length > 0) {
                // Debug: log when checking for syntax errors
                const hasDotAtEnd = /\.\s*$/.test(trimmedAfterComments);
                if (hasDotAtEnd) {
                    debugLog(`[SYNTAX CHECK] Line ${i + 1}: has dot at end`);
                    debugLog(`  Original line: "${line}"`);
                    debugLog(`  Has comment: ${originalHasComment}, inBlockComment: ${inBlockComment}`);
                    debugLog(`  After removing comments: "${trimmedAfterComments}"`);
                }
                
                // Skip syntax error checks if the original line had a comment or we're inside a block comment
                // This prevents false positives from comment artifacts
                if (!originalHasComment && !inBlockComment) {
                    const syntaxErrorMatch = trimmedAfterComments.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*;$/);
                    if (syntaxErrorMatch) {
                        debugLog(`[SYNTAX ERROR] Line ${i + 1}: Found identifier.; pattern`);
                        const varName = syntaxErrorMatch[1];
                        const pos = lineWithoutStrings.indexOf(varName);
                        if (pos >= 0) {
                            const range = new vscode.Range(i, pos, i, pos + varName.length);
                            diagnostics.push(new vscode.Diagnostic(
                                range,
                                `syntax error: incomplete member access`,
                                vscode.DiagnosticSeverity.Error
                            ));
                        }
                    }
                    
                    // Check for syntax error: identifier. (without semicolon, at end of line)
                    const incompleteAccessMatch = trimmedAfterComments.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/);
                    if (incompleteAccessMatch) {
                        debugLog(`[SYNTAX ERROR] Line ${i + 1}: Found identifier. pattern (no semicolon)`);
                        debugLog(`  Matched identifier: "${incompleteAccessMatch[1]}"`);
                        const varName = incompleteAccessMatch[1];
                        const pos = lineWithoutStrings.indexOf(varName);
                        if (pos >= 0) {
                            const range = new vscode.Range(i, pos, i, pos + varName.length);
                            diagnostics.push(new vscode.Diagnostic(
                                range,
                                `syntax error: incomplete member access`,
                                vscode.DiagnosticSeverity.Error
                            ));
                        }
                    }
                } else if (hasDotAtEnd) {
                    debugLog(`[SYNTAX CHECK] Line ${i + 1}: Skipped check because original line has comment or in block comment`);
                }
            }
            
            // Check for incomplete variable declaration: type without variable name
            // Match: type at end of line (possibly with whitespace and comment)
            const incompleteDeclMatch = lineWithoutStrings.match(/^\s*(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_]*)\s*(?:\/\/.*)?$/);
            if (incompleteDeclMatch) {
                // Make sure it's not a function declaration or return statement
                const trimmed = lineWithoutStrings.trim();
                if (!trimmed.match(/\breturn\s+/) && !trimmed.match(/\([^)]*\)\s*$/) && !trimmed.match(/^\s*\/\//)) {
                    const typeMatch = trimmed.match(/^(?:float(?:[1-4](?:x[1-4])?)?|real(?:[1-4](?:x[1-4])?)?|int(?:[1-4])?|uint(?:[1-4])?|bool|half|double|matrix(?:[1-4]x[1-4])?|[A-Z][A-Za-z0-9_]*)/);
                    if (typeMatch) {
                        const typeName = typeMatch[0];
                        const pos = lineWithoutStrings.indexOf(typeName);
                        const range = new vscode.Range(i, pos, i, pos + typeName.length);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `syntax error: incomplete variable declaration`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
            }
            
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
                
                debugLog(`[validateDocument] Checking identifier '${identifier}' on line ${i+1}, col ${pos}`);
                
                if (/\./.test(beforeMatch) || /::/.test(beforeMatch)) {
                    const beforeAccess = beforeMatch.trim();
                    
                    // Check if identifier is part of SRG::member pattern (e.g., ViewSrg::m_worldPosition)
                    const srgBeforeMemberMatch = beforeAccess.match(/([A-Za-z_][A-Za-z0-9_]*)::\s*$/);
                    if (srgBeforeMemberMatch) {
                        const srgName = srgBeforeMemberMatch[1];
                        const fullSrgMember = `${srgName}::${identifier}`;
                        debugLog(`[validateDocument] Checking SRG member pattern: ${fullSrgMember}`);
                        
                        let memberFound = false;
                        if (declarations.has(fullSrgMember)) {
                            debugLog(`[validateDocument] Found SRG member in declarations: ${fullSrgMember}`);
                            memberFound = true;
                        } else if (srgMembers.has(srgName)) {
                            const members = srgMembers.get(srgName);
                            if (members.has(identifier)) {
                                debugLog(`[validateDocument] Found SRG member in srgMembers: ${fullSrgMember}`);
                                memberFound = true;
                            }
                        } else if (srgMemberIndex.has(fullSrgMember)) {
                            debugLog(`[validateDocument] Found SRG member in srgMemberIndex: ${fullSrgMember}`);
                            memberFound = true;
                        }
                        
                        if (memberFound) {
                            continue;
                        }
                        
                        // If SRG exists but member not found, report error
                        if (atomTypes.has(srgName) || declarations.has(srgName) || srgMembers.has(srgName)) {
                            debugLog(`[validateDocument] SRG ${srgName} exists but member ${identifier} not found`);
                            const range = new vscode.Range(i, pos, i, pos + identifier.length);
                            diagnostics.push(new vscode.Diagnostic(
                                range,
                                `no member named '${identifier}' in SRG '${srgName}'`,
                                vscode.DiagnosticSeverity.Error
                            ));
                            continue;
                        }
                    }
                    
                    // Find the last member access pattern (closest to the identifier)
                    const srgMemberMatch = beforeAccess.match(/([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)\s*\.(?![^.]*\.)/);
                    
                    // First, check if this is a function call expression (e.g., mul(...).xyz)
                    const expressionBeforeDot = beforeAccess.substring(0, beforeAccess.lastIndexOf('.'));
                    let exprType = null;
                    // Check for function call pattern ending with )
                    if (expressionBeforeDot.trim().endsWith(')')) {
                        exprType = getExpressionType(document, expressionBeforeDot, i);
                        if (exprType) {
                            debugLog(`[validateDocument] Found expression type: ${exprType} for '${expressionBeforeDot}'`);
                        }
                    }
                    
                    let varMatch = null;
                    if (!srgMemberMatch && !exprType) {
                        // Find the last variable access pattern (closest to the identifier)
                        const allMatches = [];
                        let match;
                        const varPattern = /([A-Za-z_][A-Za-z0-9_]*)\s*\./g;
                        while ((match = varPattern.exec(beforeAccess)) !== null) {
                            allMatches.push(match);
                        }
                        if (allMatches.length > 0) {
                            varMatch = allMatches[allMatches.length - 1];
                        }
                    }
                    
                    let varName = null;
                    let varType = exprType; // Use expression type if found
                    
                    debugLog(`[validateDocument] Member access on line ${i+1}, col ${pos}: beforeAccess="${beforeAccess}", identifier="${identifier}", exprType=${exprType}`);
                    
                    if (srgMemberMatch) {
                        const srgName = srgMemberMatch[1];
                        const memberName = srgMemberMatch[2];
                        const fullName = `${srgName}::${memberName}`;
                        debugLog(`[validateDocument] SRG member access: ${fullName}`);
                        
                        // Check if SRG member exists
                        let memberExists = declarations.has(fullName) || srgMemberIndex.has(fullName);
                        if (!memberExists && srgMembers.has(srgName)) {
                            const members = srgMembers.get(srgName);
                            memberExists = members.has(memberName);
                        }
                        
                        if (!memberExists) {
                            // SRG exists but member not found - report error
                            if (atomTypes.has(srgName) || declarations.has(srgName) || srgMembers.has(srgName)) {
                                debugLog(`[validateDocument] SRG ${srgName} exists but member ${memberName} not found`);
                                // Find the position of memberName in the line
                                const memberNamePos = line.indexOf(memberName, pos - 100);
                                if (memberNamePos >= 0) {
                                    const range = new vscode.Range(i, memberNamePos, i, memberNamePos + memberName.length);
                                    diagnostics.push(new vscode.Diagnostic(
                                        range,
                                        `no member named '${memberName}' in SRG '${srgName}'`,
                                        vscode.DiagnosticSeverity.Error
                                    ));
                                }
                                continue;
                            }
                        }
                        
                        if (variableTypes.has(fullName)) {
                            varType = variableTypes.get(fullName);
                            debugLog(`[validateDocument] Found varType for ${fullName}: ${varType}`);
                        } else {
                            debugLog(`[validateDocument] No varType found for ${fullName}, checking srgMemberIndex...`);
                            // Try to find type in srgMemberIndex
                            if (srgMemberIndex.has(fullName)) {
                                const memberInfo = srgMemberIndex.get(fullName);
                                if (memberInfo && memberInfo.type) {
                                    varType = memberInfo.type;
                                    debugLog(`[validateDocument] Found varType from srgMemberIndex for ${fullName}: ${varType}`);
                                }
                            }
                            // If still not found, check if it's a known SRG member
                            if (!varType && srgMembers.has(srgName)) {
                                const members = srgMembers.get(srgName);
                                if (members.has(memberName)) {
                                    // Member exists but type unknown - still need to validate property
                                    debugLog(`[validateDocument] Member ${fullName} exists but type unknown`);
                                }
                            }
                        }
                    } else if (varMatch) {
                        varName = varMatch[1];
                        debugLog(`[validateDocument] Variable access: ${varName} on line ${i+1}, checking member '${identifier}'`);
                        
                        // Check if this is a function call expression (e.g., mul(...))
                        // First, try to find the full expression before the dot
                        const expressionBeforeDot = beforeAccess.substring(0, beforeAccess.lastIndexOf('.'));
                        const exprType = getExpressionType(document, expressionBeforeDot, i);
                        if (exprType) {
                            varType = exprType;
                            debugLog(`[validateDocument] Inferred type from expression '${expressionBeforeDot}': ${varType}`);
                        } else {
                            // Try to match function call pattern more carefully
                            const exprMatch = beforeAccess.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\./);
                            if (exprMatch) {
                                const funcName = exprMatch[1];
                                // For mul(), the return type is typically the type of the second argument
                                if (funcName === 'mul') {
                                    const mulArgs = extractFunctionCallArgs(expressionBeforeDot, 'mul');
                                    if (mulArgs && mulArgs.length >= 2) {
                                        const secondArg = mulArgs[1].trim();
                                        // Check if second argument is a vector type constructor
                                        const vectorMatch = secondArg.match(/(float|int|uint|bool|real|half)([2-4])\s*\(/);
                                        if (vectorMatch) {
                                            varType = vectorMatch[1] + vectorMatch[2];
                                            debugLog(`[validateDocument] Inferred type from mul() second arg constructor: ${varType}`);
                                        } else {
                                            // Check if it's a variable of vector type
                                            const varMatch2 = secondArg.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
                                            if (varMatch2) {
                                                const argVarType = getVariableTypeAtLine(varMatch2[1], i, validationBraceDepth);
                                                if (argVarType && isVectorType(argVarType)) {
                                                    varType = argVarType;
                                                    debugLog(`[validateDocument] Inferred type from mul() second arg variable: ${varType}`);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Special handling for OUT variable: use function return type from current context
                        if (!varType && (varName === 'OUT' || varName === 'out')) {
                            const funcReturnType = getCurrentFunctionReturnType(i);
                            if (funcReturnType) {
                                varType = funcReturnType;
                                debugLog(`[validateDocument] OUT variable at line ${i+1} - using function return type: ${varType}`);
                            }
                        }
                        
                        // Special handling for IN variable: use function first parameter type from current context
                        if (!varType && (varName === 'IN' || varName === 'in')) {
                            const funcParamType = getCurrentFunctionParameterType(i);
                            if (funcParamType) {
                                varType = funcParamType;
                                debugLog(`[validateDocument] IN variable at line ${i+1} - using function first param type: ${varType}`);
                            }
                        }
                        
                        if (!varType) {
                            // Try to get variable type considering scope
                            varType = getVariableTypeAtLine(varName, i, validationBraceDepth);
                            if (varType) {
                                debugLog(`[validateDocument] Found varType for ${varName} using getVariableTypeAtLine: ${varType}`);
                            }
                        }
                        if (!varType) {
                            debugLog(`[validateDocument] ${varName} not in variableTypes, checking SRG members...`);
                            for (const [srgName, members] of srgMembers.entries()) {
                                if (members.has(varName)) {
                                    const fullName = `${srgName}::${varName}`;
                                    if (variableTypes.has(fullName)) {
                                        varType = variableTypes.get(fullName);
                                        debugLog(`[validateDocument] Found varType for ${fullName}: ${varType}`);
                                        break;
                                    }
                                }
                            }
                            if (!varType && (atomTypes.has(varName) || pascalCaseTypes.has(varName) || knownStructs.has(varName) || structIndex.has(varName))) {
                                varType = varName;
                                debugLog(`[validateDocument] Using varName as varType: ${varType} (found in atomTypes/pascalCaseTypes/knownStructs/structIndex)`);
                            }
                            if (!varType) {
                                debugLog(`[validateDocument] No varType found for ${varName} - atomTypes.has=${atomTypes.has(varName)}, structIndex.has=${structIndex.has(varName)}, structMembers.has=${structMembers.has(varName)}`);
                            }
                        }
                    }
                    
                    // If srgMemberMatch found but varType unknown, check if property is valid swizzle
                    if (srgMemberMatch && !varType) {
                        const srgName = srgMemberMatch[1];
                        const memberName = srgMemberMatch[2];
                        const fullName = `${srgName}::${memberName}`;
                        let memberExists = declarations.has(fullName) || srgMemberIndex.has(fullName);
                        if (!memberExists && srgMembers.has(srgName)) {
                            const members = srgMembers.get(srgName);
                            memberExists = members.has(memberName);
                        }
                        if (memberExists) {
                            // Member exists but type unknown - check if property is valid swizzle
                            const isValidSwizzle = /^[xyzwrgba]{1,4}$/.test(identifier);
                            debugLog(`[validateDocument] SRG member ${fullName} exists but type unknown, checking swizzle: identifier='${identifier}', isValidSwizzle=${isValidSwizzle}`);
                            if (!isValidSwizzle) {
                                // Invalid swizzle property - report error
                                const range = new vscode.Range(i, pos, i, pos + identifier.length);
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `invalid swizzle property '${identifier}'`,
                                    vscode.DiagnosticSeverity.Error
                                ));
                                continue;
                            } else {
                                // Valid swizzle, skip
                                continue;
                            }
                        }
                    }
                    
                    if (varType) {
                        debugLog(`[validateDocument] Checking member '${identifier}' of type '${varType}' on line ${i+1}`);
                        // Check for vector type swizzle properties first (x, y, z, w, r, g, b, a and combinations)
                        if (isVectorType(varType)) {
                            const isValidSwizzle = /^[xyzwrgba]{1,4}$/.test(identifier);
                            debugLog(`[validateDocument] isValidSwizzle test: identifier='${identifier}', result=${isValidSwizzle}`);
                            if (isValidSwizzle) {
                                debugLog(`[validateDocument] Valid swizzle for vector type ${varType}, skipping error`);
                                continue;
                            }
                        }
                        
                        debugLog(`[validateDocument] Checking atomTypeMembers for '${varType}': has=${atomTypeMembers.has(varType)}`);
                        if (atomTypeMembers.has(varType)) {
                            const members = atomTypeMembers.get(varType);
                            debugLog(`[validateDocument] atomTypeMembers['${varType}'] has '${identifier}': ${members.has(identifier)}`);
                            if (members.has(identifier)) {
                                debugLog(`[validateDocument] Found member '${identifier}' in atomTypeMembers['${varType}']`);
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
                        // Check if varType is a struct and validate struct members
                        // Check atomTypeMembers first (for types like ForwardPassOutput), then structMembers
                        debugLog(`[validateDocument] Checking structMembers/structIndex/atomTypes for '${varType}': structIndex.has=${structIndex.has(varType)}, structMembers.has=${structMembers.has(varType)}, atomTypes.has=${atomTypes.has(varType)}`);
                        if (structIndex.has(varType) || structMembers.has(varType) || atomTypes.has(varType)) {
                            // Check structMembers (works for both indexed and local structs)
                            // Also check atomTypes (like DirectionalLight) which may have members in structMembers
                            if (structMembers.has(varType)) {
                                const members = structMembers.get(varType);
                                debugLog(`[validateDocument] structMembers['${varType}'] has ${members.size} members: ${Array.from(members).join(', ')}`);
                                debugLog(`[validateDocument] structMembers['${varType}'] has '${identifier}': ${members.has(identifier)}`);
                                if (members.has(identifier)) {
                                    debugLog(`[validateDocument] Found member '${identifier}' in structMembers['${varType}']`);
                                    continue;
                                }
                                // Member not found - report error
                                debugLog(`[validateDocument] Member '${identifier}' NOT found in structMembers['${varType}']`);
                                const range = new vscode.Range(i, pos, i, pos + identifier.length);
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `no member named '${identifier}' in struct '${varType}'`,
                                    vscode.DiagnosticSeverity.Error
                                ));
                                continue;
                            } else if (atomTypes.has(varType)) {
                                // Type is in atomTypes but no members found in structMembers
                                debugLog(`[validateDocument] Type '${varType}' is in atomTypes but NOT in structMembers - this may indicate indexing issue`);
                                const range = new vscode.Range(i, pos, i, pos + identifier.length);
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `no member named '${identifier}' in struct '${varType}' (type found but members not indexed)`,
                                    vscode.DiagnosticSeverity.Error
                                ));
                                continue;
                            }
                        }
                        if (srgMembers.has(varType)) {
                            if (srgMembers.get(varType).has(identifier)) {
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
                        
                        const textureMethods = new Set(['Sample', 'SampleLevel', 'SampleBias', 'SampleGrad', 'SampleCmp', 'SampleCmpLevelZero', 'Load', 'GetDimensions', 'Gather', 'GatherRed', 'GatherGreen', 'GatherBlue', 'GatherAlpha', 'GatherCmp', 'GatherCmpRed']);
                        if (/^Texture/.test(varType)) {
                            if (!textureMethods.has(identifier)) {
                                const range = new vscode.Range(i, pos, i, pos + identifier.length);
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `no member named '${identifier}' in type '${varType}'. Valid methods: ${Array.from(textureMethods).join(', ')}`,
                                    vscode.DiagnosticSeverity.Error
                                ));
                                continue;
                            }
                        }
                        // If we found varType and processed it, skip further checks
                        continue;
                    }
                    // If we have . or :: but no varType found, and we have varMatch/srgMemberMatch,
                    // it means we tried to process member access but couldn't find type
                    // Skip to avoid false positives (e.g., SRG members not indexed)
                    if (srgMemberMatch || varMatch) {
                        debugLog(`[validateDocument] Skipping '${identifier}' on line ${i+1}: member access attempted but no type found`);
                        continue;
                    }
                    // If we have . or :: but no varMatch/srgMemberMatch, it's not a member access
                    // Continue to check as undeclared identifier
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
                    if (srgMembers.has(srgMemberMatch[1])) {
                        const members = srgMembers.get(srgMemberMatch[1]);
                        if (members.has(identifier)) {
                            continue;
                        }
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
                    debugLog(`[validateDocument] Skipping '${identifier}' on line ${i+1}: not a usage (isUsage=false)`);
                    continue;
                }
                
                if (/^[a-z_]/.test(identifier)) {
                    debugLog(`[validateDocument] Reporting undeclared identifier '${identifier}' on line ${i+1}, col ${pos}`);
                    const range = new vscode.Range(i, pos, i, pos + identifier.length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `use of undeclared identifier '${identifier}'`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
            
        }
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (/^\s*\/\//.test(line) || /^\s*#/.test(line)) {
                continue;
            }
            
            let lineWithoutComments = line;
            lineWithoutComments = lineWithoutComments.replace(/\/\*[\s\S]*?\*\//g, '');
            const commentIndex = lineWithoutComments.indexOf('//');
            if (commentIndex !== -1) {
                lineWithoutComments = lineWithoutComments.substring(0, commentIndex);
            }
            
            const trimmedLine = lineWithoutComments.trim();
            
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
            
            const dotSemicolonRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*;/g;
            let match;
            while ((match = dotSemicolonRegex.exec(lineWithoutComments)) !== null) {
                const dotPos = match.index + match[1].length;
                const semicolonPos = lineWithoutComments.indexOf(';', dotPos);
                const range = new vscode.Range(i, dotPos, i, semicolonPos + 1);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `syntax error: unexpected ';' after '.'`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
            
            const doubleDotRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*\./g;
            while ((match = doubleDotRegex.exec(lineWithoutComments)) !== null) {
                const firstDotPos = match.index + match[1].length;
                const range = new vscode.Range(i, firstDotPos, i, firstDotPos + 2);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `syntax error: unexpected '.' after '.'`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
            
            const colonSemicolonRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*::\s*;/g;
            while ((match = colonSemicolonRegex.exec(lineWithoutComments)) !== null) {
                const colonPos = match.index + match[1].length;
                const semicolonPos = lineWithoutComments.indexOf(';', colonPos);
                const range = new vscode.Range(i, colonPos, i, semicolonPos + 1);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `syntax error: unexpected ';' after '::'`,
                    vscode.DiagnosticSeverity.Error
                ));
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



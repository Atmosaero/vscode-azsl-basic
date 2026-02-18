export const builtinDocs = new Map<string, string>(
  Object.entries({
    max: "```hlsl\nT max(T a, T b)\n```\n\nReturns the greater of two values. Component-wise for vectors.\n\n**Parameters:**\n- `a`, `b`: scalar or vector of type `T` (float, int, uint, or vector types)\n\n**Returns:** `T` - maximum value\n\n**Example:**\n```hlsl\nfloat result = max(0.5, 0.8);  // returns 0.8\nfloat3 result = max(float3(1,2,3), float3(4,1,2));  // returns (4,2,3)\n```",
    min: "```hlsl\nT min(T a, T b)\n```\n\nReturns the lesser of two values. Component-wise for vectors.\n\n**Parameters:**\n- `a`, `b`: scalar or vector of type `T` (float, int, uint, or vector types)\n\n**Returns:** `T` - minimum value\n\n**Example:**\n```hlsl\nfloat result = min(0.5, 0.8);  // returns 0.5\n```",
    saturate:
      "```hlsl\nT saturate(T x)\n```\n\nClamps `x` to the range [0, 1]. Equivalent to `clamp(x, 0.0, 1.0)`.\n\n**Parameters:**\n- `x`: scalar or vector\n\n**Returns:** `T` - clamped value in [0, 1]\n\n**Example:**\n```hlsl\nfloat result = saturate(1.5);  // returns 1.0\nfloat result = saturate(-0.2);  // returns 0.0\n```",
    clamp:
      "```hlsl\nT clamp(T x, T minVal, T maxVal)\n```\nClamps `x` to the range [minVal, maxVal]. Component-wise for vectors.\n\n**Parameters:**\n- `x`: value to clamp\n- `minVal`: minimum value\n- `maxVal`: maximum value\n\n**Returns:** `T` - clamped value",
    smoothstep:
      "```hlsl\nT smoothstep(T edge0, T edge1, T x)\n```\nPerforms smooth Hermite interpolation between 0 and 1 when `edge0 < x < edge1`.\n\n**Parameters:**\n- `edge0`: lower edge\n- `edge1`: upper edge\n- `x`: input value\n\n**Returns:** `T` - interpolated value in [0, 1]",
    normalize:
      "```hlsl\nfloat3 normalize(float3 v)\nfloat4 normalize(float4 v)\n```\nReturns a unit-length vector in the same direction as `v`.\n\n**Parameters:**\n- `v`: input vector\n\n**Returns:** normalized vector",
    length:
      "```hlsl\nfloat length(float3 v)\nfloat length(float4 v)\n```\nReturns the length (magnitude) of vector `v`.\n\n**Parameters:**\n- `v`: input vector\n\n**Returns:** `float` - vector length",
    dot:
      "```hlsl\nfloat dot(float3 a, float3 b)\nfloat dot(float4 a, float4 b)\n```\nComputes the dot product of two vectors.\n\n**Parameters:**\n- `a`, `b`: input vectors\n\n**Returns:** `float` - dot product",
    cross:
      "```hlsl\nfloat3 cross(float3 a, float3 b)\n```\nComputes the cross product of two 3D vectors.\n\n**Parameters:**\n- `a`, `b`: 3D input vectors\n\n**Returns:** `float3` - cross product",
    pow:
      "```hlsl\nT pow(T x, T y)\n```\nReturns `x` raised to the power `y`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: base\n- `y`: exponent\n\n**Returns:** `T` - x^y",
    floor:
      "```hlsl\nT floor(T x)\n```\nReturns the largest integer less than or equal to `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - floored value",
    ceil:
      "```hlsl\nT ceil(T x)\n```\nReturns the smallest integer greater than or equal to `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - ceiled value",
    round:
      "```hlsl\nT round(T x)\n```\nReturns the nearest integer to `x`. Rounds to nearest even on tie. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - rounded value\n\n**Example:**\n```hlsl\nfloat result = round(1.5);  // returns 2.0\nfloat result = round(1.4);  // returns 1.0\n```",
    frac:
      "```hlsl\nT frac(T x)\n```\nReturns the fractional part of `x` (x - floor(x)). Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - fractional part",
    lerp:
      "```hlsl\nT lerp(T a, T b, float t)\n```\n\nPerforms linear interpolation: `a + t * (b - a)`. Component-wise for vectors.\n\n**Parameters:**\n- `a`: start value (scalar or vector)\n- `b`: end value (scalar or vector)\n- `t`: interpolation factor in [0, 1]\n\n**Returns:** `T` - interpolated value\n\n**Example:**\n```hlsl\nfloat result = lerp(0.0, 1.0, 0.5);  // returns 0.5\nfloat3 color = lerp(float3(1,0,0), float3(0,0,1), t);  // interpolate colors\n```",
    step:
      "```hlsl\nT step(T edge, T x)\n```\nReturns 0 if `x < edge`, else 1. Component-wise for vectors.\n\n**Parameters:**\n- `edge`: edge value\n- `x`: input value\n\n**Returns:** `T` - step result",
    ddx:
      "```hlsl\nT ddx(T x)\n```\nReturns the approximate partial derivative of `x` with respect to screen-space x-coordinate. Available in pixel shaders.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - derivative",
    ddy:
      "```hlsl\nT ddy(T x)\n```\nReturns the approximate partial derivative of `x` with respect to screen-space y-coordinate. Available in pixel shaders.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - derivative",
    abs:
      "```hlsl\nT abs(T x)\n```\nReturns the absolute value of `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value\n\n**Returns:** `T` - absolute value",
    sin:
      "```hlsl\nT sin(T x)\n```\nReturns the sine of `x` (in radians). Component-wise for vectors.\n\n**Parameters:**\n- `x`: angle in radians (scalar or vector)\n\n**Returns:** `T` - sine value\n\n**Example:**\n```hlsl\nfloat result = sin(1.5708);  // returns ~1.0 (sin of 90 degrees)\n```",
    cos:
      "```hlsl\nT cos(T x)\n```\nReturns the cosine of `x` (in radians). Component-wise for vectors.\n\n**Parameters:**\n- `x`: angle in radians (scalar or vector)\n\n**Returns:** `T` - cosine value\n\n**Example:**\n```hlsl\nfloat result = cos(0.0);  // returns 1.0\n```",
    sqrt:
      "```hlsl\nT sqrt(T x)\n```\nReturns the square root of `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: input value (must be >= 0)\n\n**Returns:** `T` - square root\n\n**Example:**\n```hlsl\nfloat result = sqrt(4.0);  // returns 2.0\n```",
    fmod:
      "```hlsl\nT fmod(T x, T y)\n```\nReturns the floating-point remainder of `x / y`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: dividend\n- `y`: divisor\n\n**Returns:** `T` - remainder\n\n**Example:**\n```hlsl\nfloat result = fmod(5.5, 2.0);  // returns 1.5\nfloat result = fmod(uv, 1.0);  // clamps UV to [0, 1)\n```",
    clip:
      "```hlsl\nvoid clip(float x)\nvoid clip(float2 x)\nvoid clip(float3 x)\nvoid clip(float4 x)\n```\n\nDiscards the current pixel if any component of `x` is less than 0.\n\n**Parameters:**\n- `x`: discard test value (scalar or vector)\n\n**Notes:**\n- Only valid in fragment/pixel shaders.\n- In Atom compute shaders this is typically not allowed.\n\n**Example:**\n```hlsl\nclip(alpha - cutoff);\n```",
    ddx_fine:
      "```hlsl\nT ddx_fine(T x)\n```\n\nReturns the partial derivative of `x` with respect to screen-space X, using fine derivatives.\n\n**Parameters:**\n- `x`: scalar or vector value\n\n**Returns:** `T` - derivative\n\n**Notes:**\n- Available in pixel/fragment shaders.\n- Fine derivatives may be more accurate than `ddx` but can be more expensive.",
    ddy_fine:
      "```hlsl\nT ddy_fine(T x)\n```\n\nReturns the partial derivative of `x` with respect to screen-space Y, using fine derivatives.\n\n**Parameters:**\n- `x`: scalar or vector value\n\n**Returns:** `T` - derivative\n\n**Notes:**\n- Available in pixel/fragment shaders.\n- Fine derivatives may be more accurate than `ddy` but can be more expensive.",
    rcp:
      "```hlsl\nT rcp(T x)\n```\n\nReturns an approximation of `1.0 / x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: scalar or vector\n\n**Returns:** `T` - reciprocal\n\n**Example:**\n```hlsl\nfloat inv = rcp(max(x, 1e-5));\n```",
    exp:
      "```hlsl\nT exp(T x)\n```\n\nReturns \`e\` raised to the power `x`. Component-wise for vectors.\n\n**Parameters:**\n- `x`: exponent (scalar or vector)\n\n**Returns:** `T` - e^x",
    transpose:
      "```hlsl\nfloat2x2 transpose(float2x2 m)\nfloat3x3 transpose(float3x3 m)\nfloat4x4 transpose(float4x4 m)\n```\n\nTransposes a matrix.\n\n**Parameters:**\n- `m`: input matrix\n\n**Returns:** transposed matrix",
    branch:
      "```hlsl\n[branch]\n```\n\nHint attribute for dynamic branching. Often applied to `if`/`switch` to suggest the compiler should keep a branch.\n\n**Example:**\n```hlsl\n[branch]\nif (cond) { /* ... */ }\n```",
    numthreads:
      "```hlsl\n[numthreads(uint x, uint y, uint z)]\n```\n\nCompute shader attribute that declares the number of threads per thread-group (workgroup).\n\n**Parameters:**\n- `x`: threads in X dimension\n- `y`: threads in Y dimension\n- `z`: threads in Z dimension\n\n**Example:**\n```hlsl\n[numthreads(8, 8, 1)]\nvoid MainCS(uint3 dispatch_id : SV_DispatchThreadID)\n{\n}\n```",
    mul:
      "```hlsl\nfloat4 mul(float4x4 m, float4 v)\nfloat4 mul(float4 v, float4x4 m)\nfloat3 mul(float3x3 m, float3 v)\nT mul(T a, T b)\n```\n\nPerforms matrix-vector or matrix-matrix multiplication. Also used for scalar/vector multiplication.\n\n**Overloads:**\n\n1. **Matrix × Vector**\n   ```hlsl\n   float4 mul(float4x4 m, float4 v)\n   ```\n   Multiplies matrix `m` by vector `v`.\n\n2. **Vector × Matrix**\n   ```hlsl\n   float4 mul(float4 v, float4x4 m)\n   ```\n   Multiplies vector `v` by matrix `m`.\n\n3. **General multiplication**\n   ```hlsl\n   T mul(T a, T b)\n   ```\n   Performs component-wise multiplication for scalars/vectors.\n\n**Example:**\n```hlsl\nfloat4 worldPos = mul(objectToWorld, float4(localPos, 1.0));\nfloat4 clipPos = mul(viewProjection, worldPos);\n```",
    Sample:
      "```hlsl\nfloat4 Texture2D.Sample(SamplerState s, float2 location)\nfloat4 Texture2D.Sample(SamplerState s, float2 location, int2 offset)\nfloat4 Texture2D.Sample(SamplerState s, float2 location, int2 offset, out uint status)\n```\n\nSamples a texture using the specified sampler and texture coordinates.\n\n**Parameters:**\n- `s`: sampler state (defines filtering, addressing, etc.)\n- `location`: texture coordinates (UV) in [0, 1] range\n- `offset`: optional integer offset in texels\n- `status`: optional output status (0 = success)\n\n**Returns:** `float4` - sampled color (RGBA)\n\n**Example:**\n```hlsl\nfloat4 color = texture.Sample(sampler, uv);\n```",
    SampleCmp:
      "```hlsl\nfloat4 Texture2D.SampleCmp(SamplerComparisonState s, float2 location, float compareValue)\n```\nPerforms comparison sampling (depth comparison). Used with shadow maps.\n\n**Parameters:**\n- `s`: comparison sampler state\n- `location`: texture coordinates\n- `compareValue`: comparison value\n\n**Returns:** `float4` - comparison result",
    GetDimensions:
      "```hlsl\nvoid Texture2D.GetDimensions(out uint width, out uint height)\nvoid Texture2D.GetDimensions(uint mipLevel, out uint width, out uint height)\nvoid Texture2D.GetDimensions(out uint width, out uint height, out uint numberOfLevels)\n```\n\nRetrieves the dimensions of the texture resource.\n\n**Overloads:**\n\n1. **Basic dimensions**\n   ```hlsl\n   void GetDimensions(out uint width, out uint height)\n   ```\n   Gets width and height of the texture at mip level 0.\n\n2. **With mip level**\n   ```hlsl\n   void GetDimensions(uint mipLevel, out uint width, out uint height)\n   ```\n   Gets dimensions at the specified mip level.\n\n3. **With mip count**\n   ```hlsl\n   void GetDimensions(out uint width, out uint height, out uint numberOfLevels)\n   ```\n   Gets dimensions and total number of mip levels.\n\n**Example:**\n```hlsl\nfloat2 textureSize;\ntexture.GetDimensions(textureSize.x, textureSize.y);\n```",
    Texture2D:
      "**Built-in Type: Texture2D**\n\n2D texture resource type in HLSL/AZSL. Represents a 2D texture that can be sampled in shaders.\n\n**Declaration:**\n```hlsl\nTexture2D textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float2 uv)` - Sample texture with UV coordinates\n- `SampleLevel(SamplerState s, float2 uv, float mipLevel)` - Sample at specific mip level\n- `GetDimensions(out uint width, out uint height)` - Get texture dimensions\n- `Load(int3 coord)` - Load texel directly without filtering\n\n**Usage:**\n```hlsl\nTexture2D m_baseColor;\nSamplerState m_sampler;\n\nfloat4 color = m_baseColor.Sample(m_sampler, uv);\n```\n\n**Note:** This is a built-in HLSL/AZSL type. It is defined by the shader compiler and does not have a source definition in the project.",
    Texture3D: "**Built-in Type: Texture3D**\n\n3D texture resource type in HLSL/AZSL. Represents a 3D volume texture.\n\n**Declaration:**\n```hlsl\nTexture3D textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float3 uvw)` - Sample 3D texture\n- `GetDimensions(out uint width, out uint height, out uint depth)` - Get 3D dimensions\n\n**Note:** This is a built-in HLSL/AZSL type.",
    TextureCube:
      "**Built-in Type: TextureCube**\n\nCube map texture resource type in HLSL/AZSL. Represents a cube map for environment mapping.\n\n**Declaration:**\n```hlsl\nTextureCube textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float3 direction)` - Sample cube map with direction vector\n\n**Note:** This is a built-in HLSL/AZSL type.",
    Texture2DArray:
      "**Built-in Type: Texture2DArray**\n\n2D texture array resource type in HLSL/AZSL. Represents an array of 2D textures.\n\n**Declaration:**\n```hlsl\nTexture2DArray textureName;\n```\n\n**Common Methods:**\n- `Sample(SamplerState s, float3 uvw)` - Sample array texture (uvw.z is array index)\n\n**Note:** This is a built-in HLSL/AZSL type.",
    RWTexture2D:
      "**Built-in Type: RWTexture2D**\n\nRead-write 2D texture resource type in HLSL/AZSL. Used in compute shaders for random access writes.\n\n**Declaration:**\n```hlsl\nRWTexture2D<float4> textureName;\n```\n\n**Common Methods:**\n- `[uint2 coord]` - Direct indexing operator\n- `GetDimensions(out uint width, out uint height)` - Get dimensions\n\n**Note:** This is a built-in HLSL/AZSL type.",
    SamplerState:
      "**Built-in Type: SamplerState**\n\nSampler state object in HLSL/AZSL. Defines filtering, addressing modes, and other sampling parameters.\n\n**Declaration:**\n```hlsl\nSamplerState samplerName;\n```\n\n**Usage:**\n```hlsl\nSamplerState m_sampler;\nTexture2D m_texture;\n\nfloat4 color = m_texture.Sample(m_sampler, uv);\n```\n\n**Note:** This is a built-in HLSL/AZSL type. Sampler state is typically defined in SRG (Shader Resource Group) or passed as a parameter.",
    SamplerComparisonState:
      "**Built-in Type: SamplerComparisonState**\n\nComparison sampler state in HLSL/AZSL. Used for depth comparison sampling (shadow maps).\n\n**Declaration:**\n```hlsl\nSamplerComparisonState samplerName;\n```\n\n**Usage:**\n```hlsl\nSamplerComparisonState shadowSampler;\nTexture2D shadowMap;\n\nfloat shadow = shadowMap.SampleCmp(shadowSampler, uv, depth);\n```\n\n**Note:** This is a built-in HLSL/AZSL type.",
    Sampler:
      "**Built-in Type: Sampler**\n\nAlias for `SamplerState` in HLSL/AZSL. Defines filtering, addressing modes, and other sampling parameters.\n\n**Declaration:**\n```hlsl\nSampler samplerName;\n```\n\n**Usage:**\n```hlsl\nSampler m_sampler;\nTexture2D m_texture;\n\nfloat4 color = m_texture.Sample(m_sampler, uv);\n```\n\n**Note:** This is a built-in HLSL/AZSL type. `Sampler` is typically an alias for `SamplerState`.",
    MaxAnisotropy:
      "**Sampler Property: MaxAnisotropy**\n\nMaximum anisotropy level for anisotropic filtering. Controls the quality of texture filtering when using anisotropic filtering.\n\n**Type:** `uint` or `int`\n\n**Range:** Typically 1-16\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MaxAnisotropy = 4;\n};\n```\n\n**Values:**\n- `1` - No anisotropic filtering (fastest)\n- `2-16` - Anisotropic filtering level (higher = better quality, slower)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MinFilter:
      "**Sampler Property: MinFilter**\n\nFiltering mode used when texture is minified (viewed from far away or at lower mip levels).\n\n**Type:** Filter mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MinFilter = Linear;\n};\n```\n\n**Values:**\n- `Point` - Nearest neighbor filtering (pixelated, fastest)\n- `Linear` - Bilinear filtering (smooth, standard)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MagFilter:
      "**Sampler Property: MagFilter**\n\nFiltering mode used when texture is magnified (viewed from close up or at higher mip levels).\n\n**Type:** Filter mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MagFilter = Linear;\n};\n```\n\n**Values:**\n- `Point` - Nearest neighbor filtering (pixelated, fastest)\n- `Linear` - Bilinear filtering (smooth, standard)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MipFilter:
      "**Sampler Property: MipFilter**\n\nFiltering mode used when sampling between mip levels.\n\n**Type:** Filter mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MipFilter = Linear;\n};\n```\n\n**Values:**\n- `Point` - Nearest mip level (no interpolation between mips)\n- `Linear` - Trilinear filtering (interpolates between mip levels)\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    ReductionType:
      "**Sampler Property: ReductionType**\n\nSpecifies the reduction type for texture filtering.\n\n**Type:** Reduction type enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    ReductionType = Filter;\n};\n```\n\n**Values:**\n- `Filter` - Standard filtering\n- `Comparison` - Comparison filtering (for shadow maps)\n- `Minimum` - Minimum filtering\n- `Maximum` - Maximum filtering\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    AddressU:
      "**Sampler Property: AddressU**\n\nTexture addressing mode for the U (horizontal) coordinate.\n\n**Type:** Address mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    AddressU = Wrap;\n};\n```\n\n**Values:**\n- `Wrap` - Repeats texture (tiling)\n- `Clamp` - Clamps to edge (no tiling)\n- `Mirror` - Mirrors texture at edges\n- `Border` - Uses border color for out-of-range coordinates\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    AddressV:
      "**Sampler Property: AddressV**\n\nTexture addressing mode for the V (vertical) coordinate.\n\n**Type:** Address mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    AddressV = Wrap;\n};\n```\n\n**Values:**\n- `Wrap` - Repeats texture (tiling)\n- `Clamp` - Clamps to edge (no tiling)\n- `Mirror` - Mirrors texture at edges\n- `Border` - Uses border color for out-of-range coordinates\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    AddressW:
      "**Sampler Property: AddressW**\n\nTexture addressing mode for the W (depth) coordinate (for 3D textures).\n\n**Type:** Address mode enum\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    AddressW = Wrap;\n};\n```\n\n**Values:**\n- `Wrap` - Repeats texture (tiling)\n- `Clamp` - Clamps to edge (no tiling)\n- `Mirror` - Mirrors texture at edges\n- `Border` - Uses border color for out-of-range coordinates\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MinLOD:
      "**Sampler Property: MinLOD**\n\nMinimum mip level (LOD) that can be accessed. Clamps the minimum mip level used for sampling.\n\n**Type:** `float`\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MinLOD = 0.0;\n};\n```\n\n**Range:** Typically 0.0 to maximum mip level\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    MaxLOD:
      "**Sampler Property: MaxLOD**\n\nMaximum mip level (LOD) that can be accessed. Clamps the maximum mip level used for sampling.\n\n**Type:** `float`\n\n**Usage:**\n```hlsl\nSampler m_sampler\n{\n    MaxLOD = 15.0;\n};\n```\n\n**Range:** Typically 0.0 to maximum mip level\n\n**Note:** This property is part of AZSL sampler initialization syntax.",
    Point:
      "**Filter Mode: Point**\n\nNearest neighbor filtering. Samples the nearest texel without interpolation.\n\n**Usage:**\n```hlsl\nMinFilter = Point;\nMagFilter = Point;\nMipFilter = Point;\n```\n\n**Characteristics:**\n- Fastest filtering mode\n- Pixelated appearance (no smoothing)\n- Good for pixel art or when you want sharp, crisp textures\n\n**Note:** This is a filter mode value used in sampler initialization.",
    Linear:
      "**Filter Mode: Linear**\n\nLinear interpolation filtering. Smoothly interpolates between texels.\n\n**Usage:**\n```hlsl\nMinFilter = Linear;\nMagFilter = Linear;\nMipFilter = Linear;\n```\n\n**Characteristics:**\n- Smooth, blurred appearance\n- Standard filtering mode for most textures\n- Bilinear for 2D, trilinear when combined with MipFilter = Linear\n\n**Note:** This is a filter mode value used in sampler initialization.",
    Wrap:
      "**Address Mode: Wrap**\n\nRepeats the texture (tiling). Coordinates wrap around when they exceed [0, 1].\n\n**Usage:**\n```hlsl\nAddressU = Wrap;\nAddressV = Wrap;\nAddressW = Wrap;\n```\n\n**Characteristics:**\n- Texture repeats seamlessly\n- Most common mode for tiled textures\n- UV coordinates wrap: 1.5 becomes 0.5\n\n**Note:** This is an address mode value used in sampler initialization.",
    Clamp:
      "**Address Mode: Clamp**\n\nClamps texture coordinates to the edge. Out-of-range coordinates use the edge color.\n\n**Usage:**\n```hlsl\nAddressU = Clamp;\nAddressV = Clamp;\n```\n\n**Characteristics:**\n- No tiling, texture appears once\n- Edge colors extend beyond [0, 1] range\n- Good for non-repeating textures\n\n**Note:** This is an address mode value used in sampler initialization.",
    Mirror:
      "**Address Mode: Mirror**\n\nMirrors the texture at edges. Texture flips when coordinates exceed [0, 1].\n\n**Usage:**\n```hlsl\nAddressU = Mirror;\nAddressV = Mirror;\n```\n\n**Characteristics:**\n- Texture mirrors at boundaries\n- Creates seamless tiling with mirrored pattern\n- Less common than Wrap or Clamp\n\n**Note:** This is an address mode value used in sampler initialization.",
    Border:
      "**Address Mode: Border**\n\nUses a border color for out-of-range coordinates.\n\n**Usage:**\n```hlsl\nAddressU = Border;\nAddressV = Border;\n```\n\n**Characteristics:**\n- Out-of-range coordinates use border color (typically black)\n- Useful for special effects\n- Less common than other modes\n\n**Note:** This is an address mode value used in sampler initialization.",
    Filter:
      "**Reduction Type: Filter**\n\nStandard filtering reduction type. Used for normal texture sampling.\n\n**Usage:**\n```hlsl\nReductionType = Filter;\n```\n\n**Note:** This is a reduction type value used in sampler initialization.",
    StructuredBuffer:
      "**Built-in Type: StructuredBuffer<T>**\n\nStructured buffer resource type in HLSL/AZSL. Represents a buffer containing an array of structured data (structs).\n\n**Declaration:**\n```hlsl\nStructuredBuffer<StructType> bufferName;\n```\n\n**Common Usage:**\n```hlsl\nstruct MyStruct {\n    float3 position;\n    float4 color;\n};\n\nStructuredBuffer<MyStruct> m_instances;\n\nMyStruct instance = m_instances[index];\n```\n\n**Access:**\n- `buffer[index]` - Access element at index\n- `buffer.Load(index)` - Load element at index\n- `buffer.GetDimensions(out uint count)` - Get number of elements\n\n**Note:** This is a built-in HLSL/AZSL type. Used for reading structured data arrays in shaders.",
    Buffer:
      "**Built-in Type: Buffer<T>**\n\nBuffer resource type in HLSL/AZSL. Represents a typed buffer containing scalar or vector data.\n\n**Declaration:**\n```hlsl\nBuffer<Type> bufferName;\n```\n\n**Common Usage:**\n```hlsl\nBuffer<float4> m_colors;\nBuffer<uint> m_indices;\n\nfloat4 color = m_colors[index];\nuint idx = m_indices[i];\n```\n\n**Access:**\n- `buffer[index]` - Access element at index\n- `buffer.Load(index)` - Load element at index\n- `buffer.GetDimensions(out uint count)` - Get number of elements\n\n**Note:** This is a built-in HLSL/AZSL type. Used for reading typed data arrays in shaders."
  })
);

export const semanticDocs = new Map<string, string>(
  Object.entries({
    POSITION:
      "**Input Semantic**\n\nVertex position in object/model space. Typically `float3` or `float4`.\n\n**Usage:**\n```hlsl\nstruct VertexInput {\n    float3 m_position : POSITION;\n};\n```",
    NORMAL:
      "**Input Semantic**\n\nVertex normal vector in object space. Typically `float3`.\n\n**Usage:**\n```hlsl\nstruct VertexInput {\n    float3 m_normal : NORMAL;\n};\n```",
    TEXCOORD0:
      "**Input Semantic**\n\nFirst set of texture coordinates (UV). Typically `float2`.\n\n**Usage:**\n```hlsl\nstruct VertexInput {\n    float2 m_uv : TEXCOORD0;\n};\n```",
    TEXCOORD1: "**Input Semantic**\n\nSecond set of texture coordinates. Typically `float2`.",
    TEXCOORD2: "**Input Semantic**\n\nThird set of texture coordinates. Typically `float2`.",
    TEXCOORD3: "**Input Semantic**\n\nFourth set of texture coordinates. Typically `float2`.",
    COLOR0: "**Input Semantic**\n\nFirst vertex color. Typically `float4`.",
    COLOR1: "**Input Semantic**\n\nSecond vertex color. Typically `float4`.",
    TANGENT: "**Input Semantic**\n\nVertex tangent vector. Typically `float3` or `float4` (with handedness).",
    BINORMAL: "**Input Semantic**\n\nVertex binormal/bitangent vector. Typically `float3`.",
    BLENDINDICES: "**Input Semantic**\n\nBone indices for skinning. Typically `uint4` or `int4`.",
    BLENDWEIGHT: "**Input Semantic**\n\nBone weights for skinning. Typically `float4`.",
    SV_Position:
      "**System Value Semantic**\n\nPixel position in clip space (homogeneous coordinates). Required output from vertex shader, available as input in pixel shader.\n\n**Type:** `float4`\n\n**Usage:**\n```hlsl\nstruct VertexOutput {\n    float4 m_position : SV_Position;\n};\n```",
    SV_Target:
      "**System Value Semantic**\n\nRender target output. Used for pixel shader output to render target 0.\n\n**Type:** `float4` (RGBA)\n\n**Usage:**\n```hlsl\nfloat4 MainPS(...) : SV_Target {\n    return float4(1, 1, 1, 1);\n}\n```",
    SV_Target0: "**System Value Semantic**\n\nRender target 0 output. Same as `SV_Target`.",
    SV_Target1: "**System Value Semantic**\n\nRender target 1 output. For multiple render targets (MRT).",
    SV_Target2: "**System Value Semantic**\n\nRender target 2 output. For multiple render targets (MRT).",
    SV_Target3: "**System Value Semantic**\n\nRender target 3 output. For multiple render targets (MRT).",
    SV_Depth:
      "**System Value Semantic**\n\nDepth buffer output. Overrides depth from `SV_Position.w`.\n\n**Type:** `float`",
    SV_Coverage: "**System Value Semantic**\n\nMSAA coverage mask. Available in pixel shader.\n\n**Type:** `uint`",
    SV_InstanceID:
      "**System Value Semantic**\n\nInstance ID for instanced rendering. Available in vertex/geometry shaders.\n\n**Type:** `uint`\n\n**Usage:**\n```hlsl\nVertexOutput MainVS(VertexInput input, uint instanceId : SV_InstanceID) {\n    // Use instanceId to index per-instance data\n}\n```",
    SV_VertexID:
      "**System Value Semantic**\n\nVertex ID within the draw call. Available in vertex shader.\n\n**Type:** `uint`",
    SV_PrimitiveID:
      "**System Value Semantic**\n\nPrimitive ID. Available in geometry/pixel shaders.\n\n**Type:** `uint`",
    SV_GSInstanceID:
      "**System Value Semantic**\n\nGeometry shader instance ID. Available in geometry shader.\n\n**Type:** `uint`",
    SV_IsFrontFace:
      "**System Value Semantic**\n\nIndicates if the primitive is front-facing. Available in geometry/pixel shaders.\n\n**Type:** `bool`",
    SV_DispatchThreadID:
      "**System Value Semantic**\n\nThread ID in the dispatch call. Available in compute shader.\n\n**Type:** `uint3`",
    SV_GroupID:
      "**System Value Semantic**\n\nGroup ID within the dispatch call. Available in compute shader.\n\n**Type:** `uint3`",
    SV_GroupThreadID:
      "**System Value Semantic**\n\nThread ID within the thread group. Available in compute shader.\n\n**Type:** `uint3`",
    SV_GroupIndex:
      "**System Value Semantic**\n\nFlattened thread index within the thread group. Available in compute shader.\n\n**Type:** `uint`",
    SV_RenderTargetArrayIndex:
      "**System Value Semantic**\n\nRender target array index for layered rendering. Available in geometry/pixel shaders.\n\n**Type:** `uint`",
    SV_ViewportArrayIndex:
      "**System Value Semantic**\n\nViewport array index. Available in geometry/pixel shaders.\n\n**Type:** `uint`",
    SV_ClipDistance:
      "**System Value Semantic**\n\nClip distance array for user-defined clipping planes.\n\n**Type:** `float[N]`",
    SV_CullDistance:
      "**System Value Semantic**\n\nCull distance array for user-defined culling.\n\n**Type:** `float[N]`",
    SRG_PerDraw:
      "**SRG Semantic: Per-Draw**\n\nShader Resource Group semantic indicating that the SRG is updated per draw call. This is the most frequent update rate.\n\n**Usage:**\n```hlsl\nShaderResourceGroup MySrg : SRG_PerDraw\n{\n    float4x4 m_worldMatrix;\n    float3 m_position;\n};\n```\n\n**When to use:**\n- Data that changes for each object being drawn (e.g., world matrix, object position)\n- Instance-specific data\n- Per-object material properties\n\n**Update frequency:** Every draw call",
    SRG_PerMaterial:
      "**SRG Semantic: Per-Material**\n\nShader Resource Group semantic indicating that the SRG is updated per material. Material data is shared across all objects using the same material.\n\n**Usage:**\n```hlsl\nShaderResourceGroup MaterialSrg : SRG_PerMaterial\n{\n    float3 m_baseColor;\n    float m_roughness;\n    Texture2D m_albedo;\n    Sampler m_sampler;\n};\n```\n\n**When to use:**\n- Material properties (colors, textures, roughness, metallic, etc.)\n- Material-specific shader parameters\n- Textures and samplers used by the material\n\n**Update frequency:** When material changes (shared across objects with same material)",
    SRG_PerScene:
      "**SRG Semantic: Per-Scene**\n\nShader Resource Group semantic indicating that the SRG is updated per scene. Scene data is shared across all objects in the scene.\n\n**Usage:**\n```hlsl\nShaderResourceGroup SceneSrg : SRG_PerScene\n{\n    float3 m_ambientLight;\n    float m_time;\n};\n```\n\n**When to use:**\n- Global scene settings (ambient light, fog, etc.)\n- Scene-wide constants\n- Global time or other scene-level parameters\n\n**Update frequency:** When scene changes (shared across entire scene)",
    SRG_PerView:
      "**SRG Semantic: Per-View**\n\nShader Resource Group semantic indicating that the SRG is updated per view/camera. View data is shared across all objects visible in the view.\n\n**Usage:**\n```hlsl\nShaderResourceGroup ViewSrg : SRG_PerView\n{\n    float4x4 m_viewProjectionMatrix;\n    float3 m_cameraPosition;\n};\n```\n\n**When to use:**\n- Camera/view matrices (view, projection, view-projection)\n- Camera position and direction\n- View-specific settings (FOV, near/far planes, etc.)\n\n**Update frequency:** When view/camera changes (shared across all objects in view)"
  })
);

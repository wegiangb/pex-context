// TODO: get rid of Ramda
const log = require('debug')('context')
// const viz = require('viz.js')
const isBrowser = require('is-browser')
const createGL = require('pex-gl')
const assert = require('assert')
const createTexture = require('./texture')
const createFramebuffer = require('./framebuffer')
const createRenderbuffer = require('./renderbuffer')
const createPass = require('./pass')
const createPipeline = require('./pipeline')
const createProgram = require('./program')
const createBuffer = require('./buffer')
const createQuery = require('./query')
const raf = require('raf')
const checkProps = require('./check-props')

let ID = 0

const allowedCommandProps = [
  'name',
  'pass', 'pipeline', 'uniforms',
  'attributes', 'indices', 'count', 'instances',
  'viewport', 'scissor'
]

function createContext (opts) {
  assert(!opts || (typeof opts === 'object'), 'pex-context: createContext requires opts argument to be null or an object')
  let gl = null

  const defaultOpts = {
    pixelRatio: 1
  }

  opts = Object.assign({}, defaultOpts, opts)

  if (opts.pixelRatio) {
    opts = Object.assign(opts, {
      pixelRatio: Math.min(opts.pixelRatio, window.devicePixelRatio)
    })
  }

  if (!opts || !opts.gl) gl = createGL(opts)
  else if (opts && opts.gl) gl = opts.gl
  assert(gl, 'pex-context: createContext failed')

  const capabilities = {
    maxColorAttachments: 1,
    maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    maxVertexTextureImageUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
    instancedArrays: false,
    instancing: false, // TODO: deprecate
    elementIndexUint32: !!gl.getExtension('OES_element_index_uint'),
    standardDerivatives: !!gl.getExtension('OES_standard_derivatives'),
    depthTexture: !!gl.getExtension('WEBGL_depth_texture'),
    shaderTextureLod: !!gl.getExtension('EXT_shader_texture_lod'),
    textureFloat: !!gl.getExtension('OES_texture_float'),
    textureFloatLinear: !!gl.getExtension('OES_texture_float_linear'),
    textureHalfFloat: !!gl.getExtension('OES_texture_half_float'),
    textureHalfFloatLinear: !!gl.getExtension('OES_texture_half_float_linear'),
    textureFilterAnisotropic: !!gl.getExtension('EXT_texture_filter_anisotropic')
  }

  if (!gl.HALF_FLOAT) {
    const ext = gl.getExtension('OES_texture_half_float')
    if (ext) {
      gl.HALF_FLOAT = ext.HALF_FLOAT_OES
    }
  }

  if (!gl.createQuery) {
    const ext = gl.getExtension('EXT_disjoint_timer_query')
    if (!ext) {
      gl.TIME_ELAPSED = 'TIME_ELAPSED'
      gl.QUERY_RESULT_AVAILABLE = 'QUERY_RESULT_AVAILABLE'
      gl.GPU_DISJOINT = 'GPU_DISJOINT'
      gl.QUERY_RESULT = 'QUERY_RESULT'
      gl.createQuery = function () { return {} }
      gl.deleteQuery = function () { }
      gl.beginQuery = function () { }
      gl.endQuery = function () { }
      gl.getQueryObject = function (q, param) {
        if (param === gl.QUERY_RESULT_AVAILABLE) return true
        if (param === gl.QUERY_RESULT) return 0
        return undefined
      }
    } else {
      gl.TIME_ELAPSED = ext.TIME_ELAPSED_EXT
      gl.QUERY_RESULT_AVAILABLE = ext.QUERY_RESULT_AVAILABLE_EXT
      gl.GPU_DISJOINT = ext.GPU_DISJOINT_EXT
      gl.QUERY_RESULT = ext.QUERY_RESULT_EXT
      gl.createQuery = ext.createQueryEXT.bind(ext)
      gl.deleteQuery = ext.deleteQueryEXT.bind(ext)
      gl.beginQuery = ext.beginQueryEXT.bind(ext)
      gl.endQuery = ext.endQueryEXT.bind(ext)
      gl.getQueryObject = ext.getQueryObjectEXT.bind(ext)
    }
  }

  const BlendFactor = {
    One: gl.ONE,
    Zero: gl.ZERO,
    SrcAlpha: gl.SRC_ALPHA,
    OneMinusSrcAlpha: gl.ONE_MINUS_SRC_ALPHA,
    DstAlpha: gl.DST_ALPHA,
    OneMinusDstAlpha: gl.ONE_MINUS_DST_ALPHA,
    SrcColor: gl.SRC_COLOR,
    OneMinusSrcColor: gl.ONE_MINUS_SRC_COLOR,
    DstColor: gl.DST_COLOR,
    OneMinusDstColor: gl.ONE_MINUS_DST_COLOR
  }

  const CubemapFace = {
    PositiveX: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    NegativeX: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
    PositiveY: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
    NegativeY: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
    PositiveZ: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
    NegativeZ: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
  }

  const DepthFunc = {
    Never: gl.NEVER,
    Less: gl.LESS,
    Equal: gl.EQUAL,
    LessEqual: gl.LEQUAL,
    Greater: gl.GREATER,
    NotEqual: gl.NOTEQUAL,
    GreaterEqual: gl.GEQUAL,
    Always: gl.ALWAYS
  }

  const DataType = {
    Float32: gl.FLOAT,
    Uint8: gl.UNSIGNED_BYTE,
    Uint16: gl.UNSIGNED_SHORT,
    Uint32: gl.UNSIGNED_INT
  }

  const Face = {
    Front: gl.FRONT,
    Back: gl.BACK,
    FrontAndBack: gl.FRONT_AND_BACK
  }

  const Filter = {
    Nearest: gl.NEAREST,
    Linear: gl.LINEAR,
    NearestMipmapNearest: gl.NEAREST_MIPMAP_NEAREST,
    NearestMipmapLinear: gl.NEAREST_MIPMAP_LINEAR,
    LinearMipmapNearest: gl.LINEAR_MIPMAP_NEAREST,
    LinearMipmapLinear: gl.LINEAR_MIPMAP_LINEAR
  }

  const PixelFormat = {
    RGBA8: 'rgba8', // gl.RGBA + gl.UNSIGNED_BYTE
    RGBA32F: 'rgba32f', // gl.RGBA + gl.FLOAT
    RGBA16F: 'rgba16f', // gl.RGBA + gl.HALF_FLOAT
    R32F: 'r32f', // gl.ALPHA + gl.FLOAT
    R16F: 'r16f', // gl.ALPHA + gl.HALF_FLOAT
    Depth: 'depth', // gl.DEPTH_COMPONENT
    Depth16: 'depth16' // gl.DEPTH_COMPONENT16, renderbuffer only
  }

  const Encoding = {
    Linear: 1,
    Gamma: 2,
    SRGB: 3,
    RGBM: 4
  }

  const Primitive = {
    Points: gl.POINTS,
    Lines: gl.LINES,
    LineStrip: gl.LINE_STRIP,
    Triangles: gl.TRIANGLES,
    TriangleStrip: gl.TRIANGLE_STRIP
  }

  const Usage = {
    StaticDraw: gl.STATIC_DRAW,
    DynamicDraw: gl.DYNAMIC_DRAW,
    StreamDraw: gl.STREAM_DRAW
  }

  const Wrap = {
    ClampToEdge: gl.CLAMP_TO_EDGE,
    Repeat: gl.REPEAT
  }

  const QueryTarget = {
    TimeElapsed: gl.TIME_ELAPSED
  }

  const QueryState = {
    Ready: 'ready',
    Active: 'active',
    Pending: 'pending'
  }

  const ctx = {
    gl: gl,
    BlendFactor: BlendFactor,
    CubemapFace: CubemapFace,
    DataType: DataType,
    DepthFunc: DepthFunc,
    Face: Face,
    Filter: Filter,
    PixelFormat: PixelFormat,
    Encoding: Encoding,
    Primitive: Primitive,
    Usage: Usage,
    Wrap: Wrap,
    QueryTarget: QueryTarget,
    QueryState: QueryState
  }

  const defaultState = {
    pass: {
      framebuffer: {
        target: gl.FRAMEBUFFER,
        handle: null,
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight
      },
      clearColor: [0, 0, 0, 1],
      clearDepth: 1
    },
    pipeline: createPipeline(ctx, {}),
    viewport: [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight],
    scissor: null,
    count: 0
  }

  // extensions
  if (!gl.drawElementsInstanced) {
    const ext = gl.getExtension('ANGLE_instanced_arrays')
    if (!ext) {
      // TODO: this._caps[CAPS_INSTANCED_ARRAYS] = false;
      gl.drawElementsInstanced = function () {
        throw new Error('gl.drawElementsInstanced not available. ANGLE_instanced_arrays not supported')
      }
      gl.drawArraysInstanced = function () {
        throw new Error('gl.drawArraysInstanced not available. ANGLE_instanced_arrays not supported')
      }
      gl.vertexAttribDivisor = function () {
        throw new Error('gl.vertexAttribDivisor not available. ANGLE_instanced_arrays not supported')
      }
    } else {
      // TODO: this._caps[CAPS_INSTANCED_ARRAYS] = true;
      gl.drawElementsInstanced = ext.drawElementsInstancedANGLE.bind(ext)
      gl.drawArraysInstanced = ext.drawArraysInstancedANGLE.bind(ext)
      gl.vertexAttribDivisor = ext.vertexAttribDivisorANGLE.bind(ext)
      capabilities.instancedArrays = true
      capabilities.instancing = true // TODO: deprecate
    }
  } else {
    capabilities.instancedArrays = true
    capabilities.instancing = true // TODO: deprecate
  }

  if (!gl.drawBuffers) {
    const ext = gl.getExtension('WEBGL_draw_buffers')
    if (!ext) {
      gl.drawBuffers = function () {
        throw new Error('WEBGL_draw_buffers not supported')
      }
    } else {
      gl.drawBuffers = ext.drawBuffersWEBGL.bind(ext)
      capabilities.maxColorAttachments = gl.getParameter(ext.MAX_COLOR_ATTACHMENTS_WEBGL)
    }
  } else {
    capabilities.maxColorAttachments = gl.getParameter('MAX_COLOR_ATTACHMENTS')
  }

  log('capabilities', capabilities)

  Object.assign(ctx, {
    debugMode: false,
    capabilities: capabilities,
    // debugGraph: '',
    debugCommands: [],
    resources: [],
    stats: [],
    queries: [],
    stack: [ defaultState ],
    defaultState: defaultState,
    pixelRatio: opts.pixelRatio || 1,
    state: {
      pass: {
        framebuffer: defaultState.pass.framebuffer
      },
      pipeline: createPipeline(ctx, {}),
      activeTextures: [],
      activeAttributes: []
    },
    getGLString: function (glEnum) {
      let str = ''
      for (let key in gl) {
        if ((gl[key] === glEnum)) str = key
      }
      if (!str) {
        str = 'UNDEFINED'
      }
      return str
    },
    set: function (opts) {
      assert(isBrowser, 'changing resolution is not supported in Plask')
      if (opts.pixelRatio) {
        this.updatePixelRatio = Math.min(opts.pixelRatio, window.devicePixelRatio)
      }

      if (opts.width) {
        this.updateWidth = opts.width
      }

      if (opts.height) {
        this.updateHeight = opts.height
      }
    },
    debug: function (enabled) {
      this.debugMode = enabled
      // if (enabled) {
        // this.debuggraph = ''
        // this.debugCommands = []
        // if (isBrowser) {
          // window.R = R
          // window.commands = this.debugCommands
        // }
        // this.debugGraph = ''
        // this.debugGraph += 'digraph frame {\n'
        // this.debugGraph += 'size="6,12";\n'
        // this.debugGraph += 'rankdir="LR"\n'
        // this.debugGraph += 'node [shape=record];\n'
        // if (this.debugMode) {
          // const res = this.resources.map((res) => {
      // return { id: res.id, type: res.id.split('_')[0] }
          // })
          // const groups = R.groupBy(R.prop('type'), res)
          // Object.keys(groups).forEach((g) => {
            // this.debugGraph += `subgraph cluster_${g} { \n`
            // this.debugGraph += `label = "${g}s" \n`
            // groups[g].forEach((res) => {
              // this.debugGraph += `${res.id} [style=filled fillcolor = "#DDDDFF"] \n`
            // })
            // this.debugGraph += `} \n`
          // })
        // }
      // } else {
        // if (this.debugGraph) {
          // this.debugGraph += 'edge  [style=bold, fontname="Arial", weight=100]\n'
          // this.debugCommands.forEach((cmd, i, commands) => {
            // if (i > 0) {
              // const prevCmd = commands[i - 1]
              // this.debugGraph += `${prevCmd.name || prevCmd.id} -> ${cmd.name || cmd.id}\n`
            // }
          // })
          // this.debugGraph += '}'
          // // log(this.debugGraph)
          // // const div = document.createElement('div')
          // // div.innerHTML = viz(this.debugGraph)
          // // div.style.position = 'absolute'
          // // div.style.top = '0'
          // // div.style.left = '0'
          // // div.style.transformOrigin = '0 0'
          // // div.style.transform = 'scale(0.75, 0.75)'
          // // document.body.appendChild(div)
        // }
      // }
    },
    checkError: function () {
      if (this.debugMode) {
        var error = gl.getError()
        if (error) {
          this.debugMode = false // prevents rolling errors
          if (isBrowser) log('State', this.state.state)
          throw new Error(`GL error ${error} : ${this.getGLString(error)}`)
        }
      }
    },
    resource: function (res) {
      res.id = res.class + '_' + ID++
      if (!this.stats[res.class]) {
        this.stats[res.class] = { alive: 0, total: 0 }
      }
      this.stats[res.class].alive++
      this.stats[res.class].total++
      this.resources.push(res)
      this.checkError()
      return res
    },
    // texture2D({ data: TypedArray, width: Int, height: Int, format: PixelFormat, flipY: Boolean })
    texture2D: function (opts) {
      log('texture2D', opts)
      opts.target = gl.TEXTURE_2D
      return this.resource(createTexture(this, opts))
    },
    // textureCube({ data: [negxData, negyData,...], width: Int, height: Int, format: PixelFormat, flipY: Boolean })
    textureCube: function (opts) {
      log('textureCube', opts)
      opts.target = gl.TEXTURE_CUBE_MAP
      return this.resource(createTexture(this, opts))
    },
    // framebuffer({ color: [ Texture2D, .. ], depth: Texture2D }
    // framebuffer({ color: [ { texture: Texture2D, target: Enum, level: int }, .. ], depth: { texture: Texture2D }})
    framebuffer: function (opts) {
      log('framebuffer', opts)
      return this.resource(createFramebuffer(this, opts))
    },
    // renderbuffer({ width: int, height: int })
    renderbuffer: function (opts) {
      log('renderbuffer', opts)
      return this.resource(createRenderbuffer(this, opts))
    },
    // TODO: Should we have named versions or generic 'ctx.buffer' command?
    // In regl buffer() is ARRAY_BUFFER (aka VertexBuffer) and elements() is ELEMENT_ARRAY_BUFFER
    // Now in WebGL2 we get more types Uniform, TransformFeedback, Copy
    // Possible options: {
    //    data: Array or ArrayBuffer
    //    type: 'float', 'uint16' etc
    // }
    vertexBuffer: function (opts) {
      log('vertexBuffer', opts)
      if (opts.length) {
        opts = { data: opts }
      }
      opts.target = gl.ARRAY_BUFFER
      return this.resource(createBuffer(this, opts))
    },
    indexBuffer: function (opts) {
      log('indexBuffer', opts)
      if (opts.length) {
        opts = { data: opts }
      }
      opts.target = gl.ELEMENT_ARRAY_BUFFER
      return this.resource(createBuffer(this, opts))
    },
    program: function (opts) {
      log('program', opts)
      return this.resource(createProgram(this, opts))
    },
    pipeline: function (opts) {
      log('pipeline', opts)
      return this.resource(createPipeline(this, opts))
    },
    pass: function (opts) {
      log('pass', opts, opts.color ? opts.color.map((c) => c.texture ? c.texture.info : c.info) : '')
      return this.resource(createPass(this, opts))
    },
    query: function (opts) {
      log('query', opts)
      return this.resource(createQuery(this, opts))
    },
    beginQuery: function (q) {
      assert(!this.activeQuery, 'Only one query can be active at the time')
      if (q._begin(this, q)) {
        this.activeQuery = q
      }
    },
    endQuery: function (q) {
      if (q._end(this, q)) {
        this.queries.push(q)
        this.activeQuery = null
      }
    },
    readPixels: function (opts) {
      const x = opts.x || 0
      const y = opts.y || 0
      const width = opts.width
      const height = opts.height
      const format = gl.RGBA
      const type = gl.UNSIGNED_BYTE
      let pixels = null
      pixels = new Uint8Array(width * height * 4)
      gl.readPixels(x, y, width, height, format, type, pixels)
      return pixels
    },
    // update(texture, { data: TypeArray, [width: Int, height: Int] })
    // update(texture, { data: TypedArray })
    update: function (resource, opts) {
      if (this.debugMode) log('update', { resource: resource, opts: opts })
      resource._update(this, resource, opts)
    },
    // TODO: i don't like this inherit flag
    mergeCommands: function (parent, cmd, inherit) {
      // copy old state so we don't modify it's internals
      const newCmd = Object.assign({}, parent)

      if (!inherit) {
        // clear values are not merged as they are applied only in the parent command
        newCmd.pass = Object.assign({}, parent.pass)
        newCmd.pass.clearColor = undefined
        newCmd.pass.clearDepth = undefined
      }

      // overwrite properties from new command
      Object.assign(newCmd, cmd)

      // set viewport to FBO sizes when rendering to a texture
      if (!cmd.viewport && cmd.pass && cmd.pass.opts.color) {
        let tex = null
        if (cmd.pass.opts.color[0]) tex = cmd.pass.opts.color[0].texture || cmd.pass.opts.color[0]
        if (cmd.pass.opts.depth) tex = cmd.pass.opts.depth.texture || cmd.pass.opts.depth
        if (tex) {
          newCmd.viewport = [0, 0, tex.width, tex.height]
        }
      }

      // merge uniforms
      newCmd.uniforms = (parent.uniforms || cmd.uniforms) ? Object.assign({}, parent.uniforms, cmd.uniforms) : null
      return newCmd
    },
    applyPass: function (pass) {
      const gl = this.gl
      const state = this.state

      // if (pass.framebuffer !== state.framebuffer) {
      if (state.pass.id !== pass.id) {
        if (this.debugMode) log('change framebuffer', state.pass.framebuffer, '->', pass.framebuffer)
        state.pass = pass
        if (pass.framebuffer._update) {
          // rebind pass' color and depth to shared FBO
          this.update(pass.framebuffer, pass.opts)
        }
        gl.bindFramebuffer(pass.framebuffer.target, pass.framebuffer.handle)
        if (pass.framebuffer.drawBuffers && pass.framebuffer.drawBuffers.length > 1) {
          gl.drawBuffers(pass.framebuffer.drawBuffers)
        }
      }

      let clearBits = 0
      if (pass.clearColor !== undefined) {
        if (this.debugMode) log('clearing color', pass.clearColor)
        clearBits |= gl.COLOR_BUFFER_BIT
        // TODO this might be unnecesary but we don't know because we don't store the clearColor in state
        gl.clearColor(pass.clearColor[0], pass.clearColor[1], pass.clearColor[2], pass.clearColor[3])
      }

      if (pass.clearDepth !== undefined) {
        if (this.debugMode) log('clearing depth', pass.clearDepth)
        clearBits |= gl.DEPTH_BUFFER_BIT

        if (!state.depthWrite) {
          state.depthWrite = true
          gl.depthMask(true)
        }
        // TODO this might be unnecesary but we don't know because we don't store the clearDepth in state
        gl.clearDepth(pass.clearDepth)
      }

      if (clearBits) {
        gl.clear(clearBits)
      }
      this.checkError()
    },
    applyPipeline: function (pipeline) {
      const gl = this.gl
      const state = this.state

      if (pipeline.depthWrite !== state.depthWrite) {
        state.depthWrite = pipeline.depthWrite
        gl.depthMask(state.depthWrite)
      }

      if (pipeline.depthTest !== state.depthTest) {
        state.depthTest = pipeline.depthTest
        state.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST)
      }

      if (pipeline.depthFunc !== state.depthFunc) {
        state.depthFunc = pipeline.depthFunc
        gl.depthFunc(state.depthFunc)
      }

      if (pipeline.blend !== state.blend ||
        pipeline.blendSrcRGBFactor !== state.blendSrcRGBFactor ||
        pipeline.blendSrcAlphaFactor !== state.blendSrcAlphaFactor ||
        pipeline.blendDstRGBFactor !== state.blendDstRGBFactor ||
        pipeline.blendDstAlphaFactor !== state.blendDstAlphaFactor) {
        state.blend = pipeline.blend
        state.blendSrcRGBFactor = pipeline.blendSrcRGBFactor
        state.blendSrcAlphaFactor = pipeline.blendSrcAlphaFactor
        state.blendDstRGBFactor = pipeline.blendDstRGBFactor
        state.blendDstAlphaFactor = pipeline.blendDstAlphaFactor
        state.blend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND)
        gl.blendFuncSeparate(
          state.blendSrcRGBFactor,
          state.blendDstRGBFactor,
          state.blendSrcAlphaFactor,
          state.blendDstAlphaFactor
        )
      }

      if (pipeline.cullFace !== state.cullFace || pipeline.cullFaceMode !== state.cullFaceMode) {
        state.cullFace = pipeline.cullFace
        state.cullFaceMode = pipeline.cullFaceMode
        state.cullFace ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE)
        if (state.cullFace) {
          gl.cullFace(state.cullFaceMode)
        }
      }
      if (pipeline.colorMask[0] !== state.pipeline.colorMask[0] ||
          pipeline.colorMask[1] !== state.pipeline.colorMask[1] ||
          pipeline.colorMask[2] !== state.pipeline.colorMask[2] ||
          pipeline.colorMask[3] !== state.pipeline.colorMask[3]) {
        state.pipeline.colorMask[0] = pipeline.colorMask[0]
        state.pipeline.colorMask[1] = pipeline.colorMask[1]
        state.pipeline.colorMask[2] = pipeline.colorMask[2]
        state.pipeline.colorMask[3] = pipeline.colorMask[3]
        gl.colorMask(pipeline.colorMask[0], pipeline.colorMask[1], pipeline.colorMask[2], pipeline.colorMask[3])
      }

      if (pipeline.program !== state.program) {
        state.program = pipeline.program
        if (state.program) {
          gl.useProgram(state.program.handle)
        }
      }

      if (pipeline.vertexLayout) {
        state.vertexLayout = pipeline.vertexLayout
      }
      this.checkError()
    },
    applyUniforms: function (uniforms, cmd) {
      const gl = this.gl
      const state = this.state
      let numTextures = 0

      if (!state.program) {
        assert.fail('Trying to draw without an active program')
      }

      const requiredUniforms = this.debugMode ? Object.keys(state.program.uniforms) : null

      for (var name in uniforms) {
        let value = uniforms[name]
        // TODO: find a better way to not trying to set unused uniforms that might have been inherited
        if (!state.program.uniforms[name] && !state.program.uniforms[name + '[0]']) {
          continue
        }
        if (value === null || value === undefined) {
          log('invalid command', cmd)
          assert.fail(`Can't set uniform "${name}" with a null value`)
        }
        // FIXME: uniform array hack
        if (Array.isArray(value) && !state.program.uniforms[name]) {
          if (this.debugMode) log('unknown uniform', name, Object.keys(state.program.uniforms))
          for (var i = 0; i < value.length; i++) {
            var nameIndex = name + '[' + i + ']'
            state.program.setUniform(nameIndex, value[i])
            if (this.debugMode) {
              requiredUniforms.splice(requiredUniforms.indexOf(nameIndex), 1)
            }
          }
        } else if (value.target) { // assuming texture
          // FIXME: texture binding hack
          const slot = numTextures++
          gl.activeTexture(gl.TEXTURE0 + slot)
          if (state.activeTextures[slot] !== value) {
            gl.bindTexture(value.target, value.handle)
            state.activeTextures[slot] = value
          }
          state.program.setUniform(name, slot)
          if (this.debugMode) {
            requiredUniforms.splice(requiredUniforms.indexOf(name), 1)
          }
        } else if (!value.length && typeof value === 'object') {
          log('invalid command', cmd)
          assert.fail(`Can set uniform "${name}" with an Object value`)
        } else {
          state.program.setUniform(name, value)
          if (this.debugMode) {
            requiredUniforms.splice(requiredUniforms.indexOf(name), 1)
          }
        }
      }
      if (this.debugMode && requiredUniforms.length > 0) {
        log('invalid command', cmd)
        assert.fail(`Trying to draw with missing uniforms: ${requiredUniforms.join(', ')}`)
      }
      this.checkError()
    },
    drawVertexData: function (cmd) {
      const state = this.state
      const vertexLayout = state.vertexLayout

      if (!state.program) {
        assert.fail('Trying to draw without an active program')
      }

      if (this.debugMode) {
        // TODO: can vertex layout be ever different if it's derived from pipeline's shader?
        if (vertexLayout.length !== Object.keys(state.program.attributes).length) {
          log('Invalid vertex layout not matching the shader', vertexLayout, state.program.attributes, cmd)
          assert.fail('Invalid vertex layout not matching the shader')
        }
      }

      let instanced = false
      // TODO: disable unused vertex array slots
      for (let i = 0; i < 16; i++) {
        state.activeAttributes[i] = null
        gl.disableVertexAttribArray(i)
      }

      // TODO: the same as i support [tex] and { texture: tex } i should support buffers in attributes?
      for (let i = 0; i < vertexLayout.length; i++) {
        const layout = vertexLayout[i]
        const name = layout[0]
        const location = layout[1]
        const size = layout[2]
        const attrib = cmd.attributes[i] || cmd.attributes[name]

        if (!attrib) {
          log('Invalid command', cmd, 'doesn\'t satisfy vertex layout', vertexLayout)
          assert.fail(`Command is missing attribute "${name}" at location ${location} with ${attrib}`)
        }

        let buffer = attrib.buffer
        if (!buffer && attrib.class === 'vertexBuffer') {
          buffer = attrib
        }

        if (!buffer || !buffer.target) {
          log('Invalid command', cmd)
          assert.fail(`Trying to draw arrays with invalid buffer for attribute : ${name}`)
        }

        gl.bindBuffer(buffer.target, buffer.handle)
        if (size === 16) {
          gl.enableVertexAttribArray(location + 0)
          gl.enableVertexAttribArray(location + 1)
          gl.enableVertexAttribArray(location + 2)
          gl.enableVertexAttribArray(location + 3)
          state.activeAttributes[location + 0] = buffer
          state.activeAttributes[location + 1] = buffer
          state.activeAttributes[location + 2] = buffer
          state.activeAttributes[location + 3] = buffer
          // we still check for buffer type because while e.g. pex-renderer would copy buffer type to attrib
          // a raw pex-context example probably would not
          gl.vertexAttribPointer(location, 4, attrib.type || buffer.type, attrib.normalized || false, attrib.stride || 64, attrib.offset || 0)
          gl.vertexAttribPointer(location + 1, 4, attrib.type || buffer.type, attrib.normalized || false, attrib.stride || 64, attrib.offset || 16)
          gl.vertexAttribPointer(location + 2, 4, attrib.type || buffer.type, attrib.normalized || false, attrib.stride || 64, attrib.offset || 32)
          gl.vertexAttribPointer(location + 3, 4, attrib.type || buffer.type, attrib.normalized || false, attrib.stride || 64, attrib.offset || 48)
          if (attrib.divisor) {
            gl.vertexAttribDivisor(location + 0, attrib.divisor)
            gl.vertexAttribDivisor(location + 1, attrib.divisor)
            gl.vertexAttribDivisor(location + 2, attrib.divisor)
            gl.vertexAttribDivisor(location + 3, attrib.divisor)
            instanced = true
          } else if (capabilities.instancing) {
            gl.vertexAttribDivisor(location + 0, 0)
            gl.vertexAttribDivisor(location + 1, 0)
            gl.vertexAttribDivisor(location + 2, 0)
            gl.vertexAttribDivisor(location + 3, 0)
          }
        } else {
          gl.enableVertexAttribArray(location)
          state.activeAttributes[location] = buffer
          gl.vertexAttribPointer(
            location,
            size,
            attrib.type || buffer.type,
            attrib.normalized || false,
            attrib.stride || 0,
            attrib.offset || 0
          )
          if (attrib.divisor) {
            gl.vertexAttribDivisor(location, attrib.divisor)
            instanced = true
          } else if (capabilities.instancing) {
            gl.vertexAttribDivisor(location, 0)
          }
        }
        // TODO: how to match index with vertexLayout location?
      }

      let primitive = cmd.pipeline.primitive
      if (cmd.indices) {
        let indexBuffer = cmd.indices.buffer
        if (!indexBuffer && cmd.indices.class === 'indexBuffer') {
          indexBuffer = cmd.indices
        }
        if (!indexBuffer || !indexBuffer.target) {
          log('Invalid command', cmd)
          assert.fail(`Trying to draw arrays with invalid buffer for elements`)
        }
        state.indexBuffer = indexBuffer
        gl.bindBuffer(indexBuffer.target, indexBuffer.handle)
        var count = cmd.indices.count || indexBuffer.length
        var offset = cmd.indices.offset || 0
        var type = cmd.indices.type || indexBuffer.type
        if (instanced) {
          // TODO: check if instancing available
          gl.drawElementsInstanced(primitive, count, type, offset, cmd.instances)
        } else {
          gl.drawElements(primitive, count, type, offset)
        }
      } else if (cmd.count) {
        const first = 0
        if (instanced) {
          gl.drawArraysInstanced(primitive, first, cmd.count, cmd.instances)
        } else {
          gl.drawArrays(primitive, first, cmd.count)
        }
      } else {
        assert.fail('Vertex arrays requres elements or count to draw')
      }
      // if (self.debugMode) {
      // var error = gl.getError()
      // cmd.error = { code: error, msg: self.getGLString(error) }
      // if (error) {
      // self.debugCommands.push(cmd)
      // throw new Error(`WebGL error ${error} : ${self.getGLString(error)}`)
      // }
      // log('draw elements', count, error)
      // }
      this.checkError()
    },
    frame: function (cb) {
      const self = this
      raf(function frame () {
        if (self.updatePixelRatio) {
          self.pixelRatio = self.updatePixelRatio
          // we need to reaply width/height and update styles
          if (!self.updateWidth) {
            self.updateWidth = parseInt(gl.canvas.style.width) || gl.canvas.width
          }
          if (!self.updateHeight) {
            self.updateHeight = parseInt(gl.canvas.style.height) || gl.canvas.height
          }
          self.updatePixelRatio = 0
        }
        if (self.updateWidth) {
          gl.canvas.style.width = self.updateWidth + 'px'
          gl.canvas.width = self.updateWidth * self.pixelRatio
          self.updateWidth = 0
        }
        if (self.updateHeight) {
          gl.canvas.style.height = self.updateHeight + 'px'
          gl.canvas.height = self.updateHeight * self.pixelRatio
          self.updateHeight = 0
        }
        if (self.defaultState.viewport[2] !== gl.drawingBufferWidth ||
          self.defaultState.viewport[3] !== gl.drawingBufferHeight) {
          self.defaultState.viewport[2] = gl.drawingBufferWidth
          self.defaultState.viewport[3] = gl.drawingBufferHeight
          self.defaultState.pass.framebuffer.width = gl.drawingBufferWidth
          self.defaultState.pass.framebuffer.height = gl.drawingBufferHeight
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
        }
        if (cb() === false) {
          // interrupt render loop
          return
        }
        if (self.queries.length) {
          self.queries = self.queries.filter((q) => !q._available(self, q))
        }
        raf(frame)
      })
    },
    // TODO: switching to lightweight resources would allow to just clone state
    // and use commands as state modifiers?
    apply: function (cmd) {
      const state = this.state

      if (this.debugMode) log('apply', cmd.name || cmd.id, { cmd: cmd, state: JSON.parse(JSON.stringify(state)) })

      this.checkError()

      if (cmd.scissor) {
        if (cmd.scissor !== state.scissor) {
          state.scissor = cmd.scissor
          gl.enable(gl.SCISSOR_TEST)
          gl.scissor(state.scissor[0], state.scissor[1], state.scissor[2], state.scissor[3])
        }
      } else {
        if (cmd.scissor !== state.scissor) {
          state.scissor = cmd.scissor
          gl.disable(gl.SCISSOR_TEST)
        }
      }

      if (cmd.pass) this.applyPass(cmd.pass)
      if (cmd.pipeline) this.applyPipeline(cmd.pipeline)
      if (cmd.uniforms) this.applyUniforms(cmd.uniforms)

      if (cmd.viewport) {
        if (cmd.viewport !== state.viewport) {
          state.viewport = cmd.viewport
          gl.viewport(state.viewport[0], state.viewport[1], state.viewport[2], state.viewport[3])
        }
      }

      if (cmd.attributes) {
        this.drawVertexData(cmd)
      }
    },
    submit: function (cmd, batches, subCommand) {
      if (this.debugMode) {
        this.debugCommands.push(cmd)
        checkProps(allowedCommandProps, cmd)
        if (batches && subCommand) log('submit', cmd.name || cmd.id, { depth: this.stack.length, cmd: cmd, batches: batches, subCommand: subCommand, state: this.state, stack: this.stack })
        else if (batches) log('submit', cmd.name || cmd.id, { depth: this.stack.length, cmd: cmd, batches: batches, state: this.state, stack: this.stack })
        else log('submit', cmd.name || cmd.id, { depth: this.stack.length, cmd: cmd, state: this.state, stack: this.stack })
      }

      if (batches) {
        if (Array.isArray(batches)) {
          // TODO: quick hack
          batches.forEach((batch) => this.submit(this.mergeCommands(cmd, batch, true), subCommand))
          return
        } else if (typeof batches === 'object') {
          this.submit(this.mergeCommands(cmd, batches, true), subCommand)
          return
        } else {
          subCommand = batches // shift argument
        }
      }

      const parentState = this.stack[this.stack.length - 1]
      const cmdState = this.mergeCommands(parentState, cmd, false)
      this.apply(cmdState)
      if (subCommand) {
        if (this.debugMode) {
          this.debugGraph += `subgraph cluster_${cmd.name || cmd.id} {\n`
          this.debugGraph += `label = "${cmd.name}"\n`
          if (cmd.program) {
            this.debugGraph += `${cmd.program.id} -> cluster_${cmd.name || cmd.id}\n`
          }
          if (cmd.framebuffer) {
            this.debugGraph += `${cmd.framebuffer.id} -> cluster_${cmd.name || cmd.id}\n`
            cmd.framebuffer.color.forEach((attachment) => {
              this.debugGraph += `${attachment.texture.id} -> ${cmd.framebuffer.id}\n`
            })
            if (cmd.framebuffer.depth) {
              this.debugGraph += `${cmd.framebuffer.depth.texture.id} -> ${cmd.framebuffer.id}\n`
            }
          }
        }
        this.stack.push(cmdState)
        subCommand()
        this.stack.pop()
        if (this.debugMode) {
          this.debugGraph += '}\n'
        }
      } else {
        if (this.debugMode) {
          let s = `${cmd.name || cmd.id} [style=filled fillcolor = "#DDFFDD" label="`
          let cells = [cmd.name || cmd.id]
          // this.debugGraph += `cluster_${cmd.name || cmd.id} [style=filled fillcolor = "#DDFFDD"] {\n`
          // if (cmd.attributes) {
            // cells.push(' ')
            // cells.push('vertex arrays')
            // Object.keys(cmd.attributes).forEach((attribName, index) => {
              // const attrib = cmd.attributes[attribName]
              // cells.push(`<a${index}>${attribName}`)
              // this.debugGraph += `${attrib.buffer.id} -> ${cmd.name || cmd.id}:a${index}\n`
            // })
          // }
          // if (cmd.indices) {
            // cells.push(' ')
            // cells.push(`<e>elements`)
            // this.debugGraph += `${cmd.elements.buffer.id} -> ${cmd.name || cmd.id}:e\n`
          // }
          // if (cmd.program) {
            // this.debugGraph += `${cmd.program.id} -> ${cmd.name || cmd.id}\n`
          // }
          // if (cmd.framebuffer) {
            // this.debugGraph += `${cmd.framebuffer.id} -> ${cmd.name || cmd.id}\n`
            // cmd.framebuffer.color.forEach((tex) => {
              // console.log('tex', tex)
            // })
          // }
          if (cmd.uniforms) {
            cells.push(' ')
            cells.push('uniforms')
            Object.keys(cmd.uniforms).forEach((uniformName, index) => {
              cells.push(`<u${index}>${uniformName}`)
              const value = cmd.uniforms[uniformName]
              if (value === null || value === undefined) {
                log('Invalid command', cmd)
                assert.fail(`Trying to draw with uniform "${uniformName}" = null`)
              }
              if (value.id) {
                this.debugGraph += `${value.id} -> ${cmd.name || cmd.id}:u${index}\n`
              }
            })
          }
          s += cells.join('|')
          s += '"]'
          this.debugGraph += `${s}\n`
        }
      }
      this.checkError()
    },
    dispose: function (res) {
      log('dispose', res)
      assert(res || arguments.length === 0, 'Trying to dispose undefined resource')
      if (res) {
        if (!res._dispose) {
          assert(res._dispose, 'Trying to dispose non resource')
        }
        const idx = this.resources.indexOf(res)
        assert(idx !== -1, 'Trying to dispose resource from another context')
        this.resources.splice(idx, 1)
        this.stats[res.class].alive--
        res._dispose()
      } else {
        while (this.resources.length) {
          this.dispose(this.resources[0])
        }
      }
    }
  })
  ctx.apply(defaultState)
  return ctx
}

module.exports = createContext

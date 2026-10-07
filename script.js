(() => {
  "use strict";

  /* ============================================================
   *  1. ESCENA BASE
   * ============================================================ */
  const canvas = document.getElementById("escena");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.z = 11;

  /* ============================================================
   *  2. SHADERS
   *     Cada punto pertenece a un átomo (su centro está en la esfera)
   *     y órbita alrededor de ese centro en el vértice shader.
   *     Núcleo = radio 0. Electrón = radio > 0 con velocidad.
   *     Anillo de órbita = puntos fijos (velocidad 0).
   * ============================================================ */
  const vertexShader = `
    attribute vec3 aScatter;
    attribute vec3 aU;
    attribute vec3 aV;
    attribute vec4 aOrb;   // x radio, y velocidad, z fase, w semilla
    attribute float aSize;
    uniform float uSpread;
    uniform float uTime;
    uniform float uPixel;
    uniform float uAlpha;
    varying float vAlpha;
    varying float vMix;
    void main() {
      vec3 centro = mix(position, aScatter, uSpread);
      float ang = aOrb.z + uTime * aOrb.y;
      float rad = aOrb.x * (1.0 + 0.8 * uSpread);
      vec3 p = centro + rad * (cos(ang) * aU + sin(ang) * aV);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uPixel * (14.0 / -mv.z);
      vAlpha = uAlpha * (0.7 + 0.3 * sin(uTime * 2.0 + aOrb.w * 40.0));
      vMix = uSpread;
    }
  `;

  const fragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uColor2;
    varying float vAlpha;
    varying float vMix;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.05, d) * vAlpha;
      gl_FragColor = vec4(mix(uColor, uColor2, vMix * 0.7), a);
    }
  `;

  const materiales = [];

  // capa = { pos:[], sc:[], u:[], v:[], orb:[], size:[] }
  const nuevaCapa = () => ({ pos: [], sc: [], u: [], v: [], orb: [], size: [] });

  function capaAPuntos(c, color, color2, alpha) {
    const geo = new THREE.BufferGeometry();
    const f = (a) => new Float32Array(a);
    geo.setAttribute("position", new THREE.BufferAttribute(f(c.pos), 3));
    geo.setAttribute("aScatter", new THREE.BufferAttribute(f(c.sc), 3));
    geo.setAttribute("aU", new THREE.BufferAttribute(f(c.u), 3));
    geo.setAttribute("aV", new THREE.BufferAttribute(f(c.v), 3));
    geo.setAttribute("aOrb", new THREE.BufferAttribute(f(c.orb), 4));
    geo.setAttribute("aSize", new THREE.BufferAttribute(f(c.size), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSpread: { value: 0 },
        uTime: { value: 0 },
        uPixel: { value: renderer.getPixelRatio() },
        uAlpha: { value: alpha },
        uColor: { value: new THREE.Color(color) },
        uColor2: { value: new THREE.Color(color2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    materiales.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  function agregar(capa, centro, scatter, u, v, radio, vel, fase, tam) {
    capa.pos.push(centro[0], centro[1], centro[2]);
    capa.sc.push(scatter[0], scatter[1], scatter[2]);
    capa.u.push(u[0], u[1], u[2]);
    capa.v.push(v[0], v[1], v[2]);
    capa.orb.push(radio, vel, fase, Math.random());
    capa.size.push(tam);
  }

  /* ============================================================
   *  3. GENERAR LA ESFERA DE ÁTOMOS
   * ============================================================ */
  const N_ATOMOS = 520;
  const R_ESFERA = 3.2;
  const ANILLOS_POR_ATOMO = 3;
  const PUNTOS_POR_ANILLO = 18;

  const nucleos = nuevaCapa();
  const electrones = nuevaCapa();
  const orbitas = nuevaCapa();

  const cruz = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

  function baseOrbita() {
    // normal aleatoria -> dos vectores perpendiculares u, v que definen el plano
    const n = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
    const aux = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cruz(n, aux));
    const v = cruz(n, u);
    return [u, v];
  }

  const aureo = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N_ATOMOS; i++) {
    // posición del átomo en la esfera (espiral de Fibonacci)
    const y = 1 - (i / (N_ATOMOS - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = aureo * i;
    const dir = [Math.cos(th) * rr, y, Math.sin(th) * rr];
    const centro = [dir[0] * R_ESFERA, dir[1] * R_ESFERA, dir[2] * R_ESFERA];

    // al dispersar: la nube se expande en todas direcciones
    const lejos = 7 + Math.random() * 9;
    const j = () => (Math.random() - 0.5) * 3;
    const scatter = [dir[0] * lejos + j(), dir[1] * lejos + j(), dir[2] * lejos + j()];

    const u0 = [1, 0, 0], v0 = [0, 1, 0];
    agregar(nucleos, centro, scatter, u0, v0, 0, 0, 0, 4.2);

    for (let k = 0; k < ANILLOS_POR_ATOMO; k++) {
      const [u, v] = baseOrbita();
      const radio = 0.2 + Math.random() * 0.06;
      const vel = (2.2 + Math.random() * 1.8) * (Math.random() < 0.5 ? 1 : -1);
      agregar(electrones, centro, scatter, u, v, radio, vel, Math.random() * 6.283, 3.0);
      for (let p = 0; p < PUNTOS_POR_ANILLO; p++) {
        agregar(orbitas, centro, scatter, u, v, radio, 0, (p / PUNTOS_POR_ANILLO) * 6.283, 0.9);
      }
    }
  }

  const sistema = new THREE.Group();
  sistema.add(capaAPuntos(orbitas, 0x2a8fff, 0x6a5cff, 0.35));
  sistema.add(capaAPuntos(nucleos, 0xffb347, 0xff6bd6, 0.95));
  sistema.add(capaAPuntos(electrones, 0x4de8ff, 0xb9fff4, 1.0));
  scene.add(sistema);

  // Polvo de estrellas de fondo
  const est = nuevaCapa();
  for (let i = 0; i < 3000; i++) {
    const r = 22 + Math.random() * 70;
    const t = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const c = [r * Math.sin(ph) * Math.cos(t), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(t)];
    agregar(est, c, c, [1, 0, 0], [0, 1, 0], 0, 0, 0, 1.1 + Math.random());
  }
  const estrellas = capaAPuntos(est, 0x9fd0ff, 0xffffff, 0.8);
  scene.add(estrellas);

  /* ============================================================
   *  4. ESTADO + ANIMACIÓN
   * ============================================================ */
  const estado = {
    zoom: 1, zoomObj: 1,
    spread: 0, spreadObj: 0,
    rotX: 0.3, rotXObj: 0.3,
    rotY: 0, rotYObj: 0,
    hayMano: false,
  };

  let arrastrando = false;
  let ultimoX = 0, ultimoY = 0;

  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  const mapear = (v, a1, b1, a2, b2) => a2 + ((v - a1) / (b1 - a1)) * (b2 - a2);
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  const reloj = new THREE.Clock();

  function animar() {
    requestAnimationFrame(animar);
    const dt = reloj.getDelta();
    const t = reloj.elapsedTime;

    if (!estado.hayMano && !arrastrando) estado.rotYObj += dt * 0.15;

    estado.zoom += (estado.zoomObj - estado.zoom) * 0.12;
    estado.spread += (estado.spreadObj - estado.spread) * 0.06;
    estado.rotX += (estado.rotXObj - estado.rotX) * 0.1;
    estado.rotY += (estado.rotYObj - estado.rotY) * 0.1;

    sistema.scale.setScalar(estado.zoom);
    sistema.rotation.set(estado.rotX, estado.rotY, 0);
    estrellas.rotation.y += dt * 0.01;

    materiales.forEach((m) => {
      m.uniforms.uTime.value = t;
      if (m !== estrellas.material) m.uniforms.uSpread.value = estado.spread;
    });

    renderer.render(scene, camera);
  }
  animar();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ============================================================
   *  5. RATÓN / TECLADO (si no hay cámara)
   * ============================================================ */
  canvas.addEventListener("pointerdown", (e) => {
    arrastrando = true; ultimoX = e.clientX; ultimoY = e.clientY;
  });
  window.addEventListener("pointerup", () => (arrastrando = false));
  window.addEventListener("pointermove", (e) => {
    if (!arrastrando || estado.hayMano) return;
    estado.rotYObj += (e.clientX - ultimoX) * 0.006;
    estado.rotXObj = limitar(estado.rotXObj + (e.clientY - ultimoY) * 0.006, -1.5, 1.5);
    ultimoX = e.clientX; ultimoY = e.clientY;
  });
  window.addEventListener("wheel", (e) => {
    if (estado.hayMano) return;
    estado.zoomObj = limitar(estado.zoomObj - e.deltaY * 0.001, 0.4, 3.2);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !estado.hayMano) {
      estado.spreadObj = estado.spreadObj > 0.5 ? 0 : 1;
      e.preventDefault();
    }
  });

  /* ============================================================
   *  6. CONTROL CON LAS MANOS (MediaPipe Hands)
   * ============================================================ */
  const video = document.getElementById("video");
  const lmCanvas = document.getElementById("landmarks");
  const lmCtx = lmCanvas.getContext("2d");
  const contenedorCam = document.getElementById("camara");
  const btn = document.getElementById("btnIniciar");
  const txtEstado = document.getElementById("estado");

  const CONEXIONES = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17],
  ];

  function dibujarManos(manos) {
    lmCtx.clearRect(0, 0, lmCanvas.width, lmCanvas.height);
    const w = lmCanvas.width, h = lmCanvas.height;
    manos.forEach((m) => {
      lmCtx.strokeStyle = "rgba(95, 230, 255, 0.9)";
      lmCtx.lineWidth = 2;
      CONEXIONES.forEach(([a, b]) => {
        lmCtx.beginPath();
        lmCtx.moveTo(m[a].x * w, m[a].y * h);
        lmCtx.lineTo(m[b].x * w, m[b].y * h);
        lmCtx.stroke();
      });
      lmCtx.fillStyle = "#ffffff";
      m.forEach((p) => {
        lmCtx.beginPath();
        lmCtx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
        lmCtx.fill();
      });
    });
  }

  const extendido = (m, punta, pip) => dist(m[0], m[punta]) > dist(m[0], m[pip]) * 1.08;

  function alRecibirManos(resultados) {
    const manos = resultados.multiHandLandmarks || [];
    dibujarManos(manos);

    if (manos.length === 0) {
      estado.hayMano = false;
      txtEstado.textContent = "No veo ninguna mano. Colócala frente a la cámara.";
      return;
    }
    estado.hayMano = true;
    const m = manos[0];

    const palma = m[9];
    estado.rotYObj = (0.5 - palma.x) * Math.PI * 1.8;
    estado.rotXObj = limitar((palma.y - 0.5) * Math.PI * 0.9 + 0.3, -1.4, 1.4);

    if (manos.length >= 2) {
      const d = dist(manos[0][9], manos[1][9]);
      estado.zoomObj = limitar(mapear(d, 0.1, 0.7, 0.45, 3.2), 0.4, 3.2);
      txtEstado.textContent = "Dos manos: zoom por distancia entre ellas.";
    } else {
      const tamPalma = dist(m[0], m[9]) || 0.001;
      const pinza = dist(m[4], m[8]) / tamPalma;
      if (extendido(m, 8, 6)) {
        estado.zoomObj = limitar(mapear(pinza, 0.15, 1.6, 0.5, 3.2), 0.4, 3.2);
      }
      txtEstado.textContent = "Mano detectada · zoom ×" + estado.zoomObj.toFixed(1);
    }

    let abiertos = 0;
    if (extendido(m, 12, 10)) abiertos++;
    if (extendido(m, 16, 14)) abiertos++;
    if (extendido(m, 20, 18)) abiertos++;
    estado.spreadObj = abiertos / 3;
  }

  let hands = null;
  let procesando = false;

  async function iniciarCamara() {
    btn.disabled = true;
    btn.textContent = "Cargando…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();

      lmCanvas.width = video.videoWidth || 640;
      lmCanvas.height = video.videoHeight || 480;

      hands = new Hands({
        locateFile: (f) => "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/" + f,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
      hands.onResults(alRecibirManos);

      contenedorCam.classList.add("activa");
      btn.classList.add("oculto");
      txtEstado.textContent = "Cámara activa. Muestra tu mano.";

      const bucle = async () => {
        if (video.readyState >= 2 && !procesando) {
          procesando = true;
          try { await hands.send({ image: video }); } catch (e) { console.error(e); }
          procesando = false;
        }
        requestAnimationFrame(bucle);
      };
      bucle();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = "Activar cámara";
      txtEstado.textContent =
        "No se pudo abrir la cámara. Revisa los permisos (necesita https o localhost).";
    }
  }

  btn.addEventListener("click", iniciarCamara);
})();

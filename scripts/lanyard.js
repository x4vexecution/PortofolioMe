/**
 * Hanging lanyard ID badge for the portfolio hero.
 *
 * Mount:   <div id="lanyard" class="hero-lanyard" aria-hidden="true"></div>
 * Script:  <script type="module" src="/scripts/lanyard.js"></script>
 * Deps:    three + @dimforge/rapier3d-compat, pinned in the <script type="importmap">.
 *
 * Exposes window.lanyard = { destroy } once mounted, and exports createLanyard()
 * so a bundler/framework can mount it manually.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------------- *
 * Config
 * ------------------------------------------------------------------------- */
const CONFIG = {
  // Physics
  gravity: { x: 0, y: -40, z: 0 }, // strong gravity, light badge feel
  linearDamping: 2.0,              // rope + card settle, no endless drift
  angularDamping: 2.6,             // kills endless spin
  ropeSegments: 4,                 // rigid links: anchor -> ... -> card
  ropeSegmentLength: 1.15,         // world units per link
  anchorY: 6.6,                    // camera sees ~ +-6.4, so the anchor hangs off-screen
  solverIterations: 8,             // keeps the rope from stretching

  // Card (portrait 1:1.4)
  cardWidth: 3,
  cardHeight: 4.2,
  cardThickness: 0.06,             // ~2% of width
  cardCornerRadius: 0.22,

  // Strap ribbon
  strapWidth: 0.6,                 // 20% of card width
  strapTileLength: 1.1,            // world units per texture repeat
  strapSamples: 48,

  // Camera / renderer
  cameraFov: 24,
  cameraZ: 30,
  maxPixelRatio: 2,
  maxPhysicsSteps: 5,              // desktop; mobile uses 2
  physicsStep: 1 / 60,

  // Palette
  colors: {
    cardEdge: 0x0d1119,
    cardFace: 0x141a26,
    clip: 0xc9ced9,
    strap: 0x18202f,
    key: 0xffffff,
    rim: 0x6f8dff,
    ambient: 0xffffff,
  },

  // Placeholders — replace the files, keep the paths
  assets: {
    front: 'assets/images/card-front.png',
    back: 'assets/images/card-back.png',
    strap: 'assets/images/lanyard-strap.png',
  },
};

const FIXED_DT = CONFIG.physicsStep;
const MOBILE = '(max-width: 767px)';

/* ------------------------------------------------------------------------- *
 * Public factory
 * ------------------------------------------------------------------------- */
export async function createLanyard(container) {
  await RAPIER.init();

  const { cardWidth: W, cardHeight: H, cardThickness: T } = CONFIG;
  const ropeLen = CONFIG.ropeSegments * CONFIG.ropeSegmentLength;
  const cardCenterY = CONFIG.anchorY - ropeLen - H / 2;
  const slotY = H / 2 - 0.42;

  /* ---- renderer ---------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  /* ---- scene / camera ---------------------------------------------------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.cameraFov, 1, 0.1, 100);
  camera.position.set(0, 0, CONFIG.cameraZ);
  camera.lookAt(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  room.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.85;

  scene.add(new THREE.AmbientLight(CONFIG.colors.ambient, 0.55));
  const key = new THREE.DirectionalLight(CONFIG.colors.key, 2.6);
  key.position.set(5, 9, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(CONFIG.colors.rim, 1.8);
  rim.position.set(-7, -3, -8);
  scene.add(rim);

  /* ---- textures ---------------------------------------------------------- */
  const loader = new THREE.TextureLoader();
  const loadTexture = (url, repeat) =>
    new Promise((resolve) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          if (repeat) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
          }
          resolve(tex);
        },
        undefined,
        () => resolve(null), // missing file -> plain fallback material
      );
    });

  const [frontTex, backTex, strapTex] = await Promise.all([
    loadTexture(CONFIG.assets.front),
    loadTexture(CONFIG.assets.back),
    loadTexture(CONFIG.assets.strap, true),
  ]);

  /* ---- card meshes ------------------------------------------------------- */
  const cardGroup = new THREE.Group();
  cardGroup.position.set(0, cardCenterY, 0);
  scene.add(cardGroup);

  const edgeMat = new THREE.MeshPhysicalMaterial({
    color: CONFIG.colors.cardEdge,
    roughness: 0.3,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
  });
  const faceMat = (map) =>
    new THREE.MeshPhysicalMaterial({
      color: map ? 0xffffff : CONFIG.colors.cardFace,
      map: map || null,
      roughness: 0.3,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
      transparent: !!map,
    });

  const coreGeo = new THREE.ExtrudeGeometry(roundedShape(W, H, CONFIG.cardCornerRadius, slotY), {
    depth: T,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 10,
    steps: 1,
  });
  coreGeo.translate(0, 0, -T / 2);

  const faceShape = roundedShape(W - 0.1, H - 0.1, CONFIG.cardCornerRadius - 0.03, slotY);
  const faceGeo = new THREE.ShapeGeometry(faceShape, 10);
  normalizeShapeUV(faceGeo, W - 0.1, H - 0.1);

  const coreMesh = new THREE.Mesh(coreGeo, edgeMat);
  const frontMesh = new THREE.Mesh(faceGeo, faceMat(frontTex));
  frontMesh.position.z = T / 2 + 0.014;
  const backMesh = new THREE.Mesh(faceGeo, faceMat(backTex));
  backMesh.position.z = -T / 2 - 0.014;
  backMesh.rotation.y = Math.PI;

  const clipMat = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.clip,
    metalness: 0.9,
    roughness: 0.25,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 10, 24), clipMat);
  ring.position.y = H / 2 + 0.14;
  const tabShape = new THREE.Shape();
  roundedPath(tabShape, 0, 0, 0.22, 0.62, 0.09);
  const tabGeo = new THREE.ExtrudeGeometry(tabShape, {
    depth: 0.06,
    bevelEnabled: false,
    curveSegments: 6,
  });
  tabGeo.translate(0, 0, -0.03);
  const tab = new THREE.Mesh(tabGeo, clipMat);
  tab.position.y = H / 2 - 0.12;

  cardGroup.add(coreMesh, frontMesh, backMesh, ring, tab);

  /* ---- strap ribbon ------------------------------------------------------ */
  const strapMat = new THREE.MeshStandardMaterial({
    color: strapTex ? 0xffffff : CONFIG.colors.strap,
    map: strapTex || null,
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const SAMPLES = CONFIG.strapSamples;
  const posArr = new Float32Array(SAMPLES * 6);
  const nrmArr = new Float32Array(SAMPLES * 6);
  const uvArr = new Float32Array(SAMPLES * 4);
  const indices = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const strapGeo = new THREE.BufferGeometry();
  strapGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  strapGeo.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3));
  strapGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  strapGeo.setIndex(indices);
  const strapMesh = new THREE.Mesh(strapGeo, strapMat);
  strapMesh.frustumCulled = false;
  scene.add(strapMesh);

  /* ---- physics ----------------------------------------------------------- */
  const world = new RAPIER.World(CONFIG.gravity);
  world.timestep = FIXED_DT;
  world.numSolverIterations = CONFIG.solverIterations;

  const anchorBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, CONFIG.anchorY, 0),
  );

  const L = CONFIG.ropeSegmentLength;
  const ropeBodies = [];
  for (let i = 0; i < CONFIG.ropeSegments; i++) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, CONFIG.anchorY - L * (i + 0.5), 0)
        .setLinearDamping(CONFIG.linearDamping)
        .setAngularDamping(CONFIG.angularDamping),
    );
    // heavy-ish links keep the mass ratio with the card small enough to stay stable
    world.createCollider(RAPIER.ColliderDesc.ball(0.05).setDensity(40), body);
    ropeBodies.push(body);
  }

  const spherical = (a, b, anchorA, anchorB) =>
    world.createImpulseJoint(RAPIER.JointData.spherical(anchorA, anchorB), a, b, true);

  spherical(anchorBody, ropeBodies[0], { x: 0, y: 0, z: 0 }, { x: 0, y: L / 2, z: 0 });
  for (let i = 1; i < ropeBodies.length; i++) {
    spherical(
      ropeBodies[i - 1],
      ropeBodies[i],
      { x: 0, y: -L / 2, z: 0 },
      { x: 0, y: L / 2, z: 0 },
    );
  }

  const cardBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, cardCenterY, 0)
      .setLinearDamping(CONFIG.linearDamping)
      .setAngularDamping(CONFIG.angularDamping),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(W / 2, H / 2, T / 2).setDensity(0.25),
    cardBody,
  );
  spherical(
    ropeBodies[ropeBodies.length - 1],
    cardBody,
    { x: 0, y: -L / 2, z: 0 },
    { x: 0, y: H / 2 - 0.02, z: 0 },
  );

  /* ---- simulation state -------------------------------------------------- */
  const cardPos = new THREE.Vector3();
  const cardQuat = new THREE.Quaternion();
  const prevCardPos = new THREE.Vector3();
  const prevCardQuat = new THREE.Quaternion();
  const ropePos = ropeBodies.map(() => new THREE.Vector3());
  const prevRope = ropeBodies.map(() => new THREE.Vector3());

  const readBodies = () => {
    const p = cardBody.translation();
    const q = cardBody.rotation();
    cardPos.set(p.x, p.y, p.z);
    cardQuat.set(q.x, q.y, q.z, q.w);
    ropeBodies.forEach((body, i) => {
      const rp = body.translation();
      ropePos[i].set(rp.x, rp.y, rp.z);
    });
  };

  readBodies();
  prevCardPos.copy(cardPos);
  prevCardQuat.copy(cardQuat);
  ropePos.forEach((p, i) => prevRope[i].copy(p));

  /* ---- strap update ------------------------------------------------------ */
  const curvePoints = [
    new THREE.Vector3(),
    ...ropeBodies.map(() => new THREE.Vector3()),
    new THREE.Vector3(),
  ];
  const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.5);
  const tmpPoint = new THREE.Vector3();
  const tmpPrev = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();
  const tmpSide = new THREE.Vector3();
  const tmpNrm = new THREE.Vector3();
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const attach = new THREE.Vector3();

  const updateStrap = (alpha) => {
    curvePoints[0].set(0, CONFIG.anchorY + 2.5, 0);
    for (let i = 0; i < ropeBodies.length; i++) {
      curvePoints[i + 1].lerpVectors(prevRope[i], ropePos[i], alpha);
    }
    // strap ends on the clip ring, which rides on the card
    attach
      .set(0, H / 2 + 0.14, 0)
      .applyQuaternion(cardGroup.quaternion)
      .add(cardGroup.position);
    curvePoints[curvePoints.length - 1].copy(attach);

    let length = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      curve.getPoint(t, tmpPoint);
      curve.getTangent(t, tmpTan);
      tmpSide.crossVectors(tmpTan, Z_AXIS);
      if (tmpSide.lengthSq() < 1e-8) tmpSide.set(1, 0, 0);
      else tmpSide.normalize();
      tmpNrm.crossVectors(tmpSide, tmpTan).normalize();

      if (i > 0) length += tmpPoint.distanceTo(tmpPrev);
      tmpPrev.copy(tmpPoint);

      const o = i * 6;
      const half = CONFIG.strapWidth / 2;
      posArr[o] = tmpPoint.x - tmpSide.x * half;
      posArr[o + 1] = tmpPoint.y - tmpSide.y * half;
      posArr[o + 2] = tmpPoint.z - tmpSide.z * half;
      posArr[o + 3] = tmpPoint.x + tmpSide.x * half;
      posArr[o + 4] = tmpPoint.y + tmpSide.y * half;
      posArr[o + 5] = tmpPoint.z + tmpSide.z * half;
      nrmArr[o] = nrmArr[o + 3] = tmpNrm.x;
      nrmArr[o + 1] = nrmArr[o + 4] = tmpNrm.y;
      nrmArr[o + 2] = nrmArr[o + 5] = tmpNrm.z;

      const u = length / CONFIG.strapTileLength;
      uvArr[i * 4] = u;
      uvArr[i * 4 + 1] = 0;
      uvArr[i * 4 + 2] = u;
      uvArr[i * 4 + 3] = 1;
    }

    strapGeo.attributes.position.needsUpdate = true;
    strapGeo.attributes.normal.needsUpdate = true;
    strapGeo.attributes.uv.needsUpdate = true;
  };

  /* ---- loop -------------------------------------------------------------- */
  let rafId = 0;
  let running = false;
  let lastTime = 0;
  let accumulator = 0;
  let simTime = 0;
  const maxSteps = window.matchMedia(MOBILE).matches ? 2 : CONFIG.maxPhysicsSteps;

  const stepPhysics = () => {
    simTime += FIXED_DT;
    if (!dragging) {
      // idle sway so the badge never looks frozen
      const sway = Math.sin(simTime * 0.9) * 0.9 + Math.sin(simTime * 1.7 + 1.3) * 0.4;
      cardBody.applyImpulse({ x: sway * 0.004, y: 0, z: 0 }, true);
      cardBody.applyTorqueImpulse({ x: 0, y: 0, z: Math.sin(simTime * 0.6) * 0.002 }, true);
    }
    prevCardPos.copy(cardPos);
    prevCardQuat.copy(cardQuat);
    for (let i = 0; i < ropeBodies.length; i++) prevRope[i].copy(ropePos[i]);
    world.step();
    readBodies();
  };

  const render = (alpha) => {
    cardGroup.position.lerpVectors(prevCardPos, cardPos, alpha);
    cardGroup.quaternion.slerpQuaternions(prevCardQuat, cardQuat, alpha);
    updateStrap(alpha);
    renderer.render(scene, camera);
  };

  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < maxSteps) {
      stepPhysics();
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === maxSteps) accumulator = 0; // drop backlog, don't spiral
    render(accumulator / FIXED_DT);
  };

  const start = () => {
    if (running) return;
    running = true;
    accumulator = 0;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  /* ---- resize ------------------------------------------------------------ */
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ---- pointer drag ------------------------------------------------------ */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const camDir = new THREE.Vector3();
  const dragPlane = new THREE.Plane();
  const planeHit = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();
  const dragTarget = new THREE.Vector3();
  const prevDragTarget = new THREE.Vector3();
  const dragVel = new THREE.Vector3();
  const tmpVel = new THREE.Vector3();

  let dragging = false;
  let pointerId = null;
  let lastDragTime = 0;

  const setPointer = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
  };
  const hitCard = (clientX, clientY) => {
    setPointer(clientX, clientY);
    scene.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(coreMesh, false).length > 0;
  };

  const onPointerDown = (e) => {
    if (dragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!hitCard(e.clientX, e.clientY)) return;
    e.preventDefault();
    dragging = true;
    pointerId = e.pointerId;
    canvas.setPointerCapture(pointerId);
    canvas.classList.add('is-grabbing');

    camera.getWorldDirection(camDir);
    dragPlane.setFromNormalAndCoplanarPoint(camDir, cardPos);
    setPointer(e.clientX, e.clientY);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
      dragOffset.copy(cardPos).sub(planeHit);
    } else {
      dragOffset.set(0, 0, 0);
    }
    dragTarget.copy(cardPos);
    prevDragTarget.copy(cardPos);
    dragVel.set(0, 0, 0);
    lastDragTime = performance.now();
    cardBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  };

  const onPointerMove = (e) => {
    if (!dragging) {
      if (e.pointerType !== 'touch') {
        canvas.classList.toggle('is-hovering', hitCard(e.clientX, e.clientY));
      }
      return;
    }
    if (e.pointerId !== pointerId) return;
    setPointer(e.clientX, e.clientY);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return;

    dragTarget.copy(planeHit).add(dragOffset);
    dragTarget.x = THREE.MathUtils.clamp(dragTarget.x, -5, 5);
    dragTarget.y = THREE.MathUtils.clamp(dragTarget.y, -9, 7);
    dragTarget.z = THREE.MathUtils.clamp(dragTarget.z, -4, 4);
    cardBody.setNextKinematicTranslation(dragTarget);

    const now = performance.now();
    const dt = Math.max((now - lastDragTime) / 1000, 1 / 120);
    tmpVel.copy(dragTarget).sub(prevDragTarget).divideScalar(dt);
    dragVel.lerp(tmpVel, 0.35);
    prevDragTarget.copy(dragTarget);
    lastDragTime = now;
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('is-grabbing');
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;

    cardBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    tmpVel.copy(dragVel);
    if (tmpVel.length() > 14) tmpVel.setLength(14);
    cardBody.setLinvel({ x: tmpVel.x, y: tmpVel.y, z: tmpVel.z }, true);
    cardBody.setAngvel({ x: 0, y: 0, z: -tmpVel.x * 0.4 }, true);
  };

  const onPointerUp = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    endDrag();
  };

  // Only swallow touch gestures that start on the card, so the page still scrolls.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    if (t && hitCard(t.clientX, t.clientY)) e.preventDefault();
  };
  const onTouchMove = (e) => {
    if (dragging) e.preventDefault();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });

  // small kick so it starts swinging on load
  cardBody.applyImpulse({ x: 0.35, y: 0, z: 0 }, true);

  /* ---- pause when hidden / offscreen ------------------------------------- */
  let visible = false;
  let hidden = document.hidden;
  const sync = () => (visible && !hidden ? start() : stop());

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      sync();
    },
    { threshold: 0 },
  );
  io.observe(container);

  const onVisibility = () => {
    hidden = document.hidden;
    sync();
  };
  document.addEventListener('visibilitychange', onVisibility);

  /* ---- destroy ----------------------------------------------------------- */
  const destroy = () => {
    stop();
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);

    world.free();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
    envRT.dispose();
    pmrem.dispose();
    renderer.dispose();
    canvas.remove();
  };

  return { destroy };
}

/* ------------------------------------------------------------------------- *
 * Helpers
 * ------------------------------------------------------------------------- */
// Rounded rect path centred on (0,0) with a rounded slot cut near the top.
function roundedShape(w, h, r, slotY) {
  const shape = new THREE.Shape();
  roundedPath(shape, 0, 0, w, h, r);
  shape.holes.push(roundedPath(new THREE.Path(), 0, slotY, 0.72, 0.2, 0.1));
  return shape;
}

function roundedPath(path, cx, cy, w, h, r) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

// ShapeGeometry UVs are raw shape coordinates; remap them to 0..1.
function normalizeShapeUV(geo, w, h) {
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
}

/* ------------------------------------------------------------------------- *
 * Auto-mount on #lanyard
 * ------------------------------------------------------------------------- */
const mountEl = document.getElementById('lanyard');
if (mountEl) {
  createLanyard(mountEl)
    .then((instance) => {
      window.lanyard = instance;
    })
    .catch((err) => console.error('[lanyard] failed to mount', err));
}

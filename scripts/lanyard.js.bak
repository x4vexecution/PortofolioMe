/**
 * Realistic hanging lanyard ID badge for LUMINICA.
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
  /* Card, in local units. Portrait ID badge. */
  card: {
    width: 3.1,
    height: 4.55,
    thickness: 0.11,
    cornerRadius: 0.2,
    slotWidth: 0.78,
    slotHeight: 0.22,
    slotInset: 0.44,
    clearcoat: 0.65,
    roughness: 0.28,
  },

  /* Single continuous elegant woven strap */
  strap: {
    width: 0.56,
    thickness: 0.045,
    samples: 144,
    tileLength: 3.1,
    roughness: 0.48,
    label: 'LUMINICA',
  },

  /* Physics */
  physics: {
    gravity: -42,
    linearDamping: 0.86,
    angularDamping: 1.9,
    ropeSegments: 12,
    ropeSegmentLength: 0.29,
    claspLength: 0.48,
    ropeDensity: 36,
    claspDensity: 18,
    cardDensity: 0.24,
    solverIterations: 20,
    maxPhysicsSteps: 5,
    maxStepsMobile: 2,
    fixedStep: 1 / 60,
    swaySpeed: 0.85,
    swayImpulse: 0.0032,
  },

  /* Camera + renderer */
  camera: {
    fov: 24,
    z: 26,
    maxPixelRatio: 2,
  },

  /* Responsive layout */
  layout: {
    mobileMaxWidth: 767,
    mobileCardWidth: 0.56,
    mobileRight: 0.68,
    desktopCardWidth: 0.24,
    desktopRight: 0.72,
    verticalBias: -0.22,
    anchorMargin: 0.6,
    fit: 0.92,
  },

  /* Interaction */
  interaction: {
    dragThresholdMouse: 6,
    dragThresholdTouch: 10,
    clickMaxMs: 320,
    flipDuration: 580,
    maxReleaseSpeed: 18,
  },

  /* Palette: deep luxury charcoal/slate + glossy chrome */
  colors: {
    strapBase: '#0b0e14',
    strapEdge: '#05070a',
    strapStitch: '#c8d0dc',
    strapText: '#f5f7fa',
    metal: 0xf2f6fa,
    cardEdge: 0x141820,
    key: 0xffffff,
    rim: 0xdbe6f4,
    ambient: 0xffffff,
  },

  /* Original front & back images — preserved verbatim */
  assets: {
    front: 'https://raw.githubusercontent.com/x4vexecution/Image/refs/heads/main/1bc02a650c14a95053c88a9166a1eb97.jpg',
    back: 'https://raw.githubusercontent.com/x4vexecution/Image/refs/heads/main/1ad905ac00ce4dde1a796b5dcbc6060b.jpg',
  },
};

/* ------------------------------------------------------------------------- *
 * Public factory
 * ------------------------------------------------------------------------- */
export async function createLanyard(container) {
  await RAPIER.init();

  const { card: CARD, strap: STRAP, physics: PHYS, camera: CAM, layout: LAY, interaction: ACT } = CONFIG;
  const W = CARD.width;
  const H = CARD.height;
  const T = CARD.thickness;
  const slotY = H / 2 - CARD.slotInset;
  const FACE_Z = T / 2 + 0.016;
  const RING_Z = T / 2 + 0.048;
  const CLASP_Z = T / 2 + 0.042;

  const ropeLen = PHYS.ropeSegments * PHYS.ropeSegmentLength;
  const claspLen = PHYS.claspLength;
  const anchorToCard = ropeLen + claspLen + slotY;

  /* ---- renderer ---------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const canvas = renderer.domElement;
  container.appendChild(canvas);
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  /* ---- scene / camera ---------------------------------------------------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.1, 200);
  camera.position.set(0, 0, CAM.z);
  camera.lookAt(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  room.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.25;

  scene.add(new THREE.AmbientLight(CONFIG.colors.ambient, 0.6));
  const key = new THREE.DirectionalLight(CONFIG.colors.key, 2.7);
  key.position.set(5, 9, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(CONFIG.colors.rim, 1.9);
  rim.position.set(-7, -3, -8);
  scene.add(rim);

  /* ---- layout (world units) ---------------------------------------------- */
  const root = new THREE.Group();
  scene.add(root);

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let introStart = 0;
  let introPlayed = false;
  let introDistance = 0;

  const computeLayout = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2)) * CAM.z;
    const visibleW = visibleH * aspect;
    const mobile = w <= LAY.mobileMaxWidth;

    const target = mobile ? LAY.mobileCardWidth : LAY.desktopCardWidth;
    let scale = (target * visibleW) / W;
    scale = Math.min(scale, (LAY.fit * visibleH) / (ropeLen + claspLen + H));

    const camX = (0.5 - (mobile ? LAY.mobileRight : LAY.desktopRight)) * visibleW;
    const anchorY = Math.max(
      visibleH / 2 + LAY.anchorMargin,
      LAY.verticalBias * visibleH + anchorToCard * scale,
    );

    return { w, h, aspect, visibleH, visibleW, scale, camX, anchorY };
  };

  let view = computeLayout();
  introDistance = reduceMotion ? 0 : (view.visibleH / view.scale) * 0.65;
  root.scale.setScalar(view.scale);
  camera.aspect = view.aspect;
  camera.updateProjectionMatrix();
  camera.position.set(view.camX, 0, CAM.z);
  camera.lookAt(view.camX, 0, 0);

  /* ---- textures ---------------------------------------------------------- */
  const loader = new THREE.TextureLoader();
  const loadTexture = (url) =>
    new Promise((resolve) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          const image = tex.image;
          const imageAspect =
            (image?.naturalWidth || image?.width || 1) /
            (image?.naturalHeight || image?.height || 1);
          const cardAspect = W / H;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          if (imageAspect > cardAspect) {
            tex.repeat.x = cardAspect / imageAspect;
            tex.offset.x = (1 - tex.repeat.x) / 2;
          } else {
            tex.repeat.y = imageAspect / cardAspect;
            tex.offset.y = (1 - tex.repeat.y) / 2;
          }
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        () => resolve(null),
      );
    });

  const [frontTex, backTex] = await Promise.all([
    loadTexture(CONFIG.assets.front),
    loadTexture(CONFIG.assets.back),
  ]);

  const frontMap = frontTex || makeLabelTexture('FRONT', maxAniso);
  const backMap = backTex || makeLabelTexture('BACK', maxAniso);
  const { map: strapMap, normalMap: strapNormal, tileLength } = makeStrapTextures(maxAniso);

  /* ---- card meshes ------------------------------------------------------- */
  const cardGroup = new THREE.Group();
  cardGroup.position.set(0, 0, 0);
  root.add(cardGroup);

  const flipGroup = new THREE.Group();
  cardGroup.add(flipGroup);

  const edgeMat = new THREE.MeshPhysicalMaterial({
    color: CONFIG.colors.cardEdge,
    roughness: CARD.roughness,
    metalness: 0.1,
    clearcoat: CARD.clearcoat,
    clearcoatRoughness: 0.2,
  });
  const faceMat = (map) =>
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map,
      roughness: CARD.roughness,
      metalness: 0.02,
      clearcoat: CARD.clearcoat,
      clearcoatRoughness: 0.22,
    });

  const coreGeo = new THREE.ExtrudeGeometry(roundedShape(W, H, CARD.cornerRadius, slotY, CARD), {
    depth: T,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 2,
    curveSegments: 10,
    steps: 1,
  });
  coreGeo.translate(0, 0, -T / 2);

  const faceGeo = new THREE.ShapeGeometry(
    roundedShape(W - 0.1, H - 0.1, CARD.cornerRadius - 0.03, slotY, CARD),
    10,
  );
  normalizeShapeUV(faceGeo, W - 0.1, H - 0.1);

  const coreMesh = new THREE.Mesh(coreGeo, edgeMat);
  const frontMesh = new THREE.Mesh(faceGeo, faceMat(frontMap));
  frontMesh.position.z = FACE_Z;
  const backMesh = new THREE.Mesh(faceGeo, faceMat(backMap));
  backMesh.position.z = -FACE_Z;
  backMesh.rotation.y = Math.PI;
  flipGroup.add(coreMesh, frontMesh, backMesh);

  /* ---- glossy chrome hardware -------------------------------------------- */
  const chromeMat = new THREE.MeshPhysicalMaterial({
    color: CONFIG.colors.metal,
    metalness: 0.96,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    reflectivity: 1.0,
    envMapIntensity: 2.1,
  });

  // Chrome slot grommet
  const grommetShape = roundedShape(CARD.slotWidth + 0.11, CARD.slotHeight + 0.11, 0.08, 0, CARD);
  grommetShape.holes.length = 0;
  grommetShape.holes.push(roundedPath(new THREE.Path(), 0, 0, CARD.slotWidth, CARD.slotHeight, 0.08));
  const grommetGeo = new THREE.ExtrudeGeometry(grommetShape, {
    depth: T + 0.032,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 8,
  });
  grommetGeo.translate(0, slotY, -(T + 0.032) / 2);
  cardGroup.add(new THREE.Mesh(grommetGeo, chromeMat));

  // Glossy chrome split ring on card slot
  const ringGeo = new THREE.TorusGeometry(0.135, 0.03, 14, 40);
  const badgeRing = new THREE.Mesh(ringGeo, chromeMat);
  badgeRing.position.set(0, slotY, RING_Z);
  badgeRing.rotation.x = 0.1;
  cardGroup.add(badgeRing);

  // Glossy chrome crimp collar at the strap end
  const crimpGroup = new THREE.Group();
  const crimpShape = new THREE.Shape();
  roundedPath(crimpShape, 0, 0, 0.72, 0.38, 0.065);
  const crimpGeo = new THREE.ExtrudeGeometry(crimpShape, {
    depth: 0.19,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.022,
    bevelSegments: 3,
    curveSegments: 10,
  });
  crimpGeo.translate(0, 0, -0.095);
  crimpGroup.add(new THREE.Mesh(crimpGeo, chromeMat));
  root.add(crimpGroup);

  // Glossy chrome swivel clasp connecting crimp to ring
  const claspGroup = new THREE.Group();
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.024, 10, 24), chromeMat);
  eye.position.y = -claspLen / 2 + 0.07;
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.022, 10, 24), chromeMat);
  topRing.position.y = claspLen / 2 - 0.03;
  const shankCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -claspLen / 2 + 0.13, 0),
    new THREE.Vector3(0, -0.08, 0.016),
    new THREE.Vector3(0, 0.08, 0.022),
    new THREE.Vector3(0, claspLen / 2 - 0.05, 0),
  ]);
  const shank = new THREE.Mesh(new THREE.TubeGeometry(shankCurve, 24, 0.028, 10, false), chromeMat);
  const gate = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.02, -claspLen / 2 + 0.12, 0.032),
        new THREE.Vector3(0.078, -claspLen / 2 + 0.07, 0.022),
        new THREE.Vector3(0.052, -claspLen / 2 + 0.02, 0),
      ]),
      10,
      0.015,
      8,
      false,
    ),
    chromeMat,
  );
  claspGroup.add(eye, topRing, shank, gate);
  root.add(claspGroup);

  /* ---- strap ribbon (single continuous elastic strand) -------------------- */
  const SAMPLES = STRAP.samples;
  const RIBBON_VERTS = SAMPLES * 6;
  const posArr = new Float32Array(RIBBON_VERTS * 3);
  const nrmArr = new Float32Array(RIBBON_VERTS * 3);
  const uvArr = new Float32Array(RIBBON_VERTS * 2);
  const indices = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    for (let j = 0; j < 6; j++) {
      const a = i * 6 + j;
      const b = i * 6 + ((j + 1) % 6);
      const c = (i + 1) * 6 + j;
      const d = (i + 1) * 6 + ((j + 1) % 6);
      indices.push(a, b, c, b, d, c);
    }
  }
  const strapGeo = new THREE.BufferGeometry();
  strapGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  strapGeo.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3));
  strapGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  strapGeo.setIndex(indices);

  const strapMat = new THREE.MeshStandardMaterial({
    map: strapMap,
    normalMap: strapNormal,
    normalScale: new THREE.Vector2(0.58, 0.58),
    roughness: STRAP.roughness,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const strapMesh = new THREE.Mesh(strapGeo, strapMat);
  strapMesh.frustumCulled = false;
  root.add(strapMesh);

  /* ---- physics ----------------------------------------------------------- */
  const world = new RAPIER.World({ x: 0, y: PHYS.gravity, z: 0 });
  world.timestep = PHYS.fixedStep;
  world.numSolverIterations = PHYS.solverIterations;

  let anchorLocal = view.anchorY / view.scale;

  const anchorBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, anchorLocal, 0),
  );

  const L = PHYS.ropeSegmentLength;
  const ropeBodies = [];
  for (let i = 0; i < PHYS.ropeSegments; i++) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, anchorLocal - L * (i + 0.5), 0)
        .setLinearDamping(PHYS.linearDamping)
        .setAngularDamping(PHYS.angularDamping),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(0.05).setDensity(PHYS.ropeDensity), body);
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

  const crimpBody = ropeBodies[ropeBodies.length - 1];
  const claspBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, anchorLocal - ropeLen - claspLen / 2, 0)
      .setLinearDamping(PHYS.linearDamping)
      .setAngularDamping(PHYS.angularDamping)
      .enabledRotations(false, false, true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(0.045).setDensity(PHYS.claspDensity).setSensor(true),
    claspBody,
  );

  spherical(crimpBody, claspBody, { x: 0, y: -L / 2, z: 0 }, { x: 0, y: claspLen / 2, z: 0 });

  const cardBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, anchorLocal - anchorToCard, 0)
      .setLinearDamping(PHYS.linearDamping)
      .setAngularDamping(PHYS.angularDamping)
      .enabledRotations(false, false, true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(W / 2, H / 2, T / 2).setDensity(PHYS.cardDensity),
    cardBody,
  );
  spherical(claspBody, cardBody, { x: 0, y: -claspLen / 2, z: 0 }, { x: 0, y: slotY, z: 0 });

  /* ---- simulation state -------------------------------------------------- */
  const cardPos = new THREE.Vector3();
  const cardQuat = new THREE.Quaternion();
  const prevCardPos = new THREE.Vector3();
  const prevCardQuat = new THREE.Quaternion();
  const claspPos = new THREE.Vector3();
  const claspQuat = new THREE.Quaternion();
  const prevClaspPos = new THREE.Vector3();
  const prevClaspQuat = new THREE.Quaternion();
  const ropePos = ropeBodies.map(() => new THREE.Vector3());
  const prevRope = ropeBodies.map(() => new THREE.Vector3());

  const readBodies = () => {
    const p = cardBody.translation();
    const q = cardBody.rotation();
    cardPos.set(p.x, p.y, p.z);
    cardQuat.set(q.x, q.y, q.z, q.w);
    const cp = claspBody.translation();
    const cq = claspBody.rotation();
    claspPos.set(cp.x, cp.y, cp.z);
    claspQuat.set(cq.x, cq.y, cq.z, cq.w);
    ropeBodies.forEach((body, i) => {
      const rp = body.translation();
      ropePos[i].set(rp.x, rp.y, rp.z);
    });
  };

  readBodies();
  prevCardPos.copy(cardPos);
  prevCardQuat.copy(cardQuat);
  prevClaspPos.copy(claspPos);
  prevClaspQuat.copy(claspQuat);
  ropePos.forEach((p, i) => prevRope[i].copy(p));

  /* ---- strap geometry update (elastic stretch + twist) ------------------- */
  const curvePoints = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    ...ropeBodies.map(() => new THREE.Vector3()),
  ];
  const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.5);
  const tmpPoint = new THREE.Vector3();
  const tmpPrev = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();
  const prevTan = new THREE.Vector3();
  const tmpSide = new THREE.Vector3();
  const tmpNrm = new THREE.Vector3();
  const frameQ = new THREE.Quaternion();
  const endTangent = new THREE.Vector3(0, -1, 0);
  const UP_AXIS = new THREE.Vector3(0, 1, 0);
  const strapEndDir = new THREE.Vector3();

  const hw = STRAP.width / 2;
  const ht = STRAP.thickness / 2;
  const e = ht;
  const XS = [
    [-hw, 0],
    [-hw + e, -ht],
    [hw - e, -ht],
    [hw, 0],
    [hw - e, ht],
    [-hw + e, ht],
  ];
  const V = [0, 0.05, 0.95, 1, 0.95, 0.05];

  let strapTwist = 0;
  let strapStretch = 0;

  const updateStrap = (alpha) => {
    curvePoints[0].set(0, anchorLocal + 2.2, 0);
    curvePoints[1].set(0, anchorLocal, 0);
    for (let i = 0; i < ropeBodies.length; i++) {
      curvePoints[i + 2].lerpVectors(prevRope[i], ropePos[i], alpha);
    }

    // As the strap is pulled taut, both ribbon width and UV tile pitch stretch
    // elastically so the strap and LUMINICA text widen together like elastic webbing.
    const widthScale = 1 + strapStretch * 0.28;
    const effectiveTileLength = tileLength * (1 + strapStretch * 0.34);

    let length = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      curve.getPoint(t, tmpPoint);
      curve.getTangent(t, tmpTan);

      if (i === 0) {
        tmpNrm.set(0, 0, 1).addScaledVector(tmpTan, -tmpTan.z);
        if (tmpNrm.lengthSq() < 1e-6) tmpNrm.set(1, 0, 0);
        tmpNrm.normalize();
      } else {
        frameQ.setFromUnitVectors(prevTan, tmpTan);
        tmpNrm.applyQuaternion(frameQ);
        tmpNrm.addScaledVector(tmpTan, -tmpNrm.dot(tmpTan));
        if (tmpNrm.lengthSq() < 1e-6) tmpNrm.set(0, 0, 1);
        tmpNrm.normalize();
      }

      if (Math.abs(strapTwist) > 1e-5) {
        tmpNrm.applyAxisAngle(tmpTan, strapTwist * Math.pow(t, 0.85));
      }

      tmpSide.crossVectors(tmpNrm, tmpTan).normalize();
      prevTan.copy(tmpTan);

      if (i > 0) length += tmpPoint.distanceTo(tmpPrev);
      tmpPrev.copy(tmpPoint);

      const u = length / effectiveTileLength;
      for (let j = 0; j < 6; j++) {
        const o = (i * 6 + j) * 3;
        const x = XS[j][0] * widthScale;
        const y = XS[j][1] * (1 - strapStretch * 0.12);
        posArr[o] = tmpPoint.x + tmpSide.x * x + tmpNrm.x * y;
        posArr[o + 1] = tmpPoint.y + tmpSide.y * x + tmpNrm.y * y;
        posArr[o + 2] = tmpPoint.z + tmpSide.z * x + tmpNrm.z * y;

        const nx = tmpSide.x * x + tmpNrm.x * y;
        const ny = tmpSide.y * x + tmpNrm.y * y;
        const nz = tmpSide.z * x + tmpNrm.z * y;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nrmArr[o] = nx / nl;
        nrmArr[o + 1] = ny / nl;
        nrmArr[o + 2] = nz / nl;

        const uvO = (i * 6 + j) * 2;
        uvArr[uvO] = u;
        uvArr[uvO + 1] = V[j];
      }
    }
    endTangent.copy(tmpTan);

    strapGeo.attributes.position.needsUpdate = true;
    strapGeo.attributes.normal.needsUpdate = true;
    strapGeo.attributes.uv.needsUpdate = true;
  };

  /* ---- flip -------------------------------------------------------------- */
  const flip = { active: false, from: 0, to: 0, start: 0, front: true };

  const startFlip = () => {
    if (flip.active) return;
    flip.from = flipGroup.rotation.y;
    flip.to = flip.front ? Math.PI : 0;
    flip.front = !flip.front;
    flip.active = true;
    flip.start = performance.now();
  };

  /* ---- loop -------------------------------------------------------------- */
  let rafId = 0;
  let running = false;
  let lastTime = 0;
  let accumulator = 0;
  let simTime = 0;
  let dragging = false;

  const stepPhysics = () => {
    simTime += PHYS.fixedStep;
    if (!dragging) {
      strapTwist *= 0.992;
      strapStretch = THREE.MathUtils.damp(strapStretch, 0, 10, PHYS.fixedStep);
      const sway = Math.sin(simTime * PHYS.swaySpeed) * 0.7 + Math.sin(simTime * 1.5 + 0.8) * 0.3;
      cardBody.applyImpulse({ x: sway * PHYS.swayImpulse, y: 0, z: 0 }, true);
      cardBody.applyTorqueImpulse({ x: 0, y: 0, z: Math.sin(simTime * 0.55) * 0.0012 }, true);
    }
    prevCardPos.copy(cardPos);
    prevCardQuat.copy(cardQuat);
    prevClaspPos.copy(claspPos);
    prevClaspQuat.copy(claspQuat);
    for (let i = 0; i < ropeBodies.length; i++) prevRope[i].copy(ropePos[i]);
    world.step();
    readBodies();
  };

  const render = (alpha, now) => {
    cardGroup.position.lerpVectors(prevCardPos, cardPos, alpha);
    cardGroup.quaternion.slerpQuaternions(prevCardQuat, cardQuat, alpha);

    claspGroup.position.lerpVectors(prevClaspPos, claspPos, alpha);
    claspGroup.position.z += CLASP_Z;
    claspGroup.quaternion.slerpQuaternions(prevClaspQuat, claspQuat, alpha);

    if (flip.active) {
      const t = Math.min((now - flip.start) / ACT.flipDuration, 1);
      flipGroup.rotation.y = flip.from + (flip.to - flip.from) * easeInOutCubic(t);
      if (t >= 1) flip.active = false;
    }

    updateStrap(alpha);

    strapEndDir.copy(endTangent).negate();
    crimpGroup.position.copy(curvePoints[curvePoints.length - 1]).addScaledVector(strapEndDir, 0.06);
    crimpGroup.quaternion.setFromUnitVectors(UP_AXIS, strapEndDir);

    if (introPlayed && introStart > 0 && introDistance > 0) {
      const elapsed = (now - introStart) / 1000;
      const duration = 1.45;
      if (elapsed < duration) {
        const t = elapsed / duration;
        root.position.y = introDistance * Math.exp(-5.6 * t) * Math.cos(7.8 * t);
      } else {
        root.position.y = 0;
        introStart = 0;
      }
    }

    renderer.render(scene, camera);
  };

  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    accumulator += dt;
    const maxSteps = view.w <= LAY.mobileMaxWidth ? PHYS.maxStepsMobile : PHYS.maxPhysicsSteps;
    let steps = 0;
    while (accumulator >= PHYS.fixedStep && steps < maxSteps) {
      stepPhysics();
      accumulator -= PHYS.fixedStep;
      steps++;
    }
    if (steps === maxSteps) accumulator = 0;
    render(accumulator / PHYS.fixedStep, now);
  };

  const start = () => {
    if (running) return;
    running = true;
    accumulator = 0;
    lastTime = performance.now();
    if (!introPlayed) {
      introPlayed = true;
      if (introDistance > 0) {
        root.position.y = introDistance;
        introStart = lastTime;
      }
    }
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  /* ---- resize ------------------------------------------------------------ */
  const applyLayout = () => {
    const next = computeLayout();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CAM.maxPixelRatio));
    renderer.setSize(next.w, next.h, false);
    camera.aspect = next.aspect;
    camera.updateProjectionMatrix();
    camera.position.set(next.camX, 0, CAM.z);
    camera.lookAt(next.camX, 0, 0);
    root.scale.setScalar(next.scale);

    const prevAnchorLocal = anchorLocal;
    view = next;
    anchorLocal = next.anchorY / next.scale;

    const desiredCardY = anchorLocal - anchorToCard;
    const shift = desiredCardY - cardBody.translation().y;
    if (Math.abs(shift) > 1e-4 || Math.abs(anchorLocal - prevAnchorLocal) > 1e-4) {
      anchorBody.setTranslation({ x: 0, y: anchorLocal, z: 0 }, true);
      for (const body of [...ropeBodies, claspBody, cardBody]) {
        const p = body.translation();
        body.setTranslation({ x: p.x, y: p.y + shift, z: p.z }, true);
      }
    }
  };

  applyLayout();
  const ro = new ResizeObserver(applyLayout);
  ro.observe(container);

  /* ---- pointer: click vs drag + twist + elastic pull ------------------- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const camDir = new THREE.Vector3();
  const dragPlane = new THREE.Plane();
  const planeHit = new THREE.Vector3();
  const worldCardPos = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();
  const dragTarget = new THREE.Vector3();
  const prevDragTarget = new THREE.Vector3();
  const dragVel = new THREE.Vector3();
  const tmpVel = new THREE.Vector3();
  const tmpWorld = new THREE.Vector3();

  let pointerId = null;
  let pressX = 0;
  let pressY = 0;
  let pressTime = 0;
  let moved = false;
  let lastDragTime = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let dragTwistVelocity = 0;

  const setPointer = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
  };

  const hitCard = (clientX, clientY) => {
    setPointer(clientX, clientY);
    scene.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    strapGeo.computeBoundingSphere();
    return raycaster.intersectObjects([coreMesh, strapMesh], false).length > 0;
  };

  const beginDrag = (e) => {
    dragging = true;
    moved = true;
    canvas.classList.add('is-grabbing');
    canvas.setPointerCapture(e.pointerId);

    cardGroup.updateWorldMatrix(true, false);
    cardGroup.getWorldPosition(worldCardPos);
    camera.getWorldDirection(camDir);
    dragPlane.setFromNormalAndCoplanarPoint(camDir, worldCardPos);

    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    setPointer(e.clientX, e.clientY);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
      dragOffset.copy(worldCardPos).sub(planeHit);
    } else {
      dragOffset.set(0, 0, 0);
    }
    dragTarget.copy(cardPos);
    prevDragTarget.copy(cardPos);
    dragVel.set(0, 0, 0);
    lastDragTime = performance.now();
    dragTwistVelocity = 0;
    cardBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('is-grabbing');
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;
    canvas.style.touchAction = '';

    tmpVel.copy(dragVel);
    if (tmpVel.length() > ACT.maxReleaseSpeed) tmpVel.setLength(ACT.maxReleaseSpeed);
    cardBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    cardBody.setLinvel({ x: tmpVel.x, y: tmpVel.y, z: tmpVel.z }, true);
    dragTwistVelocity *= 0.45;
    cardBody.setAngvel(
      { x: 0, y: 0, z: THREE.MathUtils.clamp(-tmpVel.x * 0.14, -2.5, 2.5) },
      true,
    );
    ropeBodies.forEach((body) => body.wakeUp());
    claspBody.wakeUp();
  };

  const onPointerDown = (e) => {
    if (dragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!hitCard(e.clientX, e.clientY)) return;
    e.preventDefault();
    pointerId = e.pointerId;
    canvas.setPointerCapture(pointerId);
    if (e.pointerType === 'touch') canvas.style.touchAction = 'none';
    pressX = e.clientX;
    pressY = e.clientY;
    pressTime = performance.now();
    moved = false;
  };

  const onPointerMove = (e) => {
    if (pointerId === null) {
      if (e.pointerType !== 'touch') {
        canvas.classList.toggle('is-hovering', hitCard(e.clientX, e.clientY));
      }
      return;
    }
    if (e.pointerId !== pointerId) return;

    const threshold = e.pointerType === 'touch' ? ACT.dragThresholdTouch : ACT.dragThresholdMouse;
    if (!dragging) {
      if (Math.hypot(e.clientX - pressX, e.clientY - pressY) < threshold) return;
      beginDrag(e);
    }

    const pointerDeltaX = e.clientX - lastPointerX;
    const pointerDeltaY = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    // Horizontal & vertical pointer movement twists the ribbon along its axis
    dragTwistVelocity = THREE.MathUtils.clamp(
      dragTwistVelocity * 0.75 + (pointerDeltaX - pointerDeltaY * 0.25) * 0.015,
      -0.22,
      0.22,
    );
    strapTwist = THREE.MathUtils.clamp(strapTwist + dragTwistVelocity, -Math.PI * 1.15, Math.PI * 1.15);
    if (Math.abs(dragTwistVelocity) > 0.0001) {
      cardBody.applyTorqueImpulse({ x: 0, y: dragTwistVelocity * 0.022, z: -dragTwistVelocity * 0.015 }, true);
    }

    setPointer(e.clientX, e.clientY);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return;

    tmpWorld.copy(planeHit).add(dragOffset);
    root.worldToLocal(tmpWorld);
    dragTarget.set(
      THREE.MathUtils.clamp(tmpWorld.x, -80, 80),
      THREE.MathUtils.clamp(tmpWorld.y, -80, anchorLocal + 80),
      THREE.MathUtils.clamp(tmpWorld.z, -12, 12),
    );

    const fromAnchor = dragTarget.clone().sub(new THREE.Vector3(0, anchorLocal, 0));
    const distance = fromAnchor.length();
    // Allow slight elastic over-pull beyond rest length so stretch is felt & seen
    const restReach = anchorToCard;
    const maxElasticReach = anchorToCard * 1.16;
    if (distance > maxElasticReach) {
      fromAnchor.setLength(maxElasticReach);
      dragTarget.set(fromAnchor.x, anchorLocal + fromAnchor.y, fromAnchor.z);
    }

    const effectiveDist = Math.min(distance, maxElasticReach);
    const tension = THREE.MathUtils.clamp(
      (effectiveDist / restReach - 0.72) / 0.44,
      0,
      1,
    );
    strapStretch = THREE.MathUtils.damp(strapStretch, tension, 14, 1 / 60);
    cardBody.setNextKinematicTranslation(dragTarget);

    const now = performance.now();
    const dt = Math.max((now - lastDragTime) / 1000, 1 / 120);
    tmpVel.copy(dragTarget).sub(prevDragTarget).divideScalar(dt);
    dragVel.lerp(tmpVel, 0.35);
    prevDragTarget.copy(dragTarget);
    lastDragTime = now;
  };

  const onPointerUp = (e) => {
    if (e.pointerId !== pointerId) return;
    const wasDragging = dragging;
    if (wasDragging) endDrag();
    else {
      if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
      pointerId = null;
      canvas.style.touchAction = '';
      if (!moved && performance.now() - pressTime < ACT.clickMaxMs) startFlip();
    }
  };

  const onPointerCancel = (e) => {
    if (e.pointerId !== pointerId) return;
    if (dragging) endDrag();
    else {
      pointerId = null;
      canvas.style.touchAction = '';
    }
  };

  const onTouchMove = (e) => {
    if (dragging) e.preventDefault();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });

  cardBody.applyImpulse({ x: 0.18, y: 0, z: 0 }, true);

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
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('touchmove', onTouchMove);

    world.free();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        if (m.normalMap) m.normalMap.dispose();
        m.dispose();
      });
    });
    envRT.dispose();
    pmrem.dispose();
    renderer.dispose();
    canvas.remove();
    if (window.lanyard && window.lanyard.destroy === destroy) window.lanyard = null;
  };

  return { destroy };
}

/* ------------------------------------------------------------------------- *
 * Procedural woven strap texture with repeating LUMINICA watermark
 * ------------------------------------------------------------------------- */
function makeStrapTextures(maxAniso) {
  const h = 512;
  const w = 1024;
  const tileLength = CONFIG.strap.tileLength;

  const map = document.createElement('canvas');
  map.width = w;
  map.height = h;
  const g = map.getContext('2d');

  // Deep obsidian weave base with subtle satin depth
  g.fillStyle = CONFIG.colors.strapBase;
  g.fillRect(0, 0, w, h);

  // Fine woven microtexture across the ribbon
  for (let x = -h; x < w + h; x += 6) {
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + h, h);
    g.stroke();

    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.moveTo(x + 3, 0);
    g.lineTo(x + 3 - h, h);
    g.stroke();
  }
  for (let y = 0; y < h; y += 3) {
    g.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.032)';
    g.fillRect(0, y, w, 1);
  }

  // Refined stitched edge border
  const border = Math.round(h * 0.055);
  g.fillStyle = CONFIG.colors.strapEdge;
  g.fillRect(0, 0, w, border);
  g.fillRect(0, h - border, w, border);

  g.setLineDash([12, 8]);
  g.strokeStyle = 'rgba(205,214,226,0.52)';
  g.lineWidth = 2;
  for (const y of [border * 1.6, h - border * 1.6]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.setLineDash([]);

  // Repeating LUMINICA watermark aligned cleanly along the strap
  g.save();
  g.translate(0, h / 2);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 84px "Manrope", "Arial", sans-serif';
  g.fillStyle = 'rgba(245,247,250,0.9)';
  g.shadowColor = 'rgba(0,0,0,0.65)';
  g.shadowBlur = 4;

  const positions = [w * 0.25, w * 0.75];
  for (const px of positions) {
    g.fillText(CONFIG.strap.label, px, 2);
  }
  g.restore();

  // Woven normal map
  const nrm = document.createElement('canvas');
  nrm.width = w;
  nrm.height = h;
  const ng = nrm.getContext('2d');
  ng.fillStyle = '#8080ff';
  ng.fillRect(0, 0, w, h);
  for (let x = -h; x < w + h; x += 6) {
    ng.strokeStyle = 'rgba(255,140,255,0.3)';
    ng.lineWidth = 1.5;
    ng.beginPath();
    ng.moveTo(x, 0);
    ng.lineTo(x + h, h);
    ng.stroke();

    ng.strokeStyle = 'rgba(0,140,255,0.3)';
    ng.beginPath();
    ng.moveTo(x, 0);
    ng.lineTo(x - h, h);
    ng.stroke();
  }

  const mapTex = new THREE.CanvasTexture(map);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.wrapS = THREE.RepeatWrapping;
  mapTex.wrapT = THREE.ClampToEdgeWrapping;
  mapTex.anisotropy = maxAniso;

  const nrmTex = new THREE.CanvasTexture(nrm);
  nrmTex.wrapS = THREE.RepeatWrapping;
  nrmTex.wrapT = THREE.ClampToEdgeWrapping;
  nrmTex.anisotropy = maxAniso;

  return { map: mapTex, normalMap: nrmTex, tileLength };
}

function makeLabelTexture(label, maxAniso) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 716;
  const g = c.getContext('2d');
  g.fillStyle = '#6f747c';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(28,30,34,0.55)';
  g.lineWidth = 12;
  g.strokeRect(24, 24, c.width - 48, c.height - 48);
  g.fillStyle = '#1c1e22';
  g.font = '700 84px "DM Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, c.width / 2, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/* ------------------------------------------------------------------------- *
 * Helpers
 * ------------------------------------------------------------------------- */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function roundedShape(w, h, r, slotY, card) {
  const shape = new THREE.Shape();
  roundedPath(shape, 0, 0, w, h, r);
  shape.holes.push(
    roundedPath(new THREE.Path(), 0, slotY, card.slotWidth, card.slotHeight, card.slotHeight / 2),
  );
  return shape;
}

function roundedPath(path, cx, cy, w, h, r) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + rr);
  path.lineTo(x + w, y + h - rr);
  path.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  path.lineTo(x + rr, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - rr);
  path.lineTo(x, y + rr);
  path.quadraticCurveTo(x, y, x + rr, y);
  return path;
}

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

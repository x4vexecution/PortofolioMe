/**
 * Hanging lanyard ID badge for the portfolio hero.
 *
 * Mount:   <div id="lanyard" class="hero-lanyard" aria-hidden="true"></div>
 * Script:  <script type="module" src="/scripts/lanyard.js"></script>
 * Deps:    three + @dimforge/rapier3d-compat, pinned in the <script type="importmap">.
 *
 * Exposes window.lanyard = { destroy } once mounted, and exports createLanyard()
 * so a bundler/framework can mount it manually.
 *
 * Everything below runs in a "local" unit space where the card is `card.width`
 * wide. A single root group is scaled on resize so the badge keeps the right
 * size on any screen, and the physics never has to be rebuilt.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------------- *
 * Config — every tunable lives here
 * ------------------------------------------------------------------------- */
const CONFIG = {
  /* Card, in local units. Portrait 1:1.4. */
  card: {
    width: 3,
    height: 4.2,            // 1.4 * width
    thickness: 0.13,        // chunkier lacquered frame
    cornerRadius: 0.2,
    slotWidth: 0.72,        // badge slot, top centre
    slotHeight: 0.2,
    slotInset: 0.42,        // slot centre distance from the card top edge
    clearcoat: 0.6,
    roughness: 0.35,
  },

  /* Strap ribbon */
  strap: {
    width: 0.48,            // slimmer premium ribbon: 0.16 * card width
    thickness: 0.03,        // real thickness, rounded bevel edges
    samples: 56,            // ribbon length segments
    tileWidths: 4,          // texture tile length = tileWidths * width
    roughness: 0.75,
    text: 'Alfari Yusuf',
  },

  /* Physics. Units are local; gravity is tuned for the badge feel. */
  physics: {
    gravity: -40,
    linearDamping: 1.5,     // released drag swings 2-3 times, settles ~3s
    angularDamping: 3.0,
    ropeSegments: 5,        // 4-5 rigid links anchor -> crimp
    ropeSegmentLength: 0.62,
    claspLength: 0.50,      // second joint: crimp -> clasp -> card slot
    ropeDensity: 40,
    claspDensity: 20,
    cardDensity: 0.25,
    solverIterations: 12,
    maxPhysicsSteps: 5,     // per frame; mobile capped at 2
    maxStepsMobile: 2,
    fixedStep: 1 / 60,
    swaySpeed: 0.9,         // idle sway frequency
    swayImpulse: 0.004,     // idle sway strength (tiny)
    twistStiffness: 5,      // torsion spring: untwists the strap after a spin
    swayYaw: 0.04,          // idle yaw sway so the strap twists a little on its own
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
    mobileCardWidth: 0.68,  // oversized portrait badge; intentionally bleeds past the viewport
    mobileRight: 0.80,      // badge centre sits near the right edge on phones
    mobileVerticalBias: 0.02, // keep the card around the visual centre, like the reference
    desktopCardWidth: 0.25, // card width / canvas width on desktop
    desktopRight: 0.72,     // card centre as a fraction of canvas width
    verticalBias: -0.25,    // card centre target, fraction of visible height
    anchorMargin: 0.4,      // world units the anchor stays above the top edge
    fit: 0.94,              // max fraction of the visible height the chain uses
  },

  /* Interaction */
  interaction: {
    dragThresholdMouse: 6,  // px before a press becomes a drag
    dragThresholdTouch: 10,
    clickMaxMs: 300,        // press shorter than this + no drag = click/flip
    flipDuration: 600,      // ms, easeInOutCubic
    maxReleaseSpeed: 14,
  },

  /* Palette: graphite / silver */
  colors: {
    strapBase: '#0c0d10',
    strapHighlight: '#ffffff',
    strapStitch: '#aeb5c0',
    strapBorder: '#08090c',
    metal: 0xe9edf3,
    gold: 0xc8a45a,
    cardEdge: 0x08090c,
    key: 0xffffff,
    rim: 0x6f8dff,
    ambient: 0xffffff,
  },

  /* Your card art. Missing files fall back to a labelled grey face. */
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
  const FACE_Z = T / 2 + 0.024; // clears the extruded bevel
  const RING_Z = T / 2 + 0.075; // split ring lies on the badge face
  const CLASP_Z = T / 2 + 0.1;  // clasp rests on the front, not inside the card
  const FACE_W = W - 0.16;      // art inset -> black lacquer bezel
  const FACE_H = H - 0.16;

  const ropeLen = PHYS.ropeSegments * PHYS.ropeSegmentLength;
  const claspLen = PHYS.claspLength;
  const anchorToCard = ropeLen + claspLen + slotY; // anchor y -> card centre y

  /* ---- renderer ---------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
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
  scene.environmentIntensity = 0.9;

  scene.add(new THREE.AmbientLight(CONFIG.colors.ambient, 0.5));
  const key = new THREE.DirectionalLight(CONFIG.colors.key, 2.4);
  key.position.set(5, 9, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(CONFIG.colors.rim, 1.7);
  rim.position.set(-7, -3, -8);
  scene.add(rim);

  /* ---- layout (world units) ---------------------------------------------- */
  const root = new THREE.Group();
  scene.add(root);

  // Visual-only entrance: the entire assembly drops together, so the existing
  // Rapier constraints and all interaction state remain untouched.
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const introOffset = reduceMotion ? 0 : 0; // assigned after the first layout is known
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
    // Never let the chain (rope + clasp + card) be taller than the canvas.
    scale = Math.min(scale, (LAY.fit * visibleH) / (ropeLen + claspLen + H));

    const camX = (0.5 - (mobile ? LAY.mobileRight : LAY.desktopRight)) * visibleW;
    const verticalBias = mobile ? (LAY.mobileVerticalBias ?? LAY.verticalBias) : LAY.verticalBias;
    const anchorY = Math.max(
      visibleH / 2 + LAY.anchorMargin,
      verticalBias * visibleH + anchorToCard * scale,
    );

    return { w, h, aspect, visibleH, visibleW, scale, camX, anchorY };
  };

  let view = computeLayout();
  introDistance = reduceMotion ? 0 : (view.visibleH / view.scale) * 0.72;
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
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          // Cover the portrait card without distorting the source image.
          // Crop only the excess dimension and keep the image centered.
          const image = tex.image;
          const imageAspect = (image?.naturalWidth || image?.width || 1) /
            (image?.naturalHeight || image?.height || 1);
          const cardAspect = FACE_W / FACE_H;
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
        () => resolve(null), // missing file -> labelled fallback face
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

  const flipGroup = new THREE.Group(); // visual flip only, physics untouched
  cardGroup.add(flipGroup);

  const envTex = envRT.texture;
  const edgeMat = new THREE.MeshPhysicalMaterial({
    color: CONFIG.colors.cardEdge,
    roughness: 0.22,
    metalness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  edgeMat.envMap = envTex;
  edgeMat.envMapIntensity = 0.9;
  const faceMat = (map) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    });
    m.envMap = envTex;
    m.envMapIntensity = 0.35;
    return m;
  };
  const chromeMat = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.metal,
    metalness: 1,
    roughness: 0.1,
    envMap: envTex,
    envMapIntensity: 1.7,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.gold,
    metalness: 1,
    roughness: 0.2,
    envMap: envTex,
    envMapIntensity: 1.5,
  });

  const coreGeo = new THREE.ExtrudeGeometry(roundedShape(W, H, CARD.cornerRadius, slotY, CARD), {
    depth: T,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 4,
    curveSegments: 12,
    steps: 1,
  });
  coreGeo.translate(0, 0, -T / 2);

  const faceGeo = new THREE.ShapeGeometry(
    roundedShape(FACE_W, FACE_H, CARD.cornerRadius - 0.06, slotY, CARD),
    12,
  );
  normalizeShapeUV(faceGeo, FACE_W, FACE_H);

  // polished chrome rim wrapped around the lacquer frame
  const trimShape = new THREE.Shape();
  roundedPath(trimShape, 0, 0, W + 0.09, H + 0.09, CARD.cornerRadius + 0.05);
  trimShape.holes.push(roundedPath(new THREE.Path(), 0, 0, W + 0.03, H + 0.03, CARD.cornerRadius + 0.02));
  const trimGeo = new THREE.ExtrudeGeometry(trimShape, {
    depth: T + 0.03,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 3,
    curveSegments: 12,
  });
  trimGeo.translate(0, 0, -(T + 0.03) / 2);

  const coreMesh = new THREE.Mesh(coreGeo, edgeMat);
  const trimMesh = new THREE.Mesh(trimGeo, chromeMat);
  const frontMesh = new THREE.Mesh(faceGeo, faceMat(frontMap));
  frontMesh.position.z = FACE_Z;
  const backMesh = new THREE.Mesh(faceGeo, faceMat(backMap));
  backMesh.position.z = -FACE_Z;
  backMesh.rotation.y = Math.PI; // face outward; UVs then read correctly
  flipGroup.add(coreMesh, trimMesh, frontMesh, backMesh);

  /* ---- hardware ---------------------------------------------------------- */
  // Chrome slot bezel (does not flip with the card).
  const grommetShape = new THREE.Shape();
  roundedPath(grommetShape, 0, 0, CARD.slotWidth + 0.14, CARD.slotHeight + 0.14, (CARD.slotHeight + 0.14) / 2);
  grommetShape.holes.push(
    roundedPath(new THREE.Path(), 0, 0, CARD.slotWidth - 0.06, CARD.slotHeight - 0.06, (CARD.slotHeight - 0.06) / 2),
  );
  const grommetGeo = new THREE.ExtrudeGeometry(grommetShape, {
    depth: T + 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 14,
  });
  grommetGeo.translate(0, slotY, -(T + 0.05) / 2);
  cardGroup.add(new THREE.Mesh(grommetGeo, chromeMat));

  // Split ring through the slot: two slightly offset tori.
  const ringGeo = new THREE.TorusGeometry(0.13, 0.022, 12, 32);
  const ringA = new THREE.Mesh(ringGeo, chromeMat);
  ringA.position.set(0, slotY, RING_Z);
  ringA.rotation.x = 0.18;
  const ringB = new THREE.Mesh(ringGeo, chromeMat);
  ringB.position.set(0, slotY, -RING_Z);
  ringB.rotation.x = -0.18;
  cardGroup.add(ringA, ringB);

  // Chrome crimp with gold inlay at the strap end (follows the strap frame).
  const crimpGroup = new THREE.Group();
  const crimpShape = new THREE.Shape();
  roundedPath(crimpShape, 0, 0, 0.78, 0.46, 0.1);
  const crimpGeo = new THREE.ExtrudeGeometry(crimpShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 4,
    curveSegments: 12,
  });
  crimpGeo.translate(0, 0, -0.07);
  crimpGroup.add(new THREE.Mesh(crimpGeo, chromeMat));
  const inlayShape = new THREE.Shape();
  roundedPath(inlayShape, 0, 0, 0.5, 0.12, 0.04);
  const inlayGeo = new THREE.ExtrudeGeometry(inlayShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 8,
  });
  const inlayF = new THREE.Mesh(inlayGeo, goldMat);
  inlayF.position.z = 0.1;
  const inlayB = new THREE.Mesh(inlayGeo, goldMat);
  inlayB.position.z = -0.1;
  inlayB.rotation.y = Math.PI;
  crimpGroup.add(inlayF, inlayB);
  const rivetGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16).rotateX(Math.PI / 2);
  for (const sx of [-0.28, 0.28]) {
    for (const sy of [-0.15, 0.15]) {
      for (const sz of [1, -1]) {
        const rivet = new THREE.Mesh(rivetGeo, goldMat);
        rivet.position.set(sx, sy, 0.105 * sz);
        crimpGroup.add(rivet);
      }
    }
  }
  root.add(crimpGroup);

  // Swivel lobster-claw clasp, built along +Y from the split ring to the crimp.
  const claspGroup = new THREE.Group();
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 12, 28), chromeMat);
  eye.position.y = -claspLen / 2 + 0.07;
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.022, 12, 28), chromeMat);
  topRing.position.y = claspLen / 2 - 0.03;
  const shankCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -claspLen / 2 + 0.13, 0),
    new THREE.Vector3(0, -0.1, 0.015),
    new THREE.Vector3(0, 0.1, 0.02),
    new THREE.Vector3(0, claspLen / 2 - 0.05, 0),
  ]);
  const shank = new THREE.Mesh(new THREE.TubeGeometry(shankCurve, 24, 0.03, 12, false), chromeMat);
  const gate = new THREE.Mesh(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, -claspLen / 2 + 0.12, 0.03),
      new THREE.Vector3(0.075, -claspLen / 2 + 0.07, 0.02),
      new THREE.Vector3(0.05, -claspLen / 2 + 0.02, 0),
    ]),
    10, 0.016, 8, false,
  ), chromeMat);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 24), goldMat);
  collar.position.y = claspLen / 2 - 0.12;
  claspGroup.add(eye, topRing, shank, gate, collar);
  root.add(claspGroup);

  /* ---- strap ribbon (thick, parallel-transport frames) -------------------- */
  const SAMPLES = STRAP.samples;
  const RING = 8;
  const RIBBON_VERTS = SAMPLES * RING;
  const posArr = new Float32Array(RIBBON_VERTS * 3);
  const nrmArr = new Float32Array(RIBBON_VERTS * 3);
  const uvArr = new Float32Array(RIBBON_VERTS * 2);
  const indices = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    for (let j = 0; j < RING; j++) {
      const a = i * RING + j;
      const b = i * RING + ((j + 1) % RING);
      const c = (i + 1) * RING + j;
      const d = (i + 1) * RING + ((j + 1) % RING);
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
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: STRAP.roughness,
    metalness: 0,
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
      // the clasp only swivels in the swing plane, like a real one
      .enabledRotations(false, false, true),
  );
  // Sensor collider: keeps the clasp's mass without it fighting the card it hangs over.
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
      .enabledRotations(true, true, true), // real 3D: swing, tilt and spin
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(W / 2, H / 2, T / 2).setDensity(PHYS.cardDensity),
    cardBody,
  );
  spherical(claspBody, cardBody, { x: 0, y: -claspLen / 2, z: 0 }, { x: 0, y: slotY, z: 0 });

  /* ---- invisible walls at the frustum edges ------------------------------ */
  const makeWall = (hx, hy, hz) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
    return body;
  };
  const wallLeft = makeWall(0.1, 500, 500);
  const wallRight = makeWall(0.1, 500, 500);
  const wallBottom = makeWall(500, 0.1, 500);

  const dragBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: -3, maxZ: 3 };

  const updateWalls = () => {
    const s = view.scale;
    const left = (view.camX - view.visibleW / 2) / s;
    const right = (view.camX + view.visibleW / 2) / s;
    const bottom = -view.visibleH / 2 / s;
    const top = view.visibleH / 2 / s;

    // Keep safety colliders well outside the visible area. The badge is allowed
    // to travel beyond every viewport edge instead of colliding with canvas walls.
    const marginX = (view.visibleW / s) * 1.35;
    const marginY = (view.visibleH / s) * 1.35;
    wallLeft.setTranslation({ x: left - marginX, y: 0, z: 0 }, true);
    wallRight.setTranslation({ x: right + marginX, y: 0, z: 0 }, true);
    wallBottom.setTranslation({ x: 0, y: bottom - marginY, z: 0 }, true);

    const rx = (W / 2) * 1.02;
    const ry = (H / 2) * 1.02;
    dragBounds.minX = left - marginX + rx;
    dragBounds.maxX = right + marginX - rx;
    dragBounds.minY = bottom - marginY + ry;
    dragBounds.maxY = top + marginY - ry;
  };
  updateWalls();

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

  /* ---- strap update ------------------------------------------------------ */
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

  // flattened hexagon cross-section, counter-clockwise so faces point outward.
  // Edge verts are duplicated so the back face gets its own (un-mirrored) UVs.
  const hw = STRAP.width / 2;
  const ht = STRAP.thickness / 2;
  const e = ht;
  const XS = [
    [-hw, 0],
    [-hw + e, -ht],
    [hw - e, -ht],
    [hw, 0],
    [hw, 0],
    [hw - e, ht],
    [-hw + e, ht],
    [-hw, 0],
  ];
  const V = [1, 0.94, 0.06, 0, 1, 0.94, 0.06, 0];
  const NL = [
    [-0.7, -0.7], [-0.25, -1], [0.25, -1], [0.7, -0.7],
    [0.7, 0.7], [0.25, 1], [-0.25, 1], [-0.7, 0.7],
  ].map(([a, b]) => {
    const l = Math.hypot(a, b);
    return [a / l, b / l];
  });

  // twist ramps in along the free length so the ribbon visibly winds up
  const tN = new THREE.Vector3();
  const tS = new THREE.Vector3();
  const endSide = new THREE.Vector3(1, 0, 0);
  const endNrm = new THREE.Vector3(0, 0, 1);
  const twistAxis = new THREE.Vector3();
  const twistQ = new THREE.Quaternion();
  const twistEase = (t) => {
    const x = Math.min(Math.max((t - 0.12) / 0.88, 0), 1);
    return x * x * (3 - 2 * x);
  };

  const updateStrap = (alpha, twist = 0) => {
    curvePoints[0].set(0, anchorLocal + 1.15, 0);
    curvePoints[1].set(0, anchorLocal, 0);
    for (let i = 0; i < ropeBodies.length; i++) {
      curvePoints[i + 2].lerpVectors(prevRope[i], ropePos[i], alpha);
    }

    let length = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      curve.getPoint(t, tmpPoint);
      curve.getTangent(t, tmpTan);

      if (i === 0) {
        // seed the frame facing the camera, perpendicular to the tangent
        tmpNrm.set(0, 0, 1).addScaledVector(tmpTan, -tmpTan.z);
        if (tmpNrm.lengthSq() < 1e-6) tmpNrm.set(1, 0, 0);
        tmpNrm.normalize();
      } else {
        // parallel transport: rotate the previous frame by the tangent delta
        frameQ.setFromUnitVectors(prevTan, tmpTan);
        tmpNrm.applyQuaternion(frameQ);
        tmpNrm.addScaledVector(tmpTan, -tmpNrm.dot(tmpTan));
        if (tmpNrm.lengthSq() < 1e-6) tmpNrm.set(0, 0, 1);
        tmpNrm.normalize();
      }
      // right-handed frame (side, normal, tangent) keeps the face winding outward
      tmpSide.crossVectors(tmpNrm, tmpTan).normalize();
      prevTan.copy(tmpTan);

      if (i > 0) length += tmpPoint.distanceTo(tmpPrev);
      tmpPrev.copy(tmpPoint);

      const u = length / tileLength;
      const k = twist * twistEase(t);
      if (k !== 0) {
        twistAxis.copy(tmpTan).negate();
        twistQ.setFromAxisAngle(twistAxis, k);
        tN.copy(tmpNrm).applyQuaternion(twistQ);
        tS.copy(tmpSide).applyQuaternion(twistQ);
      } else {
        tN.copy(tmpNrm);
        tS.copy(tmpSide);
      }
      for (let j = 0; j < RING; j++) {
        const o = (i * RING + j) * 3;
        const x = XS[j][0];
        const y = XS[j][1];
        posArr[o] = tmpPoint.x + tS.x * x + tN.x * y;
        posArr[o + 1] = tmpPoint.y + tS.y * x + tN.y * y;
        posArr[o + 2] = tmpPoint.z + tS.z * x + tN.z * y;

        nrmArr[o] = tS.x * NL[j][0] + tN.x * NL[j][1];
        nrmArr[o + 1] = tS.y * NL[j][0] + tN.y * NL[j][1];
        nrmArr[o + 2] = tS.z * NL[j][0] + tN.z * NL[j][1];

        const uvO = (i * RING + j) * 2;
        uvArr[uvO] = u;
        uvArr[uvO + 1] = V[j];
      }
    }
    endSide.copy(tS);
    endNrm.copy(tN);
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

  let dragging = false; // declared before stepPhysics reads it

  let twistBody = 0;  // unwrapped card yaw about the strap axis (rad)
  let prevTwist = 0;
  const upAxis = new THREE.Vector3(0, 1, 0);
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();
  const nX = new THREE.Vector3();
  const yawQ = new THREE.Quaternion();
  const clampNrm = new THREE.Vector3();

  const stepPhysics = () => {
    simTime += PHYS.fixedStep;
    if (!dragging) {
      // tiny idle sway; no auto rotation, the card always faces front
      const sway = Math.sin(simTime * PHYS.swaySpeed) * 0.9 + Math.sin(simTime * 1.7 + 1.3) * 0.4;
      cardBody.applyImpulse({ x: sway * PHYS.swayImpulse, y: 0, z: 0 }, true);
      cardBody.applyTorqueImpulse({ x: 0, y: 0, z: Math.sin(simTime * 0.6) * 0.0015 }, true);
      // torsion spring + idle yaw sway about the strap axis
      upAxis.copy(endTangent).negate();
      const yaw = -PHYS.twistStiffness * twistBody * PHYS.fixedStep + Math.sin(simTime * 0.5) * PHYS.swayYaw * PHYS.fixedStep;
      cardBody.applyTorqueImpulse({ x: upAxis.x * yaw, y: upAxis.y * yaw, z: upAxis.z * yaw }, true);
    }
    prevCardPos.copy(cardPos);
    prevCardQuat.copy(cardQuat);
    prevClaspPos.copy(claspPos);
    prevClaspQuat.copy(claspQuat);
    for (let i = 0; i < ropeBodies.length; i++) prevRope[i].copy(ropePos[i]);
    prevTwist = twistBody;
    world.step();
    readBodies();
    // signed angle of the card normal around the strap axis, accumulated across turns
    nA.copy(endTangent).negate();
    nB.set(0, 0, 1).applyQuaternion(cardQuat);
    nB.addScaledVector(nA, -nB.dot(nA));
    nC.set(0, 0, 1).addScaledVector(nA, -nA.z);
    if (nB.lengthSq() > 1e-6 && nC.lengthSq() > 1e-6) {
      nB.normalize();
      nC.normalize();
      const raw = Math.atan2(nA.dot(nX.crossVectors(nC, nB)), nC.dot(nB));
      let d = raw - twistBody;
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      twistBody += d;
    }
  };

  const endBasis = new THREE.Matrix4();

  const render = (alpha, now) => {
    cardGroup.position.lerpVectors(prevCardPos, cardPos, alpha);
    cardGroup.quaternion.slerpQuaternions(prevCardQuat, cardQuat, alpha);

    if (flip.active) {
      const t = Math.min((now - flip.start) / ACT.flipDuration, 1);
      flipGroup.rotation.y = flip.from + (flip.to - flip.from) * easeInOutCubic(t);
      if (t >= 1) flip.active = false;
    }

    const twistNow = THREE.MathUtils.lerp(prevTwist, twistBody, alpha) + flipGroup.rotation.y;
    updateStrap(alpha, twistNow);

    // crimp follows the strap end, sitting just above the card's top edge
    strapEndDir.copy(endTangent).negate();
    crimpGroup.position.copy(curvePoints[curvePoints.length - 1]).addScaledVector(strapEndDir, 0.07);
    endBasis.makeBasis(endSide, strapEndDir, endNrm);
    crimpGroup.quaternion.setFromRotationMatrix(endBasis);

    // clasp swings with the physics body and twists with the card
    claspGroup.position.lerpVectors(prevClaspPos, claspPos, alpha);
    claspGroup.quaternion.slerpQuaternions(prevClaspQuat, claspQuat, alpha);
    claspGroup.quaternion.multiply(yawQ.setFromAxisAngle(UP_AXIS, twistNow));
    clampNrm.set(0, 0, 1).applyQuaternion(claspGroup.quaternion);
    claspGroup.position.addScaledVector(clampNrm, CLASP_Z);

    if (introPlayed && introStart > 0 && introDistance > 0) {
      const elapsed = (now - introStart) / 1000;
      const duration = 1.65;
      if (elapsed < duration) {
        const t = elapsed / duration;
        // Damped spring: quick drop, small overshoot, then a soft settle.
        root.position.y = introDistance * Math.exp(-5.2 * t) * Math.cos(8.2 * t);
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
    if (steps === maxSteps) accumulator = 0; // drop the backlog
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

    // Keep the chain together and put the card back where the layout wants it.
    const desiredCardY = anchorLocal - anchorToCard;
    const shift = desiredCardY - cardBody.translation().y;
    if (Math.abs(shift) > 1e-4 || Math.abs(anchorLocal - prevAnchorLocal) > 1e-4) {
      anchorBody.setTranslation({ x: 0, y: anchorLocal, z: 0 }, true);
      for (const body of [...ropeBodies, claspBody, cardBody]) {
        const p = body.translation();
        body.setTranslation({ x: p.x, y: p.y + shift, z: p.z }, true);
      }
    }
    updateWalls();
  };

  applyLayout();
  const ro = new ResizeObserver(applyLayout);
  ro.observe(container);

  /* ---- pointer: click vs drag -------------------------------------------- */
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
  const dragBodies = [...ropeBodies, claspBody, cardBody];
  let pressX = 0;
  let pressY = 0;
  let pressTime = 0;
  let moved = false;
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
    // The ribbon is a real hit target too, so users can start a pull anywhere
    // along the visible lanyard. Refresh its bounds because its vertices move.
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
    // Temporarily drive every link as a kinematic chain. This lets the badge
    // follow the pointer freely while the ribbon visibly lengthens with it.
    for (const body of dragBodies) {
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    }
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
    // Return the complete chain to Rapier. The fixed joints pull the stretched
    // ribbon back naturally, producing a spring-like recoil on release.
    for (const body of dragBodies) {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      body.setLinvel({ x: tmpVel.x, y: tmpVel.y, z: tmpVel.z }, true);
      body.wakeUp();
    }
    // the card swings; it should not spin in its own plane
    cardBody.setAngvel(
      { x: 0, y: THREE.MathUtils.clamp(tmpVel.x * 0.4, -6, 6), z: THREE.MathUtils.clamp(-tmpVel.x * 0.12, -2, 2) },
      true,
    );
  };

  const onPointerDown = (e) => {
    if (dragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!hitCard(e.clientX, e.clientY)) return;
    e.preventDefault();
    pointerId = e.pointerId;
    canvas.setPointerCapture(pointerId);
    // set at gesture start so the browser keeps the pan for us, not the page
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

    setPointer(e.clientX, e.clientY);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return;

    tmpWorld.copy(planeHit).add(dragOffset);
    root.worldToLocal(tmpWorld);
    // Keep the badge inside the visible canvas, but remove the old rope-length
    // clamp: the complete chain is repositioned along the anchor-to-card line.
    dragTarget.set(
      THREE.MathUtils.clamp(tmpWorld.x, dragBounds.minX, dragBounds.maxX),
      THREE.MathUtils.clamp(tmpWorld.y, dragBounds.minY, dragBounds.maxY),
      THREE.MathUtils.clamp(tmpWorld.z, dragBounds.minZ, dragBounds.maxZ),
    );
    const dx = dragTarget.x;
    const dy = dragTarget.y - anchorLocal;
    const dz = dragTarget.z;
    const placeAlongChain = (body, distanceFromAnchor) => {
      const t = distanceFromAnchor / anchorToCard;
      body.setNextKinematicTranslation({
        x: dx * t,
        y: anchorLocal + dy * t,
        z: dz * t,
      });
    };
    for (let i = 0; i < ropeBodies.length; i++) {
      placeAlongChain(ropeBodies[i], L * (i + 0.5));
    }
    placeAlongChain(claspBody, ropeLen + claspLen / 2);
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

  // Let the page scroll on mobile unless the finger is actually dragging the card.
  const onTouchMove = (e) => {
    if (dragging) e.preventDefault();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });

  // small kick so it starts swinging on load
  cardBody.applyImpulse({ x: 0.3, y: 0, z: 0 }, true);
  cardBody.applyTorqueImpulse({ x: 0, y: 0.6, z: 0 }, true);

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
 * Procedural textures
 * ------------------------------------------------------------------------- */
// Grey woven ribbon with printed text, edge stripes and stitching.
function makeStrapTextures(maxAniso) {
  const h = 256;
  const w = h * CONFIG.strap.tileWidths;
  const tileLength = CONFIG.strap.width * CONFIG.strap.tileWidths;

  const map = document.createElement('canvas');
  map.width = w;
  map.height = h;
  const g = map.getContext('2d');

  g.fillStyle = CONFIG.colors.strapBase;
  g.fillRect(0, 0, w, h);

  // woven herringbone: crossing diagonal ridges + weft
  for (let x = -h; x < w + h; x += 7) {
    g.strokeStyle = 'rgba(139,144,153,0.10)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + h, h);
    g.stroke();
    g.strokeStyle = 'rgba(16,18,22,0.16)';
    g.beginPath();
    g.moveTo(x + 3, 0);
    g.lineTo(x + 3 - h, h);
    g.stroke();
  }
  for (let y = 0; y < h; y += 4) {
    g.fillStyle = 'rgba(255,255,255,0.025)';
    g.fillRect(0, y, w, 1);
  }

  // darker border stripe on both edges
  const border = Math.round(h * 0.055);
  g.fillStyle = CONFIG.colors.strapBorder;
  g.fillRect(0, 0, w, border);
  g.fillRect(0, h - border, w, border);

  // stitched line 3px inside each edge
  g.setLineDash([h * 0.05, h * 0.04]);
  g.strokeStyle = CONFIG.colors.strapStitch;
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  for (const y of [border * 1.9, h - border * 1.9]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.setLineDash([]);
  g.globalAlpha = 1;

  // printed logo + name, running along the strap
  g.save();
  g.translate(w / 2, h / 2);
  g.textBaseline = 'middle';
  const family = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
  const r = h * 0.19;
  const gap = h * 0.12;
  let size = Math.round(h * 0.34);
  g.font = `900 ${size}px ${family}`;
  let textW = g.measureText(CONFIG.strap.text).width;
  const maxW = w * 0.9 - (r * 2 + gap);
  if (textW > maxW) {
    size = Math.round(size * (maxW / textW));
    g.font = `900 ${size}px ${family}`;
    textW = g.measureText(CONFIG.strap.text).width;
  }
  const x0 = -(r * 2 + gap + textW) / 2;
  g.strokeStyle = CONFIG.colors.strapHighlight;
  g.fillStyle = CONFIG.colors.strapHighlight;
  g.lineWidth = h * 0.028;
  g.beginPath();
  g.arc(x0 + r, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.font = `900 ${Math.round(r * 1.3)}px ${family}`;
  g.fillText('F', x0 + r, h * 0.01);
  g.textAlign = 'left';
  g.font = `900 ${size}px ${family}`;
  g.fillText(CONFIG.strap.text, x0 + r * 2 + gap, 0);
  g.restore();

  // matching normal map: two crossing ridge directions
  const nrm = document.createElement('canvas');
  nrm.width = w;
  nrm.height = h;
  const ng = nrm.getContext('2d');
  ng.fillStyle = '#8080ff';
  ng.fillRect(0, 0, w, h);
  for (let x = -h; x < w + h; x += 7) {
    ng.strokeStyle = 'rgba(255,140,255,0.35)';
    ng.lineWidth = 2;
    ng.beginPath();
    ng.moveTo(x, 0);
    ng.lineTo(x + h, h);
    ng.stroke();
    ng.strokeStyle = 'rgba(0,140,255,0.35)';
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

// Grey placeholder face so the front and back are still distinguishable.
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

// Rounded rect path centred on (0,0) with a rounded slot cut near the top.
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

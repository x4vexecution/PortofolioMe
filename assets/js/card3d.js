/*
 * Hero 3D lanyard card.
 * Standalone (no React / no bundler): loads three.js as an ES module from a
 * CDN and runs a small verlet-rope physics sim to swing a draggable ID card.
 *
 * Swap the artwork any time by replacing:
 *   /assets/images/card-front.png
 *   /assets/images/card-back.png
 * Keep them close to the original ratio (recommended 640x896, portrait) so
 * the card doesn't look stretched. Nothing else needs to change.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';

(() => {
  const container = document.getElementById('hero-card3d');
  if (!container || !window.WebGLRenderingContext) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- tunables ----------
  const CARD_W = 1;
  const CARD_H = 1.4;
  const CARD_DEPTH = 0.05;
  const GRAVITY = -9.82;
  const SEGMENT_LENGTH = 0.34;
  const ROPE_POINTS = 6; // index 0 = fixed anchor, last = card attach point
  const CONSTRAINT_ITERATIONS = 10;
  const DAMPING = 0.986;
  const CARD_POINT_INDEX = ROPE_POINTS - 1;
  const basePath = container.dataset.basePath || 'assets/images/';

  let width = container.clientWidth || 300;
  let height = container.clientHeight || 560;

  // ---------- scene ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100);
  camera.position.set(0, 0.55, 9.4);
  camera.lookAt(0, 0.1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const keyLight = new THREE.DirectionalLight(0x9db2ff, 1.3);
  keyLight.position.set(2.4, 4, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x5bd7ef, 0.9);
  rimLight.position.set(-3, -1.2, 2.2);
  scene.add(rimLight);
  const fillLight = new THREE.PointLight(0x7184ff, 0.55, 20);
  fillLight.position.set(-2, 1.6, 3);
  scene.add(fillLight);

  // ---------- card ----------
  const loader = new THREE.TextureLoader();
  const frontTex = loader.load(basePath + 'card-front.png');
  const backTex = loader.load(basePath + 'card-back.png');
  [frontTex, backTex].forEach((t) => {
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  });
  backTex.center.set(0.5, 0.5);
  backTex.repeat.x = -1; // un-mirror the back face (viewed from -z)

  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x0c1220, roughness: 0.45, metalness: 0.55, clearcoat: 0.3 });
  const frontMat = new THREE.MeshPhysicalMaterial({ map: frontTex, roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.2 });
  const backMat = new THREE.MeshPhysicalMaterial({ map: backTex, roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.2 });

  const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_DEPTH);
  const cardMesh = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);

  const clipMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.3, metalness: 0.85 });
  const clipMesh = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 10, 20), clipMat);
  clipMesh.position.set(0, CARD_H / 2 + 0.03, 0);
  clipMesh.rotation.x = Math.PI / 2;

  const cardGroup = new THREE.Group();
  cardGroup.add(cardMesh);
  cardGroup.add(clipMesh);
  scene.add(cardGroup);

  const bandMat = new THREE.MeshStandardMaterial({ color: 0x1b2440, roughness: 0.75, metalness: 0.1 });
  let bandMesh = null;

  // ---------- verlet rope ----------
  const anchor = new THREE.Vector3(0, 2.05, 0);
  const points = [];
  for (let i = 0; i < ROPE_POINTS; i++) {
    const start = prefersReducedMotion
      ? anchor.clone().add(new THREE.Vector3(0, -i * SEGMENT_LENGTH, 0))
      : anchor.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, -i * 0.01, 0));
    points.push({ pos: start.clone(), prev: start.clone(), pinned: i === 0 });
  }

  let dragging = false;
  const dragOffset = new THREE.Vector3();
  const pointerNDC = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const dragPlane = new THREE.Plane();
  const planeHit = new THREE.Vector3();
  let yaw = 0;
  let yawVel = 0;

  function simulate(dt) {
    dt = Math.min(dt, 1 / 30);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.pinned || (dragging && i === CARD_POINT_INDEX)) continue;
      const velocity = p.pos.clone().sub(p.prev).multiplyScalar(DAMPING);
      p.prev.copy(p.pos);
      p.pos.add(velocity);
      p.pos.y += GRAVITY * dt * dt;
    }
    if (dragging) {
      const p = points[CARD_POINT_INDEX];
      p.prev.copy(p.pos);
      p.pos.copy(planeHit).sub(dragOffset);
    }
    for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter++) {
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const delta = b.pos.clone().sub(a.pos);
        const dist = delta.length() || 0.0001;
        const diff = (dist - SEGMENT_LENGTH) / dist;
        const correction = delta.multiplyScalar(0.5 * diff);
        const bIsDraggedCard = dragging && i + 1 === CARD_POINT_INDEX;
        if (!a.pinned) a.pos.add(correction);
        if (!b.pinned && !bIsDraggedCard) b.pos.sub(correction);
      }
    }
  }

  function updateCardTransform(dt) {
    const cardPoint = points[CARD_POINT_INDEX].pos;
    const prevRopePoint = points[CARD_POINT_INDEX - 1].pos;
    cardGroup.position.copy(cardPoint);

    const dir = cardPoint.clone().sub(prevRopePoint).normalize();
    const targetRotZ = -THREE.MathUtils.clamp(dir.x, -0.9, 0.9) * 0.9;
    const targetRotX = THREE.MathUtils.clamp(dir.z, -0.9, 0.9) * 0.6;
    cardGroup.rotation.z += (targetRotZ - cardGroup.rotation.z) * 0.12;
    cardGroup.rotation.x += (targetRotX - cardGroup.rotation.x) * 0.12;

    const vel = cardPoint.clone().sub(points[CARD_POINT_INDEX].prev);
    yawVel += (-vel.x * 0.6 - yaw * 0.08) * dt * 60;
    yawVel *= 0.94;
    yaw += yawVel * dt;
    cardGroup.rotation.y = yaw;
  }

  function updateBand() {
    const pts = points.map((p) => p.pos.clone());
    cardGroup.updateMatrixWorld(true);
    pts.push(cardGroup.localToWorld(clipMesh.position.clone()));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'chordal');
    const tubularSegments = Math.max(24, (pts.length - 1) * 10);
    const geo = new THREE.TubeGeometry(curve, tubularSegments, 0.032, 8, false);
    if (bandMesh) {
      bandMesh.geometry.dispose();
      bandMesh.geometry = geo;
    } else {
      bandMesh = new THREE.Mesh(geo, bandMat);
      scene.add(bandMesh);
    }
  }

  // ---------- pointer / drag ----------
  function setPointerFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function onPointerDown(e) {
    setPointerFromEvent(e);
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(cardMesh, false);
    if (!hits.length) return;
    dragging = true;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    dragPlane.setFromNormalAndCoplanarPoint(camDir, hits[0].point);
    dragOffset.copy(hits[0].point).sub(points[CARD_POINT_INDEX].pos);
  }

  function onPointerMove(e) {
    setPointerFromEvent(e);
    raycaster.setFromCamera(pointerNDC, camera);
    if (!dragging) {
      const hits = raycaster.intersectObject(cardMesh, false);
      renderer.domElement.style.cursor = hits.length ? 'grab' : 'auto';
      return;
    }
    raycaster.ray.intersectPlane(dragPlane, planeHit);
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    renderer.domElement.style.cursor = 'grab';
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---------- resize ----------
  function onResize() {
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(container);

  // ---------- main loop ----------
  let lastTime = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    simulate(dt);
    updateCardTransform(dt);
    updateBand();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
})();

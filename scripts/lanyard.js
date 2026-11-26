// scripts/lanyard.js
import * as THREE from 'three';

const wrapper = document.getElementById('lanyard-wrapper');
const canvas = document.getElementById('lanyard-canvas');

if (wrapper && canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, wrapper.clientWidth / wrapper.clientHeight, 0.1, 100);
  camera.position.set(0, -1.35, 6.2);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Pencahayaan studio agar kartu terlihat tajam & glossy
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
  dirLight.position.set(3, 5, 5);
  scene.add(dirLight);
  const rimLight = new THREE.DirectionalLight(0x88ccff, 0.8);
  rimLight.position.set(-4, -2, -3);
  scene.add(rimLight);

  // Load tekstur depan & belakang dari assets/images/
  const loader = new THREE.TextureLoader();
  const frontTex = loader.load('assets/images/card-front.jpg');
  const backTex = loader.load('assets/images/card-back.jpg');
  frontTex.colorSpace = THREE.SRGBColorSpace;
  backTex.colorSpace = THREE.SRGBColorSpace;

  // Pivot utama di titik gantung paling atas (y = 0.65)
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.65, 0);
  scene.add(pivot);

  // 1. Tali Lanyard (Dinamis mengikuti ayunan kartu)
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0x16181d,
    roughness: 0.7,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  const strapGeo = new THREE.PlaneGeometry(0.16, 1.5, 1, 16);
  const strapMesh = new THREE.Mesh(strapGeo, strapMat);
  pivot.add(strapMesh);

  // 2. Group Kartu + Klip Besi
  const cardHolder = new THREE.Group();
  cardHolder.position.set(0, -1.5, 0);
  pivot.add(cardHolder);

  // Klip penjepit metal di atas kartu
  const clipGeo = new THREE.BoxGeometry(0.26, 0.22, 0.08);
  const clipMat = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, metalness: 0.85, roughness: 0.25 });
  const clipMesh = new THREE.Mesh(clipGeo, clipMat);
  clipMesh.position.set(0, 0.82, 0);
  cardHolder.add(clipMesh);

  // Ukuran kartu ID presisi (rasio 9:15)
  const cardW = 1.05;
  const cardH = 1.65;
  const cardD = 0.025;
  const cardGeo = new THREE.BoxGeometry(cardW, cardH, cardD);

  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1e2028, roughness: 0.4, metalness: 0.3 });
  const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.25, metalness: 0.05 });
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.25, metalness: 0.05 });

  // Urutan material BoxGeometry: +X, -X, +Y, -Y, +Z (Depan), -Z (Belakang)
  const cardMesh = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
  cardMesh.position.set(0, -0.05, 0);
  cardHolder.add(cardMesh);

  // Variabel Fisika Pegas & Interaksi
  let angleZ = 0.12; // Efek ayunan awal saat halaman dibuka
  let velZ = 0;
  let angleX = 0;
  let velX = 0;
  let flipTarget = 0;
  let flipCurrent = 0;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let movedDistance = 0;

  const onDown = (clientX, clientY) => {
    isDragging = true;
    startX = clientX;
    startY = clientY;
    movedDistance = 0;
  };

  const onMove = (clientX, clientY) => {
    if (!isDragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    movedDistance += Math.abs(dx) + Math.abs(dy);

    angleZ = THREE.MathUtils.clamp(dx * 0.0045, -0.65, 0.65);
    angleX = THREE.MathUtils.clamp(dy * 0.0035, -0.45, 0.45);
    velZ = 0;
    velX = 0;
  };

  const onUp = () => {
    if (!isDragging) return;
    isDragging = false;
    // Jika diklik tanpa digeser jauh, balik kartu (depan <-> belakang)
    if (movedDistance < 8) {
      flipTarget += Math.PI;
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    onDown(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // Resize handler otomatis untuk perpindahan Mobile <-> Desktop
  const onResize = () => {
    if (!wrapper.clientWidth || !wrapper.clientHeight) return;
    camera.aspect = wrapper.clientWidth / wrapper.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
  };
  window.addEventListener('resize', onResize);

  // Loop animasi fisika
  function animate() {
    requestAnimationFrame(animate);

    if (!isDragging) {
      const stiffness = 0.045;
      const damping = 0.91;

      velZ += -angleZ * stiffness;
      velZ *= damping;
      angleZ += velZ;

      velX += -angleX * stiffness;
      velX *= damping;
      angleX += velX;
    }

    // Haluskan rotasi flip depan-belakang
    flipCurrent += (flipTarget - flipCurrent) * 0.12;

    pivot.rotation.z = angleZ;
    pivot.rotation.x = angleX;
    cardHolder.rotation.y = flipCurrent + angleZ * 0.6;

    // Posisi tali mengikuti pivot ke klip kartu
    strapMesh.position.set(0, -0.75, 0);

    renderer.render(scene, camera);
  }

  animate();
}

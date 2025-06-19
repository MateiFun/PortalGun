// --- Setup scene, camera, renderer ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 20, 10);
scene.add(light);

// --- Player setup ---
const player = new THREE.Object3D();
player.position.set(0, 1, 0);
scene.add(player);

// Attach camera to player (eyes height)
camera.position.set(0, 1.6, 0);
player.add(camera);

// --- Room ---
const roomSize = 20;
const wallThickness = 0.5;

function createWall(w, h, d, x, y, z, color = 0x888888) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const texture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/checker.png');
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(w / 2, d / 2);
  const mat = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

const floor = createWall(roomSize, wallThickness, roomSize, 0, -wallThickness / 2, 0);
const ceiling = createWall(roomSize, wallThickness, roomSize, 0, roomSize - wallThickness / 2, 0);
const wall1 = createWall(wallThickness, roomSize, roomSize, -roomSize / 2 + wallThickness / 2, roomSize / 2, 0);
const wall2 = createWall(wallThickness, roomSize, roomSize, roomSize / 2 - wallThickness / 2, roomSize / 2, 0);
const wall3 = createWall(roomSize, roomSize, wallThickness, 0, roomSize / 2, -roomSize / 2 + wallThickness / 2);
const wall4 = createWall(roomSize, roomSize, wallThickness, 0, roomSize / 2, roomSize / 2 - wallThickness / 2);

const colliders = [floor, ceiling, wall1, wall2, wall3, wall4];

// --- Bullet Holes ---
const bulletHoles = [];
function createBulletHole(position, normal) {
  const holeGeometry = new THREE.CircleGeometry(0.1, 8);
  const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const hole = new THREE.Mesh(holeGeometry, holeMaterial);
  hole.position.copy(position);
  hole.lookAt(position.clone().add(normal));
  scene.add(hole);
  bulletHoles.push(hole);
}

// --- Gun model ---
const gunGeo = new THREE.BoxGeometry(0.3, 0.2, 0.8);
const gunMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
const gun = new THREE.Mesh(gunGeo, gunMat);
gun.position.set(0.3, -0.2, -0.6);
camera.add(gun);

// --- Portal setup ---
const portalSize = 1.5;
const portalGeo = new THREE.PlaneGeometry(portalSize, portalSize * 2);
const blueMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
const orangeMat = new THREE.MeshBasicMaterial({ color: 0xff6600, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
const bluePortal = new THREE.Mesh(portalGeo, blueMat);
const orangePortal = new THREE.Mesh(portalGeo, orangeMat);
bluePortal.visible = false;
orangePortal.visible = false;
scene.add(bluePortal);
scene.add(orangePortal);
let bluePortalActive = false, orangePortalActive = false;
const raycaster = new THREE.Raycaster();

// --- Controls ---
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'r') ammo = 12;
});
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- Mouse look ---
let yaw = 0, pitch = 0;
document.body.onclick = () => document.body.requestPointerLock();
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === document.body) {
    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  }
});

// --- Player physics ---
const velocity = new THREE.Vector3();
const playerRadius = 0.3;
const playerHeight = 1.6;
const gravity = 0.0005;
let canJump = false;
let ammo = 12;
let isSprinting = false;
let bobTime = 0;

function getPlayerBoundingBox(pos) {
  return new THREE.Box3(
    new THREE.Vector3(pos.x - playerRadius, pos.y, pos.z - playerRadius),
    new THREE.Vector3(pos.x + playerRadius, pos.y + playerHeight, pos.z + playerRadius)
  );
}
function boxIntersects(a, b) {
  return (a.min.x <= b.max.x && a.max.x >= b.min.x) &&
         (a.min.y <= b.max.y && a.max.y >= b.min.y) &&
         (a.min.z <= b.max.z && a.max.z >= b.min.z);
}

// --- Shooting and portals ---
window.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== document.body) return;

  if (e.button === 0 && ammo > 0) {
    const shootRay = new THREE.Raycaster();
    shootRay.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = shootRay.intersectObjects(colliders);
    if (intersects.length > 0) {
      const hit = intersects[0];
      createBulletHole(hit.point, hit.face.normal);
    }
    ammo--;
    gun.position.z = -0.5; // recoil
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'q' || e.key === 'e') {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(colliders);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const portal = e.key === 'q' ? bluePortal : orangePortal;
      portal.position.copy(hit.point);
      portal.lookAt(hit.point.clone().add(hit.face.normal));
      portal.visible = true;
      if (e.key === 'q') bluePortalActive = true;
      else orangePortalActive = true;
    }
  }
});

// --- FPS counter ---
const fpsDiv = document.createElement('div');
fpsDiv.style.position = 'fixed';
fpsDiv.style.left = '10px';
fpsDiv.style.top = '10px';
fpsDiv.style.color = 'white';
document.body.appendChild(fpsDiv);
let lastTime = performance.now(), frameCount = 0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  frameCount++;
  if (now - lastTime > 1000) {
    fpsDiv.textContent = `FPS: ${frameCount} | Ammo: ${ammo}`;
    frameCount = 0;
    lastTime = now;
  }

  player.rotation.y = yaw;
  camera.rotation.x = pitch;

  let moveForward = 0, moveRight = 0;
  if (keys['w']) moveForward += 1;
  if (keys['s']) moveForward -= 1;
  if (keys['d']) moveRight += 1;
  if (keys['a']) moveRight -= 1;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const targetDir = new THREE.Vector3();
  targetDir.addScaledVector(forward, moveForward);
  targetDir.addScaledVector(right, moveRight);
  targetDir.normalize();

  isSprinting = keys['shift'];
  const moveAcceleration = isSprinting ? 0.15 : 0.09;
  const moveFriction = 0.91;

  if (targetDir.lengthSq() > 0) {
    velocity.x += targetDir.x * moveAcceleration;
    velocity.z += targetDir.z * moveAcceleration;
  } else {
    velocity.x *= moveFriction;
    velocity.z *= moveFriction;
  }

  const maxSpeed = isSprinting ? 0.06 : 0.03;
  const hSpeed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
  if (hSpeed > maxSpeed) {
    const scale = maxSpeed / hSpeed;
    velocity.x *= scale;
    velocity.z *= scale;
  }

  velocity.y -= gravity;

  const newPos = player.position.clone().add(velocity);
  const playerBB = getPlayerBoundingBox(newPos);

  for (let obj of colliders) {
    const objBB = new THREE.Box3().setFromObject(obj);
    let temp = player.position.clone();

    temp.x += velocity.x;
    if (boxIntersects(getPlayerBoundingBox(temp), objBB)) velocity.x = 0;

    temp = player.position.clone();
    temp.z += velocity.z;
    if (boxIntersects(getPlayerBoundingBox(temp), objBB)) velocity.z = 0;

    temp = player.position.clone();
    temp.y += velocity.y;
    if (boxIntersects(getPlayerBoundingBox(temp), objBB)) {
      if (velocity.y < 0) canJump = true;
      velocity.y = 0;
    }
  }

  player.position.add(velocity);

  if (keys[' '] && canJump) {
    velocity.y = 0.08;
    canJump = false;
  }

  gun.position.z += (-0.6 - gun.position.z) * 0.1;
  bobTime += hSpeed * 50;
  gun.position.y = -0.2 + Math.sin(bobTime * 0.03) * (isSprinting ? 0.02 : 0.01);

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

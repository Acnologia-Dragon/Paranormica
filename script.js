// Definition of available block types in the game
const BLOCK_TYPES = {
    GRASS: { id: 1, name: 'Grama', topColor: '#557a2b', sideColor: '#5b4028', bottomColor: '#4a331e' },
    DIRT: { id: 2, name: 'Terra', color: '#4a331e' },
    STONE: { id: 3, name: 'Pedra', color: '#737373' },
    COBBLE: { id: 4, name: 'Pedregulho', color: '#525252' },
    WOOD: { id: 5, name: 'Madeira', topColor: '#8a6842', sideColor: '#5c4028', bottomColor: '#8a6842' },
    PLANKS: { id: 6, name: 'Tábuas', color: '#9c774c' },
    LEAVES: { id: 7, name: 'Folhas', color: '#2e5c1e', transparent: true, opacity: 0.9 },
    BRICK: { id: 8, name: 'Tijolo', color: '#8b4513' },
    GLASS: { id: 9, name: 'Vidro', color: '#a0c4ff', transparent: true, opacity: 0.4 },
    GLOWSTONE: { id: 10, name: 'Luz', color: '#ffea00', light: true },
    SAND: { id: 11, name: 'Areia', color: '#d2b48c' },
    SNOW: { id: 12, name: 'Neve', color: '#ffffff' }
};

// Generates procedural canvas textures for blocks
function createBlockTexture(colorHex, pattern = 'noise') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 64, 64);

    if (pattern === 'noise') {
        for (let i = 0; i < 400; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
            ctx.fillRect(Math.floor(Math.random()*64), Math.floor(Math.random()*64), 2, 2);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

// Global Variables
let scene, camera, renderer, controls;
let blocks = new Map();
let materialsMap = {};
let selectedSlotIndex = 0;
let isInventoryOpen = false;
let selectedCatalogBlock = null;

// Hotbar setup with 9 initial default blocks
let hotbarSlots = [
    BLOCK_TYPES.GRASS,
    BLOCK_TYPES.DIRT,
    BLOCK_TYPES.STONE,
    BLOCK_TYPES.COBBLE,
    BLOCK_TYPES.WOOD,
    BLOCK_TYPES.PLANKS,
    BLOCK_TYPES.LEAVES,
    BLOCK_TYPES.BRICK,
    BLOCK_TYPES.GLASS
];

// Physics / Movement variables
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

// Player parameters
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;

init();
animate();

function init() {
    // 1. Scene & Camera Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // 3. Materials Generator
    Object.values(BLOCK_TYPES).forEach(b => {
        if (b.topColor) {
            const topTex = createBlockTexture(b.topColor);
            const sideTex = createBlockTexture(b.sideColor);
            const botTex = createBlockTexture(b.bottomColor);
            materialsMap[b.id] = [
                new THREE.MeshStandardMaterial({ map: sideTex }),
                new THREE.MeshStandardMaterial({ map: sideTex }),
                new THREE.MeshStandardMaterial({ map: topTex }),
                new THREE.MeshStandardMaterial({ map: botTex }),
                new THREE.MeshStandardMaterial({ map: sideTex }),
                new THREE.MeshStandardMaterial({ map: sideTex })
            ];
        } else {
            const tex = createBlockTexture(b.color);
            const matConfig = { map: tex };
            if (b.transparent) {
                matConfig.transparent = true;
                matConfig.opacity = b.opacity;
            }
            if (b.light) {
                matConfig.emissive = new THREE.Color(0xffea00);
                matConfig.emissiveIntensity = 0.5;
            }
            materialsMap[b.id] = new THREE.MeshStandardMaterial(matConfig);
        }
    });

    // 4. Controls
    controls = new THREE.PointerLockControls(camera, document.body);

    const instructions = document.getElementById('instructions');
    instructions.addEventListener('click', () => {
        if (!isInventoryOpen) controls.lock();
    });

    controls.addEventListener('lock', () => {
        instructions.style.display = 'none';
    });

    controls.addEventListener('unlock', () => {
        if (!isInventoryOpen) {
            instructions.style.display = 'flex';
        }
    });

    scene.add(controls.getObject());

    // 5. Event Listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onWindowResize);

    document.getElementById('btn-inventory').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInventory();
    });

    document.getElementById('btn-close-inv').addEventListener('click', () => {
        toggleInventory(false);
    });

    document.getElementById('btn-reset').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Queres apagar todas as tuas construções e restaurar o mundo?')) {
            localStorage.removeItem('minecraft_saved_world');
            location.reload();
        }
    });

    // 6. UI Setup
    loadSavedHotbar();
    buildUIHotbar();
    buildCatalogUI();

    // 7. World Generation
    loadOrGenerateWorld();
}

// World Generation and Storage
function getBlockKey(x, y, z) {
    return `${x},${y},${z}`;
}

function addBlock(x, y, z, type, save = true) {
    const key = getBlockKey(x, y, z);
    if (blocks.has(key)) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, materialsMap[type.id]);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { x, y, z, typeId: type.id };

    scene.add(mesh);
    blocks.set(key, mesh);

    if (save) saveWorld();
}

function removeBlock(x, y, z) {
    const key = getBlockKey(x, y, z);
    if (blocks.has(key)) {
        const mesh = blocks.get(key);
        scene.remove(mesh);
        mesh.geometry.dispose();
        blocks.delete(key);
        saveWorld();
    }
}

function saveWorld() {
    const worldData = [];
    blocks.forEach((mesh) => {
        const { x, y, z, typeId } = mesh.userData;
        worldData.push({ x, y, z, typeId });
    });
    localStorage.setItem('minecraft_saved_world', JSON.stringify(worldData));
}

function loadOrGenerateWorld() {
    const saved = localStorage.getItem('minecraft_saved_world');
    if (saved) {
        const data = JSON.parse(saved);
        data.forEach(b => {
            const type = Object.values(BLOCK_TYPES).find(t => t.id === b.typeId) || BLOCK_TYPES.GRASS;
            addBlock(b.x, b.y, b.z, type, false);
        });
        controls.getObject().position.set(0, 10, 0);
    } else {
        const size = 16;
        for (let x = -size; x < size; x++) {
            for (let z = -size; z < size; z++) {
                addBlock(x, 0, z, BLOCK_TYPES.STONE, false);
                addBlock(x, 1, z, BLOCK_TYPES.DIRT, false);
                addBlock(x, 2, z, BLOCK_TYPES.GRASS, false);

                // Trees
                if (x % 7 === 0 && z % 7 === 0 && Math.abs(x) > 2 && Math.abs(z) > 2) {
                    for (let h = 3; h <= 5; h++) {
                        addBlock(x, h, z, BLOCK_TYPES.WOOD, false);
                    }
                    for (let lx = -1; lx <= 1; lx++) {
                        for (let lz = -1; lz <= 1; lz++) {
                            for (let ly = 5; ly <= 6; ly++) {
                                if (lx === 0 && lz === 0 && ly === 5) continue;
                                addBlock(x + lx, ly, z + lz, BLOCK_TYPES.LEAVES, false);
                            }
                        }
                    }
                }
            }
        }
        controls.getObject().position.set(0, 5, 0);
    }
}

// UI Hotbar and Inventory Setup
function buildUIHotbar() {
    const hotbarEl = document.getElementById('hotbar');
    const targetEl = document.getElementById('inventory-hotbar-target');
    hotbarEl.innerHTML = '';
    targetEl.innerHTML = '';

    for (let i = 0; i < 9; i++) {
        const block = hotbarSlots[i];
        
        // Game Hotbar
        const slot = document.createElement('div');
        slot.className = `slot ${i === selectedSlotIndex ? 'active' : ''}`;
        slot.innerHTML = `
            <span class="slot-number">${i + 1}</span>
            <div class="slot-icon" style="background-color: ${block ? (block.color || block.sideColor) : 'transparent'}"></div>
            <span class="slot-name">${block ? block.name : ''}</span>
        `;
        slot.onclick = () => { selectSlot(i); };
        hotbarEl.appendChild(slot);

        // Modal Target Hotbar
        const targetSlot = document.createElement('div');
        targetSlot.className = 'slot';
        targetSlot.innerHTML = `
            <span class="slot-number">${i + 1}</span>
            <div class="slot-icon" style="background-color: ${block ? (block.color || block.sideColor) : 'transparent'}"></div>
            <span class="slot-name">${block ? block.name : ''}</span>
        `;
        targetSlot.onclick = () => { equipSelectedToSlot(i); };
        targetEl.appendChild(targetSlot);
    }
}

function buildCatalogUI() {
    const catalogEl = document.getElementById('block-catalog');
    catalogEl.innerHTML = '';

    Object.values(BLOCK_TYPES).forEach(b => {
        const item = document.createElement('div');
        item.className = 'catalog-item';
        item.innerHTML = `
            <div class="item-icon" style="background-color: ${b.color || b.sideColor}"></div>
            <div class="item-label">${b.name}</div>
        `;
        item.onclick = () => {
            document.querySelectorAll('.catalog-item').forEach(el => el.classList.remove('selected-for-equip'));
            item.classList.add('selected-for-equip');
            selectedCatalogBlock = b;
        };
        catalogEl.appendChild(item);
    });
}

function equipSelectedToSlot(slotIndex) {
    if (!selectedCatalogBlock) {
        alert('Clica num bloco do catálogo acima primeiro!');
        return;
    }
    hotbarSlots[slotIndex] = selectedCatalogBlock;
    saveHotbar();
    buildUIHotbar();
}

function selectSlot(index) {
    selectedSlotIndex = index;
    buildUIHotbar();
}

function saveHotbar() {
    const data = hotbarSlots.map(b => b.id);
    localStorage.setItem('minecraft_saved_hotbar', JSON.stringify(data));
}

function loadSavedHotbar() {
    const saved = localStorage.getItem('minecraft_saved_hotbar');
    if (saved) {
        const ids = JSON.parse(saved);
        hotbarSlots = ids.map(id => Object.values(BLOCK_TYPES).find(b => b.id === id) || BLOCK_TYPES.GRASS);
    }
}

function toggleInventory(forceState) {
    isInventoryOpen = forceState !== undefined ? forceState : !isInventoryOpen;
    const modal = document.getElementById('inventory-modal');

    if (isInventoryOpen) {
        modal.style.display = 'flex';
        controls.unlock();
    } else {
        modal.style.display = 'none';
        controls.lock();
    }
}

// User Interaction Handling
function onKeyDown(event) {
    if (isInventoryOpen) {
        if (event.code === 'KeyE' || event.code === 'Escape') toggleInventory(false);
        return;
    }

    switch (event.code) {
        case 'KeyW': case 'ArrowUp': moveForward = true; break;
        case 'KeyS': case 'ArrowDown': moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 12; canJump = false; break;
        case 'KeyE': toggleInventory(true); break;
        default:
            if (event.code.startsWith('Digit')) {
                const num = parseInt(event.code.replace('Digit', ''));
                if (num >= 1 && num <= 9) selectSlot(num - 1);
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': case 'ArrowUp': moveForward = false; break;
        case 'KeyS': case 'ArrowDown': moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': moveRight = false; break;
    }
}

function onWheel(event) {
    if (isInventoryOpen) return;
    if (event.deltaY > 0) {
        selectedSlotIndex = (selectedSlotIndex + 1) % 9;
    } else {
        selectedSlotIndex = (selectedSlotIndex - 1 + 9) % 9;
    }
    buildUIHotbar();
}

function onMouseDown(event) {
    if (!controls.isLocked || isInventoryOpen) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const intersects = raycaster.intersectObjects(Array.from(blocks.values()));

    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.distance > 8) return; // Distância máxima de alcance

        const mesh = hit.object;
        const { x, y, z } = mesh.userData;

        if (event.button === 0) {
            // Clique Esquerdo: Partir
            removeBlock(x, y, z);
        } else if (event.button === 2) {
            // Clique Direito: Colocar
            const normal = hit.face.normal;
            const nx = x + Math.round(normal.x);
            const ny = y + Math.round(normal.y);
            const nz = z + Math.round(normal.z);

            // Evita criar bloco dentro do jogador
            const playerPos = controls.getObject().position;
            const minX = Math.floor(playerPos.x - PLAYER_RADIUS);
            const maxX = Math.floor(playerPos.x + PLAYER_RADIUS);
            const minY = Math.floor(playerPos.y - PLAYER_HEIGHT);
            const maxY = Math.floor(playerPos.y);
            const minZ = Math.floor(playerPos.z - PLAYER_RADIUS);
            const maxZ = Math.floor(playerPos.z + PLAYER_RADIUS);

            if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY && nz >= minZ && nz <= maxZ) {
                return;
            }

            const currentBlock = hotbarSlots[selectedSlotIndex];
            if (currentBlock) {
                addBlock(nx, ny, nz, currentBlock);
            }
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Collisions and Physics
function checkCollision(position) {
    const minX = Math.floor(position.x - PLAYER_RADIUS);
    const maxX = Math.floor(position.x + PLAYER_RADIUS);
    const minY = Math.floor(position.y - PLAYER_HEIGHT);
    const maxY = Math.floor(position.y - 0.1);
    const minZ = Math.floor(position.z - PLAYER_RADIUS);
    const maxZ = Math.floor(position.z + PLAYER_RADIUS);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (blocks.has(getBlockKey(x, y, z))) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Render Loop
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);
    prevTime = time;

    if (controls.isLocked) {
        // Gravidade
        velocity.y -= 30.0 * delta;

        // Atrito / Desaceleração
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = 20.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        const playerObj = controls.getObject();

        // Movimento Eixo X
        playerObj.position.x -= velocity.x * delta;
        if (checkCollision(playerObj.position)) {
            playerObj.position.x += velocity.x * delta;
            velocity.x = 0;
        }

        // Movimento Eixo Z
        playerObj.position.z -= velocity.z * delta;
        if (checkCollision(playerObj.position)) {
            playerObj.position.z += velocity.z * delta;
            velocity.z = 0;
        }

        // Movimento Eixo Y (Vertical / Queda / Salto)
        playerObj.position.y += velocity.y * delta;
        if (checkCollision(playerObj.position)) {
            if (velocity.y < 0) {
                canJump = true;
            }
            playerObj.position.y -= velocity.y * delta;
            velocity.y = 0;
        }

        // Limite inferior do mundo
        if (playerObj.position.y < -30) {
            velocity.y = 0;
            playerObj.position.set(0, 15, 0);
        }
    }

    renderer.render(scene, camera);
}

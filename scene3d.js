// ─────────────────────────────────────────────────────────────────────────────
// The Council — five clay reviewers in a 3D room who study the evidence and
// then each step forward to say what they think.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from './vendor/three/three.module.js';

// Left → right around the arc. The Inspector (rule engine) sits in the middle
// and speaks last, like a chair summing up.
export const SEATS = [
  { key: 'Wording',          color: '#d97757', accessory: 'monocle', role: 'Urgency, threats and odd phrasing' },
  { key: 'Links & sender',   color: '#6a9bcc', accessory: 'antenna', role: 'Domains, numbers, wallets' },
  { key: 'Inspector',        color: '#c9a27a', accessory: 'gear',    role: 'Hard rules & link checks', chair: true },
  { key: 'Pressure tactics', color: '#a07cb0', accessory: 'cone',    role: 'Fear, greed, fake authority' },
  { key: 'Deriv policy',     color: '#788c5d', accessory: 'cap',     role: 'Would real Deriv send this?' },
];
const SPEAK_ORDER = [0, 1, 3, 4, 2];

const VERDICT_COLOR = { safe: '#5f8a52', warn: '#c98a2b', danger: '#c0453a', off: '#a49b8e' };
export const bandOf = (s) => (s == null ? 'off' : s <= 30 ? 'safe' : s <= 60 ? 'warn' : 'danger');

const INK = new THREE.Color('#2b2722');
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

// ─── Small tween helper ─────────────────────────────────────────────────────
const ease = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  hop: (k) => Math.sin(Math.PI * k),
};

export function createCouncil(container, bubbleLayer) {
  if (!webglAvailable()) return { ok: false };

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const camHome = new THREE.Vector3(0, 3.6, 9.4);
  const lookHome = new THREE.Vector3(0, 1.15, 0);
  camera.position.copy(camHome);

  // ── Lighting: soft and warm ──────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0xcdbda4, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1e2, 2.4);
  sun.position.set(4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.radius = 6;
  scene.add(sun);
  const spot = new THREE.SpotLight(0xffe0c8, 0, 22, 0.3, 0.55, 1.1);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.position.set(0, 8, 4);
  scene.add(spot, spot.target);
  const evidenceSpot = new THREE.SpotLight(0xffe2c4, 0, 20, 0.22, 0.5, 1.0);
  evidenceSpot.position.set(0, 11, 2.2); evidenceSpot.target.position.set(0, 1.2, 1.7);
  evidenceSpot.castShadow = true;
  const chairSpot = new THREE.SpotLight(0xffc89e, 0, 20, 0.26, 0.6, 1.0);
  chairSpot.position.set(0, 12, -3.4); chairSpot.target.position.set(0, 1.5, -3.6);
  const rim = new THREE.PointLight(0xd97757, 0, 14, 1.6);
  rim.position.set(0, 2.5, -6);
  scene.add(evidenceSpot, evidenceSpot.target, chairSpot, chairSpot.target, rim);
  const juryFill = new THREE.DirectionalLight(0xffc9a6, 0);   // warm front fill so faces read in the dark
  juryFill.position.set(0, 3, 9);
  scene.add(juryFill);

  // ── Room ─────────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({ color: '#e9e0d1', roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 4.8, 0.14, 72),
    new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 0.9 })
  );
  dais.position.y = 0.07;
  dais.receiveShadow = true;
  scene.add(dais);

  // Thin ring that lights up on the final verdict
  const verdictRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.7, 0.025, 8, 160),
    new THREE.MeshBasicMaterial({ color: '#d97757', transparent: true, opacity: 0.25 })
  );
  verdictRing.rotation.x = Math.PI / 2;
  verdictRing.position.y = 0.15;
  scene.add(verdictRing);

  // ── The domain: a courtroom that rises out of the dark ───────────────────
  const DARK = new THREE.Color('#110d0b');
  const court = new THREE.Group();
  court.position.y = -6;
  scene.add(court);
  const wood = new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.55, metalness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({ color: '#2a1e17', emissive: '#d97757', emissiveIntensity: 0.0, roughness: 0.4 });
  const glowLines = [];

  // Curved judges' bench behind the council
  for (let i = 0; i < 13; i++) {
    const a = (i / 12 - 0.5) * 2.4;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.25, 0.5), wood);
    seg.position.set(Math.sin(a) * 4.9, 0.62, -Math.cos(a) * 4.9 * 0.7 - 0.6);
    seg.rotation.y = -a * 0.85;
    seg.castShadow = seg.receiveShadow = true;
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.52), trim);
    line.position.copy(seg.position); line.position.y = 1.27; line.rotation.y = seg.rotation.y;
    court.add(seg, line);
  }
  // Raised chair's podium behind the Inspector
  const podium = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.0, 0.7), wood);
  podium.position.set(0, 1.0, -4.15);
  podium.castShadow = true;
  const podiumTrim = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.05, 0.74), trim);
  podiumTrim.position.set(0, 2.02, -4.15);
  court.add(podium, podiumTrim);

  // Ring of tall pillars fading into the dark
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.31;
    if (Math.sin(a) * 8 - 1 > 1.5) continue;  // keep the camera side open
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 9, 20), new THREE.MeshStandardMaterial({ color: '#2b211b', roughness: 0.7 }));
    pillar.position.set(Math.cos(a) * 8, 4.5, Math.sin(a) * 8 - 1);
    pillar.castShadow = true;
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 32), trim);
    cap.rotation.x = Math.PI / 2; cap.position.set(pillar.position.x, 2.6, pillar.position.z);
    court.add(pillar, cap);
  }

  // Witness rail around the evidence
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.035, 10, 48, Math.PI * 1.3), trim);
  rail.rotation.x = Math.PI / 2; rail.rotation.z = Math.PI * 0.85;
  rail.position.set(0, 0.95, 1.7);
  court.add(rail);
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * 0.85 + (i / 6) * Math.PI * 1.3;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8), wood);
    post.position.set(Math.cos(a) * 0.75, 0.5, 1.7 - Math.sin(a) * 0.75);
    court.add(post);
  }

  // Glowing floor sigil: concentric rings + spokes
  const sigil = new THREE.Group();
  const sigilMat = new THREE.MeshBasicMaterial({ color: '#d97757', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const r of [1.2, 2.2, 5.4, 6.6]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.025, r + 0.025, 128), sigilMat);
    ring.rotation.x = -Math.PI / 2; sigil.add(ring);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 1.2), sigilMat);
    spoke.rotation.x = -Math.PI / 2; spoke.rotation.z = a;
    spoke.position.set(Math.sin(a) * 6.0, 0, Math.cos(a) * 6.0);
    sigil.add(spoke);
  }
  sigil.position.y = 0.16;
  scene.add(sigil);

  // Scales of justice floating above the chair
  const gold = new THREE.MeshStandardMaterial({ color: '#c9974f', metalness: 0.85, roughness: 0.28, emissive: '#5a3a14', emissiveIntensity: 0.3 });
  const scales = new THREE.Group();
  scales.position.set(0, 3.75, -4.4);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.6, 12), gold);
  post.position.y = -0.4;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), gold);
  finial.position.y = 0.42;
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 0.3;
  const beamBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 10), gold);
  beamBar.rotation.z = Math.PI / 2;
  beamPivot.add(beamBar);
  const pans = [-1, 1].map((side) => {
    const hang = new THREE.Group();
    hang.position.x = side * 1.15;
    for (const dx of [-0.16, 0.16]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.8, 4), gold);
      cord.position.set(dx, -0.4, 0); cord.rotation.z = -dx * 0.5;
      hang.add(cord);
    }
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.07, 32), gold);
    pan.position.y = -0.8;
    hang.add(pan);
    beamPivot.add(hang);
    return hang;
  });
  scales.add(post, finial, beamPivot);
  court.add(scales);
  let scaleTilt = 0, scaleTarget = 0;

  // Gavel + sound block on the chair's podium
  const gavelBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 24), wood);
  gavelBlock.position.set(0.45, 2.08, -3.95);
  const gavelPivot = new THREE.Group();
  gavelPivot.position.set(0.95, 2.12, -3.95);
  const gavelHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 10), new THREE.MeshStandardMaterial({ color: '#5a3d2b', roughness: 0.4 }));
  gavelHandle.rotation.z = Math.PI / 2; gavelHandle.position.x = -0.3;
  const gavelHead = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 20), new THREE.MeshStandardMaterial({ color: '#4a3223', roughness: 0.35 }));
  gavelHead.position.x = -0.55;
  gavelPivot.add(gavelHandle, gavelHead);
  gavelPivot.rotation.z = 0.9;
  court.add(gavelBlock, gavelPivot);

  // Visible light shafts (fake volumetrics)
  const shaftMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  function makeShaft(x, z, topR, botR, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, 12, 32, 1, true), shaftMat(color));
    m.position.set(x, 6, z);
    scene.add(m);
    return m;
  }
  const evidenceShaft = makeShaft(0, 1.7, 0.15, 1.2, '#ffd9b8');
  const chairShaft = makeShaft(0, -4.2, 0.2, 1.4, '#ffcfa8');

  // Shockwave used for the expansion and the gavel strike
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 96), new THREE.MeshBasicMaterial({ color: '#ffb48a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shock.rotation.x = -Math.PI / 2; shock.position.y = 0.2;
  scene.add(shock);

  const CREAM = new THREE.Color('#ede6da');
  const floorDark = new THREE.Color('#1c1512');
  const floorLight = new THREE.Color('#e9e0d1');
  let domain = 0;           // 0 = cream room, 1 = full courtroom
  function applyDomain() {
    const d = domain;
    renderer.setClearColor(CREAM.clone().lerp(DARK, d), 1);
    hemi.intensity = 1.5 - d * 1.32;
    sun.intensity = 2.4 - d * 2.1;
    floor.material.color.copy(floorLight).lerp(floorDark, d);
    floor.material.roughness = 1 - d * 0.62;
    floor.material.metalness = d * 0.35;
    dais.material.color.set('#efe7da').lerp(new THREE.Color('#2a201b'), d);
    dais.material.roughness = 0.9 - d * 0.55;
    court.position.y = -6 + ease.out(Math.min(1, d * 1.15)) * 6;
    court.visible = sigil.visible = d > 0.002;
    trim.emissiveIntensity = d * 0.9;
    scene.fog = d > 0.01 ? (scene.fog || new THREE.FogExp2(DARK, 0)) : null;
    if (scene.fog) { scene.fog.color.copy(DARK); scene.fog.density = d * 0.045; }
    container.parentElement?.classList.toggle('domain', d > 0.5);
  }

  // ── Evidence lectern + card ──────────────────────────────────────────────
  const lectern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.46, 0.75, 32),
    new THREE.MeshStandardMaterial({ color: '#d8ccb9', roughness: 0.8 })
  );
  lectern.position.set(0, 0.5, 1.7);
  lectern.castShadow = lectern.receiveShadow = true;
  scene.add(lectern);

  const cardGroup = new THREE.Group();
  cardGroup.position.set(0, 1.62, 1.7);
  scene.add(cardGroup);

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = 512; cardCanvas.height = 680;
  const cardTex = new THREE.CanvasTexture(cardCanvas);
  cardTex.colorSpace = THREE.SRGBColorSpace;
  cardTex.anisotropy = 4;
  const CARD_W = 1.05, CARD_H = 1.4;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.6, side: THREE.DoubleSide })
  );
  card.castShadow = true;
  const frameMat = new THREE.MeshStandardMaterial({ color: '#2b2722', roughness: 0.5 });
  const cardFrame = new THREE.Mesh(new THREE.BoxGeometry(CARD_W + 0.06, CARD_H + 0.06, 0.03), frameMat);
  cardFrame.position.z = -0.02;
  cardFrame.castShadow = true;
  cardGroup.add(cardFrame, card);

  // Scanning bar that sweeps the card while the council reads it
  const scanBar = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W + 0.1, 0.035),
    new THREE.MeshBasicMaterial({ color: '#d97757', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  scanBar.position.z = 0.012;
  cardGroup.add(scanBar);

  // Orbiting motes
  const moteCount = 140;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = [];
  for (let i = 0; i < moteCount; i++) moteSeed.push({ a: Math.random() * Math.PI * 2, r: 0.9 + Math.random() * 0.45, y: (Math.random() - 0.5) * 1.5, s: 0.3 + Math.random() * 0.8 });
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: '#d97757', size: 0.035, transparent: true, opacity: 0, depthWrite: false }));
  motes.position.copy(cardGroup.position);
  scene.add(motes);

  function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    out.slice(0, maxLines).forEach((l, i) => ctx.fillText(i === maxLines - 1 && out.length > maxLines ? l + ' …' : l, x, y + i * lh));
  }

  function paintCard({ text = '', image = null, tint = null } = {}) {
    const c = cardCanvas.getContext('2d');
    const W = cardCanvas.width, H = cardCanvas.height;
    c.fillStyle = '#fbf8f3'; c.fillRect(0, 0, W, H);
    c.fillStyle = tint || '#d97757'; c.fillRect(0, 0, W, 10);
    c.fillStyle = '#8f877b'; c.font = '600 20px ui-sans-serif, system-ui, sans-serif';
    c.fillText('EVIDENCE', 32, 52);
    if (image) {
      const pad = 28, top = 72, bw = W - pad * 2, bh = H - top - pad;
      const s = Math.min(bw / image.width, bh / image.height);
      const w = image.width * s, h = image.height * s;
      c.drawImage(image, pad + (bw - w) / 2, top + (bh - h) / 2, w, h);
    } else if (text) {
      c.fillStyle = '#2b2722'; c.font = '26px Georgia, serif';
      wrapText(c, text, 32, 104, W - 64, 36, 16);
    } else {
      c.fillStyle = '#b4ab9d'; c.font = 'italic 26px Georgia, serif';
      wrapText(c, 'Paste a message or drop a screenshot below.', 32, 110, W - 64, 36, 4);
    }
    cardTex.needsUpdate = true;
  }
  paintCard();

  // ── The reviewers ────────────────────────────────────────────────────────
  const R = 3.3;
  const agents = SEATS.map((seat, i) => {
    const t = (i - 2) / 2;                   // -1 … 1
    const theta = t * 1.05;                   // spread ~ ±60°
    const root = new THREE.Group();
    root.position.set(Math.sin(theta) * R, 0.14, -Math.cos(theta) * R * 0.62 + 0.2);
    const scale = seat.chair ? 1.12 : 1;
    root.scale.setScalar(scale);
    scene.add(root);

    const color = new THREE.Color(seat.color);
    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.62 });
    const darker = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.72), roughness: 0.7 });

    // Pedestal with a status ring
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 40), new THREE.MeshStandardMaterial({ color: '#ddd1bf', roughness: 0.9 }));
    base.position.y = 0.06; base.receiveShadow = true; base.castShadow = true;
    const ringMat = new THREE.MeshBasicMaterial({ color: '#cfc3b0' });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.585, 0.022, 8, 64), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.125;
    root.add(base, ring);

    const body = new THREE.Group();          // everything that hops / leans
    root.add(body);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.55, 8, 24), skin);
    torso.position.y = 0.72; torso.castShadow = true;
    body.add(torso);

    const headPivot = new THREE.Group();
    headPivot.position.y = 1.42;
    body.add(headPivot);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), skin);
    head.castShadow = true;
    headPivot.add(head);

    const eyeMat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.3 });
    const eyes = [-0.12, 0.12].map((x) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), eyeMat);
      e.position.set(x, 0.04, 0.31);
      e.scale.set(1, 1.35, 0.6);
      headPivot.add(e);
      return e;
    });

    // Little arms
    const arms = [-1, 1].map((side) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 12), darker);
      arm.position.set(side * 0.43, 0.78, 0.02);
      arm.rotation.z = side * 0.22;
      arm.castShadow = true;
      body.add(arm);
      return arm;
    });

    // Accessory = personality
    let spinner = null;
    if (seat.accessory === 'monocle') {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 8, 24), new THREE.MeshStandardMaterial({ color: '#b8893b', metalness: 0.7, roughness: 0.3 }));
      m.position.set(0.12, 0.04, 0.33);
      headPivot.add(m);
    } else if (seat.accessory === 'antenna') {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), eyeMat);
      stalk.position.set(0.08, 0.45, 0); stalk.rotation.z = -0.25;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshStandardMaterial({ color: '#f2c14e', emissive: '#f2a93b', emissiveIntensity: 0.8 }));
      bulb.position.set(0.12, 0.62, 0);
      headPivot.add(stalk, bulb);
      spinner = bulb;
    } else if (seat.accessory === 'cone') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 24), darker);
      hat.position.set(0, 0.42, -0.02); hat.rotation.z = 0.12; hat.castShadow = true;
      headPivot.add(hat);
    } else if (seat.accessory === 'cap') {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.035, 0.52), new THREE.MeshStandardMaterial({ color: '#3a3630', roughness: 0.6 }));
      board.position.y = 0.33; board.rotation.y = Math.PI / 4; board.castShadow = true;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 24), board.material);
      crown.position.y = 0.27;
      headPivot.add(crown, board);
    } else if (seat.accessory === 'gear') {
      const gear = new THREE.Group();
      const gm = new THREE.MeshStandardMaterial({ color: '#b07a4a', metalness: 0.55, roughness: 0.35 });
      gear.add(new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 10, 40), gm));
      for (let k = 0; k < 10; k++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.07), gm);
        const a = (k / 10) * Math.PI * 2;
        tooth.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0);
        tooth.rotation.z = a;
        gear.add(tooth);
      }
      gear.rotation.x = Math.PI / 2;
      gear.position.y = 0.42;
      headPivot.add(gear);
      spinner = gear;
    }

    // Beam from the agent's eyes to the evidence
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.02, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    scene.add(beam);

    return {
      seat, root, body, headPivot, eyes, arms, ring, ringMat, spinner, beam, color,
      phase: Math.random() * Math.PI * 2,
      yaw: 0, targetYaw: 0, pitch: 0, targetPitch: 0,
      hop: 0, shake: 0, lean: 0, nextBlink: 1 + Math.random() * 3, blink: 0,
      bubble: null,
    };
  });

  // ── Bubbles (HTML overlay positioned from 3D) ────────────────────────────
  function makeBubble(a) {
    const el = document.createElement('div');
    el.className = 'bubble label';
    el.innerHTML = `<div class="bubble-head"><span class="bubble-name"><span class="bubble-dot" style="background:${a.seat.color}"></span><span>${a.seat.key}</span></span><span class="bubble-score"></span></div><div class="bubble-text"></div>`;
    bubbleLayer.appendChild(el);
    a.bubble = el;
    a.bubbleState = 'label';
  }
  agents.forEach(makeBubble);

  function setBubble(a, state, { score, text } = {}) {
    const el = a.bubble;
    el.classList.remove('label', 'thinking', 'full', 'mini', 'show');
    a.bubbleState = state;
    if (state === 'hidden') return;
    el.classList.add(state);
    const thinking = el.querySelector('.dots');
    if (state === 'thinking' && !thinking) el.insertAdjacentHTML('afterbegin', '<span class="dots"><i></i><i></i><i></i></span>');
    if (state !== 'thinking' && thinking) thinking.remove();
    if (score !== undefined) {
      const s = el.querySelector('.bubble-score');
      s.style.color = VERDICT_COLOR[bandOf(score)];
      s.innerHTML = score == null ? '–' : `0<small>%</small>`;
    }
    if (text !== undefined) el.querySelector('.bubble-text').textContent = '';
    requestAnimationFrame(() => el.classList.add('show'));
  }

  const tmpV = new THREE.Vector3();
  function placeBubbles(w, h) {
    for (const a of agents) {
      if (a.bubbleState === 'hidden') continue;
      a.headPivot.getWorldPosition(tmpV);
      tmpV.y += a.seat.accessory === 'cone' || a.seat.accessory === 'antenna' ? 0.95 : 0.7;
      tmpV.project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * w;
      const y = (-tmpV.y * 0.5 + 0.5) * h;
      const bw = a.bubble.offsetWidth, bh = a.bubble.offsetHeight;
      const cx = Math.max(6, Math.min(w - bw - 6, x - bw / 2));
      a.bubble.style.transform = `translate(${cx}px, ${Math.max(4, y - bh - 10)}px)`;
      a.bubble.style.zIndex = a.bubbleState === 'full' ? 3 : 1;
    }
  }

  // ── State machine ────────────────────────────────────────────────────────
  let mode = 'idle';        // idle | judging | reveal | done
  let speaking = -1;
  let skipRequested = false;
  const camTarget = { pos: camHome.clone(), look: lookHome.clone() };
  const camLook = lookHome.clone();
  const tweens = [];
  function tween(dur, update, easing = ease.inOut) {
    return new Promise((resolve) => {
      if (reduceMotion || skipRequested) { update(1); return resolve(); }
      tweens.push({ t0: performance.now(), dur, update, easing, resolve });
    });
  }
  const wait = (ms) => new Promise((r) => (reduceMotion || skipRequested ? r() : setTimeout(r, ms)));

  function lookAtPoint(a, p) {
    const wp = a.root.position;
    a.targetYaw = Math.atan2(p.x - wp.x, p.z - wp.z);
    const dist = Math.hypot(p.x - wp.x, p.z - wp.z);
    a.targetPitch = -Math.atan2(p.y - 1.5, dist) * 0.6;
  }
  const cardPoint = () => cardGroup.position.clone();
  agents.forEach((a) => lookAtPoint(a, camera.position));

  // ── Render loop ──────────────────────────────────────────────────────────
  let width = 1, height = 1, visible = true, last = performance.now();
  const ro = new ResizeObserver(() => {
    width = container.clientWidth; height = container.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Pull back on narrow screens so the whole council fits
    const narrow = Math.max(0, 1.6 - camera.aspect);
    camHome.set(0, 3.6 + narrow * 1.6, 9.4 + narrow * 5.5);
    if (mode !== 'reveal') camTarget.pos.copy(camHome);
    camera.updateProjectionMatrix();
  });
  ro.observe(container);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(container);

  const up = new THREE.Vector3(0, 1, 0);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    // Tweens always advance (even off-screen) so the reveal never stalls
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.update(tw.easing(k));
      if (k >= 1 || skipRequested) { tw.update(1); tweens.splice(i, 1); tw.resolve(); }
    }
    if (!visible) return;

    // Camera: gentle drift
    const drift = reduceMotion ? 0 : (mode === 'judging' ? 0.35 : 0.12);
    const want = camTarget.pos.clone().add(new THREE.Vector3(Math.sin(t * 0.25) * drift, Math.sin(t * 0.33) * drift * 0.3, 0));
    camera.position.lerp(want, 1 - Math.pow(0.02, dt));
    camLook.lerp(camTarget.look, 1 - Math.pow(0.02, dt));
    camera.lookAt(camLook);
    if (shakeAmt > 0.001) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt; shakeAmt *= Math.pow(0.002, dt); }

    // Evidence card
    cardGroup.position.y = 1.62 + (reduceMotion ? 0 : Math.sin(t * 1.3) * 0.03);
    cardGroup.rotation.y = mode === 'judging' && !reduceMotion ? Math.sin(t * 0.8) * 0.18 : cardGroup.rotation.y * 0.94;
    cardGroup.rotation.x = -0.12;
    const judging = mode === 'judging';
    scanBar.material.opacity += ((judging ? 0.9 : 0) - scanBar.material.opacity) * 0.1;
    scanBar.position.y = Math.sin(t * 2.2) * (CARD_H / 2 - 0.05);
    motes.material.opacity += ((judging ? 0.85 : 0.0) - motes.material.opacity) * 0.06;
    motes.position.y = cardGroup.position.y;
    for (let i = 0; i < moteCount; i++) {
      const m = moteSeed[i];
      const a = m.a + t * m.s * (judging ? 1.2 : 0.3);
      motePos[i * 3] = Math.cos(a) * m.r;
      motePos[i * 3 + 1] = m.y + Math.sin(t * m.s + m.a) * 0.08;
      motePos[i * 3 + 2] = Math.sin(a) * m.r * 0.6;
    }
    moteGeo.attributes.position.needsUpdate = true;
    verdictRing.rotation.z += dt * 0.05;
    sigil.rotation.y += dt * (judging ? 0.12 : 0.03);
    sigilMat.opacity = domain * (0.28 + (judging ? Math.sin(t * 3) * 0.08 : 0));
    evidenceSpot.intensity = domain * 140;
    chairSpot.intensity = domain * 90;
    rim.intensity = domain * 25;
    juryFill.intensity = domain * 1.3;
    evidenceShaft.material.opacity = domain * (0.07 + Math.sin(t * 1.1) * 0.012);
    chairShaft.material.opacity = domain * 0.05;
    scaleTilt += ((judging && !reduceMotion ? Math.sin(t * 1.4) * 0.22 : scaleTarget) - scaleTilt) * (1 - Math.pow(0.05, dt));
    beamPivot.rotation.z = scaleTilt;
    pans.forEach((p) => (p.rotation.z = -scaleTilt));
    scales.rotation.y = Math.sin(t * 0.3) * 0.15;

    // Agents
    agents.forEach((a, i) => {
      const bob = reduceMotion ? 0 : Math.sin(t * 1.6 + a.phase) * 0.025;
      a.body.position.y = bob + a.hop;
      a.yaw += (a.targetYaw - a.yaw) * (1 - Math.pow(0.004, dt));
      a.pitch += (a.targetPitch - a.pitch) * (1 - Math.pow(0.004, dt));
      a.root.rotation.y = a.yaw;
      a.headPivot.rotation.x = a.pitch + (judging && !reduceMotion ? Math.sin(t * 2 + a.phase) * 0.06 : 0);
      a.headPivot.rotation.y = a.shake ? Math.sin(t * 18) * 0.25 * a.shake : 0;
      a.headPivot.rotation.z = judging && !reduceMotion ? Math.sin(t * 0.9 + a.phase) * 0.12 : 0;
      a.body.rotation.x = a.lean;
      a.arms[0].rotation.x = judging ? -0.6 + Math.sin(t * 3 + a.phase) * 0.15 : 0;
      a.arms[1].rotation.x = speaking === i ? -1.1 + Math.sin(t * 6) * 0.25 : 0;
      if (a.spinner) a.spinner.rotation.z += dt * (judging ? 3 : 0.6);

      // Blink
      a.nextBlink -= dt;
      if (a.nextBlink < 0) { a.blink = 0.14; a.nextBlink = 2 + Math.random() * 4; }
      a.blink = Math.max(0, a.blink - dt);
      const ey = a.blink > 0 ? 0.15 : 1.35;
      a.eyes.forEach((e) => (e.scale.y = ey));

      // Beam
      const bm = a.beam.material;
      bm.opacity += ((judging ? 0.35 + Math.sin(t * 5 + a.phase) * 0.15 : 0) - bm.opacity) * 0.12;
      if (bm.opacity > 0.01) {
        const from = new THREE.Vector3(); a.headPivot.getWorldPosition(from);
        const to = cardGroup.position.clone().add(new THREE.Vector3(Math.sin(t * 1.7 + a.phase) * 0.35, Math.sin(t * 2.3 + a.phase) * 0.5, 0));
        const dir = to.clone().sub(from);
        a.beam.position.copy(from).addScaledVector(dir, 0.5);
        a.beam.quaternion.setFromUnitVectors(up, dir.clone().normalize());
        a.beam.scale.set(1, dir.length(), 1);
        a.beam.visible = true;
      } else a.beam.visible = false;
    });

    renderer.render(scene, camera);
    placeBubbles(width, height);
  }
  applyDomain();
  requestAnimationFrame(frame);

  // ── Public API ───────────────────────────────────────────────────────────
  function setEvidence({ text, imageUrl }) {
    if (imageUrl) {
      const img = new Image();
      img.onload = () => paintCard({ image: img });
      img.src = imageUrl;
    } else paintCard({ text });
  }

  async function expand() {
    if (domain >= 1) return;
    flash('#fff3e6');
    shockwave(0, 1.7, 9, 1100);
    await tween(1400, (k) => { domain = k; applyDomain(); }, ease.out);
  }

  function shockwave(x, z, toScale, dur) {
    shock.position.x = x; shock.position.z = z;
    tween(dur, (k) => { shock.scale.setScalar(0.3 + k * toScale); shock.material.opacity = (1 - k) * 0.9; }, ease.out);
  }

  function flash(color) {
    const el = document.createElement('div');
    el.className = 'stage-flash';
    el.style.background = color;
    container.parentElement.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  let shakeAmt = 0;

  function judge() {
    expand();
    mode = 'judging';
    skipRequested = false;
    speaking = -1;
    spot.intensity = 0;
    camTarget.pos.copy(camHome).add(new THREE.Vector3(0, -0.4, -1.6));
    camTarget.look.copy(cardGroup.position).setY(1.2);
    agents.forEach((a) => {
      a.hop = 0; a.shake = 0; a.lean = 0.08;
      a.ringMat.color.set('#cfc3b0');
      lookAtPoint(a, cardPoint());
      setBubble(a, 'thinking');
    });
    verdictRing.material.color.set('#d97757');
    verdictRing.material.opacity = 0.25;
  }

  function typeText(el, text, cps = 75) {
    return new Promise((resolve) => {
      if (reduceMotion || skipRequested) { el.textContent = text; return resolve(); }
      const t0 = performance.now();
      const total = Math.min(1800, (text.length / cps) * 1000);   // never longer than 1.8s
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / total);
        el.textContent = text.slice(0, Math.ceil(text.length * k));
        if (k >= 1 || skipRequested) { el.textContent = text; resolve(); } else setTimeout(step, 30);
      };
      step();
    });
  }

  /**
   * speeches: [{ seatIndex, score|null, text }] in any order; chair goes last.
   * final: { score, verdict, title }
   */
  async function reveal(speeches, final, onCaption = () => {}) {
    mode = 'reveal';
    const bySeat = new Map(speeches.map((s) => [s.seatIndex, s]));
    agents.forEach((a) => { setBubble(a, 'hidden'); a.lean = 0; lookAtPoint(a, camera.position); });

    for (const idx of SPEAK_ORDER) {
      const a = agents[idx];
      const sp = bySeat.get(idx);
      if (!sp) continue;
      speaking = idx;
      const band = bandOf(sp.score);
      onCaption(`${a.seat.key} is giving their view…`);

      // Spotlight + camera lean toward the speaker
      const wp = a.root.position;
      spot.target.position.set(wp.x, 1, wp.z);
      spot.position.set(wp.x * 0.6, 7.5, wp.z + 4.5);
      spot.intensity = 60;
      camTarget.pos.copy(camHome).add(new THREE.Vector3(wp.x * 0.35, -0.5, -2.2));
      camTarget.look.set(wp.x * 0.7, 1.45, wp.z * 0.5);

      // Hop forward and face the user
      lookAtPoint(a, camTarget.pos);
      tween(520, (k) => { a.hop = ease.hop(k) * 0.32; }, (k) => k);
      if (sp.score == null) { a.shake = 1; setTimeout(() => (a.shake = 0), 700); }
      a.ringMat.color.set(VERDICT_COLOR[band]);

      setBubble(a, 'full', { score: sp.score, text: sp.text });
      const scoreEl = a.bubble.querySelector('.bubble-score');
      const textEl = a.bubble.querySelector('.bubble-text');
      await Promise.all([
        sp.score == null ? Promise.resolve() : tween(900, (k) => { scoreEl.innerHTML = `${Math.round(sp.score * k)}<small>%</small>`; }, ease.out),
        typeText(textEl, sp.text),
      ]);
      await wait(1100);
      setBubble(a, 'mini', { score: sp.score });
      scoreEl.innerHTML = sp.score == null ? '–' : `${sp.score}<small>%</small>`;
    }

    // Final verdict
    speaking = -1;
    spot.intensity = 0;
    camTarget.pos.copy(camHome);
    camTarget.look.copy(lookHome);
    const col = VERDICT_COLOR[bandOf(final.score)];
    const band = bandOf(final.score);
    onCaption('Order in the court…');
    camTarget.pos.set(0, 3.4, 4.2);
    camTarget.look.set(0, 2.2, -3.8);
    await wait(500);
    await tween(380, (k) => { gavelPivot.rotation.z = 0.9 + k * 0.5; }, ease.out);     // wind up
    await tween(140, (k) => { gavelPivot.rotation.z = 1.4 - k * 1.45; }, (k) => k * k); // strike
    shakeAmt = 0.25;
    flash(col);
    shockwave(0, -3.95, 12, 1300);
    scaleTarget = band === 'danger' ? -0.42 : band === 'warn' ? -0.16 : band === 'safe' ? 0.3 : 0;
    tween(500, (k) => { gavelPivot.rotation.z = -0.05 + k * 0.95; });
    sigilMat.color.set(col);
    await wait(650);
    camTarget.pos.copy(camHome);
    camTarget.look.copy(lookHome);
    verdictRing.material.color.set(col);
    tween(800, (k) => { verdictRing.material.opacity = 0.25 + k * 0.6; });
    frameMat.color.set(col);
    agents.forEach((a, i) => {
      lookAtPoint(a, camHome);
      setTimeout(() => tween(420, (k) => { a.hop = ease.hop(k) * 0.18; }, (k) => k), i * 70);
    });
    onCaption(final.title);
    await wait(500);
    mode = 'done';
  }

  function skip() { skipRequested = true; }

  function reset({ keepDomain = false } = {}) {
    if (!keepDomain && domain > 0) { const from = domain; tween(900, (k) => { domain = from * (1 - k); applyDomain(); }); }
    scaleTarget = 0;
    sigilMat.color.set('#d97757');
    mode = 'idle';
    skipRequested = false;
    speaking = -1;
    spot.intensity = 0;
    camTarget.pos.copy(camHome);
    camTarget.look.copy(lookHome);
    frameMat.color.set('#2b2722');
    verdictRing.material.opacity = 0.25;
    verdictRing.material.color.set('#d97757');
    agents.forEach((a) => {
      a.hop = 0; a.shake = 0; a.lean = 0;
      a.ringMat.color.set('#cfc3b0');
      lookAtPoint(a, camHome);
      a.bubble.querySelector('.bubble-score').innerHTML = '';
      a.bubble.querySelector('.bubble-text').textContent = '';
      setBubble(a, 'label');
    });
    paintCard();
  }

  /** Expand the courtroom without starting a judgement (agents face the visitor). */
  async function enterDomain() {
    skipRequested = false;
    agents.forEach((a) => { lookAtPoint(a, camHome); setBubble(a, 'label'); });
    await expand();
  }

  return { ok: true, setEvidence, judge, reveal, skip, reset, enterDomain, seats: SEATS };
}

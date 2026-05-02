const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  level: document.getElementById("level"),
  hp: document.getElementById("hp"),
  score: document.getElementById("score"),
  weapon: document.getElementById("weapon"),
  overlay: document.getElementById("overlay"),
  startBtn: document.getElementById("startBtn"),
  rateBar: document.querySelector("#rateBar span"),
  damageBar: document.querySelector("#damageBar span"),
  spreadBar: document.querySelector("#spreadBar span"),
};

const world = { width: 960, height: 600 };
const keys = new Set();
const mouse = { x: world.width / 2, y: world.height / 2, inside: false };

let state = "menu";
let lastTime = 0;
let spawnTimer = 0;
let levelTarget = 0;

const player = {
  x: world.width / 2,
  y: world.height / 2,
  radius: 13,
  hp: 100,
  maxHp: 100,
  speed: 230,
  invuln: 0,
  fireTimer: 0,
  weapon: {
    name: "Pulse",
    fireDelay: 0.24,
    damage: 18,
    bulletSpeed: 560,
    bullets: 1,
    spread: 0,
    pierce: 0,
  },
};

let level = 1;
let score = 0;
let enemies = [];
let bullets = [];
let particles = [];

const upgrades = [
  {
    title: "Rapid Barrel",
    text: "Fire rate up",
    apply: () => {
      player.weapon.fireDelay = Math.max(0.075, player.weapon.fireDelay * 0.78);
    },
  },
  {
    title: "Hot Rounds",
    text: "Damage up",
    apply: () => {
      player.weapon.damage += 7;
    },
  },
  {
    title: "Split Core",
    text: "Adds another shot",
    apply: () => {
      player.weapon.bullets = Math.min(5, player.weapon.bullets + 1);
      player.weapon.spread = Math.min(0.44, player.weapon.spread + 0.12);
    },
  },
  {
    title: "Kinetic Jacket",
    text: "Bullets pass through one more target",
    apply: () => {
      player.weapon.pierce = Math.min(4, player.weapon.pierce + 1);
    },
  },
  {
    title: "Med Pack",
    text: "Restore health and raise max HP",
    apply: () => {
      player.maxHp += 15;
      player.hp = Math.min(player.maxHp, player.hp + 45);
    },
  },
];

function resetRun() {
  state = "playing";
  level = 1;
  score = 0;
  enemies = [];
  bullets = [];
  particles = [];
  Object.assign(player, {
    x: world.width / 2,
    y: world.height / 2,
    hp: 100,
    maxHp: 100,
    speed: 230,
    invuln: 0,
    fireTimer: 0,
    weapon: {
      name: "Pulse",
      fireDelay: 0.24,
      damage: 18,
      bulletSpeed: 560,
      bullets: 1,
      spread: 0,
      pierce: 0,
    },
  });
  beginLevel();
  hideOverlay();
  updateHud();
}

function beginLevel() {
  levelTarget = 8 + level * 4;
  spawnTimer = 0;
}

function showOverlay(markup) {
  ui.overlay.innerHTML = markup;
  ui.overlay.classList.remove("hidden");
}

function hideOverlay() {
  ui.overlay.classList.add("hidden");
}

function showUpgradeScreen() {
  state = "upgrade";
  const choices = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);
  const buttons = choices
    .map((upgrade, index) => (
      `<button type="button" data-upgrade="${index}">
        ${upgrade.title}
        <small>${upgrade.text}</small>
      </button>`
    ))
    .join("");

  showOverlay(`
    <div class="panel">
      <h1>LEVEL ${level} CLEAR</h1>
      <p>Choose one weapon package before the next wave.</p>
      <div class="upgrade-grid">${buttons}</div>
    </div>
  `);

  ui.overlay.querySelectorAll("[data-upgrade]").forEach((button, index) => {
    button.addEventListener("click", () => {
      choices[index].apply();
      level += 1;
      beginLevel();
      hideOverlay();
      state = "playing";
      updateHud();
    });
  });
}

function gameOver() {
  state = "gameover";
  showOverlay(`
    <div class="panel">
      <h1>RUN LOST</h1>
      <p>Score ${score}. You reached level ${level}.</p>
      <button id="restartBtn" type="button">RESTART</button>
    </div>
  `);
  document.getElementById("restartBtn").addEventListener("click", resetRun);
}

function updateHud() {
  ui.level.textContent = level;
  ui.hp.textContent = Math.max(0, Math.ceil(player.hp));
  ui.score.textContent = score;
  ui.weapon.textContent = player.weapon.name;
  ui.rateBar.style.width = `${Math.min(100, 140 - player.weapon.fireDelay * 420)}%`;
  ui.damageBar.style.width = `${Math.min(100, player.weapon.damage * 2.1)}%`;
  ui.spreadBar.style.width = `${Math.min(100, player.weapon.bullets * 20 + player.weapon.pierce * 10)}%`;
}

function update(dt) {
  if (state !== "playing") return;

  movePlayer(dt);
  autoShoot(dt);
  spawnEnemies(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateParticles(dt);

  player.invuln = Math.max(0, player.invuln - dt);

  if (player.hp <= 0) {
    gameOver();
  } else if (levelTarget <= 0 && enemies.length === 0) {
    showUpgradeScreen();
  }

  updateHud();
}

function movePlayer(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;
  const length = Math.hypot(dx, dy) || 1;
  player.x = clamp(player.x + (dx / length) * player.speed * dt, player.radius, world.width - player.radius);
  player.y = clamp(player.y + (dy / length) * player.speed * dt, player.radius, world.height - player.radius);
}

function autoShoot(dt) {
  player.fireTimer -= dt;
  if (player.fireTimer > 0) return;

  const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  const count = player.weapon.bullets;
  for (let i = 0; i < count; i += 1) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * player.weapon.spread;
    fireBullet(angle + offset);
  }
  player.fireTimer = player.weapon.fireDelay;
}

function fireBullet(angle) {
  bullets.push({
    x: player.x + Math.cos(angle) * 16,
    y: player.y + Math.sin(angle) * 16,
    vx: Math.cos(angle) * player.weapon.bulletSpeed,
    vy: Math.sin(angle) * player.weapon.bulletSpeed,
    radius: 4,
    damage: player.weapon.damage,
    pierce: player.weapon.pierce,
    life: 1.4,
  });
  addParticles(player.x + Math.cos(angle) * 16, player.y + Math.sin(angle) * 16, "#f5c64b", 2);
}

function spawnEnemies(dt) {
  if (levelTarget <= 0) return;
  spawnTimer -= dt;
  if (spawnTimer > 0) return;

  const side = Math.floor(Math.random() * 4);
  const x = side === 0 ? -24 : side === 1 ? world.width + 24 : Math.random() * world.width;
  const y = side === 2 ? -24 : side === 3 ? world.height + 24 : Math.random() * world.height;
  const tough = level > 2 && Math.random() < Math.min(0.18 + level * 0.025, 0.55);
  enemies.push({
    x,
    y,
    radius: tough ? 18 : 13,
    speed: (tough ? 58 : 82) + level * 7,
    hp: (tough ? 56 : 28) + level * 9,
    maxHp: (tough ? 56 : 28) + level * 9,
    damage: tough ? 19 : 12,
    color: tough ? "#ef5b5b" : "#83e377",
  });
  levelTarget -= 1;
  spawnTimer = Math.max(0.22, 0.9 - level * 0.055);
}

function updateBullets(dt) {
  for (const bullet of bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    for (const enemy of enemies) {
      if (enemy.hp <= 0 || distance(bullet, enemy) > bullet.radius + enemy.radius) continue;
      enemy.hp -= bullet.damage;
      bullet.pierce -= 1;
      bullet.life = bullet.pierce < 0 ? 0 : bullet.life;
      addParticles(enemy.x, enemy.y, enemy.color, 6);
      if (enemy.hp <= 0) {
        score += enemy.maxHp > 60 ? 45 : 25;
        addParticles(enemy.x, enemy.y, "#f3f2d0", 16);
      }
      break;
    }
  }

  bullets = bullets.filter((bullet) => (
    bullet.life > 0 &&
    bullet.x > -40 &&
    bullet.x < world.width + 40 &&
    bullet.y > -40 &&
    bullet.y < world.height + 40
  ));
  enemies = enemies.filter((enemy) => enemy.hp > 0);
}

function updateEnemies(dt) {
  for (const enemy of enemies) {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.x += Math.cos(angle) * enemy.speed * dt;
    enemy.y += Math.sin(angle) * enemy.speed * dt;

    if (player.invuln <= 0 && distance(player, enemy) < player.radius + enemy.radius) {
      player.hp -= enemy.damage;
      player.invuln = 0.55;
      const knockback = 24;
      player.x = clamp(player.x - Math.cos(angle) * knockback, player.radius, world.width - player.radius);
      player.y = clamp(player.y - Math.sin(angle) * knockback, player.radius, world.height - player.radius);
      addParticles(player.x, player.y, "#ef5b5b", 14);
    }
  }
}

function updateParticles(dt) {
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  }
  particles = particles.filter((particle) => particle.life > 0);
}

function addParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.18 + Math.random() * 0.32,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

function draw() {
  ctx.clearRect(0, 0, world.width, world.height);
  drawGrid();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawCrosshair();
}

function drawGrid() {
  ctx.fillStyle = "#0b0a10";
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.strokeStyle = "#1c1a28";
  ctx.lineWidth = 2;
  for (let x = 0; x < world.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0; y < world.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(angle);
  ctx.fillStyle = player.invuln > 0 ? "#f5c64b" : "#58c4dd";
  ctx.fillRect(-12, -11, 22, 22);
  ctx.fillStyle = "#f3f2d0";
  ctx.fillRect(4, -4, 18, 8);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
    ctx.fillStyle = "#111018";
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 8, enemy.radius * 2, 4);
    ctx.fillStyle = "#f5c64b";
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 8, enemy.radius * 2 * (enemy.hp / enemy.maxHp), 4);
  }
}

function drawBullets() {
  ctx.fillStyle = "#f5c64b";
  for (const bullet of bullets) {
    ctx.fillRect(bullet.x - 3, bullet.y - 3, 6, 6);
  }
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life * 2.5);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawCrosshair() {
  ctx.strokeStyle = "#f3f2d0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mouse.x - 16, mouse.y);
  ctx.lineTo(mouse.x - 6, mouse.y);
  ctx.moveTo(mouse.x + 6, mouse.y);
  ctx.lineTo(mouse.x + 16, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 16);
  ctx.lineTo(mouse.x, mouse.y - 6);
  ctx.moveTo(mouse.x, mouse.y + 6);
  ctx.lineTo(mouse.x, mouse.y + 16);
  ctx.stroke();
  ctx.strokeRect(mouse.x - 2, mouse.y - 2, 4, 4);
}

function loop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resizeCanvasPointer(event) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = clamp(((event.clientX - rect.left) / rect.width) * world.width, 0, world.width);
  mouse.y = clamp(((event.clientY - rect.top) / rect.height) * world.height, 0, world.height);
}

window.addEventListener("keydown", (event) => {
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

canvas.addEventListener("mousemove", resizeCanvasPointer);
canvas.addEventListener("mouseenter", () => {
  mouse.inside = true;
});
canvas.addEventListener("mouseleave", () => {
  mouse.inside = false;
});
ui.startBtn.addEventListener("click", resetRun);

updateHud();
requestAnimationFrame(loop);

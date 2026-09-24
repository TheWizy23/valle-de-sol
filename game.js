/* ===================================================
   VALLE DEL SOL - VIDEOJUEGO DE GRANJA
   =================================================== */

// CONFIGURACIÓN DE CULTIVOS
const CROPS = {
  wheat:  { id: 'wheat',  name: 'Trigo',     icon: '🌾', seedPrice: 4,  sellPrice: 10, growthTime: 8,   xp: 4,  levelReq: 1 },
  corn:   { id: 'corn',   name: 'Maíz',      icon: '🌽', seedPrice: 10, sellPrice: 25, growthTime: 20,  xp: 10, levelReq: 2 },
  carrot: { id: 'carrot', name: 'Zanahoria', icon: '🥕', seedPrice: 22, sellPrice: 60, growthTime: 45,  xp: 22, levelReq: 5 },
  tomato: { id: 'tomato', name: 'Tomate',    icon: '🍅', seedPrice: 45, sellPrice: 130,growthTime: 90,  xp: 48, levelReq: 9 },
  potato: { id: 'potato', name: 'Papa',      icon: '🥔', seedPrice: 90, sellPrice: 280,growthTime: 180, xp: 95, levelReq: 12 }
};

// CONFIGURACIÓN DE MEJORAS
const UPGRADES = {
  plots:  { id: 'plots',  name: 'Expandir Terreno', desc: '+2 Parcelas agrícolas extra', cost: 120, mult: 2.2, max: 6 },
  growth: { id: 'growth', name: 'Fertilizante Orgánico', desc: 'Cultivos crecen 15% más rápido', cost: 150, mult: 2.0, max: 5 },
  sales:  { id: 'sales',  name: 'Negociador Hábil', desc: '+10% de monedas por ventas', cost: 200, mult: 2.0, max: 5 },
  water:  { id: 'water',  name: 'Regadera Pro', desc: 'Riego reduce 40% del tiempo restante', cost: 100, mult: 1.8, max: 3 }
};

// ESTADO INICIAL DEL JUEGO
const DEFAULT_STATE = {
  coins: 50,
  xp: 0,
  level: 1,
  reputation: 0,
  selectedTool: 'select', // 'select' (siembra/cosecha), 'water'
  selectedSeed: 'wheat',
  seeds: { wheat: 5, corn: 0, carrot: 0, tomato: 0, potato: 0 },
  inventory: { wheat: 0, corn: 0, carrot: 0, tomato: 0, potato: 0 },
  upgrades: { plots: 0, growth: 0, sales: 0, water: 0 },
  plots: [],
  orders: [],
  lastSaveTime: Date.now(),
  tutorialCompleted: false,
  soundEnabled: true
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));

// SISTEMA DE SONIDO (WEB AUDIO API - SIN ARCHIVOS EXTERNOS)
const AudioSys = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },
  play(type) {
    if (!state.soundEnabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;

      if (type === 'plant') {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'harvest') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'coin') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(987.77, now); // B5
        osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'levelup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'water') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      console.log('Audio Context error:', e);
    }
  }
};

/* ===================================================
   INICIALIZACIÓN DEL JUEGO
   =================================================== */

document.addEventListener('DOMContentLoaded', () => {
  loadGame();
  calculateOfflineProgress();
  setupUI();
  generateOrdersIfEmpty();
  
  // Bucle principal de actualización (1 segundo)
  setInterval(gameTick, 1000);
  // Auto-guardado cada 10 segundos
  setInterval(saveGame, 10000);

  if (!state.tutorialCompleted) {
    document.getElementById('modal-tutorial').classList.add('active');
  }
});

function gameTick() {
  updatePlotsGrowth(1);
  renderHeader();
  renderFarmPlots();
}

/* ===================================================
   LÓGICA DEL TERRENO Y CULTIVOS
   =================================================== */

function getPlotCount() {
  return 6 + (state.upgrades.plots * 2);
}

function ensurePlotStructure() {
  const targetCount = getPlotCount();
  while (state.plots.length < targetCount) {
    state.plots.push({
      id: state.plots.length,
      crop: null,
      plantedTime: 0,
      duration: 0,
      watered: false
    });
  }
}

function updatePlotsGrowth(deltaSeconds) {
  ensurePlotStructure();
  const speedBonus = 1 + (state.upgrades.growth * 0.15);

  state.plots.forEach(plot => {
    if (plot.crop) {
      plot.plantedTime += deltaSeconds * speedBonus;
      if (plot.plantedTime > plot.duration) {
        plot.plantedTime = plot.duration;
      }
    }
  });
}

function handlePlotClick(index) {
  const plot = state.plots[index];
  
  // MODO REGADERA
  if (state.selectedTool === 'water') {
    if (plot.crop && plot.plantedTime < plot.duration) {
      if (!plot.watered) {
        plot.watered = true;
        const reductionPercent = 0.25 + (state.upgrades.water * 0.15);
        const remaining = plot.duration - plot.plantedTime;
        plot.plantedTime += remaining * reductionPercent;
        AudioSys.play('water');
        showToast('🚿 ¡Cultivo regado!');
        renderFarmPlots();
      } else {
        showToast('⚠️ Esta parcela ya fue regada');
      }
    } else {
      showToast('⚠️ No hay cultivo en crecimiento para regar');
    }
    return;
  }

  // MODO SIEMBRA / COSECHA (Selección Normal)
  if (!plot.crop) {
    // Intentar Sembrar
    const seedId = state.selectedSeed;
    if (!seedId || state.seeds[seedId] <= 0) {
      showToast('⚠️ ¡No tienes semillas de este tipo!');
      return;
    }
    const cropData = CROPS[seedId];
    if (state.level < cropData.levelReq) {
      showToast(`🔒 Requiere Nivel ${cropData.levelReq}`);
      return;
    }

    state.seeds[seedId]--;
    plot.crop = seedId;
    plot.plantedTime = 0;
    plot.duration = cropData.growthTime;
    plot.watered = false;

    AudioSys.play('plant');
    showToast(`🌱 Sembraste ${cropData.name}`);
    renderAll();
  } else if (plot.plantedTime >= plot.duration) {
    // Cosechar
    const cropData = CROPS[plot.crop];
    state.inventory[plot.crop] = (state.inventory[plot.crop] || 0) + 1;
    
    // Reset parcela
    plot.crop = null;
    plot.plantedTime = 0;
    plot.watered = false;

    AudioSys.play('harvest');
    addXP(cropData.xp);
    showToast(`🧺 ¡Cosechaste 1x ${cropData.name}! (+${cropData.xp} XP)`);
    renderAll();
  } else {
    showToast('⏳ El cultivo aún está creciendo...');
  }
}

/* ===================================================
   SISTEMA DE EXPERIENCIA Y PROGRESIÓN
   =================================================== */

function getXpForNextLevel(level) {
  return Math.floor(25 * Math.pow(level, 1.5));
}

function addXP(amount) {
  state.xp += amount;
  let needed = getXpForNextLevel(state.level);
  
  while (state.xp >= needed) {
    state.xp -= needed;
    state.level++;
    needed = getXpForNextLevel(state.level);
    AudioSys.play('levelup');
    showToast(`🎉 ¡SUBISTE AL NIVEL ${state.level}! 🎉`);
  }
}

/* ===================================================
   TIENDA, ALMACÉN Y MERCADO
   =================================================== */

function buySeed(cropId) {
  const crop = CROPS[cropId];
  if (state.coins >= crop.seedPrice) {
    state.coins -= crop.seedPrice;
    state.seeds[cropId] = (state.seeds[cropId] || 0) + 1;
    AudioSys.play('coin');
    showToast(`Compraste 1x Semilla de ${crop.name}`);
    renderAll();
  } else {
    showToast('❌ Monedas insuficientes');
  }
}

function sellCrop(cropId) {
  if (state.inventory[cropId] > 0) {
    const crop = CROPS[cropId];
    const bonusMult = 1 + (state.upgrades.sales * 0.10);
    const finalPrice = Math.floor(crop.sellPrice * bonusMult);

    state.inventory[cropId]--;
    state.coins += finalPrice;
    AudioSys.play('coin');
    showToast(`Vendiste 1x ${crop.name} por 🪙${finalPrice}`);
    renderAll();
  }
}

/* ===================================================
   PEDIDOS DE CLIENTES
   =================================================== */

function generateOrdersIfEmpty() {
  if (!state.orders || state.orders.length === 0) {
    state.orders = [];
    for (let i = 0; i < 3; i++) {
      state.orders.push(createRandomOrder());
    }
  }
}

function createRandomOrder() {
  const availableCrops = Object.values(CROPS).filter(c => c.levelReq <= state.level);
  const randomCrop = availableCrops[Math.floor(Math.random() * availableCrops.length)];
  const amount = Math.floor(Math.random() * 3) + 1 + Math.floor(state.level / 3);

  const baseVal = randomCrop.sellPrice * amount;
  const coinReward = Math.floor(baseVal * 1.4);
  const xpReward = Math.floor(randomCrop.xp * amount * 1.5);
  const repReward = Math.floor(amount * 2);

  const names = ['Don Mateo', 'Doña Rosa', 'Chef Julián', 'Ana la Botanista', 'Vecino Carlos'];
  const client = names[Math.floor(Math.random() * names.length)];

  return {
    id: Date.now() + Math.random(),
    client: client,
    cropId: randomCrop.id,
    amount: amount,
    coins: coinReward,
    xp: xpReward,
    rep: repReward
  };
}

function fulfillOrder(orderId) {
  const index = state.orders.findIndex(o => o.id === orderId);
  if (index === -1) return;

  const order = state.orders[index];
  if ((state.inventory[order.cropId] || 0) >= order.amount) {
    state.inventory[order.cropId] -= order.amount;
    state.coins += order.coins;
    state.reputation += order.rep;
    addXP(order.xp);
    
    AudioSys.play('coin');
    showToast(`📜 ¡Pedido completado para ${order.client}!`);

    // Reemplazar pedido
    state.orders[index] = createRandomOrder();
    renderAll();
  } else {
    showToast('❌ No tienes suficientes hortalizas para este pedido');
  }
}

/* ===================================================
   MEJORAS
   =================================================== */

function buyUpgrade(upgradeId) {
  const upg = UPGRADES[upgradeId];
  const currentLvl = state.upgrades[upgradeId] || 0;

  if (currentLvl >= upg.max) {
    showToast('⚠️ Nivel máximo alcanzado');
    return;
  }

  const cost = Math.floor(upg.cost * Math.pow(upg.mult, currentLvl));

  if (state.coins >= cost) {
    state.coins -= cost;
    state.upgrades[upgradeId] = currentLvl + 1;
    AudioSys.play('levelup');
    showToast(`🛠️ Mejora adquirida: ${upg.name}`);
    ensurePlotStructure();
    renderAll();
  } else {
    showToast('❌ Monedas insuficientes');
  }
}

/* ===================================================
   RENDERIZADO DE LA INTERFAZ (UI)
   =================================================== */

function setupUI() {
  // Navegación por Tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = btn.getAttribute('data-tab');
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Botón Regadera
  const waterBtn = document.querySelector('.tool-btn[data-tool="water"]');
  waterBtn.addEventListener('click', () => {
    if (state.selectedTool === 'water') {
      state.selectedTool = 'select';
      waterBtn.classList.remove('active');
    } else {
      state.selectedTool = 'water';
      waterBtn.classList.add('active');
    }
  });

  // Toggle Sonido
  document.getElementById('btn-sound').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    document.getElementById('btn-sound').textContent = state.soundEnabled ? '🔊' : '🔇';
    showToast(state.soundEnabled ? 'Sonido activado' : 'Sonido desactivado');
  });

  // Reinicio
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('¿Seguro que deseas reiniciar tu granja? Se perderá todo el progreso.')) {
      localStorage.removeItem('valle_del_sol_save');
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      ensurePlotStructure();
      generateOrdersIfEmpty();
      renderAll();
      showToast('🔄 Granja reiniciada');
    }
  });

  // Tutorial close
  document.getElementById('btn-close-tutorial').addEventListener('click', () => {
    state.tutorialCompleted = true;
    document.getElementById('modal-tutorial').classList.remove('active');
    saveGame();
  });

  renderAll();
}

function renderAll() {
  renderHeader();
  renderSeedBar();
  renderFarmPlots();
  renderShop();
  renderBarn();
  renderOrders();
  renderUpgrades();
}

function renderHeader() {
  document.getElementById('level-val').textContent = `Niv. ${state.level}`;
  document.getElementById('coins-val').textContent = state.coins;
  document.getElementById('rep-val').textContent = state.reputation;

  const neededXp = getXpForNextLevel(state.level);
  const pct = Math.min(100, Math.floor((state.xp / neededXp) * 100));
  document.getElementById('xp-bar-fill').style.width = `${pct}%`;
}

function renderSeedBar() {
  const container = document.getElementById('seed-selector');
  container.innerHTML = '';

  Object.values(CROPS).forEach(crop => {
    const isUnlocked = state.level >= crop.levelReq;
    const count = state.seeds[crop.id] || 0;
    
    const chip = document.createElement('div');
    chip.className = `seed-chip ${state.selectedSeed === crop.id && state.selectedTool !== 'water' ? 'active' : ''} ${!isUnlocked ? 'disabled' : ''}`;
    chip.innerHTML = `
      <span>${crop.icon}</span>
      <span>${crop.name}</span>
      <span class="seed-count">${count}</span>
    `;

    chip.addEventListener('click', () => {
      if (!isUnlocked) {
        showToast(`🔒 Requiere Nivel ${crop.levelReq}`);
        return;
      }
      state.selectedSeed = crop.id;
      state.selectedTool = 'select';
      document.querySelector('.tool-btn[data-tool="water"]').classList.remove('active');
      renderSeedBar();
    });

    container.appendChild(chip);
  });
}

function renderFarmPlots() {
  ensurePlotStructure();
  const grid = document.getElementById('farm-grid');
  grid.innerHTML = '';

  state.plots.forEach((plot, index) => {
    const el = document.createElement('div');
    el.className = 'plot';

    if (plot.watered) el.classList.add('watered');

    if (!plot.crop) {
      el.innerHTML = `<span class="plot-status-tag">Vacío</span>`;
    } else {
      const crop = CROPS[plot.crop];
      const progress = Math.min(1, plot.plantedTime / plot.duration);
      const isReady = progress >= 1;

      if (isReady) el.classList.add('ready');

      // Escala visual según crecimiento
      const scale = 0.4 + (progress * 0.6);
      
      el.innerHTML = `
        ${plot.watered ? '<span class="water-indicator">💧</span>' : ''}
        <span class="plot-crop-icon" style="transform: scale(${scale})">
          ${isReady ? crop.icon : '🌱'}
        </span>
        ${!isReady ? `
          <div class="plot-progress-outer">
            <div class="plot-progress-inner" style="width: ${progress * 100}%"></div>
          </div>
        ` : `<span class="plot-status-tag" style="background:#2e7d32">¡Listo!</span>`}
      `;
    }

    el.addEventListener('click', () => handlePlotClick(index));
    grid.appendChild(el);
  });
}

function renderShop() {
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';

  Object.values(CROPS).forEach(crop => {
    const isUnlocked = state.level >= crop.levelReq;
    const card = document.createElement('div');
    card.className = `card ${!isUnlocked ? 'locked-card' : ''}`;

    card.innerHTML = `
      <div class="card-info">
        <div class="card-icon">${crop.icon}</div>
        <div class="card-details">
          <h4>${crop.name} ${!isUnlocked ? `🔒 (Niv. ${crop.levelReq})` : ''}</h4>
          <p>Tiempo: ${crop.growthTime}s | XP: +${crop.xp}</p>
          <p>Precio Semilla: 🪙${crop.seedPrice}</p>
        </div>
      </div>
      <button class="btn-action" ${!isUnlocked || state.coins < crop.seedPrice ? 'disabled' : ''}>
        Comprar
      </button>
    `;

    const btn = card.querySelector('button');
    btn.addEventListener('click', () => buySeed(crop.id));

    grid.appendChild(card);
  });
}

function renderBarn() {
  const grid = document.getElementById('barn-grid');
  grid.innerHTML = '';

  Object.values(CROPS).forEach(crop => {
    const count = state.inventory[crop.id] || 0;
    const bonusMult = 1 + (state.upgrades.sales * 0.10);
    const price = Math.floor(crop.sellPrice * bonusMult);

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="card-info">
        <div class="card-icon">${crop.icon}</div>
        <div class="card-details">
          <h4>${crop.name}</h4>
          <p>En Almacén: <strong>${count}</strong></p>
          <p>Precio Venta: 🪙${price} c/u</p>
        </div>
      </div>
      <button class="btn-action" ${count <= 0 ? 'disabled' : ''}>
        Vender 1
      </button>
    `;

    card.querySelector('button').addEventListener('click', () => sellCrop(crop.id));
    grid.appendChild(card);
  });
}

function renderOrders() {
  const grid = document.getElementById('orders-grid');
  grid.innerHTML = '';

  state.orders.forEach(order => {
    const crop = CROPS[order.cropId];
    const currentCount = state.inventory[order.cropId] || 0;
    const canFulfill = currentCount >= order.amount;

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="card-info">
        <div class="card-icon">${crop.icon}</div>
        <div class="card-details">
          <h4>${order.client}</h4>
          <p>Pide: ${order.amount}x ${crop.name} (${currentCount}/${order.amount})</p>
          <p>Recompensa: 🪙${order.coins} | ⭐${order.xp} XP | 🏆${order.rep}</p>
        </div>
      </div>
      <button class="btn-action" ${!canFulfill ? 'disabled' : ''}>
        Entregar
      </button>
    `;

    card.querySelector('button').addEventListener('click', () => fulfillOrder(order.id));
    grid.appendChild(card);
  });
}

function renderUpgrades() {
  const grid = document.getElementById('upgrades-grid');
  grid.innerHTML = '';

  Object.values(UPGRADES).forEach(upg => {
    const currentLvl = state.upgrades[upg.id] || 0;
    const isMax = currentLvl >= upg.max;
    const cost = Math.floor(upg.cost * Math.pow(upg.mult, currentLvl));

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="card-info">
        <div class="card-icon">🛠️</div>
        <div class="card-details">
          <h4>${upg.name} (${currentLvl}/${upg.max})</h4>
          <p>${upg.desc}</p>
          <p>${isMax ? '¡Nivel Máximo!' : `Costo: 🪙${cost}`}</p>
        </div>
      </div>
      <button class="btn-action" ${isMax || state.coins < cost ? 'disabled' : ''}>
        ${isMax ? 'MAX' : 'Mejorar'}
      </button>
    `;

    card.querySelector('button').addEventListener('click', () => buyUpgrade(upg.id));
    grid.appendChild(card);
  });
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}

/* ===================================================
   GUARDADO LOCAL Y PROGRESO OFFLINE
   =================================================== */

function saveGame() {
  state.lastSaveTime = Date.now();
  localStorage.setItem('valle_del_sol_save', JSON.stringify(state));
}

function loadGame() {
  const saved = localStorage.getItem('valle_del_sol_save');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = Object.assign({}, DEFAULT_STATE, parsed);
    } catch (e) {
      console.error('Error al cargar la partida:', e);
    }
  }
}

function calculateOfflineProgress() {
  if (!state.lastSaveTime) return;

  const now = Date.now();
  const diffSeconds = Math.floor((now - state.lastSaveTime) / 1000);

  // Limitar el progreso offline a un máximo de 24 horas (86400s) para evitar abusos
  const cappedSeconds = Math.min(diffSeconds, 86400);

  if (cappedSeconds > 5) {
    updatePlotsGrowth(cappedSeconds);
    showToast(`🌙 Estuviste fuera ${Math.floor(cappedSeconds / 60)} min. Tus cultivos han avanzado.`);
  }
}

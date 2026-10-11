
"use strict";

const $ = id => document.getElementById(id);

const STORAGE_KEY = "devpet-ai-v2";

const DEFAULTS = {
  hunger: 25,
  thirst: 20,
  toilet: 10,
  sleep: 85,
  energy: 85,
  mood: 85,
  code: 10,
  coffee: 40,
  xp: 0,
  level: 1,
  actions: 0,
  lastUpdate: Date.now(),
  lastInteraction: Date.now(),
  sleepingUntil: 0,
  sleepStarted: 0,
  toiletCooldown: 0,
  logs: []
};

let state = loadState();
let soundEnabled = true;
let audio = null;
let toastTimer = null;
let lastEmotion = "";
let lastRequest = "";
let requestTimer = 0;
let isBusy = false;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...DEFAULTS, ...saved } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function saveState() {
  try {
    state.lastUpdate = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $("saveStatus").textContent = "● Сохранено";
  } catch {
    $("saveStatus").textContent = "● Ошибка сохранения";
  }
}

function sound(frequency = 650, duration = 0.09) {
  if (!soundEnabled) return;

  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();

    if (audio.state === "suspended") audio.resume();

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audio.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch {}
}

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function addLog(icon, title, description) {
  state.logs.unshift({
    icon,
    title,
    description,
    time: Date.now()
  });

  state.logs = state.logs.slice(0, 12);
}

function increase(key, amount) {
  state[key] = clamp(state[key] + amount);
}

function decrease(key, amount) {
  state[key] = clamp(state[key] - amount);
}

function addXP(amount) {
  state.xp += amount;

  while (state.xp >= 100) {
    state.xp -= 100;
    state.level++;
    notify("🎉 Новый уровень! NEXO достиг уровня " + state.level);
    sound(950, 0.18);
    addLog("🏆", "Новый уровень!", "Теперь уровень " + state.level);
  }
}

function isSleeping() {
  return state.sleepingUntil > Date.now();
}

function needs() {
  return [
    { key: "hunger", name: "Голод", icon: "🍔", value: state.hunger, color: "#ffb83e" },
    { key: "thirst", name: "Жажда", icon: "💧", value: state.thirst, color: "#20bfff" },
    { key: "sleep", name: "Сон", icon: "🌙", value: 100 - state.sleep, color: "#aa76ff" },
    { key: "toilet", name: "Туалет", icon: "🚽", value: state.toilet, color: "#00e5b4" },
    { key: "mood", name: "Настроение", icon: "💜", value: 100 - state.mood, color: "#ff63d0" }
  ];
}

function renderStats() {
  const stats = [
    { name: "Энергия", value: state.energy, icon: "⚡", color: "#16caff" },
    { name: "Настроение", value: state.mood, icon: "💜", color: "#a35cff" },
    { name: "Качество кода", value: state.code, icon: "💻", color: "#00e9b7" },
    { name: "Кофе", value: state.coffee, icon: "☕", color: "#ffb84b" }
  ];

  $("statsList").innerHTML = stats.map(s => `
    <div class="stat">
      <div class="stat-head">
        <span class="stat-icon" style="color:${s.color}">${s.icon}</span>
        <span class="stat-title">${s.name}</span>
        <span class="stat-number">${s.value}%</span>
      </div>
      <div class="stat-track">
        <div class="stat-fill"
          style="width:${s.value}%;background:${s.color};color:${s.color}">
        </div>
      </div>
    </div>
  `).join("");
}

function getEmotion() {
  if (isSleeping()) return {
    key: "sleeping",
    name: "Спящий",
    emoji: "😴",
    description: "Тише... NEXO восстанавливает силы.",
    speech: "Z-z-z... Мне нужно поспать... 💤",
    alert: "NEXO спит. Не забудь проверить его после отдыха."
  };

  if (state.hunger >= 90) return {
    key: "hungry",
    name: "Очень голодный",
    emoji: "🥺",
    description: "Мне очень хочется кушать!",
    speech: "Братик, я очень голодный... Покорми меня! 🍔",
    alert: "Срочно покорми NEXO!"
  };

  if (state.toilet >= 90) return {
    key: "toilet",
    name: "Нужно в туалет",
    emoji: "🚽",
    description: "Мне срочно нужно в туалет!",
    speech: "Можно мне в туалет? Уже очень нужно! 🚽",
    alert: "NEXO просится в туалет."
  };

  if (state.thirst >= 90) return {
    key: "thirsty",
    name: "Хочет пить",
    emoji: "🥤",
    description: "Я хочу пить...",
    speech: "Можно мне водички? Очень хочется! 💧",
    alert: "Дай NEXO воды."
  };

  if (state.energy <= 15 || state.sleep >= 90) return {
    key: "tired",
    name: "Сильно устал",
    emoji: "🥱",
    description: "Я устал и хочу поспать.",
    speech: "Зеваю... Давай немного отдохнём? 😴",
    alert: "NEXO устал. Отправь его спать."
  };

  if (state.mood <= 20) return {
    key: "sad",
    name: "Грустит",
    emoji: "😢",
    description: "Мне не хватает твоего внимания.",
    speech: "Ты давно со мной не общался... 🥺",
    alert: "Погладь NEXO или поиграй с ним."
  };

  if (state.hunger >= 65) return {
    key: "hungry",
    name: "Проголодался",
    emoji: "🍔",
    description: "Кажется, пора перекусить.",
    speech: "Хочешь угостить меня чем-нибудь вкусным? 🍔",
    alert: "NEXO хочет кушать."
  };

  if (state.thirst >= 65) return {
    key: "thirsty",
    name: "Хочет пить",
    emoji: "💧",
    description: "Мне бы стаканчик воды.",
    speech: "Водичка была бы сейчас кстати! 💧",
    alert: "NEXO хочет пить."
  };

  if (state.sleep >= 65) return {
    key: "tired",
    name: "Сонный",
    emoji: "😪",
    description: "Я начинаю зевать...",
    speech: "Кажется, скоро пора в кроватку... 💤",
    alert: "NEXO хочет спать."
  };

  if (state.toilet >= 65) return {
    key: "toilet",
    name: "Нужно в туалет",
    emoji: "🚽",
    description: "Кажется, мне скоро понадобится перерыв.",
    speech: "Скоро понадобится туалет... 🚽",
    alert: "Не забудь про потребность NEXO."
  };

  if (state.mood < 45) return {
    key: "sad",
    name: "Расстроенный",
    emoji: "😔",
    description: "Мне хочется немного внимания.",
    speech: "Побудь со мной немножко? 💙",
    alert: "Поиграй с питомцем или погладь его."
  };

  if (state.energy < 35) return {
    key: "tired",
    name: "Уставший",
    emoji: "🥱",
    description: "Мне нужно восстановить энергию.",
    speech: "Я уже немного устал...",
    alert: "NEXO нужна энергия."
  };

  if (state.mood >= 75 && state.energy >= 60) return {
    key: "happy",
    name: "Счастливый",
    emoji: "😊",
    description: "Мне хорошо, когда ты рядом!",
    speech: "Брат, я счастлив! Давай проведём время вместе! 💙",
    alert: "NEXO счастлив. Продолжай заботиться о нём!"
  };

  return {
    key: "normal",
    name: "Спокойный",
    emoji: "🙂",
    description: "Я рядом и готов к новым приключениям.",
    speech: "Что будем делать сегодня?",
    alert: "Проверь потребности NEXO."
  };
}

function renderPet() {
  const emotion = getEmotion();
  const pet = $("pet");

  pet.classList.remove(
    "happy", "sad", "angry", "tired", "sleeping", "sick"
  );

  if (emotion.key === "happy") pet.classList.add("happy");
  if (emotion.key === "sad") pet.classList.add("sad");
  if (emotion.key === "hungry" || emotion.key === "toilet") {
    pet.classList.add("sad");
  }
  if (emotion.key === "tired" || emotion.key === "thirsty") {
    pet.classList.add("tired");
  }
  if (emotion.key === "sleeping") pet.classList.add("sleeping");

  $("emotionLabel").textContent = emotion.emoji + " " + emotion.name;
  $("petDescription").textContent = emotion.description;
  $("petLevel").textContent = "Уровень " + state.level;

  if (Date.now() > requestTimer || lastEmotion !== emotion.key) {
    $("speech").textContent = emotion.speech;
    $("needsText").textContent = emotion.alert;
    lastEmotion = emotion.key;
    lastRequest = emotion.key;
  }

  const urgent = ["hungry", "thirsty", "toilet", "tired", "sleeping"];
  $("needsAlert").style.borderColor =
    urgent.includes(emotion.key) ? "#b87935" : "#244c84";

  $("sleepButtonText").textContent =
    isSleeping() ? "Разбудить" : "Уложить спать";

  $("xpLabel").textContent = state.xp + " / 100 XP";
  $("xpBar").style.width = state.xp + "%";
}

function renderNeeds() {
  const list = needs();

  const html = list.map(n => `
    <div class="stat">
      <div class="stat-head">
        <span class="stat-icon" style="color:${n.color}">${n.icon}</span>
        <span class="stat-title">${n.name}</span>
        <span class="stat-number">${n.value}%</span>
      </div>
      <div class="stat-track">
        <div class="stat-fill"
          style="width:${n.value}%;background:${n.color};color:${n.color}">
        </div>
      </div>
    </div>
  `).join("");

  // Потребности отображаются отдельной панелью,
  // создаваемой автоматически, чтобы не смешивать их со статами.
  let panel = $("needsPanel");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "needsPanel";
    panel.className = "panel needs-panel";
    panel.innerHTML = `
      <div class="section-heading">
        <h2>Потребности питомца</h2>
        <span class="live-label">NEXO</span>
      </div>
      <div id="needsGrid" class="stats-grid"></div>
    `;

    $("statsList").closest(".stats").after(panel);
  }

  $("needsGrid").innerHTML = html;
}

function renderLogs() {
  const list = $("activityList");

  if (!state.logs.length) {
    list.innerHTML = `
      <p style="color:var(--muted);font-size:12px;line-height:1.7">
        Пока событий нет. Познакомься с NEXO!
      </p>
    `;
    return;
  }

  list.innerHTML = state.logs.slice(0, 7).map(item => `
    <div class="activity-item">
      <span class="activity-icon">${escapeHTML(item.icon)}</span>
      <div class="activity-copy">
        <strong>${escapeHTML(item.title)}</strong>
        <p>${escapeHTML(item.description)}</p>
      </div>
      <span class="activity-time">${formatTime(item.time)}</span>
    </div>
  `).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function formatTime(time) {
  const elapsed = Math.max(0, Date.now() - time);

  if (elapsed < 60000) return "сейчас";
  if (elapsed < 3600000) return Math.floor(elapsed / 60000) + " мин.";
  if (elapsed < 86400000) return Math.floor(elapsed / 3600000) + " ч.";

  return new Date(time).toLocaleDateString("ru-RU");
}

function render() {
  renderStats();
  renderNeeds();
  renderPet();
  renderLogs();
  saveState();
}

function interact(action) {
  if (isBusy) return;

  const now = Date.now();

  if (action === "sleep" && isSleeping()) {
    state.sleepingUntil = 0;
    state.sleepStarted = 0;
    state.lastInteraction = now;

    addLog("☀️", "NEXO проснулся", "Пора возвращаться к делам.");
    notify("☀️ NEXO проснулся!");
    sound(700);
    render();
    return;
  }

  if (isSleeping() && action !== "sleep") {
    notify("😴 NEXO спит. Разбуди его сначала.");
    sound(250);
    return;
  }

  if (action === "feed") {
    if (state.hunger < 8) {
      notify("🍔 Я пока не голоден. Спасибо!");
      $("speech").textContent = "Спасибо! Но я пока сыт. 💙";
      sound(500);
      return;
    }

    decrease("hunger", 45);
    increase("energy", 8);
    increase("mood", 12);
    increase("xp", 0);

    addLog("🍔", "NEXO покушал", "Голод уменьшился, настроение улучшилось.");
    addXP(5);
    notify("😋 Ням-ням! Спасибо за еду!");
    sound(620);
  }

  else if (action === "water") {
    if (state.thirst < 8) {
      notify("💧 Я пока не хочу пить.");
      $("speech").textContent = "Спасибо за заботу! Я пока не хочу пить. 💙";
      sound(500);
      return;
    }

    decrease("thirst", 55);
    increase("energy", 5);
    increase("mood", 6);

    addLog("💧", "NEXO попил воды", "Жажда утолена.");
    addXP(3);
    notify("💧 Как хорошо! Спасибо за водичку.");
    sound(750);
  }

  else if (action === "toilet") {
    if (state.toilet < 8) {
      notify("🚽 Мне пока не нужно!");
      $("speech").textContent = "Всё хорошо, мне пока не нужно в туалет! 😊";
      sound(500);
      return;
    }

    state.toiletCooldown = now + 20000;
    decrease("toilet", 85);
    increase("mood", 8);

    addLog("🚽", "Перерыв завершён", "NEXO снова чувствует себя комфортно.");
    addXP(4);
    notify("✨ Отлично! NEXO теперь чувствует себя лучше.");
    sound(700);
  }

  else if (action === "sleep") {
    state.sleepStarted = now;
    state.sleepingUntil = now + 15000;

    addLog("🌙", "NEXO лёг спать", "Питомец восстанавливает силы.");
    notify("🌙 Спокойной ночи, NEXO!");
    sound(400, .2);
  }

  else if (action === "play") {
    if (state.energy < 12) {
      notify("🥱 Я слишком устал. Давай сначала отдохнём.");
      $("speech").textContent = "Хочу поиграть, но у меня мало сил...";
      sound(280);
      return;
    }

    decrease("energy", 12);
    increase("hunger", 8);
    increase("thirst", 7);
    increase("toilet", 4);
    increase("mood", 22);

    addLog("🎮", "Вы поиграли вместе", "NEXO получил внимание и стал счастливее.");
    addXP(8);
    notify("🎮 Ура! Мне очень понравилось!");
    sound(900, .12);
  }

  else if (action === "pet") {
    increase("mood", 15);
    increase("energy", 2);

    addLog("💙", "Ты погладил NEXO", "Питомец почувствовал твою заботу.");
    addXP(3);
    notify("💙 NEXO довольно мурлычет... бип-бип!");
    sound(800, .15);

    const pet = $("pet");
    pet.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.08) rotate(-3deg)" },
        { transform: "scale(.97) rotate(3deg)" },
        { transform: "scale(1)" }
      ],
      { duration: 500, easing: "ease-out" }
    );

    $("speech").textContent = "Ой, как приятно! Спасибо, что ты рядом! 💙";
    requestTimer = Date.now() + 5000;
  }

  else if (action === "coffee") {
    if (state.coffee >= 95) {
      notify("☕ У меня достаточно кофе. Может, лучше воды?");
      return;
    }

    increase("coffee", 25);
    increase("energy", 15);
    decrease("thirst", 3);
    increase("mood", 4);

    addLog("☕", "NEXO выпил кофе", "Энергия восстановлена.");
    addXP(2);
    notify("☕ Бип! Энергия заряжена!");
    sound(700);
  }

  else if (action === "code") {
    if (state.energy < 12) {
      notify("⚡ Слишком мало энергии. Сначала отдохни.");
      return;
    }

    decrease("energy", 12);
    increase("code", 8);
    increase("hunger", 5);
    increase("thirst", 4);
    decrease("mood", 2);

    addLog("💻", "Вы написали код", "Навыки NEXO стали лучше.");
    addXP(10);
    notify("💻 Код готов! Навык разработчика повышен.");
    sound(950, .07);
    setTimeout(() => sound(1100, .07), 90);
  }

  state.actions++;
  state.lastInteraction = now;

  render();
}

function advanceTime(seconds) {
  if (seconds <= 0) return;

  // Не даём огромному перерыву сразу уничтожить все показатели.
  const elapsed = Math.min(seconds, 60 * 60 * 24 * 7);

  if (isSleeping()) {
    const actualSleep = Math.min(
      elapsed,
      Math.max(0, (state.sleepingUntil - state.lastUpdate) / 1000)
    );

    state.sleep = clamp(state.sleep - actualSleep * 0.7);
    state.energy = clamp(state.energy + actualSleep * 0.9);
    state.mood = clamp(state.mood + actualSleep * 0.1);
  } else {
    state.hunger = clamp(state.hunger + elapsed * 0.12);
    state.thirst = clamp(state.thirst + elapsed * 0.16);
    state.toilet = clamp(state.toilet + elapsed * 0.10);
    state.sleep = clamp(state.sleep + elapsed * 0.10);
    state.energy = clamp(state.energy - elapsed * 0.09);
    state.mood = clamp(state.mood - elapsed * 0.045);
    state.coffee = clamp(state.coffee - elapsed * 0.12);
  }

  state.lastUpdate = Date.now();

  if (state.sleepingUntil && Date.now() >= state.sleepingUntil) {
    state.sleepingUntil = 0;
    state.sleepStarted = 0;
    addLog("☀️", "NEXO проснулся", "Отдых завершён.");
  }
}

function update() {
  const now = Date.now();
  const seconds = Math.max(0, (now - state.lastUpdate) / 1000);

  if (seconds >= 1) {
    advanceTime(seconds);
    render();
  }
}

function startPetRoutine() {
  const messages = [
    "Давай сегодня создадим что-нибудь крутое! 💻",
    "Брат, не забудь иногда проверять мои потребности! 💙",
    "Интересно, какой проект мы сделаем следующим? ✨",
    "Я рад, что ты заглянул ко мне! 🤖",
    "Мне нравится, когда мы проводим время вместе! 💜"
  ];

  setInterval(() => {
    if (isSleeping()) return;

    const emotion = getEmotion();

    if (emotion.key === "happy" || emotion.key === "normal") {
      $("speech").textContent =
        messages[Math.floor(Math.random() * messages.length)];
      requestTimer = Date.now() + 6000;
    }
  }, 25000);
}

document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", () => {
    interact(button.dataset.action);
  });
});

$("soundToggle").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  $("soundToggle").textContent = soundEnabled ? "🔊" : "🔇";

  if (soundEnabled) sound(700);

  notify(soundEnabled ? "Звук включён" : "Звук выключен");
});

$("resetButton").addEventListener("click", () => {
  const accepted = confirm(
    "Начать заново? Все показатели и история NEXO будут сброшены."
  );

  if (!accepted) return;

  state = { ...DEFAULTS, logs: [], lastUpdate: Date.now() };
  lastEmotion = "";
  lastRequest = "";

  addLog("🚀", "Новая жизнь NEXO", "Ваш питомец готов познакомиться с вами.");
  render();
  notify("🚀 NEXO начинает новую жизнь!");
  sound(700);
});

$("clearLog").addEventListener("click", () => {
  state.logs = [];
  renderLogs();
  saveState();
  notify("История очищена.");
});

function init() {
  const previousUpdate = Number(state.lastUpdate) || Date.now();
  const elapsed = Math.max(0, (Date.now() - previousUpdate) / 1000);

  advanceTime(elapsed);

  if (!state.logs.length) {
    addLog("🤖", "NEXO проснулся", "Привет! Давай заботиться друг о друге.");
  }

  render();
  startPetRoutine();

  // Обновляем потребности и состояние, даже когда питомец просто ждёт.
  setInterval(update, 1000);

  // Если вкладка была скрыта, при возвращении обновляем показатели.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      update();
      render();
    }
  });
}

init();

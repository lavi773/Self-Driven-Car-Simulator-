const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

const startStopBtn = document.getElementById('startStopBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const toggleObstacles = document.getElementById('toggleObstacles');

const decisionMessage = document.getElementById('decisionMessage');
const dashSpeed = document.getElementById('dashSpeed');
const dashDistance = document.getElementById('dashDistance');
const dashDecision = document.getElementById('dashDecision');
const decisionLogs = document.getElementById('decisionLogs');
const barObstacle = document.getElementById('barObstacle');
const barLane = document.getElementById('barLane');
const barSignal = document.getElementById('barSignal');

const road = { left: canvas.width * 0.25, right: canvas.width * 0.75, laneCount: 3 };
const laneWidth = (road.right - road.left) / road.laneCount;

const state = {
  running: false,
  speed: Number(speedSlider.value),
  lane: 1,
  yOffset: 0,
  trafficLight: 'green',
  lastDecision: 'Idle',
  pedestrianY: -100,
  cars: [],
  obstacles: [{ lane: 1, y: 260 }, { lane: 0, y: -120 }]
};

function laneCenter(lane) {
  return road.left + laneWidth * lane + laneWidth / 2;
}

function logDecision(msg) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
  decisionLogs.prepend(li);
  while (decisionLogs.children.length > 10) decisionLogs.removeChild(decisionLogs.lastChild);
}

function drawRoad() {
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(road.left, 0, road.right - road.left, canvas.height);

  for (let i = 1; i < road.laneCount; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.setLineDash([16, 16]);
    ctx.beginPath();
    ctx.moveTo(road.left + laneWidth * i, 0);
    ctx.lineTo(road.left + laneWidth * i, canvas.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (let i = 0; i < 16; i++) {
    const y = (i * 38 + state.yOffset) % (canvas.height + 38);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(road.left + 10, y - 38, 8, 20);
    ctx.fillRect(road.right - 18, y - 38, 8, 20);
  }

  for (let x = 20; x < canvas.width; x += 110) {
    ctx.fillStyle = '#1f5f3f';
    ctx.beginPath();
    ctx.arc(x, 70 + 18 * Math.sin((state.yOffset + x) / 120), 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#162a1c';
    ctx.fillRect(x - 3, 74, 6, 20);
  }
}

function drawTrafficLight() {
  const x = road.right + 40;
  const y = 110;
  ctx.fillStyle = '#121212';
  ctx.fillRect(x, y, 24, 75);
  ['red', 'yellow', 'green'].forEach((color, idx) => {
    ctx.beginPath();
    ctx.arc(x + 12, y + 14 + idx * 23, 7, 0, Math.PI * 2);
    const active = state.trafficLight === color;
    ctx.fillStyle = active ? color : '#3a3a3a';
    ctx.shadowBlur = active ? 10 : 0;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function drawObject(x, y, type) {
  if (type === 'obstacle') {
    ctx.fillStyle = '#ff9f43';
    ctx.fillRect(x - 17, y - 17, 34, 34);
  } else if (type === 'pedestrian') {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(x, y - 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 3, y, 6, 16);
  } else if (type === 'car') {
    ctx.fillStyle = '#9f86ff';
    ctx.fillRect(x - 14, y - 20, 28, 40);
  }
}

function drawPlayerCar() {
  const x = laneCenter(state.lane);
  const y = canvas.height - 70;

  ctx.strokeStyle = 'rgba(58,216,255,.6)';
  ctx.lineWidth = 2;
  const pulse = 30 + 5 * Math.sin(Date.now() / 180);
  ctx.beginPath();
  ctx.arc(x, y, pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#3ad8ff';
  ctx.fillRect(x - 16, y - 25, 32, 50);
  ctx.fillStyle = '#0b1a2f';
  ctx.fillRect(x - 10, y - 15, 20, 22);
}

function distanceToNearestObstacle() {
  const yCar = canvas.height - 70;
  const allObjects = [];
  if (toggleObstacles.checked) {
    state.obstacles.forEach((o) => allObjects.push({ lane: o.lane, y: o.y }));
    state.cars.forEach((c) => allObjects.push({ lane: c.lane, y: c.y }));
    allObjects.push({ lane: 2, y: state.pedestrianY });
  }
  const ahead = allObjects.filter((o) => o.y < yCar && Math.abs(o.lane - state.lane) <= 0).sort((a, b) => b.y - a.y);
  if (!ahead.length) return Infinity;
  return yCar - ahead[0].y;
}

async function fetchDecision(snapshot) {
  try {
    const res = await fetch('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot)
    });
    return await res.json();
  } catch {
    return { action: 'maintain', message: 'Offline fallback: maintain lane' };
  }
}

function updateDashboard(distance, message, action) {
  dashSpeed.textContent = `${Math.round(state.speed)} km/h`;
  dashDistance.textContent = distance === Infinity ? 'No obstacle' : `${Math.round(distance)} m`;
  dashDecision.textContent = action;
  decisionMessage.textContent = message;
  barObstacle.style.width = `${Math.max(8, 100 - Math.min(distance, 100))}%`;
  barLane.style.width = `${state.lastDecision.includes('lane') ? 84 : 56}%`;
  barSignal.style.width = `${state.trafficLight === 'green' ? 90 : state.trafficLight === 'yellow' ? 50 : 20}%`;
}

async function stepAI() {
  const distance = distanceToNearestObstacle();
  const snapshot = {
    speed: state.speed,
    lane: state.lane,
    distance,
    light: state.trafficLight,
    lane_blocked: distance < 95
  };

  const decision = await fetchDecision(snapshot);
  state.lastDecision = decision.message;

  if (decision.action === 'stop') {
    state.speed = Math.max(0, state.speed - 4);
  } else {
    state.speed = Number(speedSlider.value);
  }

  if (decision.action === 'change_left') state.lane = Math.max(0, state.lane - 1);
  if (decision.action === 'change_right') state.lane = Math.min(road.laneCount - 1, state.lane + 1);

  updateDashboard(distance, decision.message, decision.action);
  logDecision(decision.message);
}

function updateObjects() {
  const movement = state.speed * 0.045;
  state.yOffset += movement;

  if (toggleObstacles.checked) {
    state.obstacles.forEach((o) => {
      o.y += movement;
      if (o.y > canvas.height + 40) {
        o.y = -120 - Math.random() * 300;
        o.lane = Math.floor(Math.random() * road.laneCount);
      }
    });
  }

  state.pedestrianY += movement * 0.75;
  if (state.pedestrianY > canvas.height + 20) state.pedestrianY = -120;

  state.cars.forEach((c) => {
    c.y += movement * c.factor;
    if (c.y > canvas.height + 40) {
      c.y = -220;
      c.lane = Math.floor(Math.random() * road.laneCount);
    }
  });

  if (Math.random() < 0.007 && state.cars.length < 3) {
    state.cars.push({ lane: Math.floor(Math.random() * road.laneCount), y: -100, factor: 0.7 + Math.random() * 0.3 });
  }
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoad();
  drawTrafficLight();
  if (toggleObstacles.checked) {
    state.obstacles.forEach((o) => drawObject(laneCenter(o.lane), o.y, 'obstacle'));
    state.cars.forEach((c) => drawObject(laneCenter(c.lane), c.y, 'car'));
    drawObject(laneCenter(2), state.pedestrianY, 'pedestrian');
  }
  drawPlayerCar();
}

let aiTimer = null;
let trafficTimer = null;
function startSimulation() {
  if (state.running) return;
  state.running = true;
  startStopBtn.textContent = 'Stop Simulation';
  logDecision('Simulation started');

  aiTimer = setInterval(stepAI, 850);
  trafficTimer = setInterval(() => {
    state.trafficLight = state.trafficLight === 'green' ? 'yellow' : state.trafficLight === 'yellow' ? 'red' : 'green';
  }, 3000);

  const loop = () => {
    if (!state.running) return;
    updateObjects();
    drawScene();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function stopSimulation() {
  state.running = false;
  startStopBtn.textContent = 'Start Simulation';
  clearInterval(aiTimer);
  clearInterval(trafficTimer);
  logDecision('Simulation stopped');
}

startStopBtn.addEventListener('click', () => state.running ? stopSimulation() : startSimulation());
speedSlider.addEventListener('input', () => {
  state.speed = Number(speedSlider.value);
  speedValue.textContent = `${state.speed} km/h`;
  dashSpeed.textContent = `${state.speed} km/h`;
});

drawScene();

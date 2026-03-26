// ============================================================
// Арт-Калькулятор v2.0 — Arma 3 RHS+ACE Training Calculator
// ============================================================

// --- Constants ---
const MILS_FULL_CIRCLE = 6400;
const MILS_HALF_CIRCLE = 3200;
const MILS_TO_RAD = Math.PI / MILS_HALF_CIRCLE;
const DEG_TO_RAD = Math.PI / 180;
const STD_TEMP_C = 15;
const STD_PRESSURE_HPA = 1013.25;
const STD_TEMP_K = 288.15;
const Rd = 287.058;  // Specific gas constant for dry air (J/(kg·K))
const Rv = 461.495;  // Specific gas constant for water vapor (J/(kg·K))

// Column indices in firing table rows
const COL = {
  CHARGE: 0, DIST: 1, ELEV: 2, D_ELEV_100: 3, D_TOF_100: 4,
  TOF: 5, AZ_FACTOR: 6, W_HEAD: 7, W_TAIL: 8,
  T_DEC: 9, T_INC: 10, DENS_DEC: 11, DENS_INC: 12
};

// Human-readable weapon names (Arma 3 RHS + ACE)
const WEAPON_NAMES = {
  '120mm_OF843B_H':  '2Б11 «Сани» 120мм (навесная)',
  '2B14':            '2Б14 «Поднос» 82мм',
  '2B9H':            '2Б9 «Василёк» (навесная)',
  '2B9L':            '2Б9 «Василёк» (настильная)',
  '2S19_H':          '2С19 «Мста-С» (навесная)',
  '2S19_L':          '2С19 «Мста-С» (настильная)',
  '2S3':             '2С3 «Акация» 152мм',
  'BM-21':           'БМ-21 «Град» 122мм РСЗО',
  'D-20-V-H':        'Д-20 152мм (навесная)',
  'D-20-V-L':        'Д-20 152мм (настильная)',
  'M109':            'M109A6 Paladin 155мм',
  'M119_H':          'M119A2 105мм (навесная)',
  'M119_L':          'M119A2 105мм (настильная)',
  'M142_M26_H':      'M142 HIMARS M26 (навесная)',
  'M142_M26_L':      'M142 HIMARS M26 (настильная)',
  'M142_M26A1_H':    'M142 HIMARS M26A1 (навесная)',
  'M252':            'M252 81мм миномёт',
  'M777':            'M777A2 155мм гаубица',
  'PH_2000_H':       'PzH 2000 155мм (навесная)',
  'PH_2000_L':       'PzH 2000 155мм (настильная)',
  'Type 63':         'Type 63 107мм РСЗО'
};

// --- State ---
let weaponsDb = {};
let currentWeapon = '';

// --- DOM Elements ---
const weaponSelect = document.getElementById('weaponSelect');
const calcBtn = document.getElementById('calcBtn');
const resultsPanel = document.getElementById('resultsPanel');
const computedWind = document.getElementById('computedWind');
const allChargesPanel = document.getElementById('allChargesPanel');
const allChargesBody = document.getElementById('allChargesBody');

const els = {
  gunX: document.getElementById('gunX'),
  gunY: document.getElementById('gunY'),
  tgtX: document.getElementById('tgtX'),
  tgtY: document.getElementById('tgtY'),
  gunAlt: document.getElementById('gunAlt'),
  tgtAlt: document.getElementById('tgtAlt'),
  windDir: document.getElementById('windDir'),
  windUnit: document.getElementById('windUnit'),
  windSpeed: document.getElementById('windSpeed'),
  tempC: document.getElementById('tempC'),
  pressure: document.getElementById('pressure'),
  humidity: document.getElementById('humidity')
};

const res = {
  Dist: document.getElementById('resDist'),
  Az: document.getElementById('resAz'),
  Charge: document.getElementById('resCharge'),
  ElevMil: document.getElementById('resElevMil'),
  ElevDeg: document.getElementById('resElevDeg'),
  AzCorr: document.getElementById('resAzCorr'),
  FinalAz: document.getElementById('resFinalAz'),
  TOF: document.getElementById('resTOF'),
  DeltaH: document.getElementById('resDeltaH'),
  EffDist: document.getElementById('resEffDist')
};

// --- Utility Functions ---

/** Linear interpolation */
function lerp(a, b, t) {
  return (1 - t) * a + t * b;
}

/** Get numeric value from input element, fallback to default */
function getVal(el, def) {
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}

/**
 * Calculate air density deviation from ISA standard atmosphere.
 * Uses Teten's formula for saturation vapor pressure.
 * @returns {number} Deviation in percent from standard density
 */
function calculateDensityPct(tempC, pressureHPa, humidity) {
  pressureHPa = pressureHPa || STD_PRESSURE_HPA;
  if (humidity === undefined || humidity === null) humidity = 0;
  if (humidity > 1) humidity /= 100;

  const tempK = tempC + 273.15;
  const es = 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
  const pv = es * humidity;
  const pd = pressureHPa - pv;

  const currentRho = (pd / (Rd * tempK)) + (pv / (Rv * tempK));
  const stdRho = STD_PRESSURE_HPA / (Rd * STD_TEMP_K);

  return ((currentRho - stdRho) / stdRho) * 100;
}

/** Parse CSV text into array of numeric arrays (skips header) */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(/[,\t;]/).map(v => parseFloat(v.replace(',', '.')));
    if (!isNaN(cols[0]) && !isNaN(cols[1])) {
      data.push(cols);
    }
  }
  return data;
}

/** Get display name for a weapon key */
function getWeaponDisplayName(key) {
  return WEAPON_NAMES[key] || key;
}

/**
 * Find two bracketing rows for interpolation in a sorted table.
 * @returns {{ row1, row2, factor }} or null if not found
 */
function findBracket(table, dist) {
  for (let i = 0; i < table.length - 1; i++) {
    if (dist >= table[i][COL.DIST] && dist <= table[i + 1][COL.DIST]) {
      const span = table[i + 1][COL.DIST] - table[i][COL.DIST];
      return {
        row1: table[i],
        row2: table[i + 1],
        factor: span === 0 ? 0 : (dist - table[i][COL.DIST]) / span
      };
    }
  }
  return null;
}

// --- Data Loading ---

function loadDefaultTables() {
  try {
    if (typeof tablesRawData === 'undefined') {
      weaponSelect.innerHTML = '<option value="">Ошибка: tables.js не найден</option>';
      return;
    }

    weaponSelect.innerHTML = '';
    weaponsDb = {};
    let loadedAny = false;

    for (const key in tablesRawData) {
      const data = parseCSV(tablesRawData[key]);
      if (data.length > 0) {
        weaponsDb[key] = data;
        loadedAny = true;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = getWeaponDisplayName(key);
        weaponSelect.appendChild(opt);
      }
    }

    if (loadedAny) {
      currentWeapon = Object.keys(weaponsDb)[0];
      weaponSelect.value = currentWeapon;
      restoreInputs();
    } else {
      weaponSelect.innerHTML = '<option value="">Нет загруженных таблиц</option>';
    }
  } catch (err) {
    console.error('Ошибка загрузки таблиц:', err);
    weaponSelect.innerHTML = '<option value="">Ошибка загрузки таблиц</option>';
  }
}

// --- LocalStorage persistence ---

const STORAGE_KEY = 'artyCalcInputs';

function saveInputs() {
  const data = {};
  for (const key in els) {
    data[key] = els[key].value;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

function restoreInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    for (const key in saved) {
      if (els[key] && saved[key] !== '') {
        els[key].value = saved[key];
      }
    }
  } catch (e) { /* ignore */ }
}

// --- Normalize azimuth to [0, 6400) ---
function normalizeAz(az) {
  az = az % MILS_FULL_CIRCLE;
  return az < 0 ? az + MILS_FULL_CIRCLE : az;
}

// --- Main Calculation ---

function calculate() {
  if (!currentWeapon || !weaponsDb[currentWeapon]) {
    alert('Сначала выберите орудие и убедитесь, что таблицы загружены.');
    return;
  }

  saveInputs();

  // 1. Geodetic distance & azimuth
  const gX = getVal(els.gunX, 0), gY = getVal(els.gunY, 0);
  const tX = getVal(els.tgtX, 0), tY = getVal(els.tgtY, 0);
  const dx = tX - gX;
  const dy = tY - gY;
  const distGeo = Math.sqrt(dx * dx + dy * dy);

  let azimuthMil = Math.atan2(dx, dy) / MILS_TO_RAD;
  azimuthMil = normalizeAz(azimuthMil);

  const altDiff = getVal(els.tgtAlt, 0) - getVal(els.gunAlt, 0);

  // 2. Wind decomposition
  const windDirVal = getVal(els.windDir, 0);
  const windSpeed = getVal(els.windSpeed, 0);
  const windDirRad = els.windUnit.value === 'mil'
    ? windDirVal * MILS_TO_RAD
    : windDirVal * DEG_TO_RAD;

  const targetAzRad = azimuthMil * MILS_TO_RAD;
  const deltaAzRad = windDirRad - targetAzRad;
  const windTail = -windSpeed * Math.cos(deltaAzRad);   // >0 попутный, <0 встречный
  const windCross = -windSpeed * Math.sin(deltaAzRad);   // >0 слева, <0 справа

  // 3. Atmosphere
  const tempC = getVal(els.tempC, STD_TEMP_C);
  const pressure = getVal(els.pressure, STD_PRESSURE_HPA);
  const humidity = getVal(els.humidity, 50);
  const densPct = calculateDensityPct(tempC, pressure, humidity);

  // 4. Group table by charge
  const allData = weaponsDb[currentWeapon];
  const chargesData = {};
  for (const row of allData) {
    const c = row[COL.CHARGE];
    (chargesData[c] = chargesData[c] || []).push(row);
  }

  // 5. Evaluate each charge
  const candidates = [];

  for (const chargeKey in chargesData) {
    const table = chargesData[chargeKey];
    table.sort((a, b) => a[COL.DIST] - b[COL.DIST]);

    const minD = table[0][COL.DIST];
    const maxD = table[table.length - 1][COL.DIST];

    // Skip charges where geo distance is way out of range
    if (distGeo < minD - 2000 || distGeo > maxD + 2000) continue;

    // 5a. Interpolate weather coefficients at geo distance
    const kBracket = findBracket(table, distGeo);
    if (!kBracket) continue;
    const { row1: kR1, row2: kR2, factor: kF } = kBracket;

    const kHead    = lerp(kR1[COL.W_HEAD],   kR2[COL.W_HEAD],   kF);
    const kTail    = lerp(kR1[COL.W_TAIL],   kR2[COL.W_TAIL],   kF);
    const kTempDec = lerp(kR1[COL.T_DEC],    kR2[COL.T_DEC],    kF);
    const kTempInc = lerp(kR1[COL.T_INC],    kR2[COL.T_INC],    kF);
    const kDensDec = lerp(kR1[COL.DENS_DEC], kR2[COL.DENS_DEC], kF);
    const kDensInc = lerp(kR1[COL.DENS_INC], kR2[COL.DENS_INC], kF);

    // 5b. Effective distance correction
    // Signs in CSV columns are set so that simple multiplication + addition works:
    //   w_range_1ms_h_m is positive → headwind increases effective range
    //   w_range_1ms_t_m is negative → tailwind decreases effective range
    let corrM = 0;
    if (windTail < 0) {
      corrM += Math.abs(windTail) * kHead;  // headwind → + correction
    } else {
      corrM += windTail * kTail;            // tailwind → - correction (kTail < 0)
    }

    const dt = tempC - STD_TEMP_C;
    corrM += Math.abs(dt) * (dt > 0 ? kTempInc : kTempDec);

    corrM += Math.abs(densPct) * (densPct > 0 ? kDensInc : kDensDec);

    const effDist = distGeo + corrM;

    // 5c. Check effective distance is within table range
    if (effDist < minD || effDist > maxD) continue;

    // 5d. Interpolate ballistic parameters at effective distance
    const sBracket = findBracket(table, effDist);
    if (!sBracket) continue;
    const { row1: sR1, row2: sR2, factor: sF } = sBracket;

    const baseElev  = lerp(sR1[COL.ELEV],      sR2[COL.ELEV],      sF);
    const baseTOF   = lerp(sR1[COL.TOF],        sR2[COL.TOF],       sF);
    const dElev100  = lerp(sR1[COL.D_ELEV_100], sR2[COL.D_ELEV_100], sF);
    const dTOF100   = lerp(sR1[COL.D_TOF_100],  sR2[COL.D_TOF_100], sF);
    const azFactorV = lerp(sR1[COL.AZ_FACTOR],  sR2[COL.AZ_FACTOR], sF);

    // 5e. Altitude correction
    const finalElev = baseElev - (altDiff / 100) * dElev100;
    const finalTOF  = baseTOF - (altDiff / 100) * dTOF100;

    // 5f. Azimuth correction from crosswind
    const azCorrection = -(windCross * azFactorV);

    candidates.push({
      charge: chargeKey,
      elev: finalElev,
      tof: finalTOF,
      azCorr: azCorrection,
      effDist: effDist
    });
  }

  // 6. Display results
  displayResults(distGeo, azimuthMil, altDiff, windTail, windCross, candidates);
}

// --- Display ---

function displayResults(distGeo, azimuthMil, altDiff, windTail, windCross, candidates) {
  resultsPanel.classList.remove('hidden');

  // Wind info
  const tailStr = windTail >= 0
    ? `попутный ${windTail.toFixed(1)} м/с`
    : `встречный ${Math.abs(windTail).toFixed(1)} м/с`;
  const crossStr = windCross >= 0
    ? `слева ${windCross.toFixed(1)} м/с`
    : `справа ${Math.abs(windCross).toFixed(1)} м/с`;
  computedWind.textContent = `Ветер: ${tailStr}, ${crossStr}`;

  res.Dist.textContent = distGeo.toFixed(1);
  res.Az.textContent = azimuthMil.toFixed(1);
  res.DeltaH.textContent = altDiff.toFixed(1);

  if (candidates.length === 0) {
    res.Charge.textContent = 'ВНЕ ДОСЯГ.';
    res.ElevMil.textContent = '-';
    res.ElevDeg.textContent = '-';
    res.AzCorr.textContent = '-';
    res.FinalAz.textContent = '-';
    res.TOF.textContent = '-';
    res.EffDist.textContent = '-';
    allChargesPanel.classList.add('hidden');
    return;
  }

  // Sort by TOF (fastest first)
  candidates.sort((a, b) => a.tof - b.tof);
  const best = candidates[0];

  res.Charge.textContent = best.charge;
  res.ElevMil.textContent = best.elev.toFixed(1);
  res.ElevDeg.textContent = (best.elev * 360 / MILS_FULL_CIRCLE).toFixed(1);
  res.AzCorr.textContent = best.azCorr.toFixed(1);
  res.FinalAz.textContent = normalizeAz(azimuthMil + best.azCorr).toFixed(1);
  res.TOF.textContent = best.tof.toFixed(1);
  res.EffDist.textContent = best.effDist.toFixed(1);

  // All charges table
  if (candidates.length > 1) {
    allChargesPanel.classList.remove('hidden');
    allChargesBody.innerHTML = '';
    for (const c of candidates) {
      const fAz = normalizeAz(azimuthMil + c.azCorr);
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${c.charge}</td>` +
        `<td>${c.elev.toFixed(1)}</td>` +
        `<td>${fAz.toFixed(1)}</td>` +
        `<td>${c.tof.toFixed(1)}</td>`;
      if (c === best) tr.classList.add('best-row');
      allChargesBody.appendChild(tr);
    }
  } else {
    allChargesPanel.classList.add('hidden');
  }
}

// --- Event Listeners ---

loadDefaultTables();

weaponSelect.addEventListener('change', (e) => {
  currentWeapon = e.target.value;
});

calcBtn.addEventListener('click', calculate);

// Save inputs on change
for (const key in els) {
  els[key].addEventListener('change', saveInputs);
}

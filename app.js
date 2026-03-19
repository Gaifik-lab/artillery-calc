// State
let weaponsDb = {}; // { 'FileName': [ [row data], ... ] }
let currentWeapon = '';

// DOM Elements
const weaponSelect = document.getElementById('weaponSelect');
const calcBtn = document.getElementById('calcBtn');
const resultsPanel = document.getElementById('resultsPanel');

// Inputs
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

const computedWind = document.getElementById('computedWind');

// Res Outputs
const res = {
  Dist: document.getElementById('resDist'),
  Az: document.getElementById('resAz'),
  Charge: document.getElementById('resCharge'),
  ElevMil: document.getElementById('resElevMil'),
  ElevDeg: document.getElementById('resElevDeg'),
  AzCorr: document.getElementById('resAzCorr'),
  TOF: document.getElementById('resTOF'),
  DeltaH: document.getElementById('resDeltaH'),
  EffDist: document.getElementById('resEffDist')
};

// Utilities
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

function calculateDensityPct(tempC, pressureHPa, humidity) {
  if (!pressureHPa) pressureHPa = 1013.25;
  if (humidity === undefined) humidity = 0;
  if (humidity > 1) humidity = humidity / 100;
  
  const tempK = tempC + 273.15;
  const Rd = 287.058; 
  const Rv = 461.495; 
  
  // Teten's formula for Saturation Vapor Pressure in hPa
  const es = 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
  const pv = es * humidity; 
  const pd = pressureHPa - pv;
  
  const currentRho = (pd / (Rd * tempK)) + (pv / (Rv * tempK));
  const stdRho = 1013.25 / (Rd * 288.15); 
  
  return ((currentRho - stdRho) / stdRho) * 100;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const data = [];
  // Skip header, assuming first line is header
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    // Split by comma or tab
    const cols = lines[i].split(/[,\t;]/).map(val => parseFloat(val.replace(',', '.')));
    if (!isNaN(cols[0]) && !isNaN(cols[1])) {
       data.push(cols);
    }
  }
  return data;
}

// Read from injected tables.js script
function loadDefaultTables() {
  try {
    if (typeof tablesRawData === 'undefined') {
      weaponSelect.innerHTML = '<option value="">Ошибка: tables.js не найден о_О</option>';
      return;
    }

    let loadedAny = false;
    weaponSelect.innerHTML = '';
    weaponsDb = {}; // strictly tie to files

    for (const wpName in tablesRawData) {
      const text = tablesRawData[wpName];
      const data = parseCSV(text);
      if (data.length > 0) {
        weaponsDb[wpName] = data;
        loadedAny = true;
        
        const opt = document.createElement('option');
        opt.value = wpName;
        opt.textContent = wpName;
        weaponSelect.appendChild(opt);
      }
    }
    
    if (loadedAny) {
      if (!currentWeapon && Object.keys(weaponsDb).length > 0) {
        currentWeapon = Object.keys(weaponsDb)[0];
        weaponSelect.value = currentWeapon;
      }
    } else {
      weaponSelect.innerHTML = '<option value="">Нет загруженных таблиц</option>';
    }

  } catch (err) {
    console.log("Could not parse default tables.", err);
    weaponSelect.innerHTML = '<option value="">Ошибка загрузки таблиц</option>';
  }
}

// Init
loadDefaultTables();

weaponSelect.addEventListener('change', (e) => {
  currentWeapon = e.target.value;
});

// Calculation Logic
calcBtn.addEventListener('click', () => {
  if (!currentWeapon || !weaponsDb[currentWeapon]) {
    alert("Сначала загрузите и выберите таблицу стрельбы!");
    return;
  }

  // Ensure default fallback if input is empty
  const getVal = (el, def) => {
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
  };

  // Calculate Geodetic Distance & Azimuth
  const gX = getVal(els.gunX, 0);
  const gY = getVal(els.gunY, 0);
  const tX = getVal(els.tgtX, 0);
  const tY = getVal(els.tgtY, 0);

  const dx = tX - gX; // Easting diff
  const dy = tY - gY; // Northing diff

  const distGeo = Math.sqrt(dx*dx + dy*dy);
  
  // Angle from Y-axis (North) clockwise
  let azRad = Math.atan2(dx, dy); 
  let azimuthMil = azRad * (3200 / Math.PI);
  if (azimuthMil < 0) azimuthMil += 6400;

  const altDiff = getVal(els.tgtAlt, 0) - getVal(els.gunAlt, 0);
  
  const windDirVal = getVal(els.windDir, 0);
  const windUnit = els.windUnit.value;
  const windSpeed = getVal(els.windSpeed, 0);

  let windDirRad = 0;
  if (windUnit === 'mil') {
    windDirRad = windDirVal / (3200 / Math.PI);
  } else {
    windDirRad = windDirVal * (Math.PI / 180);
  }

  // target azimuth in radians
  const targetAzRad = azimuthMil / (3200 / Math.PI);
  
  const deltaAzRad = windDirRad - targetAzRad;
  const windTail = -windSpeed * Math.cos(deltaAzRad);
  const windCross = -windSpeed * Math.sin(deltaAzRad);

  const tempC = getVal(els.tempC, 15);
  const pressure = getVal(els.pressure, 1013.25);
  const humidity = getVal(els.humidity, 50);

  const allData = weaponsDb[currentWeapon];
  const densPct = calculateDensityPct(tempC, pressure, humidity);

  // Group by charge
  const chargesData = {};
  for(let r = 0; r < allData.length; r++) {
    const c = allData[r][0];
    if(!chargesData[c]) chargesData[c] = [];
    chargesData[c].push(allData[r]);
  }

  const candidates = [];

  for (const chargeKey in chargesData) {
    const table = chargesData[chargeKey];
    table.sort((a, b) => a[1] - b[1]);

    const minD = table[0][1];
    const maxD = table[table.length-1][1];

    if (distGeo < minD - 2000 || distGeo > maxD + 2000) continue;

    // 1. Weather coefficients
    let kRow1, kRow2, kFactor = 0;
    let kFound = false;
    for (let i = 0; i < table.length - 1; i++) {
      if (distGeo >= table[i][1] && distGeo <= table[i+1][1]) {
        kRow1 = table[i];
        kRow2 = table[i+1];
        kFactor = (distGeo - kRow1[1]) / (kRow2[1] - kRow1[1]);
        kFound = true;
        break;
      }
    }
    if (!kFound) continue;

    const kHead = lerp(kRow1[7], kRow2[7], kFactor);
    const kTail = lerp(kRow1[8], kRow2[8], kFactor);
    const kTempDec = lerp(kRow1[9], kRow2[9], kFactor);
    const kTempInc = lerp(kRow1[10], kRow2[10], kFactor);
    const kDensDec = lerp(kRow1[11], kRow2[11], kFactor);
    const kDensInc = lerp(kRow1[12], kRow2[12], kFactor);

    // 2. Effective Distance
    let corrM = 0;
    
    if (windTail < 0) {
      corrM += Math.abs(windTail) * kHead; 
    } else {
      corrM += windTail * kTail;
    }
    
    const dt = tempC - 15;
    if (dt > 0) corrM += Math.abs(dt) * kTempInc; 
    else corrM += Math.abs(dt) * kTempDec; 
    
    if (densPct > 0) corrM += Math.abs(densPct) * kDensInc; 
    else corrM += Math.abs(densPct) * kDensDec; 

    const effDist = distGeo + corrM;

    // 3. Ballistics
    if (effDist < minD || effDist > maxD) continue;

    let sRow1, sRow2, sFactor = 0;
    let sFound = false;
    for (let k = 0; k < table.length - 1; k++) {
      if (effDist >= table[k][1] && effDist <= table[k+1][1]) {
        sRow1 = table[k];
        sRow2 = table[k+1];
        sFactor = (effDist - sRow1[1]) / (sRow2[1] - sRow1[1]);
        sFound = true;
        break;
      }
    }
    if (!sFound) continue;

    const baseElev = lerp(sRow1[2], sRow2[2], sFactor);
    const baseTOF = lerp(sRow1[5], sRow2[5], sFactor);
    const dElev100 = lerp(sRow1[3], sRow2[3], sFactor);
    const dTOF100 = lerp(sRow1[4], sRow2[4], sFactor);
    const azFactorV = lerp(sRow1[6], sRow2[6], sFactor);

    // 4. Alt Correction
    const finalElev = baseElev - (altDiff / 100) * dElev100;
    const finalTOF = baseTOF - (altDiff / 100) * dTOF100;
    
    // 5. Azimuth Correction
    const azCorrection = -(windCross * azFactorV);

    candidates.push({
      charge: chargeKey,
      elev: finalElev,
      tof: finalTOF,
      azCorr: azCorrection,
      effDist: effDist 
    });
  }

  resultsPanel.classList.remove('hidden');

  // Show computed wind
  let tailStr = windTail >= 0 ? `попутный ${windTail.toFixed(1)} м/с` : `встречный ${Math.abs(windTail).toFixed(1)} м/с`;
  let crossStr = windCross >= 0 ? `слева ${windCross.toFixed(1)} м/с` : `справа ${Math.abs(windCross).toFixed(1)} м/с`;
  computedWind.textContent = `Учтенный ветер: ${tailStr}, ${crossStr}`;

  res.Dist.textContent = distGeo.toFixed(1);
  res.Az.textContent = azimuthMil.toFixed(1);
  res.DeltaH.textContent = altDiff.toFixed(1);

  if (candidates.length === 0) {
    res.Charge.textContent = "OUT";
    res.ElevMil.textContent = "FAIL";
    res.ElevDeg.textContent = "-";
    res.AzCorr.textContent = "-";
    res.TOF.textContent = "-";
    res.EffDist.textContent = "-";
    return;
  }

  candidates.sort((a, b) => a.tof - b.tof);
  const best = candidates[0];
  
  const elevDeg = best.elev * (360 / 6400);

  res.Charge.textContent = best.charge;
  res.ElevMil.textContent = best.elev.toFixed(1);
  res.ElevDeg.textContent = elevDeg.toFixed(1);
  res.AzCorr.textContent = best.azCorr.toFixed(1);
  res.TOF.textContent = best.tof.toFixed(1);
  res.EffDist.textContent = best.effDist.toFixed(1);
});

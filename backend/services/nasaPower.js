const fs = require('fs');
const path = require('path');

// Helper to format NASA YYYYMMDD to YYYY-MM-DD
function formatNasaDate(nasaDateStr) {
  if (nasaDateStr.length !== 8) return nasaDateStr;
  return `${nasaDateStr.slice(0, 4)}-${nasaDateStr.slice(4, 6)}-${nasaDateStr.slice(6, 8)}`;
}

// Fallback CSV Parser
function readCsvFallback() {
  try {
    const csvPath = path.join(__dirname, '..', 'data', 'field_data_backup.csv');
    const rawCsv = fs.readFileSync(csvPath, 'utf8');
    const lines = rawCsv.trim().split('\n');
    const results = [];
    
    // Line 0 is headers: date,rainfall_mm,soil_moisture,temperature,ndvi_proxy
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 5) {
        results.push({
          date: cols[0],
          rainfall_mm: parseFloat(cols[1]),
          soil_moisture: parseFloat(cols[2]),
          temperature: parseFloat(cols[3]),
          ndvi_proxy: parseFloat(cols[4])
        });
      }
    }
    console.log(`NASA POWER Fallback: Successfully loaded ${results.length} cached rows from backup CSV.`);
    return results;
  } catch (err) {
    console.error("Critical: Failed to read backup CSV fallback file:", err);
    return [];
  }
}

async function getFieldData(lat, lon, startDate, endDate) {
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,GWETTOP,T2M&community=AG&longitude=${lon}&latitude=${lat}&start=${startDate}&end=${endDate}&format=JSON`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    console.log(`Calling NASA POWER API for coords: [${lat}, ${lon}] from ${startDate} to ${endDate}...`);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`NASA API returned status: ${response.status}`);
    }

    const data = await response.json();
    
    const prectot = data.properties?.parameter?.PRECTOTCORR || {};
    const gwettop = data.properties?.parameter?.GWETTOP || {};
    const t2m = data.properties?.parameter?.T2M || {};

    const dates = Object.keys(prectot);
    if (dates.length === 0) {
      throw new Error("No parameter data found in NASA response.");
    }

    const transformed = [];

    dates.forEach(dateKey => {
      const rainfall_mm = prectot[dateKey];
      const rawSoil = gwettop[dateKey];
      const temperature = t2m[dateKey];

      // Filter out any daily entries where values are undefined or less than -900 (fill values)
      if (
        rainfall_mm === undefined || rainfall_mm < -900 ||
        rawSoil === undefined || rawSoil < -900 ||
        temperature === undefined || temperature < -900
      ) {
        return; // Skip this date
      }

      const soil_moisture = rawSoil * 100.0; // convert to percentage
      const ndvi_proxy = 0.2 + 0.5 * rawSoil;

      transformed.push({
        date: formatNasaDate(dateKey),
        rainfall_mm,
        soil_moisture,
        temperature,
        ndvi_proxy
      });
    });

    if (transformed.length === 0) {
      throw new Error("All returned records from NASA POWER API contained -999 no-data values.");
    }

    console.log(`NASA POWER API: Successfully fetched and transformed ${transformed.length} records.`);
    return transformed;

  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`NASA POWER API request failed or timed out (${err.message}). Using backup CSV fallback.`);
    return readCsvFallback();
  }
}

module.exports = {
  getFieldData
};

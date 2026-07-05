import React, { useState, useEffect } from 'react';
import { 
  Droplet, 
  CloudRain, 
  Thermometer, 
  Leaf, 
  Loader2, 
  Globe 
} from 'lucide-react';

const VILLAGE_COORDS = {
  "Karanji": { "lat": 20.9324, "lng": 77.7523 },
  "Rampur": { "lat": 20.8912, "lng": 77.6890 },
  "Dhamni": { "lat": 20.9745, "lng": 77.7124 },
  "Pipalta": { "lat": 20.9510, "lng": 77.8201 },
  "Bodwad": { "lat": 20.8654, "lng": 77.7812 }
};

export default function FieldDataWidget({ activeVillage, onVillageChange }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const coords = VILLAGE_COORDS[activeVillage] || VILLAGE_COORDS["Karanji"];

  useEffect(() => {
    let active = true;
    const fetchFieldData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/field-data?lat=${coords.lat}&lon=${coords.lng}&village=${activeVillage}`);
        if (!res.ok) {
          throw new Error("HTTP error fetching satellite data");
        }
        const json = await res.json();
        if (active) {
          setData(json);
        }
      } catch (err) {
        console.error("Error loading field data in widget:", err);
        if (active) {
          setError("Failed to fetch. Loading local cache.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchFieldData();

    return () => {
      active = false;
    };
  }, [activeVillage, coords.lat, coords.lng]);

  // Calculations for current statistics (latest day's data)
  const latestData = data.length > 0 ? data[data.length - 1] : null;

  // Calculate valid days count for rainfall display (up to 7 days)
  const validDaysCount = Math.min(data.length, 7);
  const precipitationLabel = validDaysCount < 7 
    ? `Last ${validDaysCount} valid days` 
    : "Last 7 days cumulative";

  // Rainfall total for the last 7 days
  const last7DaysRain = data.length > 0 
    ? data.slice(-validDaysCount).reduce((acc, curr) => acc + curr.rainfall_mm, 0)
    : 0;

  const getNdviBadge = (val) => {
    if (val < 0.35) {
      return { text: "Dry / Low Canopy", style: "bg-amber-100 text-amber-800 border-amber-250" };
    } else if (val < 0.50) {
      return { text: "Moderate Veg", style: "bg-blue-150 text-blue-800 border-blue-200" };
    } else {
      return { text: "Dense / Healthy", style: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[#1E4B8C] animate-spin-slow" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Satellite Climate Monitor
          </h3>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">
          NASA POWER API
        </span>
      </div>

      {/* Selected Village Dropdown Selector inside widget */}
      <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
        <span className="text-[10px] font-semibold text-slate-500">Focused Sector:</span>
        <select
          value={activeVillage}
          onChange={(e) => onVillageChange(e.target.value)}
          className="bg-white text-[11px] font-bold text-[#1E4B8C] border border-slate-250 rounded px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E4B8C]"
        >
          {Object.keys(VILLAGE_COORDS).map(vName => (
            <option key={vName} value={vName}>{vName}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-[#1E4B8C]" />
          <span className="text-[10px] font-medium">Fetching Daily Climate Metrics...</span>
        </div>
      ) : error && data.length === 0 ? (
        <div className="py-4 text-center text-[10px] text-red-500">
          {error}
        </div>
      ) : latestData ? (
        <div className="space-y-3.5">
          {/* Main Grid */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Soil Moisture */}
            <div className="bg-[#F8F9FA] border border-slate-150 rounded-lg p-3 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Droplet className="w-3.5 h-3.5 text-sky-500" />
                <span className="text-[10px] font-semibold uppercase">Soil Moisture</span>
              </div>
              <div>
                <span className="text-lg font-bold text-slate-800">
                  {latestData.soil_moisture.toFixed(1)}%
                </span>
                <p className="text-[8px] text-slate-400 mt-0.5">Topsoil profile percentage</p>
              </div>
            </div>

            {/* Rainfall 7 Days */}
            <div className="bg-[#F8F9FA] border border-slate-150 rounded-lg p-3 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <CloudRain className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[10px] font-semibold uppercase">Precipitation</span>
              </div>
              <div>
                <span className="text-lg font-bold text-slate-800">
                  {last7DaysRain.toFixed(1)} mm
                </span>
                <p className="text-[8px] text-slate-400 mt-0.5">{precipitationLabel}</p>
              </div>
            </div>

            {/* Temperature */}
            <div className="bg-[#F8F9FA] border border-slate-150 rounded-lg p-3 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Thermometer className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-[10px] font-semibold uppercase">Air Temp (2m)</span>
              </div>
              <div>
                <span className="text-lg font-bold text-slate-800">
                  {latestData.temperature.toFixed(1)}°C
                </span>
                <p className="text-[8px] text-slate-400 mt-0.5">Daily mean average</p>
              </div>
            </div>

            {/* Veg Health Index (NDVI Proxy) */}
            <div className="bg-[#F8F9FA] border border-slate-150 rounded-lg p-3 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-semibold uppercase">NDVI Proxy</span>
              </div>
              <div>
                <span className="text-lg font-bold text-slate-800">
                  {latestData.ndvi_proxy.toFixed(3)}
                </span>
                <p className="text-[8px] text-slate-400 mt-0.5">derived vegetative health</p>
              </div>
            </div>
          </div>

          {/* Alert/Status Banner based on NDVI */}
          <div className={`p-2.5 rounded-lg border text-[10px] flex items-center justify-between ${getNdviBadge(latestData.ndvi_proxy).style}`}>
            <span className="font-semibold">Vegetation Condition:</span>
            <span className="font-bold uppercase tracking-wider">
              {getNdviBadge(latestData.ndvi_proxy).text}
            </span>
          </div>

          {/* Footer Metadata */}
          <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1">
            <span>Observed Date: {latestData.date}</span>
            {error && <span className="text-amber-600 font-semibold">{error}</span>}
          </div>
        </div>
      ) : (
        <div className="py-4 text-center text-[10px] text-slate-400">
          No satellite records loaded.
        </div>
      )}
    </div>
  );
}

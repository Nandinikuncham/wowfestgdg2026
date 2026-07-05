const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/ or root
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const DB_PATH = path.join(__dirname, 'data.json');

// Read data helper
function readData() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading data.json, returning empty template:', err);
    return { reports: [], phc_stocks: {}, groundwater_levels: {}, village_coordinates: {} };
  }
}

// Write data helper
function writeData(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to data.json:', err);
  }
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Helper to call Gemini API
async function callGemini(contents) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not defined. Fallback mock response will be used.");
    throw new Error("API_KEY_MISSING");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contents })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini API call failed:", errText);
    throw new Error(`GEMINI_API_ERROR: ${response.status} - ${errText}`);
  }

  const json = await response.json();
  try {
    return json.candidates[0].content.parts[0].text;
  } catch (e) {
    console.error("Malformed response from Gemini:", JSON.stringify(json));
    throw new Error("MALFORMED_GEMINI_RESPONSE");
  }
}

// Strip markdown fences helper
function cleanJsonResponse(rawText) {
  let cleaned = rawText.trim();
  // Strip ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

// Classification Fallback
function fallbackClassify(text) {
  const lowercase = text.toLowerCase();
  let category = 'infrastructure';
  let issue_tag = 'Pothole';
  let urgency = 'medium';
  let summary = 'A citizen report needing administrative review.';
  
  if (lowercase.includes('crop') || lowercase.includes('farm') || lowercase.includes('pest') || lowercase.includes('agriculture') || lowercase.includes('water')) {
    category = 'agriculture';
    issue_tag = 'Crop Disease';
    urgency = 'high';
    summary = 'Agricultural issue regarding crop stress reported by citizen.';
  } else if (lowercase.includes('smoke') || lowercase.includes('burn') || lowercase.includes('garbage') || lowercase.includes('pollution') || lowercase.includes('chemical') || lowercase.includes('fire')) {
    category = 'pollution';
    issue_tag = 'Burning Garbage';
    urgency = 'high';
    summary = 'Air pollution incident with visible smoke and debris burning.';
  } else if (lowercase.includes('fever') || lowercase.includes('health') || lowercase.includes('medicine') || lowercase.includes('hospital') || lowercase.includes('sick') || lowercase.includes('clinic')) {
    category = 'health';
    issue_tag = 'Fever Outbreak';
    urgency = 'high';
    summary = 'Potential infectious disease spread or medical stock shortage.';
  } else if (lowercase.includes('road') || lowercase.includes('bridge') || lowercase.includes('drain') || lowercase.includes('streetlight') || lowercase.includes('pothole')) {
    category = 'infrastructure';
    if (lowercase.includes('road') || lowercase.includes('pothole')) issue_tag = 'Pothole';
    else if (lowercase.includes('bridge')) issue_tag = 'Broken Bridge';
    else if (lowercase.includes('drain')) issue_tag = 'Drain Blockage';
    else if (lowercase.includes('streetlight')) issue_tag = 'Streetlight Failure';
    urgency = lowercase.includes('urgent') || lowercase.includes('danger') ? 'high' : 'medium';
    summary = `Infrastructure maintenance request: ${issue_tag} issue.`;
  }
  return { category, issue_tag, urgency, summary };
}

// In-memory cache for correlation recommendations
const recommendationCache = {};

// Run Cross-Correlation Engine
async function getCorrelationAlerts(reports, phcStocks, groundwaterLevels) {
  const alerts = [];
  const villages = Object.keys(phcStocks);

  for (const village of villages) {
    const villageReports = reports.filter(r => r.village === village);

    // RULE A: 3+ reports tagged 'pollution' with 'smoke' or 'burning' in the issue_tag. Nearest PHC respiratory stock < 30.
    const pollutionSmokeReports = villageReports.filter(r => 
      r.category === 'pollution' && 
      r.issue_tag && 
      (r.issue_tag.toLowerCase().includes('smoke') || r.issue_tag.toLowerCase().includes('burning'))
    );

    const phcInfo = phcStocks[village];
    const respStock = phcInfo ? phcInfo.respiratory_medicine : 100;

    if (pollutionSmokeReports.length >= 3 && respStock < 30) {
      const alertId = `rule_a_${village}_${pollutionSmokeReports.length}_${respStock}`;
      let recommendation = recommendationCache[alertId];

      if (!recommendation) {
        // Fetch AI recommendation
        const matchedDataDesc = `Rule A Triggered: ${pollutionSmokeReports.length} smoke/burning reports in ${village}. Nearest PHC is ${phcInfo.phc_name} and its respiratory medicine stock is down to ${respStock} units.`;
        const prompt = `You are an AI advisor to a District Collector. Given this data: [${matchedDataDesc}], write a single actionable budget recommendation in this format: 'Recommendation: [action]. Rationale: [X reports/data point], [supporting stat].' Keep it under 40 words.`;
        
        try {
          const contents = [{ parts: [{ text: prompt }] }];
          const res = await callGemini(contents);
          recommendation = res.trim();
          recommendationCache[alertId] = recommendation;
        } catch (e) {
          console.error("Gemini failed for Rule A alert recommendation. Using fallback.", e.message);
          recommendation = `Recommendation: Immediately allocate emergency budget to restock respiratory meds at ${phcInfo.phc_name}. Rationale: ${pollutionSmokeReports.length} burning reports with stock down to ${respStock} units.`;
        }
      }

      alerts.push({
        id: `alert_a_${village}`,
        rule: 'RULE A',
        village,
        title: `Pollution & Health Risk Alert`,
        message: `Pollution spike detected in ${village} — ${phcInfo ? phcInfo.phc_name : 'Local PHC'} respiratory medicine stock is low (${respStock} units). Recommend restocking before patient surge.`,
        urgency: 'high',
        data: {
          reportsCount: pollutionSmokeReports.length,
          respStock
        },
        recommendation
      });
    }

    // RULE B: 3+ reports tagged 'agriculture' with urgency 'high'. Groundwater level < 40%.
    const highAgriReports = villageReports.filter(r => 
      r.category === 'agriculture' && 
      r.urgency === 'high'
    );

    const gwLevel = groundwaterLevels[village] !== undefined ? groundwaterLevels[village] : 100;

    if (highAgriReports.length >= 3 && gwLevel < 40) {
      const alertId = `rule_b_${village}_${highAgriReports.length}_${gwLevel}`;
      let recommendation = recommendationCache[alertId];

      if (!recommendation) {
        // Fetch AI recommendation
        const matchedDataDesc = `Rule B Triggered: ${highAgriReports.length} high-urgency agriculture reports in ${village}. Ground water percentage is at ${gwLevel}%.`;
        const prompt = `You are an AI advisor to a District Collector. Given this data: [${matchedDataDesc}], write a single actionable budget recommendation in this format: 'Recommendation: [action]. Rationale: [X reports/data point], [supporting stat].' Keep it under 40 words.`;
        
        try {
          const contents = [{ parts: [{ text: prompt }] }];
          const res = await callGemini(contents);
          recommendation = res.trim();
          recommendationCache[alertId] = recommendation;
        } catch (e) {
          console.error("Gemini failed for Rule B alert recommendation. Using fallback.", e.message);
          recommendation = `Recommendation: Release immediate micro-irrigation and check-dam funds for ${village}. Rationale: ${highAgriReports.length} high-urgency crop distress reports with groundwater down to ${gwLevel}%.`;
        }
      }

      alerts.push({
        id: `alert_b_${village}`,
        rule: 'RULE B',
        village,
        title: `Water Scarcity & Crop Distress Alert`,
        message: `Crop distress cluster in ${village} — groundwater down to ${gwLevel}%. Recommend prioritizing irrigation/check-dam funding.`,
        urgency: 'high',
        data: {
          reportsCount: highAgriReports.length,
          groundwater: gwLevel
        },
        recommendation
      });
    }
  }

  return alerts;
}

// GET reports, stocks, and alerts
app.get('/api/reports', async (req, res) => {
  const data = readData();
  const alerts = await getCorrelationAlerts(data.reports, data.phc_stocks, data.groundwater_levels);
  
  res.json({
    reports: data.reports,
    phc_stocks: data.phc_stocks,
    groundwater_levels: data.groundwater_levels,
    village_coordinates: data.village_coordinates,
    alerts
  });
});

// POST a new report (Citizen Submission)
app.post('/api/reports', upload.single('photo'), async (req, res) => {
  const { name, village, description } = req.body;
  const photo = req.file;

  if (!village || !description) {
    return res.status(400).json({ error: "Village and description are required fields." });
  }

  // Base64 process if image exists for Gemini
  let inlineDataPart = null;
  let photoUrl = null;

  if (photo) {
    const relativePath = `/uploads/${photo.filename}`;
    photoUrl = relativePath;
    
    try {
      const imgBuffer = fs.readFileSync(photo.path);
      const base64Img = imgBuffer.toString('base64');
      
      let mimeType = photo.mimetype;
      // Default fallback mime type
      if (!mimeType) {
        mimeType = 'image/jpeg';
      }
      
      inlineDataPart = {
        inlineData: {
          mimeType,
          data: base64Img
        }
      };
    } catch (err) {
      console.error("Failed to read uploaded photo for Gemini:", err);
    }
  }

  // Set system instructions and contents
  const systemInstructionText = `You are a citizen-report classifier for a district administration system. Given the following citizen report (text and optionally an image), classify it and return ONLY valid JSON, no markdown fences, no explanation, in this exact schema:
{
  "category": "infrastructure" | "pollution" | "health" | "agriculture",
  "issue_tag": "short 2-4 word label (e.g. 'Crop Disease', 'Burning Garbage', 'Pothole')",
  "urgency": "low" | "medium" | "high",
  "summary": "one sentence summary of the issue"
}`;

  const promptText = `Citizen Report details:
Village/Location: ${village}
Reporter Name: ${name || 'Anonymous'}
Description: ${description}`;

  const contents = [
    {
      role: 'user',
      parts: [
        { text: `${systemInstructionText}\n\nReport to classify:\n${promptText}` }
      ]
    }
  ];

  if (inlineDataPart) {
    contents[0].parts.push(inlineDataPart);
  }

  let classification;
  try {
    const rawResult = await callGemini(contents);
    const cleanedResult = cleanJsonResponse(rawResult);
    classification = JSON.parse(cleanedResult);
  } catch (err) {
    console.error("Gemini classification failed or timed out. Falling back to local heuristic rules.", err.message);
    classification = fallbackClassify(description);
  }

  // Ensure keys exist in classification
  const newReport = {
    id: `rep_${Date.now()}`,
    name: name || 'Anonymous',
    village,
    category: classification.category || 'infrastructure',
    issue_tag: classification.issue_tag || 'General Issue',
    urgency: classification.urgency || 'medium',
    summary: classification.summary || 'Citizen report received.',
    description,
    timestamp: new Date().toISOString(),
    photo_url: photoUrl
  };

  const data = readData();
  data.reports.unshift(newReport); // Add to beginning
  writeData(data);

  res.status(201).json(newReport);
});

// POST simulate 3 pollution reports in Karanji
app.post('/api/simulate', (req, res) => {
  const data = readData();
  const timestamp = new Date().toISOString();
  
  const simReports = [
    {
      id: `sim_rep_${Date.now()}_1`,
      name: "Simulated Citizen 1",
      village: "Karanji",
      category: "pollution",
      issue_tag: "Burning Garbage",
      urgency: "high",
      summary: "Thick plastic smoke and toxic fumes from garbage fire.",
      description: "Someone has set fire to a massive pile of plastics and garbage in Karanji near the market. The air is toxic and black smoke is spreading.",
      timestamp,
      photo_url: null
    },
    {
      id: `sim_rep_${Date.now()}_2`,
      name: "Simulated Citizen 2",
      village: "Karanji",
      category: "pollution",
      issue_tag: "Smoke Pollution",
      urgency: "high",
      summary: "Burning garbage pit causing asthma attacks.",
      description: "The garbage fire in Karanji is still burning. Children and elderly people are having breathing issues. Thick smoke everywhere.",
      timestamp,
      photo_url: null
    },
    {
      id: `sim_rep_${Date.now()}_3`,
      name: "Simulated Citizen 3",
      village: "Simulated Citizen 3", // Wait, let's make sure it's in Karanji village so it triggers!
      village: "Karanji",
      category: "pollution",
      issue_tag: "Garbage Burning",
      urgency: "high",
      summary: "Smoke from dumping ground fire choking the street.",
      description: "Very bad air quality in Karanji due to the municipal garbage burn. Thick grey smoke is choking the streets.",
      timestamp,
      photo_url: null
    }
  ];

  data.reports.unshift(...simReports);
  writeData(data);

  res.json({ success: true, count: 3 });
});

// Import NASA POWER service
const { getFieldData } = require('./services/nasaPower');

// GET /api/field-data?lat={lat}&lon={lon}&village={village}
app.get('/api/field-data', async (req, res) => {
  const { lat, lon, village } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Latitude (lat) and Longitude (lon) are required." });
  }

  // Generate date range ending 4 days ago (to avoid 2-3 day reporting lag)
  const today = new Date();
  const endDateVal = new Date();
  endDateVal.setDate(today.getDate() - 4);

  const startDateVal = new Date();
  startDateVal.setDate(today.getDate() - 34);

  const formatNasaQueryDate = (d) => {
    const yyyy = d.getFullYear().toString();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return yyyy + mm + dd;
  };

  const startDate = formatNasaQueryDate(startDateVal);
  const endDate = formatNasaQueryDate(endDateVal);

  try {
    const data = await getFieldData(lat, lon, startDate, endDate);
    res.json(data);
  } catch (err) {
    console.error("Error in /api/field-data route:", err);
    res.status(500).json({ error: "Internal server error fetching field data" });
  }
});

// POST /api/citizen-submit
app.post('/api/citizen-submit', async (req, res) => {
  const { photo_base64, audio_base64, text, lat, lon, village } = req.body;

  let inlineDataPart = null;
  let audioDataPart = null;
  let photoUrl = null;
  let audioUrl = null;

  // 1. Process Photo Base64 if present
  if (photo_base64) {
    try {
      const matches = photo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `citizen-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, buffer);
        photoUrl = `/uploads/${filename}`;

        inlineDataPart = {
          inlineData: {
            mimeType,
            data: base64Data
          }
        };
      }
    } catch (err) {
      console.error("Failed to save and parse base64 photo:", err);
    }
  }

  // 2. Process Audio Base64 if present
  if (audio_base64) {
    try {
      const matches = audio_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        
        // Write base64 audio to file
        const buffer = Buffer.from(base64Data, 'base64');
        let ext = '.mp3'; // default fallback
        if (mimeType) {
          if (mimeType.includes('webm')) ext = '.webm';
          else if (mimeType.includes('ogg')) ext = '.ogg';
          else if (mimeType.includes('wav')) ext = '.wav';
          else if (mimeType.includes('aac')) ext = '.aac';
          else if (mimeType.includes('m4a')) ext = '.m4a';
          else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) ext = '.mp3';
        }
        const filename = `citizen-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, buffer);
        audioUrl = `/uploads/${filename}`;

        audioDataPart = {
          inlineData: {
            mimeType,
            data: base64Data
          }
        };
      }
    } catch (err) {
      console.error("Failed to parse and save base64 audio:", err);
    }
  }

  // 3. Construct Gemini Classification Call
  const systemInstructionText = `You are a citizen-report classifier for a district administration system. Given the following citizen report (text, optionally an image, and optionally an audio recording of their voice), classify it and return ONLY valid JSON, no markdown fences, no explanation, in this exact schema:
{
  "category": "infrastructure" | "pollution" | "health" | "agriculture",
  "issue_tag": "short 2-4 word label (e.g. 'Crop Disease', 'Burning Garbage', 'Pothole')",
  "urgency": "low" | "medium" | "high",
  "summary": "one sentence summary of the issue"
}`;

  let promptText = `Citizen Report details:
Village/Location: ${village || 'Unknown'}
GPS Coordinates: Lat ${lat || 'Unknown'}, Lon ${lon || 'Unknown'}
Description text: ${text || '(No text description provided)'}`;

  if (audioDataPart) {
    promptText += `\n\nNote: A voice note audio recording is attached. Please transcribe/listen to this voice recording and combine its information with the description text to classify this report accurately.`;
  }

  const contents = [
    {
      role: 'user',
      parts: [
        { text: `${systemInstructionText}\n\nReport to classify:\n${promptText}` }
      ]
    }
  ];

  if (inlineDataPart) {
    contents[0].parts.push(inlineDataPart);
  }

  if (audioDataPart) {
    contents[0].parts.push(audioDataPart);
  }

  let classification;
  try {
    const rawResult = await callGemini(contents);
    const cleanedResult = cleanJsonResponse(rawResult);
    classification = JSON.parse(cleanedResult);
  } catch (err) {
    console.error("Gemini classification failed for citizen portal. Falling back to local heuristics:", err.message);
    classification = fallbackClassify(text || "Voice report");
  }

  // 4. Save to data store
  const newReport = {
    id: `rep_portal_${Date.now()}`,
    name: 'Mobile Citizen Portal',
    village: village || 'Karanji',
    lat: lat || null,
    lon: lon || null,
    category: classification.category || 'infrastructure',
    issue_tag: classification.issue_tag || 'Citizen Report',
    urgency: classification.urgency || 'medium',
    summary: classification.summary || 'Citizen report received.',
    description: text || 'Voice report submitted without text.',
    timestamp: new Date().toISOString(),
    photo_url: photoUrl,
    audio_url: audioUrl
  };

  const data = readData();
  data.reports.unshift(newReport);
  writeData(data);

  res.status(201).json(newReport);
});

// Start Express App
app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});

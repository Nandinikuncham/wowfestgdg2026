import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { 
  AlertTriangle, 
  MapPin, 
  Plus, 
  FileText, 
  CheckCircle, 
  MessageSquare, 
  Upload, 
  Activity, 
  Database, 
  Sparkles, 
  Clock, 
  Droplet, 
  ShieldAlert, 
  User, 
  ImageIcon,
  Send,
  Loader2
} from 'lucide-react';

import FieldDataWidget from './components/FieldDataWidget';
import CitizenPortal from './components/CitizenPortal';

const getCurrentPath = () => (typeof window !== 'undefined' ? window.location.pathname : '/');

export default function App() {
  const [data, setData] = useState({
    reports: [],
    phc_stocks: {},
    groundwater_levels: {},
    village_coordinates: {},
    alerts: []
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [route, setRoute] = useState(getCurrentPath());
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);

  const openCitizenPortal = () => {
    window.history.pushState({}, '', '/citizen-portal');
    setRoute('/citizen-portal');
  };
  const [simulating, setSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState('form'); // 'form' or 'whatsapp'
  const [selectedVillage, setSelectedVillage] = useState('Karanji');
  const [filterCategory, setFilterCategory] = useState('all');
  const [activeVillage, setActiveVillage] = useState('Karanji');

  const handleActiveVillageChange = (val) => {
    setActiveVillage(val);
    setVillage(val);
    setSelectedVillage(val);
  };

  // Form Fields
  const [name, setName] = useState('');
  const [village, setVillage] = useState('Karanji');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // WhatsApp Mock Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'bot', text: 'Namaste! I am Gram-Urban AI Assistant. How can I help you report an issue in your village today?', timestamp: new Date() }
  ]);
  const [chatBotLoading, setChatBotLoading] = useState(false);

  // Map DOM Reference
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);

  // Load dashboard data
  const fetchData = async () => {
    try {
      const res = await fetch('/api/reports');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Error fetching dashboard reports:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const refreshReports = () => {
      fetchData();
    };

    const intervalId = window.setInterval(refreshReports, 8000);
    window.addEventListener('focus', refreshReports);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshReports);
    };
  }, []);

  useEffect(() => {
    const handleRouteChange = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  const showPortal = route === '/citizen-portal';

  // Initialize Map
  useEffect(() => {
    if (!loading && mapRef.current && !mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([20.9229, 77.7510], 12);
      
      // Clean Light Tiles (CartoDB Positron)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CartoDB'
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add static village marker labels
      const villages = {
        "Karanji": { "lat": 20.9324, "lng": 77.7523 },
        "Rampur": { "lat": 20.8912, "lng": 77.6890 },
        "Dhamni": { "lat": 20.9745, "lng": 77.7124 },
        "Pipalta": { "lat": 20.9510, "lng": 77.8201 },
        "Bodwad": { "lat": 20.8654, "lng": 77.7812 }
      };

      Object.entries(villages).forEach(([name, coords]) => {
        const labelIcon = L.divIcon({
          html: `<div class="village-label">🏢 ${name}</div>`,
          className: 'village-label-wrapper',
          iconSize: [80, 24],
          iconAnchor: [40, 12]
        });
        const vMarker = L.marker([coords.lat, coords.lng], { icon: labelIcon }).addTo(map);
        vMarker.on('click', () => {
          handleActiveVillageChange(name);
        });
      });

      markersGroupRef.current = L.layerGroup().addTo(map);
    }
  }, [loading]);

  // Update Map Markers on data or filter change
  useEffect(() => {
    if (markersGroupRef.current && mapInstanceRef.current && data.reports.length > 0) {
      markersGroupRef.current.clearLayers();

      const filteredReports = filterCategory === 'all' 
        ? data.reports 
        : data.reports.filter(r => r.category === filterCategory);

      filteredReports.forEach(report => {
        const coords = data.village_coordinates[report.village];
        if (coords) {
          // Add random jitter to prevent perfect overlap
          const jitterLat = (Math.random() - 0.5) * 0.007;
          const jitterLng = (Math.random() - 0.5) * 0.007;
          const lat = coords.lat + jitterLat;
          const lng = coords.lng + jitterLng;

          const size = report.urgency === 'high' ? 32 : (report.urgency === 'medium' ? 24 : 18);
          
          const markerHtml = `
            <div class="map-marker-pin marker-${report.category} ${report.urgency === 'high' ? 'pulse-pin-high' : ''}" style="width: ${size}px; height: ${size}px;">
              <span style="font-size: ${size * 0.45}px; font-weight: bold;">
                ${report.category[0].toUpperCase()}
              </span>
            </div>
          `;

          const customIcon = L.divIcon({
            html: markerHtml,
            className: 'custom-div-icon',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
          });

          const popupContent = `
            <div class="p-2 text-slate-900 font-sans" style="min-width: 180px;">
              <div class="flex justify-between items-center mb-1">
                <span class="text-[9px] font-semibold px-2 py-0.5 rounded text-white ${
                  report.category === 'infrastructure' ? 'bg-[#C0392B]' :
                  report.category === 'pollution' ? 'bg-[#7F8C8D]' :
                  report.category === 'health' ? 'bg-[#2874A6]' : 'bg-[#27824C]'
                }">${report.category.toUpperCase()}</span>
                <span class="text-[9px] font-bold text-slate-500">${report.urgency.toUpperCase()}</span>
              </div>
              <h4 class="font-bold text-xs text-slate-800">${report.issue_tag}</h4>
              <p class="text-xs text-slate-600 my-1">${report.summary}</p>
              ${report.photo_url ? `<img src="${report.photo_url}" class="w-full h-16 object-cover rounded mt-1 mb-1 border border-slate-200" />` : ''}
              ${report.audio_url ? `<audio controls src="${report.audio_url}" class="w-full h-8 mt-1 mb-1 border border-slate-200 rounded-lg bg-slate-50" style="outline:none;"></audio>` : ''}
              <div class="text-[9px] text-slate-400 mt-2">
                Village: ${report.village} | Reporter: ${report.name}
              </div>
            </div>
          `;

          L.marker([lat, lng], { icon: customIcon })
            .bindPopup(popupContent)
            .addTo(markersGroupRef.current);
        }
      });
    }
  }, [data.reports, data.village_coordinates, filterCategory]);

  // Handle Form File Upload Preview
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Form Submit Handler
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('village', village);
    formData.append('description', description);
    if (photo) {
      formData.append('photo', photo);
    }

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        // Clear inputs
        setName('');
        setDescription('');
        setPhoto(null);
        setPhotoPreview(null);
        // Refresh Dashboard
        await fetchData();
      } else {
        alert("Failed to submit report. Ensure backend is running.");
      }
    } catch (e) {
      console.error(e);
      alert("Error submitting report.");
    } finally {
      setSubmitting(false);
    }
  };

  // Simulate Smoke Reports in Karanji
  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/simulate', { method: 'POST' });
      if (res.ok) {
        await fetchData();
        // Fly map to Karanji to highlight the incident area
        if (mapInstanceRef.current && data.village_coordinates["Karanji"]) {
          mapInstanceRef.current.setView([20.9324, 77.7523], 13);
        }
      }
    } catch (e) {
      console.error("Simulation failed:", e);
    } finally {
      setSimulating(false);
    }
  };

  // WhatsApp Mock Chat Submission
  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput('');

    // Append User Message
    const userMsg = { id: Date.now(), sender: 'user', text: userText, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatBotLoading(true);

    // Call API to classify and save report
    const formData = new FormData();
    formData.append('name', 'WhatsApp Reporter');
    formData.append('village', selectedVillage);
    formData.append('description', userText);

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const report = await res.json();
        
        // Append Bot Reply
        const botReply = {
          id: Date.now() + 1,
          sender: 'bot',
          text: `Thank you! I have filed this report for village *${selectedVillage}*.\n\n🤖 *AI Classification:* \n📁 Category: *${report.category}*\n🏷️ Tag: *${report.issue_tag}*\n⚠️ Urgency: *${report.urgency}*\n📝 Summary: "${report.summary}"\n\nThis has been updated live on the District Twin map.`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, botReply]);
        
        // Refresh Dashboard Data
        await fetchData();
      } else {
        const errorReply = {
          id: Date.now() + 1,
          sender: 'bot',
          text: `Apologies, I encountered an error connecting to the classification engine. Please try again.`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, errorReply]);
      }
    } catch (err) {
      console.error(err);
      const errorReply = {
        id: Date.now() + 1,
        sender: 'bot',
        text: `Network error. Please make sure the backend server is running.`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorReply]);
    } finally {
      setChatBotLoading(false);
    }
  };

  const timeSince = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return `${interval}y ago`;
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return `${interval}mo ago`;
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return `${interval}d ago`;
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return `${interval}h ago`;
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return `${interval}m ago`;
    return 'Just now';
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'infrastructure': return 'text-[#C0392B] bg-[#FADBD8] border-[#F1948A]';
      case 'pollution': return 'text-[#566573] bg-[#E5E7E9] border-[#BDC3C7]';
      case 'health': return 'text-[#2874A6] bg-[#EBF5FB] border-[#AED6F1]';
      case 'agriculture': return 'text-[#27824C] bg-[#E8F8F5] border-[#A3E4D7]';
      default: return 'text-slate-600 bg-slate-100 border-slate-200';
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'high': return 'text-[#D64545] bg-[#FDECEC]';
      case 'medium': return 'text-[#C98A1D] bg-[#FEF6E6]';
      case 'low': return 'text-[#4A6B57] bg-[#EAF3EC]';
      default: return 'text-slate-600 bg-slate-100';
    }
  };

  const filteredReportsCount = filterCategory === 'all' 
    ? data.reports.length 
    : data.reports.filter(r => r.category === filterCategory).length;

  const mobileReports = data.reports.filter(r => r.name === 'Mobile Citizen Portal' || (r.id && r.id.startsWith && r.id.startsWith('rep_portal_')));
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8FA] text-[#1A1D23]">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1E4B8C] flex items-center justify-center shadow-md shadow-[#1E4B8C]/10">
            <Activity className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#1E4B8C]">
              Gram-Urban.AI
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              District Digital Twin &amp; Decision Support System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 text-xs text-slate-600 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0F9D6E] animate-ping"></span>
              <span className="font-semibold text-slate-700">Gemini 2.0 Connected</span>
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-[#1E4B8C]" />
              <span className="font-medium text-slate-700">{data.reports.length} Ground Reports</span>
            </div>
          </div>

          <button
            onClick={openCitizenPortal}
            className="px-4 py-2 border border-[#1E4B8C] bg-white text-[#1E4B8C] rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Mobile Portal
          </button>

          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="shine-effect px-4 py-2 bg-[#1E4B8C] hover:bg-[#153B70] text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {simulating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Simulating...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                Simulate Smoke Report (Karanji)
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      {showPortal ? (
        <CitizenPortal />
      ) : (
        <main className="flex-grow flex flex-col lg:flex-row h-[calc(100vh-73px)] overflow-hidden">
        {/* Left Section: Map & Indicators */}
        <section className="flex-grow w-full lg:w-3/5 p-4 flex flex-col gap-4 overflow-y-auto">
          
          {/* AI priority recommendations / Top panel */}
          <div className="shrink-0 flex flex-col gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2 px-1">
              <ShieldAlert className="w-4 h-4 text-[#1E4B8C]" />
              AI Priority Recommendations Panel
            </h2>
            
            {data.alerts.length === 0 ? (
              <div className="glass-panel rounded-xl p-4 flex items-center gap-3 text-slate-600 bg-white">
                <CheckCircle className="w-5 h-5 text-[#0F9D6E] shrink-0" />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800">System Normal.</span> No critical cross-departmental correlation alerts generated. Feel free to trigger simulated reports to test alerts.
                </div>
              </div>
            ) : (
              <div className="bg-[#EEF4FC] border border-blue-100 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.alerts.map((alert) => (
                  <div 
                    key={alert.id} 
                    className="glass-panel border-slate-200/80 bg-white rounded-xl p-4 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-all relative overflow-hidden group border-l-4 border-l-[#1E4B8C]"
                  >
                    <div className="pl-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold px-2 py-0.5 bg-[#EEF4FC] text-[#1E4B8C] rounded-full border border-sky-100">
                          {alert.rule} MATCHED
                        </span>
                        <span className="text-[9px] font-semibold text-slate-500">{alert.village} Sector</span>
                      </div>
                      
                      <h3 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        {alert.title}
                      </h3>
                      <p className="text-[11px] text-slate-650 leading-relaxed font-normal">
                        {alert.message}
                      </p>
                    </div>

                    <div className="bg-[#F4F8FD] border border-sky-100 rounded-lg p-3 text-[11px] text-[#1E4B8C]">
                      <div className="font-bold text-[#1E4B8C] flex items-center gap-1 mb-1 text-[9px] uppercase tracking-wider">
                        <Sparkles className="w-3 h-3 text-[#1E4B8C] animate-pulse" />
                        AI Advisor Recommendation
                      </div>
                      <p className="italic leading-normal text-slate-700 font-serif">
                        "{alert.recommendation}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Map View */}
          <div className="flex-grow min-h-[300px] lg:min-h-0 glass-panel rounded-xl overflow-hidden relative flex flex-col">
            {/* Map Header overlays */}
            <div className="absolute top-3 left-3 z-[1000] bg-white border border-slate-200/80 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm text-slate-800">
              <MapPin className="w-4 h-4 text-[#1E4B8C]" />
              <span>Digital Twin Interactive Map</span>
            </div>

            {/* Map Canvas */}
            <div ref={mapRef} className="w-full h-full"></div>
            
            {/* Stock Levels & Info Overlay */}
            <div className="bg-white border-x-0 border-b-0 border-t border-slate-200 px-4 py-3 shrink-0 flex flex-wrap gap-4 items-center justify-between text-xs text-slate-600 z-[1000] shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Indicator Stocks:</div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#C0392B]"></span>
                  <span>Infrastructure</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#7F8C8D]"></span>
                  <span>Pollution</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2874A6]"></span>
                  <span>Health</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27824C]"></span>
                  <span>Agriculture</span>
                </div>
              </div>
              
              <div className="text-[10px] text-slate-400 font-medium">
                Tip: High-urgency reports are larger and pulse.
              </div>
            </div>
          </div>
        </section>

        {/* Right Section: Citizen input & Incoming feed */}
        <section className="w-full lg:w-2/5 border-t lg:border-t-0 lg:border-l border-slate-200 p-4 flex flex-col gap-4 overflow-hidden shrink-0 bg-[#F7F8FA] glass-panel">
          
          {/* Top Tabs: Standard Form vs WhatsApp Assistant */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setActiveTab('form')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'form' 
                  ? 'bg-white text-[#1E4B8C] shadow-sm border border-slate-200/50' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Citizen Report Form
            </button>
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
                activeTab === 'whatsapp' 
                  ? 'bg-white text-[#1E4B8C] shadow-sm border border-slate-200/50' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-[#0F9D6E]" />
              WhatsApp AI Chatbot
            </button>
          </div>

          {/* Tab 1: Standard Form */}
          {activeTab === 'form' && (
            <form 
              onSubmit={handleFormSubmit}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shrink-0 overflow-y-auto max-h-[300px] lg:max-h-[380px] shadow-sm"
            >
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reporter Name (Optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter name"
                    className="w-full bg-[#F1F3F5] border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#1A1D23] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4B8C] focus:border-[#1E4B8C]"
                  />
                </div>

                <div className="w-2/5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Village/Location</label>
                  <select
                    value={village}
                    onChange={(e) => handleActiveVillageChange(e.target.value)}
                    className="w-full bg-[#F1F3F5] border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#1A1D23] focus:outline-none focus:ring-2 focus:ring-[#1E4B8C] focus:border-[#1E4B8C] cursor-pointer"
                  >
                    <option value="Karanji">Karanji</option>
                    <option value="Rampur">Rampur</option>
                    <option value="Dhamni">Dhamni</option>
                    <option value="Pipalta">Pipalta</option>
                    <option value="Bodwad">Bodwad</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Issue Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  rows={2}
                  placeholder="Describe the issue... (e.g. crop damage, burning trash, deep potholes, fever outbreaks)"
                  className="w-full bg-[#F1F3F5] border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#1A1D23] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4B8C] focus:border-[#1E4B8C] resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-grow">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Photo Upload (Optional)</label>
                  <div className="relative flex items-center justify-center border border-dashed border-slate-300 hover:border-slate-400 bg-[#F1F3F5] rounded-lg p-2 transition cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <Upload className="w-3.5 h-3.5 text-[#1E4B8C]" />
                      <span>{photo ? photo.name : 'Select or drop image'}</span>
                    </div>
                  </div>
                </div>

                {photoPreview && (
                  <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0">
                    <img src={photoPreview} className="w-full h-full object-cover" alt="Preview" />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-[#1E4B8C] hover:bg-[#153B70] text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    Analyzing with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-sky-200" />
                    Submit Report &amp; Classify
                  </>
                )}
              </button>
            </form>
          )}

          {/* Tab 2: WhatsApp Chat Assistant */}
          {activeTab === 'whatsapp' && (
            <div className="bg-white border border-slate-200 flex flex-col shrink-0 h-[300px] lg:h-[380px] overflow-hidden rounded-xl shadow-sm">
              {/* Phone Header */}
              <div className="bg-emerald-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#0F9D6E] flex items-center justify-center font-bold text-white text-xs">
                    💬
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">District AI Assistant</h3>
                    <p className="text-[9px] text-[#0F9D6E] flex items-center gap-1 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0F9D6E] animate-ping"></span>
                      online
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Sector:</label>
                  <select 
                    value={selectedVillage} 
                    onChange={(e) => handleActiveVillageChange(e.target.value)}
                    className="bg-white text-[10px] text-slate-750 border border-slate-200 px-2 py-0.5 rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1E4B8C]"
                  >
                    <option value="Karanji">Karanji</option>
                    <option value="Rampur">Rampur</option>
                    <option value="Dhamni">Dhamni</option>
                    <option value="Pipalta">Pipalta</option>
                    <option value="Bodwad">Bodwad</option>
                  </select>
                </div>
              </div>

              {/* Chat Thread */}
              <div className="flex-grow p-3 overflow-y-auto space-y-2 flex flex-col bg-[#F7F8FA]">
                {chatMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={`max-w-[85%] rounded-xl p-2.5 text-[11px] leading-relaxed shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-[#1E4B8C] text-white self-end rounded-tr-none'
                        : 'bg-white border border-slate-200 text-slate-800 self-start rounded-tl-none'
                    }`}
                  >
                    {/* Render newlines */}
                    <div className="whitespace-pre-line">
                      {msg.text.split('*').map((chunk, idx) => 
                        idx % 2 === 1 ? <strong key={idx}>{chunk}</strong> : chunk
                      )}
                    </div>
                  </div>
                ))}

                {chatBotLoading && (
                  <div className="bg-slate-50 border border-slate-200 text-slate-500 self-start rounded-xl rounded-tl-none p-2.5 text-[11px] flex items-center gap-2 shadow-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0F9D6E]" />
                    <span>Gemini is classifying report...</span>
                  </div>
                )}
              </div>

              {/* Chat Form */}
              <form onSubmit={handleSendChat} className="p-2 border-t border-slate-200 flex gap-2 shrink-0 bg-white">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Write message for ${selectedVillage}...`}
                  className="flex-grow bg-[#F1F3F5] border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#1A1D23] placeholder-slate-450 focus:outline-none focus:ring-1 focus:ring-[#1E4B8C] focus:border-[#1E4B8C]"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatBotLoading}
                  className="w-8 h-8 rounded-lg bg-[#0F9D6E] hover:bg-[#0c825a] text-white flex items-center justify-center transition disabled:opacity-50 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* Mobile Portal Reports (recent) */}
          <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 mb-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-600">Mobile Portal Reports</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setMobilePanelOpen(!mobilePanelOpen)} className="text-[11px] text-slate-500 px-2 py-1 border rounded-md">{mobilePanelOpen ? 'Collapse' : 'Expand'}</button>
                <a href="/admin-portal?view=mobile" className="text-[11px] text-[#1E4B8C] font-semibold">View all</a>
                <span className="text-[11px] text-slate-400">{mobileReports.length}</span>
              </div>
            </div>
            {mobilePanelOpen && (
              <div className="mt-2 space-y-2">
                {mobileReports.slice(0,5).map(report => (
                  <div key={report.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-50 border border-slate-200 shrink-0">
                      {report.photo_url ? (
                        <img src={report.photo_url} className="w-full h-full object-cover" alt="thumb" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">No photo</div>
                      )}
                    </div>
                    <div className="flex-1 text-xs">
                      <div className="font-semibold text-slate-800 truncate">{report.issue_tag || report.summary}</div>
                      <div className="text-[11px] text-slate-500 truncate">{report.village} • {new Date(report.timestamp).toLocaleString()}</div>
                      {report.lat && report.lon && (
                        <div className="text-[10px] text-slate-400 mt-0.5">Lat: {Number(report.lat).toFixed(5)}, Lon: {Number(report.lon).toFixed(5)}</div>
                      )}
                      {report.audio_url && (
                        <div className="mt-1">
                          <audio controls src={report.audio_url} className="w-full h-6 rounded-lg border border-slate-200 bg-slate-50" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {mobileReports.length === 0 && (
                  <div className="text-[11px] text-slate-400">No mobile reports yet.</div>
                )}
              </div>
            )}
          </div>

          {/* Lower Feed: Incoming Reports */}
          <div className="flex-grow flex flex-col gap-2 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#1E4B8C]" />
                Live Reports Feed ({filteredReportsCount})
              </h2>

              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <span>Filter:</span>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-white border border-slate-200 text-[10px] rounded px-1.5 py-0.5 cursor-pointer text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#1E4B8C]"
                >
                  <option value="all">All</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="pollution">Pollution</option>
                  <option value="health">Health</option>
                  <option value="agriculture">Agriculture</option>
                </select>
              </div>
            </div>

            {/* Reports List */}
            <div className="flex-grow overflow-y-auto space-y-2 pr-1">
              {data.reports.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 bg-white border border-slate-200 rounded-xl">
                  No reports received yet. Submit an issue above.
                </div>
              ) : (
                data.reports
                  .filter(r => filterCategory === 'all' || r.category === filterCategory)
                  .map(report => (
                    <div 
                      key={report.id}
                      className="bg-white border border-slate-200/80 rounded-xl p-3 flex gap-3 transition-all hover:shadow-md hover:border-slate-300/80"
                    >
                      {/* Left thumbnail if photo is available */}
                      {report.photo_url && (
                        <div className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden shrink-0 self-center">
                          <img src={report.photo_url} className="w-full h-full object-cover" alt="Citizen evidence" />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-grow">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getCategoryColor(report.category)}`}>
                              {report.category}
                            </span>
                            <span className="text-[10px] font-bold text-slate-800">
                              {report.issue_tag}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">•</span>
                            <span className="text-[10px] text-[#1E4B8C] font-semibold">{report.village}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {report.urgency === 'high' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                            )}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${getUrgencyColor(report.urgency)}`}>
                              {report.urgency}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] font-semibold text-slate-800 line-clamp-1 mb-0.5">
                          {report.summary}
                        </p>
                        
                        <p className="text-[10px] text-slate-500 line-clamp-2 italic leading-relaxed font-normal">
                          "{report.description}"
                        </p>

                        {report.audio_url && (
                          <div className="mt-2">
                            <audio controls src={report.audio_url} className="w-full h-8 rounded-lg border border-slate-200 bg-slate-50" />
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2 text-[9px] text-slate-400">
                          <span className="flex items-center gap-2">
                            <User className="w-2.5 h-2.5 text-slate-400" />
                            By: {report.name}
                            {report.lat && report.lon && (
                              <span className="ml-2 text-[10px] text-slate-400">• Lat: {Number(report.lat).toFixed(4)}, Lon: {Number(report.lon).toFixed(4)}</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-slate-500">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            {timeSince(report.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* NASA Satellite Climate Widget */}
          <FieldDataWidget activeVillage={activeVillage} onVillageChange={handleActiveVillageChange} />
        </section>
        </main>
      )}
      </div>
  );
}

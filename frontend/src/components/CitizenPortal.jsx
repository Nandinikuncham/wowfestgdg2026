import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Mic, 
  FileText, 
  MapPin, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Volume2
} from 'lucide-react';

const VILLAGE_COORDS = {
  "Karanji": { "lat": 20.9324, "lng": 77.7523 },
  "Rampur": { "lat": 20.8912, "lng": 77.6890 },
  "Dhamni": { "lat": 20.9745, "lng": 77.7124 },
  "Pipalta": { "lat": 20.9510, "lng": 77.8201 },
  "Bodwad": { "lat": 20.8654, "lng": 77.7812 }
};

const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const findNearestVillage = (latitude, longitude) => {
  let minDist = Infinity;
  let nearest = "Karanji";
  Object.entries(VILLAGE_COORDS).forEach(([name, coords]) => {
    const dist = getDistanceInKm(latitude, longitude, coords.lat, coords.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = name;
    }
  });
  return { name: nearest, distance: minDist };
};

export default function CitizenPortal() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Step 1: Camera
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Step 2: Audio
  const recorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const audioBlobRef = useRef(null);
  const locationWatcherRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);

  // Step 3: Text
  const [text, setText] = useState('');

  // Step 4: GPS
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [gpsFailed, setGpsFailed] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('loading');
  const [village, setVillage] = useState('Karanji');

  // Camera Functions
  const startCamera = async () => {
    setPhotoBase64(null);
    setCameraActive(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      console.error("Camera access error:", err);
      // Fallback
      alert("Could not access camera. Ensure permissions are granted.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg');
      setPhotoBase64(base64);
      stopCamera();
    }
  };

  // Audio Functions
  const startRecording = async () => {
    if (isRecording) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert('This browser does not support voice recording.');
      return;
    }

    setAudioUrl(null);
    setAudioBase64(null);

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = audioStream;
      recordingChunksRef.current = [];

      const recorder = new MediaRecorder(audioStream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        audioBlobRef.current = blob;
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);

          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            setAudioBase64(reader.result);
          };
        }

        audioStream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        recorderRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Audio access failed:", err);
      alert("Could not access microphone. Please allow microphone permission and try again.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const ensureAudioBase64 = async () => {
    if (!audioBase64 && audioBlobRef.current) {
      const b64 = await blobToBase64(audioBlobRef.current);
      setAudioBase64(b64);
      return b64;
    }
    return audioBase64;
  };

  const continueFromAudio = async () => {
    await ensureAudioBase64();
    setStep(3);
  };

  // GPS trigger
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('denied');
      setGpsFailed(true);
      return;
    }

    const requestLocation = () => {
      setGpsStatus('loading');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          setLat(latitude);
          setLon(longitude);
          setGpsFailed(false);
          
          const nearest = findNearestVillage(latitude, longitude);
          if (nearest.distance > 15) {
            setGpsStatus('out_of_area');
          } else {
            setGpsStatus('success');
            setVillage(nearest.name);
          }
        },
        (err) => {
          console.warn("GPS lookup denied or failed:", err);
          setGpsFailed(true);
          setGpsStatus('denied');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );

      if (locationWatcherRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatcherRef.current);
      }

      locationWatcherRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          setLat(latitude);
          setLon(longitude);
          setGpsFailed(false);
          
          const nearest = findNearestVillage(latitude, longitude);
          if (nearest.distance > 15) {
            setGpsStatus('out_of_area');
          } else {
            setGpsStatus('success');
            setVillage(nearest.name);
          }
        },
        (err) => {
          console.warn('Live GPS watch failed:', err);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );
    };

    requestLocation();

    return () => {
      if (locationWatcherRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatcherRef.current);
      }
    };
  }, []);

  // Submit Handler
  const handleSubmit = async () => {
    setSubmitting(true);
    if (!audioBase64 && audioBlobRef.current) {
      try {
        const b64 = await blobToBase64(audioBlobRef.current);
        setAudioBase64(b64);
      } catch (e) {
        console.warn('Failed to convert audio blob to base64 before submit', e);
      }
    }

    const payload = {
      photo_base64: photoBase64,
      audio_base64: audioBase64,
      text: text,
      lat: lat || VILLAGE_COORDS[village].lat,
      lon: lon || VILLAGE_COORDS[village].lng,
      village,
      timestamp: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/citizen-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Redirect back to admin dashboard so the new report is visible in the main feed
        window.location.href = '/admin-portal';
      } else {
        alert("Failed to submit. Ensure backend server is running.");
      }
    } catch (e) {
      console.error(e);
      alert("Network error submitting report.");
    } finally {
      setSubmitting(false);
    }
  };

  // Reset wizard
  const handleReset = () => {
    setStep(1);
    setSuccess(false);
    setPhotoBase64(null);
    setAudioUrl(null);
    setAudioBase64(null);
    setText('');
    setLat(null);
    setLon(null);
    setGpsFailed(false);
    setGpsStatus('loading');
    setVillage('Karanji');
    if (locationWatcherRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
      locationWatcherRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-[420px] bg-white rounded-none sm:rounded-2xl shadow-md border-0 sm:border border-slate-200 overflow-hidden flex flex-col h-screen sm:h-[680px] relative">
        
        {/* Header Title */}
        <div className="bg-[#1E4B8C] px-5 py-4 shrink-0 flex items-center justify-between text-white shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏛️</span>
            <div>
              <h1 className="font-bold text-sm leading-tight">Gram-Urban.AI</h1>
              <p className="text-[10px] text-blue-200 font-semibold tracking-wider uppercase">Citizen Portal</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-900 text-blue-100 rounded-full border border-blue-800">
            MOBILE SECURE
          </span>
        </div>

        {success ? (
          /* SUCCESS SCREEN */
          <div className="flex-grow p-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center mx-auto text-emerald-500 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Report submitted — Thank you</h2>
            <p className="text-xs text-slate-500 leading-relaxed px-4">
              Your input has been classified by Gemini AI and logged onto the District Twin Command Center.
            </p>
            <button
              onClick={handleReset}
              className="px-6 py-2.5 bg-[#1E4B8C] hover:bg-[#153B70] text-white text-xs font-bold rounded-lg transition shadow-sm w-full"
            >
              Submit Another Report
            </button>
          </div>
        ) : (
          /* WIZARD SCREENS */
          <div className="flex-grow flex flex-col justify-between overflow-hidden">
            {/* Step progress bar */}
            <div className="bg-slate-50 px-5 py-2.5 shrink-0 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
                Step {step} of 5
              </span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(idx => (
                  <div 
                    key={idx} 
                    className={`w-4 h-1.5 rounded-full transition-all ${
                      idx <= step ? 'bg-[#1E4B8C]' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Step Content */}
            <div className="flex-grow p-5 overflow-y-auto">
              
              {/* STEP 1: Live Camera */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Camera className="w-4 h-4 text-[#1E4B8C]" />
                      <h2 className="text-xs font-bold uppercase tracking-wider">Step 1: Capture Evidence</h2>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                      Take a clear photo so the issue is visible to the field team.
                    </p>
                  </div>

                  {!photoBase64 && !cameraActive && (
                    <button
                      onClick={startCamera}
                      className="w-full py-10 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 transition"
                    >
                      <Camera className="w-8 h-8 text-[#1E4B8C] animate-pulse" />
                      <span className="text-xs font-bold">Open Device Camera</span>
                    </button>
                  )}

                  {cameraActive && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 relative h-64 flex items-center justify-center">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="absolute bottom-4 px-5 py-2 bg-red-600 text-white text-xs font-bold rounded-lg shadow hover:bg-red-700 transition"
                      >
                        Capture Frame
                      </button>
                    </div>
                  )}

                  {photoBase64 && (
                    <div className="space-y-3">
                      <div className="rounded-xl overflow-hidden border border-slate-200 h-64 bg-slate-50">
                        <img src={photoBase64} className="w-full h-full object-cover" alt="Captured citizen evidence" />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Retake Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="flex-1 py-2 bg-[#1E4B8C] hover:bg-[#153B70] text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          Confirm Photo
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    Provide a picture of the issue (road damage, dump fire, agricultural distress).
                  </p>
                </div>
              )}

              {/* STEP 2: Voice Reporter */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Mic className="w-4 h-4 text-[#1E4B8C]" />
                      <h2 className="text-xs font-bold uppercase tracking-wider">Step 2: Voice Recorder</h2>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                      Hold the button while you describe the issue. Your voice note will appear below after you release it.
                    </p>
                  </div>

                  <div className="flex flex-col items-center justify-center py-6 space-y-4">
                    {/* Visualizer bars */}
                    {isRecording ? (
                      <div className="flex gap-1.5 items-end justify-center h-12 py-2">
                        <div className="w-1.5 bg-red-500 rounded animate-bounce h-8"></div>
                        <div className="w-1.5 bg-red-500 rounded animate-bounce h-12" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-1.5 bg-red-500 rounded animate-bounce h-6" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-1.5 bg-red-500 rounded animate-bounce h-10" style={{ animationDelay: '0.3s' }}></div>
                        <div className="w-1.5 bg-red-500 rounded animate-bounce h-7" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 items-end justify-center h-12 py-2 text-slate-300">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className="w-1.5 bg-slate-200 rounded h-3"></div>
                        ))}
                      </div>
                    )}

                    {/* Hold to Talk button */}
                    {!audioUrl && (
                      <button
                        type="button"
                        onPointerDown={startRecording}
                        onPointerUp={stopRecording}
                        onPointerLeave={stopRecording}
                        onPointerCancel={stopRecording}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1.5 shadow-md border transition cursor-pointer select-none ${
                          isRecording 
                            ? 'bg-red-550 border-red-300 text-white animate-pulse' 
                            : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-100 text-[#0F9D6E]'
                        }`}
                      >
                        <Mic className="w-8 h-8" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {isRecording ? 'Listening' : 'Hold to Talk'}
                        </span>
                      </button>
                    )}

                    {audioUrl && (
                      <div className="w-full space-y-3">
                        <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                          <Volume2 className="w-4 h-4 text-[#1E4B8C]" />
                          <audio src={audioUrl} controls className="flex-grow h-8" />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setAudioUrl(null);
                              setAudioBase64(null);
                              audioBlobRef.current = null;
                            }}
                            className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Re-record Voice Note
                          </button>
                          <button
                            onClick={continueFromAudio}
                            className="flex-1 py-2 bg-[#1E4B8C] hover:bg-[#153B70] text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                          >
                            Continue
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    Voice records help senior officials understand the situation. Hold the button, explain the issue, and release to finish.
                  </p>
                </div>
              )}

              {/* STEP 3: Text Input */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <FileText className="w-4 h-4 text-[#1E4B8C]" />
                      <h2 className="text-xs font-bold uppercase tracking-wider">Step 3: Issue Description</h2>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                      Add any extra detail that helps the field team understand the urgency.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Write details here</label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={6}
                      placeholder="Describe what you're reporting — e.g. crop damage, burning trash, deep potholes, fever outbreaks..."
                      className="w-full bg-[#F1F3F5] border border-slate-200 rounded-xl p-3.5 text-xs text-[#1A1D23] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4B8C] focus:border-[#1E4B8C] resize-none shadow-inner"
                    />
                  </div>
                </div>
              )}

              {/* STEP 4: Auto-Location */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-[#1E4B8C]" />
                      <h2 className="text-xs font-bold uppercase tracking-wider">Step 4: Confirm Location</h2>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                      Your live GPS position is used automatically when available.
                    </p>
                  </div>

                  {lat && lon && gpsStatus !== 'out_of_area' ? (
                    <div className="bg-[#EEF4FC] border border-blue-100 rounded-xl p-4 space-y-2.5 shadow-sm text-center">
                      <MapPin className="w-8 h-8 text-[#1E4B8C] mx-auto animate-bounce" />
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">GPS Position Acquired</span>
                        <h4 className="text-sm font-bold text-[#1E4B8C]">{village} Sector</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] bg-white border border-sky-100 p-2 rounded-lg text-slate-500 font-mono">
                        <div>Lat: {lat.toFixed(5)}</div>
                        <div>Lon: {lon.toFixed(5)}</div>
                      </div>
                    </div>
                  ) : (gpsFailed || gpsStatus === 'out_of_area') ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="text-center">
                        <span className="text-lg">⚠️</span>
                        <h4 className="text-xs font-bold text-amber-800 uppercase mt-1">
                          {gpsStatus === 'out_of_area' ? 'Location Out of District' : 'Location Access Denied'}
                        </h4>
                        <p className="text-[10px] text-slate-550 mt-1 leading-relaxed">
                          {gpsStatus === 'out_of_area' 
                            ? 'Your GPS location is outside the supported district. Please select your village manually from the list below:'
                            : 'We could not determine your current GPS coordinates. Please select your village manually from the list below:'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Select Village</label>
                        <select
                          value={village}
                          onChange={(e) => setVillage(e.target.value)}
                          className="w-full bg-white border border-slate-250 rounded-lg px-3 py-2 text-xs font-bold text-[#1E4B8C] focus:outline-none"
                        >
                          <option value="Karanji">Karanji</option>
                          <option value="Rampur">Rampur</option>
                          <option value="Dhamni">Dhamni</option>
                          <option value="Pipalta">Pipalta</option>
                          <option value="Bodwad">Bodwad</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-450">
                      <Loader2 className="w-6 h-6 animate-spin text-[#1E4B8C]" />
                      <span className="text-xs font-bold text-slate-600">Retrieving live GPS coordinates...</span>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5: Review & Submit */}
              {step === 5 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Sparkles className="w-4 h-4 text-[#1E4B8C]" />
                    <h2 className="text-xs font-bold uppercase tracking-wider">Step 5: Review Summary</h2>
                  </div>

                  <div className="space-y-3 bg-[#F8F9FA] border border-slate-200 rounded-xl p-4 shadow-sm text-xs text-slate-700">
                    {/* Photo thumbnail */}
                    {photoBase64 ? (
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-2.5">
                        <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0">
                          <img src={photoBase64} className="w-full h-full object-cover" alt="Thumb" />
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-600">✓ Photo Evidence Attached</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 border-b border-slate-100 pb-2.5">
                        No photo evidence attached.
                      </div>
                    )}

                    {/* Audio playback */}
                    {audioUrl ? (
                      <div className="flex flex-col gap-1 border-b border-slate-100 pb-2.5">
                        <span className="text-[10px] font-semibold text-emerald-600">✓ Voice Recording Attached:</span>
                        <audio src={audioUrl} controls className="w-full h-6" />
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 border-b border-slate-100 pb-2.5">
                        No voice note attached.
                      </div>
                    )}

                    {/* Text description */}
                    <div className="border-b border-slate-100 pb-2.5">
                      <span className="text-[9px] font-bold text-slate-450 uppercase block mb-1">Description:</span>
                      <p className="italic text-slate-600 bg-white border border-slate-150 p-2 rounded-lg">
                        {text ? `"${text}"` : '(No written description entered)'}
                      </p>
                    </div>

                    {/* GPS location */}
                    <div>
                      <span className="text-[9px] font-bold text-slate-450 uppercase block mb-0.5">Location:</span>
                      <span className="font-bold text-[#1E4B8C]">
                        {village} Sector {lat && `(Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)})`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0 gap-3">
              <button
                type="button"
                onClick={() => setStep(prev => prev - 1)}
                disabled={step === 1 || submitting}
                className="px-4 py-2.5 border border-slate-250 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-lg transition disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 min-h-[48px]"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              {step < 5 ? (
                <button
                  type="button"
                  onClick={() => setStep(prev => prev + 1)}
                  className="px-5 py-2.5 bg-[#1E4B8C] hover:bg-[#153B70] text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1 min-h-[48px]"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-grow px-5 py-2.5 bg-[#1E4B8C] hover:bg-[#153B70] text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center justify-center gap-1.5 min-h-[48px] disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing with Gemini...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-sky-200" />
                      Submit Report
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

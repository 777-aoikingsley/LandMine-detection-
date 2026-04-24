/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  AlertTriangle, 
  Settings, 
  Terminal,
  Map as MapIcon,
  Zap,
  Activity,
  Shield,
  Radio,
  Lock,
  Target,
  Cpu,
  RefreshCw,
  Crosshair,
  LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for Leaflet default icon issues in React/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Mine Icon
const mineIcon = new L.DivIcon({
  className: 'custom-mine-icon',
  html: `<div style="width: 20px; height: 20px; background: #ff003c; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px #ff003c;"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const userIcon = new L.DivIcon({
  className: 'custom-user-icon',
  html: `<div style="width: 15px; height: 15px; background: #00f2ff; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px #00f2ff;"></div>`,
  iconSize: [15, 15],
  iconAnchor: [7.5, 7.5],
});

// ... TYPES ---
interface Marker {
  id: number;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  type: 'MINE' | 'OBJECT';
  timestamp: string;
}

interface SensorData {
  ir: number;
  metal: number;
}

// --- CONSTANTS ---
const THEME = {
  bg: '#010206',
  cyan: '#00f2ff',
  red: '#ff003c',
  amber: '#ffaa00',
  emerald: '#00ff9d',
  obsidian: '#0a0a0f',
};

// --- COMPONENTS ---

function CyberPanel({ 
  children, 
  title, 
  icon: Icon, 
  variant = 'cyan', 
  className = "" 
}: { 
  children: React.ReactNode, 
  title?: string, 
  icon?: any, 
  variant?: 'cyan' | 'red' | 'amber',
  className?: string
}) {
  const color = THEME[variant];
  return (
    <div className={`relative flex flex-col bg-black/60 backdrop-blur-xl border border-${variant}-500/10 ${className}`}>
      {/* Corner Segments */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2" style={{ borderColor: color }} />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2" style={{ borderColor: color }} />
      
      {/* Header Bar */}
      {title && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-3 h-3" style={{ color }} />}
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/70">{title}</span>
          </div>
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full opacity-50" style={{ backgroundColor: color }} />
            <div className="w-1 h-1 rounded-full opacity-20" style={{ backgroundColor: color }} />
          </div>
        </div>
      )}
      
      <div className="p-4 flex-1 relative flex flex-col">
        {children}
      </div>

      {/* Decorative Scanline */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-white/10 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ x: ['-100%', '100%'] }} 
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="w-1/2 h-full"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState<'DASHBOARD' | 'MAP'>('DASHBOARD');
  const [port, setPort] = useState<SerialPort | null>(null);
  const [sensorData, setSensorData] = useState<SensorData>({ ir: 10, metal: 10 });
  const [logs, setLogs] = useState<{time: string, msg: string}[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [irHistory, setIrHistory] = useState<number[]>(Array(100).fill(5));
  const [metalHistory, setMetalHistory] = useState<number[]>(Array(100).fill(5));
  const [currentPosition, setCurrentPosition] = useState({ lat: 18.989, lng: 73.117 }); // Default: Navi Mumbai (VIMEET)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCurrentPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);
  
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-40), { time: new Date().toLocaleTimeString(), msg }]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const connect = async () => {
    if (!(navigator as any).serial) {
       alert("Web Serial API required. Please use Chrome.");
       return;
    }
    try {
      const selectedPort = await (navigator as any).serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsConnected(true);
      addLog("SYNC SUCCESS: SATELLITE UPLINK ESTABLISHED.");
      
      const textDecoder = new TextDecoderStream();
      selectedPort.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) handleIncomingData(value);
      }
    } catch (err: any) {
      console.error(err);
      addLog(`CRITICAL ERROR: ${err.message}`);
    }
  };

  const handleIncomingData = (data: string) => {
    const lines = data.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.includes("[UI_DATA:")) {
        const match = trimmed.match(/\[UI_DATA:(\d+),(\d+)\]/);
        if (match) {
          const ir = parseInt(match[1]);
          const metal = parseInt(match[2]);
          setSensorData({ ir, metal });
          setIrHistory(prev => [...prev.slice(1), ir]);
          setMetalHistory(prev => [...prev.slice(1), metal]);

          if (ir < 5 && metal < 5) {
             if (!isAlertOpen) {
                setIsAlertOpen(true);
                addMarker('MINE');
                addLog("!! HAZARD: EXPLOSIVE SIGNATURE CONFIRMED !!");
             }
          }
        }
      }
    });
  };

  const addMarker = (type: 'MINE' | 'OBJECT') => {
    const latOffset = (Math.random() - 0.5) * 0.005;
    const lngOffset = (Math.random() - 0.5) * 0.005;
    setMarkers(prev => [{
      id: Date.now(),
      x: Math.random() * 80 + 10,
      y: Math.random() * 80 + 10,
      lat: currentPosition.lat + latOffset,
      lng: currentPosition.lng + lngOffset,
      type,
      timestamp: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 50));
  };

  const isHazard = sensorData.ir < 5 && sensorData.metal < 5;

  return (
    <div className={`min-h-screen ${isHazard ? 'bg-[#0a0202]' : 'bg-[#010206]'} text-slate-200 font-mono relative overflow-hidden flex flex-col transition-colors duration-1000 uppercase`}>
      {/* Global Aesthetic Overlays */}
      <div className="fixed inset-0 pointer-events-none z-[1000] opacity-[0.03] animate-pulse" style={{ background: 'url(https://grainy-gradients.vercel.app/noise.svg)' }} />
      <div className="fixed inset-0 pointer-events-none z-[1000] sx-scanline" />
      
      <style>{`
        .sx-scanline {
          background: linear-gradient(to bottom, transparent 50%, rgba(0, 242, 255, 0.02) 50%);
          background-size: 100% 4px;
        }
        @keyframes glitch {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
          100% { transform: translate(0); }
        }
        .animate-glitch { animation: glitch 0.2s infinite; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(0, 242, 255, 0.2); }
      `}</style>
      
      {/* Header */}
      <header className={`relative z-10 flex items-center justify-between px-10 py-6 border-b transition-colors duration-700 ${isHazard ? 'border-red-500 bg-red-500/5' : 'border-blue-500/20 bg-black/80'} backdrop-blur-2xl`}>
        <div className="flex items-center gap-8">
          <div className="relative group">
            <div className={`w-14 h-14 border-2 ${isHazard ? 'border-red-500 shadow-[0_0_30px_#ff003c]' : 'border-cyan-400 shadow-[0_0_30px_#00f2ff]'} transform rotate-45 flex items-center justify-center transition-all duration-500`}>
               <Shield className={`w-7 h-7 -rotate-45 ${isHazard ? 'text-red-500 animate-pulse' : 'text-cyan-400'}`} />
               {/* Orbital Rings */}
               <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-[-8px] border border-cyan-400/20 rounded-full" />
            </div>
            {isHazard && <div className="absolute inset-0 bg-red-500/20 blur-xl animate-pulse" />}
          </div>
          <div>
            <h1 className={`text-xl font-black tracking-[0.8em] leading-none mb-2 transition-colors duration-500 ${isHazard ? 'text-red-500 animate-glitch' : 'text-cyan-400'}`}>AEGIS SENTINEL </h1>
            <div className="flex items-center gap-2">
              <div className="h-1 w-12 bg-white/10">
                <motion.div animate={{ width: ['0%', '100%', '0%'] }} transition={{ duration: 2, repeat: Infinity }} className="h-full bg-cyan-400" />
              </div>
              <p className="text-[10px] text-slate-500 font-bold tracking-[0.4em]">SYSTEM_STATUS: {isConnected ? 'UPLINK_STABLE' : 'NO_SIGNAL'}</p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-8 items-center">
          <div className="flex bg-black/40 border border-white/10 p-1 rounded-lg">
             <button 
                onClick={() => setViewMode('DASHBOARD')}
                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black tracking-widest transition-all ${viewMode === 'DASHBOARD' ? 'bg-cyan-500 text-black' : 'text-slate-400 hover:text-cyan-400'}`}
             >
                <LayoutDashboard className="w-3 h-3" />
                DASHBOARD
             </button>
             <button 
                onClick={() => setViewMode('MAP')}
                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black tracking-widest transition-all ${viewMode === 'MAP' ? 'bg-cyan-500 text-black' : 'text-slate-400 hover:text-cyan-400'}`}
             >
                <MapIcon className="w-3 h-3" />
                TACTICAL_MAP
             </button>
          </div>

          {!isConnected ? (
             <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={connect}
                className="px-8 py-3 bg-cyan-500 text-black text-[11px] font-black tracking-[0.3em] transition-all [clip-path:polygon(0_0,90%_0,100%_30%,100%_100%,10%_100%,0_70%)] hover:bg-white"
              >
                ESTABLISH_UPLINK
              </motion.button>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-cyan-400 font-black tracking-widest">SATELLITE_FIX</span>
                <span className="text-[10px] text-slate-500">GAMMA_9_GEO_SYNC</span>
              </div>
              <div className="w-10 h-10 border border-cyan-400/30 flex items-center justify-center">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'DASHBOARD' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-12 gap-6 p-6 h-full bg-[radial-gradient(circle_at_50%_50%,_rgba(0,136,255,0.02)_0%,_transparent_70%)]"
            >
              {/* Left Column */}
              <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
                 {/* Biometric Analysis */}
                 <CyberPanel title="Neural IR Signature" icon={Activity} variant={isHazard ? 'red' : 'cyan'} className="flex-none">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className={`text-4xl font-black ${isHazard ? 'text-red-500' : 'text-cyan-400'} tracking-tighter`}>{sensorData.ir}.0<span className="text-sm opacity-50 ml-1">Hz</span></span>
                      <div className="text-right">
                        <div className="text-[8px] opacity-30">SIGNAL_LEVEL</div>
                        <div className="text-[10px] font-bold text-white/40">NOMINAL</div>
                      </div>
                    </div>
                    <ECGWave data={irHistory} color={isHazard ? '#ff003c' : '#00f2ff'} />
                 </CyberPanel>

                 {/* Magnetic Analysis */}
                 <CyberPanel title="Magnetic Mass Spectrometer" icon={Zap} variant="amber" className="flex-none">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-4xl font-black text-amber-500 tracking-tighter">{sensorData.metal}.1<span className="text-sm opacity-50 ml-1">μT</span></span>
                      <div className="text-right">
                        <div className="text-[8px] opacity-30">MASS_DENSITY</div>
                        <div className="text-[10px] font-bold text-white/40">SCANNING...</div>
                      </div>
                    </div>
                    <ECGWave data={metalHistory} color="#ffaa00" />
                 </CyberPanel>

                 {/* Syslog */}
                 <CyberPanel title="Encrypted Uplink Stream" icon={Terminal} variant="cyan" className="flex-1">
                    <div ref={logRef} className="absolute inset-0 p-4 pt-0 overflow-y-auto space-y-1 font-mono text-[9px] text-cyan-400/60 scrollbar-thin">
                      {logs.map((l, i) => (
                        <div key={i} className={`flex gap-3 border-b border-white/5 pb-1 ${l.msg.includes('HAZARD') ? 'text-red-500 bg-red-500/5 animate-pulse' : ''}`}>
                          <span className="opacity-20 flex-shrink-0">[{l.time.split(':')[2]}]</span>
                          <span className="tracking-tighter">{l.msg}</span>
                        </div>
                      ))}
                    </div>
                 </CyberPanel>
              </div>

              {/* Center Panel */}
              <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
                 <CyberPanel variant={isHazard ? 'red' : 'cyan'} className="flex-1 relative group bg-black/80 overflow-hidden">
                    {/* Radar Rings */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity">
                       {[1, 2, 3, 4, 5].map(i => (
                         <div key={i} className={`absolute border-2 rounded-full ${isHazard ? 'border-red-500' : 'border-cyan-400'}`} style={{ width: `${i * 20}%`, height: `${i * 20}%` }} />
                       ))}
                       <motion.div 
                         animate={{ rotate: 360 }} 
                         transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                         className={`absolute w-full h-full border-r-2 border-cyan-400/20 rounded-full`}
                       />
                    </div>

                    <div className="relative z-20 flex flex-col items-center justify-center h-full">
                      <div className="mb-6 flex gap-4">
                        <div className={`p-4 border-2 ${isHazard ? 'border-red-500 text-red-500 shadow-[0_0_20px_#ff003c]' : 'border-cyan-400 text-cyan-400'} rounded-sm`}>
                          <Target className="w-10 h-10" />
                        </div>
                      </div>
                      <div className="text-center">
                        <motion.h2 
                          animate={isHazard ? { scale: [1, 1.05, 1], filter: ['blur(0px)', 'blur(1px)', 'blur(0px)'] } : { scale: 1 }}
                          transition={{ duration: 0.1, repeat: isHazard ? Infinity : 0 }}
                          className={`text-8xl font-black uppercase tracking-tighter leading-none transition-colors duration-500 ${isHazard ? 'text-red-500' : 'text-cyan-400'}`}
                        >
                          {isHazard ? 'IMPACT_WATCH' : 'SCAN_ACTIVE'}
                        </motion.h2>
                        <p className={`mt-4 text-xs font-black uppercase tracking-[0.8em] ${isHazard ? 'text-red-500 animate-pulse' : 'text-slate-500'}`}>
                          {isHazard ? '!! ORDNANCE_CONFIRMED !!' : 'SEARCHING_GAMMA_SECTOR'}
                        </p>
                      </div>
                    </div>

                    {/* Tactical Markers */}
                    <div className="absolute inset-0 pointer-events-none">
                      {markers.map(m => (
                        <motion.div
                          key={m.id}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: [1, 1.2, 1], opacity: 1 }}
                          transition={{ duration: 0.5 }}
                          className={`absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center`}
                          style={{ left: `${m.x}%`, top: `${m.y}%` }}
                        >
                          <div className={`absolute inset-0 border-2 ${m.type === 'MINE' ? 'border-red-500 bg-red-500/20 shadow-[0_0_15px_#ff003c]' : 'border-amber-500 bg-amber-500/20'}`} />
                          <Crosshair className={`w-3 h-3 ${m.type === 'MINE' ? 'text-red-500' : 'text-amber-500'}`} />
                          <div className="absolute top-full mt-2 text-[8px] font-bold text-white/50 bg-black/80 px-2 py-0.5 whitespace-nowrap border border-white/10">ID: {m.id.toString().slice(-4)}</div>
                        </motion.div>
                      ))}
                    </div>
                 </CyberPanel>
              </div>

              {/* Right Column */}
              <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
                 <CyberPanel title="Protocol Handshake" icon={Lock} variant="cyan">
                    <div className="space-y-4">
                       <ProtocolLine label="AUTH_CRED" value="ROOT_VERIFIED" color="text-emerald-400" />
                       <ProtocolLine label="PORT_IO" value="9600_BAUD" color="text-slate-300" />
                       <ProtocolLine label="SAT_LINK" value="GEO_LOCKED" color="text-cyan-400" />
                       <div className="pt-4 border-t border-white/5">
                          <div className="flex justify-between items-center mb-2">
                             <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Core Integrity</span>
                             <span className="text-[9px] text-cyan-400 font-bold">98.4%</span>
                          </div>
                          <div className="h-1 bg-white/5 relative overflow-hidden">
                             <motion.div animate={{ x: ['-100%', '0%'] }} transition={{ duration: 1 }} className="absolute inset-0 bg-cyan-400" />
                          </div>
                       </div>
                    </div>
                 </CyberPanel>

                 <CyberPanel title="Directive_Alpha" icon={Cpu} variant="amber" className="flex-1">
                    <div className="flex flex-col gap-6 h-full">
                       <div className="p-4 bg-white/5 border-l-4 border-cyan-400">
                          <b className="text-[10px] text-cyan-400 block mb-2 font-black tracking-widest uppercase">Primary Objective</b>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-bold tracking-tight">AUTO_DETECTION_ENGAGED. IDENTIFY SUB-SURFACE METALLIC ANOMALIES WITHIN RADIUS_40m.</p>
                       </div>
                       
                       <div className="p-4 bg-white/5 border-l-4 border-red-500/40">
                          <b className="text-[10px] text-red-500 block mb-2 font-black tracking-widest uppercase">Hazard Threshold</b>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-bold tracking-tight">IF SIG_IR AND SIG_MASS DROP BELOW 5.0 NOMINAL, SYSTEM LOGS EMERGENCY CRITICAL STATE.</p>
                       </div>

                       <div className="mt-auto flex justify-center pb-4">
                          <div className="flex items-center gap-4 text-white/20 animate-pulse">
                             <RefreshCw className="w-4 h-4 animate-spin-slow" />
                             <span className="text-[8px] font-black uppercase tracking-[0.4em]">Listening for telemetry heartbeat...</span>
                          </div>
                       </div>
                    </div>
                 </CyberPanel>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="map"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="p-6 h-full"
            >
              <CyberPanel title="Tactical Geospatial Overlay" icon={MapIcon} variant="cyan" className="h-full">
                <MapContainer
                  center={[currentPosition.lat, currentPosition.lng]}
                  zoom={13}
                  style={{ width: '100%', height: '100%', background: '#010206' }}
                  zoomControl={false}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  />
                  <MapAutoCenter center={currentPosition} />
                  
                  {markers.map(m => (
                    <Marker
                      key={m.id}
                      position={[m.lat || currentPosition.lat, m.lng || currentPosition.lng]}
                      icon={m.type === 'MINE' ? mineIcon : undefined}
                    >
                      <Popup>
                        <div className="bg-black text-[10px] p-1 uppercase">
                          <b className="text-red-500">{m.type} DETECTED</b><br/>
                          TIME: {m.timestamp}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  
                  <Marker 
                    position={[currentPosition.lat, currentPosition.lng]} 
                    icon={userIcon}
                  >
                    <Popup>
                      <div className="text-[10px] uppercase">YOUR_LOCATION</div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </CyberPanel>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ALERT MODAL */}
<style>{`
  @keyframes flicker {
    0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100% {
      opacity: 1;
    }
    20%, 21.999%, 63%, 63.999%, 65%, 69.999% {
      opacity: 0.4;
    }
  }
  .animate-flicker {
    animation: flicker 2s infinite;
  }
`}</style>
      <AnimatePresence>
        {isAlertOpen && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-red-950/90 backdrop-blur-3xl" 
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, rotateX: 20 }}
              animate={{ scale: 1, opacity: 1, rotateX: 0 }}
              exit={{ scale: 0.9, opacity: 0, rotateX: 20 }}
              className="relative w-full max-w-xl bg-black border-4 border-red-600 p-12 text-center shadow-[0_0_100px_rgba(255,0,0,0.6),inset_0_0_40px_rgba(255,0,0,0.2)] overflow-hidden"
              style={{ perspective: '1000px' }}
            >
              {/* Retro Cyber Decor */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-red-500" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-red-500" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-red-500" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-red-500" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 px-4 py-1 bg-red-600 text-[8px] font-bold text-black uppercase tracking-[0.5em]">System Failure</div>

              <div className="w-24 h-24 border-2 border-red-500 rounded-full mx-auto mb-10 flex items-center justify-center rotate-45 relative">
                 <div className="absolute inset-0 border-2 border-red-500/30 rounded-full animate-ping" />
                 <AlertTriangle className="w-12 h-12 text-red-500 -rotate-45 animate-pulse" />
              </div>
              <h3 className="text-5xl font-black text-red-500 uppercase tracking-tighter mb-4 italic animate-flicker">MINE DETECTED</h3>
              <p className="text-slate-400 text-xs mb-12 font-mono uppercase tracking-[0.3em] leading-loose">
                ORDNANCE SIGNATURE CONFIRMED. STOP ALL MOVEMENT IMMEDIATELY.
              </p>
              
              <div className="flex gap-6">
                <button 
                  onClick={() => setIsAlertOpen(false)} 
                  className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,0,0,0.4)]"
                >
                  Mark Location
                </button>
                <button 
                  onClick={() => setIsAlertOpen(false)} 
                  className="flex-1 py-4 border border-red-500/50 hover:bg-red-500/10 text-red-500 font-black text-xs uppercase tracking-widest transition-all"
                >
                  Track Next
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className={`relative z-20 px-10 py-3 ${isHazard ? 'bg-red-500/10' : 'bg-blue-500/10'} border-t border-white/5 flex justify-between items-center backdrop-blur-md`}>
        <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em] font-bold">Aegis Tactical Sentinel // Local Uplink Stable</div>
        <div className="text-[9px] text-slate-600 font-mono">PORT_ID: X9-COM3 // 9600_BAUD</div>
      </footer>
    </div>
  );
}

// Helper to handle map centering
function MapAutoCenter({ center }: { center: { lat: number, lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng]);
  }, [center, map]);
  return null;
}

function ECGWave({ data, color }: { data: number[], color: string }) {
  return (
    <div className="w-full h-24 bg-black/40 border border-white/5 relative overflow-hidden group">
       <div className="absolute inset-0 bg-white/[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '100% 8px' }} />
       <svg className="w-full h-full overflow-visible" viewBox="0 0 100 20" preserveAspectRatio="none">
          {/* Shadow Path */}
          <polyline
             fill="none"
             stroke={color}
             strokeWidth="3"
             style={{ filter: 'blur(4px)', opacity: 0.3 }}
             points={data.map((v, i) => `${i},${20 - (v / 10 * 16 + 2)}`).join(' ')}
          />
          {/* Main Signal */}
          <polyline
             fill="none"
             stroke={color}
             strokeWidth="1"
             points={data.map((v, i) => `${i},${20 - (v / 10 * 16 + 2)}`).join(' ')}
             className="transition-all duration-300"
          />
       </svg>
       {/* Ambient Glitch Bits */}
       <div className="absolute top-2 right-2 flex gap-1">
          <div className="w-1 h-1 bg-white/20 rounded-full animate-pulse" />
          <div className="w-1 h-3 bg-cyan-400 group-hover:bg-red-500 transition-colors" />
       </div>
    </div>
  );
}

function ProtocolLine({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="flex justify-between items-center text-[10px] font-black border-b border-white/5 pb-3 last:border-0 uppercase tracking-widest">
       <span className="text-white/30">{label}</span>
       <span className={`${color} px-2 py-0.5 bg-black/40 border border-white/5 shadow-[0_0_10px_rgba(255,255,255,0.05)]`}>{value}</span>
    </div>
  );
}

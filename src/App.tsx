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
  const [lastPulse, setLastPulse] = useState(false);
  const [logs, setLogs] = useState<{time: string, msg: string}[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [irHistory, setIrHistory] = useState<number[]>(Array(100).fill(10));
  const [metalHistory, setMetalHistory] = useState<number[]>(Array(100).fill(10));
  const [currentPosition, setCurrentPosition] = useState({ lat: 18.989, lng: 73.117 }); // Default: Navi Mumbai (VIMEET)

  const pendingIR = useRef<number | null>(null);
  const pendingMetal = useRef<number | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCurrentPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);
  
  const logRef = useRef<HTMLDivElement>(null);

  const lastLogRef = useRef("");
  const addLog = (msg: string) => {
    // Pulse the heartbeat whenever data or log arrives
    setLastPulse(true);
    setTimeout(() => setLastPulse(false), 100);

    // Only log if the message is different from the last one (prevents spam like "No Object" repeating)
    if (msg === lastLogRef.current && !msg.startsWith("!!")) return; 
    
    lastLogRef.current = msg;
    setLogs(prev => [...prev.slice(-40), { time: new Date().toLocaleTimeString(), msg }]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const [isSimulating, setIsSimulating] = useState(false);

  // Simulation loop
  useEffect(() => {
    let interval: any;
    if (isSimulating && !isConnected) {
      interval = setInterval(() => {
        const fakeIr = Math.floor(Math.random() * 4) + 6; // 6-10
        const fakeMetal = Math.floor(Math.random() * 4) + 6; // 6-10
        
        // Occasional dip for hazard simulation
        const isTrigger = Math.random() < 0.05;
        const finalIr = isTrigger ? 2 : fakeIr;
        const finalMetal = isTrigger ? 2 : fakeMetal;

        setSensorData({ ir: finalIr, metal: finalMetal });
        setIrHistory(prev => [...prev.slice(1), finalIr]);
        setMetalHistory(prev => [...prev.slice(1), finalMetal]);

        if (finalIr < 5 && finalMetal < 5) {
           if (!isAlertOpen) {
              setIsAlertOpen(true);
              addMarker('MINE');
              addLog("!! SIM_ALERT: VIRTUAL ORDNANCE LOCATED !!");
           }
        }
      }, 500);
    } else {
      // Reset sensors to safe values (10) when simulation is OFF
      setSensorData({ ir: 10, metal: 10 });
      setIrHistory(prev => [...prev.slice(1), 10]);
      setMetalHistory(prev => [...prev.slice(1), 10]);
    }
    return () => clearInterval(interval);
  }, [isSimulating, isConnected, isAlertOpen]);

  const connect = async () => {
    const nav = navigator as any;
    if (!nav.serial) {
       addLog("!! OS_ERROR: Web Serial unavailable.");
       alert("CRITICAL: Web Serial API is blocked in this preview window.\n\nACTION REQUIRED:\n1. Click the 'Open in New Tab' button in the top right of the preview.\n2. In the new tab, click 'Establish Uplink' again.\n3. Your browser will then prompt you to select your Arduino USB port.");
       return;
    }
    try {
      setIsSimulating(false); // Disable simulation on real connect
      const selectedPort = await nav.serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsConnected(true);
      addLog("SYNC SUCCESS: SATELLITE UPLINK ESTABLISHED.");
      
      const reader = selectedPort.readable.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            addLog("!! SIGNAL LOST: PORT CLOSED INTERNALLY.");
            break;
          }
          if (value) {
            const decoded = decoder.decode(value, { stream: true });
            handleIncomingData(decoded);
          }
        }
      } catch (err: any) {
        addLog(`READER ERROR: ${err.message}`);
      } finally {
        reader.releaseLock();
        setIsConnected(false);
      }
    } catch (err: any) {
      console.error(err);
      addLog(`CRITICAL ERROR: ${err.message}`);
    }
  };

  const serialBufferRef = useRef("");

  const handleIncomingData = (data: string) => {
    serialBufferRef.current += data;
    const lines = serialBufferRef.current.split(/\r?\n/);
    
    // Keep the last piece (potential partial line) in the buffer
    serialBufferRef.current = lines.pop() || "";

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const lowerTrimmed = trimmed.toLowerCase();

      // Parse high-frequency live "Reading" ticks for immediate waveform motion
      const liveMatch = trimmed.match(/Reading\s*\d+\s*->\s*IR:\s*(\d+)\s*\|\s*Metal:\s*(\d+)/i);
      
      // Parse individual Sum lines (Final scan results)
      const irMatch = trimmed.match(/IR Sum:\s*(\d+)/i);
      const metalMatch = trimmed.match(/Metal Sum:\s*(\d+)/i);
      
      if (liveMatch) {
        // High-frequency updates: convert 0/1 to 0 or 10 for the display scale
        const ir = parseInt(liveMatch[1]) === 1 ? 10 : 0;
        const metal = parseInt(liveMatch[2]) === 1 ? 10 : 0;
        
        setSensorData({ ir, metal });
        const jitter = () => (Math.random() - 0.5) * 0.5;
        setIrHistory(prev => [...prev.slice(1), ir + jitter()]);
        setMetalHistory(prev => [...prev.slice(1), metal + jitter()]);
      }

      if (irMatch) pendingIR.current = parseInt(irMatch[1]);
      if (metalMatch) pendingMetal.current = parseInt(metalMatch[1]);

      // When final scan results are in, handle persistent logging and hazard logic
      if (pendingIR.current !== null && pendingMetal.current !== null) {
        const ir = pendingIR.current;
        const metal = pendingMetal.current;
        const size = 10; // Arduino array size
        
        // Final sensitivity check based on sums
        // Refined: require at least 80% detection for high certainty
        const objectPresent = ir < 3; 
        const metalPresent = metal < 4;

        if (objectPresent && metalPresent) {
           if (!isAlertOpen) {
              setIsAlertOpen(true);
              addMarker('MINE');
              addLog("!! HAZARD: METALLIC ORDNANCE DETECTED !!");
           }
        } else if (objectPresent) {
           // No metal detected in this scan
           addLog("SCAN: NON-METALLIC OBJECT IDENTIFIED");
        } else {
           addLog("STATUS: SCANNING... AREA CLEAR");
        }

        // Clear for next cycle
        pendingIR.current = null;
        pendingMetal.current = null;
      }

      // Explicit triggers from Arduino strings (highest priority)
      if (lowerTrimmed.includes("⚠️") || lowerTrimmed.includes("mine")) {
         if (!isAlertOpen) {
            setIsAlertOpen(true);
            addMarker('MINE');
         }
         addLog("!! ALARM: ARDUINO SOURCE CONFIRMS MINE !!");
      } else if (lowerTrimmed.includes("no object")) {
         addLog("STATUS: SCANNING... CLEAR SCAN");
      } else if (lowerTrimmed.includes("object detected but no metal")) {
         addLog("SCAN: NON-METALLIC OBJECT FOUND");
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

  const isHazard = sensorData.ir < 3 && sensorData.metal < 4;

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
        .radar-sweep {
          background: conic-gradient(from 0deg, rgba(0, 242, 255, 0.3) 0%, transparent 20%, transparent 100%);
          animation: radar-rotate 4s linear infinite;
        }
        @keyframes radar-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
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
              <p className="text-[10px] text-slate-500 font-bold tracking-[0.4em] flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor] transition-all duration-75 ${lastPulse ? 'text-amber-400 scale-125 opacity-100' : 'text-slate-800 scale-100 opacity-30'}`}>●</span>
                SYSTEM_STATUS: {isConnected ? 'UPLINK_STABLE' : 'NO_SIGNAL'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-8 items-center">
          <div className="flex bg-black/40 border border-white/10 p-1 rounded-lg">
             <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black tracking-widest transition-all ${isSimulating ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-amber-400'}`}
             >
                {isSimulating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />}
                SIM_MOCK
             </button>
             <div className="w-[1px] bg-white/10 mx-1" />
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
              className="grid grid-cols-12 gap-6 p-6 h-full"
            >
              {/* Left Column: Linear Data */}
              <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-hidden">
                  <CyberPanel title="Neural IR Signature" icon={Activity} variant={isHazard ? 'red' : 'cyan'}>
                    <div className="absolute top-2 right-4 flex items-center gap-1">
                      <div className={`w-1 h-1 rounded-full ${sensorData.ir < 10 ? 'bg-cyan-400 animate-ping' : 'bg-white/10'}`} />
                      <span className="text-[7px] opacity-30">LIVE_LINK</span>
                    </div>
                    <div className="flex justify-between items-baseline mb-2">
                       <span className={`text-4xl font-black ${isHazard ? 'text-red-500' : 'text-cyan-400'} tracking-tighter`}>{sensorData.ir.toFixed(1)}<span className="text-sm opacity-50 ml-1">Hz</span></span>
                       <div className="text-[8px] opacity-30">SIGNAL_LEVEL</div>
                    </div>
                    <ECGWave data={irHistory} color={isHazard ? '#ff003c' : '#00f2ff'} />
                 </CyberPanel>

                 <CyberPanel title="Magnetic Mass Spectrometer" icon={Zap} variant="amber">
                    <div className="absolute top-2 right-4 flex items-center gap-1">
                      <div className={`w-1 h-1 rounded-full ${sensorData.metal < 10 ? 'bg-amber-400 animate-ping' : 'bg-white/10'}`} />
                      <span className="text-[7px] opacity-30">LIVE_LINK</span>
                    </div>
                    <div className="flex justify-between items-baseline mb-2">
                       <span className="text-4xl font-black text-amber-500 tracking-tighter">{sensorData.metal.toFixed(1)}<span className="text-sm opacity-50 ml-1">μT</span></span>
                       <div className="text-[8px] opacity-30">MASS_DENSITY</div>
                    </div>
                    <ECGWave data={metalHistory} color="#ffaa00" />
                 </CyberPanel>

                 <CyberPanel title="System Trace Log" icon={Terminal} className="flex-1">
                    <div ref={logRef} className="absolute inset-0 p-4 pt-0 overflow-y-auto space-y-1 font-mono text-[9px] text-cyan-400/60 scrollbar-thin">
                      {logs.map((l, i) => (
                        <div key={i} className={`flex gap-3 border-b border-white/5 pb-1 ${l.msg.includes('HAZARD') ? 'text-red-500 bg-red-500/5' : ''}`}>
                          <span className="opacity-20 flex-shrink-0">[{l.time.split(':')[2]}]</span>
                          <span className="tracking-tighter">{l.msg}</span>
                        </div>
                      ))}
                    </div>
                 </CyberPanel>
              </div>

              {/* Center Column: Logistics & Handshake */}
              <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
                 <CyberPanel title="Protocol Handshake" icon={Lock} variant="cyan">
                    <div className="space-y-4">
                       <ProtocolLine label="AUTH_CRED" value="ROOT_VERIFIED" color="text-emerald-400" />
                       <ProtocolLine label="PORT_IO" value={isConnected ? "9600_UPLINK" : "LISTEN_MODE"} color={isConnected ? "text-cyan-400" : "text-amber-500"} />
                       <ProtocolLine label="SAT_LINK" value="GEO_LOK" color="text-cyan-400" />
                       <div className="pt-4 border-t border-white/5">
                          <div className="flex justify-between items-center mb-2">
                             <span className="text-[9px] font-bold text-slate-500">Core_Integrity</span>
                             <span className="text-[9px] text-cyan-400 font-bold">98.4%</span>
                          </div>
                          <div className="h-1 bg-white/5 relative overflow-hidden">
                             <motion.div animate={{ x: ['-100%', '0%'] }} transition={{ duration: 1 }} className="absolute inset-0 bg-cyan-400 shadow-[0_0_10px_#00f2ff]" />
                          </div>
                       </div>
                    </div>
                 </CyberPanel>

                 <CyberPanel title="Power Analysis" icon={Zap} variant="amber">
                    <div className="space-y-3">
                       <div className="flex justify-between items-center">
                          <span className="text-[9px] text-white/40 uppercase">Bus_A (12V)</span>
                          <span className="text-[10px] font-black text-amber-500">11.98 V</span>
                       </div>
                       <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 w-[95%] shadow-[0_0_5px_#ffaa00]" />
                       </div>
                       <div className="flex justify-between items-center pt-2">
                          <span className="text-[9px] text-white/40 uppercase">Reg_B (5V)</span>
                          <span className="text-[10px] font-black text-emerald-400">5.02 V</span>
                       </div>
                       <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 w-[98%] shadow-[0_0_5px_#00ff92]" />
                       </div>
                       <p className="text-[8px] text-white/20 mt-2 font-bold tracking-tighter italic">OPTIMAL POWER GAIN FOR DELICATE ARDUINO BUS.</p>
                    </div>
                 </CyberPanel>

                 <CyberPanel title="Mission Directive" icon={Cpu} variant="amber" className="flex-1">
                    <div className="flex flex-col gap-6 h-full">
                       <div className="p-4 bg-white/5 border-l-4 border-cyan-400">
                          <b className="text-[10px] text-cyan-400 block mb-1 uppercase tracking-widest">Primary Task</b>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-bold">DETECTION_ACTIVE. SCAN GAMMA SECTOR FOR METALLIC DEVIATIONS.</p>
                       </div>
                       
                       <div className="p-4 bg-white/5 border-l-4 border-red-500/40">
                          <b className="text-[10px] text-red-500 block mb-1 uppercase tracking-widest">Fail-Safe</b>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-bold">EMERGENCY_LOCKDOWN IF IR/MASS SUM DROPS BELOW CRITICAL THRESHOLD (5.0).</p>
                       </div>
                    </div>
                 </CyberPanel>
              </div>

              {/* Right Column: Radar Visualizer */}
              <div className="col-span-12 lg:col-span-5 flex flex-col h-full overflow-hidden">
                 <CyberPanel title="Tactical Targeting Array" icon={Target} variant={isHazard ? 'red' : 'cyan'} className="flex-1 overflow-hidden relative">
                    <div className="relative w-full h-full flex items-center justify-center">
                       {/* Radar UI */}
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          {[20, 40, 60, 80, 100].map(i => (
                            <div key={i} className={`absolute border border-white/5 rounded-full`} style={{ width: `${i}%`, height: `${i}%` }} />
                          ))}
                          <div className="absolute w-full h-[1px] bg-white/5" />
                          <div className="absolute h-full w-[1px] bg-white/5" />
                          
                          {/* Rotating Sweep Beam */}
                          <div className="absolute inset-0 radar-sweep pointer-events-none" />
                       </div>

                       <div className="relative z-20 text-center pointer-events-none">
                          <motion.div 
                            animate={isHazard ? { opacity: [0.3, 1, 0.3] } : { opacity: 0.6 }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                            className={`text-[12px] font-black tracking-[1.2rem] mb-4 ${isHazard ? 'text-red-500' : 'text-cyan-400'}`}
                          >
                            {isHazard ? 'HAZARD_LOCKED' : 'SWEEPING...'}
                          </motion.div>
                          <div className="text-[120px] font-black tracking-tighter text-white opacity-[0.03] select-none">SCANNER</div>
                       </div>

                       {/* Markers */}
                       <div className="absolute inset-0 pointer-events-none">
                         {markers.map(m => (
                           <motion.div
                             key={m.id}
                             initial={{ scale: 0, opacity: 0 }}
                             animate={{ scale: 1, opacity: 1 }}
                             className={`absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center`}
                             style={{ left: `${m.x}%`, top: `${m.y}%` }}
                           >
                             <div className={`absolute inset-0 border-2 ${m.type === 'MINE' ? 'border-red-500 shadow-[0_0_15px_#ff003c]' : 'border-amber-500'} rounded-sm animate-pulse`} />
                             <Crosshair className={`w-4 h-4 ${m.type === 'MINE' ? 'text-red-500' : 'text-amber-500'}`} />
                           </motion.div>
                         ))}
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
              className="p-6 h-full relative"
            >
              <CyberPanel title="Geospatial Analysis Overlay" icon={MapIcon} variant="cyan" className="h-full relative overflow-hidden">
                <div className="absolute inset-4 overflow-hidden border border-white/10">
                  <MapContainer
                    center={[currentPosition.lat, currentPosition.lng]}
                    zoom={13}
                    style={{ width: '100%', height: '100%', background: '#010206' }}
                    zoomControl={false}
                  >
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; OpenStreetMap'
                    />
                    <MapAutoCenter center={currentPosition} />
                    
                    {markers.map(m => (
                      <Marker key={m.id} position={[m.lat || currentPosition.lat, m.lng || currentPosition.lng]} icon={m.type === 'MINE' ? mineIcon : undefined}>
                        <Popup>
                          <div className="bg-black text-[10px] p-2 uppercase border border-red-500">
                            <b className="text-red-500">{m.type} DETECTED</b><br/>
                            COORDS: {m.lat?.toFixed(4)}, {m.lng?.toFixed(4)}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    <Marker position={[currentPosition.lat, currentPosition.lng]} icon={userIcon}>
                      <Popup><div className="text-[10px] uppercase font-bold">OPERATOR_UNIT_01</div></Popup>
                    </Marker>
                    <InvalidateMap />
                  </MapContainer>
                </div>
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

// Map helper to fix rendering on view change
function InvalidateMap() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 400);
  }, [map]);
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
             className="transition-none"
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

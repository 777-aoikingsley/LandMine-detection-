/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  Settings, 
  Terminal,
  Map as MapIcon,
  Zap,
  Activity,
  Shield,
  Radio,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- TYPES ---
interface Marker {
  id: number;
  x: number;
  y: number;
  type: 'MINE' | 'OBJECT';
  timestamp: string;
}

interface SensorData {
  ir: number;
  metal: number;
}

export default function App() {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [sensorData, setSensorData] = useState<SensorData>({ ir: 10, metal: 10 });
  const [logs, setLogs] = useState<{time: string, msg: string}[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [irHistory, setIrHistory] = useState<number[]>(Array(100).fill(5));
  const [metalHistory, setMetalHistory] = useState<number[]>(Array(100).fill(5));
  
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
    setMarkers(prev => [{
      id: Date.now(),
      x: Math.random() * 80 + 10,
      y: Math.random() * 80 + 10,
      type,
      timestamp: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 50));
  };

  const isHazard = sensorData.ir < 5 && sensorData.metal < 5;

  return (
    <div className={`min-h-screen ${isHazard ? 'bg-[#0a0202]' : 'bg-[#010206]'} text-slate-200 font-mono relative overflow-hidden flex flex-col transition-colors duration-500`}>
      {/* Immersive Scanline & Grid */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: `linear-gradient(${isHazard ? 'rgba(255,0,0,0.1)' : 'rgba(0,136,255,0.05)'} 1px, transparent 1px), linear-gradient(90deg, ${isHazard ? 'rgba(255,0,0,0.1)' : 'rgba(0,136,255,0.05)'} 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      
      {/* Header */}
      <header className={`relative z-10 flex items-center justify-between px-10 py-6 border-b transition-colors ${isHazard ? 'border-red-500/30' : 'border-blue-500/20'} bg-black/60 backdrop-blur-xl`}>
        <div className="flex items-center gap-6">
          <div className={`w-12 h-12 border ${isHazard ? 'border-red-500 shadow-[0_0_20px_rgba(255,0,0,0.3)]' : 'border-blue-500 shadow-[0_0_20px_rgba(0,136,255,0.3)]'} transform rotate-45 flex items-center justify-center transition-all`}>
             <Shield className={`w-6 h-6 -rotate-45 ${isHazard ? 'text-red-500' : 'text-blue-500'}`} />
          </div>
          <div>
            <h1 className={`text-sm font-bold tracking-[0.5em] uppercase leading-none mb-1 transition-colors ${isHazard ? 'text-red-500' : 'text-blue-500'}`}>Aegis Tactical Command</h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest leading-none">Sector Scan: Gamma-9 // Secure Encryption Active</p>
          </div>
        </div>
        
        <div className="flex gap-6 items-center">
          {!isConnected && (
             <button 
                onClick={connect}
                className="px-6 py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-black text-[10px] uppercase font-bold tracking-widest transition-all border border-blue-500/50 [clip-path:polygon(10%_0,100%_0,90%_100%,0_%100%)]"
              >
                Establish Uplink
              </button>
          )}
          <div className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-white/5 rounded-sm">
             <Radio className={`w-3 h-3 ${isConnected ? 'text-blue-400 animate-pulse' : 'text-red-500'}`} />
             <span className="text-[10px] font-mono text-slate-400 tracking-tighter">{isConnected ? '[ ENCRYPTED ]' : '[ OFFLINE ]'}</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 grid grid-cols-12 gap-4 p-4 flex-1 overflow-hidden">
        
        {/* Left Column: Wave Analysis */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
           {/* IR Panel */}
           <div className={`p-6 border ${isHazard ? 'border-red-500/20' : 'border-blue-500/20'} bg-black/40 flex flex-col gap-4 relative overflow-hidden`}>
              <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 tracking-widest opacity-60">
                 <span>BIOMETRIC IR SCAN</span>
                 <Activity className="w-3 h-3 text-blue-400" />
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`text-3xl font-black ${isHazard ? 'text-red-500' : 'text-blue-400'}`}>{sensorData.ir}.0</span>
                <span className="text-[10px] opacity-30">PULSE / SEC</span>
              </div>
              <ECGWave data={irHistory} color={isHazard ? '#ff003c' : '#0088ff'} />
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                 <motion.div animate={{ width: `${(sensorData.ir / 10) * 100}%` }} className={`h-full ${isHazard ? 'bg-red-600' : 'bg-blue-600'}`} />
              </div>
           </div>

           {/* Metal Panel */}
           <div className={`p-6 border ${isHazard ? 'border-red-500/20' : 'border-blue-500/20'} bg-black/40 flex flex-col gap-4 relative overflow-hidden`}>
              <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 tracking-widest opacity-60">
                 <span>MAGNETIC MASS</span>
                 <Zap className="w-3 h-3 text-amber-500" />
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-3xl font-black text-amber-500">{sensorData.metal}.0</span>
                <span className="text-[10px] opacity-30">Tesla Coef</span>
              </div>
              <ECGWave data={metalHistory} color="#ffaa00" />
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                 <motion.div animate={{ width: `${(sensorData.metal / 10) * 100}%` }} className="h-full bg-amber-600" />
              </div>
           </div>

           {/* Log Terminal */}
           <div className="flex-1 bg-black/40 border border-white/5 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-white/5 text-[9px] text-slate-500 font-bold uppercase tracking-widest">System Archive</div>
              <div ref={logRef} className="p-4 overflow-y-auto space-y-1 font-mono text-[9px] text-blue-400/60 h-full">
                {logs.map((l, i) => (
                  <div key={i} className={`flex gap-2 ${l.msg.includes('HAZARD') ? 'text-red-500' : ''}`}>
                    <span className="opacity-20 flex-shrink-0">[{l.time.split(':')[2]}]</span>
                    <span>{l.msg}</span>
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* Center Panel: Main Radar */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4">
           <div className={`flex-1 border transition-colors ${isHazard ? 'border-red-500/40 bg-red-500/5' : 'border-blue-500/20 bg-blue-500/5'} relative overflow-hidden rounded-sm flex flex-col items-center justify-center`}>
              {/* Radar Rings */}
              <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                 {[1, 2, 3, 4].map(i => (
                   <div key={i} className={`absolute border rounded-full ${isHazard ? 'border-red-500' : 'border-blue-500'}`} style={{ width: `${i * 25}%`, height: `${i * 25}%` }} />
                 ))}
                 <div className={`absolute w-full h-[1px] ${isHazard ? 'bg-red-500' : 'bg-blue-500'}`} />
                 <div className={`absolute h-full w-[1px] ${isHazard ? 'bg-red-500' : 'bg-blue-500'}`} />
              </div>

              <div className="text-center z-20">
                <motion.h2 
                  animate={isHazard ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                  transition={{ duration: 0.5, repeat: isHazard ? Infinity : 0 }}
                  className={`text-7xl font-black uppercase tracking-tighter leading-none mb-2 ${isHazard ? 'text-red-500' : 'text-blue-500'}`}
                >
                  {isHazard ? 'HAZARD DETECTED' : 'Scanning'}
                </motion.h2>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.5em]">{isHazard ? 'PROXIMITY WARNING ACTIVE' : 'Vector Search in Progress'}</p>
              </div>

              {/* Tactical Points */}
              <div className="absolute inset-0">
                {markers.map(m => (
                  <motion.div
                    key={m.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${m.type === 'MINE' ? 'bg-red-500 border-white shadow-[0_0_15px_rgba(255,0,0,1)]' : 'bg-amber-500 border-black'}`}
                    style={{ left: `${m.x}%`, top: `${m.y}%` }}
                  />
                ))}
              </div>
           </div>
        </div>

        {/* Right Column: Tactical Intel */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
           {/* System Metadata */}
           <div className="p-6 border border-white/5 bg-black/40 space-y-4">
              <div className="flex items-center gap-3 text-blue-400">
                 <Lock className="w-3 h-3" />
                 <span className="text-[9px] font-bold uppercase tracking-widest">Tactical Protocols</span>
              </div>
              <div className="space-y-2">
                 <ProtocolLine label="Auth Status" value="Verified" color="text-green-500" />
                 <ProtocolLine label="Hardware Port" value="9600 BAUD" color="text-slate-400" />
                 <ProtocolLine label="Satellite" value="Locked" color="text-blue-400" />
              </div>
           </div>

           {/* Mission Profile */}
           <div className="flex-1 p-6 border border-white/5 bg-black/40 flex flex-col gap-6">
              <div className="flex items-center gap-3 text-slate-400">
                 <Terminal className="w-3 h-3" />
                 <span className="text-[9px] font-bold uppercase tracking-widest">Mission Readout</span>
              </div>
              <div className="text-[10px] text-slate-500 leading-relaxed space-y-4">
                 <div className="border-l-2 border-blue-500 pl-4 py-1">
                    <b className="text-blue-500 block mb-1 uppercase tracking-widest">Objective:</b>
                    Locate and neutralize sub-surface explosives.
                 </div>
                 <div className="border-l-2 border-red-500/40 pl-4 py-1">
                    <b className="text-red-500 block mb-1 uppercase tracking-widest">Field Rule:</b>
                    Confirmed hazard signature identified. Stop all movement.
                 </div>
              </div>
           </div>
        </div>
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

function ECGWave({ data, color }: { data: number[], color: string }) {
  return (
    <div className="w-full h-20 bg-black/40 border border-white/5 relative overflow-hidden">
       <svg className="w-full h-full overflow-visible" viewBox="0 0 100 20" preserveAspectRatio="none">
          <polyline
             fill="none"
             stroke={color}
             strokeWidth="0.5"
             points={data.map((v, i) => `${i},${20 - (v / 10 * 16 + 2)}`).join(' ')}
             className="transition-all duration-300"
          />
       </svg>
    </div>
  );
}

function ProtocolLine({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="flex justify-between items-center text-[9px] border-b border-white/5 pb-2 last:border-0 uppercase tracking-tighter">
       <span className="text-slate-500">{label}</span>
       <span className={color}>{value}</span>
    </div>
  );
}

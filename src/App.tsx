/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  Cpu, 
  RefreshCw, 
  Settings, 
  Terminal,
  Map as MapIcon,
  Zap,
  Activity
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
  const [logs, setLogs] = useState<string[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-20), `${new Date().toLocaleTimeString()} ${msg}`]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const connect = async () => {
    try {
      const selectedPort = await (navigator as any).serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsConnected(true);
      addLog(">> Uplink established. Aegis Terminal ready.");
      
      const textDecoder = new TextDecoderStream();
      selectedPort.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) handleIncomingData(value);
      }
    } catch (err) {
      console.error(err);
      addLog(">> Link Failure: Connection interrupted.");
    }
  };

  const handleIncomingData = (data: string) => {
    const lines = data.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // 1. Data Parsing [UI_DATA:ir,metal]
      if (trimmed.includes("[UI_DATA:")) {
        const match = trimmed.match(/\[UI_DATA:(\d+),(\d+)\]/);
        if (match) {
          setSensorData({ ir: parseInt(match[1]), metal: parseInt(match[2]) });
        }
      }

      // 2. Alert Handling
      if (trimmed.includes("⚠️ MINE DETECTED!")) {
        setIsAlertOpen(true);
        addMarker('MINE');
        addLog("!! CRITICAL HAZARD IDENTIFIED !!");
      } else if (trimmed.includes("Object Detected but NO metal")) {
        addMarker('OBJECT');
        addLog(">> Non-metallic obstruction found.");
      } else if (trimmed.includes("No Object")) {
        addLog(">> Vector Clear.");
      }

      if (trimmed.startsWith("Reading")) return; // Skip sub-readings for cleaner logs
      addLog(trimmed);
    });
  };

  const addMarker = (type: 'MINE' | 'OBJECT') => {
    const newMarker: Marker = {
      id: Date.now(),
      x: Math.random() * 80 + 10, // Simulated relative coordinates
      y: Math.random() * 80 + 10,
      type,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMarkers(prev => [newMarker, ...prev].slice(0, 50));
  };

  const arduinoCode = `const int irPin = 2;
const int metalPin = 3;

const int size = 10;
int irArray[size];
int metalArray[size];

void scanSensors(int index);

void setup() {
  pinMode(irPin, INPUT);
  pinMode(metalPin, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  Serial.println("---- NEW SCAN ----");
  scanSensors(0);
  delay(1000);
}

void scanSensors(int index) {
  if (index >= size) {
    int irSum = 0;
    int metalSum = 0;
    for (int i = 0; i < size; i++) {
      irSum += irArray[i];
      metalSum += metalArray[i];
    }

    // Dashboard identifies these tags: [UI_DATA:irSum,metalSum]
    Serial.print("[UI_DATA:");
    Serial.print(irSum);
    Serial.print(",");
    Serial.print(metalSum);
    Serial.println("]");

    if (irSum < size/2 && metalSum < size/2) {
      Serial.println("⚠️ MINE DETECTED!");
    }
    else if (irSum < size/2) {
      Serial.println("Object Detected but NO metal");
    }
    else {
      Serial.println("No Object");
    }
    Serial.println("-------------------");
    return;
  }

  irArray[index] = digitalRead(irPin);
  metalArray[index] = digitalRead(metalPin);
  
  Serial.print("Reading "); Serial.print(index);
  Serial.print(" -> IR: "); Serial.print(irArray[index]);
  Serial.print(" | Metal: "); Serial.println(metalArray[index]);

  delay(100);
  scanSensors(index + 1);
}`;

  return (
    <div className="min-h-screen bg-[#020408] text-slate-200 font-sans relative overflow-hidden flex flex-col">
      {/* Immersive Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,_rgba(14,42,71,0.4)_0%,_transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-cyan-500/20 border border-cyan-500/50 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-cyan-400 animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-[0.3em] uppercase text-cyan-400 leading-none mb-1">Aegis Sentinel v2.4</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none">Field Mine Detection System (Active)</p>
          </div>
        </div>
        
        <div className="flex gap-4">
          {!isConnected && (
             <button 
                onClick={connect}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] uppercase font-bold tracking-widest rounded transition-all border border-cyan-400/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              >
                Establish Satellite Link
              </button>
          )}
          <div className="flex items-center gap-2 px-4 py-2 border border-white/5 bg-black/20 rounded">
             <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'} shadow-sm`} />
             <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">{isConnected ? 'Uplink Stable' : 'No Signal'}</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 grid grid-cols-12 gap-6 p-8 flex-1 overflow-hidden">
        
        {/* Left Column: Map & Telemetry */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          <div className="relative flex-1 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden group min-h-[400px]">
            {/* Grid & Radar Overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <div className="w-[150%] aspect-square border border-cyan-500/10 rounded-full" />
                <div className="w-[80%] aspect-square border border-cyan-500/20 rounded-full" />
                <div className="w-[40%] aspect-square border border-cyan-500/30 rounded-full" />
                <div className="absolute top-1/2 left-0 w-full h-[1px] bg-cyan-500/20" />
                <div className="absolute left-1/2 top-0 w-[1px] h-full bg-cyan-500/20" />
            </div>

            <div className="absolute top-6 left-8 flex items-center gap-3">
              <MapIcon className="w-4 h-4 text-cyan-400" />
              <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tactical Session Map</h2>
            </div>

            {/* Plot Markers */}
            <div className="relative w-full h-full p-12">
              {markers.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 cursor-help group/marker ${m.type === 'MINE' ? 'bg-red-500/50 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-amber-500/50 border-amber-400'}`}
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                >
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-[8px] border border-white/10 rounded whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity z-30 font-mono">
                      {m.type} @ {m.timestamp}
                   </div>
                   {m.type === 'MINE' && <div className="absolute inset-[-4px] border-2 border-red-500 rounded-full animate-ping opacity-30" />}
                </motion.div>
              ))}
              {markers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                  <span className="text-[10px] uppercase tracking-[0.8em] font-bold">Scanning Vectors</span>
                </div>
              )}
            </div>

            <div className="absolute bottom-6 left-8 flex gap-6 font-mono text-[9px] text-slate-500 uppercase tracking-widest">
              <span>Markers: {markers.length}</span>
              <span className="text-red-400/50">Hazards: {markers.filter(m => m.type === 'MINE').length}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 h-32">
             <SensorBadge label="IR Density" value={sensorData.ir} color="text-cyan-400" barColor="bg-cyan-500" icon={<Activity className="w-3 h-3" />} />
             <SensorBadge label="Metal Content" value={sensorData.metal} color="text-amber-400" barColor="bg-amber-500" icon={<Zap className="w-3 h-3" />} />
          </div>
        </div>

        {/* Right Column: Terminal & Docs */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6 overflow-hidden">
          {/* Live Terminal */}
          <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col min-h-0">
             <div className="px-6 py-4 bg-black/20 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Terminal className="w-3 h-3 text-cyan-400" />
                   <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest tracking-tighter">Live Uplink Stream</h2>
                </div>
                <div className="flex gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                   <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                </div>
             </div>
             <div ref={logRef} className="p-6 font-mono text-[10px] text-cyan-400/80 overflow-y-auto space-y-2 flex-1 scrollbar-thin scrollbar-thumb-white/10">
                {logs.length === 0 && <p className="opacity-20 italic">Waiting for telemetry heartbeat...</p>}
                {logs.map((log, i) => (
                  <div key={i} className={`flex gap-3 leading-tight ${log.includes('MINE') ? 'text-red-400 font-bold' : ''}`}>
                    <span className="opacity-30 flex-shrink-0">[{i}]</span>
                    <span>{log}</span>
                  </div>
                ))}
             </div>
          </div>

          {/* Code Reference */}
          <div className="p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col overflow-hidden max-h-48 group">
             <div className="flex items-center justify-between mb-3 text-[10px] font-bold uppercase text-slate-400">
                <div className="flex items-center gap-2">
                   <Settings className="w-3 h-3 text-cyan-400" />
                   <span>Arduino IDE Template</span>
                </div>
                <button onClick={() => navigator.clipboard.writeText(arduinoCode)} className="text-[8px] text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Copy Source</button>
             </div>
             <div className="bg-black/60 rounded p-3 font-mono text-[9px] text-cyan-400/40 overflow-y-auto scrollbar-none flex-1">
                <pre>{arduinoCode}</pre>
             </div>
          </div>
        </div>
      </main>

      {/* ALERT MODAL */}
      <AnimatePresence>
        {isAlertOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               className="absolute inset-0 bg-red-950/80 backdrop-blur-xl" 
               onClick={() => setIsAlertOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#1a0a0a] border-2 border-red-500/50 rounded-2xl p-10 text-center shadow-[0_0_100px_rgba(239,68,68,0.4)]"
            >
              <div className="w-20 h-20 bg-red-500 rounded-full mx-auto mb-8 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.6)]">
                 <AlertTriangle className="w-10 h-10 text-white animate-bounce" />
              </div>
              <h3 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Mine Detected!!</h3>
              <p className="text-red-200/70 text-[11px] mb-10 font-mono uppercase tracking-[0.2em] leading-relaxed">
                Confirmed Hazard Signature Identified. <br/>
                Physical Warning Active.
              </p>
              
              <button 
                onClick={() => setIsAlertOpen(false)} 
                className="w-full py-5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-xl active:scale-95 uppercase tracking-widest text-xs border border-red-400/50"
              >
                Find Another
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="relative z-20 px-8 py-3 bg-cyan-500/10 border-t border-cyan-500/20 flex justify-between items-center backdrop-blur-md">
        <div className="text-[9px] text-cyan-400/40 uppercase tracking-[0.3em] font-bold">Secure Tactical Uplink Active</div>
        <div className="text-[9px] text-slate-600 uppercase font-mono">Hardware Port: 9600 Baud</div>
      </footer>
    </div>
  );
}

function SensorBadge({ label, value, color, barColor, icon }: { label: string, value: number, color: string, barColor: string, icon: any }) {
  const percentage = (value / 10) * 100;
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group">
      <div className="flex justify-between items-start">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
        <div className={`${color} group-hover:scale-110 transition-transform`}>{icon}</div>
      </div>
      <div className="flex items-baseline justify-between mt-2">
        <span className={`text-2xl font-mono font-bold leading-none ${color}`}>{value}</span>
        <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">/ 10 max</span>
      </div>
      {/* Progress Line */}
      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-white/5">
         <motion.div 
           initial={{ width: 0 }} 
           animate={{ width: `${percentage}%` }} 
           className={`h-full ${barColor} shadow-[0_0_10px_rgba(6,182,212,0.5)]`}
         />
      </div>
    </div>
  );
}

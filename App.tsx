
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Scene, GenerationMode } from './types';
import { GeminiService } from './services/geminiService';

const DEFAULT_SCRIPT = `⏱️ 0–3 sec (HOOK)
🎙️ Voiceover: “Agar main bolu AI tumhari job le sakta hai…?”
📸 Visual Prompt: A shocked young Indian man looking at a futuristic AI robot, dramatic lighting, cinematic, 9:16, ultra realistic

⏱️ 3–8 sec
🎙️ Voiceover: “2025 tak 40% jobs automate ho sakti hain!”
📸 Prompt: Office workers replaced by robots and AI screens, dark futuristic mood, cinematic, vertical

⏱️ 8–14 sec
🎙️ Voiceover: “Lekin ruko… AI job khatam nahi, job CHANGE karta hai!”
📸 Prompt: Human working confidently with AI hologram, positive futuristic vibe, bright lighting

⏱️ 14–22 sec
🎙️ Voiceover: “Jo log AI use karna seekh gaye, wahi jeetenge!”
📸 Prompt: Young Indian creator using laptop with AI graphics floating, success, modern look

⏱️ 22–27 sec
🎙️ Voiceover: “AI tumhara dushman nahi… tumhara tool hai!”
📸 Prompt: Human and AI shaking hands, inspiring, cinematic, vertical

⏱️ 27–30 sec (CTA)
🎙️ Voiceover: “Follow karo agar future secure karna hai!”
📸 Prompt: Bold text “FOLLOW FOR AI” glowing, futuristic background`;

export default function App() {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [genMode, setGenMode] = useState<GenerationMode>(GenerationMode.IMAGE);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [needsApiKey, setNeedsApiKey] = useState(false);

  const audioRefs = useRef<{ [id: string]: HTMLAudioElement }>({});

  useEffect(() => {
    // Check for Veo API key if needed
    const checkKey = async () => {
      if (genMode === GenerationMode.VIDEO && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setNeedsApiKey(!hasKey);
      } else {
        setNeedsApiKey(false);
      }
    };
    checkKey();
  }, [genMode]);

  const handleParseScript = async () => {
    setIsParsing(true);
    try {
      const parsedScenes = await GeminiService.parseScript(script);
      setScenes(parsedScenes);
    } catch (error) {
      console.error(error);
      alert("Failed to parse script. Check console.");
    } finally {
      setIsParsing(false);
    }
  };

  const generateSceneVisual = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingVisual: true } : s));
    try {
      const url = await GeminiService.generateVisual(scene.visualPrompt, genMode);
      setScenes(prev => prev.map(s => s.id === sceneId ? { 
        ...s, 
        isGeneratingVisual: false, 
        [genMode === GenerationMode.VIDEO ? 'videoUrl' : 'imageUrl']: url 
      } : s));
    } catch (error) {
      console.error(error);
      alert(`Error generating visual for scene ${sceneId}`);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingVisual: false } : s));
    }
  };

  const generateSceneAudio = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingAudio: true } : s));
    try {
      const { url, duration } = await GeminiService.generateAudio(scene.voiceover);
      
      // Convert PCM to WAV for browser playback
      const audioData = await fetch(url).then(r => r.arrayBuffer()).then(ab => new Uint8Array(ab));
      const wavBlob = await GeminiService.pcmToWavBlob(audioData);
      const wavUrl = URL.createObjectURL(wavBlob);

      setScenes(prev => prev.map(s => s.id === sceneId ? { 
        ...s, 
        isGeneratingAudio: false, 
        audioUrl: wavUrl,
        audioDuration: duration
      } : s));
    } catch (error) {
      console.error(error);
      alert(`Error generating audio for scene ${sceneId}`);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingAudio: false } : s));
    }
  };

  const generateAll = async () => {
    for (const scene of scenes) {
      if (!scene.imageUrl && !scene.videoUrl) await generateSceneVisual(scene.id);
      if (!scene.audioUrl) await generateSceneAudio(scene.id);
    }
  };

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setNeedsApiKey(false);
    }
  };

  // Playback logic
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      const startTime = Date.now() - (currentTime * 1000);
      interval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setCurrentTime(elapsed);

        // Find current scene and play audio if not playing
        const activeScene = scenes.find(s => elapsed >= s.startTime && elapsed <= s.endTime);
        if (activeScene && activeScene.audioUrl) {
           const audio = audioRefs.current[activeScene.id];
           if (audio && audio.paused) {
             audio.play().catch(console.error);
           }
        }

        const totalDuration = scenes.length > 0 ? scenes[scenes.length - 1].endTime : 0;
        if (elapsed >= totalDuration) {
          setIsPlaying(false);
          setCurrentTime(0);
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, scenes, currentTime]);

  const activeScene = scenes.find(s => currentTime >= s.startTime && currentTime <= s.endTime);

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold gradient-text">ReelGen AI</h1>
          <p className="text-gray-400 mt-1">Script-to-Video pipeline for the AI era.</p>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={() => setGenMode(GenerationMode.IMAGE)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${genMode === GenerationMode.IMAGE ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
           >
             Fast Image
           </button>
           <button 
            onClick={() => setGenMode(GenerationMode.VIDEO)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${genMode === GenerationMode.VIDEO ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
           >
             Veo Video
           </button>
        </div>
      </header>

      {needsApiKey && (
        <div className="bg-amber-900/40 border border-amber-500/50 p-4 rounded-xl flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-amber-200 font-semibold">API Key Required for Veo</span>
            <span className="text-amber-200/70 text-sm">You need a paid Google Cloud project API key to use video generation. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">Billing Info</a></span>
          </div>
          <button 
            onClick={handleSelectKey}
            className="bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 rounded-lg font-bold text-sm transition"
          >
            Select Key
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Script & Scenes */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="bg-blue-500/20 text-blue-400 p-1.5 rounded">📝</span>
              Video Script
            </h2>
            <textarea 
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full h-48 bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition custom-scrollbar"
              placeholder="Paste your multi-scene script here..."
            />
            <div className="mt-4 flex gap-3">
              <button 
                onClick={handleParseScript}
                disabled={isParsing}
                className="flex-1 bg-white text-black hover:bg-gray-200 disabled:opacity-50 py-3 rounded-xl font-bold transition"
              >
                {isParsing ? 'Parsing...' : 'Parse Scenes'}
              </button>
            </div>
          </section>

          {scenes.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="bg-purple-500/20 text-purple-400 p-1.5 rounded">🎬</span>
                  Timeline Scenes
                </h2>
                <button 
                  onClick={generateAll}
                  className="text-sm text-purple-400 hover:text-purple-300 transition font-medium"
                >
                  Generate All
                </button>
              </div>
              <div className="space-y-4">
                {scenes.map((scene, idx) => (
                  <div key={scene.id} className="glass-card rounded-2xl p-4 flex gap-4 border-l-4 border-l-blue-500">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Scene {idx + 1} ({scene.startTime}s - {scene.endTime}s)</span>
                      </div>
                      <p className="text-sm font-medium mb-1 line-clamp-1">{scene.voiceover}</p>
                      <p className="text-xs text-gray-400 italic line-clamp-2">{scene.visualPrompt}</p>
                      
                      <div className="mt-3 flex gap-2">
                        <button 
                          onClick={() => generateSceneVisual(scene.id)}
                          disabled={scene.isGeneratingVisual}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium border border-white/10 transition ${scene.imageUrl || scene.videoUrl ? 'bg-green-500/10 text-green-400' : 'bg-white/5 hover:bg-white/10 text-white'}`}
                        >
                          {scene.isGeneratingVisual ? 'Generating...' : (scene.imageUrl || scene.videoUrl ? 'Regenerate Visual' : 'Gen Visual')}
                        </button>
                        <button 
                          onClick={() => generateSceneAudio(scene.id)}
                          disabled={scene.isGeneratingAudio}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium border border-white/10 transition ${scene.audioUrl ? 'bg-blue-500/10 text-blue-400' : 'bg-white/5 hover:bg-white/10 text-white'}`}
                        >
                          {scene.isGeneratingAudio ? 'Generating...' : (scene.audioUrl ? 'Regenerate Audio' : 'Gen Audio')}
                        </button>
                      </div>
                    </div>
                    
                    <div className="w-24 h-40 bg-black/40 rounded-lg flex-shrink-0 overflow-hidden relative border border-white/5">
                      {scene.imageUrl && <img src={scene.imageUrl} className="w-full h-full object-cover" alt="" />}
                      {scene.videoUrl && <video src={scene.videoUrl} className="w-full h-full object-cover" muted loop autoPlay />}
                      {!scene.imageUrl && !scene.videoUrl && (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-600 text-center p-2">
                          {scene.isGeneratingVisual ? 'Loading...' : 'No Visual'}
                        </div>
                      )}
                      {scene.audioUrl && (
                        <div className="absolute bottom-1 right-1 bg-blue-500 rounded-full p-1 shadow-lg">
                           <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 010 12.728" />
                           </svg>
                        </div>
                      )}
                      <audio 
                        ref={el => { if (el) audioRefs.current[scene.id] = el; }}
                        src={scene.audioUrl} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Preview Player */}
        <div className="lg:col-span-5">
          <div className="sticky top-8">
            <section className="glass-card rounded-3xl p-6 aspect-[9/16] max-h-[80vh] relative overflow-hidden flex flex-col">
              <h2 className="text-center text-sm font-bold text-gray-500 mb-4 tracking-widest uppercase">Video Preview</h2>
              
              <div className="flex-1 bg-black rounded-2xl relative overflow-hidden group">
                {activeScene ? (
                  <>
                    {activeScene.videoUrl ? (
                      <video 
                        key={activeScene.id}
                        src={activeScene.videoUrl} 
                        className="w-full h-full object-cover" 
                        autoPlay 
                        muted 
                        loop 
                      />
                    ) : activeScene.imageUrl ? (
                      <img src={activeScene.imageUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 p-8 text-center flex-col gap-4">
                        <div className="w-16 h-16 border-4 border-white/5 border-t-blue-500 rounded-full animate-spin" />
                        <span className="text-sm">Wait for visuals...</span>
                      </div>
                    )}

                    {/* Captions Overlay */}
                    <div className="absolute bottom-20 left-4 right-4 text-center z-10">
                       <span className="bg-black/60 backdrop-blur px-3 py-2 rounded-lg text-lg font-bold shadow-2xl border border-white/10 animate-pulse inline-block">
                         {activeScene.voiceover}
                       </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-center flex-col gap-4 p-8">
                    <svg className="w-12 h-12 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Click play to start preview</span>
                  </div>
                )}

                {/* Playback Controls Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168l4.74 3.555a.5.5 0 010 .814l-4.74 3.555A.5.5 0 019 14.673V7.327a.5.5 0 01.555-.159z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Player UI */}
              <div className="mt-6 flex flex-col gap-4">
                <div className="w-full bg-gray-800 h-1.5 rounded-full relative">
                  <div 
                    className="absolute top-0 left-0 bg-blue-500 h-full rounded-full transition-all duration-100" 
                    style={{ width: `${(currentTime / (scenes[scenes.length - 1]?.endTime || 1)) * 100}%` }}
                  />
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-gray-500">{currentTime.toFixed(1)}s</span>
                  <button 
                    onClick={() => {
                      if (!isPlaying) {
                        (Object.values(audioRefs.current) as HTMLAudioElement[]).forEach(a => {
                          if (a) {
                            a.pause();
                            a.currentTime = 0;
                          }
                        });
                      }
                      setIsPlaying(!isPlaying);
                    }}
                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition"
                  >
                    {isPlaying ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                      <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
                  <span className="text-xs font-mono text-gray-500">{(scenes[scenes.length - 1]?.endTime || 0).toFixed(1)}s</span>
                </div>
              </div>
            </section>
            
            <button 
              className="w-full mt-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-4 rounded-2xl shadow-xl transition"
              onClick={() => alert("Exporting feature coming soon! You can record your screen to capture the generated content.")}
            >
              Export Final Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

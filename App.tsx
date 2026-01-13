import React, { useState, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { ProcessingStatus } from './components/ProcessingStatus';
import { ResultsView } from './components/ResultsView';
import { processFile } from './services/fileService';
import { createContentChunks } from './utils/chunking';
import { analyzeChunk, mergeAnalysisResults } from './services/geminiService';
import { AppView, ProcessingStats, AnalysisResult } from './types';
import { Sparkles, Hash, FileText } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.UPLOAD);
  const [stats, setStats] = useState<ProcessingStats>({
    totalUnits: 0,
    processedUnits: 0,
    status: 'idle',
  });
  const [results, setResults] = useState<AnalysisResult>({ toc: [], index: [] });
  const [usePrintedPageNumbers, setUsePrintedPageNumbers] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const handleProcess = useCallback(async (file: File) => {
    try {
      // Safely access process.env
      const apiKey = typeof process !== 'undefined' ? process.env?.API_KEY : undefined;

      if (!apiKey) {
        alert('Missing API KEY. Please ensure the environment variable is set.');
        return;
      }
      
      setCurrentFile(file);
      setView(AppView.PROCESSING);
      setStats(prev => ({ 
        ...prev, 
        status: 'processing', 
        statusMessage: 'Reading file and preparing visual chunks...',
        errorMessage: undefined 
      }));

      // 1. Process File
      const content = await processFile(file, (current, total) => {
        setStats(prev => ({ 
           ...prev, 
           statusMessage: `Rendering Page ${current} of ${total}...` 
        }));
      });

      // 2. Create Chunks
      const chunks = createContentChunks(content);
      
      setStats(prev => ({ 
        ...prev, 
        status: 'analyzing', 
        totalUnits: chunks.length,
        processedUnits: 0,
        statusMessage: 'Analyzing content segments...'
      }));

      const partialResults: AnalysisResult[] = [];

      // 3. Analyze Chunks
      for (const chunk of chunks) {
        setStats(prev => ({ 
            ...prev, 
            statusMessage: `Analyzing segment ${prev.processedUnits + 1} of ${prev.totalUnits}...` 
        }));

        // Pass the numbering mode to the service
        const result = await analyzeChunk(chunk, apiKey, usePrintedPageNumbers);
        partialResults.push(result);

        setStats(prev => ({ 
          ...prev, 
          processedUnits: prev.processedUnits + 1 
        }));
      }

      // 4. Merge
      setStats(prev => ({ ...prev, status: 'merging', statusMessage: 'Compiling final index...' }));
      const finalResult = mergeAnalysisResults(partialResults);
      setResults(finalResult);

      setStats(prev => ({ ...prev, status: 'complete' }));
      setTimeout(() => setView(AppView.RESULTS), 1000);

    } catch (error: any) {
      console.error(error);
      setStats(prev => ({ 
          ...prev, 
          status: 'error', 
          errorMessage: error.message || 'Unknown error occurred' 
      }));
    }
  }, [usePrintedPageNumbers]);

  const reset = () => {
    setView(AppView.UPLOAD);
    setResults({ toc: [], index: [] });
    setCurrentFile(null);
    setStats({
      totalUnits: 0,
      processedUnits: 0,
      status: 'idle',
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col font-sans selection:bg-white selection:text-black">
      {/* Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] opacity-40 mix-blend-screen"></div>
          <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[100px] opacity-40 mix-blend-screen"></div>
          <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] bg-white/5 rounded-full blur-[150px] opacity-30"></div>
      </div>

      {/* Navbar */}
      <header className="border-b border-white/5 sticky top-0 z-50 bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 group cursor-default">
            <div className="bg-white/10 text-white p-1.5 rounded-lg border border-white/5 group-hover:bg-white group-hover:text-black transition-colors duration-300">
              <Sparkles size={16} fill="currentColor" />
            </div>
            <h1 className="text-sm font-medium tracking-wide text-gray-200">
              Textbook Indexer
            </h1>
          </div>
          {view === AppView.RESULTS && (
             <button 
                onClick={reset} 
                className="text-xs font-medium text-gray-400 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/5 transition-all"
             >
               Start Over
             </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <div className="w-full max-w-5xl">
          
          {view === AppView.UPLOAD && (
            <div className="flex flex-col items-center animate-fade-in-up">
              <div className="text-center space-y-4 mb-12">
                <h2 className="text-4xl md:text-5xl font-light tracking-tight text-white">
                  Structure your <span className="font-normal text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-500">knowledge.</span>
                </h2>
                <p className="max-w-lg mx-auto text-base text-gray-400 font-light leading-relaxed">
                  Transform textbooks into structured data. Generate professional tables of contents and smart indexes in seconds.
                </p>
              </div>

              <div className="w-full max-w-xl space-y-6">
                <FileUploader 
                  onFileSelect={handleProcess} 
                  isLoading={stats.status !== 'idle' && stats.status !== 'error'} 
                />
                
                {/* Simplified Page Numbering Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${usePrintedPageNumbers ? 'bg-white/10 text-white' : 'bg-transparent text-gray-500'}`}>
                      {usePrintedPageNumbers ? <Hash size={16} /> : <FileText size={16} />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-200">Use Printed Page Numbers</span>
                      <span className="text-[10px] text-gray-500">
                        {usePrintedPageNumbers ? 'Detecting visual numbers from images' : 'Using sequential PDF page index'}
                      </span>
                    </div>
                  </div>
                  
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={usePrintedPageNumbers}
                      onChange={(e) => setUsePrintedPageNumbers(e.target.checked)} 
                    />
                    <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-white peer-checked:after:bg-black peer-checked:after:border-black"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {view === AppView.PROCESSING && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] animate-fade-in">
               <ProcessingStatus stats={stats} />
            </div>
          )}

          {view === AppView.RESULTS && (
            <div className="animate-fade-in w-full h-[calc(100vh-140px)] min-h-[500px]">
              <ResultsView 
                data={results} 
                originalFile={currentFile} 
                usePrintedPageNumbers={usePrintedPageNumbers}
              />
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
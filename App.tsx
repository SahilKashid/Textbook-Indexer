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
      if (!process.env.API_KEY) {
        alert('Missing API KEY. Please ensuring the environment variable is set.');
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
        const result = await analyzeChunk(chunk, process.env.API_KEY, usePrintedPageNumbers);
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
    <div className="min-h-screen bg-black text-gray-100 flex flex-col font-sans selection:bg-white selection:text-black">
      {/* Navbar */}
      <header className="border-b border-white/10 sticky top-0 z-50 bg-black/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white text-black p-1.5 rounded-md">
              <Sparkles size={18} fill="currentColor" />
            </div>
            <h1 className="text-lg font-medium tracking-wide">
              Textbook Indexer
            </h1>
          </div>
          {view === AppView.RESULTS && (
             <button onClick={reset} className="text-sm text-gray-400 hover:text-white transition-colors tracking-wide">
               Analyze New File
             </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none opacity-20">
            <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[20%] w-[400px] h-[400px] bg-white/5 rounded-full blur-[100px]"></div>
        </div>

        <div className="w-full max-w-4xl space-y-12">
          
          {view === AppView.UPLOAD && (
            <div className="text-center space-y-6 mb-16 animate-fade-in-up">
              <h2 className="text-4xl sm:text-6xl font-light tracking-tighter text-white">
                Structure your <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">knowledge.</span>
              </h2>
              <p className="max-w-xl mx-auto text-lg text-gray-400 font-light leading-relaxed">
                Generate professional Tables of Contents and Alphabetical Indexes from your textbooks using advanced visual analysis.
              </p>
            </div>
          )}

          {view === AppView.UPLOAD && (
            <div className="animate-fade-in-up delay-100 flex flex-col gap-8">
              <FileUploader 
                onFileSelect={handleProcess} 
                isLoading={stats.status !== 'idle' && stats.status !== 'error'} 
              />
              
              {/* Page Numbering Toggle */}
              <div className="flex justify-center">
                 <label className="flex items-center gap-4 cursor-pointer group bg-white/5 hover:bg-white/10 p-4 rounded-xl border border-white/5 transition-all duration-300">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-black/40 border border-white/10 text-gray-400 group-hover:text-white transition-colors">
                        {usePrintedPageNumbers ? <Hash size={18} /> : <FileText size={18} />}
                    </div>
                    <div className="flex flex-col mr-4">
                      <span className="text-sm font-medium text-gray-200">
                        {usePrintedPageNumbers ? 'Using Printed Page Numbers' : 'Using Document Page Index'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {usePrintedPageNumbers ? 'Detecting numbers from page images' : 'Counting sequential PDF pages'}
                      </span>
                    </div>
                    
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={usePrintedPageNumbers}
                        onChange={(e) => setUsePrintedPageNumbers(e.target.checked)} 
                      />
                      <div className="w-11 h-6 bg-zinc-800 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white peer-checked:after:bg-black peer-checked:after:border-black"></div>
                    </div>
                 </label>
              </div>
            </div>
          )}

          {view === AppView.PROCESSING && (
            <div className="flex flex-col items-center justify-center min-h-[400px] animate-fade-in">
               <ProcessingStatus stats={stats} />
            </div>
          )}

          {view === AppView.RESULTS && (
            <ResultsView 
              data={results} 
              originalFile={currentFile} 
              usePrintedPageNumbers={usePrintedPageNumbers}
            />
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-auto">
        <div className="max-w-6xl mx-auto px-6 text-center text-gray-600 text-xs tracking-widest uppercase">
          <p>Visual Document Intelligence</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { FileUploader } from './components/FileUploader';
import { ProcessingStatus } from './components/ProcessingStatus';
import { ResultsView } from './components/ResultsView';
import { processFile } from './services/fileService';
import { createContentChunks } from './utils/chunking';
import { analyzeChunk, mergeAnalysisResults } from './services/geminiService';
import { AppView, ProcessingStats, AnalysisResult } from './types';
import { Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.UPLOAD);
  const [stats, setStats] = useState<ProcessingStats>({
    totalUnits: 0,
    processedUnits: 0,
    status: 'idle',
  });
  const [results, setResults] = useState<AnalysisResult>({ toc: [], index: [] });

  const handleProcess = useCallback(async (file: File) => {
    try {
      if (!process.env.API_KEY) {
        alert('Missing API KEY. Please ensuring the environment variable is set.');
        return;
      }
      
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

        const result = await analyzeChunk(chunk, process.env.API_KEY);
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
  }, []);

  const reset = () => {
    setView(AppView.UPLOAD);
    setResults({ toc: [], index: [] });
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
            <div className="animate-fade-in-up delay-100">
              <FileUploader 
                onFileSelect={handleProcess} 
                isLoading={stats.status !== 'idle' && stats.status !== 'error'} 
              />
            </div>
          )}

          {view === AppView.PROCESSING && (
            <div className="flex flex-col items-center justify-center min-h-[400px] animate-fade-in">
               <ProcessingStatus stats={stats} />
            </div>
          )}

          {view === AppView.RESULTS && (
            <ResultsView data={results} />
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

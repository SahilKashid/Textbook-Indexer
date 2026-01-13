import React from 'react';
import { Loader2, FileText, CheckCircle2, Layers } from 'lucide-react';
import { ProcessingStats } from '../types';

interface ProcessingStatusProps {
  stats: ProcessingStats;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ stats }) => {
  const percentage = stats.status === 'processing'
    ? 20
    : stats.status === 'analyzing'
    ? 20 + (stats.processedUnits / (stats.totalUnits || 1)) * 70 
    : stats.status === 'merging'
    ? 95 
    : stats.status === 'complete' ? 100 : 0;

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-white/10 p-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-white font-medium flex items-center gap-3 tracking-wide">
          {stats.status === 'complete' ? (
            <CheckCircle2 className="text-white" size={18} />
          ) : (
            <Loader2 className="animate-spin text-gray-400" size={18} />
          )}
          {stats.statusMessage || 'Initializing...'}
        </h3>
        <span className="text-sm font-mono text-gray-500">{Math.round(percentage)}%</span>
      </div>

      <div className="w-full bg-white/5 rounded-full h-1 mb-8 overflow-hidden">
        <div 
          className="bg-white h-1 rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(255,255,255,0.3)]" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="bg-black/40 p-4 rounded-lg border border-white/5 flex flex-col items-center text-center gap-1">
          <Layers size={14} className="text-gray-500 mb-1" />
          <span className="text-gray-500 uppercase tracking-wider scale-90">Total Batches</span>
          <span className="font-mono text-white text-sm">{stats.totalUnits || '-'}</span>
        </div>

        <div className="bg-black/40 p-4 rounded-lg border border-white/5 flex flex-col items-center text-center gap-1">
          <FileText size={14} className="text-gray-500 mb-1" />
          <span className="text-gray-500 uppercase tracking-wider scale-90">Processed</span>
          <span className="font-mono text-white text-sm">{stats.processedUnits}</span>
        </div>
      </div>
      
      {stats.errorMessage && (
        <div className="mt-6 p-4 bg-red-900/20 text-red-200 rounded-lg text-xs border border-red-500/20">
          Error: {stats.errorMessage}
        </div>
      )}
    </div>
  );
};

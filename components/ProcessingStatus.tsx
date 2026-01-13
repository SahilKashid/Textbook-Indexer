import React from 'react';
import { Loader2, Layers, CheckCircle2 } from 'lucide-react';
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
    <div className="w-full max-w-lg mx-auto bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-8 shadow-2xl">
      <div className="flex justify-between items-start mb-6">
        <div className="space-y-1">
            <h3 className="text-white font-medium flex items-center gap-2 text-sm tracking-wide">
            {stats.status === 'complete' ? (
                <CheckCircle2 className="text-green-500" size={16} />
            ) : (
                <Loader2 className="animate-spin text-white" size={16} />
            )}
            {stats.statusMessage || 'Initializing...'}
            </h3>
            <p className="text-xs text-gray-500 pl-6">
                Step {stats.status === 'processing' ? 1 : stats.status === 'analyzing' ? 2 : stats.status === 'merging' ? 3 : 4} of 4
            </p>
        </div>
        <span className="text-2xl font-light text-white tabular-nums">{Math.round(percentage)}%</span>
      </div>

      <div className="w-full bg-white/5 rounded-full h-1.5 mb-8 overflow-hidden relative">
         <div className="absolute inset-0 bg-white/5 w-full h-full"></div>
         <div 
          className="bg-white h-full rounded-full transition-all duration-700 ease-out relative z-10 shadow-[0_0_15px_rgba(255,255,255,0.5)]" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      <div className="flex items-center justify-between text-xs border-t border-white/5 pt-6">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white/5 rounded-md text-gray-400">
             <Layers size={14} />
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500">Segments</span>
            <span className="text-white font-mono">{stats.processedUnits} <span className="text-gray-600">/</span> {stats.totalUnits || '-'}</span>
          </div>
        </div>

        {stats.errorMessage && (
          <div className="text-red-400 bg-red-900/10 px-3 py-1 rounded border border-red-500/20">
            {stats.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
};
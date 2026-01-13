import React, { useRef } from 'react';
import { Upload, FileUp } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        onFileSelect(files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={`
          group relative border border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer overflow-hidden
          ${isLoading 
            ? 'border-white/5 bg-white/[0.02] cursor-not-allowed opacity-60' 
            : 'border-white/10 bg-transparent hover:border-white/30 hover:bg-white/[0.02]'
          }
        `}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleChange}
          accept=".pdf,image/*,.txt" 
          className="hidden"
          disabled={isLoading}
        />
        
        <div className="flex flex-col items-center gap-5 relative z-10">
          <div className={`
             p-4 rounded-2xl transition-all duration-500
             ${isLoading ? 'bg-white/5 text-gray-500' : 'bg-zinc-900 border border-white/10 text-white shadow-lg shadow-black/50 group-hover:scale-105 group-hover:border-white/20'}
          `}>
            {isLoading ? <FileUp size={28} className="animate-pulse" /> : <Upload size={28} strokeWidth={1.5} />}
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-medium text-gray-200 tracking-wide">
              {isLoading ? 'Processing...' : 'Upload Textbook'}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
};
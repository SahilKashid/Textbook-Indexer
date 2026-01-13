import React, { useRef } from 'react';
import { Upload, Info } from 'lucide-react';

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
    <div className="w-full max-w-xl mx-auto">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={`
          group relative border border-dashed rounded-xl p-16 text-center transition-all duration-500 cursor-pointer overflow-hidden
          ${isLoading 
            ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed' 
            : 'border-white/20 bg-transparent hover:border-white/50 hover:bg-white/5'
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
        
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className={`p-4 rounded-full transition-transform duration-500 group-hover:scale-110 ${isLoading ? 'bg-white/5' : 'bg-white/5 text-white'}`}>
            <Upload size={24} strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-white tracking-wide">
              {isLoading ? 'Processing Document...' : 'Upload Document'}
            </h3>
            <p className="text-gray-500 text-sm font-light">
              Drag and drop or click to browse
            </p>
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center justify-center gap-2 text-gray-500 text-xs font-light opacity-60">
        <Info size={12} />
        <p>
          Supported formats: Documents & Images
        </p>
      </div>
    </div>
  );
};

export interface TocEntry {
  title: string;
  level: number;
  pageNumber: number | string; // Can be string for non-paginated content
}

export interface IndexEntry {
  term: string;
  pageNumbers: (number | string)[];
}

export interface ProcessingStats {
  totalUnits: number; // Pages or Text Chunks
  processedUnits: number;
  status: 'idle' | 'processing' | 'analyzing' | 'merging' | 'complete' | 'error';
  statusMessage?: string;
  errorMessage?: string;
}

export interface AnalysisResult {
  toc: TocEntry[];
  index: IndexEntry[];
}

export type FileContent = 
  | { type: 'image'; data: string[]; sourceMap: number[] } // data is base64[], sourceMap maps index to page/file number
  | { type: 'text'; data: string[] }; // Array of text chunks

export enum AppView {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  RESULTS = 'RESULTS',
}
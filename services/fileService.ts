import { FileContent } from '../types';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// Configure PDF.js worker
if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export const processFile = async (
  file: File,
  onProgress: (current: number, total: number) => void
): Promise<FileContent> => {
  const fileType = file.type;

  try {
    if (fileType === 'application/pdf') {
      return await processPdfAsImages(file, onProgress);
    } else if (fileType.startsWith('image/')) {
      return await processImageFile(file);
    } else if (fileType === 'text/plain' || fileType === 'text/markdown') {
      return await processTextFile(file);
    } else {
      // Fallback for other types (like EPUB if we had a reader, or unknown): Try text
      console.warn("Unknown file type, attempting text read:", fileType);
      return await processTextFile(file);
    }
  } catch (error) {
    console.error("File processing error:", error);
    throw new Error(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const processPdfAsImages = async (
  file: File,
  onProgress: (current: number, total: number) => void
): Promise<FileContent> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const images: string[] = [];
  const sourceMap: number[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 }); // Good balance for Gemini Vision
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error('Canvas context not available');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Convert to JPEG base64 (remove prefix)
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    images.push(base64);
    sourceMap.push(i);

    onProgress(i, totalPages);
    
    // Memory cleanup
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }

  return { type: 'image', data: images, sourceMap };
};

const processImageFile = async (file: File): Promise<FileContent> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ type: 'image', data: [base64], sourceMap: [1] });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const processTextFile = async (file: File): Promise<FileContent> => {
  const text = await file.text();
  // Simple chunking for text files (approx 2000 chars per chunk)
  // We can refine this if needed, but for "textbooks" this usually implies PDFs/Images in this context.
  const chunks = text.match(/[\s\S]{1,10000}/g) || [text];
  return { type: 'text', data: chunks };
};

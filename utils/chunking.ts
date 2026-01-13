import { FileContent } from '../types';

// Gemini Flash 2.0 has a large context, but we want to chunk for "detail".
// For images (pages), 10 pages is a good batch size (~2500 tokens + dense info).
const IMAGES_PER_CHUNK = 10;
const TEXT_CHARS_PER_CHUNK = 15000;

export interface ProcessingChunk {
  id: number;
  type: 'image' | 'text';
  data: string[]; // Base64 images or Text strings
  startPage?: number | string; // For tracking
  endPage?: number | string;
}

export const createContentChunks = (content: FileContent): ProcessingChunk[] => {
  const chunks: ProcessingChunk[] = [];
  
  if (content.type === 'image') {
    const totalImages = content.data.length;
    let chunkId = 1;
    
    for (let i = 0; i < totalImages; i += IMAGES_PER_CHUNK) {
      const slice = content.data.slice(i, i + IMAGES_PER_CHUNK);
      const startMap = content.sourceMap[i];
      const endMap = content.sourceMap[Math.min(i + IMAGES_PER_CHUNK, totalImages) - 1];
      
      chunks.push({
        id: chunkId++,
        type: 'image',
        data: slice,
        startPage: startMap,
        endPage: endMap
      });
    }
  } else {
    // Text content
    // Assuming content.data is already roughly chunked or is one big string we need to split?
    // fileService splits text simply. Let's just wrap it.
    content.data.forEach((textChunk, idx) => {
      chunks.push({
        id: idx + 1,
        type: 'text',
        data: [textChunk],
        startPage: `Text Part ${idx + 1}`
      });
    });
  }

  return chunks;
};

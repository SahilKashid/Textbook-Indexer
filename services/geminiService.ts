import { GoogleGenAI, Type } from '@google/genai';
import { AnalysisResult, IndexEntry, TocEntry } from '../types';
import { ProcessingChunk } from '../utils/chunking';

const MODEL_NAME = 'gemini-3-flash-preview'; 

export const analyzeChunk = async (
  chunk: ProcessingChunk,
  apiKey: string,
  usePrintedPageNumbers: boolean = false
): Promise<AnalysisResult> => {
  if (!apiKey) throw new Error('API Key is missing');

  const ai = new GoogleGenAI({ apiKey });

  let promptText = '';
  let parts: any[] = [];

  if (chunk.type === 'image') {
    const numberingInstruction = usePrintedPageNumbers 
      ? `
        PAGE NUMBERING MODE: VISUAL (PRINTED)
        - Look for the actual page number printed on the page image (header/footer).
        - Use this VISIBLE printed number for all ToC and Index references.
        - If a page has no visible number, infer it from the sequence of surrounding printed numbers.
        - The [PAGE X] marker provided in the prompt is the file index; use it only as a fallback if visual extraction is impossible.
      `
      : `
        PAGE NUMBERING MODE: SEQUENTIAL (FILE INDEX)
        - STRICTLY use the [PAGE X] marker provided before each image as the page number.
        - IGNORE any page numbers visible inside the image content.
        - X represents the absolute PDF/File page index.
      `;

    promptText = `
      You are an expert textbook editor. Analyze the provided textbook pages (images) and extract:
      1. A Table of Contents (ToC) structure (Chapters, Sections).
         - Ignore running headers or footers (e.g., book title repeatedly at top of page).
         - Only include actual section headings found in the text body.
         - Maintain hierarchy (level 1 for Chapters, 2 for Sections, etc.).
      2. An Alphabetical Index of important terms, concepts, and proper nouns.
         - Exclude trivial mentions.

      CONTEXT:
      - These pages are from a larger document.
      ${numberingInstruction}
      
      CRITICAL:
      - Capture EVERY important term for the index.
      
      Return JSON.
    `;
    
    parts.push({ text: promptText });
    
    // Interleave images with page markers
    chunk.data.forEach((b64, idx) => {
      const pageNum = typeof chunk.startPage === 'number' ? chunk.startPage + idx : `Image ${idx+1}`;
      parts.push({ text: `[PAGE ${pageNum}]` });
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: b64
        }
      });
    });

  } else {
    // Text mode
    promptText = `
      You are an expert textbook editor. Analyze the provided text and extract ToC and Index.
      The text is a segment of a larger file.
      Return JSON.
    `;
    parts.push({ text: promptText });
    parts.push({ text: chunk.data[0] });
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { role: 'user', parts: parts }
      ],
      config: {
        thinkingConfig: { thinkingBudget: 1024 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            toc: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  level: { type: Type.INTEGER },
                  pageNumber: { type: Type.STRING, description: "Page number" } 
                },
                required: ["title", "level", "pageNumber"]
              }
            },
            index: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  pageNumber: { type: Type.STRING }
                },
                required: ["term", "pageNumber"]
              }
            }
          },
          required: ["toc", "index"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) return { toc: [], index: [] };

    const parsed = JSON.parse(resultText);
    
    // Sanitize and map
    const toc: TocEntry[] = (parsed.toc || []).map((t: any) => ({
        title: t.title,
        level: t.level,
        pageNumber: t.pageNumber
    }));

    const rawIndex = parsed.index || [];
    const formattedIndex: IndexEntry[] = rawIndex.map((item: any) => ({
      term: item.term,
      pageNumbers: [item.pageNumber]
    }));

    return {
      toc,
      index: formattedIndex
    };

  } catch (error) {
    console.error(`Error analyzing chunk ${chunk.id}:`, error);
    return { toc: [], index: [] };
  }
};

export const mergeAnalysisResults = (results: AnalysisResult[]): AnalysisResult => {
  // 1. Merge ToC
  // Flatten all results first
  const allToc = results.flatMap(r => r.toc);
  const tocMap = new Map<string, TocEntry>();

  allToc.forEach(entry => {
     // Create a unique key for deduplication: Page + Level + Title
     // This prevents the same exact heading on the same page from appearing twice (e.g. overlap or error),
     // but allows "Exercises" on Page 10 and Page 20.
     const normalizedTitle = entry.title.trim();
     const key = `${entry.pageNumber}-${entry.level}-${normalizedTitle}`;
     
     if (!tocMap.has(key)) {
        tocMap.set(key, entry);
     }
  });
  
  // Sort ToC by page number
  const mergedToc = Array.from(tocMap.values()).sort((a, b) => {
     // Extract numeric part of page number for sorting (e.g. "10" from "Page 10" or just 10)
     const getPageNum = (p: string | number) => {
        const match = String(p).match(/(\d+)/);
        return match ? parseInt(match[0]) : NaN;
     };

     const numA = getPageNum(a.pageNumber);
     const numB = getPageNum(b.pageNumber);

     if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
         return numA - numB;
     }
     // Fallback to string comparison for non-numeric or equal numeric pages
     return String(a.pageNumber).localeCompare(String(b.pageNumber));
  });

  // 2. Merge Index
  // We need to handle case sensitivity (DNA vs dna) and merge page numbers
  const indexMap = new Map<string, {
    termVariants: Map<string, number>, // Track frequency of different casings
    pageNumbers: Set<string>
  }>();

  results.flatMap(r => r.index).forEach(entry => {
    const rawTerm = entry.term.trim();
    if (!rawTerm) return;

    // Use lowercase for grouping
    const key = rawTerm.toLowerCase();

    if (!indexMap.has(key)) {
      indexMap.set(key, {
        termVariants: new Map(),
        pageNumbers: new Set()
      });
    }

    const record = indexMap.get(key)!;

    // Count occurrence of this specific casing
    record.termVariants.set(rawTerm, (record.termVariants.get(rawTerm) || 0) + 1);

    // Add page numbers
    entry.pageNumbers.forEach(p => record.pageNumbers.add(String(p)));
  });

  // Convert map back to array
  const mergedIndex: IndexEntry[] = Array.from(indexMap.values()).map(record => {
    // 1. Determine best term display (most frequent variant)
    let bestTerm = "";
    let maxCount = -1;
    
    record.termVariants.forEach((count, variant) => {
      if (count > maxCount) {
        maxCount = count;
        bestTerm = variant;
      } else if (count === maxCount) {
        // Tie-breaker: prefer uppercase/titlecase over lowercase if counts are equal
        if (variant[0] === variant[0].toUpperCase()) {
            bestTerm = variant;
        }
      }
    });

    // 2. Sort page numbers
    const sortedPages = Array.from(record.pageNumbers).sort((a, b) => {
       const nA = parseInt(a);
       const nB = parseInt(b);
       if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
       return a.localeCompare(b);
    });

    return {
      term: bestTerm,
      pageNumbers: sortedPages
    };
  });

  // Final alphabetical sort of the index
  mergedIndex.sort((a, b) => 
    a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
  );

  return {
    toc: mergedToc,
    index: mergedIndex
  };
};
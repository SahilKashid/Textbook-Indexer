import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { Download, Book, List, Search, Loader2 } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, PDFName, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

interface ResultsViewProps {
  data: AnalysisResult;
  originalFile: File | null;
  usePrintedPageNumbers: boolean;
}

export const ResultsView: React.FC<ResultsViewProps> = ({ data, originalFile, usePrintedPageNumbers }) => {
  const [activeTab, setActiveTab] = useState<'toc' | 'index'>('toc');
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const filteredIndex = data.index.filter(item => 
    item.term.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const generateCompositePdf = async () => {
    if (!originalFile) return;
    
    try {
      setIsGeneratingPdf(true);
      const originalPdfBytes = await originalFile.arrayBuffer();
      const originalPdf = await PDFDocument.load(originalPdfBytes);
      
      originalPdf.registerFontkit(fontkit);
      
      const newPdf = await PDFDocument.create();
      newPdf.registerFontkit(fontkit);

      // --- FONT LOADING ---
      let font: any, boldFont: any, italicFont: any;
      let usingFallbackFont = false;

      try {
        const loadFont = async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch font from ${url}`);
            return await res.arrayBuffer();
        };

        const [fontBytes, boldFontBytes, italicFontBytes] = await Promise.all([
          loadFont('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Regular.ttf'),
          loadFont('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Bold.ttf'),
          loadFont('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Italic.ttf')
        ]);

        font = await newPdf.embedFont(fontBytes);
        boldFont = await newPdf.embedFont(boldFontBytes);
        italicFont = await newPdf.embedFont(italicFontBytes);
      } catch (fontError) {
        console.warn("Falling back to StandardFonts.", fontError);
        font = await newPdf.embedFont(StandardFonts.Helvetica);
        boldFont = await newPdf.embedFont(StandardFonts.HelveticaBold);
        italicFont = await newPdf.embedFont(StandardFonts.HelveticaOblique);
        usingFallbackFont = true;
      }

      // --- CONSTANTS ---
      const fontSize = 10;
      const headerSize = 24;
      const lineHeight = 16;
      const pageWidth = 595.28; 
      const pageHeight = 841.89; 
      const margin = 50;
      const contentWidth = pageWidth - (margin * 2);

      // --- UTILS ---
      
      const sanitize = (text: string) => {
        let safe = text.replace(/[\n\r]+/g, ' ');
        if (usingFallbackFont) {
           safe = safe.replace(/–|—/g, '-').replace(/“|”/g, '"').replace(/’/g, "'").replace(/[^\x20-\x7E]/g, '');
        }
        return safe;
      };

      const wrapText = (text: string, maxWidth: number, fontToUse: any, size: number): string[] => {
        const words = sanitize(text).split(' ');
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          try {
            const width = fontToUse.widthOfTextAtSize(currentLine + " " + word, size);
            if (width < maxWidth) {
              currentLine += " " + word;
            } else {
              lines.push(currentLine);
              currentLine = word;
            }
          } catch { currentLine += " " + word; }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      };

      const addLink = (page: PDFPage, x: number, y: number, w: number, h: number, targetPageIdx: number) => {
         // targetPageIdx is 0-based index in the NEW pdf
         if (targetPageIdx < 0 || targetPageIdx >= newPdf.getPageCount()) return;
         
         const targetPage = newPdf.getPages()[targetPageIdx];
         const link = newPdf.context.register(
           newPdf.context.obj({
             Type: 'Annot',
             Subtype: 'Link',
             Rect: [x, y, x + w, y + h],
             Border: [0, 0, 0],
             Dest: [targetPage.ref, 'XYZ', null, null, null], 
           })
         );
         page.node.addAnnot(link);
      };

      // --- STEP 1: CALCULATE TOC SIZE & CREATE PLACEHOLDERS ---

      let tocPageCount = 0;
      // Simulation to count pages
      {
         let pages = 1;
         let cursorY = pageHeight - margin - 60; // Header space
         data.toc.forEach(entry => {
             const indent = (entry.level - 1) * 15;
             const availableWidth = contentWidth - indent - 40; 
             const lines = wrapText(entry.title, availableWidth, entry.level === 1 ? boldFont : font, fontSize);
             lines.forEach(() => {
                if (cursorY < margin) { pages++; cursorY = pageHeight - margin; }
                cursorY -= lineHeight;
             });
             cursorY -= 4; 
         });
         tocPageCount = pages;
      }

      // Create ToC Placeholders
      for (let i = 0; i < tocPageCount; i++) {
        newPdf.addPage([pageWidth, pageHeight]);
      }

      // --- STEP 2: APPEND CONTENT ---
      // The content starts at index `tocPageCount`
      const contentStartIndex = tocPageCount;
      const copiedPages = await newPdf.copyPages(originalPdf, originalPdf.getPageIndices());
      copiedPages.forEach(p => newPdf.addPage(p));
      const contentEndIndex = newPdf.getPageCount() - 1;

      // Helper to map "Page 5" string to actual PDF index
      const resolveTargetPage = (pageNumStr: string | number): number => {
         const p = parseInt(String(pageNumStr).replace(/[^0-9]/g, ''));
         if (isNaN(p)) return contentStartIndex; // Default to start of content
         
         // If using printed numbers, we assume '1' maps to start of content. 
         // Advanced logic would require a map, but 1-based offset is best guess.
         // Index 0 of content = Page 1
         const target = contentStartIndex + (p - 1);
         if (target > contentEndIndex) return contentEndIndex;
         if (target < contentStartIndex) return contentStartIndex;
         return target;
      };

      // --- STEP 3: GENERATE INDEX (Backside) ---
      
      let indexPage = newPdf.addPage([pageWidth, pageHeight]);
      let cursorY = pageHeight - margin;
      
      // Header
      indexPage.drawText('Alphabetical Index', { x: margin, y: cursorY, size: headerSize, font: boldFont });
      indexPage.drawLine({ start: { x: margin, y: cursorY - 10 }, end: { x: pageWidth - margin, y: cursorY - 10 }, thickness: 1, color: rgb(0,0,0) });
      cursorY -= 50;

      // Layout columns
      const colGap = 30;
      const colWidth = (contentWidth - colGap) / 2;
      let currentCol = 0;
      let y0 = cursorY;
      let y1 = cursorY;

      // Group by letter
      const groupedIndex: Record<string, typeof data.index> = {};
      data.index.forEach(item => {
        const letter = item.term.charAt(0).toUpperCase();
        const key = /[A-Z]/.test(letter) ? letter : '#';
        if (!groupedIndex[key]) groupedIndex[key] = [];
        groupedIndex[key].push(item);
      });
      const sortedKeys = Object.keys(groupedIndex).sort();

      sortedKeys.forEach(letter => {
         // Section Header (e.g., "A")
         let targetY = currentCol === 0 ? y0 : y1;
         if (targetY < margin + 40) {
            // New Page / Column switch
            if (currentCol === 0) {
                currentCol = 1; targetY = cursorY; y1 = cursorY;
            } else {
                indexPage = newPdf.addPage([pageWidth, pageHeight]);
                cursorY = pageHeight - margin;
                currentCol = 0; y0 = cursorY; y1 = cursorY; targetY = cursorY;
            }
         }
         
         // Draw Letter Header
         const xBase = margin + (currentCol * (colWidth + colGap));
         indexPage.drawText(letter, { x: xBase, y: targetY, size: 14, font: boldFont });
         indexPage.drawLine({ start: { x: xBase, y: targetY - 2 }, end: { x: xBase + colWidth, y: targetY - 2 }, thickness: 0.5, color: rgb(0.5,0.5,0.5) });
         targetY -= 20;

         // Draw Items
         groupedIndex[letter].forEach(item => {
             const term = sanitize(item.term);
             const termLines = wrapText(term, colWidth, boldFont, 10);
             
             // Measure height needed (term lines + context lines + 1 line for page nums)
             const contextSafe = item.context ? sanitize(item.context) : null;
             const contextLines = contextSafe ? wrapText(contextSafe, colWidth, italicFont, 9) : [];
             const totalH = (termLines.length * 11) + (contextLines.length * 10) + 12 + 6;

             // Check overflow
             if (targetY - totalH < margin) {
                if (currentCol === 0) {
                    currentCol = 1; targetY = cursorY; y1 = targetY;
                } else {
                    indexPage = newPdf.addPage([pageWidth, pageHeight]);
                    cursorY = pageHeight - margin;
                    currentCol = 0; y0 = cursorY; y1 = cursorY; targetY = cursorY;
                }
             }

             const drawX = margin + (currentCol * (colWidth + colGap));
             
             // Draw Term
             termLines.forEach(l => {
                 indexPage.drawText(l, { x: drawX, y: targetY, size: 10, font: boldFont });
                 targetY -= 11;
             });

             // Draw Context
             contextLines.forEach(l => {
                 indexPage.drawText(l, { x: drawX, y: targetY, size: 9, font: italicFont, color: rgb(0.3, 0.3, 0.3) });
                 targetY -= 10;
             });

             // Draw Page Numbers (Flow Layout)
             let currentX = drawX;
             const pageNums = item.pageNumbers;
             pageNums.forEach((pNum, idx) => {
                 const pStr = String(pNum);
                 const pWidth = font.widthOfTextAtSize(pStr, 10);
                 const commaW = font.widthOfTextAtSize(", ", 10);
                 
                 // Wrap page numbers if needed
                 if (currentX + pWidth > drawX + colWidth) {
                     targetY -= 11;
                     currentX = drawX;
                 }
                 
                 indexPage.drawText(pStr, { x: currentX, y: targetY, size: 10, font, color: rgb(0, 0, 0.7) });
                 
                 // ADD LINK
                 const targetIdx = resolveTargetPage(pStr);
                 addLink(indexPage, currentX, targetY, pWidth, 10, targetIdx);

                 currentX += pWidth;
                 if (idx < pageNums.length - 1) {
                     indexPage.drawText(", ", { x: currentX, y: targetY, size: 10, font });
                     currentX += commaW;
                 }
             });
             targetY -= 14; // Spacing after item

             // Update column cursors
             if (currentCol === 0) y0 = targetY; else y1 = targetY;
         });
         
         // Spacing after letter group
         if (currentCol === 0) y0 -= 10; else y1 -= 10;
      });


      // --- STEP 4: FILL TOC (Frontside) ---
      
      const tocPages = newPdf.getPages().slice(0, tocPageCount);
      let tocPageIndex = 0;
      let currentTocPage = tocPages[0];
      cursorY = pageHeight - margin;

      // Header
      currentTocPage.drawText('Table of Contents', { 
          x: pageWidth / 2 - boldFont.widthOfTextAtSize('Table of Contents', headerSize) / 2, 
          y: cursorY, 
          size: headerSize, 
          font: boldFont 
      });
      cursorY -= 50;

      data.toc.forEach(entry => {
         const entryFont = entry.level === 1 ? boldFont : font;
         const entrySize = entry.level === 1 ? 11 : 10;
         const indent = (entry.level - 1) * 15;
         const numWidth = 30;
         const titleWidth = contentWidth - indent - numWidth - 10; // 10 gap

         const lines = wrapText(entry.title, titleWidth, entryFont, entrySize);
         
         const pStr = String(entry.pageNumber);
         const targetIdx = resolveTargetPage(pStr);

         lines.forEach((line, idx) => {
           if (cursorY < margin) {
             tocPageIndex++;
             if (tocPageIndex < tocPages.length) {
                 currentTocPage = tocPages[tocPageIndex];
                 cursorY = pageHeight - margin;
             }
           }

           // Draw Title
           currentTocPage.drawText(line, { x: margin + indent, y: cursorY, size: entrySize, font: entryFont });
           
           // If last line of title, draw dots and page number
           if (idx === lines.length - 1) {
             const titleLineWidth = entryFont.widthOfTextAtSize(line, entrySize);
             const startDotX = margin + indent + titleLineWidth + 5;
             const endDotX = pageWidth - margin - 35; 
             
             // Draw Dotted Leader
             if (endDotX > startDotX) {
                const dot = ".";
                const dotW = font.widthOfTextAtSize(dot, 10);
                const spaceAvailable = endDotX - startDotX;
                const dotCount = Math.floor(spaceAvailable / (dotW + 2));
                const dots = Array(dotCount).fill(".").join(" ");
                currentTocPage.drawText(dots, { x: startDotX, y: cursorY, size: 8, font, color: rgb(0.5,0.5,0.5) });
             }

             // Draw Page Number
             const pWidth = font.widthOfTextAtSize(pStr, entrySize);
             currentTocPage.drawText(pStr, { x: pageWidth - margin - pWidth, y: cursorY, size: entrySize, font: entryFont });

             // ADD LINK (Covering the whole line)
             addLink(currentTocPage, margin, cursorY - 2, pageWidth - (margin * 2), entrySize + 4, targetIdx);
           }

           cursorY -= lineHeight;
         });
         cursorY -= 4; 
      });


      // --- SAVE ---
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalFile.name.replace('.pdf', '_pro_indexed.pdf');
      a.click();
      URL.revokeObjectURL(url);

    } catch (e) {
        console.error("Error generating PDF", e);
        alert(`Failed to generate PDF: ${(e as Error).message}`);
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  const downloadData = (format: 'json' | 'md' | 'csv' | 'pdf') => {
    // 1. PDF Export Logic
    if (format === 'pdf') {
      // If we have an original PDF, do the advanced merge
      if (originalFile && originalFile.type === 'application/pdf') {
         generateCompositePdf();
         return;
      }

      // Fallback: Use print window logic for non-PDFs (or if PDF file obj missing)
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Please allow popups to export as PDF.");
        return;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Textbook Analysis Export</title>
          <style>
            @page { margin: 2.5cm; size: auto; }
            body { font-family: 'Georgia', serif; color: #000; line-height: 1.5; padding: 20px; }
            h1 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 40px; }
            h2 { border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 40px; }
            .toc-entry { display: flex; align-items: baseline; margin-bottom: 6px; }
            .toc-dots { flex: 1; border-bottom: 1px dotted #000; margin: 0 5px; opacity: 0.5; }
            .level-1 { font-weight: bold; margin-top: 15px; }
            .level-2 { margin-left: 25px; }
            .level-3 { margin-left: 50px; font-style: italic; }
            .index-columns { column-count: 2; column-gap: 40px; }
            .index-entry { margin-bottom: 8px; break-inside: avoid; font-size: 10pt; }
            .page-break { page-break-after: always; }
          </style>
        </head>
        <body>
          <h1>Textbook Analysis</h1>
          <h2>Table of Contents</h2>
          <div class="toc-list">
            ${data.toc.map(t => `
              <div class="toc-entry level-${t.level}">
                <span>${t.title}</span><span class="toc-dots"></span><span>${t.pageNumber}</span>
              </div>
            `).join('')}
          </div>
          <div class="page-break"></div>
          <h2>Alphabetical Index</h2>
          <div class="index-columns">
            ${data.index.map(i => `
              <div class="index-entry">
                <strong>${i.term}</strong>: ${i.pageNumbers.join(', ')}
                ${i.context ? `<br><em style="color:#666;font-size:0.9em">${i.context}</em>` : ''}
              </div>
            `).join('')}
          </div>
          <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
        </body>
        </html>
      `;
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      return;
    }

    // 2. Text Export Logic
    let content = '';
    let mimeType = '';
    let filename = '';

    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
      filename = 'textbook-analysis.json';
    } else if (format === 'md') {
      content = `# Table of Contents\n\n`;
      data.toc.forEach(t => content += `${'  '.repeat(t.level - 1)}- ${t.title} (p. ${t.pageNumber})\n`);
      content += `\n# Index\n\n`;
      data.index.forEach(i => content += `- **${i.term}**: ${i.pageNumbers.join(', ')}\n`);
      mimeType = 'text/markdown';
      filename = 'textbook-analysis.md';
    } else if (format === 'csv') {
      content = 'Term,Page Numbers,Context\n';
      data.index.forEach(i => content += `"${i.term}","${i.pageNumbers.join(';')}", "${i.context || ''}"\n`);
      mimeType = 'text/csv';
      filename = 'index-export.csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-5xl mx-auto bg-zinc-900 border border-white/10 rounded-xl overflow-hidden flex flex-col h-[650px] shadow-2xl shadow-black/50">
      {/* Header / Tabs */}
      <div className="bg-black/40 border-b border-white/5 p-4 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-20">
        <div className="flex bg-white/5 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('toc')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ${
              activeTab === 'toc' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Book size={14} /> Table of Contents
          </button>
          <button
            onClick={() => setActiveTab('index')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ${
              activeTab === 'index' 
                ? 'bg-zinc-800 text-white shadow-sm' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <List size={14} /> Index
          </button>
        </div>

        <div className="flex items-center gap-2">
           <div className="relative group">
              <button 
                disabled={isGeneratingPdf}
                className={`flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors ${isGeneratingPdf ? 'opacity-70 cursor-wait' : ''}`}
              >
                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 
                {isGeneratingPdf ? 'Building PDF...' : 'Export'}
              </button>
              
              {!isGeneratingPdf && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-zinc-900 rounded-lg shadow-xl border border-white/10 hidden group-hover:block z-50 overflow-hidden">
                  <button onClick={() => downloadData('pdf')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5">
                    {originalFile?.type === 'application/pdf' ? 'Full PDF' : 'PDF Report'}
                  </button>
                  <button onClick={() => downloadData('json')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors">JSON</button>
                  <button onClick={() => downloadData('md')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors">Markdown</button>
                  <button onClick={() => downloadData('csv')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors">CSV</button>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative bg-black/20">
        {activeTab === 'toc' ? (
          <div className="h-full overflow-y-auto p-8 space-y-1">
            {data.toc.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <p>No content generated.</p>
              </div>
            ) : (
              data.toc.map((item, idx) => (
                <div 
                  key={idx} 
                  className={`
                    flex justify-between items-baseline py-3 border-b border-dashed border-white/5 hover:bg-white/[0.02] px-3 rounded transition-colors
                    ${item.level === 1 ? 'font-medium text-white mt-6 mb-2 border-white/10' : ''}
                    ${item.level === 2 ? 'pl-8 text-gray-300 font-light' : ''}
                    ${item.level === 3 ? 'pl-16 text-gray-500 text-sm font-light' : ''}
                  `}
                >
                  <span className="tracking-wide">{item.title}</span>
                  <span className="text-gray-600 text-xs font-mono shrink-0 ml-4">{item.pageNumber}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
             <div className="p-4 border-b border-white/5 bg-black/40 sticky top-0 z-10 backdrop-blur-md">
                <div className="relative max-w-md mx-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                  <input 
                    type="text" 
                    placeholder="Search terms..." 
                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-gray-200 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all placeholder:text-gray-600"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
             </div>
             <div className="flex-1 overflow-y-auto p-8">
                {filteredIndex.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600">
                    <p>No matching terms.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
                    {filteredIndex.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start py-3 border-b border-white/5 hover:bg-white/[0.02] px-2 rounded group transition-colors">
                        <div className="pr-4">
                          <span className="text-gray-300 font-light tracking-wide group-hover:text-white transition-colors">{item.term}</span>
                          {item.context && <p className="text-[10px] text-gray-600 mt-1 line-clamp-1">{item.context}</p>}
                        </div>
                        <div className="text-right shrink-0 max-w-[40%] flex flex-wrap justify-end gap-1">
                          {item.pageNumbers.map((p, pIdx) => (
                            <span key={pIdx} className="inline-block bg-white/5 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-mono hover:bg-white/10 hover:text-gray-300 cursor-default transition-colors">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
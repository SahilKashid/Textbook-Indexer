import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { Download, Book, List, Search, Loader2, ChevronRight, Hash } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, PDFName, PDFPage, PDFArray } from 'pdf-lib';

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
      // Load original without fontkit since we are only using StandardFonts for additions
      const originalPdf = await PDFDocument.load(originalPdfBytes);
      
      const newPdf = await PDFDocument.create();

      // --- FONT LOADING ---
      // User requested to remove external font fetching and use fallback (StandardFonts)
      const font = await newPdf.embedFont(StandardFonts.Helvetica);
      const boldFont = await newPdf.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await newPdf.embedFont(StandardFonts.HelveticaOblique);

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
        // Since we are using StandardFonts (WinAnsi), we must replace unsupported characters
        return text.replace(/[\n\r]+/g, ' ')
           .replace(/–|—/g, '-')
           .replace(/“|”/g, '"')
           .replace(/’/g, "'")
           .replace(/[^\x20-\x7E]/g, '');
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
         
         // Create a link annotation that is invisible (no border)
         const linkDict = newPdf.context.obj({
             Type: 'Annot',
             Subtype: 'Link',
             // Adjust rect to better cover the text (slightly lower bottom to catch descenders)
             Rect: [x, y - 2, x + w, y + h + 2], 
             Border: [0, 0, 0], // No visual border
             Dest: [targetPage.ref, 'XYZ', null, null, null], // Go to page, maintain zoom
         });
         
         const linkRef = newPdf.context.register(linkDict);
         
         const pageNode = page.node;
         let annots = pageNode.lookup(PDFName.of('Annots'));
         
         if (annots instanceof PDFArray) {
             annots.push(linkRef);
         } else {
             pageNode.set(PDFName.of('Annots'), newPdf.context.obj([linkRef]));
         }
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
             // Level 1 is bold
             const entryFont = entry.level === 1 ? boldFont : font;
             const entrySize = entry.level === 1 ? 12 : 10;
             
             const lines = wrapText(entry.title, availableWidth, entryFont, entrySize);
             lines.forEach(() => {
                if (cursorY < margin) { pages++; cursorY = pageHeight - margin; }
                cursorY -= lineHeight;
             });
             cursorY -= 4; 
         });
         tocPageCount = pages;
      }

      // If NOT using printed page numbers, we shift the displayed page numbers by the ToC count
      // so the document is sequential (ToC pages + Content pages)
      const pageOffset = usePrintedPageNumbers ? 0 : tocPageCount;

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
      const resolveTargetPage = (originalPageNumStr: string | number): number => {
         const p = parseInt(String(originalPageNumStr).replace(/[^0-9]/g, ''));
         if (isNaN(p)) return contentStartIndex; 
         
         // 1-based index from extracted content maps to 0-based index in the appended block
         const target = contentStartIndex + (p - 1);
         if (target > contentEndIndex) return contentEndIndex;
         if (target < contentStartIndex) return contentStartIndex;
         return target;
      };

      // --- STEP 3: GENERATE INDEX (Backside) ---
      
      let indexPage = newPdf.addPage([pageWidth, pageHeight]);
      let cursorY = pageHeight - margin;
      
      // Header: "Index" (was "Alphabetical Index")
      indexPage.drawText('Index', { x: margin, y: cursorY, size: headerSize, font: boldFont });
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
             
             // Estimate height (term lines + 1 line for page nums buffer)
             const totalH = (termLines.length * 11) + 15;

             // Check overflow (New Page/Column if needed)
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
             
             // Draw Term Lines
             termLines.forEach((l, idx) => {
                 indexPage.drawText(l, { x: drawX, y: targetY, size: 10, font: boldFont });
                 // Decrement Y only if it's NOT the last line, so we can try to append page nums to last line
                 if (idx < termLines.length - 1) {
                     targetY -= 11;
                 }
             });

             // Calculate position for page numbers (starting after the last term line)
             const lastLine = termLines[termLines.length - 1];
             const lastLineW = boldFont.widthOfTextAtSize(lastLine, 10);
             let currentX = drawX + lastLineW;

             // Add separator (double space)
             currentX += 8; 

             // Draw Page Numbers
             const pageNums = item.pageNumbers;
             pageNums.forEach((pNum, idx) => {
                 const originalPageStr = String(pNum);
                 
                 // Calculate Display Page Number
                 let displayPageStr = originalPageStr;
                 const pInt = parseInt(originalPageStr);
                 if (!isNaN(pInt)) {
                    displayPageStr = (pInt + pageOffset).toString();
                 }

                 const isLast = idx === pageNums.length - 1;
                 const suffix = isLast ? "" : ", ";
                 const textToDraw = displayPageStr + suffix;
                 
                 const textW = font.widthOfTextAtSize(textToDraw, 10);
                 
                 // Wrap if needed
                 if (currentX + textW > drawX + colWidth) {
                     targetY -= 11;
                     currentX = drawX + 10; // Indent wrapped page numbers
                 }
                 
                 // Check if we hit bottom margin mid-item (rare but possible)
                 if (targetY < margin) {
                    // Logic to handle mid-item break would be here, skipping for simplicity
                 }

                 // Draw Number
                 indexPage.drawText(displayPageStr, { x: currentX, y: targetY, size: 10, font });
                 
                 // Link
                 const numW = font.widthOfTextAtSize(displayPageStr, 10);
                 const targetIdx = resolveTargetPage(originalPageStr);
                 addLink(indexPage, currentX, targetY - 2, numW, 12, targetIdx);

                 // Draw Suffix
                 if (!isLast) {
                     indexPage.drawText(", ", { x: currentX + numW, y: targetY, size: 10, font });
                 }

                 currentX += textW;
             });
             
             targetY -= 14; // Spacing after item

             if (currentCol === 0) y0 = targetY; else y1 = targetY;
         });
         
         if (currentCol === 0) y0 -= 10; else y1 -= 10;
      });


      // --- STEP 4: FILL TOC (Frontside) ---
      
      const tocPages = newPdf.getPages().slice(0, tocPageCount);
      let tocPageIndex = 0;
      let currentTocPage = tocPages[0];
      cursorY = pageHeight - margin;

      currentTocPage.drawText('Table of Contents', { 
          x: pageWidth / 2 - boldFont.widthOfTextAtSize('Table of Contents', headerSize) / 2, 
          y: cursorY, 
          size: headerSize, 
          font: boldFont 
      });
      cursorY -= 50;

      data.toc.forEach(entry => {
         // Level 1: Bold, Size 12. Level 2+: Regular, Size 10.
         const entryFont = entry.level === 1 ? boldFont : font;
         const entrySize = entry.level === 1 ? 12 : 10;
         const indent = (entry.level - 1) * 15;
         const numWidth = 30;
         const titleWidth = contentWidth - indent - numWidth - 10; 

         const lines = wrapText(entry.title, titleWidth, entryFont, entrySize);
         
         const originalPageStr = String(entry.pageNumber);
         // Calculate Display Page Number
         let displayPageStr = originalPageStr;
         const pInt = parseInt(originalPageStr);
         if (!isNaN(pInt)) {
            displayPageStr = (pInt + pageOffset).toString();
         }

         const targetIdx = resolveTargetPage(originalPageStr);

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
           
           if (idx === lines.length - 1) {
             const titleLineWidth = entryFont.widthOfTextAtSize(line, entrySize);
             const startDotX = margin + indent + titleLineWidth + 5;
             const endDotX = pageWidth - margin - 35; 
             
             if (endDotX > startDotX) {
                const dot = ".";
                const dotW = font.widthOfTextAtSize(dot, 10);
                const spaceAvailable = endDotX - startDotX;
                const dotCount = Math.floor(spaceAvailable / (dotW + 2));
                const dots = Array(dotCount).fill(".").join(" ");
                currentTocPage.drawText(dots, { x: startDotX, y: cursorY, size: 8, font, color: rgb(0.5,0.5,0.5) });
             }

             // Draw Displayed Page Number
             const pWidth = font.widthOfTextAtSize(displayPageStr, entrySize);
             currentTocPage.drawText(displayPageStr, { x: pageWidth - margin - pWidth, y: cursorY, size: entrySize, font: entryFont });

             // ADD LINK covering the whole entry line
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
      a.download = originalFile.name.replace('.pdf', '_indexed.pdf');
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
          <h2>Index</h2>
          <div class="index-columns">
            ${data.index.map(i => `
              <div class="index-entry">
                <strong>${i.term}</strong>: ${i.pageNumbers.join(', ')}
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
      content = 'Term,Page Numbers\n';
      data.index.forEach(i => content += `"${i.term}","${i.pageNumbers.join(';')}"\n`);
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
    <div className="w-full h-full bg-[#0A0A0A] border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-2xl shadow-black/80 ring-1 ring-white/[0.02]">
      {/* Header Area */}
      <div className="relative z-20 bg-black/40 border-b border-white/5 px-4 h-16 flex items-center justify-between gap-4 backdrop-blur-md">
        
        {/* Modern Tabs */}
        <div className="flex bg-white/[0.03] p-1 rounded-lg border border-white/[0.02]">
          <button
            onClick={() => setActiveTab('toc')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
              activeTab === 'toc' 
                ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-white/5' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Book size={13} /> Table of Contents
          </button>
          <button
            onClick={() => setActiveTab('index')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
              activeTab === 'index' 
                ? 'bg-zinc-800 text-white shadow-sm ring-1 ring-white/5' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <List size={13} /> Index
          </button>
        </div>

        {/* Action Area */}
        <div className="flex items-center gap-3">
          {activeTab === 'index' && (
             <div className="relative group hidden sm:block">
               <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-white transition-colors" size={13} />
               <input 
                 type="text" 
                 placeholder="Filter terms..." 
                 className="w-48 pl-8 pr-3 py-1.5 bg-black/20 border border-white/10 rounded-full text-xs text-gray-200 focus:outline-none focus:border-white/20 focus:bg-white/5 transition-all placeholder:text-gray-600 focus:w-64"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
          )}

           <div className="relative group z-30">
              <button 
                disabled={isGeneratingPdf}
                className={`flex items-center gap-2 px-4 py-1.5 bg-white text-black hover:bg-gray-200 rounded-lg text-xs font-medium transition-colors ${isGeneratingPdf ? 'opacity-70 cursor-wait' : ''}`}
              >
                {isGeneratingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 
                {isGeneratingPdf ? 'Building PDF...' : 'Export'}
              </button>
              
              {!isGeneratingPdf && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-[#111] rounded-xl shadow-2xl border border-white/10 hidden group-hover:block overflow-hidden backdrop-blur-xl">
                  <div className="p-1">
                    <button onClick={() => downloadData('pdf')} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors rounded-lg flex items-center justify-between group/item">
                      {originalFile?.type === 'application/pdf' ? 'Merged PDF' : 'PDF Report'}
                    </button>
                    <div className="h-px bg-white/5 my-1 mx-2"></div>
                    <button onClick={() => downloadData('json')} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors rounded-lg">JSON Data</button>
                    <button onClick={() => downloadData('md')} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors rounded-lg">Markdown</button>
                    <button onClick={() => downloadData('csv')} className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors rounded-lg">CSV Spreadsheet</button>
                  </div>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative bg-black/20">
        {activeTab === 'toc' ? (
          <div className="h-full overflow-y-auto p-8 custom-scrollbar">
            {data.toc.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                <Book size={32} className="opacity-20" />
                <p className="text-sm font-light">No chapters detected.</p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-1">
                {data.toc.map((item, idx) => (
                  <div 
                    key={idx} 
                    className={`
                      relative flex items-baseline py-2 px-4 rounded-lg group hover:bg-white/[0.02] transition-colors
                      ${item.level === 1 ? 'mt-6 mb-2' : ''}
                    `}
                  >
                    {/* Visual Hierarchy Lines */}
                    {item.level > 1 && (
                      <div className="absolute left-4 top-0 bottom-1/2 w-px bg-white/5 border-l border-dashed border-white/10"></div>
                    )}
                    {item.level > 1 && (
                       <div className="absolute left-4 top-1/2 w-3 h-px bg-white/10"></div>
                    )}
                    
                    <div 
                        className={`flex-1 flex items-baseline gap-4 ${item.level === 1 ? 'ml-0' : item.level === 2 ? 'ml-8' : 'ml-16'}`}
                    >
                      <span className={`tracking-wide ${item.level === 1 ? 'text-sm font-medium text-white' : 'text-xs text-gray-400 group-hover:text-gray-200'}`}>
                        {item.title}
                      </span>
                      
                      {/* Dotted Leader */}
                      <div className="flex-1 border-b border-dashed border-white/10 opacity-30 mx-2 relative top-[-4px]"></div>
                      
                      <span className={`font-mono text-[10px] ${item.level === 1 ? 'text-white' : 'text-gray-600 group-hover:text-gray-400'}`}>
                        {item.pageNumber}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
             {/* Mobile Search Bar (Only shows on small screens if needed, but keeping unified in header for now) */}
             <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                {filteredIndex.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                    <Search size={32} className="opacity-20" />
                    <p className="text-sm font-light">No matching terms found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredIndex.map((item, idx) => (
                      <div key={idx} className="flex flex-col p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{item.term}</span>
                          <div className="flex flex-wrap justify-end gap-1 ml-2 max-w-[50%]">
                             {item.pageNumbers.slice(0, 3).map((p, pIdx) => (
                                <span key={pIdx} className="inline-block bg-white/5 text-gray-500 text-[10px] px-1.5 py-0.5 rounded font-mono border border-white/5">
                                  {p}
                                </span>
                             ))}
                             {item.pageNumbers.length > 3 && (
                               <span className="text-[10px] text-gray-600 px-1">+{item.pageNumbers.length - 3}</span>
                             )}
                          </div>
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
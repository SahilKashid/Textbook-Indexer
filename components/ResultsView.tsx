import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { Download, Book, List, Search, Loader2 } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
      const newPdf = await PDFDocument.create();

      // Embed Font
      const font = await newPdf.embedFont(StandardFonts.Helvetica);
      const boldFont = await newPdf.embedFont(StandardFonts.HelveticaBold);
      const fontSize = 11;
      const lineHeight = 15;
      const pageWidth = 595.28; // A4 width
      const pageHeight = 841.89; // A4 height
      const margin = 50;
      const contentWidth = pageWidth - (margin * 2);

      // --- HELPERS ---
      
      const wrapText = (text: string, maxWidth: number, font: any, size: number): string[] => {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          const width = font.widthOfTextAtSize(currentLine + " " + word, size);
          if (width < maxWidth) {
            currentLine += " " + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        lines.push(currentLine);
        return lines;
      };

      // --- CALCULATE TOC SIZE FOR OFFSET ---
      
      // We simulate rendering the ToC to count how many pages it takes.
      // This is necessary because inserting ToC at the start shifts the original content.
      // If usePrintedPageNumbers is FALSE (Sequential), we must offset the page numbers in the new PDF.
      // If TRUE, we keep the visual numbers as is.
      
      let tocPageCount = 0;
      let y = 0; // Simulated Y cursor
      const simulateToc = () => {
         let pages = 1;
         let cursorY = pageHeight - margin - 40; // Start after header
         
         data.toc.forEach(entry => {
             // Title wrapping
             const indent = (entry.level - 1) * 20;
             const availableWidth = contentWidth - indent - 40; // 40 for page num
             const lines = wrapText(entry.title, availableWidth, entry.level === 1 ? boldFont : font, fontSize);
             
             lines.forEach(() => {
                if (cursorY < margin) {
                    pages++;
                    cursorY = pageHeight - margin;
                }
                cursorY -= lineHeight;
             });
             cursorY -= 4; // spacing
         });
         return pages;
      };
      
      tocPageCount = simulateToc();
      
      // If using Sequential numbers (file index), page 1 becomes page (1 + tocPageCount).
      const pageOffset = usePrintedPageNumbers ? 0 : tocPageCount;

      // --- RENDER TOC ---
      
      let currentPage = newPdf.addPage([pageWidth, pageHeight]);
      let cursorY = pageHeight - margin;
      
      // ToC Header
      currentPage.drawText('Table of Contents', { x: margin, y: cursorY, size: 24, font: boldFont });
      cursorY -= 40;

      data.toc.forEach(entry => {
         const entryFont = entry.level === 1 ? boldFont : font;
         const indent = (entry.level - 1) * 20;
         const numWidth = 30;
         const titleWidth = contentWidth - indent - numWidth;

         const lines = wrapText(entry.title, titleWidth, entryFont, fontSize);
         
         // Parse page number to see if we can apply offset
         let displayPage = entry.pageNumber.toString();
         if (pageOffset > 0) {
            const num = parseInt(displayPage);
            if (!isNaN(num)) {
               displayPage = (num + pageOffset).toString();
            }
         }

         lines.forEach((line, idx) => {
           if (cursorY < margin) {
             currentPage = newPdf.addPage([pageWidth, pageHeight]);
             cursorY = pageHeight - margin;
           }

           currentPage.drawText(line, { x: margin + indent, y: cursorY, size: fontSize, font: entryFont });
           
           // Draw dots and page number only on the last line of the title
           if (idx === lines.length - 1) {
             const lineWidth = entryFont.widthOfTextAtSize(line, fontSize);
             // Dots
             if (entry.level === 1) {
                // No dots for chapters usually, or keep it clean
             } else {
                 // Simple dots
                 // const startDot = margin + indent + lineWidth + 5;
                 // const endDot = pageWidth - margin - numWidth;
                 // if (endDot > startDot) currentPage.drawText('. . . . . . . .', { x: startDot, y: cursorY, size: 10, font });
             }
             
             // Page Num
             const pWidth = font.widthOfTextAtSize(displayPage, fontSize);
             currentPage.drawText(displayPage, { x: pageWidth - margin - pWidth, y: cursorY, size: fontSize, font });
           }

           cursorY -= lineHeight;
         });
         cursorY -= 4; // Extra spacing between entries
      });

      // --- APPEND ORIGINAL PDF ---
      
      const copiedPages = await newPdf.copyPages(originalPdf, originalPdf.getPageIndices());
      copiedPages.forEach((page) => newPdf.addPage(page));

      // --- RENDER INDEX ---

      currentPage = newPdf.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
      
      // Index Header
      currentPage.drawText('Index', { x: margin, y: cursorY, size: 24, font: boldFont });
      cursorY -= 40;

      // Two column layout for Index
      const colGap = 20;
      const colWidth = (contentWidth - colGap) / 2;
      let currentCol = 0; // 0 or 1
      let colY = cursorY; // Track Y for columns independently if needed, but usually we flow down

      // We flow down column 0, then column 1, then new page.
      // Easier strategy: Just fill strictly line by line but calculate X based on column? 
      // No, that makes reading hard. We need to fill Col 1 then Col 2.
      // But we have unknown height.
      // Strategy: Render one item at a time. If it fits in Col 0, place it. If not, go to Col 1. If Col 1 full, new page -> Col 0.

      // Reset Y
      let y0 = cursorY;
      let y1 = cursorY;
      
      const addToIndex = (term: string, pages: string[], context?: string) => {
         const pageStr = pages.map(p => {
             if (pageOffset > 0) {
                 const n = parseInt(p.toString());
                 return isNaN(n) ? p : (n + pageOffset);
             }
             return p;
         }).join(', ');
         
         const fullText = `${term}: ${pageStr}`;
         const contextText = context ? `(${context})` : null;

         const termLines = wrapText(fullText, colWidth, boldFont, 10);
         const contextLines = contextText ? wrapText(contextText, colWidth, font, 9) : [];
         
         const totalHeight = (termLines.length * 12) + (contextLines.length * 11) + 6; // 12/11 leading + padding

         // Check availability in current column
         let targetY = (currentCol === 0) ? y0 : y1;

         if (targetY - totalHeight < margin) {
             // Column full
             if (currentCol === 0) {
                 currentCol = 1;
                 targetY = cursorY; // Reset to top
                 // Update y1
                 y1 = cursorY;
             } else {
                 // Page full
                 currentPage = newPdf.addPage([pageWidth, pageHeight]);
                 cursorY = pageHeight - margin;
                 y0 = cursorY;
                 y1 = cursorY;
                 currentCol = 0;
                 targetY = cursorY;
             }
         }

         // Draw
         const xBase = margin + (currentCol * (colWidth + colGap));
         let drawY = targetY;

         termLines.forEach(l => {
             currentPage.drawText(l, { x: xBase, y: drawY, size: 10, font: boldFont });
             drawY -= 12;
         });
         
         if (contextLines.length > 0) {
             contextLines.forEach(l => {
                 currentPage.drawText(l, { x: xBase, y: drawY, size: 9, font: font, color: rgb(0.4, 0.4, 0.4) });
                 drawY -= 11;
             });
         }

         // Update cursor
         drawY -= 6; // padding
         if (currentCol === 0) y0 = drawY;
         else y1 = drawY;
      };

      data.index.forEach(item => {
          addToIndex(item.term, item.pageNumbers.map(String), item.context);
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
        alert("Failed to generate PDF. See console for details.");
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
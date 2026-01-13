import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { Download, Book, List, Search } from 'lucide-react';

interface ResultsViewProps {
  data: AnalysisResult;
}

export const ResultsView: React.FC<ResultsViewProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'toc' | 'index'>('toc');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredIndex = data.index.filter(item => 
    item.term.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const downloadData = (format: 'json' | 'md' | 'csv' | 'pdf') => {
    if (format === 'pdf') {
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
            @page { 
              margin: 2.5cm; 
              size: auto;
            }
            body { 
              font-family: 'Georgia', 'Times New Roman', serif; 
              color: #000; 
              line-height: 1.5; 
              max-width: 100%;
              margin: 0;
              padding: 20px;
            }
            h1 { 
              text-align: center; 
              font-size: 24pt; 
              border-bottom: 2px solid #000; 
              padding-bottom: 20px; 
              margin-bottom: 40px; 
            }
            h2 { 
              font-size: 18pt; 
              margin-top: 40px; 
              margin-bottom: 20px; 
              border-bottom: 1px solid #ccc;
              padding-bottom: 5px;
            }
            
            /* ToC Styles */
            .toc-list { margin-bottom: 40px; }
            .toc-entry { 
              display: flex; 
              align-items: baseline; 
              margin-bottom: 6px; 
            }
            .toc-title { position: relative; background: #fff; padding-right: 5px; z-index: 1; }
            .toc-dots { 
              flex: 1; 
              border-bottom: 1px dotted #000; 
              margin: 0 5px; 
              position: relative; 
              top: -4px; 
              opacity: 0.5;
            }
            .toc-page { font-variant-numeric: tabular-nums; background: #fff; padding-left: 5px; z-index: 1; }
            
            .level-1 { font-weight: bold; margin-top: 15px; font-size: 12pt; }
            .level-2 { margin-left: 25px; font-size: 11pt; }
            .level-3 { margin-left: 50px; font-style: italic; font-size: 10pt; color: #444; }

            /* Index Styles */
            .index-columns { 
              column-count: 2; 
              column-gap: 40px; 
            }
            .index-entry { 
              margin-bottom: 8px; 
              break-inside: avoid; 
              font-size: 10pt;
            }
            .term { font-weight: bold; }
            .pages { color: #444; }
            .context { 
              display: block; 
              font-size: 0.85em; 
              color: #666; 
              margin-top: 2px; 
              font-style: italic; 
              line-height: 1.2;
            }

            .page-break { page-break-after: always; }
            
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Textbook Analysis</h1>
          
          <h2>Table of Contents</h2>
          <div class="toc-list">
            ${data.toc.map(t => `
              <div class="toc-entry level-${t.level}">
                <span class="toc-title">${t.title}</span>
                <span class="toc-dots"></span>
                <span class="toc-page">${t.pageNumber}</span>
              </div>
            `).join('')}
          </div>

          <div class="page-break"></div>

          <h2>Alphabetical Index</h2>
          <div class="index-columns">
            ${data.index.map(i => `
              <div class="index-entry">
                <span class="term">${i.term}</span>
                <span class="pages"> ${i.pageNumbers.join(', ')}</span>
                ${i.context ? `<span class="context">${i.context}</span>` : ''}
              </div>
            `).join('')}
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                // Optional: window.close();
              }, 500);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      return;
    }

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
              <button className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">
                <Download size={14} /> Export
              </button>
              <div className="absolute right-0 top-full mt-2 w-32 bg-zinc-900 rounded-lg shadow-xl border border-white/10 hidden group-hover:block z-50 overflow-hidden">
                <button onClick={() => downloadData('pdf')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5">PDF</button>
                <button onClick={() => downloadData('json')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors">JSON</button>
                <button onClick={() => downloadData('md')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors">Markdown</button>
                <button onClick={() => downloadData('csv')} className="w-full text-left px-4 py-3 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors">CSV</button>
              </div>
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
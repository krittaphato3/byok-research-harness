import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  FileText,
  Printer,
  Code,
} from 'lucide-react';

interface ReportExportBarProps {
  runId?: string | null;
  content: string;
  evidenceCount: number;
  wordCount?: number;
}

export const ReportExportBar: React.FC<ReportExportBarProps> = ({
  runId,
  content,
  evidenceCount,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const chars = content.length;

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = (format: 'markdown' | 'html' | 'json') => {
    if (!runId) {
      // Client-side fallback if runId not yet available
      let mime = 'text/markdown';
      let ext = 'md';
      let data = content;

      if (format === 'html') {
        mime = 'text/html';
        ext = 'html';
        data = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Research Report</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;}</style></head><body><h1>Research Report</h1><div>${content.replace(/\n/g, '<br/>')}</div></body></html>`;
      } else if (format === 'json') {
        mime = 'application/json';
        ext = 'json';
        data = JSON.stringify({ report: content, words, chars }, null, 2);
      }

      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `research-report.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Server-side robust export
    setIsExporting(true);
    const link = document.createElement('a');
    link.href = `/api/runs/${runId}/export/${format}`;
    link.setAttribute('download', `research-${runId}.${format === 'markdown' ? 'md' : format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setIsExporting(false), 500);
  };

  const handlePrint = () => {
    if (runId) {
      window.open(`/api/runs/${runId}/export/html`, '_blank');
    } else {
      window.print();
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-6 border-t border-[#282a2c] text-xs">
      {/* Telemetry and Size Stats */}
      <div className="flex items-center space-x-3 text-zinc-400 font-mono text-[11px]">
        <span className="flex items-center space-x-1">
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          <span>{words.toLocaleString()} words</span>
        </span>
        <span>•</span>
        <span>{chars.toLocaleString()} chars</span>
        <span>•</span>
        <span className="text-emerald-400 font-medium">
          {evidenceCount} verified sources
        </span>
      </div>

      {/* Export Action Controls */}
      <div className="flex items-center space-x-2">
        {/* Copy Button */}
        <button
          onClick={handleCopyMarkdown}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#282a2c] hover:bg-[#34373a] text-zinc-300 hover:text-white transition-all text-xs font-medium border border-[#3c4043]"
          title="Copy markdown text"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>

        {/* Download Markdown */}
        <button
          onClick={() => handleDownload('markdown')}
          disabled={isExporting}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#282a2c] hover:bg-[#34373a] text-zinc-300 hover:text-white transition-all text-xs font-medium border border-[#3c4043]"
          title="Download report as Markdown file (.md)"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export .MD</span>
        </button>

        {/* Print / Save PDF */}
        <button
          onClick={handlePrint}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#282a2c] hover:bg-[#34373a] text-zinc-300 hover:text-white transition-all text-xs font-medium border border-[#3c4043]"
          title="Open printable publication report or Save to PDF"
        >
          <Printer className="w-3.5 h-3.5 text-amber-400" />
          <span>Print / PDF</span>
        </button>

        {/* Export JSON Dossier */}
        <button
          onClick={() => handleDownload('json')}
          disabled={isExporting}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#282a2c] hover:bg-[#34373a] text-zinc-300 hover:text-white transition-all text-xs font-medium border border-[#3c4043]"
          title="Download complete structured JSON research dossier"
        >
          <Code className="w-3.5 h-3.5 text-purple-400" />
          <span>JSON Dossier</span>
        </button>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-body text-[#e3e3e3] leading-relaxed text-sm select-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold tracking-tight text-white mt-6 mb-3 border-b border-[#282a2c] pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold text-white mt-5 mb-2.5 flex items-center space-x-2">
              <span className="w-1.5 h-4 rounded-full bg-cyan-400 inline-block mr-2" />
              <span>{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-zinc-100 mt-4 mb-2">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-zinc-200 mt-3 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed text-zinc-300 text-sm">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-white tracking-wide">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-zinc-200 font-serif">
              {children}
            </em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-5 space-y-1.5 my-3 text-zinc-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-5 space-y-1.5 my-3 text-zinc-300">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-1 leading-relaxed">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-cyan-400/80 pl-4 py-1.5 my-4 bg-[#18191b] rounded-r-xl italic text-zinc-300 border-dashed">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-6 border-[#282a2c]" />
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 font-medium transition-colors"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 border border-[#3c4043] rounded-2xl shadow-md bg-[#161718]">
              <table className="min-w-full divide-y divide-[#282a2c] text-xs font-sans">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#1f2022] border-b border-[#2c2d30]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-bold text-white tracking-wider uppercase text-[11px]">
              {children}
            </th>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#242628] bg-[#141517]">
              {children}
            </tbody>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 text-zinc-300">
              {children}
            </td>
          ),
          code: ({ inline, className, children }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            if (inline) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-[#242628] text-cyan-300 font-mono text-xs border border-[#3c4043]">
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={lang} code={codeString}>
                {children}
              </CodeBlock>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

interface CodeBlockProps {
  language: string;
  code: string;
  children: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy code', e);
    }
  };

  return (
    <div className="relative rounded-2xl border border-[#3c4043] bg-[#121314] my-4 overflow-hidden shadow-lg group">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1b1d] border-b border-[#282a2c] text-xs text-zinc-400 font-mono">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-1 rounded-md hover:bg-[#282a2c] text-zinc-400 hover:text-white transition-colors"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <pre className="p-4 overflow-x-auto text-xs text-zinc-200 font-mono leading-relaxed bg-[#101112]">
        {children}
      </pre>
    </div>
  );
};

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onCitationClick?: (citation: string, url?: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  onCitationClick,
}) => {
  const renderWithCitations = (children: React.ReactNode) => {
    return React.Children.map(children, (child) => {
      if (typeof child === 'string') {
        const parts = child.split(/(\[\d+(?:,\s*\d+)*\]|\[Source\s*\d+\]|\[chk_[a-zA-Z0-9_-]+\])/g);
        if (parts.length > 1) {
          return parts.map((part, pIdx) => {
            const isCitation = /^(\[\d+(?:,\s*\d+)*\]|\[Source\s*\d+\]|\[chk_[a-zA-Z0-9_-]+\])$/.test(part);
            if (isCitation) {
              return (
                <button
                  key={pIdx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onCitationClick) {
                      onCitationClick(part);
                    }
                  }}
                  className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded-full bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-mono text-[11px] font-semibold transition-all hover:scale-105 cursor-pointer shadow-sm"
                  title={`View verified evidence chunk for ${part}`}
                >
                  {part}
                </button>
              );
            }
            return part;
          });
        }
      }
      return child;
    });
  };

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
              {renderWithCitations(children)}
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
              {renderWithCitations(children)}
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
          a: ({ href, children }) => {
            const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                onClick={() => {
                  if (onCitationClick && href) {
                    onCitationClick(String(children), href);
                  }
                }}
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline underline-offset-4 font-medium transition-colors cursor-pointer"
              >
                <span>{children}</span>
                {isExternal && <ExternalLink className="w-3 h-3 inline-block opacity-70" />}
              </a>
            );
          },
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
            <tbody className="divide-y divide-[#282a2c] text-zinc-300">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#1d1e20] transition-colors">
              {children}
            </tr>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 whitespace-normal leading-relaxed text-zinc-300">
              {renderWithCitations(children)}
            </td>
          ),
          pre: ({ children }) => (
            <div className="relative my-4 rounded-2xl overflow-hidden border border-[#3c4043] bg-[#0d0e0f] shadow-lg">
              {children}
            </div>
          ),
          code: ({ inline, className: codeClassName, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const lang = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            if (inline) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-[#242629] text-amber-300 font-mono text-xs border border-[#383a3d]">
                  {children}
                </code>
              );
            }

            return (
              <CodeBlockWithCopy language={lang} code={codeString}>
                <code className={`block p-4 font-mono text-xs text-zinc-200 overflow-x-auto ${codeClassName || ''}`} {...props}>
                  {children}
                </code>
              </CodeBlockWithCopy>
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

const CodeBlockWithCopy: React.FC<CodeBlockProps> = ({ language, code, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 bg-[#17181a] border-b border-[#282a2c] text-[11px] font-mono text-zinc-400">
        <span className="uppercase tracking-wider">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-[#282a2c] text-zinc-400 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-sans">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="font-sans">Copy</span>
            </>
          )}
        </button>
      </div>
      {children}
    </div>
  );
};

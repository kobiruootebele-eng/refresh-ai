'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RefreshInput } from '@/lib/types';

type EnrichTab = 'file' | 'media' | 'text';

const FEATURES = [
  {
    icon: '🔍',
    title: 'SERP Research',
    desc: "Scrapes Google's top 10 results for your keyword",
  },
  {
    icon: '📊',
    title: 'Gap Analysis',
    desc: 'Identifies every topic your article is missing',
  },
  {
    icon: '✍️',
    title: 'Full Rewrite',
    desc: 'Delivers publish-ready content, not bullet points',
  },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [enrichmentOpen, setEnrichmentOpen] = useState(false);
  const [enrichmentTab, setEnrichmentTab] = useState<EnrichTab>('file');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');

    try {
      const input: RefreshInput = { url: trimmed };

      if (enrichmentOpen) {
        if ((enrichmentTab === 'file' || enrichmentTab === 'media') && selectedFile) {
          const base64 = await fileToBase64(selectedFile);
          input.enrichmentType = enrichmentTab;
          input.enrichmentContent = base64;
          input.enrichmentFileName = selectedFile.name;
          input.enrichmentMimeType = selectedFile.type;
        } else if (enrichmentTab === 'text' && textContent.trim()) {
          input.enrichmentType = 'text';
          input.enrichmentContent = textContent.trim();
        }
      }

      sessionStorage.setItem('refreshai_input', JSON.stringify(input));
      router.push('/refresh');
    } catch {
      setError('Failed to process the file. Please try again.');
      setLoading(false);
    }
  };

  const tabLabel: Record<EnrichTab, string> = {
    file: 'Document',
    media: 'Media File',
    text: 'Paste Text',
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white overflow-hidden relative">
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.25) 0%, transparent 70%)',
        }}
      />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-20">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-14">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg">
            ↻
          </div>
          <span className="text-xl font-semibold tracking-tight">RefreshAI</span>
        </div>

        {/* Hero */}
        <div className="text-center mb-12 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-300 text-sm font-medium mb-6">
            <span
              className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
              style={{ animation: 'pulse-dot 1.2s ease-in-out infinite' }}
            />
            AI-Powered Content Refresh
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight mb-5">
            Turn stale content into{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              top-ranking articles
            </span>
          </h1>
          <p className="text-slate-400 text-xl leading-relaxed max-w-xl mx-auto">
            Paste a URL. We research what&apos;s ranking on Google, analyze the gaps, and rewrite
            your article — ready to publish.
          </p>
        </div>

        {/* Form card */}
        <div className="w-full max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* URL + CTA row */}
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yoursite.com/article-to-refresh"
                required
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
              />
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-colors whitespace-nowrap"
                style={{ minWidth: '160px' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4"
                      style={{ animation: 'spin 0.8s linear infinite' }}
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Starting...
                  </span>
                ) : (
                  'Refresh Article →'
                )}
              </button>
            </div>

            {/* Enrichment toggle */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setEnrichmentOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-slate-400 hover:text-slate-200 transition-colors text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="text-indigo-500 font-bold">{enrichmentOpen ? '−' : '+'}</span>
                  Enrich with your own content{' '}
                  <span className="text-slate-600">(optional)</span>
                </span>
                <svg
                  className="w-4 h-4 transition-transform duration-200"
                  style={{ transform: enrichmentOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {enrichmentOpen && (
                <div className="border-t border-slate-800 p-4 space-y-4">
                  {/* Tabs */}
                  <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
                    {(['file', 'media', 'text'] as EnrichTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setEnrichmentTab(tab);
                          setSelectedFile(null);
                        }}
                        className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                        style={{
                          background: enrichmentTab === tab ? '#4f46e5' : 'transparent',
                          color: enrichmentTab === tab ? '#fff' : '#94a3b8',
                        }}
                      >
                        {tabLabel[tab]}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  {enrichmentTab === 'text' ? (
                    <textarea
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Paste your notes, transcript, raw research, or any context you want woven into the article..."
                      rows={5}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  ) : (
                    <div
                      onClick={() =>
                        (enrichmentTab === 'file' ? fileRef : mediaRef).current?.click()
                      }
                      className="border-2 border-dashed border-slate-700 rounded-lg p-7 text-center cursor-pointer transition-all"
                      style={{ userSelect: 'none' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#6366f1';
                        e.currentTarget.style.background = 'rgba(99,102,241,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#334155';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-2 text-indigo-300">
                          <span>📎</span>
                          <span className="text-sm font-medium truncate max-w-xs">
                            {selectedFile.name}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="text-2xl mb-2">
                            {enrichmentTab === 'file' ? '📄' : '🎵'}
                          </div>
                          <p className="text-slate-300 text-sm font-medium">
                            {enrichmentTab === 'file'
                              ? 'Upload a PDF, DOCX, or TXT file'
                              : 'Upload an MP3, MP4, WAV, or M4A file'}
                          </p>
                          <p className="text-slate-600 text-xs mt-1">Click to browse</p>
                        </>
                      )}
                    </div>
                  )}

                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  />
                  <input
                    ref={mediaRef}
                    type="file"
                    accept=".mp3,.mp4,.wav,.m4a,audio/*"
                    className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  />

                  <p className="text-slate-600 text-xs leading-relaxed">
                    Claude will extract key themes, insights, and quotes from your content and weave
                    them naturally into the refreshed article.
                  </p>
                </div>
              )}
            </div>

            {error && <p className="text-red-400 text-sm px-1">{error}</p>}
          </form>
        </div>

        {/* Feature pills */}
        <div className="mt-16 flex flex-wrap justify-center gap-3 max-w-2xl">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3"
            >
              <span className="text-xl">{f.icon}</span>
              <div>
                <div className="text-sm font-semibold text-slate-200">{f.title}</div>
                <div className="text-xs text-slate-500">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline preview */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
          {['Scrape', 'SERP Research', 'Gap Analysis', 'Plan', 'Write', 'Polish'].map(
            (step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span className="bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1">
                  {step}
                </span>
                {i < arr.length - 1 && <span>→</span>}
              </span>
            )
          )}
        </div>

        <p className="mt-8 text-slate-700 text-xs">Powered by Claude · Jina AI · ValueSERP</p>
      </div>
    </main>
  );
}

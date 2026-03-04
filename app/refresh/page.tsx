'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { RefreshInput, PipelineEvent, ResultData } from '@/lib/types';

// ─── Stage definitions ────────────────────────────────────────────────────────

interface StageDef {
  id: string;
  label: string;
}

const STAGE_DEFS: StageDef[] = [
  { id: 'stage1', label: 'Extracting content' },
  { id: 'stage1b', label: 'Researching SERPs' },
  { id: 'stage2', label: 'Analyzing gaps' },
  { id: 'stage3', label: 'Planning refresh' },
  { id: 'stage4', label: 'Writing sections' },
  { id: 'stage5', label: 'Polishing' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageStatus {
  status: 'pending' | 'running' | 'done' | 'error';
  label?: string;
  current?: number;
  total?: number;
}

type StageMap = Record<string, StageStatus>;

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    // Headings
    if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    // List items
    } else if (line.match(/^[-*] /)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineFormat(line.slice(2))}</li>`);
    // Empty line
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<br>');
    // Normal paragraph
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  if (inList) out.push('</ul>');
  return out.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RefreshPage() {
  const [stages, setStages] = useState<StageMap>(() =>
    Object.fromEntries(STAGE_DEFS.map((s) => [s.id, { status: 'pending' as const }]))
  );
  const [result, setResult] = useState<ResultData | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'original' | 'refreshed'>('refreshed');

  const hasStarted = useRef(false);

  const updateStage = useCallback((id: string, updates: Partial<StageStatus>) => {
    setStages((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...updates },
    }));
  }, []);

  const handleEvent = useCallback(
    (event: PipelineEvent) => {
      switch (event.type) {
        case 'stage_start':
          if (event.stage) {
            updateStage(event.stage, {
              status: 'running',
              label: event.label,
              total: event.total,
              current: event.current,
            });
          }
          break;

        case 'stage_progress':
          if (event.stage) {
            updateStage(event.stage, {
              current: event.current,
              total: event.total,
              label: event.label,
            });
          }
          break;

        case 'stage_complete':
          if (event.stage) {
            updateStage(event.stage, { status: 'done' });
          }
          break;

        case 'result':
          setResult(event.data as ResultData);
          break;

        case 'error':
          setPipelineError(event.message ?? 'An unexpected error occurred');
          // Mark any running stage as error
          setStages((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key].status === 'running') {
                next[key] = { ...next[key], status: 'error' };
              }
            }
            return next;
          });
          break;
      }
    },
    [updateStage]
  );

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const raw = sessionStorage.getItem('refreshai_input');
    if (!raw) {
      setPipelineError('No input found. Please go back and enter a URL.');
      return;
    }

    const input: RefreshInput = JSON.parse(raw);

    (async () => {
      try {
        const response = await fetch('/api/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: PipelineEvent = JSON.parse(line.slice(6));
                handleEvent(event);
              } catch {
                // Malformed event — ignore
              }
            }
          }
        }
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Pipeline failed');
      }
    })();
  }, [handleEvent]);

  const handleCopy = async () => {
    if (!result) return;
    const text = `${result.headline}\n\n${result.metaDescription}\n\n${result.article}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRunning = !result && !pipelineError;
  const completedCount = Object.values(stages).filter((s) => s.status === 'done').length;
  const progress = Math.round((completedCount / STAGE_DEFS.length) * 100);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-800 hover:text-indigo-600 transition-colors">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
              ↻
            </div>
            <span className="font-semibold text-sm">RefreshAI</span>
          </Link>

          {/* Stage progress strip */}
          <div className="flex-1 flex items-center justify-center gap-1 overflow-x-auto">
            {STAGE_DEFS.map((def, i) => {
              const s = stages[def.id];
              return (
                <div key={def.id} className="flex items-center gap-1">
                  <StageChip
                    label={def.label}
                    status={s.status}
                    current={s.current}
                    total={s.total}
                  />
                  {i < STAGE_DEFS.length - 1 && (
                    <span className="text-slate-300 text-xs">→</span>
                  )}
                </div>
              );
            })}
          </div>

          {result && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {copied ? (
                <>
                  <CheckIcon />
                  Copied!
                </>
              ) : (
                <>
                  <CopyIcon />
                  Copy Article
                </>
              )}
            </button>
          )}
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div className="h-0.5 bg-slate-100">
            <div
              className="h-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6">
        {/* Error state */}
        {pipelineError && (
          <div className="max-w-xl mx-auto mt-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <div className="text-3xl mb-3">⚠️</div>
            <h2 className="text-lg font-semibold text-red-800 mb-2">Pipeline Error</h2>
            <p className="text-red-600 text-sm mb-4">{pipelineError}</p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              ← Try Again
            </Link>
          </div>
        )}

        {/* Running state — progress cards */}
        {isRunning && !pipelineError && (
          <div className="max-w-lg mx-auto mt-12 space-y-3">
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">
                <span style={{ display: 'inline-block', animation: 'spin 2s linear infinite' }}>↻</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-800">Refreshing your article...</h2>
              <p className="text-slate-500 text-sm mt-1">
                This typically takes 2–5 minutes. Do not close this tab.
              </p>
            </div>

            {STAGE_DEFS.map((def) => {
              const s = stages[def.id];
              return (
                <ProgressCard
                  key={def.id}
                  label={s.label ?? def.label}
                  status={s.status}
                  current={s.current}
                  total={s.total}
                />
              );
            })}
          </div>
        )}

        {/* Result state — split view */}
        {result && (
          <div className="space-y-4">
            {/* Meta strip */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-indigo-500 uppercase tracking-wider mb-1">
                    Headline
                  </p>
                  <h1 className="text-lg font-bold text-slate-900 leading-snug">{result.headline}</h1>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-medium text-indigo-500 uppercase tracking-wider mb-1">
                    Meta Description
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed">{result.metaDescription}</p>
                </div>
              </div>
            </div>

            {/* Mobile tab switcher */}
            <div className="flex gap-1 bg-slate-200 rounded-lg p-1 sm:hidden">
              {(['original', 'refreshed'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
                  style={{
                    background: activeTab === tab ? '#fff' : 'transparent',
                    color: activeTab === tab ? '#1e293b' : '#64748b',
                    boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {tab === 'original' ? 'Original' : '✨ Refreshed'}
                </button>
              ))}
            </div>

            {/* Split pane */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ minHeight: '70vh' }}>
              {/* Left — Original */}
              <div
                className={`bg-white border border-slate-200 rounded-xl flex flex-col ${activeTab === 'refreshed' ? 'hidden sm:flex' : 'flex'}`}
              >
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-500">Original Article</span>
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    Before
                  </span>
                </div>
                <div
                  className="flex-1 overflow-y-auto p-5 article-prose text-sm"
                  style={{ maxHeight: '75vh' }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(result.original) }}
                />
              </div>

              {/* Right — Refreshed */}
              <div
                className={`bg-white border border-indigo-200 rounded-xl flex flex-col shadow-sm ${activeTab === 'original' ? 'hidden sm:flex' : 'flex'}`}
              >
                <div className="px-5 py-3.5 border-b border-indigo-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-indigo-700">✨ Refreshed Article</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                      After
                    </span>
                    <button
                      onClick={handleCopy}
                      title="Copy article"
                      className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1"
                    >
                      {copied ? <CheckIcon /> : <CopyIcon />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div
                  className="flex-1 overflow-y-auto p-5 article-prose text-sm"
                  style={{ maxHeight: '75vh' }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(result.article) }}
                />
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="flex justify-center py-4">
              <Link
                href="/"
                className="px-5 py-2.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              >
                ← Refresh Another Article
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StageChip({
  label,
  status,
  current,
  total,
}: {
  label: string;
  status: StageStatus['status'];
  current?: number;
  total?: number;
}) {
  const isRunning = status === 'running';
  const isDone = status === 'done';
  const isError = status === 'error';

  let bg = 'bg-slate-100 text-slate-400';
  if (isRunning) bg = 'bg-indigo-100 text-indigo-700';
  if (isDone) bg = 'bg-green-100 text-green-700';
  if (isError) bg = 'bg-red-100 text-red-600';

  const detail =
    isRunning && total && current !== undefined ? ` ${current}/${total}` : '';

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${bg} whitespace-nowrap`}
    >
      {isDone && <span>✓</span>}
      {isRunning && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"
          style={{ animation: 'pulse-dot 1.2s ease-in-out infinite' }}
        />
      )}
      {isError && <span>✗</span>}
      <span>
        {label}
        {detail}
      </span>
    </div>
  );
}

function ProgressCard({
  label,
  status,
  current,
  total,
}: {
  label: string;
  status: StageStatus['status'];
  current?: number;
  total?: number;
}) {
  const isRunning = status === 'running';
  const isDone = status === 'done';
  const isError = status === 'error';
  const isPending = status === 'pending';

  return (
    <div
      className="bg-white border rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all"
      style={{
        borderColor: isRunning
          ? '#6366f1'
          : isDone
          ? '#86efac'
          : isError
          ? '#fca5a5'
          : '#e2e8f0',
        boxShadow: isRunning ? '0 0 0 1px rgba(99,102,241,0.2)' : 'none',
      }}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
        {isDone && (
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {isRunning && (
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-indigo-600"
              style={{ animation: 'spin 0.8s linear infinite' }}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {isError && (
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
        {isPending && (
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-300" />
          </div>
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium"
          style={{
            color: isDone ? '#16a34a' : isRunning ? '#4338ca' : isError ? '#dc2626' : '#94a3b8',
          }}
        >
          {label}
          {isRunning && total && current !== undefined && (
            <span className="ml-2 text-xs font-normal text-indigo-400">
              {current}/{total} sections
            </span>
          )}
        </p>
      </div>

      {/* Status text */}
      <span
        className="text-xs font-medium"
        style={{
          color: isDone ? '#16a34a' : isRunning ? '#6366f1' : isError ? '#dc2626' : '#cbd5e1',
        }}
      >
        {isDone ? 'Done ✓' : isRunning ? 'Running...' : isError ? 'Error' : 'Waiting'}
      </span>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

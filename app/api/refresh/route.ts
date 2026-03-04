import { NextRequest } from 'next/server';
import { scrapeUrl } from '@/lib/scraper';
import { researchSerp } from '@/lib/serp';
import {
  transcribeMedia,
  runStage1,
  runStage2,
  runStage3,
  runStage4Section,
  runStage5,
} from '@/lib/pipeline';
import type { PipelineEvent, RefreshInput } from '@/lib/types';

// Allow up to 5 minutes for Vercel Pro / self-hosted
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function encode(event: PipelineEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: NextRequest) {
  const input: RefreshInput = await req.json();

  if (!input.url) {
    return new Response(JSON.stringify({ error: 'URL is required' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        try {
          controller.enqueue(encode(event));
        } catch {
          // Client disconnected
        }
      };

      try {
        // ── Stage 1: Ingest & Extract ──────────────────────────────────────
        send({ type: 'stage_start', stage: 'stage1', label: 'Extracting content...' });

        const articleContent = await scrapeUrl(input.url);

        let supplementaryContent: string | undefined;

        if (input.enrichmentType === 'media' && input.enrichmentContent) {
          send({ type: 'stage_progress', stage: 'stage1', label: 'Transcribing media...' });
          supplementaryContent = await transcribeMedia(
            input.enrichmentContent,
            input.enrichmentMimeType ?? 'audio/mpeg'
          );
        } else if (input.enrichmentContent) {
          supplementaryContent = input.enrichmentContent;
        }

        const stage1 = await runStage1(articleContent, supplementaryContent, input.enrichmentType);
        send({ type: 'stage_complete', stage: 'stage1', data: { primaryKeyword: stage1.primaryKeyword } });

        // ── Stage 1b: SERP Research ────────────────────────────────────────
        send({ type: 'stage_start', stage: 'stage1b', label: 'Researching SERPs...' });
        const stage1b = await researchSerp(stage1.primaryKeyword);
        send({
          type: 'stage_complete',
          stage: 'stage1b',
          data: { count: stage1b.serpResults.length },
        });

        // ── Stage 2: Gap Analysis ──────────────────────────────────────────
        send({ type: 'stage_start', stage: 'stage2', label: 'Analyzing gaps...' });
        const gapReport = await runStage2(stage1, stage1b.competitorContent);
        send({ type: 'stage_complete', stage: 'stage2' });

        // ── Stage 3: Refresh Plan ──────────────────────────────────────────
        send({ type: 'stage_start', stage: 'stage3', label: 'Planning refresh...' });
        const stage3 = await runStage3(gapReport, stage1);
        send({
          type: 'stage_complete',
          stage: 'stage3',
          data: { sectionCount: stage3.sections.length },
        });

        // ── Stage 4: Section Writing ───────────────────────────────────────
        const activeSections = stage3.sections.filter((s) => s.action !== 'cut');
        send({
          type: 'stage_start',
          stage: 'stage4',
          label: 'Writing sections...',
          current: 0,
          total: activeSections.length,
        });

        const writtenSections: string[] = [];
        for (const section of stage3.sections) {
          if (section.action === 'cut') continue;

          const sectionContent = await runStage4Section(
            section,
            stage1,
            writtenSections.join('\n\n')
          );

          if (sectionContent) writtenSections.push(sectionContent);

          send({
            type: 'stage_progress',
            stage: 'stage4',
            label: 'Writing sections...',
            current: writtenSections.length,
            total: activeSections.length,
          });
        }

        const draft = writtenSections.join('\n\n');
        send({ type: 'stage_complete', stage: 'stage4' });

        // ── Stage 5: Polish & Assembly ─────────────────────────────────────
        send({ type: 'stage_start', stage: 'stage5', label: 'Polishing...' });
        const final = await runStage5(draft, stage1, stage3.suggestedTitle);
        send({ type: 'stage_complete', stage: 'stage5' });

        // ── Final Result ───────────────────────────────────────────────────
        send({
          type: 'result',
          data: {
            original: articleContent,
            originalSummary: stage1.articleSummary,
            headline: final.headline,
            metaDescription: final.metaDescription,
            article: final.article,
          },
        });
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

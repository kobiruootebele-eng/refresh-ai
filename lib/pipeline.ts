import Anthropic from '@anthropic-ai/sdk';
import type { Stage1Result, Stage1bResult, SectionPlan, Stage3Result, FinalResult } from './types';

const MODEL = 'claude-sonnet-4-6';

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function extractJson(text: string): Record<string, unknown> {
  const attempts: string[] = [];

  // 1. JSON inside ```json ... ``` block
  const jsonFence = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonFence) attempts.push(jsonFence[1].trim());

  // 2. JSON inside ``` ... ``` block (no language tag)
  const plainFence = text.match(/```\s*\n?([\s\S]*?)\n?```/);
  if (plainFence) attempts.push(plainFence[1].trim());

  // 3. Largest {...} block in the text
  const allObjects = text.match(/\{[\s\S]*\}/g);
  if (allObjects) {
    // Pick the longest match (most likely the full object)
    const longest = allObjects.reduce((a, b) => (b.length > a.length ? b : a), '');
    attempts.push(longest);
  }

  // 4. The entire trimmed text
  attempts.push(text.trim());

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next candidate
    }
  }

  // Include first 300 chars of raw response in error to aid debugging
  const preview = text.slice(0, 300).replace(/\n/g, ' ');
  throw new Error(`Could not parse JSON from Claude response. Raw preview: "${preview}"`);
}

// ─── Stage 1 ─────────────────────────────────────────────────────────────────

export async function transcribeMedia(base64Data: string, mimeType: string): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64Data } } as any,
          { type: 'text', text: 'Transcribe this audio/video file completely and accurately. Return only the transcription text, no commentary.' },
        ],
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function runStage1(
  articleContent: string,
  supplementaryContent?: string,
  supplementaryType?: string
): Promise<Stage1Result> {
  const client = getClient();

  const supplementarySection = supplementaryContent
    ? `\n\nAlso extract from this supplementary ${supplementaryType ?? 'content'} the author's key themes, insights, notable quotes, data points, and unique perspectives. Put this in the "supplementaryInsights" field.\n\nSUPPLEMENTARY CONTENT:\n${supplementaryContent.slice(0, 20000)}`
    : '';

  const prompt = `Analyze this article and extract structured information.${supplementarySection}

Return ONLY valid JSON — no markdown fences, no explanation:

{
  "headings": ["array of all headings in the article, in order"],
  "wordCount": 1500,
  "primaryKeyword": "the main SEO keyword/topic this article targets",
  "currentAngle": "2–3 sentence description of the article's current angle and perspective",
  "sections": ["one-sentence summary of section 1", "one-sentence summary of section 2"],
  "articleSummary": "3–5 sentence overall article summary"${supplementaryContent ? ',\n  "supplementaryInsights": "key themes, insights, quotes, and unique perspectives from the supplementary content"' : ''}
}

ARTICLE CONTENT:
${articleContent.slice(0, 40000)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const parsed = extractJson(text);

  return {
    rawContent: articleContent,
    headings: (parsed.headings as string[]) ?? [],
    wordCount: (parsed.wordCount as number) ?? 0,
    primaryKeyword: (parsed.primaryKeyword as string) ?? '',
    currentAngle: (parsed.currentAngle as string) ?? '',
    sections: (parsed.sections as string[]) ?? [],
    articleSummary: (parsed.articleSummary as string) ?? '',
    supplementaryInsights: parsed.supplementaryInsights as string | undefined,
  };
}

// ─── Stage 2 ─────────────────────────────────────────────────────────────────

export async function runStage2(stage1: Stage1Result, competitorContent: string): Promise<string> {
  const client = getClient();

  const prompt = `You are an expert SEO content strategist. Analyze the original article against top-ranking competitor articles and identify content gaps.

ORIGINAL ARTICLE SUMMARY:
- Primary Keyword: ${stage1.primaryKeyword}
- Current Angle: ${stage1.currentAngle}
- Estimated Word Count: ${stage1.wordCount}
- Summary: ${stage1.articleSummary}
- Sections covered: ${stage1.sections.join(' | ')}
${stage1.supplementaryInsights ? `\nAVAILABLE SUPPLEMENTARY INSIGHTS (unique author content that can be woven in):\n${stage1.supplementaryInsights}` : ''}

TOP COMPETITOR ARTICLES FROM GOOGLE:
${competitorContent.slice(0, 80000)}

Identify ONLY gaps that are evidenced by what competitors are actually covering. Never invent gaps.

Produce a prioritized gap report covering:
1. Missing sections that multiple competitors cover
2. Weak or thin areas in the original vs what competitors offer
3. Unanswered questions and missing FAQs
4. Missing data, statistics, or examples competitors reference
5. Structural improvements (intro hook, conclusion, header hierarchy)
${stage1.supplementaryInsights ? '6. How to leverage the available supplementary insights for competitive advantage' : ''}

Be specific and cite competitor patterns as evidence. Output only the gap report — no article writing.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// ─── Stage 3 ─────────────────────────────────────────────────────────────────

export async function runStage3(gapReport: string, stage1: Stage1Result): Promise<Stage3Result> {
  const client = getClient();

  const prompt = `You are a content strategist. Based on this gap report, create a detailed section-by-section blueprint for refreshing the article.

ORIGINAL ARTICLE INFO:
- Primary Keyword: ${stage1.primaryKeyword}
- Current headings: ${stage1.headings.join(' | ')}
- Word count: ${stage1.wordCount}

GAP REPORT:
${gapReport}
${stage1.supplementaryInsights ? `\nSUPPLEMENTARY INSIGHTS AVAILABLE TO WEAVE IN:\n${stage1.supplementaryInsights}` : ''}

Return ONLY valid JSON — no markdown fences, no explanation:

{
  "suggestedTitle": "Improved article title that includes the primary keyword",
  "sections": [
    {
      "title": "Section heading",
      "action": "keep|rewrite|expand|cut|add",
      "instruction": "Specific, detailed, actionable instruction for this section",
      "insertSupplementaryInsights": false
    }
  ]
}

Rules:
- Include ALL sections of the refreshed article (not just changed ones)
- "action" must be exactly one of: keep, rewrite, expand, cut, add
- Instructions must be specific and actionable — not vague
- Set insertSupplementaryInsights: true only when that section should feature insights from the supplementary content
- Sections must flow logically from intro to conclusion
- Output only the JSON blueprint — no writing`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const parsed = extractJson(text);

  return {
    suggestedTitle: (parsed.suggestedTitle as string) ?? stage1.primaryKeyword,
    sections: (parsed.sections as SectionPlan[]) ?? [],
  };
}

// ─── Stage 4 ─────────────────────────────────────────────────────────────────

export async function runStage4Section(
  section: SectionPlan,
  stage1: Stage1Result,
  previousContent: string
): Promise<string> {
  if (section.action === 'cut') return '';

  const client = getClient();

  const supplementaryNote =
    section.insertSupplementaryInsights && stage1.supplementaryInsights
      ? `\nSUPPLEMENTARY INSIGHTS TO WEAVE IN NATURALLY (use the author's voice and perspective):\n${stage1.supplementaryInsights}\n`
      : '';

  const prompt = `You are an expert content writer. Write the following section for a refreshed article.

ARTICLE CONTEXT:
- Primary Keyword: ${stage1.primaryKeyword}
- Article Summary: ${stage1.articleSummary}

SECTION TO WRITE:
- Heading: ${section.title}
- Action: ${section.action}
- Instruction: ${section.instruction}
${supplementaryNote}
SOURCE MATERIAL (original article for reference):
${stage1.rawContent.slice(0, 15000)}
${previousContent ? `\nPREVIOUSLY WRITTEN SECTIONS (maintain consistency of voice and style):\n${previousContent.slice(-3000)}` : ''}

Write this section fully and completely. Include the section heading (use ## for H2). Write real, high-quality, publish-ready content. Natural, authoritative, engaging voice. No placeholders.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// ─── Stage 5 ─────────────────────────────────────────────────────────────────

export async function runStage5(
  draft: string,
  stage1: Stage1Result,
  suggestedTitle: string
): Promise<FinalResult> {
  const client = getClient();

  const prompt = `You are a master editor. Polish this article draft to publish-ready quality.

Tasks:
1. Ensure smooth, natural transitions between all sections
2. Maintain a consistent, authoritative tone throughout
3. Strengthen the introduction with a compelling hook (question, statistic, or bold claim)
4. Write a final headline that includes the primary keyword: "${stage1.primaryKeyword}"
5. Write a meta description (150–160 characters, includes primary keyword, compelling)
6. Fix any repetition, awkward phrasing, or structural issues
7. Do not add filler — cut anything that weakens the piece

Return the response in this EXACT format (keep the separators):

HEADLINE: [Your compelling headline]
META: [Your 150–160 character meta description]

---

[The complete polished article here]

DRAFT TO POLISH:
${draft}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  const headlineMatch = text.match(/^HEADLINE:\s*(.+)$/m);
  const metaMatch = text.match(/^META:\s*(.+)$/m);
  const articleMatch = text.match(/---\s*\n([\s\S]+)$/);

  return {
    headline: headlineMatch ? headlineMatch[1].trim() : suggestedTitle,
    metaDescription: metaMatch ? metaMatch[1].trim() : '',
    article: articleMatch ? articleMatch[1].trim() : text,
  };
}

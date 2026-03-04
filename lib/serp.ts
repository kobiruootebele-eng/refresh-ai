import type { SerpResult, Stage1bResult } from './types';
import { scrapeUrl } from './scraper';

interface ValueSerpOrganic {
  link: string;
  title: string;
}

interface ValueSerpResponse {
  organic_results?: ValueSerpOrganic[];
  error?: string;
}

export async function researchSerp(keyword: string): Promise<Stage1bResult> {
  const apiKey = process.env.VALUESERP_API_KEY;
  if (!apiKey) {
    throw new Error('VALUESERP_API_KEY is not set');
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    q: keyword,
    num: '10',
  });

  const response = await fetch(
    `https://api.valueserp.com/search?${params.toString()}`,
    { signal: AbortSignal.timeout(15000) }
  );

  if (!response.ok) {
    throw new Error(`ValueSERP API error: HTTP ${response.status}`);
  }

  const data: ValueSerpResponse = await response.json();

  if (data.error) {
    throw new Error(`ValueSERP API error: ${data.error}`);
  }

  const organicResults: SerpResult[] = (data.organic_results ?? [])
    .slice(0, 10)
    .map((r) => ({ url: r.link, title: r.title }));

  // Scrape each competitor in parallel (with concurrency limit of 3)
  const competitorChunks: string[] = [];
  const CONCURRENCY = 3;

  for (let i = 0; i < organicResults.length; i += CONCURRENCY) {
    const chunk = organicResults.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((r) => scrapeUrl(r.url).then((content) => `## ${r.title}\nURL: ${r.url}\n\n${content}`))
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        competitorChunks.push(result.value);
      }
    }
  }

  return {
    serpResults: organicResults,
    competitorContent: competitorChunks.join('\n\n---\n\n'),
  };
}

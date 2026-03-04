const JINA_PREFIX = 'https://r.jina.ai/';
const CHAR_LIMIT = 50000;

export async function scrapeUrl(url: string): Promise<string> {
  const jinaUrl = `${JINA_PREFIX}${url}`;

  const response = await fetch(jinaUrl, {
    headers: {
      Accept: 'text/plain',
      'X-Return-Format': 'text',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to scrape ${url}: HTTP ${response.status}`);
  }

  const text = await response.text();
  return text.slice(0, CHAR_LIMIT);
}

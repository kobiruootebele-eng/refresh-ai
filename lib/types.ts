export interface RefreshInput {
  url: string;
  enrichmentType?: 'file' | 'media' | 'text';
  enrichmentContent?: string;
  enrichmentFileName?: string;
  enrichmentMimeType?: string;
}

export interface Stage1Result {
  rawContent: string;
  headings: string[];
  wordCount: number;
  primaryKeyword: string;
  currentAngle: string;
  sections: string[];
  articleSummary: string;
  supplementaryInsights?: string;
}

export interface SerpResult {
  url: string;
  title: string;
}

export interface Stage1bResult {
  serpResults: SerpResult[];
  competitorContent: string;
}

export interface SectionPlan {
  title: string;
  action: 'keep' | 'rewrite' | 'expand' | 'cut' | 'add';
  instruction: string;
  insertSupplementaryInsights?: boolean;
}

export interface Stage3Result {
  suggestedTitle: string;
  sections: SectionPlan[];
}

export interface FinalResult {
  headline: string;
  metaDescription: string;
  article: string;
}

export interface ResultData {
  original: string;
  originalSummary: string;
  headline: string;
  metaDescription: string;
  article: string;
}

export type PipelineEventType =
  | 'stage_start'
  | 'stage_complete'
  | 'stage_progress'
  | 'result'
  | 'error';

export interface PipelineEvent {
  type: PipelineEventType;
  stage?: string;
  label?: string;
  data?: unknown;
  message?: string;
  current?: number;
  total?: number;
}

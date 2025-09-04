import { Client } from '@elastic/elasticsearch';
import { getElasticsearchClient } from '@/config/elasticsearch';
import { config } from '@/config';
import { logger } from '@/config/logger';
import { prisma } from '@/config/database';

export interface SearchQuery {
  query: string;
  filters?: {
    type?: 'case' | 'evidence' | 'document';
    status?: string;
    priority?: string;
    caseId?: string;
    evidenceType?: string;
    dateRange?: {
      from?: string;
      to?: string;
    };
    tags?: string[];
    assignedTo?: string;
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  }[];
  from?: number;
  size?: number;
  highlight?: boolean;
  suggest?: boolean;
}

export interface SearchResult {
  id: string;
  type: 'case' | 'evidence' | 'document';
  title: string;
  description?: string;
  content?: string;
  metadata: Record<string, any>;
  score: number;
  highlights?: Record<string, string[]>;
  caseId?: string;
  evidenceId?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: {
    value: number;
    relation: 'eq' | 'gte';
  };
  aggregations?: Record<string, any>;
  suggestions?: Record<string, any>;
  took: number;
}

export interface IndexDocument {
  id: string;
  type: 'case' | 'evidence' | 'document';
  title: string;
  description?: string;
  content?: string;
  metadata: Record<string, any>;
  caseId?: string;
  evidenceId?: string;
  tags?: string[];
  status?: string;
  priority?: string;
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ElasticsearchService {
  private client: Client | null;
  private readonly indexPrefix: string;

  constructor() {
    this.client = getElasticsearchClient();
    this.indexPrefix = config.elasticsearch.indexPrefix;
  }

  private getIndexName(type: string): string {
    return `${this.indexPrefix}_${type}`;
  }

  async initializeIndices(): Promise<void> {
    if (!this.client) {
      logger.warn('Elasticsearch client not available, skipping index initialization');
      return;
    }

    try {
      await this.createCasesIndex();
      await this.createEvidenceIndex();
      await this.createDocumentsIndex();
      logger.info('Elasticsearch indices initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch indices', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async createCasesIndex(): Promise<void> {
    if (!this.client) return;

    const indexName = this.getIndexName('cases');
    
    const mapping = {
      properties: {
        title: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            keyword: { type: 'keyword' },
            suggest: {
              type: 'completion',
              analyzer: 'simple',
              preserve_separators: true,
              preserve_position_increments: true,
              max_input_length: 50,
            },
          },
        },
        description: {
          type: 'text',
          analyzer: 'standard',
        },
        caseNumber: {
          type: 'keyword',
        },
        status: {
          type: 'keyword',
        },
        priority: {
          type: 'keyword',
        },
        assignedTo: {
          type: 'keyword',
        },
        tags: {
          type: 'keyword',
        },
        metadata: {
          type: 'object',
          dynamic: true,
        },
        createdAt: {
          type: 'date',
        },
        updatedAt: {
          type: 'date',
        },
      },
    };

    await this.createIndexIfNotExists(indexName, mapping);
  }

  private async createEvidenceIndex(): Promise<void> {
    if (!this.client) return;

    const indexName = this.getIndexName('evidence');
    
    const mapping = {
      properties: {
        title: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            keyword: { type: 'keyword' },
            suggest: {
              type: 'completion',
              analyzer: 'simple',
              preserve_separators: true,
              preserve_position_increments: true,
              max_input_length: 50,
            },
          },
        },
        description: {
          type: 'text',
          analyzer: 'standard',
        },
        evidenceType: {
          type: 'keyword',
        },
        status: {
          type: 'keyword',
        },
        caseId: {
          type: 'keyword',
        },
        tags: {
          type: 'keyword',
        },
        metadata: {
          type: 'object',
          dynamic: true,
          properties: {
            fileName: { type: 'keyword' },
            fileSize: { type: 'long' },
            mimeType: { type: 'keyword' },
            hash: { type: 'keyword' },
            location: {
              type: 'geo_point',
            },
            dimensions: {
              type: 'object',
              properties: {
                width: { type: 'integer' },
                height: { type: 'integer' },
              },
            },
          },
        },
        ocrText: {
          type: 'text',
          analyzer: 'standard',
        },
        transcription: {
          type: 'text',
          analyzer: 'standard',
        },
        createdAt: {
          type: 'date',
        },
        updatedAt: {
          type: 'date',
        },
      },
    };

    await this.createIndexIfNotExists(indexName, mapping);
  }

  private async createDocumentsIndex(): Promise<void> {
    if (!this.client) return;

    const indexName = this.getIndexName('documents');
    
    const mapping = {
      properties: {
        title: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            keyword: { type: 'keyword' },
            suggest: {
              type: 'completion',
              analyzer: 'simple',
              preserve_separators: true,
              preserve_position_increments: true,
              max_input_length: 50,
            },
          },
        },
        content: {
          type: 'text',
          analyzer: 'standard',
        },
        fileName: {
          type: 'keyword',
        },
        mimeType: {
          type: 'keyword',
        },
        evidenceId: {
          type: 'keyword',
        },
        caseId: {
          type: 'keyword',
        },
        extractedText: {
          type: 'text',
          analyzer: 'standard',
        },
        metadata: {
          type: 'object',
          dynamic: true,
        },
        createdAt: {
          type: 'date',
        },
        updatedAt: {
          type: 'date',
        },
      },
    };

    await this.createIndexIfNotExists(indexName, mapping);
  }

  private async createIndexIfNotExists(indexName: string, mapping: any): Promise<void> {
    if (!this.client) return;

    try {
      const exists = await this.client.indices.exists({ index: indexName });
      
      if (!exists) {
        await this.client.indices.create({
          index: indexName,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                standard: {
                  type: 'standard',
                  stopwords: '_english_',
                },
              },
            },
          },
          mappings: mapping,
        });
        
        logger.info(`Created Elasticsearch index: ${indexName}`);
      } else {
        logger.info(`Elasticsearch index already exists: ${indexName}`);
      }
    } catch (error) {
      logger.error(`Failed to create index ${indexName}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async indexDocument(type: string, document: IndexDocument): Promise<void> {
    if (!this.client) {
      logger.warn('Elasticsearch client not available, skipping document indexing');
      return;
    }

    try {
      const indexName = this.getIndexName(type);
      
      await this.client.index({
        index: indexName,
        id: document.id,
        document: document,
        refresh: 'wait_for',
      });

      logger.debug(`Indexed document in ${indexName}`, {
        documentId: document.id,
        type: document.type,
      });
    } catch (error) {
      logger.error('Failed to index document', {
        error: error instanceof Error ? error.message : String(error),
        documentId: document.id,
        type,
      });
      throw error;
    }
  }

  async search(searchQuery: SearchQuery): Promise<SearchResponse> {
    if (!this.client) {
      logger.warn('Elasticsearch client not available, returning empty search results');
      return {
        results: [],
        total: { value: 0, relation: 'eq' },
        took: 0,
      };
    }

    try {
      const indices = this.buildSearchIndices(searchQuery.filters?.type);
      const query = this.buildElasticsearchQuery(searchQuery);

      const response = await this.client.search({
        index: indices,
        ...query,
      });

      return this.transformSearchResponse(response);
    } catch (error) {
      logger.error('Elasticsearch search failed', {
        error: error instanceof Error ? error.message : String(error),
        query: searchQuery.query,
      });
      throw error;
    }
  }

  private buildSearchIndices(type?: string): string[] {
    if (type) {
      return [this.getIndexName(type === 'document' ? 'documents' : type + 's')];
    }
    
    return [
      this.getIndexName('cases'),
      this.getIndexName('evidence'),
      this.getIndexName('documents'),
    ];
  }

  private buildElasticsearchQuery(searchQuery: SearchQuery): any {
    const must: any[] = [];
    const filter: any[] = [];

    // Main query
    if (searchQuery.query && searchQuery.query.trim()) {
      must.push({
        multi_match: {
          query: searchQuery.query,
          fields: [
            'title^3',
            'description^2',
            'content',
            'ocrText',
            'transcription',
            'extractedText',
            'metadata.*',
          ],
          type: 'best_fields',
          fuzziness: 'AUTO',
          prefix_length: 1,
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    // Apply filters
    if (searchQuery.filters) {
      const { filters } = searchQuery;

      if (filters.status) {
        filter.push({ term: { status: filters.status } });
      }

      if (filters.priority) {
        filter.push({ term: { priority: filters.priority } });
      }

      if (filters.caseId) {
        filter.push({ term: { caseId: filters.caseId } });
      }

      if (filters.evidenceType) {
        filter.push({ term: { evidenceType: filters.evidenceType } });
      }

      if (filters.assignedTo) {
        filter.push({ term: { assignedTo: filters.assignedTo } });
      }

      if (filters.tags && filters.tags.length > 0) {
        filter.push({ terms: { tags: filters.tags } });
      }

      if (filters.dateRange) {
        const range: any = {};
        if (filters.dateRange.from) {
          range.gte = filters.dateRange.from;
        }
        if (filters.dateRange.to) {
          range.lte = filters.dateRange.to;
        }
        if (Object.keys(range).length > 0) {
          filter.push({ range: { createdAt: range } });
        }
      }
    }

    const query: any = {
      query: {
        bool: {
          must,
          filter,
        },
      },
      from: searchQuery.from || 0,
      size: searchQuery.size || 20,
    };

    // Add highlighting
    if (searchQuery.highlight) {
      query.highlight = {
        fields: {
          title: {},
          description: {},
          content: {},
          ocrText: {},
          transcription: {},
          extractedText: {},
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
        fragment_size: 150,
        number_of_fragments: 3,
      };
    }

    // Add sorting
    if (searchQuery.sort && searchQuery.sort.length > 0) {
      query.sort = searchQuery.sort.map(s => ({
        [s.field]: { order: s.order },
      }));
    } else {
      // Default sort by relevance, then by creation date
      query.sort = [
        '_score',
        { createdAt: { order: 'desc' } },
      ];
    }

    // Add aggregations for faceted search
    query.aggs = {
      types: {
        terms: { field: '_index', size: 10 },
      },
      statuses: {
        terms: { field: 'status', size: 10 },
      },
      priorities: {
        terms: { field: 'priority', size: 10 },
      },
      tags: {
        terms: { field: 'tags', size: 20 },
      },
      date_histogram: {
        date_histogram: {
          field: 'createdAt',
          calendar_interval: 'month',
          format: 'yyyy-MM',
        },
      },
    };

    return query;
  }

  private transformSearchResponse(response: any): SearchResponse {
    const results: SearchResult[] = response.hits.hits.map((hit: any) => ({
      id: hit._id,
      type: this.getTypeFromIndex(hit._index),
      title: hit._source.title || 'Untitled',
      description: hit._source.description,
      content: hit._source.content || hit._source.ocrText || hit._source.transcription,
      metadata: hit._source.metadata || {},
      score: hit._score,
      highlights: hit.highlight || {},
      caseId: hit._source.caseId,
      evidenceId: hit._source.evidenceId,
    }));

    return {
      results,
      total: {
        value: response.hits.total.value,
        relation: response.hits.total.relation,
      },
      aggregations: response.aggregations,
      took: response.took,
    };
  }

  private getTypeFromIndex(indexName: string): 'case' | 'evidence' | 'document' {
    if (indexName.includes('cases')) return 'case';
    if (indexName.includes('evidence')) return 'evidence';
    return 'document';
  }

  async getSuggestions(text: string, size: number = 10): Promise<string[]> {
    if (!this.client || !text.trim()) {
      return [];
    }

    try {
      const response = await this.client.search({
        index: [
          this.getIndexName('cases'),
          this.getIndexName('evidence'),
          this.getIndexName('documents'),
        ],
        suggest: {
          title_suggest: {
            prefix: text,
            completion: {
              field: 'title.suggest',
              size,
              skip_duplicates: true,
            },
          },
        },
      });

      const suggestions: string[] = [];
      if (response.suggest?.title_suggest) {
        for (const suggestion of response.suggest.title_suggest) {
          if (Array.isArray(suggestion.options)) {
            for (const option of suggestion.options) {
              suggestions.push(option.text);
            }
          }
        }
      }

      return [...new Set(suggestions)]; // Remove duplicates
    } catch (error) {
      logger.error('Failed to get suggestions', {
        error: error instanceof Error ? error.message : String(error),
        text,
      });
      return [];
    }
  }

  async deleteDocument(type: string, id: string): Promise<void> {
    if (!this.client) return;

    try {
      const indexName = this.getIndexName(type);
      
      await this.client.delete({
        index: indexName,
        id,
        refresh: 'wait_for',
      });

      logger.debug(`Deleted document from ${indexName}`, { documentId: id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not_found')) {
        logger.debug(`Document not found for deletion`, { id, type });
        return;
      }
      
      logger.error('Failed to delete document', {
        error: error instanceof Error ? error.message : String(error),
        id,
        type,
      });
      throw error;
    }
  }

  async updateDocument(type: string, id: string, document: Partial<IndexDocument>): Promise<void> {
    if (!this.client) return;

    try {
      const indexName = this.getIndexName(type);
      
      await this.client.update({
        index: indexName,
        id,
        doc: document,
        refresh: 'wait_for',
      });

      logger.debug(`Updated document in ${indexName}`, { documentId: id });
    } catch (error) {
      logger.error('Failed to update document', {
        error: error instanceof Error ? error.message : String(error),
        id,
        type,
      });
      throw error;
    }
  }

  async reindexAll(): Promise<void> {
    if (!this.client) {
      logger.warn('Elasticsearch client not available, skipping reindexing');
      return;
    }

    logger.info('Starting full reindexing of all documents');

    try {
      // Reindex cases
      await this.reindexCases();
      
      // Reindex evidence
      await this.reindexEvidence();
      
      // Note: Documents will be reindexed as part of evidence file processing
      
      logger.info('Full reindexing completed successfully');
    } catch (error) {
      logger.error('Full reindexing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async reindexCases(): Promise<void> {
    const cases = await prisma.case.findMany({
      include: {
        assignedTo: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    for (const case_ of cases) {
      const document: IndexDocument = {
        id: case_.id,
        type: 'case',
        title: case_.title,
        description: case_.description || undefined,
        metadata: {
          caseNumber: case_.caseNumber,
        },
        status: case_.status,
        priority: case_.priority,
        assignedTo: case_.assignedTo?.id,
        tags: case_.tags.map(t => t.tag.name),
        createdAt: case_.createdAt,
        updatedAt: case_.updatedAt,
      };

      await this.indexDocument('cases', document);
    }

    logger.info(`Reindexed ${cases.length} cases`);
  }

  private async reindexEvidence(): Promise<void> {
    const evidence = await prisma.evidenceItem.findMany({
      include: {
        case: true,
        tags: {
          include: {
            tag: true,
          },
        },
        collectedBy: true,
      },
    });

    for (const item of evidence) {
      const metadata = item.metadata as any;
      const document: IndexDocument = {
        id: item.id,
        type: 'evidence',
        title: item.title,
        description: item.description || undefined,
        content: [
          metadata?.fileProcessing?.extractedText,
          metadata?.ocr?.text,
          metadata?.transcription,
        ]
          .filter(Boolean)
          .join(' '),
        metadata: {
          evidenceType: item.type,
          location: item.location,
          collectedBy: item.collectedBy.email,
          collectedAt: item.collectedAt,
          chainOfCustody: item.chainOfCustody,
          itemNumber: item.itemNumber,
        },
        caseId: item.caseId,
        status: item.status,
        tags: item.tags.map(t => t.tag.name),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };

      await this.indexDocument('evidence', document);
    }

    logger.info(`Reindexed ${evidence.length} evidence items`);
  }
}

export const elasticsearchService = new ElasticsearchService();
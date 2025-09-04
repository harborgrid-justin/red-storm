import { Client } from '@elastic/elasticsearch';
import { config } from './index';
import { logger } from './logger';

// Elasticsearch client
let elasticsearchClient: Client | null = null;

export const initializeElasticsearch = async (): Promise<Client | null> => {
  try {
    if (!config.elasticsearch.url) {
      logger.warn('Elasticsearch URL not configured, search features will be limited');
      return null;
    }

    const clientConfig: any = {
      node: config.elasticsearch.url,
      requestTimeout: 60000,
      pingTimeout: 3000,
      maxRetries: 3,
    };

    // Add authentication if provided
    if (config.elasticsearch.username && config.elasticsearch.password) {
      clientConfig.auth = {
        username: config.elasticsearch.username,
        password: config.elasticsearch.password,
      };
    }

    // Add CA certificate for secure connections
    if (config.elasticsearch.caCert) {
      clientConfig.tls = {
        ca: config.elasticsearch.caCert,
        rejectUnauthorized: true,
      };
    }

    elasticsearchClient = new Client(clientConfig);

    // Test connection
    await elasticsearchClient.ping();
    logger.info('Elasticsearch connection established successfully', {
      url: config.elasticsearch.url,
      indexPrefix: config.elasticsearch.indexPrefix,
    });

    return elasticsearchClient;
  } catch (error) {
    logger.error('Failed to initialize Elasticsearch', {
      error: error instanceof Error ? error.message : String(error),
      url: config.elasticsearch.url,
    });
    return null;
  }
};

export const getElasticsearchClient = (): Client | null => {
  return elasticsearchClient;
};

export const closeElasticsearch = async (): Promise<void> => {
  if (elasticsearchClient) {
    await elasticsearchClient.close();
    elasticsearchClient = null;
    logger.info('Elasticsearch connection closed');
  }
};
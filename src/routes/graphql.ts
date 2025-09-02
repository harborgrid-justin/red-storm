import { Router } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { gql } from 'apollo-server-express';
import { GraphQLContext, AuthenticatedRequest } from '@/types';
import { auth } from '@/middleware/auth';
import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { config } from '@/config';

const router = Router();

// GraphQL schema
const typeDefs = gql`
  scalar DateTime
  scalar JSON

  type User {
    id: ID!
    email: String!
    username: String
    firstName: String
    lastName: String
    isActive: Boolean!
    lastLogin: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    roles: [Role!]!
  }

  type Role {
    id: ID!
    name: String!
    description: String
    permissions: JSON!
  }

  type Case {
    id: ID!
    caseNumber: String!
    title: String!
    description: String
    status: CaseStatus!
    priority: Priority!
    assignedTo: User
    createdBy: User!
    createdAt: DateTime!
    updatedAt: DateTime!
    closedAt: DateTime
    evidenceItems: [EvidenceItem!]!
    tags: [Tag!]!
  }

  type EvidenceItem {
    id: ID!
    caseId: String!
    itemNumber: String!
    title: String!
    description: String
    type: EvidenceType!
    status: EvidenceStatus!
    collectedBy: User!
    collectedAt: DateTime!
    location: String
    chainOfCustody: JSON!
    metadata: JSON
    checksumMd5: String
    checksumSha256: String
    fileSize: String
    filePath: String
    thumbnailPath: String
    createdAt: DateTime!
    updatedAt: DateTime!
    case: Case!
    tags: [Tag!]!
  }

  type Tag {
    id: ID!
    name: String!
    color: String
    description: String
    createdAt: DateTime!
  }

  enum CaseStatus {
    ACTIVE
    CLOSED
    ARCHIVED
    PENDING
  }

  enum Priority {
    LOW
    MEDIUM
    HIGH
    CRITICAL
  }

  enum EvidenceType {
    DIGITAL
    PHYSICAL
    DOCUMENT
    PHOTO
    VIDEO
    AUDIO
    OTHER
  }

  enum EvidenceStatus {
    COLLECTED
    PROCESSING
    ANALYZED
    STORED
    DISPOSED
  }

  type Query {
    # User queries
    me: User
    users(limit: Int, offset: Int, search: String): [User!]!
    user(id: ID!): User

    # Case queries
    cases(limit: Int, offset: Int, search: String, status: CaseStatus, priority: Priority): [Case!]!
    case(id: ID!): Case
    myCases: [Case!]!

    # Evidence queries
    evidence(limit: Int, offset: Int, search: String, caseId: ID, type: EvidenceType, status: EvidenceStatus): [EvidenceItem!]!
    evidenceItem(id: ID!): EvidenceItem
    evidenceByCase(caseId: ID!): [EvidenceItem!]!

    # Tag queries
    tags(search: String): [Tag!]!
  }

  type Mutation {
    # Case mutations
    createCase(
      title: String!
      description: String
      priority: Priority
      assignedToId: ID
      tags: [String!]
    ): Case!

    updateCase(
      id: ID!
      title: String
      description: String
      priority: Priority
      status: CaseStatus
      assignedToId: ID
      tags: [String!]
    ): Case!

    # Evidence mutations
    createEvidence(
      caseId: ID!
      title: String!
      description: String
      type: EvidenceType!
      location: String
      metadata: JSON
      tags: [String!]
    ): EvidenceItem!

    updateEvidence(
      id: ID!
      title: String
      description: String
      type: EvidenceType
      status: EvidenceStatus
      location: String
      metadata: JSON
      tags: [String!]
    ): EvidenceItem!
  }
`;

// GraphQL resolvers
const resolvers = {
  Query: {
    me: async (_: any, args: any, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }
      return await prisma.user.findUnique({
        where: { id: context.user.id },
        include: {
          roles: {
            include: { role: true },
          },
        },
      });
    },

    users: async (_: any, { limit = 20, offset = 0, search }: any, context: GraphQLContext) => {
      if (!context.user?.roles.includes('admin')) {
        throw new Error('Admin access required');
      }

      const where = search ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      } : {};

      return await prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          roles: {
            include: { role: true },
          },
        },
      });
    },

    cases: async (_: any, { limit = 20, offset = 0, search, status, priority }: any, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const where: any = {};

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { caseNumber: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (status) {
        where.status = status;
      }

      if (priority) {
        where.priority = priority;
      }

      return await prisma.case.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: true,
          createdBy: true,
          evidenceItems: true,
          tags: {
            include: { tag: true },
          },
        },
      });
    },

    case: async (_: any, { id }: any, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await prisma.case.findUnique({
        where: { id },
        include: {
          assignedTo: true,
          createdBy: true,
          evidenceItems: {
            where: { isDeleted: false },
            include: {
              collectedBy: true,
              tags: {
                include: { tag: true },
              },
            },
          },
          tags: {
            include: { tag: true },
          },
        },
      });
    },

    evidence: async (_: any, { limit = 20, offset = 0, search, caseId, type, status }: any, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const where: any = { isDeleted: false };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { itemNumber: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (caseId) {
        where.caseId = caseId;
      }

      if (type) {
        where.type = type;
      }

      if (status) {
        where.status = status;
      }

      return await prisma.evidenceItem.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          case: true,
          collectedBy: true,
          tags: {
            include: { tag: true },
          },
        },
      });
    },

    evidenceItem: async (_: any, { id }: any, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await prisma.evidenceItem.findUnique({
        where: { id, isDeleted: false },
        include: {
          case: true,
          collectedBy: true,
          tags: {
            include: { tag: true },
          },
        },
      });
    },

    tags: async (_: any, { search }: any, context: GraphQLContext) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const where = search ? {
        name: { contains: search, mode: 'insensitive' },
      } : {};

      return await prisma.tag.findMany({
        where,
        orderBy: { name: 'asc' },
      });
    },
  },

  Mutation: {
    createCase: async (_: any, { title, description, priority, assignedToId, tags }: any, context: GraphQLContext) => {
      if (!context.user || !context.user.permissions.includes('case:create')) {
        throw new Error('Permission denied');
      }

      // Implementation would include the same logic as REST endpoint
      // This is a simplified version
      return await prisma.case.create({
        data: {
          caseNumber: `CASE-${Date.now()}`,
          title,
          description,
          priority: priority || 'MEDIUM',
          assignedToId,
          createdById: context.user.id,
        },
        include: {
          assignedTo: true,
          createdBy: true,
          evidenceItems: true,
          tags: {
            include: { tag: true },
          },
        },
      });
    },

    // Add other mutations as needed...
  },

  // Field resolvers
  User: {
    roles: async (parent: any) => {
      return parent.roles?.map((userRole: any) => userRole.role) || [];
    },
  },

  Case: {
    tags: async (parent: any) => {
      return parent.tags?.map((caseTag: any) => caseTag.tag) || [];
    },
  },

  EvidenceItem: {
    tags: async (parent: any) => {
      return parent.tags?.map((evidenceTag: any) => evidenceTag.tag) || [];
    },
  },
};

// Create Apollo Server
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }: { req: AuthenticatedRequest }): GraphQLContext => ({
    user: req.user,
    prisma,
    redis,
    correlationId: req.correlationId,
    req,
    res: {} as any, // Response object would be provided in a full implementation
  }),
  // playground: config.graphql.playground,
  introspection: config.graphql.introspection,
  formatError: (error) => {
    // Log GraphQL errors
    console.error('GraphQL Error:', error);
    return {
      message: error.message,
      code: error.extensions?.code || 'GRAPHQL_ERROR',
      path: error.path,
    };
  },
});

// Apply authentication middleware to GraphQL
router.use(auth.optional);

// Apply Apollo GraphQL middleware
apolloServer.applyMiddleware({ 
  app: router as any, 
  path: '/',
  cors: false, // CORS handled by main app
});

export default router;
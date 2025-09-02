import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@/utils/crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'System Administrator',
      permissions: [
        'user:create',
        'user:read',
        'user:update', 
        'user:delete',
        'case:create',
        'case:read',
        'case:update',
        'case:delete',
        'evidence:create',
        'evidence:read',
        'evidence:update',
        'evidence:delete',
        'role:create',
        'role:read',
        'role:update',
        'role:delete',
      ],
    },
  });

  const investigatorRole = await prisma.role.upsert({
    where: { name: 'investigator' },
    update: {},
    create: {
      name: 'investigator',
      description: 'Case Investigator',
      permissions: [
        'case:create',
        'case:read',
        'case:update',
        'evidence:create',
        'evidence:read',
        'evidence:update',
      ],
    },
  });

  const analystRole = await prisma.role.upsert({
    where: { name: 'analyst' },
    update: {},
    create: {
      name: 'analyst',
      description: 'Evidence Analyst',
      permissions: [
        'case:read',
        'evidence:read',
        'evidence:update',
      ],
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: 'viewer' },
    update: {},
    create: {
      name: 'viewer',
      description: 'Read-only Access',
      permissions: [
        'case:read',
        'evidence:read',
      ],
    },
  });

  console.log('Created default roles');

  // Create default admin user
  const adminPasswordHash = await hashPassword('admin123!');
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@evidence-platform.local' },
    update: {},
    create: {
      email: 'admin@evidence-platform.local',
      username: 'admin',
      firstName: 'System',
      lastName: 'Administrator',
      passwordHash: adminPasswordHash,
      isActive: true,
      emailVerified: true,
    },
  });

  // Assign admin role to admin user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  console.log('Created default admin user');

  // Create sample investigator
  const investigatorPasswordHash = await hashPassword('investigator123!');
  
  const investigatorUser = await prisma.user.upsert({
    where: { email: 'investigator@evidence-platform.local' },
    update: {},
    create: {
      email: 'investigator@evidence-platform.local',
      username: 'investigator',
      firstName: 'John',
      lastName: 'Investigator',
      passwordHash: investigatorPasswordHash,
      isActive: true,
      emailVerified: true,
    },
  });

  // Assign investigator role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: investigatorUser.id,
        roleId: investigatorRole.id,
      },
    },
    update: {},
    create: {
      userId: investigatorUser.id,
      roleId: investigatorRole.id,
    },
  });

  console.log('Created sample investigator user');

  // Create sample tags
  const tags = [
    { name: 'urgent', color: '#ff4444', description: 'Urgent cases' },
    { name: 'digital-forensics', color: '#0066cc', description: 'Digital forensics cases' },
    { name: 'physical-evidence', color: '#00aa44', description: 'Physical evidence cases' },
    { name: 'financial', color: '#ff8800', description: 'Financial investigation cases' },
    { name: 'cybercrime', color: '#8844ff', description: 'Cybercrime cases' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }

  console.log('Created sample tags');

  // Create sample case
  const sampleCase = await prisma.case.upsert({
    where: { caseNumber: 'CASE-SAMPLE-001' },
    update: {},
    create: {
      caseNumber: 'CASE-SAMPLE-001',
      title: 'Sample Investigation Case',
      description: 'This is a sample case for demonstration purposes. It shows how cases are structured and managed within the evidence platform.',
      status: 'ACTIVE',
      priority: 'MEDIUM',
      assignedToId: investigatorUser.id,
      createdById: adminUser.id,
    },
  });

  // Assign tags to sample case
  const urgentTag = await prisma.tag.findUnique({ where: { name: 'urgent' } });
  const digitalTag = await prisma.tag.findUnique({ where: { name: 'digital-forensics' } });

  if (urgentTag) {
    await prisma.caseTag.upsert({
      where: {
        caseId_tagId: {
          caseId: sampleCase.id,
          tagId: urgentTag.id,
        },
      },
      update: {},
      create: {
        caseId: sampleCase.id,
        tagId: urgentTag.id,
      },
    });
  }

  if (digitalTag) {
    await prisma.caseTag.upsert({
      where: {
        caseId_tagId: {
          caseId: sampleCase.id,
          tagId: digitalTag.id,
        },
      },
      update: {},
      create: {
        caseId: sampleCase.id,
        tagId: digitalTag.id,
      },
    });
  }

  console.log('Created sample case');

  // Create sample evidence items
  const evidenceItems = [
    {
      itemNumber: 'CASE-SAMPLE-001-E001',
      title: 'Laptop Computer',
      description: 'Dell Laptop recovered from suspect\'s residence',
      type: 'DIGITAL',
      status: 'COLLECTED',
      location: 'Evidence Locker A-123',
      metadata: {
        make: 'Dell',
        model: 'Inspiron 15',
        serialNumber: 'DL123456789',
        condition: 'Good',
      },
    },
    {
      itemNumber: 'CASE-SAMPLE-001-E002',
      title: 'USB Flash Drive',
      description: '32GB USB drive found in laptop bag',
      type: 'DIGITAL',
      status: 'PROCESSING',
      location: 'Forensics Lab B-456',
      metadata: {
        capacity: '32GB',
        brand: 'SanDisk',
        color: 'Black',
      },
    },
    {
      itemNumber: 'CASE-SAMPLE-001-E003',
      title: 'Printed Documents',
      description: 'Stack of printed emails and financial records',
      type: 'DOCUMENT',
      status: 'ANALYZED',
      location: 'Document Storage C-789',
      metadata: {
        pageCount: 47,
        dateRange: '2023-01-01 to 2023-12-31',
      },
    },
  ];

  for (const evidence of evidenceItems) {
    await prisma.evidenceItem.upsert({
      where: { 
        caseId_itemNumber: {
          caseId: sampleCase.id,
          itemNumber: evidence.itemNumber,
        },
      },
      update: {},
      create: {
        ...evidence,
        caseId: sampleCase.id,
        collectedById: investigatorUser.id,
        collectedAt: new Date(),
        chainOfCustody: [{
          action: 'COLLECTED',
          userId: investigatorUser.id,
          timestamp: new Date().toISOString(),
          location: evidence.location,
          notes: 'Evidence collected during search warrant execution',
        }],
      },
    });
  }

  console.log('Created sample evidence items');

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
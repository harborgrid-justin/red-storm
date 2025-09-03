import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config';

// Chain of custody interfaces
export interface ChainOfCustodyEntry {
  id: string;
  action: string;
  userId: string;
  timestamp: string;
  location: string;
  notes: string;
  digitalSignature?: string;
  metadata?: any;
  approvals?: CustodyApproval[];
  integrityCheck?: {
    hash: string;
    algorithm: string;
    verified: boolean;
    timestamp: string;
  };
}

export interface CustodyApproval {
  userId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timestamp?: string;
  notes?: string;
  digitalSignature?: string;
}

export interface CustodyTransferRequest {
  evidenceId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
  location: string;
  approvalRequired: boolean;
  approvers?: string[];
  scheduledAt?: Date;
  notes?: string;
}

export interface IntegrityVerificationResult {
  evidenceId: string;
  verified: boolean;
  currentHash: string;
  originalHash: string;
  algorithm: string;
  verifiedAt: Date;
  discrepancies?: string[];
}

// Enhanced Chain of Custody Service
export class ChainOfCustodyService {
  private rsaKeys: { publicKey: string; privateKey: string } | null = null;
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeRSAKeys();
    this.initializeEmailTransporter();
  }

  // Initialize RSA key pair for digital signatures
  private async initializeRSAKeys(): Promise<void> {
    try {
      const keyPairPath = path.join(process.cwd(), 'keys');
      const publicKeyPath = path.join(keyPairPath, 'public.pem');
      const privateKeyPath = path.join(keyPairPath, 'private.pem');

      // Check if keys exist
      try {
        const publicKey = await fs.readFile(publicKeyPath, 'utf8');
        const privateKey = await fs.readFile(privateKeyPath, 'utf8');
        this.rsaKeys = { publicKey, privateKey };
        logger.info('RSA keys loaded successfully');
        return;
      } catch (error) {
        // Keys don't exist, generate new ones
      }

      // Generate new RSA key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      // Ensure keys directory exists
      await fs.mkdir(keyPairPath, { recursive: true });

      // Save keys to disk
      await fs.writeFile(publicKeyPath, publicKey);
      await fs.writeFile(privateKeyPath, privateKey);
      await fs.chmod(privateKeyPath, 0o600); // Restrict private key access

      this.rsaKeys = { publicKey, privateKey };
      logger.info('New RSA key pair generated and saved');
    } catch (error) {
      logger.error('Failed to initialize RSA keys', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Initialize email transporter for custody alerts
  private initializeEmailTransporter(): void {
    try {
      const emailConfig = config.email || {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      };

      this.emailTransporter = nodemailer.createTransporter(emailConfig);
      logger.info('Email transporter initialized successfully');
    } catch (error) {
      logger.warn('Email transporter initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Generate digital signature for custody entry
  private generateDigitalSignature(data: string): string | null {
    if (!this.rsaKeys?.privateKey) {
      logger.warn('RSA private key not available for signing');
      return null;
    }

    try {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(data);
      return sign.sign(this.rsaKeys.privateKey, 'base64');
    } catch (error) {
      logger.error('Failed to generate digital signature', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // Verify digital signature
  public verifyDigitalSignature(data: string, signature: string): boolean {
    if (!this.rsaKeys?.publicKey) {
      logger.warn('RSA public key not available for verification');
      return false;
    }

    try {
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(data);
      return verify.verify(this.rsaKeys.publicKey, signature, 'base64');
    } catch (error) {
      logger.error('Failed to verify digital signature', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Calculate file integrity hash
  private async calculateIntegrityHash(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Add immutable chain of custody entry
  async addCustodyEntry(
    evidenceId: string,
    action: string,
    userId: string,
    metadata?: any,
    location?: string,
    notes?: string,
    filePath?: string
  ): Promise<ChainOfCustodyEntry> {
    try {
      // Get current evidence and user data
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
        include: {
          case: { select: { caseNumber: true } },
          collectedBy: { select: { email: true, firstName: true, lastName: true } },
        },
      });

      if (!evidence) {
        throw new Error(`Evidence ${evidenceId} not found`);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      });

      // Create custody entry
      const custodyEntry: ChainOfCustodyEntry = {
        id: crypto.randomUUID(),
        action,
        userId,
        timestamp: new Date().toISOString(),
        location: location || 'System',
        notes: notes || `${action.replace('_', ' ').toLowerCase()} by ${user?.email || 'Unknown User'}`,
        metadata,
      };

      // Generate integrity check if file path provided
      if (filePath) {
        try {
          const hash = await this.calculateIntegrityHash(filePath);
          custodyEntry.integrityCheck = {
            hash,
            algorithm: 'SHA-256',
            verified: true,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          logger.warn('Failed to calculate integrity hash', {
            evidenceId,
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Generate digital signature
      const signatureData = JSON.stringify({
        evidenceId,
        action,
        userId,
        timestamp: custodyEntry.timestamp,
        location: custodyEntry.location,
        integrityHash: custodyEntry.integrityCheck?.hash,
      });

      custodyEntry.digitalSignature = this.generateDigitalSignature(signatureData) || undefined;

      // Update evidence with new custody entry
      const currentChainOfCustody = evidence.chainOfCustody as any[] || [];
      const updatedChainOfCustody = [...currentChainOfCustody, custodyEntry];

      await prisma.evidenceItem.update({
        where: { id: evidenceId },
        data: {
          chainOfCustody: updatedChainOfCustody,
        },
      });

      // Log custody update
      logger.info('Chain of custody entry added', {
        evidenceId,
        caseNumber: evidence.case.caseNumber,
        action,
        userId: user?.email,
        signature: custodyEntry.digitalSignature ? 'SIGNED' : 'UNSIGNED',
      });

      // Send custody alert email if configured
      await this.sendCustodyAlert(evidence, custodyEntry, user);

      return custodyEntry;
    } catch (error) {
      logger.error('Failed to add custody entry', {
        evidenceId,
        action,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Create custody transfer request with multi-party approval
  async createCustodyTransfer(request: CustodyTransferRequest): Promise<string> {
    try {
      const transferId = crypto.randomUUID();

      // Validate users
      const [fromUser, toUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: request.fromUserId } }),
        prisma.user.findUnique({ where: { id: request.toUserId } }),
      ]);

      if (!fromUser || !toUser) {
        throw new Error('Invalid user IDs in transfer request');
      }

      // Create transfer record
      await prisma.custodyTransfer.create({
        data: {
          id: transferId,
          evidenceId: request.evidenceId,
          fromUserId: request.fromUserId,
          toUserId: request.toUserId,
          reason: request.reason,
          location: request.location,
          status: request.approvalRequired ? 'PENDING_APPROVAL' : 'APPROVED',
          requestedAt: new Date(),
          scheduledAt: request.scheduledAt,
          notes: request.notes,
          approvers: request.approvers || [] as any,
          approvals: request.approvers?.map(approverId => ({
            userId: approverId,
            status: 'PENDING' as const,
          })) || [] as any,
        },
      });

      // Send approval requests if needed
      if (request.approvalRequired && request.approvers) {
        await this.sendApprovalRequests(transferId, request);
      }

      // Add custody entry for transfer request
      await this.addCustodyEntry(
        request.evidenceId,
        'TRANSFER_REQUESTED',
        request.fromUserId,
        {
          transferId,
          toUserId: request.toUserId,
          reason: request.reason,
          approvalRequired: request.approvalRequired,
        },
        request.location,
        `Custody transfer requested to ${toUser.email}`
      );

      logger.info('Custody transfer request created', {
        transferId,
        evidenceId: request.evidenceId,
        fromUser: fromUser.email,
        toUser: toUser.email,
        approvalRequired: request.approvalRequired,
      });

      return transferId;
    } catch (error) {
      logger.error('Failed to create custody transfer', {
        evidenceId: request.evidenceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Approve or reject custody transfer
  async approveCustodyTransfer(
    transferId: string,
    approverId: string,
    status: 'APPROVED' | 'REJECTED',
    notes?: string
  ): Promise<void> {
    try {
      const transfer = await prisma.custodyTransfer.findUnique({
        where: { id: transferId },
        include: {
          evidence: { include: { case: { select: { caseNumber: true } } } },
          fromUser: { select: { email: true, firstName: true, lastName: true } },
          toUser: { select: { email: true, firstName: true, lastName: true } },
        },
      });

      if (!transfer) {
        throw new Error('Custody transfer not found');
      }

      // Update approval status
      const approvals = transfer.approvals as any as CustodyApproval[];
      const approvalIndex = approvals.findIndex(approval => approval.userId === approverId);

      if (approvalIndex === -1) {
        throw new Error('User not authorized to approve this transfer');
      }

      approvals[approvalIndex] = {
        ...approvals[approvalIndex],
        status,
        timestamp: new Date().toISOString(),
        notes,
      };

      // Check if all approvals are complete
      const pendingApprovals = approvals.filter(approval => approval.status === 'PENDING');
      const rejectedApprovals = approvals.filter(approval => approval.status === 'REJECTED');

      let transferStatus = transfer.status;
      if (rejectedApprovals.length > 0) {
        transferStatus = 'REJECTED';
      } else if (pendingApprovals.length === 0) {
        transferStatus = 'APPROVED';
      }

      // Update transfer record
      await prisma.custodyTransfer.update({
        where: { id: transferId },
        data: {
          approvals: approvals as any,
          status: transferStatus,
          reviewedAt: transferStatus !== 'PENDING_APPROVAL' ? new Date() : null,
        },
      });

      // Execute transfer if approved
      if (transferStatus === 'APPROVED') {
        await this.executeCustodyTransfer(transferId);
      }

      // Add custody entry for approval/rejection
      await this.addCustodyEntry(
        transfer.evidenceId,
        status === 'APPROVED' ? 'TRANSFER_APPROVED' : 'TRANSFER_REJECTED',
        approverId,
        {
          transferId,
          approverNotes: notes,
        },
        undefined,
        `Custody transfer ${status.toLowerCase()} by ${approverId}`
      );

      logger.info('Custody transfer approval updated', {
        transferId,
        approverId,
        status,
        transferStatus,
      });
    } catch (error) {
      logger.error('Failed to approve custody transfer', {
        transferId,
        approverId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Execute approved custody transfer
  private async executeCustodyTransfer(transferId: string): Promise<void> {
    const transfer = await prisma.custodyTransfer.findUnique({
      where: { id: transferId },
      include: {
        evidence: true,
        fromUser: { select: { email: true } },
        toUser: { select: { email: true } },
      },
    });

    if (!transfer) {
      throw new Error('Transfer not found');
    }

    // Add custody entries for the transfer
    await this.addCustodyEntry(
      transfer.evidenceId,
      'CUSTODY_TRANSFERRED',
      transfer.fromUserId,
      {
        transferId,
        toUserId: transfer.toUserId,
        reason: transfer.reason,
      },
      transfer.location,
      `Custody transferred from ${transfer.fromUser.email} to ${transfer.toUser.email}`
    );

    await this.addCustodyEntry(
      transfer.evidenceId,
      'CUSTODY_RECEIVED',
      transfer.toUserId,
      {
        transferId,
        fromUserId: transfer.fromUserId,
        reason: transfer.reason,
      },
      transfer.location,
      `Custody received from ${transfer.fromUser.email}`
    );

    // Update transfer as completed
    await prisma.custodyTransfer.update({
      where: { id: transferId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  // Verify evidence integrity
  async verifyIntegrity(evidenceId: string, filePath?: string): Promise<IntegrityVerificationResult> {
    try {
      const evidence = await prisma.evidenceItem.findUnique({
        where: { id: evidenceId },
      });

      if (!evidence) {
        throw new Error('Evidence not found');
      }

      const chainOfCustody = evidence.chainOfCustody as any as ChainOfCustodyEntry[];
      const originalEntry = chainOfCustody.find(entry => entry.integrityCheck);
      
      if (!originalEntry?.integrityCheck) {
        throw new Error('No original integrity hash found');
      }

      let currentHash = '';
      let verified = false;
      const discrepancies: string[] = [];

      if (filePath) {
        currentHash = await this.calculateIntegrityHash(filePath);
        verified = currentHash === originalEntry.integrityCheck.hash;

        if (!verified) {
          discrepancies.push('File hash mismatch');
        }
      }

      // Verify digital signatures in chain of custody
      for (const entry of chainOfCustody) {
        if (entry.digitalSignature) {
          const signatureData = JSON.stringify({
            evidenceId,
            action: entry.action,
            userId: entry.userId,
            timestamp: entry.timestamp,
            location: entry.location,
            integrityHash: entry.integrityCheck?.hash,
          });

          const signatureValid = this.verifyDigitalSignature(signatureData, entry.digitalSignature);
          if (!signatureValid) {
            discrepancies.push(`Invalid digital signature for entry ${entry.id}`);
            verified = false;
          }
        }
      }

      const result: IntegrityVerificationResult = {
        evidenceId,
        verified,
        currentHash,
        originalHash: originalEntry.integrityCheck.hash,
        algorithm: originalEntry.integrityCheck.algorithm,
        verifiedAt: new Date(),
        discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
      };

      // Add custody entry for verification
      await this.addCustodyEntry(
        evidenceId,
        'INTEGRITY_VERIFIED',
        'system', // System-generated entry
        {
          verificationResult: result,
        },
        undefined,
        `Integrity verification: ${verified ? 'PASSED' : 'FAILED'}`
      );

      logger.info('Evidence integrity verification completed', {
        evidenceId,
        verified,
        discrepancies: discrepancies.length,
      });

      return result;
    } catch (error) {
      logger.error('Evidence integrity verification failed', {
        evidenceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Send custody alert email
  private async sendCustodyAlert(
    evidence: any,
    custodyEntry: ChainOfCustodyEntry,
    user: any
  ): Promise<void> {
    if (!this.emailTransporter) {
      logger.warn('Email transporter not configured, skipping custody alert');
      return;
    }

    try {
      const subject = `Custody Alert: ${custodyEntry.action} - Case ${evidence.case.caseNumber}`;
      const body = `
        <h2>Chain of Custody Alert</h2>
        <p><strong>Case Number:</strong> ${evidence.case.caseNumber}</p>
        <p><strong>Evidence Item:</strong> ${evidence.itemNumber}</p>
        <p><strong>Action:</strong> ${custodyEntry.action}</p>
        <p><strong>User:</strong> ${user?.email || 'Unknown'}</p>
        <p><strong>Timestamp:</strong> ${custodyEntry.timestamp}</p>
        <p><strong>Location:</strong> ${custodyEntry.location}</p>
        <p><strong>Notes:</strong> ${custodyEntry.notes}</p>
        ${custodyEntry.digitalSignature ? '<p><strong>Status:</strong> Digitally Signed ✓</p>' : ''}
        ${custodyEntry.integrityCheck ? `<p><strong>Integrity Hash:</strong> ${custodyEntry.integrityCheck.hash}</p>` : ''}
      `;

      // Send to case participants (simplified for now)
      const recipients = [evidence.collectedBy.email];

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@evidence-platform.local',
        to: recipients.join(', '),
        subject,
        html: body,
      });

      logger.info('Custody alert email sent', {
        evidenceId: evidence.id,
        recipients: recipients.length,
        action: custodyEntry.action,
      });
    } catch (error) {
      logger.warn('Failed to send custody alert email', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Send approval requests
  private async sendApprovalRequests(
    transferId: string,
    request: CustodyTransferRequest
  ): Promise<void> {
    if (!this.emailTransporter || !request.approvers) {
      return;
    }

    try {
      const approvers = await prisma.user.findMany({
        where: { id: { in: request.approvers } },
        select: { email: true },
      });

      const subject = `Custody Transfer Approval Required - Evidence ${request.evidenceId}`;
      const body = `
        <h2>Custody Transfer Approval Request</h2>
        <p>A custody transfer requires your approval:</p>
        <p><strong>Evidence ID:</strong> ${request.evidenceId}</p>
        <p><strong>From:</strong> ${request.fromUserId}</p>
        <p><strong>To:</strong> ${request.toUserId}</p>
        <p><strong>Reason:</strong> ${request.reason}</p>
        <p><strong>Location:</strong> ${request.location}</p>
        <p>Please review and approve/reject this transfer through the evidence management system.</p>
      `;

      for (const approver of approvers) {
        await this.emailTransporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@evidence-platform.local',
          to: approver.email,
          subject,
          html: body,
        });
      }

      logger.info('Custody transfer approval requests sent', {
        transferId,
        approvers: approvers.length,
      });
    } catch (error) {
      logger.warn('Failed to send approval requests', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const chainOfCustodyService = new ChainOfCustodyService();

export default chainOfCustodyService;
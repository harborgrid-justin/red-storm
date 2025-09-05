import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import * as schedule from 'node-schedule';
import { logger } from '../config/logger';
import { analyticsService } from './analyticsService';
import nodemailer from 'nodemailer';
import { config } from '../config';

const prisma = new PrismaClient();

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  templateType: 'analytics' | 'case' | 'evidence' | 'court' | 'compliance';
  htmlTemplate: string;
  parameters: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportSchedule {
  id: string;
  name: string;
  templateId: string;
  cronExpression: string;
  recipients: string[];
  parameters: Record<string, any>;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
}

export interface ReportGenerationRequest {
  templateId: string;
  format: 'pdf' | 'html' | 'json';
  parameters?: Record<string, any>;
  caseId?: string;
  evidenceId?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
}

export interface GeneratedReport {
  id: string;
  name: string;
  format: string;
  filePath?: string;
  content?: string;
  generatedAt: Date;
  generatedBy: string;
  parameters: Record<string, any>;
}

export class ReportGenerationService {
  private scheduledJobs = new Map<string, schedule.Job>();
  private templates = new Map<string, ReportTemplate>();

  constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default report templates
   */
  private initializeDefaultTemplates() {
    // Analytics Dashboard Template
    this.templates.set('analytics-dashboard', {
      id: 'analytics-dashboard',
      name: 'Analytics Dashboard Report',
      description: 'Comprehensive analytics dashboard with KPIs and trends',
      templateType: 'analytics',
      htmlTemplate: this.getAnalyticsDashboardTemplate(),
      parameters: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Case Summary Template
    this.templates.set('case-summary', {
      id: 'case-summary',
      name: 'Case Summary Report',
      description: 'Detailed case summary with evidence and timeline',
      templateType: 'case',
      htmlTemplate: this.getCaseSummaryTemplate(),
      parameters: { caseId: '' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Court-Ready Evidence Template
    this.templates.set('court-evidence', {
      id: 'court-evidence',
      name: 'Court-Ready Evidence Report',
      description: 'Formal evidence report with chain of custody for court proceedings',
      templateType: 'court',
      htmlTemplate: this.getCourtEvidenceTemplate(),
      parameters: { caseId: '', evidenceIds: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Compliance Audit Template
    this.templates.set('compliance-audit', {
      id: 'compliance-audit',
      name: 'Compliance Audit Report',
      description: 'Regulatory compliance report with audit trail',
      templateType: 'compliance',
      htmlTemplate: this.getComplianceAuditTemplate(),
      parameters: { auditType: 'general' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Generate a report based on template and parameters
   */
  async generateReport(request: ReportGenerationRequest, userId: string): Promise<GeneratedReport> {
    try {
      const template = this.templates.get(request.templateId);
      if (!template) {
        throw new Error(`Template not found: ${request.templateId}`);
      }

      const reportData = await this.gatherReportData(template, request);
      const htmlContent = await this.renderTemplate(template, reportData);

      let content: string | undefined;
      let filePath: string | undefined;

      switch (request.format) {
        case 'html':
          content = htmlContent;
          break;
        case 'pdf':
          filePath = await this.generatePDF(htmlContent, template.name);
          break;
        case 'json':
          content = JSON.stringify(reportData, null, 2);
          break;
        default:
          throw new Error(`Unsupported format: ${request.format}`);
      }

      const report: GeneratedReport = {
        id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `${template.name}_${new Date().toISOString().split('T')[0]}`,
        format: request.format,
        filePath,
        content,
        generatedAt: new Date(),
        generatedBy: userId,
        parameters: request.parameters || {},
      };

      logger.info('Report generated successfully', {
        reportId: report.id,
        templateId: request.templateId,
        format: request.format,
        userId,
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate report', {
        error: error instanceof Error ? error.message : String(error),
        templateId: request.templateId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Gather data for report generation
   */
  private async gatherReportData(template: ReportTemplate, request: ReportGenerationRequest): Promise<any> {
    const data: any = {};

    switch (template.templateType) {
      case 'analytics':
        data.analytics = await analyticsService.getDashboardAnalytics(request.dateRange);
        data.performance = await analyticsService.getPerformanceMetrics();
        data.heatmap = await analyticsService.getEvidenceAccessHeatmap();
        break;

      case 'case':
        if (request.caseId) {
          data.case = await this.getCaseData(request.caseId);
          data.evidence = await this.getCaseEvidenceData(request.caseId);
          data.timeline = await this.getCaseTimelineData(request.caseId);
        }
        break;

      case 'evidence':
        if (request.evidenceId) {
          data.evidence = await this.getEvidenceData(request.evidenceId);
          data.chainOfCustody = await this.getChainOfCustodyData(request.evidenceId);
        }
        break;

      case 'court':
        if (request.caseId) {
          data.case = await this.getCaseData(request.caseId);
          data.evidence = await this.getCaseEvidenceData(request.caseId);
          data.chainOfCustody = await this.getAllChainOfCustodyData(request.caseId);
          data.auditTrail = await this.getAuditTrailData(request.caseId);
        }
        break;

      case 'compliance':
        data.auditLog = await this.getComplianceAuditData(request.dateRange);
        data.userActivity = await this.getUserComplianceData(request.dateRange);
        data.systemCompliance = await this.getSystemComplianceData();
        break;
    }

    data.generatedAt = new Date().toISOString();
    data.parameters = request.parameters || {};

    return data;
  }

  /**
   * Render template with data
   */
  private async renderTemplate(template: ReportTemplate, data: any): Promise<string> {
    let html = template.htmlTemplate;

    // Simple template rendering (replace variables)
    const variables = html.match(/\{\{([^}]+)\}\}/g) || [];
    
    for (const variable of variables) {
      const key = variable.replace(/[{}]/g, '');
      const value = this.getNestedValue(data, key);
      html = html.replace(variable, value !== undefined ? String(value) : '');
    }

    return html;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Generate PDF from HTML content
   */
  private async generatePDF(htmlContent: string, reportName: string): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${reportName}_${timestamp}.pdf`;
      const filePath = `/tmp/reports/${filename}`;

      // Ensure directory exists
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      return filePath;
    } finally {
      await browser.close();
    }
  }

  /**
   * Schedule automatic report generation
   */
  async scheduleReport(schedule: Omit<ReportSchedule, 'id' | 'createdAt'>): Promise<ReportSchedule> {
    const reportSchedule: ReportSchedule = {
      ...schedule,
      id: `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    const job = require('node-schedule').scheduleJob(
      reportSchedule.cronExpression,
      async () => {
        try {
          await this.executeScheduledReport(reportSchedule);
        } catch (error) {
          logger.error('Scheduled report execution failed', {
            scheduleId: reportSchedule.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    this.scheduledJobs.set(reportSchedule.id, job);

    logger.info('Report scheduled successfully', {
      scheduleId: reportSchedule.id,
      cronExpression: reportSchedule.cronExpression,
    });

    return reportSchedule;
  }

  /**
   * Execute a scheduled report
   */
  private async executeScheduledReport(schedule: ReportSchedule) {
    try {
      const report = await this.generateReport({
        templateId: schedule.templateId,
        format: 'pdf',
        parameters: schedule.parameters,
      }, 'system');

      if (schedule.recipients.length > 0) {
        await this.emailReport(report, schedule.recipients, schedule.name);
      }

      // Update last run time
      schedule.lastRunAt = new Date();
      
      logger.info('Scheduled report executed successfully', {
        scheduleId: schedule.id,
        reportId: report.id,
      });
    } catch (error) {
      logger.error('Failed to execute scheduled report', {
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Email report to recipients
   */
  private async emailReport(report: GeneratedReport, recipients: string[], scheduleName: string) {
    // Check if email is configured (simplified check)
    if (!config.email?.host) {
      logger.warn('Email not configured, skipping report email');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.auth.user,
        pass: config.email.auth.pass,
      },
    });

    const attachments: any[] = [];
    if (report.filePath) {
      attachments.push({
        filename: `${report.name}.${report.format}`,
        path: report.filePath,
      });
    }

    await transporter.sendMail({
      from: config.email.from,
      to: recipients.join(', '),
      subject: `Scheduled Report: ${scheduleName}`,
      html: `
        <h2>Scheduled Report: ${scheduleName}</h2>
        <p>Your scheduled report has been generated and is attached to this email.</p>
        <ul>
          <li><strong>Report Name:</strong> ${report.name}</li>
          <li><strong>Generated At:</strong> ${report.generatedAt.toISOString()}</li>
          <li><strong>Format:</strong> ${report.format.toUpperCase()}</li>
        </ul>
        ${report.content ? `<pre>${report.content}</pre>` : ''}
      `,
      attachments,
    });

    logger.info('Report emailed successfully', {
      reportId: report.id,
      recipients: recipients.length,
    });
  }

  /**
   * Get available templates
   */
  getTemplates(): ReportTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): ReportTemplate | undefined {
    return this.templates.get(id);
  }

  // Data gathering methods

  private async getCaseData(caseId: string) {
    return await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        assignedTo: {
          select: { firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });
  }

  private async getCaseEvidenceData(caseId: string) {
    return await prisma.evidenceItem.findMany({
      where: { caseId },
      include: {
        collectedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { collectedAt: 'asc' },
    });
  }

  private async getCaseTimelineData(caseId: string) {
    return await prisma.auditLog.findMany({
      where: {
        OR: [
          { resource: 'case', resourceId: caseId },
          { resource: 'evidence', resourceId: { in: await this.getCaseEvidenceIds(caseId) } },
        ],
      },
      include: {
        user: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  private async getCaseEvidenceIds(caseId: string): Promise<string[]> {
    const evidence = await prisma.evidenceItem.findMany({
      where: { caseId },
      select: { id: true },
    });
    return evidence.map(e => e.id);
  }

  private async getEvidenceData(evidenceId: string) {
    return await prisma.evidenceItem.findUnique({
      where: { id: evidenceId },
      include: {
        case: true,
        collectedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });
  }

  private async getChainOfCustodyData(evidenceId: string) {
    return await prisma.custodyTransfer.findMany({
      where: { evidenceId },
      include: {
        fromUser: {
          select: { firstName: true, lastName: true, email: true },
        },
        toUser: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });
  }

  private async getAllChainOfCustodyData(caseId: string) {
    const evidenceIds = await this.getCaseEvidenceIds(caseId);
    return await prisma.custodyTransfer.findMany({
      where: { evidenceId: { in: evidenceIds } },
      include: {
        evidence: {
          select: { title: true, itemNumber: true },
        },
        fromUser: {
          select: { firstName: true, lastName: true, email: true },
        },
        toUser: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });
  }

  private async getAuditTrailData(caseId: string) {
    const evidenceIds = await this.getCaseEvidenceIds(caseId);
    return await prisma.auditLog.findMany({
      where: {
        OR: [
          { resource: 'case', resourceId: caseId },
          { resource: 'evidence', resourceId: { in: evidenceIds } },
        ],
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  private async getComplianceAuditData(dateRange?: { from: Date; to: Date }) {
    const whereClause = dateRange ? {
      timestamp: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    } : {};

    return await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 1000, // Limit for performance
    });
  }

  private async getUserComplianceData(dateRange?: { from: Date; to: Date }) {
    const whereClause = dateRange ? {
      lastLogin: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    } : {};

    return await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        lastLogin: true,
        isActive: true,
        roles: {
          include: { role: true },
        },
      },
    });
  }

  private async getSystemComplianceData() {
    const [totalUsers, activeUsers, totalCases, recentActivity] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.case.count(),
      prisma.auditLog.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      totalCases,
      recentActivity,
      lastComplianceCheck: new Date(),
    };
  }

  // Template content methods

  private getAnalyticsDashboardTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Analytics Dashboard Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .kpi { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
          .chart-section { margin: 20px 0; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Analytics Dashboard Report</h1>
          <p>Generated on: {{generatedAt}}</p>
        </div>
        
        <div class="kpi-section">
          <h2>Key Performance Indicators</h2>
          <div class="kpi">
            <h3>Total Cases</h3>
            <p>{{analytics.totalCases}}</p>
          </div>
          <div class="kpi">
            <h3>Active Cases</h3>
            <p>{{analytics.activeCases}}</p>
          </div>
          <div class="kpi">
            <h3>Total Evidence</h3>
            <p>{{analytics.totalEvidence}}</p>
          </div>
          <div class="kpi">
            <h3>Average Resolution Time</h3>
            <p>{{analytics.averageCaseResolutionTime}} hours</p>
          </div>
        </div>

        <div class="chart-section">
          <h2>Evidence by Type</h2>
          <table>
            <tr><th>Type</th><th>Count</th></tr>
            <!-- Evidence type data would be rendered here -->
          </table>
        </div>

        <div class="performance-section">
          <h2>System Performance</h2>
          <p>Active Users: {{performance.activeUsers}}</p>
          <p>Storage Used: {{performance.storageUsed}} GB</p>
          <p>System Load: {{performance.systemLoad}}</p>
        </div>
      </body>
      </html>
    `;
  }

  private getCaseSummaryTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Case Summary Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .section { margin: 20px 0; }
          .evidence-item { border: 1px solid #ddd; padding: 10px; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Case Summary Report</h1>
          <h2>Case: {{case.title}}</h2>
          <p>Case Number: {{case.caseNumber}}</p>
          <p>Status: {{case.status}}</p>
          <p>Created: {{case.createdAt}}</p>
        </div>
        
        <div class="section">
          <h2>Case Details</h2>
          <p><strong>Description:</strong> {{case.description}}</p>
          <p><strong>Priority:</strong> {{case.priority}}</p>
          <p><strong>Assigned To:</strong> {{case.assignedTo.firstName}} {{case.assignedTo.lastName}}</p>
          <p><strong>Created By:</strong> {{case.createdBy.firstName}} {{case.createdBy.lastName}}</p>
        </div>

        <div class="section">
          <h2>Evidence Summary</h2>
          <!-- Evidence items would be rendered here -->
        </div>

        <div class="section">
          <h2>Case Timeline</h2>
          <!-- Timeline events would be rendered here -->
        </div>
      </body>
      </html>
    `;
  }

  private getCourtEvidenceTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Court-Ready Evidence Report</title>
        <style>
          body { font-family: 'Times New Roman', serif; margin: 20px; line-height: 1.6; }
          .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #000; padding-bottom: 20px; }
          .certification { border: 2px solid #000; padding: 15px; margin: 20px 0; background-color: #f9f9f9; }
          .evidence-section { margin: 30px 0; }
          .chain-of-custody { border: 1px solid #333; padding: 10px; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #000; padding: 8px; text-align: left; }
          th { background-color: #e0e0e0; font-weight: bold; }
          .signature-section { margin-top: 50px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>OFFICIAL EVIDENCE REPORT</h1>
          <h2>Case: {{case.title}}</h2>
          <p>Case Number: {{case.caseNumber}}</p>
          <p>Report Generated: {{generatedAt}}</p>
        </div>
        
        <div class="certification">
          <h3>CERTIFICATION</h3>
          <p>I hereby certify that this report contains a true and accurate record of all evidence collected and maintained in relation to Case {{case.caseNumber}}. The chain of custody has been properly maintained throughout the investigation.</p>
        </div>

        <div class="evidence-section">
          <h2>EVIDENCE INVENTORY</h2>
          <!-- Evidence inventory table would be rendered here -->
        </div>

        <div class="chain-of-custody">
          <h2>CHAIN OF CUSTODY</h2>
          <!-- Chain of custody documentation would be rendered here -->
        </div>

        <div class="signature-section">
          <p>_________________________________</p>
          <p>Investigating Officer Signature</p>
          <p>Date: _______________</p>
        </div>
      </body>
      </html>
    `;
  }

  private getComplianceAuditTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Compliance Audit Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .compliance-section { margin: 20px 0; border: 1px solid #ddd; padding: 15px; }
          .pass { color: green; font-weight: bold; }
          .fail { color: red; font-weight: bold; }
          .warning { color: orange; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Compliance Audit Report</h1>
          <p>Audit Period: {{parameters.auditType}}</p>
          <p>Generated on: {{generatedAt}}</p>
        </div>
        
        <div class="compliance-section">
          <h2>System Compliance Status</h2>
          <p>Total Users: {{systemCompliance.totalUsers}}</p>
          <p>Active Users: {{systemCompliance.activeUsers}}</p>
          <p>Total Cases: {{systemCompliance.totalCases}}</p>
          <p>Recent Activity Events: {{systemCompliance.recentActivity}}</p>
        </div>

        <div class="compliance-section">
          <h2>User Activity Compliance</h2>
          <!-- User activity compliance table would be rendered here -->
        </div>

        <div class="compliance-section">
          <h2>Audit Log Review</h2>
          <!-- Audit log summary would be rendered here -->
        </div>
      </body>
      </html>
    `;
  }
}

export const reportGenerationService = new ReportGenerationService();
import { SearchResult } from './searchService';
import { logger } from '@/config/logger';
import * as csv from 'csv-writer';
import * as ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import fs from 'fs/promises';
import path from 'path';

export interface ExportOptions {
  format: 'csv' | 'excel' | 'pdf';
  filename?: string;
  includeMetadata?: boolean;
  includeHighlights?: boolean;
  customFields?: string[];
}

export interface ExportResult {
  filePath: string;
  filename: string;
  size: number;
  recordCount: number;
}

export class SearchExportService {
  private readonly exportDir: string = './exports';

  constructor() {
    this.ensureExportDirectory();
  }

  private async ensureExportDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create export directory', {
        error: error instanceof Error ? error.message : String(error),
        directory: this.exportDir,
      });
    }
  }

  async exportSearchResults(
    results: SearchResult[],
    options: ExportOptions
  ): Promise<ExportResult> {
    try {
      const filename = options.filename || this.generateFilename(options.format);
      const filePath = path.join(this.exportDir, filename);

      let exportedData: ExportResult;

      switch (options.format) {
        case 'csv':
          exportedData = await this.exportToCSV(results, filePath, options);
          break;
        case 'excel':
          exportedData = await this.exportToExcel(results, filePath, options);
          break;
        case 'pdf':
          exportedData = await this.exportToPDF(results, filePath, options);
          break;
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      logger.info('Search results exported successfully', {
        format: options.format,
        filename,
        recordCount: results.length,
        size: exportedData.size,
      });

      return exportedData;
    } catch (error) {
      logger.error('Failed to export search results', {
        error: error instanceof Error ? error.message : String(error),
        format: options.format,
        recordCount: results.length,
      });
      throw error;
    }
  }

  private async exportToCSV(
    results: SearchResult[],
    filePath: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const headers = this.buildCSVHeaders(options);
    const records = this.buildCSVRecords(results, options);

    const csvWriter = csv.createObjectCsvWriter({
      path: filePath,
      header: headers,
    });

    await csvWriter.writeRecords(records);

    const stats = await fs.stat(filePath);

    return {
      filePath,
      filename: path.basename(filePath),
      size: stats.size,
      recordCount: results.length,
    };
  }

  private buildCSVHeaders(options: ExportOptions): Array<{ id: string; title: string }> {
    const baseHeaders = [
      { id: 'id', title: 'ID' },
      { id: 'type', title: 'Type' },
      { id: 'title', title: 'Title' },
      { id: 'description', title: 'Description' },
      { id: 'score', title: 'Relevance Score' },
      { id: 'caseId', title: 'Case ID' },
      { id: 'evidenceId', title: 'Evidence ID' },
    ];

    if (options.includeMetadata) {
      baseHeaders.push(
        { id: 'metadata', title: 'Metadata' }
      );
    }

    if (options.includeHighlights) {
      baseHeaders.push(
        { id: 'highlights', title: 'Highlights' }
      );
    }

    if (options.customFields) {
      const customHeaders = options.customFields.map(field => ({
        id: field,
        title: field.charAt(0).toUpperCase() + field.slice(1),
      }));
      baseHeaders.push(...customHeaders);
    }

    return baseHeaders;
  }

  private buildCSVRecords(results: SearchResult[], options: ExportOptions): any[] {
    return results.map(result => {
      const record: any = {
        id: result.id,
        type: result.type,
        title: result.title,
        description: result.description || '',
        score: result.score.toFixed(3),
        caseId: result.caseId || '',
        evidenceId: result.evidenceId || '',
      };

      if (options.includeMetadata) {
        record.metadata = JSON.stringify(result.metadata);
      }

      if (options.includeHighlights) {
        record.highlights = JSON.stringify(result.highlights);
      }

      if (options.customFields) {
        options.customFields.forEach(field => {
          record[field] = this.extractNestedProperty(result, field) || '';
        });
      }

      return record;
    });
  }

  private async exportToExcel(
    results: SearchResult[],
    filePath: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Search Results');

    // Define columns
    const columns = [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Relevance Score', key: 'score', width: 15 },
      { header: 'Case ID', key: 'caseId', width: 20 },
      { header: 'Evidence ID', key: 'evidenceId', width: 20 },
    ];

    if (options.includeMetadata) {
      columns.push({ header: 'Metadata', key: 'metadata', width: 50 });
    }

    if (options.includeHighlights) {
      columns.push({ header: 'Highlights', key: 'highlights', width: 50 });
    }

    worksheet.columns = columns;

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' },
    };

    // Add data rows
    results.forEach(result => {
      const row: any = {
        id: result.id,
        type: result.type,
        title: result.title,
        description: result.description || '',
        score: result.score,
        caseId: result.caseId || '',
        evidenceId: result.evidenceId || '',
      };

      if (options.includeMetadata) {
        row.metadata = JSON.stringify(result.metadata, null, 2);
      }

      if (options.includeHighlights) {
        row.highlights = JSON.stringify(result.highlights, null, 2);
      }

      worksheet.addRow(row);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.width && column.width < 10) {
        column.width = 10;
      }
    });

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    await workbook.xlsx.writeFile(filePath);

    const stats = await fs.stat(filePath);

    return {
      filePath,
      filename: path.basename(filePath),
      size: stats.size,
      recordCount: results.length,
    };
  }

  private async exportToPDF(
    results: SearchResult[],
    filePath: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    // Note: jsPDF types need to be extended for autoTable
    const doc = new jsPDF() as any;

    // Add title
    doc.setFontSize(20);
    doc.text('Search Results Export', 20, 20);

    // Add summary
    doc.setFontSize(12);
    doc.text(`Total Records: ${results.length}`, 20, 35);
    doc.text(`Export Date: ${new Date().toLocaleString()}`, 20, 45);

    // Prepare table data
    const tableColumns = ['Type', 'Title', 'Score', 'Case ID'];
    const tableRows = results.map(result => [
      result.type,
      result.title.substring(0, 50) + (result.title.length > 50 ? '...' : ''),
      result.score.toFixed(3),
      result.caseId || 'N/A',
    ]);

    // Add table
    doc.autoTable({
      head: [tableColumns],
      body: tableRows,
      startY: 60,
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [230, 230, 250],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 248, 255],
      },
      margin: { top: 60, left: 20, right: 20 },
    });

    // Add detailed results if requested
    if (options.includeMetadata || options.includeHighlights) {
      let yPosition = doc.lastAutoTable.finalY + 20;

      doc.setFontSize(16);
      doc.text('Detailed Results', 20, yPosition);
      yPosition += 15;

      for (let i = 0; i < Math.min(results.length, 10); i++) { // Limit to first 10 for space
        const result = results[i];
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${i + 1}. ${result.title}`, 20, yPosition);
        yPosition += 10;

        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        
        if (result.description) {
          const description = result.description.substring(0, 200) + 
            (result.description.length > 200 ? '...' : '');
          doc.text(description, 20, yPosition, { maxWidth: 170 });
          yPosition += 15;
        }

        if (options.includeHighlights && result.highlights) {
          doc.text('Highlights:', 20, yPosition);
          yPosition += 8;
          Object.entries(result.highlights).forEach(([field, highlights]) => {
            if (Array.isArray(highlights) && highlights.length > 0) {
              doc.text(`${field}: ${highlights[0]}`, 25, yPosition, { maxWidth: 165 });
              yPosition += 8;
            }
          });
        }

        yPosition += 10;

        // Add new page if needed
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
      }
    }

    doc.save(filePath);

    const stats = await fs.stat(filePath);

    return {
      filePath,
      filename: path.basename(filePath),
      size: stats.size,
      recordCount: results.length,
    };
  }

  private generateFilename(format: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    return `search_results_${timestamp}_${timeStr}.${format}`;
  }

  private extractNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  async cleanupOldExports(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const files = await fs.readdir(this.exportDir);
      const cutoffDate = new Date(Date.now() - maxAge);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile() && stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
          logger.debug('Deleted old export file', { file });
        }
      }

      logger.info('Export cleanup completed', {
        deletedFiles: deletedCount,
        maxAge: maxAge / (24 * 60 * 60 * 1000) + ' days',
      });

      return deletedCount;
    } catch (error) {
      logger.error('Export cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getExportInfo(filename: string): Promise<{ exists: boolean; size?: number; created?: Date }> {
    try {
      const filePath = path.join(this.exportDir, filename);
      const stats = await fs.stat(filePath);

      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
      };
    } catch (error) {
      return { exists: false };
    }
  }
}

export const searchExportService = new SearchExportService();
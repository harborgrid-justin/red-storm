import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  Printer,
  Calendar,
  User,
  Scale,
  FileSignature,
  Building,
  MapPin
} from 'lucide-react';
import { CaseService } from '@/services/cases';
import { WorkflowService } from '@/services/workflows';

interface Case {
  id: string;
  title: string;
  caseNumber: string;
  description?: string;
  status: string;
  priority: string;
  createdAt: string;
  closedAt?: string;
  assignedTo?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  createdBy: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  evidenceItems?: any[];
  tags?: any[];
}

interface ReportGeneratorProps {
  caseId: string;
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ caseId }) => {
  const [loading, setLoading] = useState(false);
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [reportType, setReportType] = useState<'summary' | 'detailed' | 'court' | 'evidence'>('summary');

  const loadCaseData = async () => {
    try {
      setLoading(true);
      const [case_, tasks] = await Promise.all([
        CaseService.getCase(caseId),
        WorkflowService.getCaseTasks(caseId, { limit: 100 })
      ]);
      
      setCaseData({ ...case_, tasks: tasks.data });
    } catch (error) {
      console.error('Failed to load case data:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (caseId) {
      loadCaseData();
    }
  }, [caseId]);

  const generateReport = async (type: 'summary' | 'detailed' | 'court' | 'evidence') => {
    if (!caseData) return;

    try {
      setLoading(true);
      
      // Create HTML content for the report
      const htmlContent = generateReportHTML(type, caseData);
      
      // Create a new window and print
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Auto-print after a delay
        setTimeout(() => {
          printWindow.print();
        }, 1000);
      }
      
    } catch (error) {
      console.error('Failed to generate report:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateReportHTML = (type: string, case_: Case): string => {
    const getUserName = (user?: { firstName?: string; lastName?: string }) => {
      if (!user) return 'Unknown User';
      return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
    };

    const formatDate = (date: string) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const getReportTitle = () => {
      switch (type) {
        case 'detailed': return 'Detailed Case Report';
        case 'court': return 'Court Filing Report';
        case 'evidence': return 'Evidence Inventory Report';
        default: return 'Case Summary Report';
      }
    };

    const baseStyles = `
      <style>
        body { 
          font-family: 'Times New Roman', serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 8.5in; 
          margin: 0 auto; 
          padding: 1in; 
        }
        .header { 
          text-align: center; 
          border-bottom: 2px solid #333; 
          padding-bottom: 20px; 
          margin-bottom: 30px; 
        }
        .header h1 { 
          margin: 0; 
          font-size: 24px; 
          font-weight: bold; 
        }
        .header h2 { 
          margin: 10px 0 0 0; 
          font-size: 18px; 
          font-weight: normal; 
          color: #666; 
        }
        .section { 
          margin: 20px 0; 
        }
        .section h3 { 
          border-bottom: 1px solid #ccc; 
          padding-bottom: 5px; 
          color: #333; 
        }
        .info-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 20px; 
          margin: 15px 0; 
        }
        .info-item { 
          margin: 8px 0; 
        }
        .info-item strong { 
          display: inline-block; 
          width: 120px; 
          font-weight: bold; 
        }
        .evidence-list, .task-list { 
          list-style: none; 
          padding: 0; 
        }
        .evidence-list li, .task-list li { 
          background: #f8f9fa; 
          margin: 10px 0; 
          padding: 15px; 
          border-left: 4px solid #007bff; 
        }
        .priority-critical { border-left-color: #dc3545; }
        .priority-high { border-left-color: #fd7e14; }
        .priority-medium { border-left-color: #ffc107; }
        .priority-low { border-left-color: #28a745; }
        .signature-section { 
          margin-top: 60px; 
          border-top: 1px solid #ccc; 
          padding-top: 20px; 
        }
        .signature-line { 
          border-bottom: 1px solid #333; 
          margin: 40px 20px 10px 20px; 
          height: 40px; 
        }
        .footer { 
          margin-top: 50px; 
          text-align: center; 
          font-size: 12px; 
          color: #666; 
        }
        @media print {
          .no-print { display: none; }
          body { margin: 0; padding: 0.5in; }
        }
      </style>
    `;

    const headerSection = `
      <div class="header">
        <h1>${getReportTitle()}</h1>
        <h2>Case ${case_.caseNumber}</h2>
        <p>Generated on ${formatDate(new Date().toISOString())}</p>
      </div>
    `;

    const caseInfoSection = `
      <div class="section">
        <h3>Case Information</h3>
        <div class="info-grid">
          <div>
            <div class="info-item"><strong>Case Number:</strong> ${case_.caseNumber}</div>
            <div class="info-item"><strong>Title:</strong> ${case_.title}</div>
            <div class="info-item"><strong>Status:</strong> ${case_.status}</div>
            <div class="info-item"><strong>Priority:</strong> ${case_.priority}</div>
          </div>
          <div>
            <div class="info-item"><strong>Created:</strong> ${formatDate(case_.createdAt)}</div>
            ${case_.closedAt ? `<div class="info-item"><strong>Closed:</strong> ${formatDate(case_.closedAt)}</div>` : ''}
            <div class="info-item"><strong>Assigned to:</strong> ${getUserName(case_.assignedTo)}</div>
            <div class="info-item"><strong>Created by:</strong> ${getUserName(case_.createdBy)}</div>
          </div>
        </div>
        ${case_.description ? `
          <div class="info-item">
            <strong>Description:</strong><br>
            <p style="margin-left: 20px; margin-top: 10px;">${case_.description}</p>
          </div>
        ` : ''}
      </div>
    `;

    const evidenceSection = case_.evidenceItems && case_.evidenceItems.length > 0 ? `
      <div class="section">
        <h3>Evidence Items (${case_.evidenceItems.length})</h3>
        <ul class="evidence-list">
          ${case_.evidenceItems.map((item: any) => `
            <li>
              <strong>${item.title || item.itemNumber}</strong><br>
              <div style="margin-top: 8px;">
                <strong>Type:</strong> ${item.type} | 
                <strong>Status:</strong> ${item.status} | 
                <strong>Collected:</strong> ${formatDate(item.collectedAt || item.createdAt)}
                ${item.location ? ` | <strong>Location:</strong> ${item.location}` : ''}
              </div>
              ${item.description ? `<p style="margin-top: 8px; color: #666;">${item.description}</p>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : '';

    const tasksSection = (case_ as any).tasks && (case_ as any).tasks.length > 0 ? `
      <div class="section">
        <h3>Tasks (${(case_ as any).tasks.length})</h3>
        <ul class="task-list">
          ${(case_ as any).tasks.map((task: any) => `
            <li class="priority-${task.priority.toLowerCase()}">
              <strong>${task.title}</strong>
              <span style="float: right; background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${task.status}</span>
              <br>
              <div style="margin-top: 8px;">
                <strong>Priority:</strong> ${task.priority} | 
                <strong>Type:</strong> ${task.type} | 
                <strong>Created:</strong> ${formatDate(task.createdAt)}
                ${task.assignedTo ? ` | <strong>Assigned to:</strong> ${getUserName(task.assignedTo)}` : ''}
                ${task.dueDate ? ` | <strong>Due:</strong> ${formatDate(task.dueDate)}` : ''}
              </div>
              ${task.description ? `<p style="margin-top: 8px; color: #666;">${task.description}</p>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : '';

    const signatureSection = type === 'court' ? `
      <div class="signature-section">
        <h3>Certification</h3>
        <p>I hereby certify that the information contained in this report is true and accurate to the best of my knowledge and belief.</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px;">
          <div>
            <div class="signature-line"></div>
            <p style="text-align: center; margin: 5px 0;"><strong>Officer/Investigator Signature</strong></p>
            <p style="text-align: center; margin: 5px 0;">Date: _________________</p>
          </div>
          <div>
            <div class="signature-line"></div>
            <p style="text-align: center; margin: 5px 0;"><strong>Supervisor Signature</strong></p>
            <p style="text-align: center; margin: 5px 0;">Date: _________________</p>
          </div>
        </div>
      </div>
    ` : '';

    const footer = `
      <div class="footer">
        <p>Evidence Management Platform | Generated by ${getUserName((case_ as any).currentUser)} | Page 1 of 1</p>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${getReportTitle()} - ${case_.caseNumber}</title>
        <meta charset="UTF-8">
        ${baseStyles}
      </head>
      <body>
        ${headerSection}
        ${caseInfoSection}
        ${type !== 'summary' ? evidenceSection : ''}
        ${type === 'detailed' ? tasksSection : ''}
        ${signatureSection}
        ${footer}
      </body>
      </html>
    `;
  };

  const downloadReport = async (type: 'summary' | 'detailed' | 'court' | 'evidence') => {
    if (!caseData) return;

    try {
      setLoading(true);
      
      // Generate HTML content
      const htmlContent = generateReportHTML(type, caseData);
      
      // Create blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${caseData.caseNumber}_${type}_report_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to download report:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!caseData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const reportTypes = [
    {
      id: 'summary',
      title: 'Case Summary',
      description: 'Basic case information and overview',
      icon: <FileText className="w-5 h-5" />
    },
    {
      id: 'detailed',
      title: 'Detailed Report',
      description: 'Complete case information with evidence and tasks',
      icon: <FileSignature className="w-5 h-5" />
    },
    {
      id: 'court',
      title: 'Court Filing',
      description: 'Formal report for court proceedings',
      icon: <Scale className="w-5 h-5" />
    },
    {
      id: 'evidence',
      title: 'Evidence Inventory',
      description: 'Detailed evidence listing and chain of custody',
      icon: <Building className="w-5 h-5" />
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Generation</h2>
        <p className="text-gray-600">Generate professional reports and court filings for case {caseData.caseNumber}</p>
      </div>

      {/* Case summary card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{caseData.title}</CardTitle>
              <p className="text-gray-600 mt-1">Case {caseData.caseNumber}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{caseData.status}</Badge>
              <Badge className={
                caseData.priority === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                caseData.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                caseData.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }>
                {caseData.priority}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span>
                Assigned: {caseData.assignedTo ? 
                  `${caseData.assignedTo.firstName || ''} ${caseData.assignedTo.lastName || ''}`.trim() : 
                  'Unassigned'
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>Created: {new Date(caseData.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span>Evidence: {caseData.evidenceItems?.length || 0} items</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportTypes.map((type) => (
          <Card key={type.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  {type.icon}
                </div>
                <div>
                  <CardTitle className="text-lg">{type.title}</CardTitle>
                  <p className="text-gray-600 text-sm mt-1">{type.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button 
                  onClick={() => generateReport(type.id as any)}
                  disabled={loading}
                  className="flex-1"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => downloadReport(type.id as any)}
                  disabled={loading}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Additional options */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Export Options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Export to Word
            </Button>
            <Button variant="outline" size="sm">
              <FileSignature className="w-4 h-4 mr-2" />
              Export to PDF
            </Button>
            <Button variant="outline" size="sm">
              <Building className="w-4 h-4 mr-2" />
              Email Report
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-3">
            Additional export formats and automated delivery options will be available in future updates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportGenerator;
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/hooks/useAuth'
import { 
  FileText,
  Download,
  Calendar,
  Settings,
  Clock,
  Mail,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Play
} from 'lucide-react'
import apiService from '@/services/api'

interface ReportTemplate {
  id: string
  name: string
  description?: string
  templateType: 'analytics' | 'case' | 'evidence' | 'court' | 'compliance'
}

interface GeneratedReport {
  id: string
  name: string
  format: string
  generatedAt: string
  downloadUrl?: string
  content?: string
}

export default function ReportsPage() {
  const { user } = useAuth()
  
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'html' | 'json'>('pdf')
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | null>(null)

  // Load report templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setError(null)
        const response = await apiService.get('/reports/templates')
        setTemplates(response.data.data)
      } catch (error) {
        console.error('Failed to load report templates:', error)
        setError('Failed to load report templates')
      } finally {
        setLoading(false)
      }
    }

    loadTemplates()
  }, [])

  // Generate report
  const generateReport = async () => {
    if (!selectedTemplate) return

    try {
      setGenerating(selectedTemplate)
      setError(null)

      const requestData: {
        templateId: string;
        format: string;
        dateRange?: {
          from: string;
          to: string;
        };
      } = {
        templateId: selectedTemplate,
        format: selectedFormat,
      }

      if (customDateRange) {
        requestData.dateRange = {
          from: customDateRange.from.toISOString(),
          to: customDateRange.to.toISOString(),
        }
      }

      const response = await apiService.post('/reports/generate', requestData)
      const report: GeneratedReport = response.data.data

      if (report.downloadUrl) {
        // For PDF reports, trigger download
        window.open(report.downloadUrl, '_blank')
      } else if (report.content) {
        // For HTML/JSON reports, open in new window
        const newWindow = window.open('', '_blank')
        if (newWindow) {
          if (selectedFormat === 'html') {
            newWindow.document.write(report.content)
          } else {
            newWindow.document.write(`<pre>${report.content}</pre>`)
          }
          newWindow.document.close()
        }
      }
    } catch (error) {
      console.error('Failed to generate report:', error)
      setError('Failed to generate report. Please try again.')
    } finally {
      setGenerating(null)
    }
  }

  // Quick report generators
  const generateQuickReport = async (type: 'analytics' | 'case-summary' | 'court-evidence' | 'compliance') => {
    try {
      setGenerating(type)
      setError(null)

      let endpoint = ''
      switch (type) {
        case 'analytics':
          endpoint = '/reports/analytics/dashboard'
          break
        case 'compliance':
          endpoint = '/reports/compliance/audit'
          break
        default:
          return
      }

      const params: {
        format: string;
        from?: string;
        to?: string;
      } = { format: 'pdf' }
      if (customDateRange) {
        params.from = customDateRange.from.toISOString()
        params.to = customDateRange.to.toISOString()
      }

      const response = await apiService.get(endpoint, params)
      const report: GeneratedReport = response.data.data

      if (report.downloadUrl) {
        window.open(report.downloadUrl, '_blank')
      }
    } catch (error) {
      console.error('Failed to generate quick report:', error)
      setError('Failed to generate report. Please try again.')
    } finally {
      setGenerating(null)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <LoadingSpinner size="lg" text="Loading report templates..." />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-muted-foreground">
              Generate comprehensive reports for cases, evidence, and system analytics
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Quick Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Quick Reports
            </CardTitle>
            <CardDescription>
              Generate common reports with a single click
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="h-24 flex flex-col items-center gap-2"
                onClick={() => generateQuickReport('analytics')}
                disabled={generating === 'analytics'}
              >
                <BarChart3 className="h-6 w-6" />
                <span>Analytics Dashboard</span>
                {generating === 'analytics' && <LoadingSpinner size="sm" />}
              </Button>

              <Button
                variant="outline"
                className="h-24 flex flex-col items-center gap-2"
                onClick={() => generateQuickReport('compliance')}
                disabled={generating === 'compliance'}
              >
                <CheckCircle className="h-6 w-6" />
                <span>Compliance Audit</span>
                {generating === 'compliance' && <LoadingSpinner size="sm" />}
              </Button>

              <Button
                variant="outline"
                className="h-24 flex flex-col items-center gap-2"
                disabled
              >
                <FileText className="h-6 w-6" />
                <span>Case Summary</span>
                <span className="text-xs text-muted-foreground">Requires case selection</span>
              </Button>

              <Button
                variant="outline"
                className="h-24 flex flex-col items-center gap-2"
                disabled
              >
                <Settings className="h-6 w-6" />
                <span>Court Evidence</span>
                <span className="text-xs text-muted-foreground">Requires case selection</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Custom Report Builder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Custom Report Builder
            </CardTitle>
            <CardDescription>
              Create custom reports with specific templates and parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Template Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Report Template</label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Format</label>
                <Select value={selectedFormat} onValueChange={(value: any) => setSelectedFormat(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range (Optional)</label>
                <DatePickerWithRange
                  value={customDateRange}
                  onChange={setCustomDateRange}
                  placeholder="Select date range"
                />
              </div>
            </div>

            {/* Generate Button */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedTemplate && (
                  <span>
                    Selected: {templates.find(t => t.id === selectedTemplate)?.name}
                  </span>
                )}
              </div>
              
              <Button
                onClick={generateReport}
                disabled={!selectedTemplate || generating === selectedTemplate}
                className="flex items-center gap-2"
              >
                {generating === selectedTemplate ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Generate Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Available Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Available Templates
            </CardTitle>
            <CardDescription>
              All available report templates in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="p-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold">{template.name}</h4>
                    {template.description && (
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {template.templateType}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedTemplate(template.id)}
                        className="text-xs"
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Report Scheduling */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Scheduled Reports
            </CardTitle>
            <CardDescription>
              Automated report generation and email delivery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Report Scheduling</h3>
              <p className="text-muted-foreground mb-4">
                Schedule automatic report generation and email delivery
              </p>
              <Button variant="outline" disabled>
                <Settings className="h-4 w-4 mr-2" />
                Configure Schedules
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Feature available through API - UI coming soon
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
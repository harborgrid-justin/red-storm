import { PrismaClient } from '@prisma/client';
import * as ss from 'simple-statistics';
import { LinearRegression } from 'ml-regression';
import { Matrix } from 'ml-matrix';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export interface AnalyticsData {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalEvidence: number;
  evidenceByType: Record<string, number>;
  casesByStatus: Record<string, number>;
  casesByPriority: Record<string, number>;
  averageCaseResolutionTime: number;
  evidenceProcessingStats: {
    totalProcessed: number;
    averageProcessingTime: number;
    processingByType: Record<string, number>;
  };
  userActivityStats: {
    activeUsers: number;
    userLoginFrequency: Record<string, number>;
    topUsers: Array<{ userId: string; activityCount: number; name: string }>;
  };
  trendData: {
    casesOverTime: Array<{ date: string; count: number }>;
    evidenceOverTime: Array<{ date: string; count: number }>;
    resolutionTimesTrend: Array<{ date: string; averageTime: number }>;
  };
  predictions: {
    expectedCaseResolutionTime: number;
    resourceAllocationSuggestion: string;
    caseloadPrediction: Array<{ date: string; predicted: number }>;
  };
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  category?: string;
}

export interface HeatmapData {
  x: number;
  y: number;
  value: number;
  label?: string;
}

export class AnalyticsService {
  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardAnalytics(dateRange?: { from: Date; to: Date }): Promise<AnalyticsData> {
    try {
      const whereClause = dateRange ? {
        createdAt: {
          gte: dateRange.from,
          lte: dateRange.to,
        },
      } : {};

      // Basic counts
      const [totalCases, activeCases, closedCases, totalEvidence] = await Promise.all([
        prisma.case.count({ where: whereClause }),
        prisma.case.count({ where: { ...whereClause, status: 'ACTIVE' } }),
        prisma.case.count({ where: { ...whereClause, status: 'CLOSED' } }),
        prisma.evidenceItem.count({ where: whereClause }),
      ]);

      // Evidence by type
      const evidenceByTypeRaw = await prisma.evidenceItem.groupBy({
        by: ['type'],
        _count: { id: true },
        where: whereClause,
      });

      const evidenceByType = evidenceByTypeRaw.reduce((acc, item) => {
        acc[item.type] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Cases by status
      const casesByStatusRaw = await prisma.case.groupBy({
        by: ['status'],
        _count: { id: true },
        where: whereClause,
      });

      const casesByStatus = casesByStatusRaw.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Cases by priority
      const casesByPriorityRaw = await prisma.case.groupBy({
        by: ['priority'],
        _count: { id: true },
        where: whereClause,
      });

      const casesByPriority = casesByPriorityRaw.reduce((acc, item) => {
        acc[item.priority] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Calculate average case resolution time
      const averageCaseResolutionTime = await this.calculateAverageResolutionTime(dateRange);

      // Evidence processing stats
      const evidenceProcessingStats = await this.getEvidenceProcessingStats(dateRange);

      // User activity stats
      const userActivityStats = await this.getUserActivityStats(dateRange);

      // Trend data
      const trendData = await this.getTrendData(dateRange);

      // Predictions
      const predictions = await this.generatePredictions();

      return {
        totalCases,
        activeCases,
        closedCases,
        totalEvidence,
        evidenceByType,
        casesByStatus,
        casesByPriority,
        averageCaseResolutionTime,
        evidenceProcessingStats,
        userActivityStats,
        trendData,
        predictions,
      };
    } catch (error) {
      logger.error('Failed to get dashboard analytics', { error });
      throw new Error('Failed to retrieve analytics data');
    }
  }

  /**
   * Calculate average case resolution time in hours
   */
  private async calculateAverageResolutionTime(dateRange?: { from: Date; to: Date }): Promise<number> {
    const whereClause = {
      closedAt: { not: null },
      ...(dateRange ? {
        createdAt: {
          gte: dateRange.from,
          lte: dateRange.to,
        },
      } : {}),
    };

    const closedCases = await prisma.case.findMany({
      where: whereClause,
      select: {
        createdAt: true,
        closedAt: true,
      },
    });

    if (closedCases.length === 0) return 0;

    const resolutionTimes = closedCases
      .filter(c => c.closedAt)
      .map(c => {
        const diff = c.closedAt!.getTime() - c.createdAt.getTime();
        return diff / (1000 * 60 * 60); // Convert to hours
      });

    return ss.mean(resolutionTimes);
  }

  /**
   * Get evidence processing statistics
   */
  private async getEvidenceProcessingStats(dateRange?: { from: Date; to: Date }) {
    const whereClause = dateRange ? {
      createdAt: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    } : {};

    const evidenceItems = await prisma.evidenceItem.findMany({
      where: { ...whereClause, status: { in: ['ANALYZED', 'STORED'] } },
      select: {
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const totalProcessed = evidenceItems.length;
    
    const processingTimes = evidenceItems.map(item => {
      const diff = item.updatedAt.getTime() - item.createdAt.getTime();
      return diff / (1000 * 60); // Convert to minutes
    });

    const averageProcessingTime = processingTimes.length > 0 ? ss.mean(processingTimes) : 0;

    const processingByType = evidenceItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalProcessed,
      averageProcessingTime,
      processingByType,
    };
  }

  /**
   * Get user activity statistics
   */
  private async getUserActivityStats(dateRange?: { from: Date; to: Date }) {
    const whereClause = dateRange ? {
      timestamp: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    } : {};

    // Active users (users with activity in period)
    const activeUsersCount = await prisma.auditLog.findMany({
      where: whereClause,
      distinct: ['userId'],
      select: { userId: true },
    });

    // User login frequency
    const loginLogs = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        ...whereClause,
        action: 'LOGIN',
      },
      _count: { userId: true },
    });

    const userLoginFrequency = loginLogs.reduce((acc, log) => {
      if (log.userId) {
        acc[log.userId] = log._count.userId;
      }
      return acc;
    }, {} as Record<string, number>);

    // Top users by activity
    const topUsersRaw = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: whereClause,
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    });

    const topUsers = await Promise.all(
      topUsersRaw
        .filter(u => u.userId)
        .map(async (user) => {
          const userData = await prisma.user.findUnique({
            where: { id: user.userId! },
            select: { firstName: true, lastName: true },
          });
          return {
            userId: user.userId!,
            activityCount: user._count.userId,
            name: userData ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() : 'Unknown',
          };
        })
    );

    return {
      activeUsers: activeUsersCount.length,
      userLoginFrequency,
      topUsers,
    };
  }

  /**
   * Get trend data for time series charts
   */
  private async getTrendData(dateRange?: { from: Date; to: Date }) {
    const endDate = dateRange?.to || new Date();
    const startDate = dateRange?.from || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days

    // Cases over time
    const casesOverTime = await this.getTimeSeriesData('case', startDate, endDate);
    
    // Evidence over time
    const evidenceOverTime = await this.getTimeSeriesData('evidenceItem', startDate, endDate);

    // Resolution times trend
    const resolutionTimesTrend = await this.getResolutionTimesTrend(startDate, endDate);

    return {
      casesOverTime,
      evidenceOverTime,
      resolutionTimesTrend,
    };
  }

  /**
   * Get time series data for a specific entity
   */
  private async getTimeSeriesData(entity: 'case' | 'evidenceItem', startDate: Date, endDate: Date): Promise<Array<{ date: string; count: number }>> {
    const data: Array<{ createdAt: Date; _count: { id: number } }> = [];
    
    if (entity === 'case') {
      const caseData = await prisma.case.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
      data.push(...caseData);
    } else {
      const evidenceData = await prisma.evidenceItem.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
      data.push(...evidenceData);
    }

    // Group by day
    const dailyData = new Map<string, number>();
    data.forEach(item => {
      const date = item.createdAt.toISOString().split('T')[0];
      dailyData.set(date, (dailyData.get(date) || 0) + item._count.id);
    });

    // Fill in missing days with 0
    const result: Array<{ date: string; count: number }> = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: dailyData.get(dateStr) || 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Get resolution times trend
   */
  private async getResolutionTimesTrend(startDate: Date, endDate: Date): Promise<Array<{ date: string; averageTime: number }>> {
    const closedCases = await prisma.case.findMany({
      where: {
        closedAt: {
          gte: startDate,
          lte: endDate,
          not: null,
        },
      },
      select: {
        createdAt: true,
        closedAt: true,
      },
    });

    // Group by day and calculate average resolution time
    const dailyResolutionTimes = new Map<string, number[]>();
    
    closedCases.forEach(caseItem => {
      if (caseItem.closedAt) {
        const date = caseItem.closedAt.toISOString().split('T')[0];
        const resolutionTime = (caseItem.closedAt.getTime() - caseItem.createdAt.getTime()) / (1000 * 60 * 60); // hours
        
        if (!dailyResolutionTimes.has(date)) {
          dailyResolutionTimes.set(date, []);
        }
        dailyResolutionTimes.get(date)!.push(resolutionTime);
      }
    });

    // Calculate daily averages
    const result: Array<{ date: string; averageTime: number }> = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const times = dailyResolutionTimes.get(dateStr) || [];
      const averageTime = times.length > 0 ? ss.mean(times) : 0;
      
      result.push({
        date: dateStr,
        averageTime,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Generate predictive analytics
   */
  private async generatePredictions() {
    try {
      // Get historical data for predictions
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      const historicalCases = await prisma.case.findMany({
        where: {
          createdAt: { gte: last30Days },
        },
        select: {
          createdAt: true,
          closedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Predict expected case resolution time
      const expectedCaseResolutionTime = await this.predictResolutionTime(historicalCases);

      // Resource allocation suggestion
      const resourceAllocationSuggestion = await this.generateResourceSuggestion();

      // Caseload prediction for next 7 days
      const caseloadPrediction = await this.predictCaseload(historicalCases);

      return {
        expectedCaseResolutionTime,
        resourceAllocationSuggestion,
        caseloadPrediction,
      };
    } catch (error) {
      logger.error('Failed to generate predictions', { error });
      return {
        expectedCaseResolutionTime: 0,
        resourceAllocationSuggestion: 'Unable to generate suggestion',
        caseloadPrediction: [],
      };
    }
  }

  /**
   * Predict case resolution time using linear regression
   */
  private async predictResolutionTime(historicalCases: Array<{ createdAt: Date; closedAt: Date | null }>) {
    const closedCases = historicalCases.filter(c => c.closedAt);
    
    if (closedCases.length < 5) {
      // Not enough data for prediction
      return await this.calculateAverageResolutionTime();
    }

    const data = closedCases.map((caseItem, index) => {
      const resolutionTime = (caseItem.closedAt!.getTime() - caseItem.createdAt.getTime()) / (1000 * 60 * 60);
      return [index, resolutionTime];
    });

    const x = data.map(d => d[0]);
    const y = data.map(d => d[1]);

    try {
      const regression = new LinearRegression(x, y);
      const nextIndex = closedCases.length;
      return regression.predict(nextIndex);
    } catch (error) {
      // Fallback to average if regression fails
      return ss.mean(y);
    }
  }

  /**
   * Generate resource allocation suggestion
   */
  private async generateResourceSuggestion(): Promise<string> {
    const [activeCases, availableUsers] = await Promise.all([
      prisma.case.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { isActive: true } }),
    ]);

    const casePerUser = activeCases / Math.max(availableUsers, 1);

    if (casePerUser > 10) {
      return 'High caseload detected. Consider hiring additional investigators or extending deadlines.';
    } else if (casePerUser > 5) {
      return 'Moderate caseload. Monitor closely and consider redistributing cases.';
    } else {
      return 'Normal caseload. Current resource allocation appears adequate.';
    }
  }

  /**
   * Predict caseload for the next week
   */
  private async predictCaseload(historicalCases: Array<{ createdAt: Date; closedAt: Date | null }>): Promise<Array<{ date: string; predicted: number }>> {
    if (historicalCases.length < 7) {
      return [];
    }

    // Calculate daily case creation rate
    const dailyCounts = new Map<string, number>();
    historicalCases.forEach(caseItem => {
      const date = caseItem.createdAt.toISOString().split('T')[0];
      dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
    });

    const dailyValues = Array.from(dailyCounts.values());
    const averageDailyCases = ss.mean(dailyValues);
    const trend = ss.linearRegression(dailyValues.map((_, i) => [i, dailyValues[i]]));

    // Predict next 7 days
    const predictions: Array<{ date: string; predicted: number }> = [];
    const today = new Date();
    
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      
      const dayIndex = historicalCases.length + i;
      const predicted = Math.max(0, Math.round(averageDailyCases + (trend.m * dayIndex)));
      
      predictions.push({
        date: futureDate.toISOString().split('T')[0],
        predicted,
      });
    }

    return predictions;
  }

  /**
   * Get heatmap data for evidence access patterns
   */
  async getEvidenceAccessHeatmap(): Promise<HeatmapData[]> {
    const accessLogs = await prisma.auditLog.findMany({
      where: {
        resource: 'evidence',
        action: 'READ',
        timestamp: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      select: {
        resourceId: true,
        timestamp: true,
      },
    });

    const evidenceAccessCount = new Map<string, number>();
    accessLogs.forEach(log => {
      if (log.resourceId) {
        evidenceAccessCount.set(log.resourceId, (evidenceAccessCount.get(log.resourceId) || 0) + 1);
      }
    });

    // Convert to heatmap format (simplified grid layout)
    const heatmapData: HeatmapData[] = [];
    let x = 0, y = 0;
    
    for (const [evidenceId, count] of evidenceAccessCount.entries()) {
      heatmapData.push({
        x,
        y,
        value: count,
        label: evidenceId,
      });
      
      x++;
      if (x >= 10) { // 10 columns
        x = 0;
        y++;
      }
    }

    return heatmapData;
  }

  /**
   * Get performance metrics for monitoring
   */
  async getPerformanceMetrics() {
    const [
      totalUsers,
      activeUsers,
      systemLoad,
      storageUsed,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastLogin: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      this.getSystemLoad(),
      this.getStorageUsage(),
    ]);

    return {
      totalUsers,
      activeUsers,
      systemLoad,
      storageUsed,
      timestamp: new Date(),
    };
  }

  private async getSystemLoad(): Promise<number> {
    // Simplified system load calculation based on active operations
    const activeJobs = await prisma.auditLog.count({
      where: {
        timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      },
    });
    
    return Math.min(activeJobs / 100, 1); // Normalize to 0-1
  }

  private async getStorageUsage(): Promise<number> {
    const storageStats = await prisma.evidenceItem.aggregate({
      _sum: { fileSize: true },
    });

    const totalBytes = Number(storageStats._sum.fileSize || 0);
    return totalBytes / (1024 * 1024 * 1024); // Convert to GB
  }
}

export const analyticsService = new AnalyticsService();
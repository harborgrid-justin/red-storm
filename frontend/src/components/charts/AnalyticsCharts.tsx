'use client'

import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

interface ChartProps {
  title?: string
  data: any
  options?: any
  type: 'bar' | 'line' | 'pie' | 'doughnut'
  height?: number
}

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
    },
  },
}

export function AnalyticsChart({ title, data, options = {}, type, height = 300 }: ChartProps) {
  const chartOptions = {
    ...defaultOptions,
    ...options,
    plugins: {
      ...defaultOptions.plugins,
      ...options.plugins,
      title: {
        display: !!title,
        text: title,
        ...options.plugins?.title,
      },
    },
  }

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return <Bar data={data} options={chartOptions} />
      case 'line':
        return <Line data={data} options={chartOptions} />
      case 'pie':
        return <Pie data={data} options={chartOptions} />
      case 'doughnut':
        return <Doughnut data={data} options={chartOptions} />
      default:
        return <Bar data={data} options={chartOptions} />
    }
  }

  return (
    <div style={{ height: `${height}px` }}>
      {renderChart()}
    </div>
  )
}

// Preset chart configurations
export function CasesTrendChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const chartData = {
    labels: data.map(item => item.date),
    datasets: [
      {
        label: 'Cases Created',
        data: data.map(item => item.count),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
    ],
  }

  const options = {
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
  }

  return (
    <AnalyticsChart
      title="Cases Over Time"
      type="line"
      data={chartData}
      options={options}
      height={300}
    />
  )
}

export function EvidenceByTypeChart({ data }: { data: Record<string, number> }) {
  const chartData = {
    labels: Object.keys(data),
    datasets: [
      {
        data: Object.values(data),
        backgroundColor: [
          '#ef4444', // red
          '#f97316', // orange
          '#eab308', // yellow
          '#22c55e', // green
          '#3b82f6', // blue
          '#8b5cf6', // violet
          '#ec4899', // pink
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  }

  return (
    <AnalyticsChart
      title="Evidence by Type"
      type="doughnut"
      data={chartData}
      height={300}
    />
  )
}

export function CasesByStatusChart({ data }: { data: Record<string, number> }) {
  const chartData = {
    labels: Object.keys(data),
    datasets: [
      {
        label: 'Cases',
        data: Object.values(data),
        backgroundColor: [
          '#22c55e', // green for ACTIVE
          '#6b7280', // gray for CLOSED
          '#eab308', // yellow for PENDING
          '#3b82f6', // blue for ARCHIVED
        ],
        borderWidth: 1,
      },
    ],
  }

  return (
    <AnalyticsChart
      title="Cases by Status"
      type="bar"
      data={chartData}
      height={300}
    />
  )
}

export function ResolutionTimesTrendChart({ data }: { data: Array<{ date: string; averageTime: number }> }) {
  const chartData = {
    labels: data.map(item => item.date),
    datasets: [
      {
        label: 'Average Resolution Time (hours)',
        data: data.map(item => item.averageTime),
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  }

  const options = {
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return `${value}h`
          },
        },
      },
    },
  }

  return (
    <AnalyticsChart
      title="Resolution Times Trend"
      type="line"
      data={chartData}
      options={options}
      height={300}
    />
  )
}

export function UserActivityChart({ data }: { data: Array<{ userId: string; activityCount: number; name: string }> }) {
  const chartData = {
    labels: data.map(item => item.name || item.userId),
    datasets: [
      {
        label: 'Activity Count',
        data: data.map(item => item.activityCount),
        backgroundColor: 'rgba(34, 197, 94, 0.6)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
      },
    ],
  }

  const options = {
    indexAxis: 'y' as const,
    scales: {
      x: {
        beginAtZero: true,
      },
    },
  }

  return (
    <AnalyticsChart
      title="Top Active Users"
      type="bar"
      data={chartData}
      options={options}
      height={400}
    />
  )
}
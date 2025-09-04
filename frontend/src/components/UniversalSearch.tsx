import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search,
  Filter,
  Calendar,
  User,
  FileText,
  Image,
  Video,
  Folder,
  Clock,
  X,
  Save,
  Star
} from 'lucide-react';
import { CaseService } from '@/services/cases';
import Link from 'next/link';

interface SearchResult {
  type: 'case' | 'evidence';
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  status: string;
  priority?: string;
  createdAt: string;
  metadata: Record<string, any>;
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: Record<string, any>;
  createdAt: string;
}

interface UniversalSearchProps {
  initialQuery?: string;
  onResultSelect?: (result: SearchResult) => void;
}

const UniversalSearch: React.FC<UniversalSearchProps> = ({ 
  initialQuery = '', 
  onResultSelect 
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  
  // Filter states
  const [filters, setFilters] = useState({
    type: 'all', // 'all', 'cases', 'evidence'
    status: '',
    priority: '',
    assignedTo: '',
    dateRange: {
      from: '',
      to: '',
    },
    evidenceType: '',
    tags: [] as string[],
  });

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      performSearch(debouncedQuery);
    } else {
      setResults([]);
    }
  }, [debouncedQuery, filters]);

  const performSearch = useCallback(async (searchQuery: string) => {
    try {
      setLoading(true);
      const searchResults: SearchResult[] = [];

      // Search cases
      if (filters.type === 'all' || filters.type === 'cases') {
        const casesResponse = await CaseService.getCases({
          search: searchQuery,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          assignedToId: filters.assignedTo || undefined,
          limit: 20,
        });

        const caseResults: SearchResult[] = casesResponse.items.map((case_: any) => ({
          type: 'case' as const,
          id: case_.id,
          title: case_.title,
          subtitle: `Case ${case_.caseNumber}`,
          description: case_.description,
          status: case_.status,
          priority: case_.priority,
          createdAt: case_.createdAt,
          metadata: {
            caseNumber: case_.caseNumber,
            assignedTo: case_.assignedTo,
            evidenceCount: case_.evidenceItems?.length || 0,
            tags: case_.tags || [],
          },
        }));

        searchResults.push(...caseResults);
      }

      // Search evidence (would need to implement evidence search API)
      if (filters.type === 'all' || filters.type === 'evidence') {
        // Placeholder for evidence search
        // const evidenceResponse = await EvidenceService.search({ ... });
      }

      // Sort results by relevance/date
      searchResults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      type: 'all',
      status: '',
      priority: '',
      assignedTo: '',
      dateRange: { from: '', to: '' },
      evidenceType: '',
      tags: [],
    });
  };

  const saveCurrentSearch = () => {
    if (!query.trim()) return;

    const savedSearch: SavedSearch = {
      id: `search_${Date.now()}`,
      name: `Search: ${query}`,
      query,
      filters,
      createdAt: new Date().toISOString(),
    };

    const existing = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    const updated = [savedSearch, ...existing].slice(0, 10); // Keep only 10 recent searches
    localStorage.setItem('savedSearches', JSON.stringify(updated));
    setSavedSearches(updated);
  };

  const loadSavedSearch = (savedSearch: SavedSearch) => {
    setQuery(savedSearch.query);
    setFilters(savedSearch.filters);
  };

  const deleteSavedSearch = (searchId: string) => {
    const existing = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    const updated = existing.filter((s: SavedSearch) => s.id !== searchId);
    localStorage.setItem('savedSearches', JSON.stringify(updated));
    setSavedSearches(updated);
  };

  // Load saved searches on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    setSavedSearches(saved);
  }, []);

  const getTypeIcon = (result: SearchResult) => {
    if (result.type === 'case') {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    
    // Evidence type icons
    const evidenceType = result.metadata.evidenceType;
    switch (evidenceType) {
      case 'PHOTO': return <Image className="w-5 h-5 text-green-600" />;
      case 'VIDEO': return <Video className="w-5 h-5 text-purple-600" />;
      case 'DOCUMENT': return <FileText className="w-5 h-5 text-blue-600" />;
      default: return <Folder className="w-5 h-5 text-gray-600" />;
    }
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority) return null;
    
    const colorMap = {
      CRITICAL: 'bg-red-100 text-red-800',
      HIGH: 'bg-orange-100 text-orange-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      LOW: 'bg-green-100 text-green-800',
    };

    return (
      <Badge className={colorMap[priority as keyof typeof colorMap] || 'bg-gray-100 text-gray-800'}>
        {priority}
      </Badge>
    );
  };

  const getResultLink = (result: SearchResult) => {
    return result.type === 'case' ? `/cases/${result.id}` : `/evidence/${result.id}`;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Universal Search</h1>
        <p className="text-gray-600">Search across cases, evidence, and documents</p>
      </div>

      {/* Search bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search cases, evidence, documents..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 pr-4"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'bg-blue-50' : ''}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
            <Button
              variant="outline"
              onClick={saveCurrentSearch}
              disabled={!query.trim()}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>

          {/* Active filters display */}
          {(filters.type !== 'all' || filters.status || filters.priority) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <span className="text-sm text-gray-600">Active filters:</span>
              {filters.type !== 'all' && (
                <Badge variant="outline">{filters.type}</Badge>
              )}
              {filters.status && (
                <Badge variant="outline">Status: {filters.status}</Badge>
              )}
              {filters.priority && (
                <Badge variant="outline">Priority: {filters.priority}</Badge>
              )}
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters panel */}
      {showFilters && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Search Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="all">All</option>
                  <option value="cases">Cases</option>
                  <option value="evidence">Evidence</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Any</option>
                  <option value="ACTIVE">Active</option>
                  <option value="CLOSED">Closed</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <select
                  value={filters.priority}
                  onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Any</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Date Range</label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={filters.dateRange.from}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      dateRange: { ...prev.dateRange, from: e.target.value }
                    }))}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved searches */}
      {savedSearches.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="w-4 h-4" />
              Saved Searches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {savedSearches.map((savedSearch) => (
                <div key={savedSearch.id} className="flex items-center gap-1 bg-gray-100 rounded-lg px-3 py-1">
                  <button
                    onClick={() => loadSavedSearch(savedSearch)}
                    className="text-sm hover:text-blue-600"
                  >
                    {savedSearch.name}
                  </button>
                  <button
                    onClick={() => deleteSavedSearch(savedSearch.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search results */}
      <div>
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No results found for "{query}"</p>
              <p className="text-sm text-gray-400 mt-2">Try adjusting your search terms or filters</p>
            </CardContent>
          </Card>
        )}

        {!loading && results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
              </p>
            </div>
            
            <div className="space-y-3">
              {results.map((result) => (
                <Card key={`${result.type}-${result.id}`} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getTypeIcon(result)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <Link 
                              href={getResultLink(result)}
                              className="font-medium text-gray-900 hover:text-blue-600 line-clamp-1"
                            >
                              {result.title}
                            </Link>
                            <p className="text-sm text-gray-600 mt-1">{result.subtitle}</p>
                            {result.description && (
                              <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                                {result.description}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 ml-4">
                            <Badge variant="outline">{result.status}</Badge>
                            {getPriorityBadge(result.priority)}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(result.createdAt).toLocaleDateString()}
                          </div>
                          
                          {result.metadata.assignedTo && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {result.metadata.assignedTo.firstName} {result.metadata.assignedTo.lastName}
                            </div>
                          )}
                          
                          {result.metadata.evidenceCount > 0 && (
                            <div>
                              {result.metadata.evidenceCount} evidence items
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UniversalSearch;
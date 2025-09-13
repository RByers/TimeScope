export interface DomainData {
  domain: string;
  timeSpent: number; // milliseconds
}

export interface DebugLogEntry {
  timestamp: number;
  message: string;
  type: 'tab_change' | 'focus_change' | 'session_record' | 'error' | 'info';
  data?: any;
}

export interface DailyData {
  [domain: string]: number; // domain -> total milliseconds for the day
}

export interface StorageData {
  [dateKey: string]: DailyData; // YYYY-MM-DD -> domain data
}

import { DomainData, DebugLogEntry, DailyData, StorageData } from './types.js';

class TimeTracker {
  private currentTab: { tabId: number; domain: string; startTime: number } | null = null;
  private isWindowFocused: boolean = true;
  private debugLogs: DebugLogEntry[] = [];
  private readonly MAX_DEBUG_LOGS = 100;
  private popupConnected: boolean = false;

  constructor() {
    this.setupEventListeners();
    this.initializeCurrentTab();
    this.addDebugLog('info', 'TimeTracker initialized', { 
      windowFocused: this.isWindowFocused,
      timestamp: Date.now()
    });
  }

  private addDebugLog(type: DebugLogEntry['type'], message: string, data?: any): void {
    const logEntry: DebugLogEntry = {
      timestamp: Date.now(),
      message,
      type,
      data
    };
    
    this.debugLogs.unshift(logEntry);
    
    // Keep only the most recent logs
    if (this.debugLogs.length > this.MAX_DEBUG_LOGS) {
      this.debugLogs = this.debugLogs.slice(0, this.MAX_DEBUG_LOGS);
    }
    
    console.log(`[TimeScope Debug] ${type.toUpperCase()}: ${message}`, data || '');
    
    // Broadcast new log entry to popup if connected
    this.broadcastLogEntry(logEntry);
  }

  private broadcastLogEntry(logEntry: DebugLogEntry): void {
    if (this.popupConnected) {
      try {
        chrome.runtime.sendMessage({
          action: 'newDebugLog',
          logEntry: logEntry
        }).catch(() => {
          // Popup might have closed, ignore the error
          this.popupConnected = false;
        });
      } catch (error) {
        // Extension context might be invalid, ignore
        this.popupConnected = false;
      }
    }
  }

  public getDebugLogs(): DebugLogEntry[] {
    return [...this.debugLogs];
  }

  public setPopupConnected(connected: boolean): void {
    this.popupConnected = connected;
    if (connected) {
      this.addDebugLog('info', 'Debug popup connected', { timestamp: Date.now() });
    } else {
      this.addDebugLog('info', 'Debug popup disconnected', { timestamp: Date.now() });
    }
  }

  private setupEventListeners(): void {
    // Track tab activation
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.addDebugLog('tab_change', 'Tab activated', {
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        windowFocused: this.isWindowFocused,
        currentTab: this.currentTab?.domain || 'none'
      });
      this.handleTabChange(activeInfo.tabId);
    });

    // Track URL changes within tabs
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active && this.isWindowFocused) {
        this.addDebugLog('tab_change', 'Tab URL updated', {
          tabId,
          url: tab.url,
          windowFocused: this.isWindowFocused,
          changeInfo,
          currentTab: this.currentTab?.domain || 'none'
        });
        this.handleTabChange(tabId);
      }
    });

    // Track window focus changes
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        this.addDebugLog('focus_change', 'Browser lost focus', {
          previousWindowFocused: this.isWindowFocused,
          currentTab: this.currentTab?.domain || 'none',
          sessionTime: this.currentTab ? Date.now() - this.currentTab.startTime : 0
        });
        this.isWindowFocused = false;
        this.recordCurrentSession();
        this.currentTab = null;
      } else {
        // Browser gained focus
        const previousFocusState = this.isWindowFocused;
        this.isWindowFocused = true;
        this.addDebugLog('focus_change', 'Browser gained focus', {
          windowId,
          previousWindowFocused: previousFocusState,
          currentTab: this.currentTab?.domain || 'none'
        });
        // Get the active tab in the focused window
        chrome.tabs.query({ active: true, windowId }, (tabs) => {
          if (tabs[0]) {
            this.addDebugLog('focus_change', 'Active tab found after focus gain', {
              tabId: tabs[0].id,
              url: tabs[0].url,
              domain: this.extractDomain(tabs[0].url || '')
            });
            this.handleTabChange(tabs[0].id!);
          } else {
            this.addDebugLog('focus_change', 'No active tab found after focus gain', { windowId });
          }
        });
      }
    });
  }

  private async initializeCurrentTab(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id && tab.url) {
        const domain = this.extractDomain(tab.url);
        if (domain) {
          this.currentTab = {
            tabId: tab.id,
            domain,
            startTime: Date.now()
          };
          this.addDebugLog('info', 'Initial tab set', {
            tabId: tab.id,
            domain,
            url: tab.url,
            windowFocused: this.isWindowFocused
          });
        } else {
          this.addDebugLog('info', 'Initial tab skipped (invalid domain)', {
            tabId: tab.id,
            url: tab.url
          });
        }
      } else {
        this.addDebugLog('info', 'No initial tab found', { tab });
      }
    } catch (error) {
      this.addDebugLog('error', 'Error initializing current tab', { error: error instanceof Error ? error.message : String(error) });
      console.error('Error initializing current tab:', error);
    }
  }

  private async handleTabChange(tabId: number): Promise<void> {
    if (!this.isWindowFocused) {
      this.addDebugLog('tab_change', 'Tab change ignored - window not focused', {
        tabId,
        windowFocused: this.isWindowFocused
      });
      return;
    }

    // Record time for previous tab
    this.recordCurrentSession();

    // Start tracking new tab
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        const domain = this.extractDomain(tab.url);
        if (domain) {
          this.currentTab = {
            tabId,
            domain,
            startTime: Date.now()
          };
          this.addDebugLog('tab_change', 'Started tracking new tab', {
            tabId,
            domain,
            url: tab.url,
            windowFocused: this.isWindowFocused
          });
        } else {
          this.currentTab = null;
          this.addDebugLog('tab_change', 'Tab change - invalid domain, stopped tracking', {
            tabId,
            url: tab.url
          });
        }
      }
    } catch (error) {
      this.addDebugLog('error', 'Error getting tab info during tab change', {
        tabId,
        error: error instanceof Error ? error.message : String(error)
      });
      console.error('Error getting tab info:', error);
      this.currentTab = null;
    }
  }

  private recordCurrentSession(): void {
    if (!this.currentTab) {
      this.addDebugLog('session_record', 'No current tab to record', {
        windowFocused: this.isWindowFocused
      });
      return;
    }

    const timeSpent = Date.now() - this.currentTab.startTime;
    
    this.addDebugLog('session_record', 'Recording session', {
      domain: this.currentTab.domain,
      timeSpent,
      startTime: this.currentTab.startTime,
      windowFocused: this.isWindowFocused,
      willRecord: timeSpent >= 1000
    });
    
    // Only record if spent more than 1 second
    if (timeSpent >= 1000) {
      this.addTimeToStorage(this.currentTab.domain, timeSpent);
    }
  }

  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      // Skip chrome:// and extension:// URLs
      if (urlObj.protocol === 'chrome:' || urlObj.protocol === 'chrome-extension:') {
        return null;
      }
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  private async addTimeToStorage(domain: string, timeSpent: number): Promise<void> {
    const today = this.getTodayKey();
    
    try {
      const result = await chrome.storage.local.get([today]);
      const dailyData: DailyData = result[today] || {};
      
      dailyData[domain] = (dailyData[domain] || 0) + timeSpent;
      
      await chrome.storage.local.set({ [today]: dailyData });
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }

  private getTodayKey(): string {
    const now = new Date();
    return now.getFullYear() + '-' + 
           String(now.getMonth() + 1).padStart(2, '0') + '-' + 
           String(now.getDate()).padStart(2, '0');
  }

  public async getTodayData(): Promise<DomainData[]> {
    const today = this.getTodayKey();
    
    try {
      const result = await chrome.storage.local.get([today]);
      const dailyData: DailyData = result[today] || {};
      
      return Object.entries(dailyData)
        .map(([domain, timeSpent]) => ({ domain, timeSpent }))
        .sort((a, b) => b.timeSpent - a.timeSpent);
    } catch (error) {
      console.error('Error loading today data:', error);
      return [];
    }
  }
}

// Initialize the tracker
const tracker = new TimeTracker();

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTodayData') {
    tracker.getTodayData().then(sendResponse);
    return true; // Keep message channel open for async response
  } else if (request.action === 'getDebugLogs') {
    sendResponse(tracker.getDebugLogs());
    return false;
  } else if (request.action === 'popupConnected') {
    tracker.setPopupConnected(true);
    sendResponse({ success: true });
    return false;
  } else if (request.action === 'popupDisconnected') {
    tracker.setPopupConnected(false);
    sendResponse({ success: true });
    return false;
  }
});

console.log('TimeScope background script loaded');

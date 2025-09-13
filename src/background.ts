interface DomainData {
  domain: string;
  timeSpent: number; // milliseconds
}

interface DailyData {
  [domain: string]: number; // domain -> total milliseconds for the day
}

interface StorageData {
  [dateKey: string]: DailyData; // YYYY-MM-DD -> domain data
}

class TimeTracker {
  private currentTab: { tabId: number; domain: string; startTime: number } | null = null;
  private isWindowFocused: boolean = true;

  constructor() {
    this.setupEventListeners();
    this.initializeCurrentTab();
  }

  private setupEventListeners(): void {
    // Track tab activation
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    // Track URL changes within tabs
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active && this.isWindowFocused) {
        this.handleTabChange(tabId);
      }
    });

    // Track window focus changes
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        this.isWindowFocused = false;
        this.recordCurrentSession();
        this.currentTab = null;
      } else {
        // Browser gained focus
        this.isWindowFocused = true;
        // Get the active tab in the focused window
        chrome.tabs.query({ active: true, windowId }, (tabs) => {
          if (tabs[0]) {
            this.handleTabChange(tabs[0].id!);
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
        }
      }
    } catch (error) {
      console.error('Error initializing current tab:', error);
    }
  }

  private async handleTabChange(tabId: number): Promise<void> {
    if (!this.isWindowFocused) return;

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
        } else {
          this.currentTab = null;
        }
      }
    } catch (error) {
      console.error('Error getting tab info:', error);
      this.currentTab = null;
    }
  }

  private recordCurrentSession(): void {
    if (!this.currentTab) return;

    const timeSpent = Date.now() - this.currentTab.startTime;
    
    // Only record if spent more than 2 seconds
    if (timeSpent >= 2000) {
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
  }
});

console.log('TimeScope background script loaded');

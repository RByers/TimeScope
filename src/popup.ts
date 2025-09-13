import { DomainData, DebugLogEntry } from './types.js';

class PopupManager {
  private debugLogsVisible: boolean = false;

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    this.updateDateDisplay();
    await this.loadAndDisplayData();
    this.setupDebugPanel();
    this.setupMessageListener();
  }

  private updateDateDisplay(): void {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const dateElement = document.getElementById('date-display');
    if (dateElement) {
      dateElement.textContent = today.toLocaleDateString('en-US', options);
    }
  }

  private async loadAndDisplayData(): Promise<void> {
    const loadingEl = document.getElementById('loading');
    const domainListEl = document.getElementById('domain-list');
    const noDataEl = document.getElementById('no-data');

    if (!loadingEl || !domainListEl || !noDataEl) return;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'getTodayData' });
      const domains: DomainData[] = response || [];

      loadingEl.style.display = 'none';

      if (domains.length === 0) {
        noDataEl.style.display = 'block';
        domainListEl.style.display = 'none';
      } else {
        noDataEl.style.display = 'none';
        domainListEl.style.display = 'block';
        this.renderDomains(domains);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      loadingEl.style.display = 'none';
      noDataEl.style.display = 'block';
    }
  }

  private renderDomains(domains: DomainData[]): void {
    const domainListEl = document.getElementById('domain-list');
    if (!domainListEl) return;

    domainListEl.innerHTML = '';

    domains.forEach(({ domain, timeSpent }) => {
      const domainEl = document.createElement('div');
      domainEl.className = 'domain-item';
      
      domainEl.innerHTML = `
        <div class="domain-name">${domain}</div>
        <div class="domain-time">${this.formatTime(timeSpent)}</div>
      `;
      
      domainListEl.appendChild(domainEl);
    });
  }

  private formatTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      if (remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m`;
      } else {
        return `${hours}h`;
      }
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  private setupDebugPanel(): void {
    const debugToggle = document.getElementById('debug-toggle');
    if (debugToggle) {
      debugToggle.addEventListener('click', () => {
        this.toggleDebugLogs();
      });
    }
  }

  private setupMessageListener(): void {
    // Listen for new debug log entries from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'newDebugLog' && message.logEntry) {
        this.handleNewDebugLog(message.logEntry);
      }
    });

    // Handle popup close to notify background script
    window.addEventListener('beforeunload', () => {
      chrome.runtime.sendMessage({ action: 'popupDisconnected' }).catch(() => {
        // Ignore errors if background script is not available
      });
    });
  }

  private handleNewDebugLog(logEntry: DebugLogEntry): void {
    // Only update if debug logs are currently visible
    if (this.debugLogsVisible) {
      this.addLogEntryToDisplay(logEntry);
    }
  }

  private addLogEntryToDisplay(logEntry: DebugLogEntry): void {
    const debugLogsEl = document.getElementById('debug-logs');
    if (!debugLogsEl) return;

    const logEl = document.createElement('div');
    logEl.className = `debug-log-entry ${logEntry.type}`;
    
    const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
    const dataStr = logEntry.data ? JSON.stringify(logEntry.data, null, 2) : '';
    
    logEl.innerHTML = `
      <div class="debug-timestamp">${timestamp}</div>
      <div class="debug-message">${logEntry.message}</div>
      ${dataStr ? `<div class="debug-data">${dataStr}</div>` : ''}
    `;
    
    // Insert at the top (most recent first)
    debugLogsEl.insertBefore(logEl, debugLogsEl.firstChild);
    
    // Scroll to top to show the new entry
    debugLogsEl.scrollTop = 0;
  }

  private async toggleDebugLogs(): Promise<void> {
    const debugLogsEl = document.getElementById('debug-logs');
    const debugToggleEl = document.getElementById('debug-toggle');
    
    if (!debugLogsEl || !debugToggleEl) return;

    this.debugLogsVisible = !this.debugLogsVisible;

    if (this.debugLogsVisible) {
      debugLogsEl.style.display = 'block';
      debugToggleEl.textContent = 'Hide Debug Logs';
      await this.loadAndDisplayDebugLogs();
      // Notify background script that popup is connected for real-time updates
      chrome.runtime.sendMessage({ action: 'popupConnected' }).catch(() => {
        // Ignore errors if background script is not available
      });
    } else {
      debugLogsEl.style.display = 'none';
      debugToggleEl.textContent = 'Show Debug Logs';
      // Notify background script that popup is disconnected
      chrome.runtime.sendMessage({ action: 'popupDisconnected' }).catch(() => {
        // Ignore errors if background script is not available
      });
    }
  }

  private async loadAndDisplayDebugLogs(): Promise<void> {
    try {
      const logs: DebugLogEntry[] = await chrome.runtime.sendMessage({ action: 'getDebugLogs' });
      this.renderDebugLogs(logs || []);
    } catch (error) {
      console.error('Error loading debug logs:', error);
      const debugLogsEl = document.getElementById('debug-logs');
      if (debugLogsEl) {
        debugLogsEl.innerHTML = '<div class="debug-log-entry error">Error loading debug logs</div>';
      }
    }
  }

  private renderDebugLogs(logs: DebugLogEntry[]): void {
    const debugLogsEl = document.getElementById('debug-logs');
    if (!debugLogsEl) return;

    if (logs.length === 0) {
      debugLogsEl.innerHTML = '<div class="debug-log-entry info">No debug logs available</div>';
      return;
    }

    debugLogsEl.innerHTML = '';

    logs.forEach(log => {
      const logEl = document.createElement('div');
      logEl.className = `debug-log-entry ${log.type}`;
      
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      const dataStr = log.data ? JSON.stringify(log.data, null, 2) : '';
      
      logEl.innerHTML = `
        <div class="debug-timestamp">${timestamp}</div>
        <div class="debug-message">${log.message}</div>
        ${dataStr ? `<div class="debug-data">${dataStr}</div>` : ''}
      `;
      
      debugLogsEl.appendChild(logEl);
    });
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

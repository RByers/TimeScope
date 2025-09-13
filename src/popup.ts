interface DomainData {
  domain: string;
  timeSpent: number;
}

class PopupManager {
  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    this.updateDateDisplay();
    await this.loadAndDisplayData();
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
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

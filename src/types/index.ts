export interface Config {
  responseTime: number;
  defaultPanelWidth: number;
  minPanelWidth: number;
  maxPanelWidth: number;
  apiUrl: string;
  useBackendProxy: boolean;
  backendProxyUrl: string;
}

export interface AppState {
  isPanelOpen: boolean;
  isPanelFixed: boolean;
  panelWidth: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartWidth: number;
  selectedText: string;
  lastSelectionTime: number;
}

export interface QueryResult {
  word: string;
  phonetic: string;
  definitions: string[];
  examples: string[];
  hasResult: boolean;
}

export interface ChromeMessage {
  action: string;
  text?: string;
  apiUrl?: string;
  useBackendProxy?: boolean;
  backendProxyUrl?: string;
}

export interface ChromeMessageResponse {
  success: boolean;
  data?: QueryResult;
  error?: string;
}

export interface UserPreferences {
  panelWidth?: number;
  isPanelFixed?: boolean;
  useBackendProxy?: boolean;
  backendProxyUrl?: string;
}

export interface DOMReferences {
  panel: HTMLElement | null;
  panelHeader: HTMLElement | null;
  panelContent: HTMLElement | null;
  panelHandle: HTMLElement | null;
  toggleButton: HTMLButtonElement | null;
  fixButton: HTMLButtonElement | null;
  loadingIndicator: HTMLElement | null;
}

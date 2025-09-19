import * as vscode from 'vscode';
import { TokenUsageData } from './tokenMonitor';

// Add DOM types for browser APIs
declare const globalThis: any;

interface APIEndpoint {
    domain: string;
    provider: 'openai' | 'anthropic' | 'github' | 'copilot';
    tokenField?: string;
}

export class NetworkInterceptor {
    private outputChannel: vscode.OutputChannel;
    private originalFetch: typeof globalThis.fetch;
    private onTokenUsage?: (usage: TokenUsageData) => void;
    private isInterceptingFlag = false;

    // Known API endpoints that return token usage
    private apiEndpoints: APIEndpoint[] = [
        { domain: 'api.openai.com', provider: 'openai' },
        { domain: 'api.anthropic.com', provider: 'anthropic' },
        { domain: 'copilot-proxy.githubusercontent.com', provider: 'github' },
        { domain: 'api.githubcopilot.com', provider: 'copilot' },
        { domain: 'github.com', provider: 'github' }
    ];

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Network Interceptor');
        this.originalFetch = globalThis.fetch;
    }

    public setTokenUsageCallback(callback: (usage: TokenUsageData) => void): void {
        this.onTokenUsage = callback;
    }

    public isIntercepting(): boolean {
        return this.isInterceptingFlag;
    }

    public startInterception(): void {
        if (this.isInterceptingFlag) {
            console.log('[NetworkInterceptor] Already active, skipping start');
            return;
        }

        try {
            console.log('[NetworkInterceptor] Starting network interception...');
            this.isInterceptingFlag = true;
            this.createFetchInterceptor();
            console.log('[NetworkInterceptor] Network interception started successfully (fetch only)');
        } catch (error) {
            console.error('[NetworkInterceptor] Failed to start interception:', error);
            this.isInterceptingFlag = false;
            throw error;
        }
    }

    public stopInterception(): void {
        if (!this.isInterceptingFlag) {
            return;
        }

        // Restore original functions
        globalThis.fetch = this.originalFetch;

        this.isInterceptingFlag = false;
        this.outputChannel.appendLine('🛑 Network interception stopped');
    }

    private createFetchInterceptor(): void {
        console.log('[NetworkInterceptor] Installing fetch interceptor...');

        const self = this;
        const originalFetch = this.originalFetch;

        globalThis.fetch = async function (input: any, init?: any): Promise<any> {
            const url = input instanceof Request ? input.url : input.toString();
            console.log('[NetworkInterceptor] Fetch call detected:', url);

            try {
                // Call original fetch
                const response = await originalFetch(input, init);

                // Check if this is an API request we're interested in
                if (self.isTargetAPICall(url)) {
                    console.log('[NetworkInterceptor] Relevant API call detected:', url);
                    self.outputChannel.appendLine(`🔍 Intercepted API call: ${url}`);

                    // Clone response so we can read it without consuming the original
                    const clonedResponse = response.clone();

                    // Process the response for token usage
                    self.processAPIResponse(url, clonedResponse);
                }

                return response;
            } catch (error) {
                console.log('[NetworkInterceptor] Fetch error:', error);
                self.outputChannel.appendLine(`❌ Fetch error: ${error}`);
                throw error;
            }
        };

        console.log('[NetworkInterceptor] Fetch interceptor installed successfully');
    }



    private isTargetAPICall(url: string): boolean {
        console.log('[NetworkInterceptor] Checking if target API call:', url);

        const isTarget = this.apiEndpoints.some(endpoint => {
            const domainMatch = url.includes(endpoint.domain);
            const pathMatch = url.includes('chat') || url.includes('completion') || url.includes('message');

            console.log(`[NetworkInterceptor] Domain ${endpoint.domain}: match=${domainMatch}, pathMatch=${pathMatch}`);
            return domainMatch && pathMatch;
        });

        console.log('[NetworkInterceptor] Is target API call:', isTarget);
        return isTarget;
    }

    private async processAPIResponse(url: string, response: Response): Promise<void> {
        try {
            const data = await response.json();
            this.extractTokenUsage(url, data);
        } catch (error) {
            this.outputChannel.appendLine(`⚠️ Failed to parse API response: ${error}`);
        }
    }



    private extractTokenUsage(url: string, data: any): void {
        let tokenUsage: TokenUsageData | null = null;

        // OpenAI format
        if (data.usage) {
            tokenUsage = {
                input_tokens: data.usage.prompt_tokens || 0,
                output_tokens: data.usage.completion_tokens || 0,
                total_tokens: data.usage.total_tokens || 0,
                timestamp: new Date(),
                model: data.model,
                request_id: data.id
            };
        }
        // Anthropic format
        else if (data.usage) {
            tokenUsage = {
                input_tokens: data.usage.input_tokens || 0,
                output_tokens: data.usage.output_tokens || 0,
                total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
                timestamp: new Date(),
                model: data.model,
                request_id: data.id
            };
        }
        // GitHub Copilot format (might be different)
        else if (data.token_count || data.tokens) {
            const tokens = data.token_count || data.tokens;
            tokenUsage = {
                input_tokens: Math.floor(tokens * 0.3), // Estimate
                output_tokens: Math.floor(tokens * 0.7),
                total_tokens: tokens,
                timestamp: new Date(),
                model: 'github-copilot',
                request_id: data.id || data.request_id
            };
        }

        if (tokenUsage && this.onTokenUsage) {
            this.outputChannel.appendLine(
                `📊 Token usage extracted: ${tokenUsage.total_tokens} tokens (${tokenUsage.input_tokens}+${tokenUsage.output_tokens})`
            );
            this.onTokenUsage(tokenUsage);
        } else {
            this.outputChannel.appendLine(`🔍 API response (no token usage found): ${JSON.stringify(data).substring(0, 200)}...`);
        }
    }

    public dispose(): void {
        this.stopInterception();
        this.outputChannel?.dispose();
    }
}
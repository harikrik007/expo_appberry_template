import Constants from 'expo-constants';

interface CacheEntry {
    value: string;
    expiry: number;
}

interface KeystoreResponse {
    status: boolean;
    message?: string;
    secret_value?: string;
}

interface KeystoreRequestBody {
    data: {
        project_id: string;
        secret_name: string;
    };
}

class KeystoreClient {
    private baseUrl: string;
    private apiKey: string;
    private projectId: string;
    private cache: Map<string, CacheEntry>;
    private cacheTTL: number;

    constructor() {
        this.baseUrl = 'https://nfapi.nofrills.ai';
        this.apiKey = Constants.expoConfig?.extra?.DB_API_KEY || '';
        this.projectId = Constants.expoConfig?.extra?.PROJECT_ID || '';
        this.cache = new Map<string, CacheEntry>();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes

        if (!this.apiKey) {
            console.warn('DB_API_KEY environment variable is not set');
        }
        if (!this.projectId) {
            console.warn('PROJECT_ID environment variable is not set');
        }
    }

    private getCacheKey(projectId: string, secretName: string): string {
        return `${projectId}:${secretName}`;
    }

    private getFromCache(projectId: string, secretName: string): string | null {
        const key = this.getCacheKey(projectId, secretName);
        const cached = this.cache.get(key);

        if (cached && cached.expiry > Date.now()) {
            return cached.value;
        }

        this.cache.delete(key);
        return null;
    }

    private setCache(projectId: string, secretName: string, value: string): void {
        const key = this.getCacheKey(projectId, secretName);
        this.cache.set(key, {
            value,
            expiry: Date.now() + this.cacheTTL,
        });
    }

    /**
     * Get a secret value by name
     * @param secretName - The name of the secret to retrieve
     * @param projectId - Optional project ID (uses PROJECT_ID from env if not provided)
     * @returns The secret value or null if not found
     */
    async getSecret(secretName: string, projectId?: string): Promise<string | null> {
        const pid = projectId || this.projectId;

        if (!pid) {
            console.error('Project ID is required. Provide it as parameter or set PROJECT_ID env variable');
            return null;
        }

        // Check cache first
        const cached = this.getFromCache(pid, secretName);
        if (cached) {
            return cached;
        }

        try {
            const requestBody: KeystoreRequestBody = {
                data: {
                    project_id: pid,
                    secret_name: secretName,
                },
            };

            const response = await fetch(
                `${this.baseUrl}/api/v1/keystore/read_secret`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': `Key ${this.apiKey}`,
                    },
                    body: JSON.stringify(requestBody),
                }
            );

            if (!response.ok) {
                throw new Error(`Keystore API error: ${response.status}`);
            }

            const result: KeystoreResponse = await response.json();

            if (!result.status) {
                console.error(`Failed to fetch secret: ${result.message}`);
                return null;
            }

            const secretValue = result.secret_value || null;

            // Cache the result
            if (secretValue) {
                this.setCache(pid, secretName, secretValue);
            }

            return secretValue;
        } catch (error) {
            console.error(`Failed to fetch secret "${secretName}":`, error);
            return null;
        }
    }

    /**
     * Clear cache for a specific secret or all secrets
     * @param projectId - Optional project ID
     * @param secretName - Optional secret name
     */
    clearCache(projectId?: string, secretName?: string): void {
        if (projectId && secretName) {
            const key = this.getCacheKey(projectId, secretName);
            this.cache.delete(key);
        } else if (projectId) {
            // Clear all secrets for this project
            for (const key of this.cache.keys()) {
                if (key.startsWith(`${projectId}:`)) {
                    this.cache.delete(key);
                }
            }
        } else {
            // Clear entire cache
            this.cache.clear();
        }
    }

    /**
     * Set custom cache TTL in milliseconds
     * @param ttlMs - Time to live in milliseconds
     */
    setCacheTTL(ttlMs: number): void {
        this.cacheTTL = ttlMs;
    }
}

// Singleton instance
const keystoreClient = new KeystoreClient();

/**
 * Convenience function for getting a secret
 * @param secretName - The name of the secret to retrieve
 * @param projectId - Optional project ID (uses PROJECT_ID from env if not provided)
 * @returns The secret value or null if not found
 */
async function getSecret(secretName: string, projectId?: string): Promise<string | null> {
    return keystoreClient.getSecret(secretName, projectId);
}

export { keystoreClient, getSecret, KeystoreClient };
export type { KeystoreResponse, CacheEntry };
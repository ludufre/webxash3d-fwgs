/**
 * File entry in the manifest
 */
export interface FileEntry {
    /** Relative path within the game directory (e.g., "valve/models/player.mdl") */
    path: string;
    /** File size in bytes */
    size: number;
    /** Optional custom URL (if not using baseUrl + path) */
    url?: string;
}

/**
 * Manifest file format
 */
export interface Manifest {
    /** Manifest format version */
    version: number;
    /** Base path for files in the virtual filesystem (e.g., "/rodir/") */
    basePath: string;
    /** Base URL for downloading files (e.g., "https://cdn.example.com/") */
    baseUrl: string;
    /** List of files available for lazy loading */
    files: FileEntry[];
}

/**
 * ManifestManager handles lazy loading of game files.
 * It maintains a manifest of available files and manages their download state.
 */
export class ManifestManager {
    private manifest: Map<string, FileEntry> = new Map();
    private downloading: Map<string, Promise<Uint8Array>> = new Map();
    private basePath: string = '/rodir/';
    private baseUrl: string = '';

    /**
     * Load a manifest from a URL
     * @param url - URL to the manifest JSON file
     */
    async loadManifest(url: string): Promise<void> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load manifest from ${url}: ${response.status} ${response.statusText}`);
        }

        const data: Manifest = await response.json();

        if (data.version !== 1) {
            throw new Error(`Unsupported manifest version: ${data.version}`);
        }

        this.basePath = data.basePath || '/rodir/';
        this.baseUrl = data.baseUrl || '';

        this.manifest.clear();
        for (const file of data.files) {
            // Normalize path - remove leading slash and lowercase for case-insensitive lookup
            const normalizedPath = file.path.replace(/^\/+/, '').toLowerCase();
            this.manifest.set(normalizedPath, file);
        }

        console.log(`[ManifestManager] Loaded manifest with ${this.manifest.size} files`);
    }

    /**
     * Load a manifest from a data object
     * @param data - Manifest data object
     */
    loadManifestData(data: Manifest): void {
        if (data.version !== 1) {
            throw new Error(`Unsupported manifest version: ${data.version}`);
        }

        this.basePath = data.basePath || '/rodir/';
        this.baseUrl = data.baseUrl || '';

        this.manifest.clear();
        for (const file of data.files) {
            // Normalize path - remove leading slash and lowercase for case-insensitive lookup
            const normalizedPath = file.path.replace(/^\/+/, '').toLowerCase();
            this.manifest.set(normalizedPath, file);
        }

        console.log(`[ManifestManager] Loaded manifest with ${this.manifest.size} files`);
    }

    /** Game directory prefixes to try when looking up files
     *  Order matters: mod dir first, then base game
     */
    private gameDirs: string[] = ['cstrike', 'valve'];

    /**
     * Set game directory prefixes for path resolution
     * @param dirs - Array of directory names to try, in order of precedence
     */
    setGameDirs(dirs: string[]): void {
        this.gameDirs = dirs.map(d => d.toLowerCase());
        console.log(`[ManifestManager] Game directories set to: ${this.gameDirs.join(', ')}`);
    }

    /**
     * Check if a file exists in the manifest
     * @param path - File path to check
     */
    has(path: string): boolean {
        const resolvedPath = this.resolvePath(path);
        const found = resolvedPath !== null;
        console.log(`[ManifestManager] has('${path}') -> resolved='${resolvedPath}', found=${found}`);
        return found;
    }

    /**
     * Resolve a path to its manifest entry, trying game directory prefixes if needed
     * @param path - File path to resolve
     * @returns The resolved path in manifest, or null if not found
     */
    private resolvePath(path: string): string | null {
        const normalizedPath = this.normalizePath(path);

        // Try exact path first
        if (this.manifest.has(normalizedPath)) {
            return normalizedPath;
        }

        // If path already starts with a game dir, don't try prefixes
        for (const gameDir of this.gameDirs) {
            if (normalizedPath.startsWith(gameDir + '/')) {
                console.log(`[ManifestManager] resolvePath('${path}'): already has gameDir prefix, not found`);
                return null;
            }
        }

        // Try with game directory prefixes
        for (const gameDir of this.gameDirs) {
            const prefixedPath = `${gameDir}/${normalizedPath}`;
            if (this.manifest.has(prefixedPath)) {
                return prefixedPath;
            }
        }

        return null;
    }

    /**
     * Get file entry from manifest
     * @param path - File path
     */
    get(path: string): FileEntry | undefined {
        const resolvedPath = this.resolvePath(path);
        if (!resolvedPath) return undefined;
        return this.manifest.get(resolvedPath);
    }

    /**
     * Check if a file is currently being downloaded
     * @param path - File path
     */
    isDownloading(path: string): boolean {
        const resolvedPath = this.resolvePath(path);
        if (!resolvedPath) return false;
        return this.downloading.has(resolvedPath);
    }

    /**
     * Fetch a file from the server
     * @param path - File path to fetch
     * @returns Promise resolving to file contents
     */
    async fetchFile(path: string): Promise<Uint8Array> {
        console.log(`[ManifestManager] fetchFile('${path}')`);
        const resolvedPath = this.resolvePath(path);
        if (!resolvedPath) {
            console.error(`[ManifestManager] fetchFile: File not in manifest: ${path}`);
            throw new Error(`File not in manifest: ${path}`);
        }

        // Check if already downloading
        const existing = this.downloading.get(resolvedPath);
        if (existing) {
            console.log(`[ManifestManager] fetchFile: Already downloading '${resolvedPath}'`);
            return existing;
        }

        // Get file entry
        const entry = this.manifest.get(resolvedPath);
        if (!entry) {
            throw new Error(`File not in manifest: ${path}`);
        }

        // Build URL - use original path from entry for case-sensitive servers
        const url = entry.url || (this.baseUrl + entry.path);
        console.log(`[ManifestManager] fetchFile: Downloading '${path}' -> '${url}'`);

        // Start download
        const downloadPromise = this.doFetch(url, resolvedPath);
        this.downloading.set(resolvedPath, downloadPromise);

        try {
            const result = await downloadPromise;
            console.log(`[ManifestManager] fetchFile: Downloaded '${path}' (${result.length} bytes)`);
            return result;
        } finally {
            this.downloading.delete(resolvedPath);
        }
    }

    /**
     * Get the base path for files in the virtual filesystem
     */
    getBasePath(): string {
        return this.basePath;
    }

    /**
     * Get the full virtual filesystem path for a file
     * @param path - Relative file path
     */
    getFullPath(path: string): string {
        const resolvedPath = this.resolvePath(path);
        if (resolvedPath) {
            // Use original path from entry for consistency
            const entry = this.manifest.get(resolvedPath);
            if (entry) {
                return this.basePath + entry.path;
            }
            return this.basePath + resolvedPath;
        }
        // Fallback to normalized path if not in manifest
        const normalizedPath = this.normalizePath(path);
        return this.basePath + normalizedPath;
    }

    /**
     * Get number of files in manifest
     */
    get size(): number {
        return this.manifest.size;
    }

    /**
     * Normalize a path for consistent lookups
     */
    private normalizePath(path: string): string {
        // Remove basePath prefix if present
        if (path.startsWith(this.basePath)) {
            path = path.slice(this.basePath.length);
        }
        // Remove leading slashes
        return path.replace(/^\/+/, '').toLowerCase();
    }

    /**
     * Perform the actual fetch operation
     */
    private async doFetch(url: string, path: string): Promise<Uint8Array> {

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const data = new Uint8Array(buffer);

        return data;
    }
}

#!/usr/bin/env npx ts-node

/**
 * Generate a manifest file for lazy loading game assets.
 *
 * Usage:
 *   npx ts-node scripts/generate-manifest.ts <directory> [options]
 *
 * Options:
 *   --output, -o    Output file path (default: manifest.json)
 *   --base-path     Base path in virtual filesystem (default: /rodir/)
 *   --base-url      Base URL for downloading files (default: ./)
 *   --exclude       Glob patterns to exclude (can be specified multiple times)
 *   --include       Glob patterns to include (default: all files)
 *
 * Example:
 *   npx ts-node scripts/generate-manifest.ts ./game-files --base-url https://cdn.example.com/
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileEntry {
    path: string;
    size: number;
}

interface Manifest {
    version: number;
    basePath: string;
    baseUrl: string;
    files: FileEntry[];
}

interface Options {
    directory: string;
    output: string;
    basePath: string;
    baseUrl: string;
    exclude: string[];
    include: string[];
}

function parseArgs(): Options {
    const args = process.argv.slice(2);
    const options: Options = {
        directory: '',
        output: 'manifest.json',
        basePath: '/rodir/',
        baseUrl: './',
        exclude: [],
        include: [],
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        if (arg === '--output' || arg === '-o') {
            options.output = args[++i];
        } else if (arg === '--base-path') {
            options.basePath = args[++i];
        } else if (arg === '--base-url') {
            options.baseUrl = args[++i];
        } else if (arg === '--exclude') {
            options.exclude.push(args[++i]);
        } else if (arg === '--include') {
            options.include.push(args[++i]);
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else if (!arg.startsWith('-')) {
            options.directory = arg;
        } else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        }
        i++;
    }

    if (!options.directory) {
        console.error('Error: Directory path is required');
        printHelp();
        process.exit(1);
    }

    return options;
}

function printHelp(): void {
    console.log(`
Generate a manifest file for lazy loading game assets.

Usage:
  npx ts-node scripts/generate-manifest.ts <directory> [options]

Options:
  --output, -o    Output file path (default: manifest.json)
  --base-path     Base path in virtual filesystem (default: /rodir/)
  --base-url      Base URL for downloading files (default: ./)
  --exclude       Glob patterns to exclude (can be specified multiple times)
  --include       Glob patterns to include (default: all files)
  --help, -h      Show this help message

Example:
  npx ts-node scripts/generate-manifest.ts ./game-files --base-url https://cdn.example.com/
`);
}

function shouldInclude(filePath: string, options: Options): boolean {
    const relativePath = filePath.toLowerCase();

    // Check exclusions
    for (const pattern of options.exclude) {
        if (matchGlob(relativePath, pattern.toLowerCase())) {
            return false;
        }
    }

    // If no include patterns specified, include everything
    if (options.include.length === 0) {
        return true;
    }

    // Check inclusions
    for (const pattern of options.include) {
        if (matchGlob(relativePath, pattern.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Simple glob matching (supports * and **)
 */
function matchGlob(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    let regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars except * and ?
        .replace(/\*\*/g, '{{DOUBLE_STAR}}')    // Temporarily replace **
        .replace(/\*/g, '[^/]*')                // * matches anything except /
        .replace(/\?/g, '[^/]')                 // ? matches single char except /
        .replace(/\{\{DOUBLE_STAR\}\}/g, '.*'); // ** matches anything including /

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
}

function scanDirectory(dir: string, baseDir: string, options: Options): FileEntry[] {
    const files: FileEntry[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            // Recursively scan subdirectories
            files.push(...scanDirectory(fullPath, baseDir, options));
        } else if (entry.isFile()) {
            if (shouldInclude(relativePath, options)) {
                const stats = fs.statSync(fullPath);
                files.push({
                    path: relativePath,
                    size: stats.size,
                });
            }
        }
    }

    return files;
}

function main(): void {
    const options = parseArgs();

    // Resolve and validate directory
    const directory = path.resolve(options.directory);
    if (!fs.existsSync(directory)) {
        console.error(`Error: Directory not found: ${directory}`);
        process.exit(1);
    }

    const stats = fs.statSync(directory);
    if (!stats.isDirectory()) {
        console.error(`Error: Not a directory: ${directory}`);
        process.exit(1);
    }

    console.log(`Scanning directory: ${directory}`);

    // Scan for files
    const files = scanDirectory(directory, directory, options);

    // Sort files by path for consistent output
    files.sort((a, b) => a.path.localeCompare(b.path));

    // Calculate total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    // Create manifest
    const manifest: Manifest = {
        version: 1,
        basePath: options.basePath,
        baseUrl: options.baseUrl,
        files,
    };

    // Write manifest
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

    console.log(`\nManifest generated: ${outputPath}`);
    console.log(`  Files: ${files.length}`);
    console.log(`  Total size: ${formatSize(totalSize)}`);
    console.log(`  Base path: ${options.basePath}`);
    console.log(`  Base URL: ${options.baseUrl}`);
}

function formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

main();

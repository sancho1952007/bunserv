#!/usr/bin/env bun
import { serve } from 'bun';
import { parseArgs } from "util";
import logo from './helpers/logo.txt';
import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { normalize } from './helpers/normalize';
import { createWriteStream, existsSync, mkdirSync, WriteStream } from 'node:fs';

// Controls whether logger is to be enabled
let loggerEnabled = false;

// Controls whether caching is to be enabled
let cachingEnabled = false;

// Stores the file caches
let caches = new Map<string, Response>();

// Hostname
let hostname: any = '0.0.0.0';

// Stores the log writer
let logWriter: WriteStream;

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        help: {
            type: "boolean"
        },
        dir: {
            type: "string"
        },
        logreq: {
            type: "boolean",
        },
        savelog: {
            type: "boolean"
        },
        logfile: {
            type: "string"
        },
        cache: {
            type: "boolean"
        },
        port: {
            type: "string",
            default: '8080'
        },
        hostname: {
            type: "string"
        }
    },
    strict: false
});

// The directory where script is triggered
const root_dir = values.dir || process.cwd();

if (values.savelog) {
    let logFilePath;
    if (values.logfile) {
        logFilePath = values.logfile as string;
        const logFileDir = dirname(logFilePath);

        if (!existsSync(logFileDir)) {
            console.log(`[LOG] Creating directory ${logFileDir} for logfile since it doesn't exist`)
            mkdirSync(logFileDir, { recursive: true });
        }
    } else {
        // Store logs in parent dir so that they're not exposed
        logFilePath = join(root_dir, '..', 'bunserve-logs.txt');
    }
    console.log(`[LOG] Saving logs to ${logFilePath}`)
    logWriter = createWriteStream(logFilePath, { flags: 'a' });
}

// Logger
const log = (content: string): void => {
    console.log(content);

    if (values.savelog) {
        logWriter.write(content + '\n');
    }
}

if (values.help) {
    console.log(`${logo}\n© 2026 - Sancho Godinho (https://sancho.sg-app.com/)`);
    console.table([
        { parameter: '--help', usage: 'View this help screen', default: '-' },
        { parameter: '--dir', usage: 'Directory you want to serve', default: 'Current Directory' },
        { parameter: '--port <number>', usage: 'Use a specific port', default: '8080' },
        { parameter: '--hostname <string>', usage: 'Use a specific hostname', default: '0.0.0.0' },
        { parameter: '--cache', usage: 'Cache request contents', default: 'Not Enabled' },
        { parameter: '--logreq', usage: 'Log all requests', default: 'Not Enabled' },
        { parameter: '--savelog', usage: 'Save the logs', default: 'Not Enabled' },
        { parameter: '--logfile', usage: 'The path of the logfile', default: '(Parent directory where server is started)/bunserve-logs.txt' }
    ]);
    process.exit(0);
}

if (values.logreq) {
    log('[LOG] Request logs have been enabled');
    loggerEnabled = true;
}

if (values.cache) {
    log('[LOG] Caching has been enabled');
    cachingEnabled = true;
}

if (values.hostname) {
    log(`[LOG] Using hostname ${values.hostname}`)
    hostname = values.hostname;
}

const portParsed = parseInt(values.port as string);
if (Number.isNaN(portParsed)) {
    log('[LOG] Invalid port!')
    process.exit(2);
}

const port = portParsed;

const listFiles = async (dir: string): Promise<string> => {
    const contents = await readdir(join(root_dir, dir));
    const files = [];
    const folders = [];

    for (const content of contents) {
        const stats = await stat(join(root_dir, dir, content));
        if (stats.isDirectory()) {
            folders.push(content);
        } else {
            files.push(content);
        }
    }

    // Add the back button only if user is not on "/" route
    const parent = dir === '/' ? null : normalize(dir + '/..');

    let final = parent ? `<a href="${parent}"><- Back</a><br/>` : '';

    folders.forEach(folder => {
        const normalized = normalize(`${dir}/${folder}`);
        final += `<a href="${normalized}">${normalized.replace('/', '')}</a><br/>`;
    });

    files.forEach(file => {
        const normalized = normalize(`${dir}/${file}`);
        final += `<a href="${normalized}">${normalized.replace('/', '')}</a><br/>`;
    });

    return final;
};

serve({
    fetch: async (req, server) => {
        const url = new URL(req.url);

        if (loggerEnabled) {
            log(`[REQ] ${new Date().toISOString()} ${server.requestIP(req)?.address} ${url.pathname}`)
        }

        if (cachingEnabled) {
            if (caches.has(url.pathname)) {
                return caches.get(url.pathname)!.clone();
            }
        }

        if (url.pathname === '/') {
            const indexFile = Bun.file(join(root_dir, 'index.html'));
            if (await indexFile.exists()) {
                const res = new Response(indexFile);
                caches.set(url.pathname, res.clone());
                return res;
            } else {
                const listing = await listFiles(url.pathname);
                const res = new Response(listing, {
                    headers: { 'Content-Type': 'text/html' }
                });
                caches.set(url.pathname, res.clone());
                return res;
            }
        } else {
            const file = Bun.file(join(root_dir, url.pathname));
            if (await file.exists()) {
                const res = new Response(file);
                caches.set(url.pathname, res.clone());
                return res;
            } else {
                try {
                    const stats = await stat(join(root_dir, url.pathname));
                    if (stats.isDirectory()) {
                        const listing = await listFiles(url.pathname);
                        const res = new Response(listing, {
                            headers: { 'Content-Type': 'text/html' }
                        });

                        caches.set(url.pathname, res.clone());
                        return res;
                    }
                } catch (e) { }

                return new Response('<p>Not Found!</p>', {
                    status: 404,
                    headers: { 'Content-Type': 'text/html' }
                });
            }
        }
    },
    port: port,
    hostname: hostname
});

process.on('exit', () => {
    if (logWriter) {
        logWriter.end();
    }
});

log(`[LOG] Using root dir ${root_dir}`);
log(`[LOG] Server started on port ${port}`);
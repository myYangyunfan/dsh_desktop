import { AGY_IMAGE_ROOT, stripAgyImageReferences, agyImageReferences, readAgyImage } from './image-store.js';
import { promises as fs } from 'node:fs';
import { MAX_AGENT_ACP_TRANSFER_BYTES } from '@dsh-remote/protocol';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
// Load prefix-only Node builtins natively, including under older Vite runners.
const nodeRequire = createRequire(import.meta.url);
export function cleanUserPrompt(raw) {
    if (!raw)
        return '';
    raw = stripAgyImageReferences(raw);
    const match = raw.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return raw.trim();
}
export async function loadTranscriptEvents(conversationId, sessionId, baseDir = join(homedir(), '.gemini/antigravity-cli/brain')) {
    let content = '';
    try {
        const filePath = await transcriptPath(baseDir, conversationId);
        if (filePath === undefined || (await fs.stat(filePath)).size > MAX_AGENT_ACP_TRANSFER_BYTES)
            return [];
        content = await fs.readFile(filePath, 'utf-8');
    }
    catch {
        return [];
    }
    const lines = content.split('\n');
    const events = [];
    let currentSeq = 0;
    let currentTurn = 0;
    let turnOpen = false;
    const push = (type, data, time, surface = false) => {
        events.push({
            type: 'event',
            event: {
                type,
                seq: currentSeq++,
                time,
                data,
                ...(surface ? { surfaceOp: 'append' } : {}),
            },
        });
    };
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        let record;
        try {
            record = JSON.parse(trimmed);
        }
        catch {
            continue;
        }
        const time = record.created_at ? new Date(record.created_at).getTime() : Date.now();
        if (record.type === 'USER_INPUT') {
            if (turnOpen) {
                push('step/end', { turn: currentTurn, step: 1 }, time);
                push('turn/end', { turn: currentTurn, reason: { kind: 'completed' } }, time);
                turnOpen = false;
            }
            currentTurn += 1;
            turnOpen = true;
            push('turn/start', { turn: currentTurn }, time);
            push('step/start', { turn: currentTurn, step: 1 }, time);
            const text = cleanUserPrompt(record.content);
            const images = (await Promise.all(agyImageReferences(record.content ?? '').map(path => readAgyImage(conversationId, path))))
                .filter((image) => image !== undefined);
            push('user/message', {
                id: `user:${record.step_index}`,
                role: 'user',
                content: [...(text ? [{ type: 'text', text }] : []), ...images],
                source: { kind: 'user' },
            }, time, true);
        }
        else if (record.type === 'PLANNER_RESPONSE') {
            if (!turnOpen) {
                currentTurn += 1;
                turnOpen = true;
                push('turn/start', { turn: currentTurn }, time);
                push('step/start', { turn: currentTurn, step: 1 }, time);
            }
            if (Array.isArray(record.tool_calls)) {
                for (const call of record.tool_calls) {
                    const toolName = (typeof call.name === 'string' && call.name.length > 0) ? call.name : 'tool';
                    const callId = `${record.step_index}:${toolName}`;
                    push('tool/call', {
                        turn: currentTurn,
                        step: 1,
                        callId,
                        name: toolName,
                        arguments: typeof call.args === 'object' && call.args !== null ? JSON.stringify(call.args) : '{}',
                        toolCallId: callId,
                        toolName,
                        status: call.status === 'ERROR' ? 'failed' : 'finished',
                    }, time, false);
                }
            }
            if (record.content && record.content.trim() !== '') {
                const contentBlocks = [];
                if (record.thinking && record.thinking.trim() !== '') {
                    contentBlocks.push({ type: 'reasoning', text: record.thinking.trim() });
                }
                contentBlocks.push({ type: 'text', text: record.content.trim() });
                push('assistant/message', {
                    turn: currentTurn,
                    step: 1,
                    message: {
                        id: `${sessionId}:${record.step_index}`,
                        role: 'assistant',
                        content: contentBlocks,
                    },
                    // Harness trajectory timing expects every assistant message to carry
                    // an iterable stream, including messages restored from transcript.
                    stream: [],
                }, time, true);
            }
        }
    }
    if (turnOpen) {
        // Hydration must not extend a settled turn until the time of the read.
        const settledAt = events.at(-1)?.event.time ?? Date.now();
        push('step/end', { turn: currentTurn, step: 1 }, settledAt);
        push('turn/end', { turn: currentTurn, reason: { kind: 'completed' } }, settledAt);
    }
    return events;
}
async function querySqliteJson(dbPath, sql, params = []) {
    try {
        const { DatabaseSync } = nodeRequire('node:sqlite');
        const db = new DatabaseSync(dbPath, { readOnly: true });
        try {
            const stmt = db.prepare(sql);
            const rows = stmt.all(...params);
            return rows;
        }
        finally {
            db.close();
        }
    }
    catch {
        // fallback to sqlite3 CLI
    }
    try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        let formattedSql = sql;
        for (const p of params) {
            const val = typeof p === 'number' ? String(p) : `'${String(p).replace(/'/g, "''")}'`;
            formattedSql = formattedSql.replace('?', val);
        }
        const { stdout } = await execFileAsync('sqlite3', [dbPath, '-json', formattedSql]);
        return JSON.parse(stdout || '[]');
    }
    catch {
        return [];
    }
}
export async function discoverAntigravityWorkspaces(dbPath = join(homedir(), '.gemini/antigravity-cli/conversation_summaries.db'), baseDir = join(homedir(), '.gemini/antigravity-cli/brain')) {
    try {
        await fs.stat(dbPath);
    }
    catch {
        return [];
    }
    const sql = "SELECT conversation_id, workspace_uris, step_count, title FROM conversation_summaries ORDER BY step_count DESC;";
    const rows = await querySqliteJson(dbPath, sql);
    const paths = new Set();
    for (const row of rows) {
        if (!row?.workspace_uris)
            continue;
        if (!(row.step_count && row.step_count > 0) && !row.title?.trim() && !await readTranscriptSummary(baseDir, row.conversation_id))
            continue;
        try {
            const uris = JSON.parse(row.workspace_uris);
            if (Array.isArray(uris)) {
                for (const u of uris) {
                    if (typeof u === 'string' && u.startsWith('file://')) {
                        try {
                            const p = fileURLToPath(u);
                            const imageRelative = relative(AGY_IMAGE_ROOT, p);
                            const imageCache = imageRelative === '' || (!isAbsolute(imageRelative)
                                && imageRelative !== '..' && !imageRelative.startsWith(`..${sep}`));
                            if (!imageCache)
                                paths.add(p);
                        }
                        catch {
                            // ignore
                        }
                    }
                }
            }
        }
        catch {
            // ignore
        }
    }
    const verified = [];
    for (const p of paths) {
        try {
            const s = await fs.stat(p);
            if (s.isDirectory())
                verified.push(p);
        }
        catch {
            // ignore
        }
    }
    return verified;
}
async function readTranscriptSummary(baseDir, conversationId) {
    try {
        const path = await transcriptPath(baseDir, conversationId);
        if (path === undefined)
            return undefined;
        const stat = await fs.stat(path);
        const handle = await fs.open(path, 'r');
        try {
            const buffer = Buffer.alloc(4096);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            const firstLine = buffer.subarray(0, bytesRead).toString('utf-8').split('\n')[0];
            if (!firstLine)
                return undefined;
            const record = JSON.parse(firstLine);
            if (record.type !== 'USER_INPUT')
                return undefined;
            const title = cleanUserPrompt(record.content).split('\n')[0]?.trim().slice(0, 40) || (agyImageReferences(record.content ?? '').length > 0 ? 'Image' : undefined);
            if (!title)
                return undefined;
            return { conversationId, title, createdAt: record.created_at ? new Date(record.created_at).getTime() : stat.mtimeMs, updatedAt: stat.mtimeMs };
        }
        finally {
            await handle.close();
        }
    }
    catch {
        return undefined;
    }
}
export async function discoverAntigravitySessions(workspacePath, limit = 30, baseDir = join(homedir(), '.gemini/antigravity-cli/brain'), dbPath = join(homedir(), '.gemini/antigravity-cli/conversation_summaries.db')) {
    const requestedWorkspace = workspacePath.trim() === '' ? undefined : resolve(workspacePath);
    // Database URIs provide workspace authority. Decode them before comparing so
    // percent-encoded names, path separators, and similarly named projects stay distinct.
    try {
        await fs.stat(dbPath);
        const rows = await querySqliteJson(dbPath, 'SELECT conversation_id, title, workspace_uris, step_count, last_modified_time FROM conversation_summaries ORDER BY last_modified_time DESC;');
        const summaries = [];
        for (const row of rows) {
            if (requestedWorkspace !== undefined && !workspaceMatches(row.workspace_uris, requestedWorkspace))
                continue;
            const transcript = row.title?.trim() ? undefined : await readTranscriptSummary(baseDir, row.conversation_id);
            if (!row.step_count && !row.title?.trim()) {
                if (transcript !== undefined)
                    summaries.push(transcript);
                continue;
            }
            const time = row.last_modified_time ? new Date(row.last_modified_time).getTime() : Date.now();
            summaries.push({
                conversationId: row.conversation_id,
                title: row.title?.trim() || transcript?.title || 'Untitled Session',
                createdAt: time,
                updatedAt: time,
            });
        }
        return summaries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    }
    catch {
        // Unscoped discovery may fall back to transcript scanning without a database.
    }
    // A transcript alone does not establish which project it belongs to.
    if (requestedWorkspace !== undefined)
        return [];
    // 2. Fallback to filesystem scanning
    let dirEntries;
    try {
        dirEntries = await fs.readdir(baseDir);
    }
    catch {
        return [];
    }
    const results = [];
    for (const entry of dirEntries) {
        if (entry === 'tempmediaStorage' || !entry.includes('-'))
            continue;
        try {
            const path = await transcriptPath(baseDir, entry);
            if (path === undefined)
                continue;
            const s = await fs.stat(path);
            const handle = await fs.open(path, 'r');
            try {
                const buf = Buffer.alloc(4096);
                const { bytesRead } = await handle.read(buf, 0, 4096, 0);
                const firstLine = buf.subarray(0, bytesRead).toString('utf-8').split('\n')[0];
                if (firstLine) {
                    const parsed = JSON.parse(firstLine);
                    const rawPrompt = cleanUserPrompt(parsed.content);
                    const title = rawPrompt ? rawPrompt.split('\n')[0]?.trim().slice(0, 40) : undefined;
                    if (title) {
                        const createdAt = parsed.created_at ? new Date(parsed.created_at).getTime() : s.mtimeMs;
                        results.push({
                            conversationId: entry,
                            title,
                            createdAt,
                            updatedAt: s.mtimeMs,
                        });
                    }
                }
            }
            finally {
                await handle.close();
            }
        }
        catch {
            // ignore
        }
    }
    results.sort((a, b) => b.updatedAt - a.updatedAt);
    return results.slice(0, limit);
}
function workspaceMatches(rawUris, requestedWorkspace) {
    if (rawUris === undefined)
        return false;
    try {
        const uris = JSON.parse(rawUris);
        return Array.isArray(uris) && uris.some(uri => {
            if (typeof uri !== 'string')
                return false;
            try {
                return resolve(fileURLToPath(uri)) === requestedWorkspace;
            }
            catch {
                return false;
            }
        });
    }
    catch {
        return false;
    }
}
/** Remote conversation ids can select only a real transcript inside the AGY brain. */
async function transcriptPath(baseDir, conversationId) {
    if (!/^[a-zA-Z0-9_-]{1,256}$/.test(conversationId))
        return undefined;
    try {
        const root = await fs.realpath(baseDir);
        const expected = join(root, conversationId, '.system_generated', 'logs', 'transcript.jsonl');
        return await fs.realpath(expected) === expected ? expected : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=transcript-loader.js.map
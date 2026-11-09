import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
/** The catalog belongs to the running Host backend, like the CodeX model directory. */
export function cachedAgyModels(load) {
    let catalog;
    let pending;
    return () => {
        if (catalog)
            return Promise.resolve(catalog);
        pending ??= load().then(value => { catalog = value; return value; })
            .finally(() => { pending = undefined; });
        return pending;
    };
}
/** Model identifiers and effort variants come from the installed CLI, never a static catalog. */
export function parseAgyModels(output) {
    const models = new Map();
    const variants = new Map();
    for (const line of output.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z0-9_.-]{1,128})\t([^\t]{1,256})$/);
        if (!match)
            continue;
        const wireId = match[1];
        const suffix = wireId.match(/-(low|medium|high|xhigh|max|thinking)$/)?.[1];
        const effort = suffix ?? (/\(Thinking\)$/i.test(match[2]) ? 'thinking' : undefined);
        const id = suffix ? wireId.slice(0, -(suffix.length + 1)) : wireId;
        const model = models.get(id) ?? { id, name: match[2].replace(/\s+\((Low|Medium|High|Xhigh|Max|Thinking)\)$/i, '') };
        if (effort) {
            model.reasoning ??= { efforts: [], defaultEffort: effort };
            if (!model.reasoning.efforts.some(item => item.id === effort))
                model.reasoning.efforts.push({ id: effort, name: effort[0].toUpperCase() + effort.slice(1) });
        }
        models.set(id, model);
        variants.set(`${id}/${effort ?? ''}`, wireId);
    }
    if (!models.size)
        throw new Error('The installed AGY CLI did not return a model catalog.');
    return { groups: [{ id: 'antigravity', name: 'Antigravity', models: [...models.values()] }], variants };
}
export async function readAgyModels(binary) {
    try {
        const result = await exec(binary, ['models'], { timeout: 30_000, maxBuffer: 1024 * 1024, encoding: 'utf8' });
        return parseAgyModels(result.stdout);
    }
    catch {
        throw new Error('The installed AGY model catalog is unavailable. Retry after checking the Host CLI.');
    }
}
export function agySelectionArgs(catalog, modelId, effort) {
    const model = catalog.groups[0].models.find(item => item.id === modelId);
    const chosenEffort = effort ?? model?.reasoning?.defaultEffort;
    const wireId = catalog.variants.get(`${modelId}/${chosenEffort ?? ''}`);
    if (!model || !wireId)
        throw new Error('The selected AGY model or reasoning effort is unavailable.');
    return { selection: { provider: 'antigravity', model: modelId, ...(chosenEffort ? { reasoningEffort: chosenEffort } : {}) },
        args: ['--model', wireId, ...(chosenEffort && chosenEffort !== 'thinking' ? ['--effort', chosenEffort] : [])] };
}
//# sourceMappingURL=models.js.map
import { z } from 'zod';
import { RpcError } from '../safe-error.js';
const id = z.string().min(1).max(256);
const cursor = z.string().min(1).max(4096).nullable().optional();
const textInput = z.object({
    type: z.literal('text'),
    text: z.string().min(1).max(256 * 1024),
}).strict();
const imageMediaType = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const canonicalBase64 = z.string()
    .min(4)
    .max(288 * 1024 * 1024)
    .refine(value => value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value), {
    message: 'Image data must use canonical base64.',
});
const imageInput = z.object({
    type: z.literal('image'),
    mediaType: imageMediaType,
    data: canonicalBase64,
}).strict();
const input = z.array(z.union([textInput, imageInput])).min(1).max(16);
const permissionPreset = z.enum(['workspace-write', 'danger-full-access']);
const projectRoot = z.object({
    path: z.string().min(1).max(4096),
}).strict();
const schemas = {
    'account/read': z.object({ refreshToken: z.literal(false).optional() }).strict(),
    'model/list': z.object({
        cursor,
        limit: z.number().int().min(1).max(100).optional(),
        includeHidden: z.boolean().optional(),
    }).strict(),
    'project/list': z.object({
        cursor,
        limit: z.number().int().min(1).max(100).optional(),
    }).strict(),
    'project/create': z.object({
        name: z.string().trim().min(1).max(256),
        roots: z.array(projectRoot).length(1),
        idempotencyKey: z.string().min(16).max(256),
    }).strict(),
    'thread/list': z.object({
        cursor,
        limit: z.number().int().min(1).max(100).optional(),
        sortKey: z.enum(['created_at', 'updated_at', 'recency_at']).optional(),
        sortDirection: z.enum(['asc', 'desc']).optional(),
        modelProviders: z.array(z.string().min(1).max(128)).max(32).nullable().optional(),
        sourceKinds: z.array(z.enum(['cli', 'vscode', 'exec', 'appServer', 'unknown'])).max(8).optional(),
        archived: z.boolean().optional(),
        isPinned: z.boolean().optional(),
        cwd: z.union([z.string().min(1).max(4096), z.array(z.string().min(1).max(4096)).min(1).max(32)]).optional(),
        useStateDbOnly: z.boolean().optional(),
        searchTerm: z.string().max(1024).optional(),
    }).strict(),
    'thread/read': z.object({ threadId: id, includeTurns: z.boolean().optional() }).strict(),
    'dsh/sessionHistory': z.object({
        threadId: id,
        beforeSeq: z.number().int().nonnegative().optional(),
        throughSeq: z.number().int().min(-1).optional(),
        maxMessages: z.number().int().min(1).max(200).optional(),
    }).strict(),
    'dsh/sessionAttachment': z.object({
        threadId: id,
        attachmentId: id,
    }).strict(),
    'dsh/directoryList': z.object({
        path: z.string().min(1).max(4096),
    }).strict(),
    'thread/start': z.object({
        cwd: z.string().min(1).max(4096),
        model: z.string().min(1).max(128).optional(),
        personality: z.string().min(1).max(64).optional(),
        permissionPreset: permissionPreset.optional(),
    }).strict(),
    'thread/resume': z.object({
        threadId: id,
        model: z.string().min(1).max(128).optional(),
        permissionPreset: permissionPreset.optional(),
    }).strict(),
    'thread/fork': z.object({
        threadId: id,
        lastTurnId: id.optional(),
        permissionPreset: permissionPreset.optional(),
    }).strict(),
    'thread/name/set': z.object({ threadId: id, name: z.string().trim().min(1).max(256) }).strict(),
    'thread/archive': z.object({ threadId: id }).strict(),
    'thread/unarchive': z.object({ threadId: id }).strict(),
    'thread/unsubscribe': z.object({ threadId: id }).strict(),
    'turn/start': z.object({
        threadId: id,
        input,
        model: z.string().min(1).max(128).optional(),
        effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional(),
        summary: z.enum(['auto', 'concise', 'detailed', 'none']).optional(),
        personality: z.string().min(1).max(64).optional(),
        permissionPreset: permissionPreset.optional(),
    }).strict(),
    'turn/steer': z.object({ threadId: id, input, expectedTurnId: id }).strict(),
    'turn/interrupt': z.object({ threadId: id, turnId: id }).strict(),
};
export const CODEX_APP_ALLOWLIST = Object.freeze(Object.keys(schemas));
export function parseCodexCall(method, params) {
    if (!Object.prototype.hasOwnProperty.call(schemas, method)) {
        throw new RpcError('METHOD_NOT_ALLOWED', 'The requested Codex method is not available over Remote.');
    }
    const schema = schemas[method];
    const parsed = schema.safeParse(params);
    if (!parsed.success)
        throw new RpcError('INVALID_MESSAGE', 'The CodeX call parameters are invalid.');
    return { method: method, params: parsed.data };
}
export function isThreadMutation(method) {
    return method === 'turn/start' || method === 'turn/steer' || method === 'turn/interrupt';
}
export function threadIdFromParams(params) {
    return typeof params.threadId === 'string' ? params.threadId : undefined;
}
//# sourceMappingURL=method-policy.js.map
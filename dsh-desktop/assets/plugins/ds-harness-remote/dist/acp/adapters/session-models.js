/** Only configuration advertised by this session may be selected. */
export class AcpSessionModelState {
    backend;
    constructor(backend) {
        this.backend = backend;
    }
    get label() { return { cursor: 'Cursor', claude: 'Claude', opencode: 'OpenCode' }[this.backend]; }
    model;
    effort;
    legacy = false;
    update(value) {
        if (!record(value))
            return;
        if (Array.isArray(value.configOptions)) {
            this.model = readOption(value.configOptions.find(option => record(option) && option.id === 'model'));
            this.effort = readOption(value.configOptions.find(option => record(option) && option.id === 'effort'));
            this.legacy = false;
        }
        else if (record(value.models) && Array.isArray(value.models.availableModels) && typeof value.models.currentModelId === 'string') {
            this.model = { id: 'model', current: value.models.currentModelId,
                options: value.models.availableModels.flatMap(model => record(model) && typeof model.modelId === 'string' && typeof model.name === 'string'
                    ? [{ id: model.modelId, name: model.name }] : []) };
            this.effort = undefined;
            this.legacy = true;
        }
        else if (value.sessionUpdate === 'current_model_update' && typeof value.currentModelId === 'string' && this.model) {
            this.model.current = value.currentModelId;
        }
    }
    catalog() {
        const model = this.model;
        const effort = this.effort;
        const models = (model?.options ?? []).map(item => ({ ...item,
            // ACP advertises effort choices only for the currently selected model.
            ...(item.id === model?.current && effort ? { reasoning: { efforts: effort.options, defaultEffort: effort.current } } : {}),
        }));
        return { current: { provider: this.backend, model: model?.current ?? 'host-settings',
                ...(effort ? { reasoningEffort: effort.current } : {}) },
            routable: models.length > 0, failures: [], groups: [{ id: this.backend, name: this.label, models }] };
    }
    async select(sessionId, model, effort, request) {
        if (typeof model !== 'string' || !this.model?.options.some(item => item.id === model)) {
            throw new Error(`The selected ${this.label} model is unavailable on this Host.`);
        }
        if (effort !== undefined && (model !== this.model.current || !this.effort?.options.some(item => item.id === effort))) {
            throw new Error(`Select the ${this.label} model before choosing an available effort level.`);
        }
        if (this.legacy) {
            await request('session/set_model', { sessionId, modelId: model });
            // A successful standard set_model response acknowledges the change.
            this.model.current = model;
        }
        else {
            this.update(await request('session/set_config_option', { sessionId, configId: 'model', value: model }));
            if (this.model?.current !== model)
                throw new Error(`${this.label} did not confirm the model change.`);
        }
        if (effort !== undefined) {
            if (!this.effort?.options.some(item => item.id === effort))
                throw new Error(`The ${this.label} effort level is unavailable.`);
            this.update(await request('session/set_config_option', { sessionId, configId: 'effort', value: effort }));
            if (this.effort?.current !== effort)
                throw new Error(`${this.label} did not confirm the effort change.`);
        }
        return { selected: this.catalog().current };
    }
}
function readOption(value) {
    if (!record(value) || value.type !== 'select' || typeof value.id !== 'string' || typeof value.currentValue !== 'string' || !Array.isArray(value.options))
        return undefined;
    const options = value.options.flatMap(option => record(option) && Array.isArray(option.options) ? option.options : [option]);
    return { id: value.id, current: value.currentValue, options: options.flatMap(option => record(option) && typeof option.value === 'string' && typeof option.name === 'string'
            ? [{ id: option.value, name: option.name }] : []) };
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=session-models.js.map
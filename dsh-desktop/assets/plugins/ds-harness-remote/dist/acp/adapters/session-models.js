const KNOWN_LABELS = {
    cursor: 'Cursor',
    claude: 'Claude',
    opencode: 'OpenCode',
    hermes: 'Hermes',
    antigravity: 'Antigravity',
    pi: 'Pi',
};
/** Only configuration advertised by this session may be selected. */
export class AcpSessionModelState {
    backend;
    constructor(backend) {
        this.backend = backend;
    }
    get label() { return KNOWN_LABELS[this.backend] ?? this.backend; }
    model;
    effort;
    modes = { availableModes: [] };
    modeConfigId;
    legacy = false;
    update(value) {
        if (!record(value))
            return;
        if (record(value.modes) && Array.isArray(value.modes.availableModes)) {
            const availableModes = value.modes.availableModes.flatMap(item => (record(item) && typeof item.id === 'string' && typeof item.name === 'string'
                ? [{
                        id: item.id,
                        name: item.name,
                        ...(typeof item.description === 'string' ? { description: item.description } : {}),
                    }]
                : []));
            this.modes = {
                ...(typeof value.modes.currentModeId === 'string' ? { currentModeId: value.modes.currentModeId } : {}),
                availableModes,
            };
            this.modeConfigId = undefined;
        }
        if (Array.isArray(value.configOptions)) {
            this.model = readOption(value.configOptions.find(option => record(option) && (option.id === 'model' || option.category === 'model')));
            this.effort = readOption(value.configOptions.find(option => record(option) && (option.id === 'effort' || option.id === 'thought_level' || option.category === 'thought_level')));
            const modeOption = value.configOptions.find(option => record(option) && (option.id === 'mode' || option.category === 'mode'));
            if (record(modeOption) && typeof modeOption.id === 'string' && Array.isArray(modeOption.options)) {
                const availableModes = flattenOptions(modeOption.options).flatMap(option => (record(option) && typeof option.value === 'string' && typeof option.name === 'string'
                    ? [{
                            id: option.value,
                            name: option.name,
                            ...(typeof option.description === 'string' ? { description: option.description } : {}),
                        }]
                    : []));
                if (availableModes.length > 0 && this.modes.availableModes.length === 0) {
                    this.modes = {
                        ...(typeof modeOption.currentValue === 'string' ? { currentModeId: modeOption.currentValue } : {}),
                        availableModes,
                    };
                    this.modeConfigId = modeOption.id;
                }
                else if (typeof modeOption.currentValue === 'string' && this.modes.availableModes.some(item => item.id === modeOption.currentValue)) {
                    this.modes = { ...this.modes, currentModeId: modeOption.currentValue };
                }
            }
            this.legacy = false;
        }
        else if (record(value.models) && Array.isArray(value.models.availableModels) && typeof value.models.currentModelId === 'string') {
            this.model = {
                id: 'model',
                current: value.models.currentModelId,
                options: value.models.availableModels.flatMap(model => record(model) && typeof model.modelId === 'string' && typeof model.name === 'string'
                    ? [{ id: model.modelId, name: model.name }] : []),
            };
            this.effort = undefined;
            this.legacy = true;
        }
        else if (value.sessionUpdate === 'current_model_update' && typeof value.currentModelId === 'string' && this.model) {
            this.model.current = value.currentModelId;
        }
        else if (value.sessionUpdate === 'current_mode_update' && typeof value.currentModeId === 'string') {
            this.modes = { ...this.modes, currentModeId: value.currentModeId };
        }
    }
    modesCatalog() {
        return {
            ...(this.modes.currentModeId === undefined ? {} : { currentModeId: this.modes.currentModeId }),
            availableModes: this.modes.availableModes.map(item => ({ ...item })),
        };
    }
    async setMode(sessionId, modeId, request) {
        if (typeof modeId !== 'string' || !this.modes.availableModes.some(item => item.id === modeId)) {
            throw new Error(`The selected ${this.label} mode is unavailable on this Host.`);
        }
        if (this.modeConfigId !== undefined) {
            this.update(await request('session/set_config_option', { sessionId, configId: this.modeConfigId, value: modeId }));
        }
        else {
            await request('session/set_mode', { sessionId, modeId });
            this.modes = { ...this.modes, currentModeId: modeId };
        }
        if (this.modes.currentModeId !== modeId) {
            throw new Error(`${this.label} did not confirm the mode change.`);
        }
        return { currentModeId: modeId };
    }
    catalog() {
        const model = this.model;
        const effort = this.effort;
        const models = (model?.options ?? []).map(item => ({
            ...item,
            // ACP advertises effort choices only for the currently selected model.
            ...(item.id === model?.current && effort ? { reasoning: { efforts: effort.options, defaultEffort: effort.current } } : {}),
        }));
        return {
            current: {
                provider: this.backend,
                model: model?.current ?? 'host-settings',
                ...(effort ? { reasoningEffort: effort.current } : {}),
            },
            routable: models.length > 0,
            failures: [],
            groups: [{ id: this.backend, name: this.label, models }],
        };
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
            if (model !== this.model.current) {
                this.update(await request('session/set_config_option', { sessionId, configId: this.model.id, value: model }));
                if (this.model?.current !== model)
                    throw new Error(`${this.label} did not confirm the model change.`);
            }
            if (effort !== undefined && this.effort) {
                this.update(await request('session/set_config_option', { sessionId, configId: this.effort.id, value: effort }));
                if (this.effort?.current !== effort)
                    throw new Error(`${this.label} did not confirm the effort change.`);
            }
        }
        return { selected: this.catalog().current };
    }
}
function flattenOptions(raw) {
    return raw.flatMap(option => record(option) && Array.isArray(option.options) ? option.options : [option]);
}
function readOption(value) {
    if (!record(value) || (value.type !== undefined && value.type !== 'select') || typeof value.id !== 'string' || typeof value.currentValue !== 'string' || !Array.isArray(value.options))
        return undefined;
    const options = flattenOptions(value.options);
    return {
        id: value.id,
        current: value.currentValue,
        options: options.flatMap(option => record(option) && typeof option.value === 'string' && typeof option.name === 'string'
            ? [{ id: option.value, name: option.name }] : []),
    };
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=session-models.js.map
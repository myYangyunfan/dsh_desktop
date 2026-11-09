"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsnParser = void 0;
const tslib_1 = require("tslib");
const asn1js = tslib_1.__importStar(require("asn1js"));
const utils_1 = require("@peculiar/utils");
const enums_1 = require("./enums");
const converters = tslib_1.__importStar(require("./converters"));
const errors_1 = require("./errors");
const helper_1 = require("./helper");
const storage_1 = require("./storage");
class AsnParser {
    static parse(data, target, options) {
        const asn1Parsed = asn1js.fromBER((0, utils_1.toArrayBuffer)(data), options?.berOptions);
        if (asn1Parsed.result.error) {
            throw new Error(asn1Parsed.result.error);
        }
        const res = this.fromASN(asn1Parsed.result, target, options);
        return res;
    }
    static fromASN(asn1Schema, target, options) {
        try {
            if ((0, helper_1.isConvertible)(target)) {
                const value = new target();
                return value.fromASN(asn1Schema);
            }
            const schema = storage_1.schemaStorage.get(target);
            storage_1.schemaStorage.cache(target);
            let targetSchema = schema.schema;
            const choiceResult = this.handleChoiceTypes(asn1Schema, schema, target, targetSchema, options);
            if (choiceResult?.result) {
                return choiceResult.result;
            }
            if (choiceResult?.targetSchema) {
                targetSchema = choiceResult.targetSchema;
            }
            const sequenceResult = this.handleSequenceTypes(asn1Schema, schema, target, targetSchema);
            const res = new target();
            if ((0, helper_1.isTypeOfArray)(target)) {
                return this.handleArrayTypes(asn1Schema, schema, target, options);
            }
            this.processSchemaItems(schema, sequenceResult, res, options);
            return res;
        }
        catch (error) {
            if (error instanceof errors_1.AsnSchemaValidationError) {
                error.schemas.push(target.name);
            }
            throw error;
        }
    }
    static handleChoiceTypes(asn1Schema, schema, target, targetSchema, options) {
        if (asn1Schema.constructor === asn1js.Constructed && schema.type === enums_1.AsnTypeTypes.Choice && asn1Schema.idBlock.tagClass === 3) {
            for (const key in schema.items) {
                const schemaItem = schema.items[key];
                if (schemaItem.context === asn1Schema.idBlock.tagNumber && schemaItem.implicit) {
                    if (typeof schemaItem.type === "function" && storage_1.schemaStorage.has(schemaItem.type)) {
                        const fieldSchema = storage_1.schemaStorage.get(schemaItem.type);
                        if (fieldSchema && fieldSchema.type === enums_1.AsnTypeTypes.Sequence) {
                            const newSeq = new asn1js.Sequence();
                            if ("value" in asn1Schema.valueBlock && Array.isArray(asn1Schema.valueBlock.value) && "value" in newSeq.valueBlock) {
                                newSeq.valueBlock.value = asn1Schema.valueBlock.value;
                                const fieldValue = this.fromASN(newSeq, schemaItem.type, options);
                                const res = new target();
                                res[key] = fieldValue;
                                return { result: res };
                            }
                        }
                    }
                }
            }
        }
        else if (asn1Schema.constructor === asn1js.Constructed && schema.type !== enums_1.AsnTypeTypes.Choice) {
            const newTargetSchema = new asn1js.Constructed({
                idBlock: {
                    tagClass: 3,
                    tagNumber: asn1Schema.idBlock.tagNumber,
                },
                value: schema.schema.valueBlock.value,
            });
            for (const key in schema.items) {
                delete asn1Schema[key];
            }
            return { targetSchema: newTargetSchema };
        }
        return null;
    }
    static handleSequenceTypes(asn1Schema, schema, target, targetSchema) {
        if (schema.type === enums_1.AsnTypeTypes.Sequence) {
            const asn1ComparedSchema = asn1js.compareSchema({}, asn1Schema, targetSchema);
            if (!asn1ComparedSchema.verified) {
                throw new errors_1.AsnSchemaValidationError(`Data does not match to ${target.name} ASN1 schema.${asn1ComparedSchema.result.error ? ` ${asn1ComparedSchema.result.error}` : ""}`);
            }
            return asn1ComparedSchema;
        }
        else {
            const asn1ComparedSchema = asn1js.compareSchema({}, asn1Schema, targetSchema);
            if (!asn1ComparedSchema.verified) {
                throw new errors_1.AsnSchemaValidationError(`Data does not match to ${target.name} ASN1 schema.${asn1ComparedSchema.result.error ? ` ${asn1ComparedSchema.result.error}` : ""}`);
            }
            return asn1ComparedSchema;
        }
    }
    static processRepeatedField(asn1Elements, asn1Index, schemaItem) {
        let elementsToProcess = asn1Elements.slice(asn1Index);
        if (elementsToProcess.length === 1 && elementsToProcess[0].constructor.name === "Sequence") {
            const seq = elementsToProcess[0];
            if (seq.valueBlock && seq.valueBlock.value && Array.isArray(seq.valueBlock.value)) {
                elementsToProcess = seq.valueBlock.value;
            }
        }
        if (typeof schemaItem.type === "number") {
            const converter = converters.defaultConverter(schemaItem.type);
            if (!converter)
                throw new Error(`No converter for ASN.1 type ${schemaItem.type}`);
            return elementsToProcess
                .filter((el) => el && el.valueBlock)
                .map((el) => {
                try {
                    return converter.fromASN(el);
                }
                catch {
                    return undefined;
                }
            })
                .filter((v) => v !== undefined);
        }
        else {
            return elementsToProcess
                .filter((el) => el && el.valueBlock)
                .map((el) => {
                try {
                    return this.fromASN(el, schemaItem.type);
                }
                catch {
                    return undefined;
                }
            })
                .filter((v) => v !== undefined);
        }
    }
    static processPrimitiveField(asn1Element, schemaItem) {
        const converter = converters.defaultConverter(schemaItem.type);
        if (!converter)
            throw new Error(`No converter for ASN.1 type ${schemaItem.type}`);
        return converter.fromASN(asn1Element);
    }
    static isOptionalChoiceField(schemaItem) {
        return (schemaItem.optional &&
            typeof schemaItem.type === "function" &&
            storage_1.schemaStorage.has(schemaItem.type) &&
            storage_1.schemaStorage.get(schemaItem.type).type === enums_1.AsnTypeTypes.Choice);
    }
    static processOptionalChoiceField(asn1Element, schemaItem) {
        try {
            const value = this.fromASN(asn1Element, schemaItem.type);
            return {
                processed: true,
                value,
            };
        }
        catch (err) {
            if (err instanceof errors_1.AsnSchemaValidationError && /Wrong values for Choice type/.test(err.message)) {
                return { processed: false };
            }
            throw err;
        }
    }
    static handleArrayTypes(asn1Schema, schema, target, options) {
        if (!("value" in asn1Schema.valueBlock && Array.isArray(asn1Schema.valueBlock.value))) {
            throw new Error("Cannot get items from the ASN.1 parsed value. ASN.1 object is not constructed.");
        }
        const itemType = schema.itemType;
        if (typeof itemType === "number") {
            const converter = converters.defaultConverter(itemType);
            if (!converter) {
                throw new Error(`Cannot get default converter for array item of ${target.name} ASN1 schema`);
            }
            return target.from(asn1Schema.valueBlock.value, (element) => converter.fromASN(element));
        }
        else {
            return target.from(asn1Schema.valueBlock.value, (element) => this.fromASN(element, itemType, options));
        }
    }
    static processSchemaItems(schema, asn1ComparedSchema, res, options) {
        for (const key in schema.items) {
            const asn1SchemaValue = asn1ComparedSchema.result[key];
            if (!asn1SchemaValue) {
                continue;
            }
            const schemaItem = schema.items[key];
            const schemaItemType = schemaItem.type;
            let parsedValue;
            if (typeof schemaItemType === "number" || (0, helper_1.isConvertible)(schemaItemType)) {
                parsedValue = this.processPrimitiveSchemaItem(asn1SchemaValue, schemaItem, schemaItemType, options);
            }
            else {
                parsedValue = this.processComplexSchemaItem(asn1SchemaValue, schemaItem, schemaItemType, options);
            }
            if (parsedValue && typeof parsedValue === "object" && "value" in parsedValue && "raw" in parsedValue) {
                res[key] = parsedValue.value;
                res[`${key}Raw`] = parsedValue.raw;
            }
            else {
                res[key] = parsedValue;
            }
        }
    }
    static processPrimitiveSchemaItem(asn1SchemaValue, schemaItem, schemaItemType, options) {
        const converter = schemaItem.converter ?? ((0, helper_1.isConvertible)(schemaItemType) ? new schemaItemType() : null);
        if (!converter) {
            throw new Error("Converter is empty");
        }
        if (schemaItem.repeated) {
            return this.processRepeatedPrimitiveItem(asn1SchemaValue, schemaItem, converter, options);
        }
        else {
            return this.processSinglePrimitiveItem(asn1SchemaValue, schemaItem, schemaItemType, converter, options);
        }
    }
    static processRepeatedPrimitiveItem(asn1SchemaValue, schemaItem, converter, options) {
        if (schemaItem.implicit) {
            const Container = schemaItem.repeated === "sequence" ? asn1js.Sequence : asn1js.Set;
            const newItem = new Container();
            newItem.valueBlock = asn1SchemaValue.valueBlock;
            const newItemAsn = asn1js.fromBER(newItem.toBER(false), options?.berOptions);
            if (newItemAsn.offset === -1) {
                throw new Error(`Cannot parse the child item. ${newItemAsn.result.error}`);
            }
            if (!("value" in newItemAsn.result.valueBlock && Array.isArray(newItemAsn.result.valueBlock.value))) {
                throw new Error("Cannot get items from the ASN.1 parsed value. ASN.1 object is not constructed.");
            }
            const value = newItemAsn.result.valueBlock.value;
            return Array.from(value, (element) => converter.fromASN(element));
        }
        else {
            return Array.from(asn1SchemaValue, (element) => converter.fromASN(element));
        }
    }
    static processSinglePrimitiveItem(asn1SchemaValue, schemaItem, schemaItemType, converter, options) {
        let value = asn1SchemaValue;
        if (schemaItem.implicit) {
            let newItem;
            if ((0, helper_1.isConvertible)(schemaItemType)) {
                newItem = new schemaItemType().toSchema("");
            }
            else {
                const Asn1TypeName = enums_1.AsnPropTypes[schemaItemType];
                const Asn1Type = asn1js[Asn1TypeName];
                if (!Asn1Type) {
                    throw new Error(`Cannot get '${Asn1TypeName}' class from asn1js module`);
                }
                newItem = new Asn1Type();
            }
            newItem.valueBlock = value.valueBlock;
            value = asn1js.fromBER(newItem.toBER(false), options?.berOptions).result;
        }
        return converter.fromASN(value);
    }
    static processComplexSchemaItem(asn1SchemaValue, schemaItem, schemaItemType, options) {
        if (schemaItem.repeated) {
            if (!Array.isArray(asn1SchemaValue)) {
                throw new Error("Cannot get list of items from the ASN.1 parsed value. ASN.1 value should be iterable.");
            }
            return Array.from(asn1SchemaValue, (element) => this.fromASN(element, schemaItemType, options));
        }
        else {
            const valueToProcess = this.handleImplicitTagging(asn1SchemaValue, schemaItem, schemaItemType);
            if (this.isOptionalChoiceField(schemaItem)) {
                try {
                    return this.fromASN(valueToProcess, schemaItemType, options);
                }
                catch (err) {
                    if (err instanceof errors_1.AsnSchemaValidationError && /Wrong values for Choice type/.test(err.message)) {
                        return undefined;
                    }
                    throw err;
                }
            }
            else {
                const parsedValue = this.fromASN(valueToProcess, schemaItemType, options);
                if (schemaItem.raw) {
                    return {
                        value: parsedValue,
                        raw: asn1SchemaValue.valueBeforeDecodeView,
                    };
                }
                return parsedValue;
            }
        }
    }
    static handleImplicitTagging(asn1SchemaValue, schemaItem, schemaItemType) {
        if (schemaItem.implicit && typeof schemaItem.context === "number") {
            const schema = storage_1.schemaStorage.get(schemaItemType);
            if (schema.type === enums_1.AsnTypeTypes.Sequence) {
                const newSeq = new asn1js.Sequence();
                if ("value" in asn1SchemaValue.valueBlock && Array.isArray(asn1SchemaValue.valueBlock.value) && "value" in newSeq.valueBlock) {
                    newSeq.valueBlock.value = asn1SchemaValue.valueBlock.value;
                    return newSeq;
                }
            }
            else if (schema.type === enums_1.AsnTypeTypes.Set) {
                const newSet = new asn1js.Set();
                if ("value" in asn1SchemaValue.valueBlock && Array.isArray(asn1SchemaValue.valueBlock.value) && "value" in newSet.valueBlock) {
                    newSet.valueBlock.value = asn1SchemaValue.valueBlock.value;
                    return newSet;
                }
            }
        }
        return asn1SchemaValue;
    }
}
exports.AsnParser = AsnParser;

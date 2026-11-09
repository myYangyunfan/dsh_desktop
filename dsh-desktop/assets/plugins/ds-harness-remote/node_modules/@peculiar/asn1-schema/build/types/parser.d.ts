import * as asn1js from "asn1js";
import { type BufferSourceLike } from "@peculiar/utils";
import { IEmptyConstructor, IAsnParseOptions } from "./types";
/**
 * Deserializes objects from ASN.1 encoded data
 */
export declare class AsnParser {
    /**
     * Deserializes an object from the ASN.1 encoded buffer
     * @param data ASN.1 encoded buffer
     * @param target Target schema for object deserialization
     */
    static parse<T>(data: BufferSourceLike, target: IEmptyConstructor<T>, options?: IAsnParseOptions): T;
    /**
     * Deserializes an object from the asn1js object
     * @param asn1Schema asn1js object
     * @param target Target schema for object deserialization
     */
    static fromASN<T>(asn1Schema: asn1js.AsnType, target: IEmptyConstructor<T>, options?: IAsnParseOptions): T;
    /**
     * Handles Choice types with context tags (IMPLICIT) and IMPLICIT tagging
     */
    private static handleChoiceTypes;
    /**
     * Handles SEQUENCE types with optional CHOICE fields and schema comparison
     */
    private static handleSequenceTypes;
    /**
     * Processes repeated fields in manual mapping
     */
    private static processRepeatedField;
    /**
     * Processes primitive fields in manual mapping
     */
    private static processPrimitiveField;
    /**
     * Checks if a schema item is an optional CHOICE field
     */
    private static isOptionalChoiceField;
    /**
     * Processes optional CHOICE fields in manual mapping
     */
    private static processOptionalChoiceField;
    /**
     * Handles array types
     */
    private static handleArrayTypes;
    /**
     * Processes all schema items
     */
    private static processSchemaItems;
    /**
     * Processes primitive schema items
     */
    private static processPrimitiveSchemaItem;
    /**
     * Processes repeated primitive items
     */
    private static processRepeatedPrimitiveItem;
    /**
     * Processes single primitive items
     */
    private static processSinglePrimitiveItem;
    /**
     * Processes complex schema items (SEQUENCE, SET, CHOICE)
     */
    private static processComplexSchemaItem;
    /**
     * Handles IMPLICIT tagging for complex types
     */
    private static handleImplicitTagging;
}

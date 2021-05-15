// @ts-nocheck

import { 
    SchemaAST,
    generateSchemaAST
} from './schema-ast-util-object';
import {
    parse,
    DocumentNode,
    ScalarTypeDefinitionNode,
    DirectiveDefinitionNode,
    DefinitionNode,
    DirectiveNode,
    FieldDefinitionNode,
    EnumTypeDefinitionNode,
    EnumValueDefinitionNode,
    InputObjectTypeDefinitionNode,
    ObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    isEnumType,
    isListType,
    isScalarType,
    isNonNullType,
    NonNullTypeNode,
} from 'graphql';
import { JOTableName } from '../../../types';
import { v4 as uuid } from 'uuid';
import * as fc from 'fast-check';
import { graphqlPromise } from '../../../graphql/graphql';
import {
    QueryType,
    ScalarMutationFieldValues,
    RelationshipMutationFieldValues,
    MutationFieldValues,
    RelationshipCreateResult,
    MutationVariablesObject,
    FilterType
} from './types';
import { postgresPromise } from '../../../postgres/postgres';


// TODO refactor functions that use this type to use 'ScalarMutationFieldValues' instead for more united
export type ScalarFieldValuesForGQLMutation = {
    readonly isNonNullType: boolean;
    readonly fieldName: string;
    readonly fieldType: string;
    readonly variableName: string;
    readonly value: any;
};

// Random helper utils

export function getFieldDefinitionType(node: Readonly<FieldDefinitionNode> | any): string {
    if (node.type) {
        return getFieldDefinitionType(node.type);
    }

    return node.name.value;
}

export function generateQueryName(
    queryType: Readonly<QueryType>, 
    tableName: Readonly<JOTableName>
): string {
    const requestTypePrefix: string = queryType.toLowerCase();
    const requestTypeSuffix: string = convertTableNameToTypeDefName(tableName);
    return `${requestTypePrefix}${requestTypeSuffix}`;
}

export function convertTableNameToTypeDefName(tableName: Readonly<JOTableName>): string {
    const lettersArray: Array<string> = tableName.split('');
    const lettersArrayFirstLetterCapitalized: Array<string> = lettersArray.map((letter: string, index: number) => {
        if (index === 0) {
            return letter.toUpperCase();
        }
        return letter;
    });
    return lettersArrayFirstLetterCapitalized.join('');
}

export function convertTypeDefNameToTableName(typeDef: string): Readonly<JOTableName> {
    const letters: ReadonlyArray<string> = typeDef.split('');
    const lettersWithFirstLetterCapitalized: ReadonlyArray<string> = letters.map((letter: string, index: number) => {
        if (index === 0) {
            return letter.toLowerCase();
        }
        return letter;
    });
    return lettersWithFirstLetterCapitalized.join('') as Readonly<JOTableName>;
}

export function generateRandomVariableName(): string {
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomLetter: string = letters[Math.floor(Math.random() * letters.length)];
    const variableName: string = randomLetter + uuid().toString().replace(/-/g, '_'); // INFO the replace is needed to get this to work as an object property later
    return variableName;
}


// TODO consolidate this function and the other one that's nearly identical -- what is its name? A) generateMutationInputFieldValue
// Q: what is the parent function that calls this?
export function generateRandomScalarFieldValue(
    inputField: Readonly<InputValueDefinitionNode>, 
    isNonNullType: boolean,
    enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode>,
    id: number | 'NOT_UPDATE_MUTATION'
): any {
    const fieldName: string = inputField.name.value;
    const fieldType: string = getFieldDefinitionType(inputField);

    // TODO figure out a way to refactore the parent function so we don't need this
    if (
        fieldName === 'id' &&
        id !== 'NOT_UPDATE_MUTATION'
    ) {
        return id;
    }

    if (fieldName === 'id') {
        return id;
    }

    if (isInputFieldTypeEnum(inputField, enumTypeDefinitionNodes)) {
        const value: any = generateEnumValueForInputField(inputField, enumTypeDefinitionNodes);
        return value;
    }

    if (fieldType === 'String') {
        const value: string | null = generateRandomValue(isNonNullType, 'String') as string | null; 
        return value;
    }

    if (fieldType === 'Int') {
        const value: number | null = generateRandomValue(isNonNullType, 'Int') as number | null;
        return value;
    }

    if (fieldType === 'Boolean') {
        const value: boolean | null = generateRandomValue(isNonNullType, 'Boolean') as boolean | null;
        return value;
    }

    if (fieldType === 'DateTime') {
        const value: string = new Date().toISOString();
        return value;
    }

    throw new Error(`We should not have gotten here, a scalar type was not accounted for. inputField: ${fieldName}, fieldType: ${fieldType}`);
}

function isInputFieldTypeEnum(
    inputValueDefinitionNode: Readonly<InputValueDefinitionNode>,
    enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode>
): boolean {
    const enumTypeDefinitionNames: ReadonlyArray<string> = enumTypeDefinitionNodes.map((enumTypeDef: Readonly<EnumTypeDefinitionNode>) => enumTypeDef.name.value);
    const inputValueDefinitionType: Readonly<string> = getFieldDefinitionType(inputValueDefinitionNode);

    return enumTypeDefinitionNames.includes(inputValueDefinitionType);
}

function generateEnumValueForInputField(
    inputField: Readonly<InputValueDefinitionNode>, 
    enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode>
): any {
    const enumTypeName: string = getFieldDefinitionType(inputField);
    const enumTypeDefinitionNode: Readonly<EnumTypeDefinitionNode> = enumTypeDefinitionNodes.filter((enumTypeDefNode: Readonly<EnumTypeDefinitionNode>) => enumTypeDefNode.name.value === enumTypeName)[0];
    const randomEnumValue: any = getRandomValueFromEnumTypeDefinitionNode(enumTypeDefinitionNode);
    return randomEnumValue;
}

function getRandomValueFromEnumTypeDefinitionNode(
    enumTypeDefinitionNode: Readonly<EnumTypeDefinitionNode>
): any {
    const randomArrayPosition: number = generateRandomArrayPosition(enumTypeDefinitionNode.values!.length);
    return enumTypeDefinitionNode.values![randomArrayPosition].name.value;
}

function generateRandomArrayPosition(arrayLength: number): number {
    return Math.floor(Math.random() * arrayLength);
}


export function getObjectTypeDefinitionNodeForTableName(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Readonly<ObjectTypeDefinitionNode> {
    const result: Readonly<ObjectTypeDefinitionNode> | undefined = schemaAST.modelObjectTypeDefinitionNodes.find((objectTypeDefNode: Readonly<ObjectTypeDefinitionNode>) => {
        return objectTypeDefNode.name.value.toLowerCase() === tableName;
    });

    if (result === undefined) {
        throw new Error(`error getting objectTypeDefinitionNode for tableName ${tableName}`);
    }

    return result;
}


export function getCreateInputObjectTypeDefinitionNodeForTableName(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Readonly<InputObjectTypeDefinitionNode> {
    const result: Readonly<InputObjectTypeDefinitionNode> | undefined = schemaAST.createInputObjectTypeDefinitionNodes.find((inputObjectTypeDefNode: Readonly<InputObjectTypeDefinitionNode>) => {
        return inputObjectTypeDefNode.name.value.toLowerCase().includes(tableName);
    });

    if (result === undefined) {
        throw new Error(`error getting createInputObjectTypeDefinitionNode for tableName ${tableName}`);
    }

    return result;
}

export function getUpdateInputObjectTypeDefinitionNodeForTableName(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Readonly<InputObjectTypeDefinitionNode> {
    const result: Readonly<InputObjectTypeDefinitionNode> | undefined = schemaAST.updateInputObjectTypeDefinitionNodes.find((inputObjectTypeDefNode: Readonly<InputObjectTypeDefinitionNode>) => {
        return inputObjectTypeDefNode.name.value.toLowerCase().includes(tableName);
    });

    if (result === undefined) {
        throw new Error(`error getting updateInputObjectTypeDefinitionNode for tableName ${tableName}`);
    }

    return result;
}

export function isRelationshipField(
    field: Readonly<FieldDefinitionNode | InputValueDefinitionNode>,
    schemaAST: Readonly<SchemaAST>
): boolean {
    const objectTypeDefNames: ReadonlyArray<string> = schemaAST.objectTypeDefinitionNodes.map((objectTypeDef: Readonly<ObjectTypeDefinitionNode>) => objectTypeDef.name.value);
    const fieldType: string = getFieldDefinitionType(field);
    const isRelationshipField: boolean = objectTypeDefNames.includes(fieldType);
    return isRelationshipField;
}

export function isListTypeField(
    field: Readonly<FieldDefinitionNode | NonNullTypeNode>
): boolean {
    if (field.type.kind === 'NonNullType') {
        return isListTypeField(field.type);
    }

    return field.type.kind === 'ListType';
}

export function getRelationshipFieldsFromObjectTypeDefinitionNode(
    objectTypeDefNode: Readonly<ObjectTypeDefinitionNode>,
    schemaAST: Readonly<SchemaAST>,
): ReadonlyArray<FieldDefinitionNode> {
    if (objectTypeDefNode.fields === undefined) {
        throw new Error(`fields are undefined on objectTypeDefinitionNode: ${objectTypeDefNode.name.value}`);
    }

    return objectTypeDefNode.fields.filter((field: Readonly<FieldDefinitionNode>) => {
        return isRelationshipField(field, schemaAST);
    });
}

export function getTableNameFromRelationshipFieldName(
    fieldName: string
): Readonly<JOTableName> {

    if (
        fieldName === 'redacted' ||
        fieldName === 'redacted' ||
        fieldName === 'redacted' ||
        fieldName === 'redacted' || 
        fieldName === 'redacted'
    ) {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (
        fieldName === 'redacted' ||
        fieldName === 'redacted'
    ) {
        return 'redacted';
    }

    if (
        fieldName === 'redacted' ||
        fieldName === 'redacted'
    ) {
        return 'redacted'
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName === 'redacted') {
        return 'redacted';
    }

    if (fieldName.endsWith('s')) {
        return fieldName as Readonly<JOTableName>;
    }

    return fieldName + 's' as Readonly<JOTableName>
}



export async function runDeleteMutation(
    tableName: Readonly<JOTableName>,
    id: number
): Promise<void> {
    const mutationName: string = generateQueryName('DELETE', tableName);

    const graphql = await graphqlPromise;

    const result: any = await graphql.query(`
        mutation {
            ${mutationName}(input: {
                id: ${id}
            }) {
                id
            }
        }
    `, {});

    if (
        result.data === null ||
        result.data[mutationName] === null
    ) {
        throw new Error(`\nDELETE FAILED for ${mutationName}`);
    }
}

export async function runScalarMutation(
    mutationType: 'CREATE' | 'UPDATE',
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    rowId: number | 'NOT_SET' = 'NOT_SET',
): Promise<any> {
    const mutationName: string = generateQueryName(mutationType, tableName);

    const objectTypeDefFields: ReadonlyArray<FieldDefinitionNode> = getObjectTypeDefFieldsForTableName(tableName, schemaAST);
    const inputFields: ReadonlyArray<InputValueDefinitionNode> = getInputObjectTypeDefFieldsForTableName(mutationType, tableName, schemaAST);

    const scalarFieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation> = generateScalarFieldValuesForGQLMutation(
        inputFields, 
        objectTypeDefFields, 
        schemaAST,
    );

    const mutationString: string = generateScalarMutationString(mutationName, scalarFieldValuesForGQLMutation, inputFields, rowId);
    console.log('scalar mutation string:', mutationString);
    console.log('scalarFieldValuesForGQLMutation:', scalarFieldValuesForGQLMutation);
    
    const gqlVarablesObject: any = generateScalarGQLVariablesObject(scalarFieldValuesForGQLMutation);

    const graphql: any = await graphqlPromise;
    const gqlResult: any = await graphql.query(mutationString, gqlVarablesObject);

    // TODO decide if we want to move this outside of the current function
    verifyScalarMutationSucceeded(mutationName, gqlResult, scalarFieldValuesForGQLMutation);

    return gqlResult.data[mutationName];
}


export function generateScalarMutationString(
    mutationName: string,
    scalarFieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>,
    inputFields: ReadonlyArray<InputValueDefinitionNode>,
    id: number | 'NOT_SET' = 'NOT_SET'
): string {
    const mutationVariableDefinitionsString: string = generateScalarGQLMutationVariablesString(scalarFieldValuesForGQLMutation);
    const mutationScalarFieldsInputString: string = generateScalarMutationInputString(scalarFieldValuesForGQLMutation, id);
    const relationshipFieldsInputString: string = generateRelationshipFieldsConnectorInputString(inputFields);
    const mutationSelectionSetString: string = generateScalarMutationSelectionSetString(scalarFieldValuesForGQLMutation);

    const gqlMutationString: string = `
        mutation ${mutationVariableDefinitionsString} {
            ${mutationName}(input: {
                ${mutationScalarFieldsInputString}
                ${relationshipFieldsInputString}
            }) {
                ${mutationSelectionSetString}
            }
        }
    `;

    return gqlMutationString;
}

function generateRelationshipFieldsConnectorInputString(
    inputFields: ReadonlyArray<InputValueDefinitionNode>
): string {
    return inputFields.reduce((result: string, currentField: Readonly<InputValueDefinitionNode>) => {
        
        const fieldType: string = getFieldDefinitionType(currentField);
        
        if (
            fieldType === 'SingleRelationInput' &&
            currentField.type.kind === 'NonNullType'
        ) {
            return result + `\n${currentField.name.value}: {
                connect: {
                    id: 1
                }
            }`
        };

        return result;
    }, '');
}

function generateScalarGQLMutationVariablesString(
    scalarFieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>
): string {
    if (scalarFieldValuesForGQLMutation.length === 0) {
        return ''
    }

    const variableDefinitions: string = scalarFieldValuesForGQLMutation.reduce((result: string, currentScalarField: Readonly<ScalarFieldValuesForGQLMutation>) => {
        if (currentScalarField.fieldName === 'duration') {
            const bob = 'bob;'
        }
        
        const nonNullableIndicator: string = currentScalarField.isNonNullType ? '!' : '';
        return result + `\n$${currentScalarField.variableName}: ${currentScalarField.fieldType}${nonNullableIndicator}`;
    }, '');

    return `(
        ${variableDefinitions}
    )`;
}

function generateScalarMutationInputString(
    scalarFieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>,
    id: number | 'NOT_SET'
): string {
    const idInput: string = id !== 'NOT_SET' ? `id: ${id}` : '';
    const otherInputs: string = scalarFieldValuesForGQLMutation.reduce((result: string, currentScalarField: Readonly<ScalarFieldValuesForGQLMutation>) => {
        return result + `\n${currentScalarField.fieldName}: $${currentScalarField.variableName}`;
    }, '');
    return idInput + otherInputs;
}

function generateScalarMutationSelectionSetString(
    scalarFieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>,
): string {
    const selectionSet: string = scalarFieldValuesForGQLMutation.reduce((result: string, currentField: Readonly<ScalarFieldValuesForGQLMutation>) => {
        return result + `\n${currentField.fieldName}`;
    }, '');
    return 'id' + selectionSet;
}

export function getMutationInputObjectTypeDefinitionNode(
    mutationType: 'UPDATE' | 'CREATE',
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Readonly<InputObjectTypeDefinitionNode> {
    if (mutationType === 'UPDATE') {
        return schemaAST.updateInputObjectTypeDefinitionNodes.filter((typeDef: Readonly<InputObjectTypeDefinitionNode>) => {
            return typeDef.name.value.toLowerCase() === `update${tableName}input`;
        })[0];
    }
    else {
        return schemaAST.createInputObjectTypeDefinitionNodes.filter((typeDef: Readonly<InputObjectTypeDefinitionNode>) => {
            return typeDef.name.value.toLowerCase() === `create${tableName}input`;
        })[0];
    }
}

export function generateScalarGQLVariablesObject(
    fieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>,
): any {
    return fieldValuesForGQLMutation.reduce((result: any, currentField: Readonly<ScalarFieldValuesForGQLMutation>) => {
        return {
            ...result,
            [currentField.variableName]: currentField.value
        };
    }, {});
}

export function verifyScalarMutationSucceeded(
    mutationName: string,
    gqlResult: any, 
    fieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>
): void {
    console.log('gqlResult:', gqlResult);
    console.log('fieldValuesForGQLMutation:', fieldValuesForGQLMutation);
    // TODO can we find a better way than a for loop?
    for (let i = 0; i < fieldValuesForGQLMutation.length; i++) {
        
        const fieldName: string = fieldValuesForGQLMutation[i].fieldName;
        const fieldValue: any = fieldValuesForGQLMutation[i].value;

        if (gqlResult.data[mutationName][fieldName] !== fieldValue) {
            console.log('gqlResult.data:', gqlResult);
            throw new Error(`${mutationName} FAILED: 
                gqlResult.data[${mutationName}][${fieldName}] !== ${fieldValue}
                gqlResult.data[${mutationName}][${fieldName}]: ${gqlResult.data[mutationName][fieldName]}
            `);
        }
    }
}

// TODO this is for runFullMutation, see if there is a way to consolidate it and the one for scalar muations
// TODO break this function up into more manageable chunks
export function generateScalarFieldValuesForGQLMutation(
    inputFields: ReadonlyArray<InputValueDefinitionNode>,
    objectTypeDefFields: ReadonlyArray<FieldDefinitionNode>,
    schemaAST: Readonly<SchemaAST>,
): ReadonlyArray<ScalarFieldValuesForGQLMutation> {

    return inputFields.reduce((result: ReadonlyArray<ScalarFieldValuesForGQLMutation>, currentInputField: Readonly<InputValueDefinitionNode>) => {
        const objectTypeDefField: Readonly<FieldDefinitionNode> | undefined = objectTypeDefFields.find((objectTypeDefField: Readonly<FieldDefinitionNode>) => objectTypeDefField.name.value === currentInputField.name.value);
        if (objectTypeDefField === undefined) {
            throw new Error(`Current input field '${currentInputField.name.value}' does not have a corresponding object type field`);
        }


        const inputFieldName: string = currentInputField.name.value;
        const inputFieldType: string = getFieldDefinitionType(currentInputField);

        if (
            inputFieldName === 'id'
            || inputFieldType === 'SingleRelationInput' 
            || inputFieldType === 'MultipleRelationInput'
            || inputFieldType === 'MultipleRelationIDInput'
        ) {
            return result;
        }
        
        if (currentInputField.name.value === 'redacted') {
            return result;
        }
        
        const isNonNullType: boolean = objectTypeDefField.type.kind === 'NonNullType';
        const variableName: string = generateRandomVariableName();
        const value: any = generateMutationInputFieldValue(currentInputField, isNonNullType, schemaAST.enumTypeDefinitionNodes);
        
        const fieldValuesForGQLMutation: Readonly<ScalarFieldValuesForGQLMutation> = {
            isNonNullType,
            fieldType: inputFieldType,
            fieldName: inputFieldName,
            variableName,
            value
        };

        return [...result, fieldValuesForGQLMutation];
    }, [])
}

// this is a helper function to the above
// TODO consolidate this function and the other one that's nearly identical -- what is its name?  A) generateRandomScalarFieldValue
export function generateMutationInputFieldValue(
    inputField: Readonly<InputValueDefinitionNode>, 
    isNonNullType: boolean,
    enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode>
): any {
    const fieldName: string = inputField.name.value;
    const fieldType: string = getFieldDefinitionType(inputField);
    
    if (isInputFieldTypeEnum(inputField, enumTypeDefinitionNodes)) {
        const value: any = generateEnumValueForInputField(inputField, enumTypeDefinitionNodes);
        return value;
    }

    if (fieldType === 'String') {
        const value: string | null = generateRandomValue(isNonNullType, 'String') as string | null;
        return value;
    }

    if (fieldType === 'Int') {
        const value: number | null = generateRandomValue(isNonNullType, 'Int') as number | null;
        return value;
    }

    if (fieldType === 'Boolean') {
        const value: boolean | null = generateRandomValue(isNonNullType, 'Boolean') as boolean | null;
        return value;
    }

    if (fieldType === 'DateTime') {
        const value: string = new Date().toISOString();
        return value;
    }

    throw new Error(`We should not have gotten here, a scalar type was not accounted for. inputField: ${inputField.name.value}, fieldType: ${fieldType}`);
}

// used in runFullMutation
export function getScalarInputValueDefintionNodes(
    fields: ReadonlyArray<InputValueDefinitionNode>,
    mutationType: 'CREATE' | 'UPDATE'
): ReadonlyArray<InputValueDefinitionNode> {
    return fields.reduce((result: ReadonlyArray<InputValueDefinitionNode>, currentField: Readonly<InputValueDefinitionNode>) => {
        const fieldType: string = getFieldDefinitionType(currentField);
        if (
            currentField.name.value === 'id' && 
            mutationType === 'UPDATE'
        ) {
            return [...result, currentField];
        }

        if (
            currentField.name.value === 'id' &&
            mutationType === 'CREATE'
        ) {
            return result;
        }
        
        else if (
            fieldType !== 'SingleRelationInput' &&
            fieldType !== 'MultipleRelationInput'
        ) {
            return [...result, currentField];
        }

        else {
            return result;
        }
    }, []);
}

// used in runFullMutation
export function getRelationshipInputValueDefinitionNodes(
    fields: ReadonlyArray<InputValueDefinitionNode>
): ReadonlyArray<InputValueDefinitionNode> {
    return fields.filter((field: Readonly<InputValueDefinitionNode>) => {
        const fieldType: string = getFieldDefinitionType(field);
        return (
            fieldType === 'SingleRelationInput' ||
            fieldType === 'MultipleRelationInput'
        );
    });
}

export function generateMutationVariableDefinitionsString(
    scalarFieldMutationValues: ReadonlyArray<ScalarMutationFieldValues>
): string {
    if (
        scalarFieldMutationValues.length === 0 ||
        (
            scalarFieldMutationValues.length === 1 &&
            scalarFieldMutationValues[0].fieldName === 'id'
        )
    ) {
        return '';
    }

    const variableDefinitions: string = scalarFieldMutationValues.reduce((result: string, currentField: Readonly<ScalarMutationFieldValues>) => {
        if (currentField.fieldName === 'id') {
            return result;
        }
        const nonNullableIndicator: string = currentField.isNonNullType === true ? '!' : '';
        return result + `\n$${currentField.scalarFieldVariableName}: ${currentField.fieldType}${nonNullableIndicator}`;
    }, ''); 

    return `(
        ${variableDefinitions}
    )`;
}

export function generateMutationInputString(
    mutationFieldValues: ReadonlyArray<MutationFieldValues>,
    initialCreateResultId: number | 'NOT_UPDATE_MUTATION'
): string {
    const inputsString: string = mutationFieldValues.reduce((result: string, currentField: Readonly<MutationFieldValues>) => {
        if (currentField.fieldName === 'id') {
            const idInputString: string = initialCreateResultId !== 'NOT_UPDATE_MUTATION' ? `id: ${initialCreateResultId}` : ''; 
            return result + idInputString;
        }
        
        if (currentField.relationshipType === 'SCALAR') {
            return result +`\n${currentField.fieldName}: $${currentField.scalarFieldVariableName}`;
        }

        if (currentField.relationshipType === 'SINGLE_RELATION') {
            return result + `\n${currentField.fieldName}: {
                connect: {
                    id: ${currentField.singleRelationConnectId}
                }
            }`
        }

        if (currentField.relationshipType === 'MULTIPLE_RELATION') {
            return result + `\n${currentField.fieldName}: {
                connect: {
                    ids: [${currentField.multipleRelationConnectIds}]
                }
            }`
        }

        console.log('currentField.relationshipType:', currentField.relationshipType);
        throw new Error(`We should not have gotten here, mutationField relationshipType not accounted for`);
    }, '');   

    return inputsString;
}

export function generateMutationSelectionSetString(
    mutationFieldValues: ReadonlyArray<MutationFieldValues>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL',
): string {
    if (joinLevels === 0) {

    }

    const selectionSet: string = mutationFieldValues.reduce((result: string, currentField: Readonly<MutationFieldValues>) => {
        if (currentField.relationshipType === 'SCALAR') {
            return result + `\n${currentField.fieldName}`;
        }

        else {
            const tableName: Readonly<JOTableName> = getTableNameFromRelationshipFieldName(currentField.fieldName);
            const scalarFieldNamesForRelationshipField = getScalarTypeDefFieldNamesForTableName(tableName, schemaAST);
            
            const scalarSubSelectionSetString: string = subSelectionSetLimit === 'ID_ONLY'
                ? 'id'
                : scalarFieldNamesForRelationshipField.reduce((result: string, currentScalarFieldName: string) => {
                    return result + `\n${currentScalarFieldName}`;
                });

            return result + `\n${currentField.fieldName} {
                ${scalarSubSelectionSetString}
            }`;
        }
    }, '');

    return selectionSet;
}

export function getScalarTypeDefFieldNamesForTableName(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<string> {
    const objectTypeDefNode: Readonly<ObjectTypeDefinitionNode> | undefined = schemaAST.objectTypeDefinitionNodes.find((objectTypeDef: Readonly<ObjectTypeDefinitionNode>) => objectTypeDef.name.value.toLowerCase() === tableName);
    if (
        objectTypeDefNode === undefined ||
        objectTypeDefNode.fields === undefined
    ) {
        throw new Error(`either objectTypeDefNode or its fields are undefined, tableName: ${tableName}, objectTypeDefNode: ${objectTypeDefNode}`);
    }

    const scalarFieldNames: ReadonlyArray<string> = objectTypeDefNode.fields.reduce((result: ReadonlyArray<string>, currentField: Readonly<FieldDefinitionNode>) => {
        if (
            isRelationshipField(currentField, schemaAST) ||
            isListTypeField(currentField)
        ) {
            return result;
        }

        return [...result, currentField.name.value];
    }, []);

    return scalarFieldNames;
}

export function generateMutationVariablesObject(
    scalarFieldMutationValues: ReadonlyArray<ScalarMutationFieldValues>
): Readonly<MutationVariablesObject> {
    return scalarFieldMutationValues.reduce((result: Readonly<MutationVariablesObject>, currentField: Readonly<ScalarMutationFieldValues>) => {
        if (currentField.fieldName === 'id') {
            return result;
        }
        
        return {
            ...result,
            [currentField.scalarFieldVariableName]: currentField.scalarFieldValue
        };
    }, {});
}


export function verifyFullMutationSucceeded(
    mutationName: string,
    scalarFieldInitialValues: ReadonlyArray<ScalarMutationFieldValues>,
    relationshipFieldInitialValues: ReadonlyArray<RelationshipCreateResult>,
    fullMutationResult: any,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
) {
    verifyScalarFieldsBeforeAndAfterMutationMatch(
        fullMutationResult, 
        mutationName, 
        scalarFieldInitialValues,
        subSelectionSetLimit
    );

    verifyRelationshipFieldsBeforeAndAfterMutationMatch(
        mutationName, 
        fullMutationResult, 
        relationshipFieldInitialValues,
        subSelectionSetLimit
    );
}

function verifyScalarFieldsBeforeAndAfterMutationMatch(
    fullMutationResult: any,
    mutationName: string,
    scalarFieldInitialValues: ReadonlyArray<ScalarMutationFieldValues>,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): void {
    if (subSelectionSetLimit === 'ID_ONLY') {
        return;
    }

    scalarFieldInitialValues.forEach((scalarField: Readonly<ScalarMutationFieldValues>) => {
        const fieldName: string = scalarField.fieldName;
        const initialFieldValue: any = scalarField.scalarFieldValue;
        const finalFieldValue: any = fullMutationResult[fieldName];

        const doInitialAndFinalValuesMatch: boolean = finalFieldValue === initialFieldValue;

        if (doInitialAndFinalValuesMatch === false) {
            throw new Error(`initial and final scalar fields do not match
                original mutation: ${mutationName}
                fieldName: ${fieldName}
                initialFieldValue: ${initialFieldValue}
                finalFieldValue: ${finalFieldValue}
            `)
        }
    });
}

function verifyRelationshipFieldsBeforeAndAfterMutationMatch(
    mutationName: string,
    fullMutationResult: any,
    relationshipFieldInitialValues: ReadonlyArray<RelationshipCreateResult>,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): void {

    relationshipFieldInitialValues.forEach((initialRelationshipFieldResult: any) => {
        
        const relationshipFieldName: string = initialRelationshipFieldResult.fieldName;

        if (initialRelationshipFieldResult.relationshipType === 'SINGLE_RELATION') {
            verifySingleRelationshipFieldValuesBereAndAfterMutationMatch(
                mutationName, 
                relationshipFieldName, 
                initialRelationshipFieldResult, 
                fullMutationResult,
                subSelectionSetLimit
            );
        }
    

        if (initialRelationshipFieldResult.relationshipType === 'MULTIPLE_RELATION') {
            verifyMultipleRelationshipFieldValuesBeforeAndAfterMutationMatch(
                mutationName, 
                relationshipFieldName, 
                initialRelationshipFieldResult, 
                fullMutationResult,
                subSelectionSetLimit
            );
        }
    });
}

// TODO break this function up into more manageable and understandable pieces
function verifySingleRelationshipFieldValuesBereAndAfterMutationMatch(
    mutationName: string,
    relationshipFieldName: string,
    initialRelationshipFieldResult: any,
    fullMutationResult: any,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): void {
    if (initialRelationshipFieldResult.createResult.fullMutationResult) {
        verifyFullMutationSucceeded(
            mutationName,
            initialRelationshipFieldResult.createResult.scalarFieldInitialValues,
            initialRelationshipFieldResult.createResult.relationshipFieldInitialValues,
            initialRelationshipFieldResult.createResult.fullMutationResult,
            subSelectionSetLimit
        );
        return;
    }

    const scalarFieldNamesOnSingleRelationJoin = Object.keys(initialRelationshipFieldResult.createResult);
            
    scalarFieldNamesOnSingleRelationJoin.forEach((scalarFieldName) => {
        
        if (
            subSelectionSetLimit === 'ID_ONLY' &&
            scalarFieldName !== 'id'
        ) {
            return;
        }

        console.log(`about to verify fullMutationResult is correct at relationfield: ${relationshipFieldName}, subfield: ${scalarFieldName}`)

        const initialFieldValue: any = initialRelationshipFieldResult.createResult[scalarFieldName];

        const fullMutationResultFieldValue: any = fullMutationResult[relationshipFieldName][scalarFieldName];

        if (initialFieldValue !== fullMutationResultFieldValue) {
            console.log('initialRelationshipFieldResult:', initialRelationshipFieldResult);
            throw new Error(`An initial scalar sub field on a single relationship field to '${mutationName}' does not match its corresponding final full mutation result at relationship field '${relationshipFieldName}', sub field '${scalarFieldName}'
                initialRelationshipFieldResult: ${initialRelationshipFieldResult}
                initialRelationshipFieldResult.createResult[${scalarFieldName}]: ${initialRelationshipFieldResult.createResult[scalarFieldName]}
                fullCreateResult.data[${mutationName}][${relationshipFieldName}][${scalarFieldName}]: ${fullMutationResultFieldValue}
            `);
        }
    });
}

// TODO break this function up into more manageable and understandable pieces
function verifyMultipleRelationshipFieldValuesBeforeAndAfterMutationMatch(
    mutationName: string,
    relationshipFieldName: string,
    initialRelationshipFieldResult: any,
    fullMutationResult: any,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL'
): void {
    const finalCreateResultsAtCurrentField: ReadonlyArray<any> = fullMutationResult[relationshipFieldName];

    initialRelationshipFieldResult.createResults.forEach((initialCreateResult: any) => {
        if (initialCreateResult.fullMutationResult) {
            verifyFullMutationSucceeded(
                mutationName,
                initialCreateResult.scalarFieldInitialValues,
                initialCreateResult.relationshipFieldInitialValues,
                initialCreateResult.fullMutationResult,
                subSelectionSetLimit
            );
            return;
        }

        const scalarFieldNamesOnInitialCreateResult = Object.keys(initialCreateResult);
        
        scalarFieldNamesOnInitialCreateResult.forEach((scalarFieldName) => {
            if (
                subSelectionSetLimit === 'ID_ONLY' &&
                scalarFieldName !== 'id'
            ) {
                return;
            }

            const doInitialAndFinalResultsMatch: any = finalCreateResultsAtCurrentField.some((finalCreateResult: any) => {
                if (finalCreateResult[scalarFieldName] !== initialCreateResult[scalarFieldName]) {
                    return false;
                }
                return true;
            });

            if (doInitialAndFinalResultsMatch === false) {
                throw new Error(`An initial scalar sub field on a multiple relationship field to '${mutationName}' does not match its corresponding final full mutation result at relationship field '${relationshipFieldName}', sub field '${scalarFieldName}'
                    initialCreateResult[${scalarFieldName}]: ${initialCreateResult[scalarFieldName]}
                    on relationship field: ${relationshipFieldName}
                    on mutation ${mutationName}
                `);
            }
        });
    });
}


export async function cleanUpCronJobsAndBusinessHours(): Promise<void> {
    const postgres = await postgresPromise;
    await postgres.query({ sql: `DELETE FROM business_hours;`,}); // We need to clean this up to prevent bugs
    await postgres.query({ sql: `DELETE FROM cron_jobs;`,}); // We need to clean this up to prevent bugs
}


export async function runQuery(
    queryType: 'GET' | 'FIND',
    tableName: Readonly<JOTableName>,
    id: number,
    joinLevels: number = 0,
    schemaAST: Readonly<SchemaAST>,
    filterFieldName: string = 'NOT_FIND_QUERY',
    filterFieldValue: any = 'NOT_FIND_QUERY',
    subSelectionSetLimit: 'ALL' | 'ID_ONLY'
): Promise<void> {
    const queryName: string = generateQueryName(queryType, tableName);

    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTableName(tableName, schemaAST);
    const fields: ReadonlyArray<FieldDefinitionNode> | undefined = objectTypeDefinitionNode.fields;
    if (fields === undefined) {
        throw new Error(`fields are undefined on ${queryName}`);
    }

    const queryString: string = generateQueryString(
        queryType, 
        tableName, 
        id, 
        filterFieldName, 
        filterFieldValue, 
        joinLevels, 
        schemaAST,
        subSelectionSetLimit
    );
    console.log('queryString:', queryString);

    const graphql = await graphqlPromise;
    const gqlResult: any = await graphql.query(queryString, {});

    if (gqlResult.data[queryName] === null) {
        throw new Error(`\n\nTEST FAILED for ${queryName} with ${joinLevels} levels ---> gqlResult.data[${queryName}] === null WHERE ${filterFieldName} = ${filterFieldValue}`);
    } 

    return gqlResult.data[queryName];
}

export function generateQueryString(
    queryType: 'GET' | 'FIND',
    tableName: Readonly<JOTableName>,
    id: number,
    filterFieldName: string,
    filterFieldValue: any,
    joinLevels: number,
    schemaAST: Readonly<SchemaAST>,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY'
): string {
    const selectionSet: string = generateQuerySelectionSet(
        tableName, 
        schemaAST, 
        joinLevels, 
        subSelectionSetLimit
    );
    
    if (queryType === 'GET') {
        const result: string = generateGetQuery(tableName, id, selectionSet);
        return result;
    }
    else {
        const result: string = generateFindQuery(tableName, id, selectionSet, filterFieldName, filterFieldValue);
        return result;
    }
}

// TODO break this function into more manageable pieces
export function generateQuerySelectionSet(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevel: number = 0,
    subSelectionSetFields: 'ALL' | 'ID_ONLY' = 'ALL',
): string {
    if (joinLevel === -1) {
        return '';
    }

    if (
        joinLevel === 0 &&
        subSelectionSetFields === 'ID_ONLY'
    ) {
        return 'id';
    }

    const fields: ReadonlyArray<FieldDefinitionNode> = getObjectTypeDefFieldsForTableName(tableName, schemaAST);

    return fields.reduce((result: string, currentField: Readonly<FieldDefinitionNode>) => {
        
        // SKIP field 'strip_invoice' on table 'invoices' for now
        // it will cause a look up for a tablename 'stripe_invoice' and that won't do my friend that simply won't do
        // We are not currently allowing stripe_invoice on our allowed tables
        if (currentField.name.value === 'redacted') {
            return result;
        }

        if (isRelationshipField(currentField, schemaAST) === true) {
            if (joinLevel === 0) {
                return result;
            }

            const isListType = isListTypeField(currentField);
            const pagingLimit: string = isListType === true ? `(page: {
                    limit: 1
                }, orderBy: {
                    field: "id"
                    order: DESC
                }
            )` : '';

            const tableName: Readonly<JOTableName> = getFieldDefinitionType(currentField).toLowerCase() as Readonly<JOTableName>;
            const subSelectionSet = generateQuerySelectionSet(tableName, schemaAST, joinLevel - 1, subSelectionSetFields);
            
            const subQuery: string =  result + `\n${currentField.name.value}${pagingLimit} {
                ${subSelectionSet}
            \n}\n`; // formatting for readability, just trust it
            return subQuery;
        }

        if (
            subSelectionSetFields === 'ID_ONLY' &&
            isRelationshipField(currentField, schemaAST) === false &&
            currentField.name.value !== 'id'
        ) {
            return result;
        }

        return result + `\n${currentField.name.value}`;
    }, '');
}

function generateGetQuery(
    tableName: Readonly<JOTableName>, 
    rowId: number, 
    selectionSet: string
): string {
    const queryName: string = generateQueryName('GET', tableName);

    return `
        query {
            ${queryName}(id: ${rowId}) {
                ${selectionSet}
            }
        }
    `;
}

function generateFindQuery(
    tableName: Readonly<JOTableName>, 
    id: number,
    selectionSet: string,
    filterFieldName: string,
    filterFieldValue: any
): string {
    const queryName = generateQueryName('FIND', tableName);

    const filter: string = generateFilter(id, filterFieldName, filterFieldValue);

    return `
        query {
            ${queryName}${filter} {
                items {
                    ${selectionSet}
                }
            }
        }
    `;
}

function generateFilter(
    id: number,
    filterFieldName: string, 
    filterFieldValue: any,
    filterType: Readonly<FilterType> = 'eq' 
): string {
    const value: any = typeof filterFieldValue === 'string' ? `"${filterFieldValue}"` : filterFieldValue

    const idFilter: string = filterFieldName !== 'id'
        ? `id: {
            eq: ${id}
        },` 
        : ''; 
         

    return `(filter: {
        ${idFilter}
        ${filterFieldName}: {
            ${filterType}: ${value}
        }
    })`;
}

// TODO break this function into more manageable pieces
export function verifyGQLResultsAreEquivalent(
    originalQueryName: string,
    firstGQLResult: any, // graphql data result object
    secondGQLResult: any // graphql data result object
): void {

    if (
        firstGQLResult === null && 
        secondGQLResult === null
    ) {
        return;
    }

    if (isOneGqlResultNullButNotTheOther(firstGQLResult, secondGQLResult) === true) {
        throw new Error(`one gql result to match is null but not the other
            firstGQLResult: ${firstGQLResult}
            secondGQLResult: ${secondGQLResult}
        `);
    }

    if (Array.isArray(firstGQLResult)) {
        const firstGQLResultSortedById: ReadonlyArray<any> = sortObjectArrayById(firstGQLResult);
        const secondGQLResultSortedById: ReadonlyArray<any> = sortObjectArrayById(secondGQLResult);
        for (let i = 0; i < firstGQLResult.length; i++) {
            verifyGQLResultsAreEquivalent(originalQueryName, firstGQLResultSortedById[i], secondGQLResultSortedById[i]);
        }
    }

    // First verify that they both have the same key names
    const firstGQLResultFieldNames: ReadonlyArray<string> = Object.keys(firstGQLResult);
    const secondGQLResultFieldNames: ReadonlyArray<string> = Object.keys(secondGQLResult);
    firstGQLResultFieldNames.forEach((fieldName: any) => {
        if (secondGQLResultFieldNames.includes(fieldName) === false) {
            throw new Error(`firstGQLResult and secondGQLResult do not have the same field names
                fieldName: ${fieldName}
                firstGQLResultFieldNames: [${firstGQLResultFieldNames}]
                secondGQLResultFieldNames: [${secondGQLResultFieldNames}]
            `);
        }
    });

    // Verify scalar field values on both objects match
    const fieldNames: ReadonlyArray<string> = [...firstGQLResultFieldNames];
    fieldNames.forEach((fieldName: string) => {
        const firstValueAtFieldName: any = firstGQLResult[fieldName];
        const secondValueAtFieldName: any = secondGQLResult[fieldName];

        if (typeof firstValueAtFieldName === 'object') {
            verifyGQLResultsAreEquivalent(originalQueryName, firstValueAtFieldName, secondValueAtFieldName);
            return;
        }
        
        if (firstValueAtFieldName !== secondValueAtFieldName) {
            throw new Error(`GQL results at field '${fieldName}' do not match
            firstGQLResult[${fieldName}]: ${firstGQLResult[fieldName]}
            secondGQLResult[${fieldName}]: ${secondGQLResult[fieldName]}
            original query: ${originalQueryName}
            `);
        }
    });
}

function isOneGqlResultNullButNotTheOther(
    gqlResult1: any,
    gqlResult2: any
): boolean {
    if (
        gqlResult1 === null &&
        gqlResult2 !== null
    ) {
        return true;
    }

    if (
        gqlResult2 === null &&
        gqlResult1 !== null
    ) {
        return true;
    }

    return false;
}

export function sortObjectArrayById(objectArray: ReadonlyArray<object>): ReadonlyArray<object> {
    return objectArray.sort((objectA: any, objectB: any) => objectA.id > objectB.id ? 1 : -1);
}

export function isForeignKeyConstraintField(fieldName: string): boolean {
    if (
        // filter for foreign key constraints by seeing if it ends with _id
        fieldName.endsWith('_id') && 
        
        // except for the fields that end with _id but aren't foreign key constraints
        (
            fieldName.includes('twilio') === false &&
            fieldName.includes('stripe') === false
        )
    ) {
        return true;
    }
    else {
        return false;
    }
}

export function generateRandomValue(
    isNonNullType: boolean,
    fieldType: 'String' | 'Int' | 'Boolean'
): string | number | boolean | null {
    if (isNonNullType === true) {
        const value: string | number | boolean = generateValue(fieldType);
        return value;
    }
    else {
        const value: string | number | boolean | null = generateValueOrNullOnBasedOnProbability(fieldType, 4);
        return value;
    }
}          

function generateValueOrNullOnBasedOnProbability(
    fieldType: 'String' | 'Int' | 'Boolean',
    probabilityDivisor: number | 'NO_NULLS' | 'ALL_NULLS'
): string | number | boolean | null {
    if (fieldType === 'String') {
        const value: string = uuid().toString();
        const returnValue: string | null = returnValueOrNullOnBasedOnProbability(value, probabilityDivisor);
        return returnValue;
    }
    else if (fieldType == 'Int') {
        const value: number = fc.sample(fc.nat(), 1)[0];
        const returnValue: number | null = returnValueOrNullOnBasedOnProbability(value, probabilityDivisor);
        return returnValue;
    }
    else {
        const value: boolean = fc.sample(fc.boolean(), 1)[0];
        const returnValue: boolean | null = returnValueOrNullOnBasedOnProbability(value, probabilityDivisor);
        return returnValue;
    }
}

function returnValueOrNullOnBasedOnProbability(
    value: any,
    probabilityDivisor: number | 'NO_NULLS' | 'ALL_NULLS'
): any {
    if (probabilityDivisor === 'NO_NULLS') {
        return value;
    }

    if (probabilityDivisor === 'ALL_NULLS') {
        return null;
    }

    const randomNumberWithinProbabilityRange: number = Math.ceil(Math.random() * probabilityDivisor);
    if (randomNumberWithinProbabilityRange === probabilityDivisor) {
        return null;
    }
 
    return value;
}

function generateValue(fieldType: 'String' | 'Int' | 'Boolean'): string | number | boolean {
    if (fieldType === 'String') {
        const value: string = uuid().toString();
        return value;
    }
    else if (fieldType === 'Int'){
        const value: number = fc.sample(fc.nat(), 1)[0];
        return value;
    }
    else {
        const value: boolean = fc.sample(fc.boolean(), 1)[0];
        return value;
    }
}

function generateMutationFieldValuesForScalarInputFields(
    scalarInputFields: ReadonlyArray<InputValueDefinitionNode>, 
    objectTypeDefFields: ReadonlyArray<FieldDefinitionNode>, 
    initialCreateResultId: number | 'NOT_UPDATE_MUTATION',
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<ScalarMutationFieldValues> {
    return scalarInputFields.map((inputField: Readonly<InputValueDefinitionNode>) => {
        const typeDefField: Readonly<FieldDefinitionNode> | undefined = objectTypeDefFields.find((field: Readonly<FieldDefinitionNode>) => field.name.value === inputField.name.value);
        if (typeDefField === undefined) {
            throw new Error(`Input field does not have corresponding type def field: inputField: ${inputField.name.value}`);
        }

        const isNonNullType: boolean = typeDefField.type.kind === 'NonNullType';
        const fieldName: string = inputField.name.value;
        const fieldType: string = getFieldDefinitionType(inputField)
        const scalarFieldVariableName: string = generateRandomVariableName();
        const scalarFieldValue: any =  generateRandomScalarFieldValue(inputField, isNonNullType, schemaAST.enumTypeDefinitionNodes, initialCreateResultId);
        // const scalarFieldValue: any =  generateRandomValue(inputField, isNonNullType, schemaAST.enumTypeDefinitionNodes);

        const result: Readonly<ScalarMutationFieldValues> = {
            isNonNullType,
            fieldName,
            fieldType,
            relationshipType: 'SCALAR',
            scalarFieldVariableName,
            scalarFieldValue
        };
    
        return result;
    });
}

export async function runFullMutation(
    mutationType: 'CREATE' | 'UPDATE',
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL',
    initialCreateResultId: number | 'NOT_UPDATE_MUTATION' = 'NOT_UPDATE_MUTATION',
): Promise<{
    readonly fullMutationResult: any,
    readonly mutationResultId: number,
    readonly scalarFieldInitialValues: ReadonlyArray<ScalarMutationFieldValues>;
    readonly relationshipFieldInitialValues: ReadonlyArray<RelationshipCreateResult>;
}> {
    const mutationName: string = generateQueryName(mutationType, tableName);

    const objectTypeDefFields: ReadonlyArray<FieldDefinitionNode> = getObjectTypeDefFieldsForTableName(tableName, schemaAST);
    const inputFields: ReadonlyArray<InputValueDefinitionNode> = getInputObjectTypeDefFieldsForTableName(mutationType, tableName, schemaAST);

    const scalarInputFields: ReadonlyArray<InputValueDefinitionNode> = getScalarInputValueDefintionNodes(inputFields, mutationType);
    const scalarFieldMutationValues: ReadonlyArray<ScalarMutationFieldValues> = generateMutationFieldValuesForScalarInputFields(
        scalarInputFields, 
        objectTypeDefFields, 
        initialCreateResultId, 
        schemaAST
    );

    const relationshipFields: ReadonlyArray<InputValueDefinitionNode> = getRelationshipInputValueDefinitionNodes(inputFields);
    const relationshipFieldCreateResults: ReadonlyArray<RelationshipCreateResult> = await generateRelationshipFieldCreateResults(
        relationshipFields, 
        schemaAST, 
        joinLevels,
        subSelectionSetLimit
    );
    
    const relationshipFieldMutationValues: ReadonlyArray<MutationFieldValues> = generateMutationFieldValuesForRelationshipField(
        relationshipFields, 
        relationshipFieldCreateResults, 
        joinLevels,
        subSelectionSetLimit
    );

    const mutationFieldValues: ReadonlyArray<MutationFieldValues>  = [
        ...scalarFieldMutationValues, 
        ...relationshipFieldMutationValues
    ];


    const mutationVariableDefinitionsString: string = generateMutationVariableDefinitionsString(scalarFieldMutationValues);
    const mutationInputString: string = generateMutationInputString(mutationFieldValues, initialCreateResultId);
    const selectionSet: string = generateQuerySelectionSet(
        tableName, 
        schemaAST,
        joinLevels,
        subSelectionSetLimit,
    );
    const fullMutationString: string = `
        mutation${mutationVariableDefinitionsString} {
            ${mutationName}(input: {
                ${mutationInputString}
            }) {
                ${selectionSet}
            }
        }
    `;
    console.log('fullMutationString:', fullMutationString);

    const fullMutationVariablesObject: Readonly<MutationVariablesObject> = generateMutationVariablesObject(scalarFieldMutationValues)


    const graphql = await graphqlPromise;
    const fullMutationResult: any = await graphql.query(fullMutationString, fullMutationVariablesObject);


    return {
        fullMutationResult: fullMutationResult.data[mutationName],
        mutationResultId: fullMutationResult.data[mutationName].id,
        scalarFieldInitialValues: scalarFieldMutationValues,
        relationshipFieldInitialValues: relationshipFieldCreateResults
    };
}


// TODO break this up, make it more modular
export async function generateRelationshipFieldCreateResults(
    relationshipFields: ReadonlyArray<InputValueDefinitionNode>, 
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL',
): Promise<ReadonlyArray<RelationshipCreateResult>> {   
    if (joinLevels < 1) {
        return [];
    }

    // NOTE we must use a for loop,
    // NOTE using a Promise.all will cause too many connections for the pg proxy when doing 3 or more join level tests
    let relationshipCreateResults: Array<RelationshipCreateResult> = [];

    for (let i = 0; i < relationshipFields.length; i++) {
        const field: Readonly<InputValueDefinitionNode> = relationshipFields[i];

        const tableName: Readonly<JOTableName> = getTableNameFromRelationshipFieldName(field.name.value);

        const fieldType: string = getFieldDefinitionType(field);

        if (fieldType === 'SingleRelationInput') {
            const createResult: any = joinLevels > 1 
                ? await runFullMutation('CREATE', tableName, schemaAST, joinLevels - 1, subSelectionSetLimit)
                : await runScalarMutation('CREATE', tableName, schemaAST);
            
            
            const result: Readonly<RelationshipCreateResult> = {
                fieldName: field.name.value,
                tableName,
                relationshipType: 'SINGLE_RELATION',
                createResult
            };
            relationshipCreateResults.push(result);
        }
        else {
            console.log('bernie sanders');
            // TODO decide on how many to create -- currently sitting at one
            const createResults: ReadonlyArray<any> = await Promise.all(Array(1).fill(0).map(async (_: any) => {
                const createResult: any = joinLevels > 1 
                    ? await runFullMutation('CREATE', tableName, schemaAST, joinLevels - 1, subSelectionSetLimit)
                    : await runScalarMutation('CREATE', tableName, schemaAST);
                return createResult;
            }));

            const result: Readonly<RelationshipCreateResult> = {
                fieldName: field.name.value,
                tableName,
                relationshipType: 'MULTIPLE_RELATION',
                createResults
            };
            relationshipCreateResults.push(result);
        }
    }

    return relationshipCreateResults;
}


function generateMutationFieldValuesForRelationshipField(
    relationshipFields: ReadonlyArray<InputValueDefinitionNode>, 
    relationshipFieldCreateResults: ReadonlyArray<any>,
    joinLevels: number = 1,
    subSelectionSetLimit: 'ALL' | 'ID_ONLY' = 'ALL',
): ReadonlyArray<RelationshipMutationFieldValues> {

    const result = relationshipFields.map((relationshipField: Readonly<InputValueDefinitionNode>, index: number) => {
        const relationshipFieldCreateResult: any = relationshipFieldCreateResults[index];
    
        const isNonNullType: boolean = relationshipField.type.kind === 'NonNullType';
        const fieldName: string = relationshipField.name.value;
        const fieldType: string = getFieldDefinitionType(relationshipField)
        const relationshipType = fieldType === 'SingleRelationInput' ? 'SINGLE_RELATION' : 'MULTIPLE_RELATION';

        const singleRelationConnectId: number | 'NOT_SINGLE_RELATION' = getSingleRelationConnectId(relationshipType, relationshipFieldCreateResult, joinLevels);

        const multipleRelationConnectIds: ReadonlyArray<number> | 'NOT_MULTIPLE_RELATION' = getMultipleRelationConnectIds(relationshipType, relationshipFieldCreateResult, joinLevels);
    
        const result: Readonly<MutationFieldValues> = {
            isNonNullType,
            fieldName,
            fieldType,
            relationshipType,
            relationshipTable: getTableNameFromRelationshipFieldName(relationshipField.name.value),
            singleRelationConnectId,
            multipleRelationConnectIds
        };

        return result;
    })

    return result;
}


function getSingleRelationConnectId(
    relationshipType: 'SINGLE_RELATION' | 'MULTIPLE_RELATION',
    relationshipFieldCreateResult: any,
    joinLevels: number = 1
): number | 'NOT_SINGLE_RELATION' {
    if (relationshipType === 'SINGLE_RELATION') {
        if (joinLevels > 1) {
            return relationshipFieldCreateResult.createResult.fullMutationResult.id;
        }
        else {
            return relationshipFieldCreateResult.createResult.id;
        }
    }

    return 'NOT_SINGLE_RELATION';
}

function getMultipleRelationConnectIds(
    relationshipType: 'SINGLE_RELATION' | 'MULTIPLE_RELATION',
    relationshipFieldCreateResult: any,
    joinLevels: number = 1
): ReadonlyArray<number> | 'NOT_MULTIPLE_RELATION'{
    if (relationshipType === 'MULTIPLE_RELATION') {
        return relationshipFieldCreateResult.createResults.map((createResult: any) => {
            return joinLevels > 1 ? createResult.fullMutationResult.id : createResult.id
        });
    }
    else {
        return 'NOT_MULTIPLE_RELATION';
    }
}

export function getObjectTypeDefFieldsForTableName(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<FieldDefinitionNode> {
    const objectTypeDefNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTableName(tableName, schemaAST);
    const objectTypeDefFields: ReadonlyArray<FieldDefinitionNode> | undefined = objectTypeDefNode.fields
    if (objectTypeDefFields === undefined) {
        throw new Error(`object type def fields are undefined for table '${tableName}'`);
    }

    return objectTypeDefFields;
}

export function getInputObjectTypeDefFieldsForTableName(
    mutationType: 'CREATE' | 'UPDATE',
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<InputValueDefinitionNode> {
    const inputObjectTypeDefNode: Readonly<InputObjectTypeDefinitionNode> = getMutationInputObjectTypeDefinitionNode(mutationType, tableName, schemaAST);
    const inputFields: ReadonlyArray<InputValueDefinitionNode> | undefined = inputObjectTypeDefNode.fields;
    if (inputFields === undefined) {
        throw new Error(`input fields are undefined for table ${tableName}`);
    }

    return inputFields;
}
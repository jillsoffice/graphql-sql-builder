// @ts-nocheck

import * as fs from 'fs';
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
    NonNullTypeNode,
    SchemaMetaFieldDef,
} from 'graphql';
import { TableName } from '../../../types';
import { v4 as uuid } from 'uuid';
import * as fc from 'fast-check'
import { graphbackPromise } from '../../../graphql/graphback';
import { ObjectType } from 'aws-sdk/clients/clouddirectory';
import { getObjectTypeDefinitionNodeForTypeName, getScalarFieldNamesForObjectType } from '../../../graphql/resolvers/sql-builder/sql-builder';
import { FieldDef } from 'pg';
import { FieldTypeContext } from 'twilio/lib/rest/autopilot/v1/assistant/fieldType';

export type QueryType = 
    | 'CREATE'
    | 'UPDATE'
    | 'FIND'
    | 'GET' 
    | 'DELETE';

export type ScalarFieldValuesForGQLMutation = {
    readonly isNonNullType: boolean;
    readonly fieldName: string;
    readonly fieldType: string;
    readonly variableName: string;
    readonly value: any;
};

export type FilterType = 
    | 'ne'
    | 'eq'
    | 'le'
    | 'lt'
    | 'ge'
    | 'gt'
    | 'in';

export function convertTypeDefNameToTableName(typeDef: string): Readonly<TableName> {
    const letters: ReadonlyArray<string> = typeDef.split('');
    const lettersWithFirstLetterCapitalized: ReadonlyArray<string> = letters.map((letter: string, index: number) => {
        if (index === 0) {
            return letter.toLowerCase();
        }
        return letter;
    });
    return lettersWithFirstLetterCapitalized.join('') as Readonly<TableName>;
}

export function generateQueryName(
    queryType: Readonly<QueryType>, 
    tableName: Readonly<TableName>
): string {
    const requestTypePrefix: string = queryType.toLowerCase();
    const requestTypeSuffix: string = convertTableNameToTypeDefName(tableName);
    return `${requestTypePrefix}${requestTypeSuffix}`;
}

export function convertTableNameToTypeDefName(tableName: Readonly<TableName>): string {
    const lettersArray: Array<string> = tableName.split('');
    const lettersArrayFirstLetterCapitalized: Array<string> = lettersArray.map((letter: string, index: number) => {
        if (index === 0) {
            return letter.toUpperCase();
        }
        return letter;
    });
    return lettersArrayFirstLetterCapitalized.join('');
}

export function generateRandomVariableName(): string {
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomLetter: string = letters[Math.floor(Math.random() * letters.length)];
    const variableName: string = randomLetter + uuid().toString().replace(/-/g, '_'); // INFO the replace is needed to get this to work as an object property later
    return variableName;
}

export function generateMutationInputFieldValue(
    inputField: Readonly<InputValueDefinitionNode>, 
    enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode>
): any {
    const fieldName: string = inputField.name.value;
    const fieldType: string = getFieldDefinitionType(inputField);
    
    if (isInputValueDefinitionNodeTypeEnum(inputField, enumTypeDefinitionNodes)) {
        const value: any = generateEnumValueForInputField(inputField, enumTypeDefinitionNodes);
        return value;
    }

    if (fieldType === 'String') {
        const value: string = uuid().toString();
        return value;
    }

    if (fieldType === 'Int') {
        // TODO if fieldName contains '_id', do a request to get all the id's for that table and select random
        // TODO otherwise, figure out other situtations
        return 1; // TODO is this sufficient, or do we need random?
    }

    if (fieldType === 'Boolean') {
        // return fc.sample(fc.boolean(), 1)[0]; x
        return fc.sample(fc.boolean(), 1)[0]; // TODO is this sufficient, or do we need random?
    }

    if (fieldType === 'DateTime') {
        const value: string = new Date().toISOString();
        return value;
    }

    throw new Error(`We should not have gotten here, a scalar type was not accounted for. inputField: ${inputField.name.value}, fieldType: ${fieldType}`);
}

export function getFieldDefinitionType(node: Readonly<FieldDefinitionNode> | any): string {
    if (node.type) {
        return getFieldDefinitionType(node.type);
    }

    return node.name.value;
}

function isInputValueDefinitionNodeTypeEnum(
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

export function getMutationInputObjectTypeDefinitionNode(
    mutationType: 'UPDATE' | 'CREATE',
    tableName: Readonly<TableName>,
    schemaAST: Readonly<SchemaAST>
): Readonly<InputObjectTypeDefinitionNode> {
    console.log('mutationType:', mutationType);
    if (mutationType === 'UPDATE') {
        return schemaAST.updateInputObjectTypeDefinitionNodes.filter((typeDef: Readonly<InputObjectTypeDefinitionNode>) => {
            console.log('currentTypeDef:', typeDef.name.value);
            return typeDef.name.value.toLowerCase() === `update${tableName}input`;
        })[0];
    }
    else {
        return schemaAST.createInputObjectTypeDefinitionNodes.filter((typeDef: Readonly<InputObjectTypeDefinitionNode>) => {
            return typeDef.name.value.toLowerCase() === `create${tableName}input`;
        })[0];
    }
}

export function generateScalarFieldValuesForGQLMutation(
    fields: ReadonlyArray<InputValueDefinitionNode>,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<ScalarFieldValuesForGQLMutation> {
    return fields.reduce((result: ReadonlyArray<ScalarFieldValuesForGQLMutation>, currentField: Readonly<InputValueDefinitionNode>) => {
        // TODO fix strip_invoice fields
        const fieldName: string = currentField.name.value;
        const fieldType: string = getFieldDefinitionType(currentField);

        if (
            fieldName === 'id'
            || fieldType === 'SingleRelationInput' 
            || fieldType === 'MultipleRelationInput'
            || fieldType === 'MultipleRelationIDInput'
        ) {
            return result;
        }
        
        if (currentField.name.value === 'redacted') {
            return result;
        }
        
        const isNonNullType: boolean = currentField.type.kind === 'NonNullType';
        const variableName: string = generateRandomVariableName();
        const value: any = generateMutationInputFieldValue(currentField, schemaAST.enumTypeDefinitionNodes);
        
        const fieldValuesForGQLMutation: Readonly<ScalarFieldValuesForGQLMutation> = {
            isNonNullType,
            fieldType,
            fieldName,
            variableName,
            value
        };

        return [...result, fieldValuesForGQLMutation];
    }, [])
}

export function generateMutationString(
    mutationName: string,
    fieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>,
    id: number | 'NOT_SET' = 'NOT_SET'
): string {
    const mutationVariablesString: string = generateGQLMutationVariablesString(fieldValuesForGQLMutation);
    const mutationInputString: string = generateMutationInputString(fieldValuesForGQLMutation, id);
    const mutationSelectionSetString: string = generateMutationSelectionSetString(fieldValuesForGQLMutation);

    const gqlMutationString: string = `
        mutation (
            ${mutationVariablesString}
        ) {
            ${mutationName}(input: {
                ${mutationInputString}
            }) {
                ${mutationSelectionSetString}
            }
        }
    `;

    return gqlMutationString;
}

function generateGQLMutationVariablesString(
    fieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>
): string {
    return fieldValuesForGQLMutation.reduce((result: string, currentScalarField: Readonly<ScalarFieldValuesForGQLMutation>) => {
        const nonNullableIndicator: string = currentScalarField.isNonNullType ? '!' : '';
        return result + `\n$${currentScalarField.variableName}: ${currentScalarField.fieldType}${nonNullableIndicator}`;
    }, '');
}

function generateMutationInputString(
    fieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>,
    id: number | 'NOT_SET'
): string {
    const idInput: string = id !== 'NOT_SET' ? `id: ${id}` : '';
    const otherInputs: string = fieldValuesForGQLMutation.reduce((result: string, currentScalarField: Readonly<ScalarFieldValuesForGQLMutation>) => {
        return result + `\n${currentScalarField.fieldName}: $${currentScalarField.variableName}`;
    }, '');
    return idInput + otherInputs;
}

function generateMutationSelectionSetString(
    fieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation>,
): string {
    // NOTE we are only grabbing scalar values in the selection set right now
    const selectionSet: string = fieldValuesForGQLMutation.reduce((result: string, currentField: Readonly<ScalarFieldValuesForGQLMutation>) => {
        if (
            currentField.fieldName.includes('redacted') &&
            !currentField.fieldName.includes('redacted') && // TODO figure out what to do with this. I'm allowing it here to get the eq selection set filters to work
            !currentField.fieldName.includes('redacted') &&
            !currentField.fieldName.includes('redacted')
        ) {
            return result;
        }
        return result + `\n${currentField.fieldName}`;
    }, '');
    return 'id' + selectionSet;
}

export function generateGQLVariablesObject(
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
    for (let i = 0; i < fieldValuesForGQLMutation.length; i++) {
        
        const fieldName: string = fieldValuesForGQLMutation[i].fieldName;
        const fieldValue: any = fieldValuesForGQLMutation[i].value;

        // skip relationship fields
        if (fieldName.includes('_id')) {
            continue;
        }
        
        if (gqlResult.data[mutationName][fieldName] !== fieldValue) {
            console.log('gqlResult.data:', gqlResult);
            throw new Error(`
            ////////////////////////////////////////////////////////////////////////////
            ${mutationName} TEST FAILED: 
                gqlResult.data[${mutationName}][${fieldName}] !== ${fieldValue}
                gqlResult.data[${mutationName}][${fieldName}]: ${gqlResult.data[mutationName][fieldName]}
            ////////////////////////////////////////////////////////////////////////////
            `);
        }
    }
}

export function generateQueryString(
    queryType: 'GET' | 'FIND',
    tableName: Readonly<TableName>,
    objectFields: ReadonlyArray<FieldDefinitionNode>,
    // rowId: number,
    schemaAST: Readonly<SchemaAST>,
    joinLevels: number,
    filterFieldName: string,
    filterFieldValue: any,
): string {
    const selectionSet: string = generateQuerySelectionSet(tableName, schemaAST, joinLevels);
    
    if (queryType === 'GET') {
        const result: string = generateGetQuery(tableName, filterFieldValue, selectionSet);
        return result;
    }
    else {
        const result: string = generateFindQuery(tableName, selectionSet, filterFieldName, filterFieldValue);
        return result;
    }
}

function generateQuerySelectionSet(
    tableName: Readonly<TableName>,
    schemaAST: Readonly<SchemaAST>,
    joinLevel: number = 0
): string {
    if (joinLevel === -1) {
        return '';
    }

    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = schemaAST.objectTypeDefinitionNodes.filter((typeDef: Readonly<ObjectTypeDefinitionNode>) => {
        return typeDef.name.value.toLowerCase().includes(tableName);
    })[0];

    const fields: ReadonlyArray<FieldDefinitionNode> | undefined = objectTypeDefinitionNode.fields;

    if (fields === undefined) {
        throw new Error(`fields are undefined:, tableName: ${tableName}, joinLevel: ${joinLevel}`);
    }

    return fields.reduce((result: string, currentField: Readonly<FieldDefinitionNode>) => {
        
        // SKIP field 'strip_invoice' on table 'invoices' for now
        if (currentField.name.value === 'stripe_invoice') {
            return result;
        }

        if (isRelationshipField(currentField, schemaAST) === true) {
            if (joinLevel === 0) {
                return result;
            }

            const tableName: Readonly<TableName> = getFieldDefinitionType(currentField).toLowerCase() as Readonly<TableName>;
            const subSelectionSet = generateQuerySelectionSet(tableName, schemaAST, joinLevel - 1);
            const listTypeLimitFilter: string = isListTypeField(currentField) ? `(filter: {
                    id: {
                        eq: 1
                    }
                }) ` : '';
            
            return result + `\n${currentField.name.value}${listTypeLimitFilter} {
                ${subSelectionSet}
            \n}\n`;
        }

        return result + `\n${currentField.name.value}`;
    }, '');
}

function generateFindQuery(
    tableName: Readonly<TableName>, 
    selectionSet: string,
    filterFieldName: string,
    filterFieldValue: any,
): string {
    const queryName = generateQueryName('FIND', tableName);

    const filter: string = generateFilter(filterFieldName, filterFieldValue);

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
    filterFieldName: string, 
    filterFieldValue: any,
    filterType: Readonly<FilterType> = 'eq' 
): string {
    console.log('filterFieldValue:', filterFieldValue);
    console.log('typeof filterFieldValue:', typeof filterFieldValue);

    const value: any = typeof filterFieldValue === 'string' ? `"${filterFieldValue}"` : filterFieldValue

    return `(filter: {
        ${filterFieldName}: {
            ${filterType}: ${value}
        },
    }, page: {
        limit: 1
    })`;
}

export function isRelationshipField(
    field: Readonly<FieldDefinitionNode>,
    schemaAST: Readonly<SchemaAST>
): boolean {
    const objectTypeDefNames: ReadonlyArray<string> = schemaAST.objectTypeDefinitionNodes.map((objectTypeDef: Readonly<ObjectTypeDefinitionNode>) => objectTypeDef.name.value);
    const fieldType: string = getFieldDefinitionType(field);
    const isRelationshipField: boolean = objectTypeDefNames.includes(fieldType);
    return isRelationshipField;
}

function generateGetQuery(
    tableName: Readonly<TableName>, 
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

function isListTypeField(
    field: Readonly<FieldDefinitionNode | NonNullTypeNode>
): boolean {
    if (field.type.kind === 'NonNullType') {
        return isListTypeField(field.type);
    }

    return field.type.kind === 'ListType';
}

export async function runScalarMutation(
    mutationType: 'CREATE' | 'UPDATE',
    tableName: Readonly<TableName>,
    schemaAST: Readonly<SchemaAST>,
    rowId: number | 'NOT_SET' = 'NOT_SET',
): Promise<any> {
    const mutationName: string = generateQueryName(mutationType, tableName);
    
    const mutationInputObjectTypeDefNode: Readonly<InputObjectTypeDefinitionNode> = getMutationInputObjectTypeDefinitionNode(mutationType, tableName, schemaAST);
    const fields: ReadonlyArray<InputValueDefinitionNode> = mutationInputObjectTypeDefNode.fields!;

    const scalarScalarFieldValuesForGQLMutation: ReadonlyArray<ScalarFieldValuesForGQLMutation> = generateScalarFieldValuesForGQLMutation(fields, schemaAST);
    
    const mutationString: string = generateMutationString(mutationName, scalarScalarFieldValuesForGQLMutation, rowId);
    console.log('mutationString:', mutationString);

    const gqlVarablesObject: any = generateGQLVariablesObject(scalarScalarFieldValuesForGQLMutation);

    const graphback: any = await graphbackPromise;
    const gqlResult: any = await graphback.query(mutationString, gqlVarablesObject);

    verifyScalarMutationSucceeded(mutationName, gqlResult, scalarScalarFieldValuesForGQLMutation);

    return gqlResult.data[mutationName];
}

export async function runQuery(
    queryType: 'GET' | 'FIND',
    tableName: Readonly<TableName>,
    schemaAST: Readonly<SchemaAST>,
    filterFieldName: string,
    filterFieldValue: any,
    joinLevels: number = 0
): Promise<any> // returns a graphback.data[queryName] result query
{
    const queryName: string = generateQueryName(queryType, tableName);

    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = schemaAST.modelObjectTypeDefinitionNodes.filter((typeDef: Readonly<ObjectTypeDefinitionNode>) => {
        return typeDef.name.value.toLowerCase().includes(tableName);
    })[0];

    const fields: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields!;

    const queryString: string = generateQueryString(queryType, tableName, fields, schemaAST, joinLevels, filterFieldName, filterFieldValue);
    console.log('queryString:', queryString);

    const graphback = await graphbackPromise;
    const gqlQueryResult: any = await graphback.query(queryString, {});

    return gqlQueryResult.data[queryName];
}

export async function runDeleteMutation(
    tableName: Readonly<TableName>,
    id: number
): Promise<void> {
    const mutationName: string = generateQueryName('DELETE', tableName);

    const graphback = await graphbackPromise;

    const result: any = await graphback.query(`
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


export async function getFilterFieldValue(
    filterFieldName: string,
    gqlResult: any,
    queryName: string,
): Promise<any> {
    if (filterFieldName.includes('_id')) {
        const fieldName: string = filterFieldName.split('_id')[0];
        const gqlResultValue: any = gqlResult.data[queryName][fieldName];
        
        if (
            gqlResultValue === null ||
            gqlResultValue === undefined
        ) {
            return null;
        }
        else {
            return gqlResult.data[queryName][fieldName].id;
        }
    }

    return gqlResult.data[queryName][filterFieldName];
}

export async function runEqFilterTest(
    tableName: Readonly<TableName>,
    createResult: any,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING 'eq' FILTER TESTS for ${tableName}\n`);
    
    const filterInputObjectDefinitionNode: Readonly<InputObjectTypeDefinitionNode> = schemaAST.filterInputObjectTypeDefinitionNodes.filter(field => field.name.value.toLowerCase().includes(tableName))[0];
    
    // TODO figure out later how to account for 'and', 'or' and 'not' filter types
    const fields = filterInputObjectDefinitionNode.fields!.filter(field => !['and', 'or', 'not'].includes(field.name.value));

    const getGqlResult = await runQuery('GET', tableName, schemaAST, 'id', createResult.id);
    const getQueryName = generateQueryName('GET', tableName);

    for (let i = 0; i < fields.length; i++) {
        const filterFieldName: string = fields[i].name.value;
        await runEqFilterTestOnField(tableName, filterFieldName, getGqlResult, getQueryName, schemaAST);
    }

    console.log(`\nALL 'eq' FILTER TESTS PASSED for TABLE '${tableName}'\n`)
}

async function runEqFilterTestOnField(
    tableName: Readonly<TableName>,
    filterFieldName: string,
    getGqlResult: any,
    queryName: string,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING 'eq' FILTER TEST for ${tableName} ON FIELD '${filterFieldName}'\n`);
    
    const filterFieldValue: any = await getFilterFieldValue(filterFieldName, getGqlResult, queryName);
    
    const filterType: string = 'eq'; // TODO add this to the query test

    await runQuery('FIND', tableName, schemaAST, filterFieldName, filterFieldValue, 0);
    
    console.log(`\n'eq' FILTER TEST PASSED for TABLE '${tableName}' ON FIELD '${filterFieldName}'\n`);
}

/**
 * takes a newly-created instance of a table and tests every possible eq filter on each of its relationship-field children 
 * @param tableName 
 * @param parentCreateResult
 * @param schemaAST 
 */
export async function runEqFilterTestOnSelectionSet(
    tableName: Readonly<TableName>,
    parentCreateResult: any,
    schemaAST: Readonly<SchemaAST>
) {
    console.log(`\nSTARTING 'eq' FILTER TEST ON SELECTION SET ITEMS for ${tableName}, id ${parentCreateResult.id}`);

    const objectTypeDefinitionNodeForTableName: Readonly<ObjectTypeDefinitionNode> = schemaAST.objectTypeDefinitionNodes.filter((node: Readonly<ObjectTypeDefinitionNode>) => node.name.value.toLowerCase() === tableName)[0];
    console.log('objectTypeDefinitionNodeForTableName:', objectTypeDefinitionNodeForTableName);
    const fields = objectTypeDefinitionNodeForTableName.fields!;
    console.log('fields:', fields);

    const relationshipFields = fields.filter((field: Readonly<FieldDefinitionNode>) => isRelationshipField(field, schemaAST) && isListTypeField(field));
    console.log('relationshipField:', relationshipFields);
    throw new Error('STOP HERE');

    // now run a complete eq filter test on each scalar item of each relationship field
    for (let i = 0; i < relationshipFields.length; i++) {
        const currentRelationshipField: Readonly<FieldDefinitionNode> = relationshipFields[i];
        const relationshipFieldTableName: Readonly<TableName> = currentRelationshipField.name.value as Readonly<TableName>;

        console.log('currentRelationshipField:', currentRelationshipField);
        const scalarSubFields = getScalarFieldsFromRelationshipFieldDefinitionNode(currentRelationshipField, schemaAST);
        
        const relationshipFieldCreateResult = await runCreateMutation(relationshipFieldTableName, schemaAST);
        // await connectDatabaseItems(parentCreateResult.id, tableName, relationshipFieldCreateResult.id, currentRelationshipField.)

        for (let i = 0; i < scalarSubFields.length; i++) {
            const currentScalarSubField: Readonly<FieldDefinitionNode> = scalarSubFields[i];
            await runSelectionEQFilterTest(tableName, currentRelationshipField, relationshipFieldCreateResult, currentScalarSubField, schemaAST);
        }

        await runDeleteMutation(relationshipFieldTableName, relationshipFieldCreateResult.id);
    }

    console.log(`\n'eq' FILTERS ON ALL SELECTION SET ITEMS FOR TABLE '${tableName}' PASSED`);
}

async function runSelectionEQFilterTest(
    tableName: Readonly<TableName>, 
    relationshipField: Readonly<FieldDefinitionNode>,
    relationshipCreateResult: any, 
    scalarSubField: Readonly<FieldDefinitionNode>, 
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nStarting 'eq' selection set item filter test on table '${tableName}', relationship field '${relationshipField.name.value}', scalar sub-field '${scalarSubField.name.value}'`);

    console.log('tableName:', tableName)
    console.log('relationship field:', relationshipField.name.value);
    console.log('scalar sub-field:', scalarSubField);
    console.log('relationshipCreateResult:', relationshipCreateResult);

    const queryName = generateQueryName('GET', tableName);

    const fieldName: string =  scalarSubField.name.value;

    const rawValue: any = relationshipCreateResult[fieldName];

    const value: any = typeof rawValue === 'string' ? `"${rawValue}"` : rawValue; 

    const query = `
        query {
            ${queryName}(id: ${relationshipCreateResult.id}) {
                ${relationshipField.name.value}(filter: {
                    ${fieldName}: {
                        eq: ${value}
                    }
                }) {
                    ${fieldName}
                }
            }        
        }
    `;

    console.log('query:', query);

    const graphback = await graphbackPromise;
    const gqlResult = await graphback.query(query, {});

    console.log('gqlResult:', gqlResult);
}

export function getScalarFieldsFromRelationshipFieldDefinitionNode(
    parentField: Readonly<FieldDefinitionNode>,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<FieldDefinitionNode> {
    console.log('parentField:', parentField);

    const parentTypeDefNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeFromFieldName(parentField.name.value, getFieldDefinitionType(parentField), schemaAST);
    console.log('parentTypeDefNode:', parentTypeDefNode);

    const scalarFields: ReadonlyArray<FieldDefinitionNode> = getScalarFieldsFromObjectDefinitionNode(parentTypeDefNode, schemaAST);

    return scalarFields;
}

function getObjectTypeDefinitionNodeFromFieldName(
    fieldName: string,
    fieldType: string,
    schemaAST: Readonly<SchemaAST>
): Readonly<ObjectTypeDefinitionNode> {
    const tableName: Readonly<TableName> = pluralizeFieldNameIfNecessary(fieldName);
    return schemaAST.objectTypeDefinitionNodes.filter((node: Readonly<ObjectTypeDefinitionNode>) => {
        return getFieldDefinitionType(node) === fieldType;

    })[0];
}

function getScalarFieldsFromObjectDefinitionNode(
    parentNode: Readonly<ObjectTypeDefinitionNode>,
    schemaAST: Readonly<SchemaAST>
) {
    console.log('parentNode:', parentNode);
    return parentNode.fields!.reduce((result: ReadonlyArray<FieldDefinitionNode>, currentField: Readonly<FieldDefinitionNode>) => {
        if (isRelationshipField(currentField, schemaAST)) {
            return result;
        }

        return [...result, currentField];
    }, []);
}

function pluralizeFieldNameIfNecessary(fieldName: string): Readonly<TableName> {
    if (fieldName.endsWith('s') === false) {
        return fieldName + 's' as Readonly<TableName>;
    }
    return fieldName as Readonly<TableName>
}

async function connectDatabaseItems(
    parentId: number,
    parentTableName: Readonly<TableName>,
    childId: number,
    childFieldName: string
): Promise<void> {

    const queryName: string = generateQueryName('UPDATE', parentTableName);

    const mutationString: string = `
        mutation {
            ${queryName}(
                id: ${parentId}
                ${childFieldName}: {
                    connect: {
                        id: ${childId}
                    }
                }
            ) {
                id
            }
        }
    `;

    const graphback: any = await graphbackPromise;
    await graphback.query(mutationString, {});

    if (
        graphback.data[queryName] === null ||
        graphback.data[queryName] === undefined
    ) {
        throw new Error(`Update mutation failed, error connecting ${parentTableName} to ${childFieldName}`);
    }
}


/** Gets a semi-random id from a table in the database */
export async function getRandomTableId(
    tableName: Readonly<TableName>,
    schemaAST: Readonly<SchemaAST>
): Promise<number> {
    // first do a find test for this table. Limit 5
    const queryName: string = generateQueryName('FIND', tableName);

    const findQueryString = `
        query {
            ${queryName}(page: {
                limit: 15
            }) {
                items {
                    id
                }
            }
        }
    `;

    const graphback: any = await graphbackPromise;
    const gqlResult: any = await graphback.query(findQueryString, {});

    if (
        gqlResult.data[queryName] === null ||
        gqlResult.data[queryName] === undefined
    ) {
        throw new Error(`There was an error in the ${queryName} query`);
    }

    
    // Then pick a random one of the results and return its id

    // TODO this is not very random, but for now will have to do
    const randomSelectionNumber: number = Math.floor(Math.random() * gqlResult.data[queryName].length);

    return gqlResult.data[queryName][randomSelectionNumber].id;
}
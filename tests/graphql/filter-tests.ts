import { JOTableName } from '../../types.d';
import { SchemaAST } from './utilities/schema-ast-util-object';
import {
    generateQueryName,
    runQuery,
    runFullMutation,
    verifyGQLResultsAreEquivalent,
    getTableNameFromRelationshipFieldName,
    getRelationshipFieldsFromObjectTypeDefinitionNode,
    getObjectTypeDefinitionNodeForTableName,
    isListTypeField,
    isRelationshipField,
    getScalarTypeDefFieldNamesForTableName,
    sortObjectArrayById,
    convertTypeDefNameToTableName,
    cleanUpCronJobsAndBusinessHours,
    isForeignKeyConstraintField
} from './utilities/graphql-tests-utilities';
import { 
    InputObjectTypeDefinitionNode, FieldDefinitionNode, InputValueDefinitionNode, ObjectTypeDefinitionNode, isScalarType 
} from 'graphql';
import { graphqlPromise } from '../../graphql/graphql';
import { getScalarFieldsFromRelationshipFieldDefinitionNode } from './utilities/old-graphql-query-tests-utilities';

export type FilterType = 
    | 'ne'
    | 'eq'
    | 'le'
    | 'lt'
    | 'ge'
    | 'gt'
    | 'in';

export async function runAllEQFilterTests(schemaAST: Readonly<SchemaAST>): Promise<void> {
    console.log(`\nSTARTING ALL EQ FILTER TESTS`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);
    
        await runTopLevelEQFilterTest(tableName, schemaAST);
        await runSelectionSetEQFilterTest(tableName, schemaAST);
    }

    console.log(`\nALL EQ FILTER TESTS PASSED`);
}


export async function runAllTopLevelEQFilterTests(
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING ALL TOP LEVEL EQ FILTER TESTS`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);
    
        await runTopLevelEQFilterTest(tableName, schemaAST);
    }

    console.log(`\nALL TOP LEVEL EQ FILTER TESTS PASSED`);
}


export async function runTopLevelEQFilterTest(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING ALL TOP LEVEL 'EQ' FILTER TESTS ON EACH FILTER FIELD FOR TABLE '${tableName}'`);

    const filterFields: ReadonlyArray<InputValueDefinitionNode> = getFilterFieldsFromTableName(tableName, schemaAST);
    await runTopLevelEQFilterTestOnEachFilterField(tableName, schemaAST, filterFields);

    await cleanUpCronJobsAndBusinessHours();

    console.log(`\nALL TOP LEVEL 'EQ' FILTER TESTS PASSED ON EACH FILTER FOR TABLE '${tableName}'`);
}

function getFilterFieldsFromTableName(
    tableName: Readonly<JOTableName>, 
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<InputValueDefinitionNode> {
    const filterInputObjectDefinitionNode = getFilterInputObjectDefinitionNode(tableName, schemaAST);
    const filterFields: ReadonlyArray<InputValueDefinitionNode> = getFilterFields(filterInputObjectDefinitionNode);
    return filterFields;
}

function getFilterFields(
    filterInputObjectDefinitionNode: Readonly<InputObjectTypeDefinitionNode>
): ReadonlyArray<InputValueDefinitionNode> {
    const allFilterFields: ReadonlyArray<InputValueDefinitionNode> | undefined = filterInputObjectDefinitionNode.fields;
    if (allFilterFields === undefined) {
        throw new Error(`filterFields are undefined on filterInputObjectDefinitionNode ${filterInputObjectDefinitionNode}`);;
    }

    return allFilterFields.filter((field: Readonly<InputValueDefinitionNode>) => {
        // TODO come back later to include 'and', 'or', and 'not' filters
        return ['and', 'or', 'not'].includes(field.name.value) === false;
    });
}

async function runTopLevelEQFilterTestOnEachFilterField(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>,
    filterFields: ReadonlyArray<InputValueDefinitionNode>,
): Promise<void> {
    const createResult: any = await runFullMutation('CREATE', tableName, schemaAST);
    // console.log('createResult:', createResult);

    for (let i = 0; i < filterFields.length; i++) {
        const filterFieldName: string = filterFields[i].name.value;

        await runTopLevelEQFilterTestOnFilterField(tableName, filterFieldName, createResult.fullMutationResult, schemaAST);
    }
}

export async function runTopLevelEQFilterTestOnFilterField(
    originalTableName: Readonly<JOTableName>,
    filterFieldName: string,
    createResult: any,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING TOP LEVEL 'EQ' FILTER TEST FOR TABLE '${originalTableName}' ON FIELD '${filterFieldName}'`);

    console.log('createResult:', createResult);

    const initialValueAtFilterFieldName: any = getFieldValueAtFilterFieldName(filterFieldName, createResult);
    console.log('initialValueAtFilterFieldName:', initialValueAtFilterFieldName);
    
    // TODO let joinLevels and subSelectionSetLimit be passed in
    const findResultAtFilterNameAndInitialValue: any = await runQuery(
        'FIND', 
        originalTableName, 
        createResult.id, 
        1, 
        schemaAST, 
        filterFieldName, 
        initialValueAtFilterFieldName,
        'ALL'
    );

    console.log('do we get here?')

    const queryName: string = generateQueryName('FIND', originalTableName);
    await verifyGQLResultsAreEquivalent(queryName, createResult, findResultAtFilterNameAndInitialValue.items[0]);

    console.log(`\nTOP LEVEL 'EQ' FILTER TEST PASSED FOR TABLE '${originalTableName}' ON FIELD '${filterFieldName}'`);
}

function getFieldValueAtFilterFieldName(
    filterFieldName: string, 
    gqlResult: any
): any {
    if (isForeignKeyConstraintField(filterFieldName) === true) {
        console.log('foreign key constraint field name:', filterFieldName);
        const fieldName: string = filterFieldName.replace('_id', '');
        if (fieldName === 'redacted') {
            return gqlResult['redacted'].id;
        }
        if (fieldName === 'redacted') {
            return gqlResult['redacted'].id;
        }
        if (fieldName === 'redacted') {
            return gqlResult['redacted'].id;
        }
        if (fieldName === 'redacted') {
            return gqlResult['redacted'].id
        }
        if (fieldName === 'redacted') {
            return gqlResult['redacted'].id;
        }
        return gqlResult[fieldName].id;
    }
    else {
        return gqlResult[filterFieldName];
    }
}

function getFilterInputObjectDefinitionNode(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): Readonly<InputObjectTypeDefinitionNode> {
    const result: Readonly<InputObjectTypeDefinitionNode> | undefined = schemaAST.filterInputObjectTypeDefinitionNodes
        .find((filterInputTypeDef: Readonly<InputObjectTypeDefinitionNode>) => {
            return filterInputTypeDef.name.value.toLowerCase().startsWith(tableName);
        });

    if (result === null || result === undefined) {
        throw new Error(`Error gettinging filterInputTypeDefinitionNode for table ${tableName}`);
    }

    return result;
}


export async function runAllEQSelectionSetFilterTests(schemaAST: Readonly<SchemaAST>): Promise<void> {
    console.log(`\nSTARTING ALL SELECTION SET EQ FILTER TESTS`);

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);
    
        await runSelectionSetEQFilterTest(tableName, schemaAST);
        await cleanUpCronJobsAndBusinessHours();
    }

    console.log(`\nALL SELECTION SET EQ FILTER TESTS PASSED`);
}


export async function runSelectionSetEQFilterTest(
    tableName: Readonly<JOTableName>, 
    schemaAST: Readonly<SchemaAST>, 
): Promise<void> {
    console.log(`\nSTARTING SELECTION SET EQ FILTER TESTS ON TABLE '${tableName}'`);

    const createResult: any = await runFullMutation('CREATE', tableName, schemaAST);

    const multipleRelationFields: ReadonlyArray<FieldDefinitionNode> = getMultipleRelationFieldsForTableName(tableName, schemaAST);
    
    for (let i = 0; i < multipleRelationFields.length; i++) {
        const field: Readonly<FieldDefinitionNode> = multipleRelationFields[i];
        await runEQFilterTestOnSelectionSetFields(tableName, field.name.value, createResult.fullMutationResult, schemaAST);
    }

    await cleanUpCronJobsAndBusinessHours();

    console.log(`\nSELECTION SET EQ FILTER TESTS PASSED FOR TABLE '${tableName}'`);
}

export function getMultipleRelationFieldsForTableName(
    tableName: Readonly<JOTableName>,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<FieldDefinitionNode> {
    const objectTypeDefNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTableName(tableName, schemaAST);
    const relationshipFields = getRelationshipFieldsFromObjectTypeDefinitionNode(objectTypeDefNode, schemaAST);
    const multipleRelationFields = relationshipFields.filter(field => isListTypeField(field));
    return multipleRelationFields;
}

async function runEQFilterTestOnSelectionSetFields(
    originalTableName: Readonly<JOTableName>,
    relationshipFieldName: string,
    initialCreateResult: any,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING SELECTION SET EQ FILTER TEST ON FIELD '${relationshipFieldName}', TABLE '${originalTableName}'`);

    const currentRelationshipFieldTableName: Readonly<JOTableName> = getTableNameFromRelationshipFieldName(relationshipFieldName);
    const scalarSelectionSetItemFilterFieldNames: ReadonlyArray<string> = getScalarTypeDefFieldNamesForTableName(currentRelationshipFieldTableName, schemaAST);

    for (let i = 0; i < scalarSelectionSetItemFilterFieldNames.length; i++) {
        const scalarSubFieldName: string = scalarSelectionSetItemFilterFieldNames[i];

        await runFilterTestOnSelectionSetFilterField(originalTableName, relationshipFieldName, scalarSubFieldName, initialCreateResult, schemaAST);
    } 

    console.log(`\nSELECTION SET EQ FILTER TEST PASSED ON FIELD '${relationshipFieldName}', TABLE '${originalTableName}'`);
}

async function runFilterTestOnSelectionSetFilterField(
    originalTableName: Readonly<JOTableName>,
    relationshipFieldName: string,
    filterFieldName: string,
    initialCreateResult: any,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING SELECTION SET EQ FILTER TEST ON SELECTION SET FILTER FIELD '${filterFieldName}', SELECTION SET FIELD '${relationshipFieldName}', TABLE '${originalTableName}'`);

    // NOTE: this should alwas be an array
    const initialValueInCreateResultAtMultipleRelationFieldName: ReadonlyArray<any> = sortObjectArrayById(initialCreateResult[relationshipFieldName]);


    // make sure each item (should be 3 items) is found in the original create result
    for (let i = 0; i < initialValueInCreateResultAtMultipleRelationFieldName.length; i++) {
        const initialCreateObject: any = initialValueInCreateResultAtMultipleRelationFieldName[i];
        const initialValueAtFilterName: any = getFieldValueAtFilterFieldName(filterFieldName, initialCreateObject);

        await runSubSelectionFilterEQTestOnGetAndFindQueries(
            originalTableName,
            relationshipFieldName,
            filterFieldName,
            initialCreateResult.id,
            initialCreateObject,
            initialValueAtFilterName,
            schemaAST
        );
    }

    console.log(`\nSELECTION SET EQ FILTER TEST ON SELECTION SET FILTER FIELD '${filterFieldName}', SELECTION SET FIELD '${relationshipFieldName}', TABLE '${originalTableName}'`);
}

export async function runSubSelectionFilterEQTestOnGetAndFindQueries(
    originalTableName: Readonly<JOTableName>,
    relationshipFieldName: string,
    filterFieldName: string,
    initialFullCreateResultId: number,
    initialCreateObject: any,
    initialValueAtFilterName: any, 
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    
    const scalarSubSelectionSetNames: ReadonlyArray<string> = getScalarTypeDefFieldNamesFromFieldName(relationshipFieldName, schemaAST);

    // GET TEST
    await runSubSelectionFilterEQTest(
        'GET',
        originalTableName,
        relationshipFieldName,
        scalarSubSelectionSetNames,
        filterFieldName,
        initialFullCreateResultId,
        initialCreateObject,
        initialValueAtFilterName,
    );
    
    // FIND TEST
    await runSubSelectionFilterEQTest(
        'FIND',
        originalTableName,
        relationshipFieldName,
        scalarSubSelectionSetNames,
        filterFieldName,
        initialFullCreateResultId,
        initialCreateObject,
        initialValueAtFilterName,
    );
}

async function runSubSelectionFilterEQTest(
    queryType: 'GET' | 'FIND',
    originalTableName: Readonly<JOTableName>,
    relationshipFieldName: string,
    sclarSubSelectionSetNames: ReadonlyArray<string>,
    filterFieldName: string,
    initialFullCreateResultId: number,
    initialCreateObject: any,
    initialValueAtFilterName: any, 
): Promise<void> {

    const graphql = await graphqlPromise;

    const queryName: string = generateQueryName(queryType, originalTableName);
    const selectionSet: string = generateSelectionSetFromFieldNames(sclarSubSelectionSetNames);
    const query: string = generateQueryForSubSelectionSetEQFilterTest(
        queryType,
        queryName,
        initialFullCreateResultId,
        relationshipFieldName,
        filterFieldName,
        initialValueAtFilterName,
        selectionSet
    );

    console.log('\nquery:', query);

    const gqlResult: any = await graphql.query(query, {});
    const gqlResultForVerification: any = getGQLSubFilterSelectionSetResultForVerifification(
        queryType,
        queryName,
        relationshipFieldName,
        filterFieldName,
        gqlResult,
        initialCreateObject,
    );

    // console.log('initialCreateObject:', initialCreateObject);
    // console.log('gqlResultForVerification:', gqlResultForVerification);

    verifyGQLResultsAreEquivalent(queryName, initialCreateObject, gqlResultForVerification);

}

// TODO move this to utilities
export function getScalarFilterInputFieldNamesForRelationshipFieldName(
    fieldName: string,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<string> {
    const tableName: Readonly<JOTableName> = getTableNameFromRelationshipFieldName(fieldName);
    const filterInputObjectDefinitionNode: Readonly<InputObjectTypeDefinitionNode> = getFilterInputObjectDefinitionNode(tableName, schemaAST);

    const scalarFields: ReadonlyArray<InputValueDefinitionNode> = filterInputObjectDefinitionNode.fields!.filter((field: Readonly<InputValueDefinitionNode>) => {
        return isRelationshipField(field, schemaAST) === false;
    });

    const scalarFieldNames: ReadonlyArray<string> = scalarFields.map((field: Readonly<InputValueDefinitionNode>) => field.name.value);

    return scalarFieldNames;
}

export function getScalarTypeDefFieldNamesFromFieldName(
    fieldName: string,
    schemaAST: Readonly<SchemaAST>
): ReadonlyArray<string> {
    const tableName: Readonly<JOTableName> = getTableNameFromRelationshipFieldName(fieldName);
    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTableName(tableName, schemaAST);

    const scalarFields: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields!.filter((field: Readonly<FieldDefinitionNode>) => {
        return isRelationshipField(field, schemaAST) === false;
    });

    const scalarFieldNames: ReadonlyArray<string> = scalarFields.map((field: Readonly<FieldDefinitionNode>) => field.name.value);

    return scalarFieldNames;
}

// TODO move this to utilities
export function generateSelectionSetFromFieldNames(
    fieldNames: ReadonlyArray<string>
): string {
    return fieldNames.reduce((result: string, currentFieldName: string) => {
        return result + `\n${currentFieldName}`;
    }, '');
}

function generateQueryForSubSelectionSetEQFilterTest(
    queryType: 'GET' | 'FIND',
    queryName: string,
    id: number,
    relationshipFieldName: string,
    filterFieldName: string,
    initialValueAtFilterName: any,
    selectionSet: string
): string {
    const filterValue: any = typeof initialValueAtFilterName === 'string' ? `"${initialValueAtFilterName}"` : initialValueAtFilterName;

    if (queryType === 'GET') {
        return `query {
            ${queryName}(id: ${id}) {
                id
                ${relationshipFieldName}(filter: {
                    ${filterFieldName}: {
                        eq: ${filterValue}
                    }
                }) {
                    ${selectionSet}
                }
            }
        }`;
    }
    else {
        return `query {
            ${queryName}(filter: {
                id: {
                    eq: ${id}
                }
            }) {
                items {
                    id
                    ${relationshipFieldName}(filter: {
                        ${filterFieldName}: {
                            eq: ${filterValue}
                        }
                    }) {
                        ${selectionSet}
                    }
                }
            }
        }`;
    }
}

function getGQLSubFilterSelectionSetResultForVerifification(
    queryType: 'GET' | 'FIND',
    queryName: string,
    relationshipFieldName: string,
    filterFieldName: string,
    gqlResult: any,
    initialCreateObject: any
): any {
    const gqlResultAtRelationshipFieldName: any = queryType === 'GET' 
        ? gqlResult.data[queryName][relationshipFieldName]
        : gqlResult.data[queryName].items[0][relationshipFieldName];
    
    
    if (filterFieldName === 'id') {
        return gqlResultAtRelationshipFieldName[0];
    }
    else {
        // If the filter field is not  fieldName 'id', there is a chance that there will be
        //    multiple create results with the same value at the filter field.
        //    Since we already have verified above that filtering by 'id' works, 
        //    we can now we can filter the results to the one with the matching id
        return gqlResultAtRelationshipFieldName.find((gqlSelectionSetResult: any) => {
            return gqlSelectionSetResult.id === initialCreateObject.id;            
        });
    }
}
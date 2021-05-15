// @ts-nocheck

import { JOTableName } from '../../types.d';
import { SchemaAST } from './utilities/schema-ast-util-object';
import {
    generateQueryName,
    convertTypeDefNameToTableName,
    runDeleteMutation,
    runScalarMutation,
    verifyFullMutationSucceeded,
    runFullMutation,
    cleanUpCronJobsAndBusinessHours,
    generateQuerySelectionSet,
    getObjectTypeDefFieldsForTableName,
    getScalarTypeDefFieldNamesForTableName,
    isRelationshipField,
    getTableNameFromRelationshipFieldName, isListTypeField
} from './utilities/graphql-tests-utilities';
import { graphqlPromise } from '../../graphql/graphql';
import { FieldDefinitionNode } from 'graphql';

type JOTestResult = 
    | 'SUCCESS'
    | {
        readonly error: string;
    }

type OrderByParams = {
    readonly limit: number;
    readonly offset?: number;
    readonly field?: string;
    readonly order: 'ASC' | 'DESC';
    readonly joinLevels: number;
    readonly subSelectionSetFields?: 'ALL' | 'ID_ONLY';
    readonly orderByField?: string;
    // readonly level: 'TOP_LEVEL_ONLY' | 'SELECTION_SET_LEVEL_ONLY' | 'TOP_LEVEL_AND_SELECTION_SET_LEVEL'; // TODO consider revisiting this
}


export async function runSelectionSetOrderByTestOnAllTables(
    orderByParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);
    
        await runSelectionSetOrderByTestOnAllRelationFieldsForTable(tableName, orderByParams, schemaAST);
    }
}

export async function runSelectionSetOrderByTestOnAllRelationFieldsForTable(
    tableName: Readonly<JOTableName>,
    orderbyParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {

    const fields: ReadonlyArray<FieldDefinitionNode> = getObjectTypeDefFieldsForTableName(tableName, schemaAST);
    const multipleRelationFields: ReadonlyArray<FieldDefinitionNode> = fields.filter((field) => {
        return isRelationshipField(field, schemaAST) && isListTypeField(field);
    });
    
    for (let i = 0; i < multipleRelationFields.length; i++) {
        const currentField = multipleRelationFields[i];
        const currentFieldTableName: Readonly<JOTableName> = getTableNameFromRelationshipFieldName(currentField.name.value);

        await generateOrderByTestDataForTable(currentFieldTableName, {
            ...orderbyParams,
            joinLevels: orderbyParams.joinLevels - 1
        }, schemaAST);

        await runOrderByTestsOnSelectionSetField(
            tableName,
            currentField, 
            currentFieldTableName,
            orderbyParams, 
            schemaAST
        );
    }
}


export async function runOrderByTestsOnSelectionSetField(
    parentTableName: Readonly<JOTableName>,
    selectionSetField: Readonly<FieldDefinitionNode>,
    selectionSetFieldTableName: Readonly<JOTableName>,
    orderByParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {

    const orderByFieldsForSelectionSetField = getObjectTypeDefFieldsForTableName(selectionSetFieldTableName, schemaAST);

    for (let i = 0; i < orderByFieldsForSelectionSetField.length; i++) {
        const orderByFieldForSelectionSetField = orderByFieldsForSelectionSetField[i];


        const newOrderByParams: Readonly<OrderByParams> = {
            ...orderByParams,
            orderByField: orderByFieldForSelectionSetField.name.value
        };

        await runOrderByTestOnSelectionSetFieldOrderByField(
            parentTableName, 
            selectionSetField,
            selectionSetFieldTableName,
            newOrderByParams,
            schemaAST
        )

        
    }

    throw new Error('Hey Arnold!');
}


export async function runOrderByTestOnSelectionSetFieldOrderByField(
    parentTableName: Readonly<JOTableName>,
    selectionSetField: Readonly<FieldDefinitionNode>,
    selectionSetFieldTableName: Readonly<JOTableName>,
    orderbyParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING SUB ORDER BY TEST ON PARENT TABLE '${parentTableName}', RELATION FIELD '${selectionSetField.name.value}', ORDER BY FIELD '${orderbyParams}'`);

    const queryName: string = generateQueryName('FIND', parentTableName);

    const subSelectionSetJoinLevels: number = orderbyParams.joinLevels - 1

    const subSelectionSet: string = generateQuerySelectionSet(
        selectionSetFieldTableName, 
        schemaAST, 
        subSelectionSetJoinLevels, 
        orderbyParams.subSelectionSetFields
    );

    const query: string = `
        query {
            ${queryName} {
                items {
                    ${selectionSetField.name.value}(page: {
                        limit: ${orderbyParams.limit}
                    }, orderBy: {
                        field: "${orderbyParams.orderByField!}"
                        order: ${orderbyParams.order}
                    }) {
                        ${subSelectionSet}
                    }
                }
            }
        }
    `;
    console.log('query:', query);

    const graphql = await graphqlPromise;
    const gqlResult: any = await graphql.query(query, {});

    console.log('gqlResult:', JSON.stringify(gqlResult, null, 2));

    throw new Error('stop here');
}



/**
 * Currently only tests top level order bys.
 * 
 * Will first run a create for the current table x times -- x being the limit. Be careful in setting the limit
 */
export async function runTopLevelOrderByTestOnAllTables(
    orderByParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {

    for (let i = 0; i < schemaAST.modelObjectTypeDefinitionNodes.length; i++) {
        const tableName: Readonly<JOTableName> = convertTypeDefNameToTableName(schemaAST.modelObjectTypeDefinitionNodes[i].name.value);
        
        await generateOrderByTestDataForTable(tableName, orderByParams, schemaAST);
        await runTopLevelOrderByTestOnAllFieldsInTable(tableName, orderByParams, schemaAST);
        await cleanUpCronJobsAndBusinessHours();
    }
}

export async function generateOrderByTestDataForTable(
    tableName: Readonly<JOTableName>,
    orderbyParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    if (
        tableName === 'redacted' ||
        tableName === 'redacted'
    ) {
        return;
    }

    for (let i = 0; i < orderbyParams.limit; i++) {
        console.log(`\nCreateing test item on table ${tableName} at ${orderbyParams.joinLevels} join levels`);
        
        if (orderbyParams.joinLevels === 0) {
            await runScalarMutation('CREATE', tableName, schemaAST);
        }

        else {
            await runFullMutation(
                'CREATE',
                tableName,
                schemaAST,
                orderbyParams.joinLevels,
                orderbyParams.subSelectionSetFields
            );
        }

    }
}

export async function runTopLevelOrderByTestOnAllFieldsInTable(
    tableName: Readonly<JOTableName>,
    orderByParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    console.log(`\nSTARTING TOP LEVEL ORDER BY TESTS ON TABLE '${tableName}', orderbyParams: ${JSON.stringify(orderByParams, null, 2)}`);

    const fieldNames: ReadonlyArray<string> = getScalarTypeDefFieldNamesForTableName(tableName, schemaAST);

    for (let i = 0; i < fieldNames.length; i++) {
        await runTopLevelOrderByTestOnField(
            tableName, 
            {
                ...orderByParams,
                field: fieldNames[i]
            }, 
            schemaAST
        );

    }

    console.log(`\nTOP LEVEL ORDER BY TESTS PASSED ON TABLE '${tableName}', orderbyParams: ${JSON.stringify(orderByParams, null, 2)}`);
}

// TODO this function name is broad but the actual implementation is specific... decide what to do
export async function runTopLevelOrderByTestOnField(
    tableName: Readonly<JOTableName>,
    orderByParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): Promise<void> {
    const fieldName: string | undefined = orderByParams.field;
    if (fieldName === undefined) {
        throw new Error(`fieldName is undefined in order by test for table '${tableName}'`);
    }

    console.log(`\nSTARTING ORDER BY TEST ON FIELD '${fieldName}', TABLE '${tableName}', orderByParams: ${JSON.stringify(orderByParams, null, 2)}`);


    const query: string = generateOrderByQuery(tableName, orderByParams, schemaAST);
    console.log('query:', query);


    const graphql = await graphqlPromise;
    const gqlResult: any = await graphql.query(query, {});
    // console.log('result:', JSON.stringify(gqlResult, null, 2));


    const queryName: string = generateQueryName('FIND', tableName);
    const testResult: Readonly<JOTestResult> = verifyOrderIsCorrect(gqlResult.data[queryName].items, fieldName);
    if (testResult !== 'SUCCESS') {
        throw new Error(`Error in OrderBy test for ${queryName}
            error: ${testResult.error}
            orderByParams: ${JSON.stringify(orderByParams, null, 2)}
        `)
    }

    console.log(`\nORDER BY TEST PASSED ON FIELD '${orderByParams.field}', TABLE '${tableName}', orderByParams: ${JSON.stringify(orderByParams, null, 2)}`);
}   

function generateOrderByQuery(
    tableName: Readonly<JOTableName>,
    orderByParams: Readonly<OrderByParams>,
    schemaAST: Readonly<SchemaAST>
): string {
    const queryName: string = generateQueryName('FIND', tableName);

    const selectionSet: string = generateQuerySelectionSet(tableName, schemaAST, orderByParams.joinLevels, orderByParams.subSelectionSetFields);

    const query = `
        query {
            ${queryName}(page: {
                limit: ${orderByParams.limit}
            },
            orderBy: {
                field: "${orderByParams.field}"
                order: ${orderByParams.order}
            }) {
                items {
                    ${selectionSet}
                }
            }
        }
    `;

    return query;
}

function verifyOrderIsCorrect(
    gqlResultItems: any, 
    fieldName: string
): Readonly<JOTestResult> {

    console.log(`orderBy fieldName: '${fieldName}'`);
    console.log('result:', gqlResultItems);


    const valuesAtFieldName: ReadonlyArray<any> = gqlResultItems.map((item: any) => item[fieldName]);

    const sortedValuesAtFieldName: ReadonlyArray<any> = sortValues(valuesAtFieldName);

    // verify the order
    gqlResultItems.forEach((gqlItem: any, index: number) => {
        if (sortedValuesAtFieldName[index] !== gqlItem[fieldName]) {
            return `Error: Values are not ordered correctly:
                field: "${fieldName}"
                item values at field name: ${valuesAtFieldName}
            `;  
        }
    });

    return 'SUCCESS';
}

function sortValues(values: ReadonlyArray<any>): ReadonlyArray<any> {
    if (values[0] === null) {
        return [];
    }

    if (typeof values[0] === 'object') {
        return values.sort((a: any, b: any) => a.id > b.id ? 1 : -1);
    }
    else {
        return values.sort();
    }
}

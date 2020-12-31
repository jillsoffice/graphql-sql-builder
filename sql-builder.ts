import * as fs from 'fs';
import {
    parse,
    ObjectTypeDefinitionNode,
    FieldDefinitionNode,
    DocumentNode,
    ObjectValueNode,
    ObjectFieldNode,
    ValueNode,
    GraphQLResolveInfo,
    SelectionNode,
    FieldNode,
    ArgumentNode,
    InlineFragmentNode
} from 'graphql';
import {
    SQLInput,
    SelectAndJoinClauseInfo,
    JOTableName,
    JOObjectTypeName,
    JOGraphQLResolvers,
    GraphQLVariables,
    JOGraphQLFilter,
    SelectionConfig,
    JOContext,
    JOGraphQLArgs,
    SQLBuilderConfig,
    BaseSQLFunction,
    DerivedSQLFunction,
    NestedOperationName,
    RelationIDInput,
    PageRequest,
    OrderByInput,
    RelationInput // TODO this type is slightly wrong I believe
} from './types.d';
import { v4 as uuid } from 'uuid';
import { SQLBuilderConfigs } from './sql-builder-configs';
import * as crypto from 'crypto';
import { generateModel } from './sql-builder-schema-generator';
import {
    getModelObjectTypeDefinitionNodes,
    getScalarFieldNamesForObjectType,
    getRelationFieldNamesForObjectType,
    getObjectTypeDefinitionNodeForTypeName,
    getDirectiveWithArgument,
    getDirectiveArgumentValue,
    getTypeNameFromTypeNode,
    nestedOperationNames
} from './utilities';

const model: string = fs.readFileSync('./graphql/schema.graphql').toString();
export const documentNode: Readonly<DocumentNode> = parse(model);

export const generatedModel: string = generateModel(model);

// TODO use these functions more, do not require the resolvers or anywhere else to use them, do not export them
export function getScalarNamesForTypeName(typeName: JOObjectTypeName): Array<string> {
    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTypeName(documentNode, typeName);
    const scalarNames: Array<string> = getScalarFieldNamesForObjectType(documentNode, objectTypeDefinitionNode);
    return scalarNames;
}

export function getRelationNamesForTypeName(typeName: JOObjectTypeName): Array<string> {
    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTypeName(documentNode, typeName);
    const relationNames: Array<string> = getRelationFieldNamesForObjectType(documentNode, objectTypeDefinitionNode);
    return relationNames;
}

export function buildGetQuery(
    tableName: JOTableName,
    scalarNames: Array<string>,
    args: Readonly<JOGraphQLArgs>,
    info: Readonly<GraphQLResolveInfo>,
    variables: Readonly<GraphQLVariables>
): Readonly<SQLInput> {
    const tableAliasSuffix: string = psqluuid();
    
    if (info.operation.selectionSet.selections[0].kind !== 'Field') {
        throw new Error(`buildGetQuery - the query seems to not be formatted correctly`);
    }

    const { selectClauseSQLInput, joinClauseSQLInput } = buildSelectAndJoinClause(
        variables,
        info.operation.selectionSet.selections[0].selectionSet?.selections || [],
        scalarNames,
        tableName,
        tableAliasSuffix,
        ''
    );
    const whereClauseSQLInput: Readonly<SQLInput> = buildGetWhereClause(tableName, tableAliasSuffix, args);

    const sql: string = `
        SELECT ${selectClauseSQLInput.sql}
        FROM ${tableName} ${tableName}_${tableAliasSuffix}
        ${joinClauseSQLInput.sql}
        WHERE ${whereClauseSQLInput.sql}
    `;

    return {
        sql,
        values: {
            ...selectClauseSQLInput.values,
            ...joinClauseSQLInput.values,
            ...whereClauseSQLInput.values
        },
        columnHashes: {
            ...selectClauseSQLInput.columnHashes
        }
    };
}

export function buildFindQuery(
    tableName: JOTableName,
    scalarNames: Array<string>,
    args: Readonly<JOGraphQLArgs>,
    info: Readonly<GraphQLResolveInfo>,
    variables: Readonly<GraphQLVariables>
): Readonly<SQLInput> {
    const tableAliasSuffix: string = psqluuid();
    
    if (
        info.operation.selectionSet.selections[0].kind !== 'Field' ||
        info.operation.selectionSet.selections[0].selectionSet?.selections[0].kind !== 'Field'
    ) {
        throw new Error(`buildFindQuery - the query seems to not be formatted correctly`);
    }

    const { selectClauseSQLInput, joinClauseSQLInput } = buildSelectAndJoinClause(
        variables,
        info.operation.selectionSet.selections[0].selectionSet?.selections[0].selectionSet?.selections || [],
        scalarNames,
        tableName,
        tableAliasSuffix,
        ''
    );
    const whereClauseSQLInput: Readonly<SQLInput> = buildFindWhereClause(tableName, `_${tableAliasSuffix}`, args);
    const mainOrderByClauseSQLInput: Readonly<SQLInput> = buildOrderByClause(tableName, args, scalarNames, `_${tableAliasSuffix}`);
    const secondaryOrderByClauseSQLInput: Readonly<SQLInput> = buildOrderByClause(tableName, args, scalarNames, `_${tableAliasSuffix}`);
    const limitClauseSQLInput: Readonly<SQLInput> = buildLimitClause(args, mainOrderByClauseSQLInput.sql);
    const offsetClauseSQLInput: Readonly<SQLInput> = buildOffsetClause(args, mainOrderByClauseSQLInput.sql);

    const sql: string = `
        SELECT ${selectClauseSQLInput.sql}
        FROM (
            SELECT * FROM ${tableName} ${tableName}_${tableAliasSuffix}
            ${whereClauseSQLInput.sql}
            ${mainOrderByClauseSQLInput.sql}
            ${limitClauseSQLInput.sql}
            ${offsetClauseSQLInput.sql}
        ) ${tableName}_${tableAliasSuffix}
        ${joinClauseSQLInput.sql}
        ${secondaryOrderByClauseSQLInput.sql}
    `;

    return {
        sql,
        values: {
            ...selectClauseSQLInput.values,
            ...joinClauseSQLInput.values,
            ...whereClauseSQLInput.values,
            ...mainOrderByClauseSQLInput.values,
            ...limitClauseSQLInput.values,
            ...offsetClauseSQLInput.values,
            ...secondaryOrderByClauseSQLInput.values
        },
        columnHashes: {
            ...selectClauseSQLInput.columnHashes
        }
    };
}

export function buildCreateQuery(
    tableName: JOTableName,
    typeName: JOObjectTypeName,
    scalarNames: Array<string>,
    args: Readonly<JOGraphQLArgs>
): Readonly<SQLInput> {
    const scalarInputKeys: Array<string> = Object.keys(args.input || {}).filter((key: string) => {
        const isScalar: boolean = scalarNames.includes(key);
        return isScalar;
    });
    const scalarInputKeysWithCreatedAtIfNecessary: Array<string> = addInputKeyIfNecessary('created_at', scalarInputKeys, scalarNames);
    const scalarInputKeysWithUpdatedAtIfNecessary: Array<string> = addInputKeyIfNecessary('updated_at', scalarInputKeysWithCreatedAtIfNecessary, scalarNames);
    const scalarInputKeysWithDefaultsResult = addDefaultKeysIfNecessary(scalarInputKeysWithUpdatedAtIfNecessary, typeName);

    const scalarInputValues: Array<any> = scalarInputKeys.map((key: string) => args.input[key]);
    const scalarInputValuesWithCreatedAtIfNecessary: Array<any> = addInputValueIfNecessary('created_at', new Date().toISOString(), scalarInputKeys, scalarInputValues, scalarNames);
    const scalarInputValuesWithUpdatedAtIfNecessary: Array<any> = addInputValueIfNecessary('updated_at', new Date().toISOString(), scalarInputKeys, scalarInputValuesWithCreatedAtIfNecessary, scalarNames);
    const scalarInputValuesWithDefaults: ReadonlyArray<any> = addDefaultValues(
        scalarInputKeysWithDefaultsResult.fieldDefinitionNodesWithDefaultValuesThatNeedToBeAdded,
        scalarInputValuesWithUpdatedAtIfNecessary
    );

    const scalarColumnNames: string = scalarInputKeysWithDefaultsResult.scalarInputKeysWithDefaults.map((key: string) => `"${key}"`).join(',');
    const scalarColumnValues: {
        [key: string]: any
    } = scalarInputValuesWithDefaults.reduce((result: {
        [key: string]: any
    }, value: any) => {
        return {
            ...result,
            [psqluuid()]: value
        };
    }, {});

    const dependentSQLCreator = (entityId: number) => {
        const relationConnectorQueries: ReadonlyArray<SQLInput> = buildRelationConnectorOrDisconnectorQueries(tableName, getScalarNamesForTypeName(typeName), args, entityId, 'CONNECTOR');
        const relationDisconnectorQueries: ReadonlyArray<SQLInput> = buildRelationConnectorOrDisconnectorQueries(tableName, getScalarNamesForTypeName(typeName), args, entityId, 'DISCONNECTOR');

        const nestedMutationQueries: ReadonlyArray<SQLInput> = buildNestedMutationQueries(
            tableName,
            typeName,
            getScalarNamesForTypeName(typeName),
            args,
            entityId
        );

        return [
            ...relationConnectorQueries,
            ...relationDisconnectorQueries,
            ...nestedMutationQueries
        ];
    };

    if (Object.keys(scalarColumnValues).length === 0) {
        return {
            sql: `INSERT INTO ${tableName} DEFAULT VALUES RETURNING id`,
            dependentSQLCreator
        }
    }
    else {
        return {
            sql: `INSERT INTO ${tableName} (${scalarColumnNames}) VALUES (${Object.keys(scalarColumnValues).map((columnValueKey: string) => `:${columnValueKey}`).join(',')}) RETURNING id`,
            values: {
                ...scalarColumnValues
            },
            dependentSQLCreator
        };
    }
}

export function buildUpdateQueries(
    tableName: JOTableName,
    typeName: JOObjectTypeName,
    scalarNames: Array<string>,
    args: Readonly<JOGraphQLArgs>,
    entityId: number
): ReadonlyArray<SQLInput> {
    const scalarInputKeys: Array<string> = Object.keys(args.input).filter((key: string) => {
        const isScalar: boolean = scalarNames.includes(key);
        return isScalar;
    });
    const scalarInputKeysWithUpdatedAtIfNecessary: Array<string> = addInputKeyIfNecessary('updated_at', scalarInputKeys, scalarNames);

    const scalarInputValues: Array<any> = scalarInputKeys.map((key: string) => args.input[key]);
    const scalarInputValuesWithUpdatedAtIfNecessary: Array<any> = addInputValueIfNecessary('updated_at', new Date().toISOString(), scalarInputKeys, scalarInputValues, scalarNames);

    const scalarColumnNames: string = scalarInputKeysWithUpdatedAtIfNecessary.map((key: string) => `"${key}"`).join(',');
    const scalarColumnValues: {
        [key: string]: any
    } = scalarInputValuesWithUpdatedAtIfNecessary.reduce((result: {
        [key: string]: any
    }, value: any) => {
        return {
            ...result,
            [psqluuid()]: value
        };
    }, {});

    const relationConnectorQueries: ReadonlyArray<SQLInput> = buildRelationConnectorOrDisconnectorQueries(tableName, scalarNames, args, entityId, 'CONNECTOR');
    const relationDisconnectorQueries: ReadonlyArray<SQLInput> = buildRelationConnectorOrDisconnectorQueries(tableName, scalarNames, args, entityId, 'DISCONNECTOR');

    const dependentSQLCreator = (entityId: number) => {
        const nestedMutationQueries: ReadonlyArray<SQLInput> = buildNestedMutationQueries(
            tableName,
            typeName,
            getScalarNamesForTypeName(typeName),
            args,
            entityId
        );

        return [
            ...nestedMutationQueries
        ];
    };

    const idName: string = psqluuid();

    return [{
            sql: buildSingleOrMultiValueUpdate(
                tableName,
                scalarColumnNames,
                scalarColumnValues,
                idName
            ),
            values: {
                ...scalarColumnValues,
                [idName]: args.input.id
            },
            dependentSQLCreator
        },
        ...relationConnectorQueries,
        ...relationDisconnectorQueries
    ];
}

export function buildUpsertQueries(
    tableName: JOTableName,
    typeName: JOObjectTypeName,
    scalarNames: Array<string>,
    args: Readonly<JOGraphQLArgs>
): ReadonlyArray<SQLInput> {
    if (
        args.input.id === null ||
        args.input.id === undefined
    ) {
        return [buildCreateQuery(
            tableName,
            typeName,
            scalarNames,
            args
        )];
    }
    else {
        return buildUpdateQueries(
            tableName,
            typeName,
            scalarNames,
            args,
            args.input.id
        );
    }
}

export function buildNestedMutationQueries(
    tableName: JOTableName,
    typeName: JOObjectTypeName,
    scalarNames: Array<string>,
    args: Readonly<JOGraphQLArgs>,
    entityId: number
): ReadonlyArray<SQLInput> {
    const nestedInputEntries: ReadonlyArray<[string, any]> = Object.entries(args.input || {}).reduce((result: ReadonlyArray<[string, any]>, inputEntry: [string, any]) => {
        const inputKey: string = inputEntry[0];
        const inputValue: any = inputEntry[1];

        const nestedInputEntries: ReadonlyArray<[string, any]> = Object.entries(inputValue).reduce((result: ReadonlyArray<[string, any]>, inputValueEntry: [string, any]) => {
            const inputValueKey: string = inputValueEntry[0];
            const inputValueValue: any = inputValueEntry[1];

            if (nestedOperationNames.includes(inputValueKey as NestedOperationName)) {
                const nestedInputEntry: any = [inputKey, {
                    [inputValueKey]: inputValueValue
                }];

                return [
                    ...result,
                    nestedInputEntry
                ];
            }
            else {
                return result;
            }
        }, []);

        return [
            ...result,
            ...nestedInputEntries
        ];
    }, []);

    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTypeName(documentNode, typeName);

    const nestedValuesAndObjectTypeNames: ReadonlyArray<{
        objectTypeName: JOObjectTypeName;
        inputKey: string;
        inputValue: any;
    }> = nestedInputEntries.map((inputEntry) => {
        const inputKey: string = inputEntry[0];
        const inputValue: any = inputEntry[1];

        const fieldDefinitionNode: Readonly<FieldDefinitionNode> | undefined = objectTypeDefinitionNode.fields?.find((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
            return fieldDefinitionNode.name.value === inputKey;
        });

        if (fieldDefinitionNode === undefined) {
            throw new Error(`No fieldDefinitionNode for input key ${inputKey}`);
        }

        const objectTypeName: JOObjectTypeName = getTypeNameFromTypeNode(fieldDefinitionNode.type) as JOObjectTypeName;

        return {
            objectTypeName,
            inputKey,
            inputValue
        };
    });

    const sqlInputsInputs = nestedValuesAndObjectTypeNames.map((valueAndObjectTypeName) => {

        const sqlBuilderConfig: Readonly<SQLBuilderConfig> | undefined = SQLBuilderConfigs[tableName];

        if (sqlBuilderConfig === undefined) {
            throw new Error(`buildRelationConnectorOrDisconnectorQueries: sqlBuilderConfig for table ${tableName} not found`);
        }

        const selectionConfig: Readonly<SelectionConfig> | undefined = sqlBuilderConfig[valueAndObjectTypeName.inputKey];

        if (selectionConfig === undefined) {
            throw new Error(`buildRelationConnectorOrDisconnectorQueries: selectionConfig for table ${tableName} and selection ${valueAndObjectTypeName.inputKey} not found`);
        }

        const relationGQLFieldName = selectionConfig.relationGQLFieldName;

        if (relationGQLFieldName === undefined) {
            throw new Error(`buildNestedMutationQueries: relationGQLFieldName for table ${tableName} and selection ${valueAndObjectTypeName.inputKey} not found`);
        }

        if (
            valueAndObjectTypeName.inputValue.create !== null &&
            valueAndObjectTypeName.inputValue.create !== undefined
        ) {
            const nestedCreateQuery: Readonly<SQLInput> = buildNestedCreateQuery(
                valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                valueAndObjectTypeName.objectTypeName,
                getScalarNamesForTypeName(valueAndObjectTypeName.objectTypeName),
                valueAndObjectTypeName.inputValue.create,
                relationGQLFieldName,
                entityId
            );

            return [nestedCreateQuery];
        }

        if (
            valueAndObjectTypeName.inputValue.createMany !== null &&
            valueAndObjectTypeName.inputValue.createMany !== undefined
        ) {
            return valueAndObjectTypeName.inputValue.createMany.map((input: Readonly<JOGraphQLArgs>) => {
                const nestedCreateQuery: Readonly<SQLInput> = buildNestedCreateQuery(
                    valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                    valueAndObjectTypeName.objectTypeName,
                    getScalarNamesForTypeName(valueAndObjectTypeName.objectTypeName),
                    input,
                    relationGQLFieldName,
                    entityId
                );
    
                return nestedCreateQuery;
            });
        }

        if (
            valueAndObjectTypeName.inputValue.update !== null &&
            valueAndObjectTypeName.inputValue.update !== undefined
        ) {
            const nestedUpdateQueries: ReadonlyArray<SQLInput> = buildNestedUpdateQueries(
                valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                valueAndObjectTypeName.objectTypeName,
                getScalarNamesForTypeName(valueAndObjectTypeName.objectTypeName),
                valueAndObjectTypeName.inputValue.update,
                entityId
            );

            return nestedUpdateQueries;
        }

        if (
            valueAndObjectTypeName.inputValue.updateMany !== null &&
            valueAndObjectTypeName.inputValue.updateMany !== undefined
        ) {
            return valueAndObjectTypeName.inputValue.updateMany.reduce((result: ReadonlyArray<SQLInput>, input: Readonly<JOGraphQLArgs>) => {
                const nestedUpdateQueries: ReadonlyArray<SQLInput> = buildNestedUpdateQueries(
                    valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                    valueAndObjectTypeName.objectTypeName,
                    getScalarNamesForTypeName(valueAndObjectTypeName.objectTypeName),
                    input,
                    entityId
                );
    
                return [
                    ...result,
                    ...nestedUpdateQueries
                ];
            }, []);
        }

        if (
            valueAndObjectTypeName.inputValue.upsert !== null &&
            valueAndObjectTypeName.inputValue.upsert !== undefined
        ) {
            const nestedUpsertQueries: ReadonlyArray<SQLInput> = buildNestedUpsertQueries(
                valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                valueAndObjectTypeName.objectTypeName,
                getScalarNamesForTypeName(valueAndObjectTypeName.objectTypeName),
                valueAndObjectTypeName.inputValue.upsert,
                relationGQLFieldName,
                entityId
            );

            return nestedUpsertQueries;
        }

        if (
            valueAndObjectTypeName.inputValue.upsertMany !== null &&
            valueAndObjectTypeName.inputValue.upsertMany !== undefined
        ) {
            return valueAndObjectTypeName.inputValue.upsertMany.reduce((result: ReadonlyArray<SQLInput>, input: Readonly<JOGraphQLArgs>) => {
                const nestedUpsertQueries: ReadonlyArray<SQLInput> = buildNestedUpsertQueries(
                    valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                    valueAndObjectTypeName.objectTypeName,
                    getScalarNamesForTypeName(valueAndObjectTypeName.objectTypeName),
                    input,
                    relationGQLFieldName,
                    entityId
                );
    
                return [
                    ...result,
                    ...nestedUpsertQueries
                ];
            }, []);
        }

        if (
            valueAndObjectTypeName.inputValue.delete !== null &&
            valueAndObjectTypeName.inputValue.delete !== undefined
        ) {
            const nestedDeleteQuery: Readonly<SQLInput> = buildDeleteQuery(
                valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                {
                    input: valueAndObjectTypeName.inputValue.delete
                }
            );

            return [nestedDeleteQuery];
        }

        if (
            valueAndObjectTypeName.inputValue.deleteMany !== null &&
            valueAndObjectTypeName.inputValue.deleteMany !== undefined
        ) {
            return valueAndObjectTypeName.inputValue.deleteMany.map((input: Readonly<JOGraphQLArgs>) => {
                const nestedDeleteQuery: Readonly<SQLInput> = buildDeleteQuery(
                    valueAndObjectTypeName.objectTypeName.toLowerCase() as JOTableName,
                    {
                        input
                    }
                );
    
                return nestedDeleteQuery;
            });
        }

        throw new Error(`valueAndObjectTypeName.inputValue does not have a supported nested input type`);
    });

    return sqlInputsInputs.reduce((result, sqlInputs) => {
        return [...result, ...sqlInputs];
    }, []);
}

function buildNestedCreateQuery(
    tableName: JOTableName,
    typeName: JOObjectTypeName,
    scalarNames: Array<string>,
    input: Readonly<JOGraphQLArgs>,
    relationGQLFieldName: string,
    entityId: number
): Readonly<SQLInput> {
    const createInputValueWithConnect = {
        input: {
            ...input,
            [relationGQLFieldName]: {
                connect: {
                    id: entityId
                }
            }
        }
    };

    const createQuery: Readonly<SQLInput> = buildCreateQuery(
        tableName,
        typeName,
        scalarNames,
        createInputValueWithConnect
    );

    return createQuery;
}

function buildNestedUpdateQueries(
    tableName: JOTableName,
    typeName: JOObjectTypeName,
    scalarNames: Array<string>,
    input: Readonly<JOGraphQLArgs>,
    entityId: number
): ReadonlyArray<SQLInput> {
    // TODO I believe this is where we would do the implicit connect on a single relation
    // TODO this would require a special input type just for single relation nested updates, to make the id optional
    const updateQueries: ReadonlyArray<SQLInput> = buildUpdateQueries(
        tableName,
        typeName,
        scalarNames,
        {
            input
        },
        entityId
    );

    return updateQueries;
}

function buildNestedUpsertQueries(
    tableName: JOTableName,
    typeName: JOObjectTypeName,
    scalarNames: Array<string>,
    input: Readonly<JOGraphQLArgs>,
    relationGQLFieldName: string,
    entityId: number
): ReadonlyArray<SQLInput> {
    if (
        input.id === null ||
        input.id === undefined
    ) {
        const {
            id,
            ...inputWithoutId
        } = input;

        const nestedCreateQuery: Readonly<SQLInput> = buildNestedCreateQuery(
            tableName,
            typeName,
            scalarNames,
            inputWithoutId,
            relationGQLFieldName,
            entityId
        );

        return [nestedCreateQuery];
    }
    else {
        const nestedUpdateQueries: ReadonlyArray<SQLInput> = buildNestedUpdateQueries(
            tableName,
            typeName,
            scalarNames,
            input,
            entityId
        );

        return nestedUpdateQueries;
    }
}

function addInputKeyIfNecessary(
    inputKey: string,
    scalarInputKeys: Array<string>,
    scalarNames: Array<string>
): Array<string> {
    if (
        scalarNames.includes(inputKey) &&
        !scalarInputKeys.includes(inputKey)
    ) {
        return [...scalarInputKeys, inputKey];
    }
    else {
        return scalarInputKeys;
    }
}

function addDefaultKeysIfNecessary(
    scalarInputKeys: Array<string>,
    typeName: JOObjectTypeName
): {
    readonly fieldDefinitionNodesWithDefaultValuesThatNeedToBeAdded: ReadonlyArray<FieldDefinitionNode>;
    readonly scalarInputKeysWithDefaults: ReadonlyArray<string>;
} {
    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTypeName(documentNode, typeName);
    const fieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> | undefined = objectTypeDefinitionNode.fields;

    if (fieldDefinitionNodes === undefined) {
        return {
            fieldDefinitionNodesWithDefaultValuesThatNeedToBeAdded: [],
            scalarInputKeysWithDefaults: scalarInputKeys
        };
    }

    const fieldDefinitionNodesWithDefaultValues: ReadonlyArray<FieldDefinitionNode> = fieldDefinitionNodes.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        return getDirectiveWithArgument(fieldDefinitionNode, 'db', 'default') !== undefined;
    });

    const fieldDefinitionNodesWithDefaultValuesThatNeedToBeAdded: ReadonlyArray<FieldDefinitionNode> = fieldDefinitionNodesWithDefaultValues.filter((fieldDefinitionNode) => {
        return scalarInputKeys.includes(fieldDefinitionNode.name.value) === false;
    });

    const fieldNamesWithDefaultValues: ReadonlyArray<string> = fieldDefinitionNodesWithDefaultValuesThatNeedToBeAdded.map((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        const customDBFieldName: string | undefined = getDirectiveArgumentValue(fieldDefinitionNode, 'db', 'field');

        if (customDBFieldName !== undefined) {
            return customDBFieldName;
        }

        return fieldDefinitionNode.name.value;
    });

    return {
        fieldDefinitionNodesWithDefaultValuesThatNeedToBeAdded,
        scalarInputKeysWithDefaults: [
            ...scalarInputKeys,
            ...fieldNamesWithDefaultValues
        ]
    };
}

function addInputValueIfNecessary(
    inputKey: string,
    inputValue: any,
    scalarInputKeys: Array<string>,
    scalarInputValues: Array<any>,
    scalarNames: Array<string>
): Array<any> {
    if (
        scalarNames.includes(inputKey) &&
        !scalarInputKeys.includes(inputKey)
    ) {
        return [...scalarInputValues, inputValue];
    }
    else {
        return scalarInputValues;
    }
}

function addDefaultValues(
    fieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode>,
    scalarInputValues: ReadonlyArray<any>
): ReadonlyArray<string | number | boolean> {
    return [
        ...scalarInputValues,
        ...fieldDefinitionNodes.map((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
            return getDirectiveArgumentValue(fieldDefinitionNode, 'db', 'default');
        })
    ];
}

function buildSingleOrMultiValueUpdate(
    tableName: string,
    columnNames: string,
    columnValues: {
        [key: string]: any;
    },
    idName: string
): string {
    if (Object.keys(columnValues).length === 1) {
        return `UPDATE ${tableName} SET ${columnNames} = :${Object.keys(columnValues)[0]} WHERE id = :${idName} RETURNING id`;
    }
    else {
        return `UPDATE ${tableName} SET (${columnNames}) = (${Object.keys(columnValues).map((columnValueKey: string) => `:${columnValueKey}`).join(',')}) WHERE id = :${idName} RETURNING id`;
    }
}

export function buildRelationConnectorOrDisconnectorQueries(
    tableName: JOTableName,
    scalarNames: Array<string>,
    args: Readonly<JOGraphQLArgs>,
    entityId: number,
    connectorOrDisconnector: 'CONNECTOR' | 'DISCONNECTOR'
): ReadonlyArray<SQLInput> {
    const relationInputEntries: ReadonlyArray<[string, RelationInput]> = Object.entries<RelationInput>(args.input || {}).filter((entry: [string, RelationInput]) => {
        const isRelation: boolean = !scalarNames.includes(entry[0]);

        const relationInput: Readonly<RelationInput> = entry[1];

        const isConnectorOrDisconnector: boolean = (
            (
                connectorOrDisconnector === 'CONNECTOR' &&
                relationInput.connect !== null &&
                relationInput.connect !== undefined &&
                (
                    (
                        relationInput.connect.id !== null &&
                        relationInput.connect.id !== undefined
                    ) ||
                    (
                        relationInput.connect.ids !== null &&
                        relationInput.connect.ids !== undefined
                    )
                )
            ) ||
            (
                connectorOrDisconnector === 'DISCONNECTOR' &&
                relationInput.disconnect !== null &&
                relationInput.disconnect !== undefined &&
                (
                    (
                        relationInput.disconnect.id !== null &&
                        relationInput.disconnect.id !== undefined
                    ) ||
                    (
                        relationInput.disconnect.ids !== null &&
                        relationInput.disconnect.ids !== undefined
                    )
                )
            )
        );

        return isRelation && isConnectorOrDisconnector;
    });

    const unflattenedSQLInputs: ReadonlyArray<ReadonlyArray<SQLInput>> = relationInputEntries.map((entry: [string, RelationInput]) => {
    
        const sqlBuilderConfig: Readonly<SQLBuilderConfig> | undefined = SQLBuilderConfigs[tableName];

        if (sqlBuilderConfig === undefined) {
            throw new Error(`buildRelationConnectorOrDisconnectorQueries: sqlBuilderConfig for table ${tableName} not found`);
        }

        const selectionSetName: string = entry[0];

        const selectionConfig: Readonly<SelectionConfig> | undefined = sqlBuilderConfig[selectionSetName];

        if (selectionConfig === undefined) {
            throw new Error(`buildRelationConnectorOrDisconnectorQueries: selectionConfig for table ${tableName} and selection ${selectionSetName} not found`);
        }

        if (connectorOrDisconnector === 'CONNECTOR') {
            return createRelationConnectorOrDisconnectorQueries(selectionConfig, 'CONNECT', entityId, entry[1].connect!);
        }
        else {
            return createRelationConnectorOrDisconnectorQueries(selectionConfig, 'DISCONNECT', entityId, entry[1].disconnect!);
        }
    });

    const sqlInputs: ReadonlyArray<SQLInput> = unflattenedSQLInputs.reduce((result: ReadonlyArray<SQLInput>, sqlInputs: ReadonlyArray<SQLInput>) => {
        return [...result, ...sqlInputs];
    }, []);

    return sqlInputs;
}

export function buildDeleteQuery(tableName: JOTableName, args: Readonly<JOGraphQLArgs>): Readonly<SQLInput> {
    const idName: string = psqluuid();

    return {
        sql: `DELETE FROM ${tableName} WHERE id = :${idName} RETURNING id`,
        values: {
            [idName]: args.input.id
        }
    };
}

export function buildSelectAndJoinClause(
    variables: Readonly<GraphQLVariables>,
    selections: ReadonlyArray<SelectionNode>,
    scalarNames: Array<string>,
    tableName: JOTableName,
    tableAliasSuffix: string,
    jsonAliasPrefix: string
): {
    readonly selectClauseSQLInput: Readonly<SQLInput>;
    readonly joinClauseSQLInput: Readonly<SQLInput>;
} {
    const nodeSelections: ReadonlyArray<FieldNode | InlineFragmentNode> = selections.filter((selection: Readonly<SelectionNode>): selection is Readonly<FieldNode | InlineFragmentNode> => selection.kind === 'Field' || selection.kind === 'InlineFragment');

    const selectAndJoinClauseSQLInputs: ReadonlyArray<{
        readonly selectClauseSQLInput: Readonly<SQLInput>,
        readonly joinClauseSQLInput: Readonly<SQLInput>    
    }> = nodeSelections.filter((selection: Readonly<FieldNode | InlineFragmentNode>) => {
        if (selection.kind === 'Field') {
            const selectionSetName: string = selection.name.value;

            // TODO we should be able to do this now with @db(ignore: true) very easily
            // TODO this is very hacky, we should create a GraphQL schema directive that allows fields to be ignored here if they are not meant of the database
            if (selectionSetName === 'stripe_invoice') {
                return false;
            }
            else {
                return true;
            }
        }
        else {
            return true;
        }
    }).map((selection: Readonly<FieldNode | InlineFragmentNode>) => {

        if (selection.kind === 'Field') {
            const selectionSetName: string = selection.name.value;
            const isScalar: boolean = scalarNames.includes(selectionSetName);
    
            if (isScalar) {

                const columnAlias: string = `${jsonAliasPrefix}${selectionSetName}`;
                const columnHash: string = createColumnHash(columnAlias);

                return {
                    selectClauseSQLInput: {
                        sql: `${tableName}_${tableAliasSuffix}.${selectionSetName} AS "${columnHash}"`,
                        values: {},
                        columnHashes: {
                            [columnHash]: columnAlias
                        }
                    },
                    joinClauseSQLInput: {
                        sql: '',
                        values: {}
                    }
                };
            }
            else {
                const relationSelectAndJoinClauseSQLInput: Readonly<{
                    readonly selectClauseSQLInput: Readonly<SQLInput>;
                    readonly joinClauseSQLInput: Readonly<SQLInput>;            
                }> = buildRelationSelectAndJoinClause(scalarNames, variables, tableName, selection, selectionSetName, tableAliasSuffix, jsonAliasPrefix);
    
                return relationSelectAndJoinClauseSQLInput;
            }
        }
        else {
            return buildSelectAndJoinClause(variables, selection.selectionSet.selections, scalarNames, tableName, tableAliasSuffix, jsonAliasPrefix);
        }
    });

    const selectClauseSQLInputs: ReadonlyArray<SQLInput> = selectAndJoinClauseSQLInputs.map((selectAndJoinClauseSQLInput: Readonly<{
        readonly selectClauseSQLInput: Readonly<SQLInput>,
        readonly joinClauseSQLInput: Readonly<SQLInput>    
    }>) => {
        return selectAndJoinClauseSQLInput.selectClauseSQLInput;
    });

    const joinClauseSQLInputs: ReadonlyArray<SQLInput> = selectAndJoinClauseSQLInputs.map((selectAndJoinClauseSQLInput: Readonly<{
        readonly selectClauseSQLInput: Readonly<SQLInput>,
        readonly joinClauseSQLInput: Readonly<SQLInput>    
    }>) => {
        return selectAndJoinClauseSQLInput.joinClauseSQLInput;
    });

    const selectClauseSQLInput: Readonly<SQLInput> = combineSQLInputs(selectClauseSQLInputs, ',\n');
    const joinClauseSQLInput: Readonly<SQLInput> = combineSQLInputs(joinClauseSQLInputs);

    return {
        selectClauseSQLInput,
        joinClauseSQLInput
    };
}

function buildRelationSelectAndJoinClause(
    scalarNames: Array<string>,
    variables: Readonly<GraphQLVariables>,
    tableName: JOTableName,
    selection: Readonly<FieldNode>,
    selectionSetName: string,
    tableAliasSuffix: string,
    jsonAliasPrefix: string
): Readonly<{
    readonly selectClauseSQLInput: Readonly<SQLInput>;
    readonly joinClauseSQLInput: Readonly<SQLInput>;
}> {
    const sqlBuilderConfig: Readonly<SQLBuilderConfig> | undefined = SQLBuilderConfigs[tableName];

    if (sqlBuilderConfig === undefined) {
        throw new Error(`SQLBuilderConfig for table ${tableName} not found`);
    }

    return getSelectAndJoinClause(
        sqlBuilderConfig,
        variables,
        selection,
        selectionSetName,
        tableAliasSuffix,
        jsonAliasPrefix
    );
}

function getSelectAndJoinClause(
    sqlBuilderConfig: Readonly<SQLBuilderConfig>,
    variables: Readonly<GraphQLVariables>,
    selection: Readonly<FieldNode>,
    selectionSetName: string,
    tableAliasSuffix: string,
    jsonAliasPrefix: string
): Readonly<{
    readonly selectClauseSQLInput: Readonly<SQLInput>;
    readonly joinClauseSQLInput: Readonly<SQLInput>;
}> {
    const relationTableAliasSuffix: string = psqluuid();

    const relationSelectAndJoinClauseInfo: Readonly<SelectAndJoinClauseInfo> = createSelectAndJoinClauseInfo(
        sqlBuilderConfig,
        variables,
        selection,
        selectionSetName,
        relationTableAliasSuffix,
        tableAliasSuffix,
        jsonAliasPrefix
    );

    const joinClauseSQLInput: Readonly<SQLInput> = {
        sql: `
            LEFT JOIN LATERAL (
                SELECT *
                FROM (${relationSelectAndJoinClauseInfo.joinSQLInput.sql})
                ${relationSelectAndJoinClauseInfo.tableName}_${relationTableAliasSuffix}
            ) ${relationSelectAndJoinClauseInfo.tableName}_${relationTableAliasSuffix} ON true
        `,
        values: {
            ...relationSelectAndJoinClauseInfo.joinSQLInput.values
        }
    };

    return {
        selectClauseSQLInput: {
            sql: `${relationSelectAndJoinClauseInfo.tableName}_${relationTableAliasSuffix}.*`,
            columnHashes: {
                ...relationSelectAndJoinClauseInfo.joinSQLInput.columnHashes
            }
        },
        joinClauseSQLInput
    };
}

export function buildGetWhereClause(tableName: JOTableName, tableAliasSuffix: string, args: Readonly<JOGraphQLArgs>): Readonly<SQLInput> {
    const identifier: string = psqluuid();
    return {
        sql: `${tableName}_${tableAliasSuffix}.id = :${identifier}`,
        values: {
            [identifier]: args.id
        }
    };
}

export function buildFindWhereClause(tableName: JOTableName, tableAliasSuffix: string, args: Readonly<JOGraphQLArgs>): Readonly<SQLInput> {
    if (args.filter === undefined) {
        return {
            sql: '',
            values: {}
        };
    }

    const filterConditionalExpressionSQLInput: Readonly<SQLInput> = buildFilterConditionalExpression(tableName, tableAliasSuffix, args.filter, 'AND');

    return {
        ...filterConditionalExpressionSQLInput,
        sql: `WHERE ${filterConditionalExpressionSQLInput.sql}`
    };
}

export function buildOrderByClause(
    tableName: JOTableName,
    args: Readonly<JOGraphQLArgs>,
    scalarNames: Array<string>,
    tableAliasSuffix: string = ''
): Readonly<SQLInput> {

    if (args.orderBy === undefined) {
        return {
            sql: '',
            values: {}
        };
    }

    if (
        !scalarNames.includes(args.orderBy.field) ||
        !['ASC', 'DESC'].includes(args.orderBy.order)
    ) {
        throw new Error(`Field '${args.orderBy.field}' is not a scalar`);
    }

    if (args.orderBy.in === undefined) {
        return {
            sql: `ORDER BY ${tableName}${tableAliasSuffix}.${args.orderBy.field} ${args.orderBy.order}`
        };
    }
    else {
        const inPsqluuid: string = psqluuid();

        // TODO I am not sure why I have to coerce the ARRAY with ::int[]...the values should be numbers, and when I was
        // TODO interpolating directly args.orderBy.in everything worked fine
        return {
            sql: `ORDER BY array_position(ARRAY[${args.orderBy.in.map((_: number, index: number) => `:${inPsqluuid}_${index}`).join(',')}]::int[], ${tableName}${tableAliasSuffix}.${args.orderBy.field})`,
            values: {
                ...args.orderBy.in.reduce((result: {
                    [key: string]: number;
                }, value: number, index: number) => {
                    return {
                        ...result,
                        [`${inPsqluuid}_${index}`]: value
                    };
                }, {})
            }
        };
    }
}

export function buildLimitClause(args: Readonly<JOGraphQLArgs>, orderByClauseSQL: string): Readonly<SQLInput> {
    
    if (
        args.page === undefined ||
        args.page.limit === undefined
    ) {
        return {
            sql: '',
            values: {}
        };
    }

    if (orderByClauseSQL === '') {
        throw new Error('page cannot have limit without orderBy');
    }


    const identifier: string = psqluuid();

    return {
        sql: `LIMIT :${identifier}`,
        values: {
            [identifier]: args.page.limit
        }
    };
}

export function buildOffsetClause(args: Readonly<JOGraphQLArgs>, orderByClauseSQL: string): Readonly<SQLInput> {

    if (
        args.page === undefined ||
        args.page.offset === undefined
    ) {
        return {
            sql: '',
            values: {}
        };
    }

    if (orderByClauseSQL === '') {
        throw new Error('page cannot have offset without orderBy');
    }

    const identifier: string = psqluuid();

    return {
        sql: `OFFSET :${identifier}`,
        values: {
            [identifier]: args.page.offset
        }
    };
}

export function buildSelectionFilterJoinClause(
    tableName: JOTableName,
    tableAliasSuffix: string,
    selection: Readonly<FieldNode>,
    variables: Readonly<GraphQLVariables>
): Readonly<SQLInput> {
    
    const filterArg: Readonly<ArgumentNode> | undefined = selection.arguments?.find((argument: Readonly<ArgumentNode>) => {
        return argument.name.value === 'filter';
    });

    if (
        filterArg === undefined ||
        filterArg.value.kind !== 'ObjectValue'
    ) {
        return {
            sql: ''
        };
    }

    const filter: {
        [key: string]: Readonly<JOGraphQLFilter> | ReadonlyArray<JOGraphQLFilter>;
    } = valueFromObjectValueNode(filterArg.value, variables);

    return buildFilterConditionalExpression(tableName, tableAliasSuffix, filter, 'AND');
}

export function buildSelectionLimitClause(
    selection: Readonly<FieldNode>,
    variables: Readonly<GraphQLVariables>,
    selectionOrderByClauseSQL: string
): Readonly<SQLInput> {
    const pageArg: Readonly<ArgumentNode> | undefined = selection.arguments?.find((argument: Readonly<ArgumentNode>) => {
        return argument.name.value === 'page';
    });

    if (
        pageArg === undefined ||
        pageArg.value.kind !== 'ObjectValue'
    ) {
        return {
            sql: '',
            values: {}
        };
    }

    const page: Readonly<PageRequest> = valueFromObjectValueNode(pageArg.value, variables) as Readonly<PageRequest>;

    return buildLimitClause({
        page
    }, selectionOrderByClauseSQL);
}

export function buildSelectionOffsetClause(
    selection: Readonly<FieldNode>,
    variables: Readonly<GraphQLVariables>,
    selectionOrderByClauseSQL: string
): Readonly<SQLInput> {
    const pageArg: Readonly<ArgumentNode> | undefined = selection.arguments?.find((argument: Readonly<ArgumentNode>) => {
        return argument.name.value === 'page';
    });

    if (
        pageArg === undefined ||
        pageArg.value.kind !== 'ObjectValue'
    ) {
        return {
            sql: '',
            values: {}
        };
    }

    const page: Readonly<PageRequest> = valueFromObjectValueNode(pageArg.value, variables) as Readonly<PageRequest>;

    return buildOffsetClause({
        page
    }, selectionOrderByClauseSQL);
}

export function buildSelectionOrderByClause(
    tableName: JOTableName,
    tableAliasSuffix: string,
    scalarNames: Array<string>,
    selection: Readonly<FieldNode>,
    variables: Readonly<GraphQLVariables>
): Readonly<SQLInput> {
    const orderByArg: Readonly<ArgumentNode> | undefined = selection.arguments?.find((argument: Readonly<ArgumentNode>) => {
        return argument.name.value === 'orderBy';
    });

    if (
        orderByArg === undefined ||
        orderByArg.value.kind !== 'ObjectValue'
    ) {
        return {
            sql: '',
            values: {}
        };
    }

    const orderBy: Readonly<OrderByInput> = valueFromObjectValueNode(orderByArg.value, variables) as Readonly<OrderByInput>;

    return buildOrderByClause(tableName, {
        orderBy
    }, scalarNames, tableAliasSuffix);
}

// TODO what if it is not meant to be an object at the top level, but an array?
function valueFromObjectValueNode(objectValueNode: Readonly<ObjectValueNode>, variables: Readonly<GraphQLVariables>): {
    [key: string]: any;
} {
    return objectValueNode.fields.reduce((result, field: Readonly<ObjectFieldNode>) => {
        return {
            ...result,
            [field.name.value]: valueFromValueNode(field.value, variables)
        };
    }, {});
}

function valueFromValueNode(valueNode: Readonly<ValueNode>, variables: Readonly<GraphQLVariables>): any {
        if (valueNode.kind === 'BooleanValue') {
            return valueNode.value;
        }

        if (valueNode.kind === 'EnumValue') {
            return valueNode.value;
        }

        if (valueNode.kind === 'FloatValue') {
            return parseFloat(valueNode.value);
        }

        if (valueNode.kind === 'IntValue') {
            return parseInt(valueNode.value);
        }

        if (valueNode.kind === 'ListValue') {
            return valueNode.values.map((valueNode: Readonly<ValueNode>) => {
                return valueFromValueNode(valueNode, variables);
            });
        }

        if (valueNode.kind === 'NullValue') {
            return null;
        }

        if (valueNode.kind === 'ObjectValue') {
            return valueFromObjectValueNode(valueNode, variables)
        }

        if (valueNode.kind === 'StringValue') {
            return valueNode.value;
        }

        if (valueNode.kind === 'Variable') {
            return variables[valueNode.name.value];
        }
}

// TODO it would be nice to allow multiple filters per field...right now we only allow one per field
// TODO this causes us to have to use the and: [] or or: [] syntax whenever we have multiple values to filter by per field
function buildFilterConditionalExpression(
    tableName: JOTableName,
    tableAliasSuffix: string,
    filter: {
        [key: string]: Readonly<JOGraphQLFilter> | ReadonlyArray<JOGraphQLFilter>;
    },
    thePrefix: 'AND' | ''
): Readonly<SQLInput> {

    const sqlInputs: ReadonlyArray<SQLInput> = Object.entries(filter).map((entry: [string, Readonly<JOGraphQLFilter> | ReadonlyArray<JOGraphQLFilter>], index: number) => {
        const prefix: string = index === 0 ? '' : thePrefix;

        const key: string = entry[0];
        const value: Readonly<JOGraphQLFilter> | ReadonlyArray<JOGraphQLFilter> = entry[1];

        // TODO it would be nice to allow multiple filters per field...right now we only allow one per field, the first key returned from Object.keys(value)
        // TODO this causes us to have to use the and: [] or or: [] syntax whenever we have multiple values to filter by per field
        const valueKeys: Array<keyof JOGraphQLFilter> = Object.keys(value) as Array<keyof JOGraphQLFilter>;

        if (valueKeys.includes('ne')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            if (value.ne === null) {
                return {
                    sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} IS NOT NULL\n`
                }
            }
            else {
                return {
                    sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} != :${identifier}\n`,
                    values: {
                        [identifier]: value.ne
                    }
                };
            }
        }

        if (valueKeys.includes('eq')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            if (value.eq === null) {
                return {
                    sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} IS NULL\n`
                };
            }
            else {
                return {
                    sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} = :${identifier}\n`,
                    values: {
                        [identifier]: value.eq
                    }
                };
            }
        }

        if (valueKeys.includes('le')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} <= :${identifier}\n`,
                values: {
                    [identifier]: value.le
                }
            };
        }

        if (valueKeys.includes('lt')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} < :${identifier}\n`,
                values: {
                    [identifier]: value.lt
                }
            };
        }

        if (valueKeys.includes('ge')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} >= :${identifier}\n`,
                values: {
                    [identifier]: value.ge
                }
            };
        }

        if (valueKeys.includes('gt')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} > :${identifier}\n`,
                values: {
                    [identifier]: value.gt
                }
            };
        }

        if (valueKeys.includes('in')) {

            isJOGraphQLFilter(value);

            const inValues = value.in.reduce((result: any, inValue: any) => {
                return {
                    ...result,
                    [psqluuid()]: inValue
                };
            }, {});

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} in (${value.in.length === 0 ? 'NULL' : Object.keys(inValues).map((inValueKey) => `:${inValueKey}`).join(',')})\n`,
                values: {
                    ...inValues
                }
            };
        }

        if (valueKeys.includes('contains')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} LIKE :${identifier}\n`,
                values: {
                    [identifier]: `%${value.contains}%`
                }
            };
        }

        if (valueKeys.includes('startsWith')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} LIKE :${identifier}\n`,
                values: {
                    [identifier]: `${value.startsWith}%`
                }
            };
        }

        if (valueKeys.includes('endsWith')) {
            const identifier: string = psqluuid();

            isJOGraphQLFilter(value);

            return {
                sql: `${prefix} ${tableName}${tableAliasSuffix}.${key} LIKE :${identifier}\n`,
                values: {
                    [identifier]: `%${value.endsWith}`
                }
            };
        }

        if (key === 'and') {
            isJOGraphQLFilterArray(value);

            const sqlInputs: ReadonlyArray<SQLInput> = value.map((valueValue: any, index: number) => {
                const sqlInput: Readonly<SQLInput> = buildFilterConditionalExpression(tableName, tableAliasSuffix, valueValue, '');
                const andPrefix: 'AND' | '' = index === 0 ? '' : 'AND';

                return {
                    sql: `${andPrefix} ${sqlInput.sql}`,
                    values: sqlInput.values
                };
            });

            const sqlInput: Readonly<SQLInput> = combineSQLInputs(sqlInputs);

            return {
                sql: `${prefix} ${sqlInput.sql}`,
                values: sqlInput.values
            };
        }

        if (key === 'or') {
            isJOGraphQLFilterArray(value);

            const sqlInputs: ReadonlyArray<SQLInput> = value.map((valueValue: any, index: number) => {
                const sqlInput: Readonly<SQLInput> = buildFilterConditionalExpression(tableName, tableAliasSuffix, valueValue, '');
                const orPrefix: string = index === 0 ? '' : 'OR';
                
                return {
                    sql: `${orPrefix} ${sqlInput.sql}`,
                    values: sqlInput.values
                };
            });

            const sqlInput: Readonly<SQLInput> = combineSQLInputs(sqlInputs);

            return {
                sql: `${prefix} (${sqlInput.sql})`,
                values: sqlInput.values
            };
        }

        throw new Error(`filter ${key} not supported`);
    });

    const sqlInput: Readonly<SQLInput> = combineSQLInputs(sqlInputs);

    return sqlInput;
}

export function combineSQLInputs(sqlInputs: ReadonlyArray<SQLInput>, delimiter: string = ''): Readonly<SQLInput> {
    const sqlInput: Readonly<SQLInput> = {
        sql: sqlInputs.map((sqlInput: Readonly<SQLInput>) => sqlInput.sql).join(delimiter),
        values: sqlInputs.reduce((result, sqlInput: Readonly<SQLInput>) => {
            return {
                ...result,
                ...sqlInput.values
            };
        }, {}),
        columnHashes: sqlInputs.reduce((result, sqlInput: Readonly<SQLInput>) => {
            return {
                ...result,
                ...sqlInput.columnHashes
            };
        }, {})
    };

    return sqlInput;
}

export function psqluuid(): string {
    return `psqluuid_${uuid().replace(/-/g, '')}`;
}

export function isJOGraphQLFilter(filter: Readonly<JOGraphQLFilter> | ReadonlyArray<JOGraphQLFilter>): asserts filter is Readonly<JOGraphQLFilter> {}
export function isJOGraphQLFilterArray(filter: Readonly<JOGraphQLFilter> | ReadonlyArray<JOGraphQLFilter>): asserts filter is ReadonlyArray<JOGraphQLFilter> {}

export function createBaseCRUDResolvers(
    type: 'create' | 'get' | 'find' | 'update' | 'delete' | 'deleteMany',
    baseSQLFunction: BaseSQLFunction
 ): Readonly<JOGraphQLResolvers> {
    const model: string = fs.readFileSync('./graphql/schema.graphql').toString();
    const documentNode: Readonly<DocumentNode> = parse(model);

    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(documentNode.definitions);
    
    return modelObjectTypeDefinitionNodes.reduce((result: any, objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => {
        const resolverName: string = `${type}${objectTypeDefinitionNode.name.value}`;
        return {
            ...result,
            [resolverName]: (
                parent: any,
                args: Readonly<JOGraphQLArgs>,
                context: Readonly<JOContext>,
                info: Readonly<GraphQLResolveInfo>
            ) => {
                return baseSQLFunction(
                    objectTypeDefinitionNode.name.value as JOObjectTypeName,
                    objectTypeDefinitionNode.name.value.toLowerCase() as JOTableName,
                    args,
                    context,
                    info
                );
            }
        };
    }, {});
}

export function createDerivedCRUDResolvers(
    type: 'createMany' | 'updateMany' | 'upsert' | 'upsertMany' | 'deleteMany',
    derivedSQLFunction: DerivedSQLFunction
 ): Readonly<JOGraphQLResolvers> {
    const model: string = fs.readFileSync('./graphql/schema.graphql').toString();
    const documentNode: Readonly<DocumentNode> = parse(model);

    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(documentNode.definitions);
    
    return modelObjectTypeDefinitionNodes.reduce((result: any, objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => {
        const resolverName: string = `${type}${objectTypeDefinitionNode.name.value}`;
        return {
            ...result,
            [resolverName]: (
                parent: any,
                args: Readonly<JOGraphQLArgs>,
                context: Readonly<JOContext>,
                info: Readonly<GraphQLResolveInfo>
            ) => {
                return derivedSQLFunction(
                    resolverName,
                    args,
                    context,
                    info
                );
            }
        };
    }, {});
}

function createRelationConnectorOrDisconnectorQueries(
    selectionConfig: Readonly<SelectionConfig>,
    connectOrDisconnect: 'CONNECT' | 'DISCONNECT',
    entityId: number,
    relationIDInput: Readonly<RelationIDInput>
): ReadonlyArray<SQLInput> {
    if (
        selectionConfig.type === 'ONE_TO_MANY' ||
        selectionConfig.type === 'MANY_TO_MANY'
    ) {
        if (
            relationIDInput.id !== undefined &&
            relationIDInput.id !== null
        ) {
            const entityIdPsqlUuid: string = psqluuid();
            const relationIdPsqlUuid: string = psqluuid();        
            return [{
                sql: connectOrDisconnect === 'CONNECT' ? createConnectorSQLFromConfig(selectionConfig, entityIdPsqlUuid, relationIdPsqlUuid) : createDisconnectorSQLFromConfig(selectionConfig, entityIdPsqlUuid, relationIdPsqlUuid),
                values: {
                    [entityIdPsqlUuid]: entityId,
                    [relationIdPsqlUuid]: relationIDInput.id
                }
            }];
        }
        else if (
            relationIDInput.ids !== undefined &&
            relationIDInput.ids !== null
        ) {
            return relationIDInput.ids.map((id: number) => {
                const entityIdPsqlUuid: string = psqluuid();
                const relationIdPsqlUuid: string = psqluuid();            
                return {
                    sql: connectOrDisconnect === 'CONNECT' ? createConnectorSQLFromConfig(selectionConfig, entityIdPsqlUuid, relationIdPsqlUuid) : createDisconnectorSQLFromConfig(selectionConfig, entityIdPsqlUuid, relationIdPsqlUuid),
                    values: {
                        [entityIdPsqlUuid]: entityId,
                        [relationIdPsqlUuid]: id
                    }
                };
            });
        }
        else {
            throw new Error(`createRelationConnectorOrDisconnectorQueries: relationIDInput for ${selectionConfig.relationTableName} on ${selectionConfig.entityTableName} has no id nor ids properties`);
        }
    }

    if (selectionConfig.type === 'MANY_TO_ONE') {
        const entityIdPsqlUuid: string = psqluuid();
        const relationIdPsqlUuid: string = psqluuid();        
        return [{
            sql: connectOrDisconnect === 'CONNECT' ? createConnectorSQLFromConfig(selectionConfig, entityIdPsqlUuid, relationIdPsqlUuid) : createDisconnectorSQLFromConfig(selectionConfig, entityIdPsqlUuid, relationIdPsqlUuid),
            values: {
                [entityIdPsqlUuid]: entityId,
                [relationIdPsqlUuid]: relationIDInput.id,
            }
        }];
    }

    if (selectionConfig.type === 'ONE_TO_ONE') {
        const entityIdPsqlUuid: string = psqluuid();
        const relationIdPsqlUuid: string = psqluuid();
        return [{
            sql: `UPDATE ${selectionConfig.entityTableName} SET "${selectionConfig.entityKey}" = ${connectOrDisconnect === 'CONNECT' ? `:${relationIdPsqlUuid}` : 'NULL'} WHERE id = :${entityIdPsqlUuid} RETURNING id`,
            values: {
                [entityIdPsqlUuid]: entityId,
                [relationIdPsqlUuid]: relationIDInput.id
            }
        }, {
            sql: `UPDATE ${selectionConfig.relationTableName} SET "${selectionConfig.relationKey}" = ${connectOrDisconnect === 'CONNECT' ? `:${entityIdPsqlUuid}` : 'NULL'} WHERE id = :${relationIdPsqlUuid} RETURNING id`,
            values: {
                [entityIdPsqlUuid]: entityId,
                [relationIdPsqlUuid]: relationIDInput.id
            }
        }];
    }

    throw new Error(`createRelationConnectorOrDisconnectorQueries: type ${selectionConfig.type} not supported for relation ${selectionConfig.relationTableName} on ${selectionConfig.entityTableName}`);
}

function createConnectorSQLFromConfig(
    selectionConfig: Readonly<SelectionConfig>,
    entityIdPsqlUuid: string,
    relationIdPsqlUuid: string
): string {
    if (selectionConfig.type === 'ONE_TO_MANY') {
        return `UPDATE ${selectionConfig.relationTableName} SET "${selectionConfig.relationKey}" = :${entityIdPsqlUuid} WHERE id = :${relationIdPsqlUuid} RETURNING id`;
    }

    if (selectionConfig.type === 'MANY_TO_ONE') {
        return `UPDATE ${selectionConfig.entityTableName} SET "${selectionConfig.entityKey}" = :${relationIdPsqlUuid} WHERE id = :${entityIdPsqlUuid} RETURNING id`;
    }

    if (selectionConfig.type === 'MANY_TO_MANY') {
        return `INSERT INTO ${selectionConfig.joinTableName} ("${selectionConfig.entityKey}", "${selectionConfig.relationKey}") VALUES (:${relationIdPsqlUuid}, :${entityIdPsqlUuid}) RETURNING ${selectionConfig.entityKey}`;
    }

    throw new Error(`createConnectorSQLFromConfig: type ${selectionConfig.type} not supported for relation ${selectionConfig.relationTableName} on ${selectionConfig.entityTableName}`);
}

function createDisconnectorSQLFromConfig(
    selectionConfig: Readonly<SelectionConfig>,
    entityIdPsqlUuid: string,
    relationIdPsqlUuid: string
): string {
    if (selectionConfig.type === 'ONE_TO_MANY') {
        return `UPDATE ${selectionConfig.relationTableName} SET "${selectionConfig.relationKey}" = NULL WHERE id = :${relationIdPsqlUuid}`;
    }

    if (selectionConfig.type === 'MANY_TO_ONE') {
        return `UPDATE ${selectionConfig.entityTableName} SET "${selectionConfig.relationKey}" = NULL WHERE id = :${entityIdPsqlUuid}`;
    }

    if (selectionConfig.type === 'MANY_TO_MANY') {
        return `DELETE FROM ${selectionConfig.joinTableName} WHERE "${selectionConfig.entityKey}" = :${relationIdPsqlUuid} AND "${selectionConfig.relationKey}" = :${entityIdPsqlUuid}`;
    }

    throw new Error(`createDisconnectorSQLFromConfig: type ${selectionConfig.type} not supported for relation ${selectionConfig.relationTableName} on ${selectionConfig.entityTableName}`);
}

function createSelectAndJoinClauseInfo(
    sqlBuilderConfig: Readonly<SQLBuilderConfig>,
    variables: Readonly<GraphQLVariables>,
    selection: Readonly<FieldNode>,
    selectionSetName: string,
    relationTableAliasSuffix: string,
    tableAliasSuffix: string,
    jsonAliasPrefix: string
): Readonly<SelectAndJoinClauseInfo> {
    const selectionConfig: Readonly<SelectionConfig> | undefined = sqlBuilderConfig[selectionSetName];

    if (selectionConfig === undefined) {
        throw new Error(`createSelectAndJoinClauseInfo: selectionConfig for selection ${selectionSetName} not found`);
    }

    if (selectionConfig.type === 'ONE_TO_MANY') {
        const tableName: JOTableName = selectionConfig.relationTableName;
        const typeName: JOObjectTypeName = selectionConfig.relationTypeName;
        const newJSONAliasPrefix: string = `${jsonAliasPrefix}+${selectionSetName}.`;
        const scalarNames: Array<string> = getScalarNamesForTypeName(typeName);

        const selectAndJoinClauseSQLInput = buildSelectAndJoinClause(
            variables,
            selection.selectionSet?.selections || [],
            scalarNames,
            tableName,
            relationTableAliasSuffix,
            newJSONAliasPrefix
        );

        const selectionFilterJoinClauseSQLInput: Readonly<SQLInput> = buildSelectionFilterJoinClause(tableName,  `_${relationTableAliasSuffix}`,selection, variables);
        const selectionFilterJoinClausePrefix: 'AND' | '' = selectionFilterJoinClauseSQLInput.sql === '' ? '' : 'AND';
        const selectionOrderByClauseSQLInput: Readonly<SQLInput> = buildSelectionOrderByClause(tableName, `_${relationTableAliasSuffix}`, scalarNames, selection, variables);
        const selectionLimitClauseSQLInput: Readonly<SQLInput> = buildSelectionLimitClause(selection, variables, selectionOrderByClauseSQLInput.sql);
        const selectionOffsetClauseSQLInput: Readonly<SQLInput> = buildSelectionOffsetClause(selection, variables, selectionOrderByClauseSQLInput.sql);

        return {
            joinSQLInput: {
                sql: `
                    SELECT ${selectAndJoinClauseSQLInput.selectClauseSQLInput.sql}
                    FROM ${tableName} ${tableName}_${relationTableAliasSuffix}
                    ${selectAndJoinClauseSQLInput.joinClauseSQLInput.sql}
                    WHERE ${selectionConfig.entityTableName}_${tableAliasSuffix}.${selectionConfig.entityKey} = ${tableName}_${relationTableAliasSuffix}.${selectionConfig.relationKey}
                        ${selectionFilterJoinClausePrefix} ${selectionFilterJoinClauseSQLInput.sql}
                        ${selectionOrderByClauseSQLInput.sql}
                        ${selectionLimitClauseSQLInput.sql}
                        ${selectionOffsetClauseSQLInput.sql}
                `,
                values: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.values,
                    ...selectAndJoinClauseSQLInput.joinClauseSQLInput.values,
                    ...selectionFilterJoinClauseSQLInput.values,
                    ...selectionOrderByClauseSQLInput.values,
                    ...selectionLimitClauseSQLInput.values,
                    ...selectionOffsetClauseSQLInput.values
                },
                columnHashes: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.columnHashes
                }
            },
            tableName
        };
    }

    if (selectionConfig.type === 'MANY_TO_ONE') {
        const tableName: JOTableName = selectionConfig.relationTableName;
        const typeName: JOObjectTypeName = selectionConfig.relationTypeName;
        const newJSONAliasPrefix: string = `${jsonAliasPrefix}${selectionSetName}.`;

        const selectAndJoinClauseSQLInput = buildSelectAndJoinClause(
            variables,
            selection.selectionSet?.selections || [],
            getScalarNamesForTypeName(typeName),
            tableName,
            relationTableAliasSuffix,
            newJSONAliasPrefix
        );

        return {
            joinSQLInput: {
                sql: `
                    SELECT ${selectAndJoinClauseSQLInput.selectClauseSQLInput.sql}
                    FROM ${tableName} ${tableName}_${relationTableAliasSuffix}
                    ${selectAndJoinClauseSQLInput.joinClauseSQLInput.sql}
                    WHERE ${selectionConfig.entityTableName}_${tableAliasSuffix}.${selectionConfig.entityKey} = ${tableName}_${relationTableAliasSuffix}.${selectionConfig.relationKey}
                `,
                values: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.values,
                    ...selectAndJoinClauseSQLInput.joinClauseSQLInput.values
                },
                columnHashes: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.columnHashes
                }
            },
            tableName
        };
    }

    if (selectionConfig.type === 'ONE_TO_ONE') {
        const tableName: JOTableName = selectionConfig.relationTableName;
        const typeName: JOObjectTypeName = selectionConfig.relationTypeName;
        const newJSONAliasPrefix: string = `${jsonAliasPrefix}${selectionSetName}.`;

        const selectAndJoinClauseSQLInput = buildSelectAndJoinClause(
            variables,
            selection.selectionSet?.selections || [],
            getScalarNamesForTypeName(typeName),
            tableName,
            relationTableAliasSuffix,
            newJSONAliasPrefix
        );

        return {
            joinSQLInput: {
                sql: `
                    SELECT ${selectAndJoinClauseSQLInput.selectClauseSQLInput.sql}
                    FROM ${tableName} ${tableName}_${relationTableAliasSuffix}
                    ${selectAndJoinClauseSQLInput.joinClauseSQLInput.sql}
                    WHERE ${selectionConfig.entityTableName}_${tableAliasSuffix}.${selectionConfig.entityKey} = ${tableName}_${relationTableAliasSuffix}.id
                        AND ${selectionConfig.entityTableName}_${tableAliasSuffix}.id = ${tableName}_${relationTableAliasSuffix}.${selectionConfig.relationKey}
                `,
                values: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.values,
                    ...selectAndJoinClauseSQLInput.joinClauseSQLInput.values
                },
                columnHashes: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.columnHashes
                }
            },
            tableName
        };
    }

    if (selectionConfig.type === 'MANY_TO_MANY') {
        const tableName: JOTableName = selectionConfig.relationTableName;
        const typeName: JOObjectTypeName = selectionConfig.relationTypeName;
        const newJSONAliasPrefix: string = `${jsonAliasPrefix}+${selectionSetName}.`;
        const scalarNames: Array<string> = getScalarNamesForTypeName(typeName);

        const selectAndJoinClauseSQLInput = buildSelectAndJoinClause(
            variables,
            selection.selectionSet?.selections || [],
            scalarNames,
            tableName,
            relationTableAliasSuffix,
            newJSONAliasPrefix
        );

        const selectionFilterJoinClauseSQLInput: Readonly<SQLInput> = buildSelectionFilterJoinClause(tableName,  `_${relationTableAliasSuffix}`,selection, variables);
        const selectionFilterJoinClausePrefix: 'AND' | '' = selectionFilterJoinClauseSQLInput.sql === '' ? '' : 'AND';
        const selectionOrderByClauseSQLInput: Readonly<SQLInput> = buildSelectionOrderByClause(tableName, `_${relationTableAliasSuffix}`, scalarNames, selection, variables);
        const selectionLimitClauseSQLInput: Readonly<SQLInput> = buildSelectionLimitClause(selection, variables, selectionOrderByClauseSQLInput.sql);
        const selectionOffsetClauseSQLInput: Readonly<SQLInput> = buildSelectionOffsetClause(selection, variables, selectionOrderByClauseSQLInput.sql);

        return {
            joinSQLInput: {
                sql: `
                    SELECT ${selectAndJoinClauseSQLInput.selectClauseSQLInput.sql}
                    FROM ${tableName} ${tableName}_${relationTableAliasSuffix}
                    ${selectAndJoinClauseSQLInput.joinClauseSQLInput.sql}
                    JOIN ${selectionConfig.joinTableName} ${selectionConfig.joinTableName}_${relationTableAliasSuffix}
                        ON ${selectionConfig.joinTableName}_${relationTableAliasSuffix}.${selectionConfig.entityKey} = ${tableName}_${relationTableAliasSuffix}.id
                        AND ${selectionConfig.joinTableName}_${relationTableAliasSuffix}.${selectionConfig.relationKey} = ${selectionConfig.entityTableName}_${tableAliasSuffix}.id
                        ${selectionFilterJoinClausePrefix} ${selectionFilterJoinClauseSQLInput.sql}
                    ${selectionOrderByClauseSQLInput.sql}
                    ${selectionLimitClauseSQLInput.sql}
                    ${selectionOffsetClauseSQLInput.sql}
                `,
                values: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.values,
                    ...selectAndJoinClauseSQLInput.joinClauseSQLInput.values,
                    ...selectionFilterJoinClauseSQLInput.values,
                    ...selectionOrderByClauseSQLInput.values,
                    ...selectionLimitClauseSQLInput.values,
                    ...selectionOffsetClauseSQLInput.values
                },
                columnHashes: {
                    ...selectAndJoinClauseSQLInput.selectClauseSQLInput.columnHashes
                }
            },
            tableName
        };
    }

    throw new Error(`createSelectAndJoinClauseInfo: type ${selectionConfig.type} not supported for relation ${selectionConfig.relationTableName} on ${selectionConfig.entityTableName}`);
}

// I am using sha1 here because it hashes to a length of 40 characters
// sha256 hashes to 64 characters I believe, which would be 1 too long
// to get under the 63 character limit postgres imposes on column aliases
// sha1 should not be used for cryptographic purposes, it isn't safe
// in this case, it's only being used as a convenience to allow column aliases
// of arbitrary length
function createColumnHash(columnName: string): string {
    return crypto.createHash('sha1').update(columnName).digest('hex');
}